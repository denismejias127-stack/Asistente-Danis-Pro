import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, MicOff, Video, VideoOff, X, SwitchCamera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type Turn = { role: "user" | "assistant"; content: string };

export default function LivePage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioWorkletRef = useRef<AudioWorkletNode | null>(null);
  const historyRef = useRef<Turn[]>([]);

  const [cameraOn, setCameraOn] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [status, setStatus] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [userText, setUserText] = useState("");
  const [aiText, setAiText] = useState("");
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Start camera/mic stream — only when explicitly requested
  const startStream = useCallback(async (withVideo: boolean, face: "user" | "environment") => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: withVideo ? { facingMode: face } : false,
        audio: true,
      });
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setStreamReady(true);
      return stream;
    } catch (e: any) {
      toast({
        title: "Sin acceso a cámara/mic",
        description: "Activa los permisos en tu navegador.",
        variant: "destructive",
      });
      return null;
    }
  }, [toast]);

  // Restart stream when camera or facingMode changes (only if already initialized)
  useEffect(() => {
    if (streamReady) {
      startStream(cameraOn, facingMode);
    }
    return () => {
      // cleanup on unmount only
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  const toggleCamera = useCallback(async () => {
    if (cameraOn) {
      // Turn off camera tracks but keep audio if mic recording is active
      const stream = streamRef.current;
      if (stream) {
        stream.getVideoTracks().forEach((t) => t.stop());
      }
      setCameraOn(false);
      if (videoRef.current) videoRef.current.srcObject = null;
    } else {
      setCameraOn(true);
      await startStream(true, facingMode);
    }
  }, [cameraOn, facingMode, startStream]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close();
    };
  }, []);

  // Setup audio playback worklet
  const ensurePlayback = useCallback(async () => {
    if (audioWorkletRef.current) return;
    const ctx = new AudioContext({ sampleRate: 24000 });
    await ctx.audioWorklet.addModule("/audio-playback-worklet.js");
    const node = new AudioWorkletNode(ctx, "audio-playback-processor");
    node.connect(ctx.destination);
    node.port.onmessage = (e) => {
      if (e.data.type === "ended") setStatus("idle");
    };
    audioCtxRef.current = ctx;
    audioWorkletRef.current = node;
  }, []);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !cameraOn || video.readyState < 2) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, [cameraOn]);

  const startRecording = useCallback(async () => {
    let stream = streamRef.current;
    if (!stream) {
      stream = await startStream(cameraOn, facingMode);
    }
    if (!stream) return;
    const audioStream = new MediaStream(stream.getAudioTracks());
    const recorder = new MediaRecorder(audioStream, { mimeType: "audio/webm;codecs=opus" });
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.start(100);
    recorderRef.current = recorder;
    setMicOn(true);
    setStatus("listening");
    setUserText("");
    setAiText("");
  }, [startStream, cameraOn, facingMode]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    setMicOn(false);
    setStatus("thinking");

    const blob: Blob = await new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
      recorder.stop();
    });

    const frame = captureFrame();

    const base64Audio = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(",")[1]);
      reader.readAsDataURL(blob);
    });

    await ensurePlayback();
    if (audioCtxRef.current?.state === "suspended") await audioCtxRef.current.resume();

    try {
      const res = await fetch("/api/live-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          audio: base64Audio,
          image: frame,
          history: historyRef.current,
        }),
      });
      if (!res.ok || !res.body) throw new Error("error");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantFull = "";
      let userFull = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const ev = JSON.parse(line.slice(6));
            if (ev.type === "user_transcript") {
              userFull = ev.data;
              setUserText(ev.data);
            } else if (ev.type === "transcript") {
              assistantFull = ev.data;
              setAiText(ev.data);
              setStatus("speaking");
            } else if (ev.type === "audio") {
              // decode pcm16 base64 and push to worklet
              const raw = atob(ev.data);
              const bytes = new Uint8Array(raw.length);
              for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
              const pcm = new Int16Array(bytes.buffer);
              const f32 = new Float32Array(pcm.length);
              for (let i = 0; i < pcm.length; i++) f32[i] = pcm[i] / 32768;
              audioWorkletRef.current?.port.postMessage({ type: "audio", samples: f32 });
            } else if (ev.type === "done") {
              audioWorkletRef.current?.port.postMessage({ type: "streamComplete" });
            } else if (ev.type === "error") {
              throw new Error(ev.error);
            }
          } catch {}
        }
      }

      if (userFull) historyRef.current.push({ role: "user", content: userFull });
      if (assistantFull) historyRef.current.push({ role: "assistant", content: assistantFull });
      historyRef.current = historyRef.current.slice(-12);
    } catch (e) {
      toast({ title: "Error", description: "No se pudo procesar tu mensaje.", variant: "destructive" });
      setStatus("idle");
    }
  }, [captureFrame, ensurePlayback, toast]);

  const toggleMic = () => {
    if (micOn) stopRecording();
    else startRecording();
  };

  const flipCamera = () => {
    setFacingMode((f) => (f === "user" ? "environment" : "user"));
  };

  const statusLabel = {
    idle: "Toca el micro para hablar",
    listening: "Escuchando...",
    thinking: "Pensando...",
    speaking: "Hablando...",
  }[status];

  const statusColor = {
    idle: "bg-muted",
    listening: "bg-red-500 animate-pulse",
    thinking: "bg-yellow-500 animate-pulse",
    speaking: "bg-green-500 animate-pulse",
  }[status];

  return (
    <div className="flex flex-col flex-1 h-[100dvh] bg-black text-white relative overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 h-14 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center gap-3">
          <SidebarTrigger className="text-white/80 hover:text-white" />
          <h1 className="font-semibold text-sm">Chat en vivo</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} />
          <span className="text-xs text-white/80">{statusLabel}</span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="text-white/80 hover:text-white hover:bg-white/10"
          onClick={() => setLocation("/")}
          data-testid="button-close-live"
        >
          <X className="w-5 h-5" />
        </Button>
      </header>

      {/* Video */}
      <div className="absolute inset-0 flex items-center justify-center bg-black">
        {cameraOn ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
            style={{ transform: facingMode === "user" ? "scaleX(-1)" : undefined }}
            data-testid="video-camera"
          />
        ) : (
          <div className="text-white/60 text-sm">Cámara apagada</div>
        )}
      </div>

      {/* Captions overlay */}
      <div className="absolute bottom-32 left-0 right-0 z-10 px-4 pointer-events-none">
        <div className="max-w-2xl mx-auto space-y-2">
          {userText && (
            <div className="bg-white/10 backdrop-blur-md px-4 py-2 rounded-2xl text-sm text-white/90 self-end ml-auto w-fit max-w-[85%]" data-testid="text-user-transcript">
              {userText}
            </div>
          )}
          {aiText && (
            <div className="bg-primary/30 backdrop-blur-md px-4 py-2 rounded-2xl text-sm text-white w-fit max-w-[85%]" data-testid="text-ai-transcript">
              {aiText}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="absolute bottom-0 left-0 right-0 z-20 pb-8 pt-12 bg-gradient-to-t from-black/80 to-transparent">
        <div className="flex items-center justify-center gap-6">
          <div className="flex flex-col items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className={`w-14 h-14 rounded-full text-white transition-colors ${
                cameraOn ? "bg-white/20 hover:bg-white/30" : "bg-red-500/80 hover:bg-red-500"
              }`}
              onClick={toggleCamera}
              data-testid="button-toggle-camera"
            >
              {cameraOn ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
            </Button>
            <span className="text-[10px] text-white/70">{cameraOn ? "Apagar cámara" : "Activar cámara"}</span>
          </div>

          <Button
            size="icon"
            className={`w-20 h-20 rounded-full transition-all ${
              micOn ? "bg-red-500 hover:bg-red-600 scale-110" : "bg-white text-black hover:bg-white/90"
            }`}
            onClick={toggleMic}
            disabled={status === "thinking"}
            data-testid="button-toggle-mic"
          >
            {micOn ? <MicOff className="w-8 h-8" /> : <Mic className="w-8 h-8" />}
          </Button>

          <Button
            size="icon"
            variant="ghost"
            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white"
            onClick={flipCamera}
            disabled={!cameraOn}
            data-testid="button-flip-camera"
          >
            <SwitchCamera className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
