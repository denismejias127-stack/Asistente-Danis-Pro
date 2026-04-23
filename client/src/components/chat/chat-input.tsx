import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square, Mic, Image as ImageIcon, MessageSquare, Zap, Brain, Star, ChevronUp } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceRecorder } from "../../../replit_integrations/audio";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ChatModel } from "@/hooks/use-chat";

type GenMode = "chat" | "image";

interface ChatInputProps {
  onSend: (message: string) => void;
  isGenerating: boolean;
  conversationId?: number;
  mode?: GenMode;
  chatModel?: ChatModel;
  onModelChange?: (model: ChatModel) => void;
}

const MODEL_OPTIONS: {
  key: ChatModel;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
  bg: string;
}[] = [
  { key: "fast",   label: "Rápido",  icon: Zap,          description: "Respuestas instantáneas",  color: "text-yellow-500", bg: "hover:bg-yellow-50 dark:hover:bg-yellow-900/20" },
  { key: "normal", label: "Normal",  icon: MessageSquare, description: "Equilibrado",              color: "text-primary",    bg: "hover:bg-primary/5" },
  { key: "think",  label: "Pensar",  icon: Brain,         description: "Razonamiento profundo",    color: "text-blue-500",   bg: "hover:bg-blue-50 dark:hover:bg-blue-900/20" },
  { key: "pro",    label: "Pro",     icon: Star,          description: "Máxima calidad",           color: "text-purple-500", bg: "hover:bg-purple-50 dark:hover:bg-purple-900/20" },
];

