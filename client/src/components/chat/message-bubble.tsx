import { memo, useState, useCallback, useEffect } from "react";
import { UIMessage } from "@/hooks/use-chat";
import { MarkdownRenderer } from "./markdown-renderer";
import { Bot, User, Volume2, VolumeX, ExternalLink, Share2 } from "lucide-react";
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
      <div className={`flex gap-4 max-w-[95%] ${isUser ? "flex-row-reverse" : "flex-row"}`}>

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
            px-5 py-4 rounded-2xl relative overflow-hidden min-w-0
            ${isUser
              ? "bg-primary text-primary-foreground rounded-tr-sm shadow-sm"
              : "bg-card border border-border shadow-sm shadow-black/5 rounded-tl-sm"
            }
          `}
        >
          {isUser ? (
            (() => {
              const imgRegex = /!\[\]\((data:image\/[^)]+)\)/g;
              const imgs: string[] = [];
              let m;
              while ((m = imgRegex.exec(message.content)) !== null) imgs.push(m[1]);
              const text = message.content.replace(/!\[\]\(data:image\/[^)]+\)/g, "").trim();
              return (
                <>
                  {imgs.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                      {imgs.map((src, i) => (
                        <img key={i} src={src} alt="" className="max-w-[200px] max-h-[200px] rounded-xl object-cover border border-white/20" />
                      ))}
                    </div>
                  )}
                  {text && <p className="whitespace-pre-wrap leading-relaxed text-[0.95rem]">{text}</p>}
                </>
              );
            })()
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

          {/* Action buttons — only on assistant messages, not while streaming */}
          {!isUser && !message.isStreaming && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button
                onClick={speak}
                data-testid="button-speak-message"
                className={`
                  flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg transition-colors
                  ${isSpeaking
                    ? "text-primary bg-primary/10"
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

              <a
                href={`https://api.whatsapp.com/send?text=${encodeURIComponent(stripMarkdown(cleanContent))}`}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="link-share-whatsapp"
                className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg text-muted-foreground hover:text-green-600 hover:bg-green-500/10 transition-colors"
                title="Compartir por WhatsApp"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});
