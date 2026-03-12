import { useEffect, useRef, useState } from "react";
import { useRoute, useSearch } from "wouter";
import { useConversation } from "@/hooks/use-conversations";
import { useChatStream, UIMessage } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { Sparkles, Image as ImageIcon, Video, Crown, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { useCreateConversation } from "@/hooks/use-conversations";
import { useLocation } from "wouter";
import { PayPalButton } from "@/components/paypal-button";

type GenMode = "chat" | "image" | "video";

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
  const [showVideoPaywall, setShowVideoPaywall] = useState(false);

  // Read mode from URL query param
  const searchParams = new URLSearchParams(search);
  const mode: GenMode = (searchParams.get("mode") as GenMode) || "chat";

  useEffect(() => {
    if (search.includes("video_success=1")) {
      toast({ title: "¡Pago exitoso!", description: "Ya tienes acceso a generación de video." });
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
    }
  }, [search]);

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

  const handleSend = async (content: string) => {
    if (mode === "chat") {
      sendMessage(content);
      return;
    }

    if (mode === "video") {
      if (!user?.isPro) {
        setShowVideoPaywall(true);
        return;
      }
      // Pro user video generation
      toast({ title: "Generando video...", description: "Esto puede tardar unos minutos." });
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
      } catch (e) {
        toast({ title: "Error", description: "No se pudo generar la imagen.", variant: "destructive" });
      } finally {
        setIsGeneratingMedia(false);
      }
    }
  };


  const modeInfo = {
    chat: null,
    image: { icon: ImageIcon, label: "Modo Imagen", color: "text-purple-500" },
    video: { icon: Video, label: "Modo Video", color: "text-blue-500" },
  }[mode];

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
        {modeInfo && (
          <div className={`flex items-center gap-1.5 text-sm font-medium ${modeInfo.color}`}>
            <modeInfo.icon className="w-4 h-4" />
            {modeInfo.label}
          </div>
        )}
      </header>

      {/* Main Chat Area */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto w-full flex flex-col">
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
              ) : mode === "video" ? (
                <Video className="w-8 h-8 text-blue-500" />
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
              {mode === "image"
                ? "¿Qué imagen quieres crear?"
                : mode === "video"
                ? "¿Qué video quieres generar?"
                : "¿En qué te puedo ayudar?"}
            </motion.h2>
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-muted-foreground text-lg"
            >
              {mode === "image"
                ? "Describe con detalle la imagen que quieres y la genero en segundos."
                : mode === "video"
                ? user?.isPro
                  ? "Describe el video y lo genero para ti."
                  : "Necesitas una suscripción Pro ($10) para generar videos."
                : "Puedo responder preguntas, escribir código, ayudarte a crear contenido y más."}
            </motion.p>
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pt-8 pb-32 flex flex-col min-h-full">
            {isLoading && conversationId ? (
              <div className="flex items-center justify-center flex-1">
                <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
            )}
            {isGeneratingMedia && (
              <div className="flex items-center gap-3 p-4 rounded-2xl bg-card border border-border">
                <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-muted-foreground">Generando {mode === "image" ? "imagen" : "video"}...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-background via-background to-transparent pt-10">
        <ChatInput
          onSend={handleSend}
          isGenerating={isGenerating || isGeneratingMedia}
          conversationId={conversationId}
          mode={mode}
        />
      </div>

      {/* Video Paywall Modal */}
      <AnimatePresence>
        {showVideoPaywall && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={() => setShowVideoPaywall(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-3xl p-8 max-w-sm w-full shadow-2xl"
              data-testid="modal-video-paywall"
            >
              <button
                onClick={() => setShowVideoPaywall(false)}
                className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
                data-testid="button-close-paywall"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex flex-col items-center text-center gap-5">
                <div className="w-16 h-16 rounded-2xl bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center">
                  <Crown className="w-8 h-8 text-yellow-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold">Generación de Video Pro</h3>
                  <p className="text-muted-foreground text-sm mt-2">
                    Genera videos con IA. Pago único, acceso de por vida.
                  </p>
                </div>

                <div className="w-full rounded-2xl bg-primary/5 border border-primary/10 p-4 space-y-2">
                  {["Videos generados con IA", "Calidad HD", "Sin marcas de agua", "Acceso instantáneo"].map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <span className="text-green-500">✓</span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>

                <div className="text-center">
                  <span className="text-3xl font-bold">$10</span>
                  <span className="text-muted-foreground text-sm ml-1">pago único</span>
                </div>

                <div className="w-full" data-testid="paypal-container">
                  <PayPalButton onSuccess={() => setShowVideoPaywall(false)} />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
