import { memo } from "react";
import { UIMessage } from "@/hooks/use-chat";
import { MarkdownRenderer } from "./markdown-renderer";
import { Bot, User } from "lucide-react";
import { motion } from "framer-motion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

interface MessageBubbleProps {
  message: UIMessage;
}

export const MessageBubble = memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

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
            <MarkdownRenderer content={message.content} />
          )}

          {/* Streaming Indicator */}
          {message.isStreaming && (
            <span className="inline-block w-2 h-4 ml-1 bg-primary/50 animate-pulse align-middle" />
          )}
        </div>
      </div>
    </motion.div>
  );
});
