import { memo, useState, useCallback } from "react";
import { UIMessage } from "@/hooks/use-chat";
import { MarkdownRenderer } from "./markdown-renderer";
import { Bot, User, Volume2, VolumeX } from "lucide-react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface MessageBubbleProps {
  message: UIMessage;
}

function stripMarkdown(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, "imagen generada")
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/>\s.+/g, "")
    .replace(/[-*+]\s/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

function VideoMessage({ url }: { url: string }) {
  return (
    <div className="mt-1">
      <video
        src={url}
        controls
        className="rounded-xl max-w-full w-full max-h-80 bg-black"
        data-testid="video-generated"
      />
      <p className="text-xs text-muted-foreground mt-1 text-center">Video generado por IA</p>
    </div>
  );
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isVideoMessage = !isUser && message.content.startsWith("[VIDEO]:");
  const videoUrl = isVideoMessage ? message.content.replace("[VIDEO]:", "").trim() : null;

  const speak = useCallback(() => {
    if (!window.speechSynthesis) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const text = stripMarkdown(message.content);
    const utterance = new SpeechSynthesisUtterance(text);

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(
      (v) => v.lang.startsWith("es") || v.name.toLowerCase().includes("spanish")
    );
    if (spanishVoice) utterance.voice = spanishVoice;

    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, [message.content, isSpeaking]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex w-full ${isUser ? "justify-end" : "justify-start"} mb-6`}
    >
      <div className={`flex gap-4 max-w-[85%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>

        {/* Avatar */}
        <div className="flex-shrink-0 pt-1">
          {isUser ? (
            <Avatar className="w-8 h-8 bg-primary/10 border border-primary/20">
              <AvatarFallback className="bg-transparent text-primary">
                <User className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
          ) : (
            <Avatar className="w-8 h-8 bg-accent border border-border shadow-sm">
              <AvatarFallback className="bg-transparent text-accent-foreground">
                <Bot className="w-4 h-4" />
              </AvatarFallback>
            </Avatar>
          )}
        </div>

        {/* Bubble */}
        <div
          className={`
            px-5 py-4 rounded-2xl relative
            ${isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm shadow-sm"
              : "bg-card border border-border shadow-sm shadow-black/5 rounded-tl-sm"
            }
          `}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap leading-relaxed text-[0.95rem]">{message.content}</p>
          ) : isVideoMessage && videoUrl ? (
            <VideoMessage url={videoUrl} />
          ) : (
            <MarkdownRenderer content={message.content} />
          )}

          {/* Streaming Indicator */}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-primary/50 animate-pulse align-middle" />
          )}

          {/* Speaker button — only on assistant messages, not while streaming, not on videos */}
          {!isUser && !message.isStreaming && !isVideoMessage && (
            <button
              onClick={speak}
              data-testid="button-speak-message"
              className={`
                mt-2 flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors
                ${isSpeaking
                  ? "text-primary bg-primary/10"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }
              `}
              title={isSpeaking ? "Detener" : "Escuchar respuesta"}
            >
              {isSpeaking ? (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  <span>Detener</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Escuchar</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </motion.div>
  );
});
