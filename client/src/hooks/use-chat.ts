import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useCreateConversation } from "./use-conversations";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { getUserName } from "./use-voice-settings";

// Local representation of a message to blend DB state with streaming state
export type UIMessage = {
  id: string | number;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
};

export type ChatModel = "fast" | "normal" | "think" | "pro";

export function useChatStream(conversationId?: number) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [optimisticUserMsg, setOptimisticUserMsg] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const createConv = useCreateConversation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const sendMessage = useCallback(async (content: string, model: ChatModel = "normal", images: string[] = []) => {
    if ((!content.trim() && images.length === 0) || isGenerating) return;

    setIsGenerating(true);
    setStreamingContent("");
    const optimisticContent = images.length
      ? `${content}${content ? "\n\n" : ""}${images.map((u) => `![](${u})`).join("\n")}`
      : content;
    setOptimisticUserMsg(optimisticContent);
    
    let targetConvId = conversationId;

    try {
      // 1. If no conversation, create one first
      if (!targetConvId) {
        const newConv = await createConv.mutateAsync();
        targetConvId = newConv.id;
        // Update URL without full reload
        setLocation(`/c/${newConv.id}`);
      }

      // 2. Start SSE Stream
      const url = buildUrl(api.messages.create.path, { id: targetConvId });
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, model, images, userName: getUserName() }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response stream");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (!dataStr || dataStr.trim() === '[DONE]') continue;
            
            try {
              const data = JSON.parse(dataStr);
              if (data.content) {
                setStreamingContent(prev => prev + data.content);
              }
              if (data.replace !== undefined) {
                // Used for image gen: replace the entire streaming content at once
                setStreamingContent(data.replace);
              }
              if (data.error) {
                throw new Error(data.error);
              }
            } catch (e) {
              if (e instanceof SyntaxError) {
                // Ignore incomplete JSON chunks that might have snuck through
                continue;
              }
              throw e;
            }
          }
        }
      }

    } catch (error) {
      console.error("Chat streaming error:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      setOptimisticUserMsg(null);
      setStreamingContent("");
      
      // 3. Invalidate to get true final state from DB
      if (targetConvId) {
        queryClient.invalidateQueries({ queryKey: [api.conversations.get.path, targetConvId] });
        queryClient.invalidateQueries({ queryKey: [api.conversations.list.path] });
      }
    }
  }, [conversationId, isGenerating, createConv, setLocation, queryClient, toast]);

  return {
    sendMessage,
    isGenerating,
    streamingContent,
    optimisticUserMsg
  };
}
