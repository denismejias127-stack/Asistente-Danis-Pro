import { memo, useState, useCallback, useEffect } from "react";
import { UIMessage } from "@/hooks/use-chat";
import { MarkdownRenderer } from "./markdown-renderer";
import { Bot, User, Volume2, VolumeX, ExternalLink } from "lucide-react";
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

function parseOpenUrl(content: string): { cleanContent: string; url: string | null } {
  const match = content.match(/\[OPEN_URL:(https?:\/\/[^\]]+)\]/);
  if (!match) return { cleanContent: content, url: null };
  const url = match[1].trim();
  const cleanContent = content.replace(match[0], "").trim();
  return { cleanContent, url };
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [opened, setOpened] = useState(false);

  const { cleanContent, url } = parseOpenUrl(message.content);

  // Auto-open URL once when the message is complete (not streaming)
  useEffect(() => {
    if (!isUser && url && !message.isStreaming && !opened) {
      setOpened(true);
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [isUser, url, message.isStreaming, opened]);

  const speak = useCallback(() => {
    if (!window.speechSynthesis) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    const text = stripMarkdown(cleanContent);
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
  }, [cleanContent, isSpeaking]);

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
          ) : (
            <MarkdownRenderer content={cleanContent} />
          )}

          {/* Open URL indicator */}
          {!isUser && url && !message.isStreaming && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors w-fit"
              data-testid="link-open-url"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {opened ? "Abrir de nuevo" : "Abrir aplicación"}
            </a>
          )}

          {/* Streaming Indicator */}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-primary/50 animate-pulse align-middle" />
          )}

          {/* Speaker button — on all messages (user and assistant), not while streaming */}
          {!message.isStreaming && (
            <button
              onClick={speak}
              data-testid="button-speak-message"
              className={`
                mt-2 flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors
                ${isSpeaking
                  ? isUser
                    ? "text-primary-foreground/80 bg-white/20"
                    : "text-primary bg-primary/10"
                  : isUser
                    ? "text-primary-foreground/60 hover:text-primary-foreground/90 hover:bg-white/15"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                }
              `}
              title={isSpeaking ? "Detener" : "Escuchar"}
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
