import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square, Mic, Zap, Brain, Star, MessageSquare, ChevronUp, Video, ImagePlus, Paperclip, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useVoiceRecorder } from "../../../replit_integrations/audio";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ChatModel } from "@/hooks/use-chat";


async function resizeImage(file: File, maxSize: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width > height) { height = Math.round((height * maxSize) / width); width = maxSize; }
          else { width = Math.round((width * maxSize) / height); height = maxSize; }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("ctx"));
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractVideoFrame(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.currentTime = 0.5;
    video.onloadeddata = () => {
      video.onseeked = () => {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(video.videoWidth, 1024);
        canvas.height = Math.round(video.videoHeight * (canvas.width / video.videoWidth));
        const ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); return reject(new Error("ctx")); }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      video.currentTime = 0.5;
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("video")); };
  });
}

async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

interface ChatInputProps {
  onSend: (message: string, images?: string[]) => void;
  isGenerating: boolean;
  conversationId?: number;
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
  const [images, setImages] = useState<string[]>([]);
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string }[]>([]);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGalleryPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    for (const file of files) {
      try {
        const dataUrl = await resizeImage(file, 1024);
        setImages((prev) => [...prev, dataUrl]);
      } catch {
        toast({ title: "Error", description: `No se pudo cargar "${file.name}".`, variant: "destructive" });
      }
    }
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (e.target) e.target.value = "";
    for (const file of files) {
      try {
        if (
          file.type.startsWith("text/") ||
          file.name.endsWith(".txt") ||
          file.name.endsWith(".md") ||
          file.name.endsWith(".csv") ||
          file.name.endsWith(".json") ||
          file.name.endsWith(".xml") ||
          file.name.endsWith(".html") ||
          file.name.endsWith(".js") ||
          file.name.endsWith(".ts") ||
          file.name.endsWith(".py")
        ) {
          const content = await readTextFile(file);
          const truncated = content.length > 8000 ? content.slice(0, 8000) + "\n...(archivo cortado)" : content;
          setAttachedFiles((prev) => [...prev, { name: file.name, content: truncated }]);
        } else {
          toast({ title: "Tipo no soportado", description: `Usa archivos .txt, .csv, .json, .py, etc.`, variant: "destructive" });
        }
      } catch {
        toast({ title: "Error", description: `No se pudo cargar "${file.name}".`, variant: "destructive" });
      }
    }
  };

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
    const hasContent = input.trim() || images.length > 0 || attachedFiles.length > 0;
    if (hasContent && !isGenerating && recorder.state !== "recording") {
      let finalMessage = input;
      if (attachedFiles.length > 0) {
        const filesText = attachedFiles.map(f => `\n\n📄 **${f.name}:**\n\`\`\`\n${f.content}\n\`\`\``).join("");
        finalMessage = input ? input + filesText : `Aquí te adjunto ${attachedFiles.length > 1 ? "estos archivos" : "este archivo"}:${filesText}`;
      }
      onSend(finalMessage, images);
      setInput("");
      setImages([]);
      setAttachedFiles([]);
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
    recorder.state === "recording"
      ? "Escuchando..."
      : chatModel === "fast"
      ? "Respuesta rápida..."
      : chatModel === "think"
      ? "Hazme una pregunta difícil..."
      : chatModel === "pro"
      ? "Pregunta lo que quieras..."
      : "Escribe un mensaje...";

  const sendBtnColor =
    chatModel === "fast"  ? "bg-yellow-500 hover:bg-yellow-600" :
    chatModel === "think" ? "bg-blue-600 hover:bg-blue-700"   :
    chatModel === "pro"   ? "bg-purple-600 hover:bg-purple-700" : "";

  return (
    <div className="relative p-3 pb-5 w-[92%] mx-auto">

      {/* Image + file previews */}
      {(images.length > 0 || attachedFiles.length > 0) && (
        <div className="flex gap-2 mb-2 px-1 flex-wrap" data-testid="container-previews">
          {images.map((src, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
              <img src={src} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, idx) => idx !== i))}
                className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full p-0.5"
                data-testid={`button-remove-image-${i}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {attachedFiles.map((f, i) => (
            <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-muted text-xs max-w-[160px]" data-testid={`chip-file-${i}`}>
              <Paperclip className="w-3 h-3 flex-shrink-0 text-muted-foreground" />
              <span className="truncate text-foreground">{f.name}</span>
              <button
                type="button"
                onClick={() => setAttachedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors"
                data-testid={`button-remove-file-${i}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Galería (fotos) */}
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/heic"
        multiple
        className="hidden"
        onChange={handleGalleryPick}
        data-testid="input-file-gallery"
      />
      {/* Archivos de texto */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,.csv,.json,.xml,.html,.js,.ts,.py,.log"
        multiple
        className="hidden"
        onChange={handleFilePick}
        data-testid="input-file-docs"
      />

      {/* Input box */}
      <div
        className={`relative flex items-end w-full glass-panel rounded-[1.5rem] shadow-lg shadow-black/5 p-2 transition-all focus-within:ring-2 ${
          chatModel === "fast"  ? "focus-within:ring-yellow-500/20 focus-within:border-yellow-500/20" :
          chatModel === "think" ? "focus-within:ring-blue-500/20 focus-within:border-blue-500/20"    :
          chatModel === "pro"   ? "focus-within:ring-purple-500/20 focus-within:border-purple-500/20" :
                                  "focus-within:ring-primary/20 focus-within:border-primary/30"
        }`}
      >
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[92px] max-h-[200px] w-full resize-none border-0 bg-transparent py-3 px-4 shadow-none focus-visible:ring-0 text-[1rem]"
          disabled={isGenerating || recorder.state === "recording"}
          rows={1}
          data-testid="input-message"
        />

        <div className="flex-shrink-0 flex items-center ml-2 mb-1 mr-1 gap-1">
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
          <Button
            type="button"
            size="icon"
            className={`rounded-full w-10 h-10 transition-all duration-300 ${sendBtnColor} ${
              input.trim() || images.length > 0 || attachedFiles.length > 0 || isGenerating ? "opacity-100 scale-100" : "opacity-50 scale-95"
            }`}
            disabled={(!input.trim() && !isGenerating && images.length === 0 && attachedFiles.length === 0) || recorder.state === "recording"}
            onClick={(e) => { e.preventDefault(); handleSend(); }}
            data-testid="button-send"
          >
            {isGenerating ? <Square className="w-4 h-4 fill-current" /> : <ArrowUp className="w-5 h-5 stroke-[3]" />}
          </Button>
        </div>
      </div>

      {/* Bottom row: action buttons + mode + model */}
      <div className="flex items-center justify-between mt-2 px-1">
        <div className="flex items-center gap-1">
          {/* Galería */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); galleryInputRef.current?.click(); }}
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
            data-testid="button-gallery"
            title="Galería"
          >
            <ImagePlus className="w-5 h-5" />
          </button>
          {/* Chat en vivo */}
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); setLocation("/live"); }}
            className="flex items-center justify-center w-9 h-9 rounded-full text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
            data-testid="button-start-live"
            title="Chat en vivo"
          >
            <Video className="w-5 h-5" />
          </button>
          <div className="w-px h-4 bg-border mx-1" />
        </div>

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
      </div>
    </div>
  );
}