export function ChatInput({
  onSend,
  isGenerating,
  conversationId,
  mode = "chat",
  chatModel = "normal",
  onModelChange,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const recorder = useVoiceRecorder();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [isTranscribing, setIsTranscribing] = useState(false);

  // Close menu when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setModelOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleVoiceToggle = async () => {
    if (recorder.state === "recording") {
      setIsTranscribing(true);
      try {
        const blob = await recorder.stopRecording();
        const base64 = await new Promise<string>((resolve) => {
          const r = new FileReader();
          r.onload = () => resolve((r.result as string).split(",")[1]);
          r.readAsDataURL(blob);
        });
        const res = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ audio: base64 }),
        });
        if (!res.ok) throw new Error("transcribe failed");
        const { text } = await res.json();
        if (text) {
          setInput((prev) => (prev ? prev + " " + text : text));
          textareaRef.current?.focus();
        }
      } catch {
        toast({ title: "Error", description: "No se pudo transcribir el audio.", variant: "destructive" });
      } finally {
        setIsTranscribing(false);
      }
    } else {
      try {
        await recorder.startRecording();
      } catch {
        toast({ title: "Sin micrófono", description: "Permite el acceso al micrófono en tu navegador.", variant: "destructive" });
      }
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

  const activeModel = MODEL_OPTIONS.find((m) => m.key === chatModel) || MODEL_OPTIONS[1];
  const ActiveIcon = activeModel.icon;

  const placeholder =
    mode === "image"
      ? "Describe la imagen que quieres generar..."
      : recorder.state === "recording"
      ? "Escuchando..."
      : chatModel === "fast"
      ? "Respuesta rápida..."
      : chatModel === "think"
      ? "Hazme una pregunta difícil..."
      : chatModel === "pro"
      ? "Pregunta lo que quieras..."
      : "Escribe un mensaje...";

  const sendBtnColor =
    mode === "image"   ? "bg-purple-600 hover:bg-purple-700" :
    chatModel === "fast"  ? "bg-yellow-500 hover:bg-yellow-600" :
    chatModel === "think" ? "bg-blue-600 hover:bg-blue-700"   :
    chatModel === "pro"   ? "bg-purple-600 hover:bg-purple-700" : "";

  return (
    <div className="relative p-4 md:p-6 pb-6 md:pb-8 w-full max-w-4xl mx-auto">

      {/* Top row: Gen mode + Model symbol button */}
      <div className="flex items-center justify-between mb-2 px-1">
        {/* Gen mode (Chat / Imagen) */}
        <div className="flex items-center gap-1">
          {[
            { key: "chat" as GenMode, icon: MessageSquare, label: "Chat" },
            { key: "image" as GenMode, icon: ImageIcon, label: "Imagen" },
          ].map(({ key, icon: Icon, label }) => (
            <button
              key={key}
              onClick={() => setLocation(key === "chat" ? "/" : `/?mode=${key}`)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                mode === key
                  ? key === "image"
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
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

        {/* Single model button — only in chat mode */}
        {mode === "chat" && (
          <div ref={menuRef} className="relative">
            <button
              onClick={() => setModelOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${activeModel.color} border-current/20 bg-transparent hover:bg-muted/60`}
              data-testid="button-model-toggle"
            >
              <ActiveIcon className="w-3.5 h-3.5" />
              {activeModel.label}
              <ChevronUp className={`w-3 h-3 transition-transform ${modelOpen ? "rotate-180" : ""}`} />
            </button>

            {/* Dropdown menu */}
            {modelOpen && (
              <div className="absolute bottom-full right-0 mb-2 w-52 rounded-2xl border border-border bg-popover shadow-xl shadow-black/10 overflow-hidden z-50">
                <div className="p-1.5 space-y-0.5">
                  {MODEL_OPTIONS.map(({ key, label, icon: Icon, description, color, bg }) => (
                    <button
                      key={key}
                      onClick={() => { onModelChange?.(key); setModelOpen(false); }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${bg} ${
                        chatModel === key ? "ring-1 ring-inset ring-current/20 " + color : "text-foreground"
                      }`}
                      data-testid={`button-model-${key}`}
                    >
                      <Icon className={`w-4 h-4 flex-shrink-0 ${chatModel === key ? color : "text-muted-foreground"}`} />
                      <div>
                        <div className={`text-sm font-semibold ${chatModel === key ? color : ""}`}>{label}</div>
                        <div className="text-[11px] text-muted-foreground">{description}</div>
                      </div>
                      {chatModel === key && (
                        <div className={`ml-auto w-2 h-2 rounded-full bg-current ${color}`} />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input box */}
      <div
        className={`relative flex items-end w-full glass-panel rounded-[1.5rem] shadow-lg shadow-black/5 p-2 transition-all focus-within:ring-2 ${
          chatModel === "fast"  ? "focus-within:ring-yellow-500/20 focus-within:border-yellow-500/20" :
          chatModel === "think" ? "focus-within:ring-blue-500/20 focus-within:border-blue-500/20"    :
          chatModel === "pro"   ? "focus-within:ring-purple-500/20 focus-within:border-purple-500/20" :
          mode === "image"      ? "focus-within:ring-purple-500/20 focus-within:border-purple-500/20" :
                                  "focus-within:ring-primary/20 focus-within:border-primary/30"
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
              disabled={isGenerating || isTranscribing}
              title={recorder.state === "recording" ? "Detener dictado" : "Dictar mensaje por voz"}
              data-testid="button-voice"
            >
              {isTranscribing ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : recorder.state === "recording" ? (
                <Square className="w-5 h-5 fill-current" />
              ) : (
                <Mic className="w-5 h-5" />
              )}
            </Button>
          )}

          <Button
            type="button"
            size="icon"
            className={`rounded-full w-10 h-10 transition-all duration-300 ${sendBtnColor} ${
              input.trim() || isGenerating ? "opacity-100 scale-100" : "opacity-50 scale-95"
            }`}
            disabled={(!input.trim() && !isGenerating) || recorder.state === "recording"}
            onClick={(e) => { e.preventDefault(); handleSend(); }}
            data-testid="button-send"
          >
            {isGenerating ? <Square className="w-4 h-4 fill-current" /> : <ArrowUp className="w-5 h-5 stroke-[3]" />}
          </Button>
        </div>
      </div>

      <div className="text-center mt-2 text-xs text-muted-foreground/60 px-4">
        La IA puede cometer errores. Verifica la información importante.
      </div>
    </div>
  );
}
