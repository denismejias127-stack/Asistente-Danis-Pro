import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square, Mic, MicOff } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceRecorder, useVoiceStream } from "../../../replit_integrations/audio";
import { useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";

interface ChatInputProps {
  onSend: (message: string) => void;
  isGenerating: boolean;
  conversationId?: number;
}

export function ChatInput({ onSend, isGenerating, conversationId }: ChatInputProps) {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const recorder = useVoiceRecorder();
  const queryClient = useQueryClient();

  // Handle voice stream
  const voiceStream = useVoiceStream({
    onUserTranscript: (text) => {
      // Could show optimistic user message here
    },
    onComplete: () => {
      if (conversationId) {
        queryClient.invalidateQueries({ queryKey: [api.conversations.get.path, conversationId] });
        queryClient.invalidateQueries({ queryKey: [api.conversations.list.path] });
      }
    }
  });

  const handleVoiceToggle = async () => {
    if (!conversationId) {
      // En una implementación real, aquí crearíamos la conversación primero,
      // pero para mantenerlo simple, desactivamos el botón si no hay conversación
      return; 
    }

    if (recorder.state === "recording") {
      const blob = await recorder.stopRecording();
      await voiceStream.streamVoiceResponse(`/api/conversations/${conversationId}/voice-messages`, blob);
    } else {
      await recorder.startRecording();
    }
  };

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "inherit";
      const scrollHeight = textareaRef.current.scrollHeight;
      textareaRef.current.style.height = `${Math.min(scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !isGenerating && recorder.state !== "recording") {
      onSend(input);
      setInput("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "inherit";
      }
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative p-4 md:p-6 pb-6 md:pb-8 w-full max-w-4xl mx-auto">
      <div className="relative flex items-end w-full glass-panel rounded-[1.5rem] shadow-lg shadow-black/5 p-2 transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary/30">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={recorder.state === "recording" ? "Escuchando..." : "Escribe un mensaje..."}
          className="min-h-[44px] max-h-[200px] w-full resize-none border-0 bg-transparent py-3 px-4 shadow-none focus-visible:ring-0 text-[1rem]"
          disabled={isGenerating || recorder.state === "recording"}
          rows={1}
        />
        
        <div className="flex-shrink-0 flex items-center ml-2 mb-1 mr-1 gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className={`rounded-full w-10 h-10 transition-all duration-300 ${
              recorder.state === "recording" ? "text-destructive bg-destructive/10 hover:bg-destructive/20" : "text-muted-foreground"
            }`}
            onClick={(e) => {
              e.preventDefault();
              handleVoiceToggle();
            }}
            disabled={isGenerating || (!conversationId && input.length === 0)}
            title={recorder.state === "recording" ? "Detener grabación" : "Grabar mensaje de voz"}
          >
            {recorder.state === "recording" ? (
              <Square className="w-5 h-5 fill-current" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </Button>

          <Button
            type="button"
            size="icon"
            className={`rounded-full w-10 h-10 transition-all duration-300 ${
              input.trim() || isGenerating ? "opacity-100 scale-100" : "opacity-50 scale-95"
            }`}
            disabled={(!input.trim() && !isGenerating) || recorder.state === "recording"}
            onClick={(e) => {
              e.preventDefault();
              handleSend();
            }}
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
        AI puede cometer errores. Considera verificar la información importante.
      </div>
    </div>
  );
}
