import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square, Mic, Image as ImageIcon, MessageSquare, Video } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceRecorder, useVoiceStream } from "../../../replit_integrations/audio";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useLocation } from "wouter";

type GenMode = "chat" | "image" | "video";

interface ChatInputProps {
  onSend: (message: string) => void;
  isGenerating: boolean;
  conversationId?: number;
  mode?: GenMode;
}

export function ChatInput({ onSend, isGenerating, conversationId, mode = "chat" }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useVoiceRecorder();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const voiceStream = useVoiceStream({
    onUserTranscript: () => {},
    onComplete: () => {
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: [api.conversations.get.path, conversationId] });
        queryClient.invalidateQueries({ queryKey: [api.conversations.list.path] });
      }
    },
  });

  const handleVoiceToggle = async () => {
    if (!conversationId) return;
    if (recorder.state === "recording") {
      const blob = await recorder.stopRecording();
      await voiceStream.streamVoiceResponse(`/api/conversations/${conversationId}/voice-messages`, blob);
    } else {
      await recorder.startRecording();
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !isGenerating && recorder.state !== "recording") {
      onSend(input);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "inherit";
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const placeholder =
    mode === "image"
      ? "Describe la imagen que quieres generar..."
      : mode === "video"
      ? "Describe el video que quieres generar..."
      : recorder.state === "recording"
      ? "Escuchando..."
      : "Escribe un mensaje...";

  const modeColor =
    mode === "image"
      ? "ring-purple-500/20 border-purple-500/20"
      : mode === "video"
      ? "ring-blue-500/20 border-blue-500/20"
      : "";

  return (
    <div className="relative p-4 md:p-6 pb-6 md:pb-8 w-full max-w-4xl mx-auto">
      {/* Mode switcher */}
      <div className="flex items-center gap-1 mb-2 ml-1">
        {[
          { key: "chat" as GenMode, icon: MessageSquare, label: "Chat" },
          { key: "image" as GenMode, icon: ImageIcon, label: "Imagen" },
          { key: "video" as GenMode, icon: Video, label: "Video" },
        ].map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setLocation(key === "chat" ? "/" : `/?mode=${key}`)}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              mode === key
                ? key === "image"
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  : key === "video"
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-primary/10 text-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
            data-testid={`button-mode-${key}`}
          >
            <Icon className="w-3 h-3" />
            {label}
          </button>
        ))}
      </div>

      <div
        className={`relative flex items-end w-full glass-panel rounded-[1.5rem] shadow-lg shadow-black/5 p-2 transition-all focus-within:ring-2 ${
          modeColor || "focus-within:ring-primary/20 focus-within:border-primary/30"
        }`}
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[44px] max-h-[200px] w-full resize-none border-0 bg-transparent py-3 px-4 shadow-none focus-visible:ring-0 text-[1rem]"
          disabled={isGenerating || recorder.state === "recording"}
          rows={1}
          data-testid="input-message"
        />

        <div className="flex-shrink-0 flex items-center ml-2 mb-1 mr-1 gap-1">
          {mode === "chat" && (
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className={`rounded-full w-10 h-10 transition-all duration-300 ${
                recorder.state === "recording"
                  ? "text-destructive bg-destructive/10 hover:bg-destructive/20"
                  : "text-muted-foreground"
              }`}
              onClick={(e) => { e.preventDefault(); handleVoiceToggle(); }}
              disabled={isGenerating || (!conversationId && input.length === 0)}
              title={recorder.state === "recording" ? "Detener grabación" : "Grabar mensaje de voz"}
              data-testid="button-voice"
            >
              {recorder.state === "recording" ? (
                <Square className="w-5 h-5 fill-current" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            className={`rounded-full w-10 h-10 transition-all duration-300 ${
              mode === "image"
                ? "bg-purple-600 hover:bg-purple-700"
                : mode === "video"
                ? "bg-blue-600 hover:bg-blue-700"
                : ""
            } ${input.trim() || isGenerating ? "opacity-100 scale-100" : "opacity-50 scale-95"}`}
            disabled={(!input.trim() && !isGenerating) || recorder.state === "recording"}
            onClick={(e) => { e.preventDefault(); handleSend(); }}
            data-testid="button-send"
          >
            {isGenerating ? (
              <Square className="w-4 h-4 fill-current" />
            ) : (
              <ArrowUp className="w-5 h-5 stroke-[3]" />
            )}
          </Button>
        </div>
      </div>

      <div className="text-center mt-3 text-xs text-muted-foreground/70 px-4">
        La IA puede cometer errores. Verifica la información importante.
      </div>
    </div>
  );
}
