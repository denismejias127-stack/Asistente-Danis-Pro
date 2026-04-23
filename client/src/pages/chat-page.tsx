import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute, useSearch } from "wouter";
import { useConversation } from "@/hooks/use-conversations";
import { useChatStream, UIMessage, ChatModel } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { Sparkles, Image as ImageIcon } from "lucide-react";
import { motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useCreateConversation } from "@/hooks/use-conversations";
import { useLocation } from "wouter";

type GenMode = "chat" | "image";

export default function ChatPage() {
  const [, params] = useRoute("/c/:id");
  const search = useSearch();
  const conversationId = params?.id ? parseInt(params.id) : undefined;

  const { data: conversationData, isLoading } = useConversation(conversationId);
  const { sendMessage, isGenerating, streamingContent, optimisticUserMsg } = useChatStream(conversationId);
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const createConv = useCreateConversation();
  const [, setLocation] = useLocation();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [chatModel, setChatModel] = useState<ChatModel>("normal");

  const searchParams = new URLSearchParams(search);
  const mode: GenMode = (searchParams.get("mode") as GenMode) || "chat";

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [conversationData?.messages, streamingContent, optimisticUserMsg]);

  const messages: UIMessage[] = [
    ...(conversationData?.messages || []).map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
  ];

  if (optimisticUserMsg) {
    messages.push({ id: "optimistic-user", role: "user", content: optimisticUserMsg });
  }
  if (isGenerating || streamingContent) {
    messages.push({ id: "streaming-assistant", role: "assistant", content: streamingContent || "...", isStreaming: isGenerating });
  }

  const isInitialEmpty = !conversationId && messages.length === 0;

  const handleSend = async (content: string, images: string[] = []) => {
    if (mode === "chat") {
      sendMessage(content, chatModel, images);
      return;
    }

    if (mode === "image") {
      setIsGeneratingMedia(true);
      try {
        let targetConvId = conversationId;
        if (!targetConvId) {
          const newConv = await createConv.mutateAsync();
          targetConvId = newConv.id;
          setLocation(`/c/${newConv.id}`);
        }

        const res = await fetch("/api/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ prompt: content, conversationId: targetConvId }),
        });

        if (!res.ok) throw new Error("Error generando imagen");

        queryClient.invalidateQueries({ queryKey: [api.conversations.get.path, targetConvId] });
        queryClient.invalidateQueries({ queryKey: [api.conversations.list.path] });
      } catch {
        toast({ title: "Error", description: "No se pudo generar la imagen.", variant: "destructive" });
      } finally {
        setIsGeneratingMedia(false);
      }
    }
  };

  const modeInfo = mode === "image"
    ? { icon: ImageIcon, label: "Modo Imagen", color: "text-purple-500" }
    : null;

  return (
    <div className="flex flex-col flex-1 h-[100dvh] bg-background overflow-hidden min-h-0">
      {/* Header */}
      <header className="flex-none flex items-center justify-between px-4 h-14 border-b border-border/50 bg-background/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
          <h1 className="font-semibold text-sm">
            {conversationData?.title || "Nueva conversación"}
          </h1>
        </div>
        {modeInfo && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${modeInfo.color}`}>
            <modeInfo.icon className="w-4 h-4" />
            {modeInfo.label}
          </div>
        )}
      </header>

      {/* Main Chat Area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto w-full flex flex-col">
        {isInitialEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-2xl mx-auto text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 shadow-inner"
            >
              {mode === "image" ? (
                <ImageIcon className="w-8 h-8 text-purple-500" />
              ) : (
                <Sparkles className="w-8 h-8 text-primary" />
              )}
            </motion.div>
            <motion.h2
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="text-2xl md:text-3xl font-bold tracking-tight mb-3"
            >
              {mode === "image" ? "¿Qué imagen quieres crear?" : "¿En qué te puedo ayudar?"}
            </motion.h2>
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-muted-foreground text-lg"
            >
              {mode === "image"
                ? "Describe con detalle la imagen que quieres y la genero en segundos."
                : "Puedo responder preguntas, escribir código, ayudarte a crear contenido y más."}
            </motion.p>
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pt-8 pb-6 flex flex-col min-h-full">
            {isLoading && conversationId ? (
              <div className="flex items-center justify-center flex-1">
                <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
            )}
            {isGeneratingMedia && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
                <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span className="text-sm text-muted-foreground">Generando imagen...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-none border-t border-border/50 bg-background">
        <ChatInput
          onSend={handleSend}
          isGenerating={isGenerating || isGeneratingMedia}
          conversationId={conversationId}
          mode={mode}
          chatModel={chatModel}
          onModelChange={setChatModel}
        />
      </div>
    </div>
  );
}
