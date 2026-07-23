import { useState, useRef } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Video, Sparkles, Download, RotateCcw, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Status = "idle" | "generating" | "succeeded" | "failed";

const EXAMPLE_PROMPTS = [
  "Un atardecer sobre el océano con olas suaves y nubes rosadas",
  "Un bosque mágico con luciérnagas brillando en la noche",
  "Una ciudad futurista con autos voladores y rascacielos iluminados",
  "Un campo de girasoles meciéndose con el viento en un día soleado",
];

export default function VideoPage() {
  const [prompt, setPrompt] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const pollStatus = (taskId: string) => {
    let attempts = 0;
    const MAX_ATTEMPTS = 120; // 4 minutes at 2s intervals

    pollRef.current = setInterval(async () => {
      attempts++;
      if (attempts > MAX_ATTEMPTS) {
        stopPolling();
        setStatus("failed");
        setError("La generación tardó demasiado. Intenta de nuevo.");
        return;
      }

      try {
        const res = await fetch(`/api/video-task?taskId=${taskId}`);
        const data = await res.json();

        if (data.status === "SUCCEEDED" && data.videoUrl) {
          stopPolling();
          setVideoUrl(data.videoUrl);
          setStatus("succeeded");
        } else if (data.status === "FAILED") {
          stopPolling();
          setStatus("failed");
          setError("No se pudo generar el video. Intenta con otro prompt.");
        }
        // RUNNING → keep polling
      } catch {
        // network hiccup, keep polling
      }
    }, 2000);
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || status === "generating") return;
    setStatus("generating");
    setVideoUrl(null);
    setError(null);
    stopPolling();

    try {
      const res = await fetch("/api/generate-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        setStatus("failed");
        setError(data.error || "Error al generar el video.");
        return;
      }

      if (data.status === "SUCCEEDED" && data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setStatus("succeeded");
      } else if (data.taskId) {
        pollStatus(data.taskId);
      } else {
        setStatus("failed");
        setError("Respuesta inesperada del servidor.");
      }
    } catch {
      setStatus("failed");
      setError("Error de conexión. Intenta de nuevo.");
    }
  };

  const handleReset = () => {
    stopPolling();
    setStatus("idle");
    setVideoUrl(null);
    setError(null);
  };

  const handleDownload = () => {
    if (!videoUrl) return;
    const a = document.createElement("a");
    a.href = videoUrl;
    a.download = "video-ia.mp4";
    a.target = "_blank";
    a.click();
  };

  return (
    <div className="flex flex-col flex-1 h-[100dvh] bg-background overflow-hidden min-h-0">
      {/* Header */}
      <header className="flex-none flex items-center gap-3 px-4 h-14 border-b border-border/50 bg-background/80 backdrop-blur-sm z-10">
        <SidebarTrigger className="text-muted-foreground hover:text-foreground transition-colors" />
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
            <Video className="w-4 h-4 text-violet-500" />
          </div>
          <h1 className="font-semibold text-sm">Generar video con IA</h1>
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start p-4 md:p-8">
        <div className="w-full max-w-2xl flex flex-col gap-6">

          {/* Intro */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="mx-auto w-14 h-14 rounded-2xl bg-violet-500/10 flex items-center justify-center mb-4">
              <Sparkles className="w-7 h-7 text-violet-500" />
            </div>
            <h2 className="text-xl font-bold mb-1">Crea un video desde texto</h2>
            <p className="text-muted-foreground text-sm">
              Describe la escena que quieres — la IA genera un clip de 5 segundos en HD.
            </p>
          </motion.div>

          {/* Prompt input */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="flex flex-col gap-2"
          >
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe tu video en detalle... (en inglés da mejores resultados)"
              className="min-h-[110px] resize-none text-sm"
              disabled={status === "generating"}
              data-testid="input-video-prompt"
            />

            {/* Example prompts */}
            {status === "idle" && (
              <div className="flex flex-wrap gap-2 mt-1">
                {EXAMPLE_PROMPTS.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    className="text-xs px-3 py-1.5 rounded-full border border-border bg-muted/50 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors text-left"
                  >
                    {ex.length > 45 ? ex.slice(0, 45) + "…" : ex}
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Generate button */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {status !== "succeeded" ? (
              <Button
                className="w-full h-11 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white"
                disabled={!prompt.trim() || status === "generating"}
                onClick={handleGenerate}
                data-testid="button-generate-video"
              >
                {status === "generating" ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Generando video…
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <Video className="w-4 h-4" />
                    Generar video
                  </span>
                )}
              </Button>
            ) : (
              <Button
                variant="outline"
                className="w-full h-11 text-sm"
                onClick={handleReset}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Generar otro video
              </Button>
            )}
          </motion.div>

          {/* Status / Progress */}
          <AnimatePresence mode="wait">
            {status === "generating" && (
              <motion.div
                key="progress"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-6 text-center"
              >
                <div className="flex justify-center mb-4">
                  <div className="relative w-16 h-16">
                    <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
                      <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeWidth="4" className="text-violet-200 dark:text-violet-800" />
                      <circle
                        cx="32" cy="32" r="28"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeDasharray="175.9"
                        strokeDashoffset="44"
                        strokeLinecap="round"
                        className="text-violet-500 animate-[spin_3s_linear_infinite]"
                        style={{ transformOrigin: "center", animation: "none", strokeDashoffset: 44 }}
                      />
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Video className="w-6 h-6 text-violet-500 animate-pulse" />
                    </div>
                  </div>
                </div>
                <p className="font-semibold text-violet-700 dark:text-violet-300 mb-1">Generando tu video…</p>
                <p className="text-xs text-muted-foreground">Esto puede tomar 1–3 minutos. No cierres la página.</p>
              </motion.div>
            )}

            {status === "failed" && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 flex items-start gap-3"
              >
                <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-destructive">Error al generar el video</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{error}</p>
                </div>
              </motion.div>
            )}

            {status === "succeeded" && videoUrl && (
              <motion.div
                key="video"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col gap-3"
              >
                <div className="rounded-2xl overflow-hidden border border-border shadow-lg bg-black">
                  <video
                    src={videoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full max-h-[420px] object-contain"
                    data-testid="video-result"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="self-end flex items-center gap-2 text-xs"
                  onClick={handleDownload}
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar video
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

        </div>
      </div>
    </div>
  );
}
