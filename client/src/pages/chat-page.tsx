import { useEffect, useRef, useState, useCallback } from "react";
import { useRoute } from "wouter";
import { useConversation } from "@/hooks/use-conversations";
import { useChatStream, UIMessage, ChatModel } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { MessageBubble } from "@/components/chat/message-bubble";
import { ChatInput } from "@/components/chat/chat-input";
import { PermissionBanner } from "@/components/permission-banner";
import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { getVoiceSettings, VOICE_PROFILES } from "@/hooks/use-voice-settings";

function autoSpeak(text: string) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();

  const voiceSettings = getVoiceSettings();
  if (!voiceSettings.enabled) return;

  const profileConfig = VOICE_PROFILES[voiceSettings.profile];

  // Strip markdown
  const clean = text
    .replace(/!\[.*?\]\(.*?\)/g, "imagen")
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "código")
    .replace(/>\s.+/g, "")
    .replace(/[-*+]\s/g, "")
    .replace(/\n+/g, " ")
    .trim();

  if (!clean) return;

  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = profileConfig.rate;
  utterance.pitch = profileConfig.pitch;
  utterance.volume = 1.0;

  const setVoiceAndSpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const langVoices = voices.filter(v => v.lang.startsWith(profileConfig.preferLang));
    const pool = langVoices.length > 0 ? langVoices : voices;

    const femaleHints = ["female","mujer","woman","femenina","maria","elena","isabel","lucia","paulina","sabina","ines","camila","valentina","sofia"];
    const maleHints   = ["male","hombre","man","masculino","jorge","carlos","diego","antonio","pablo","juan","miguel","alejandro"];
    const youngHints  = ["kid","child","young","teen","junior"];

    let chosen: SpeechSynthesisVoice | undefined;

    if (voiceSettings.profile === "joven") {
      chosen = pool.find(v => youngHints.some(h => v.name.toLowerCase().includes(h)));
      if (!chosen) chosen = pool.find(v => femaleHints.some(h => v.name.toLowerCase().includes(h)));
    } else if (profileConfig.preferFemale) {
      chosen = pool.find(v => femaleHints.some(h => v.name.toLowerCase().includes(h)));
    } else {
      chosen = pool.find(v => maleHints.some(h => v.name.toLowerCase().includes(h)));
    }

    if (!chosen) chosen = pool[0];
    if (chosen) utterance.voice = chosen;
    utterance.lang = chosen?.lang || "es-ES";
    window.speechSynthesis.speak(utterance);
  };

  const voices = window.speechSynthesis.getVoices();
  if (voices.length > 0) {
    setVoiceAndSpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = () => {
      window.speechSynthesis.onvoiceschanged = null;
      setVoiceAndSpeak();
    };
  }
}

export default function ChatPage() {
  const [, params] = useRoute("/c/:id");
  const conversationId = params?.id ? parseInt(params.id) : undefined;

  const { data: conversationData, isLoading } = useConversation(conversationId);
  const { sendMessage, isGenerating, streamingContent, optimisticUserMsg } = useChatStream(conversationId);
  const { user } = useAuth();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [chatModel, setChatModel] = useState<ChatModel>("normal");
  const voiceSentRef = useRef(false);
  const prevIsGeneratingRef = useRef(false);
  const lastStreamingRef = useRef("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, [conversationData?.messages, streamingContent, optimisticUserMsg]);

  // Capture streaming content before it clears
  useEffect(() => {
    if (streamingContent) {
      lastStreamingRef.current = streamingContent;
    }
  }, [streamingContent]);

  // Auto-speak when AI finishes responding to a voice message
  useEffect(() => {
    const justFinished = prevIsGeneratingRef.current && !isGenerating;
    prevIsGeneratingRef.current = isGenerating;

    if (justFinished && voiceSentRef.current) {
      voiceSentRef.current = false;
      const textToRead = lastStreamingRef.current;
      lastStreamingRef.current = "";
      if (textToRead) {
        autoSpeak(textToRead);
      }
    }
  }, [isGenerating]);

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

  const handleSend = (content: string, images: string[] = [], viaVoice = false) => {
    if (viaVoice) voiceSentRef.current = true;
    sendMessage(content, chatModel, images);
  };

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
      </header>

      <PermissionBanner />

      {/* Main Chat Area */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full flex flex-col">
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
              ¿En qué te puedo ayudar?
            </motion.h2>
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="text-muted-foreground text-lg"
            >
              Puedo responder preguntas, escribir código, generar imágenes y más.
            </motion.p>
          </div>
        ) : (
          <div className="w-full max-w-4xl mx-auto p-4 md:p-6 pt-8 pb-6 flex flex-col min-h-full">
            {isLoading && conversationId ? (
              <div className="flex items-center justify-center flex-1">
                <span className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              messages.map((msg, i) => {
                const prevMsg = i > 0 ? messages[i - 1] : null;
                const isGeneratedImg = msg.role === "assistant" && /!\[\]\(data:image\//.test(msg.content);
                const onRegenerate = isGeneratedImg && prevMsg?.role === "user"
                  ? () => handleSend(prevMsg.content)
                  : undefined;
                return <MessageBubble key={msg.id} message={msg} onRegenerate={onRegenerate} />;
              })
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div className="flex-none border-t border-border/50 bg-background">
        <ChatInput
          onSend={handleSend}
          isGenerating={isGenerating}
          conversationId={conversationId}
          chatModel={chatModel}
          onModelChange={setChatModel}
        />
      </div>
    </div>
  );
}
