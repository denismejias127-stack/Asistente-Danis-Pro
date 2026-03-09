import { useEffect, useRef } from "react";
import { useRoute } from "wouter";
import { useConversation } from "@/hooks/use-conversations";
import { useChatStream, UIMessage } from "@/hooks/use-chat";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";

export default function ChatPage() {
  const [, params] = useRoute("/c/:id");
  const conversationId = params?.id ? parseInt(params.id) : undefined;
  
  const { data: conversationData, isLoading } = useConversation(conversationId);
  const { sendMessage, isGenerating, streamingContent, optimisticUserMsg } = useChatStream(conversationId);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth"
      });
    }
  }, [conversationData?.messages, streamingContent, optimisticUserMsg]);

  // Construct the full view of messages:
  // 1. History from DB
  // 2. Optimistic user message (while generating)
  // 3. Streaming assistant message
  const messages: UIMessage[] = [
    ...(conversationData?.messages || []).map(m => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content
    }))
  ];

  if (optimisticUserMsg) {
    messages.push({
      id: 'optimistic-user',
      role: 'user',
      content: optimisticUserMsg
    });
  }

  if (isGenerating || streamingContent) {
    messages.push({
      id: 'streaming-assistant',
      role: 'assistant',
      content: streamingContent || "...",
      isStreaming: isGenerating
    });
  }

  const isInitialEmpty = !conversationId && messages.length === 0;

  return (
    <div className="flex flex-col flex-1 h-screen bg-background relative overflow-hidden">
      {/* Header */}
      <header className="flex-none flex items-center justify-between px-4 h-14 border-b border-border/50 bg-background/80 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
          <h1 className="font-semibold text-sm">
            {conversationData?.title || "Nueva conversación"}
          </h1>
        </div>
      </header>

      {/* Main Chat Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto w-full flex flex-col"
      >
        {isInitialEmpty ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-2xl mx-auto text-center">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 shadow-inner"
            >
              <Sparkles className="w-8 h-8 text-primary" />
            </motion.div>
            <motion.h2 
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="text-2xl md:text-3xl font-bold tracking-tight mb-3"
            >
              How can I help you today?
            </motion.h2>
            <motion.p 
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-muted-foreground text-lg"
            >
              I can answer questions, write code, or help you brainstorm.
            </motion.p>
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pt-8 pb-32 flex flex-col min-h-full">
            {isLoading && conversationId ? (
              <div className="flex items-center justify-center flex-1">
                <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></span>
              </div>
            ) : (
              messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))
            )}
          </div>
        )}
      </div>

      {/* Input Area Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-10">
        <ChatInput onSend={sendMessage} isGenerating={isGenerating} conversationId={conversationId} />
      </div>
    </div>
  );
}
