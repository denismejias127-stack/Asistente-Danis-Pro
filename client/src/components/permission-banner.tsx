import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Mic, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "permissions-granted-v1";

export function PermissionBanner() {
  const [show, setShow] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) === "1") return;
    if (!navigator.mediaDevices?.getUserMedia) return;

    // Check if already granted via Permissions API (when supported)
    const check = async () => {
      try {
        const cam = await (navigator as any).permissions?.query({ name: "camera" });
        const mic = await (navigator as any).permissions?.query({ name: "microphone" });
        if (cam?.state === "granted" && mic?.state === "granted") {
          localStorage.setItem(STORAGE_KEY, "1");
          return;
        }
      } catch {}
      setShow(true);
    };
    check();
  }, []);

  const grant = async () => {
    setRequesting(true);
    try {
      // Solo pedimos micrófono aquí. La cámara se pide dentro del chat en vivo
      // para evitar que el WebView se confunda con dos peticiones seguidas.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      localStorage.setItem(STORAGE_KEY, "1");
      setShow(false);
      toast({ title: "Listo", description: "Micrófono activado." });
    } catch (e: any) {
      const name = e?.name || "";
      if (name === "NotAllowedError") {
        toast({
          title: "Permiso bloqueado",
          description: "Abre los ajustes del navegador y permite cámara y micrófono para esta app.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "No se pudo activar",
          description: "Revisa los permisos del navegador.",
          variant: "destructive",
        });
      }
    } finally {
      setRequesting(false);
    }
  };

  const dismiss = () => {
    localStorage.setItem(STORAGE_KEY, "1");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      className="mx-3 mt-3 flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3"
      data-testid="banner-permissions"
    >
      <div className="flex-shrink-0 w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center">
        <Mic className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-tight">Activa cámara y micrófono</p>
        <p className="text-xs text-muted-foreground leading-tight mt-0.5">
          Necesarios para los mensajes de voz y el chat en vivo.
        </p>
      </div>
      <Button
        size="sm"
        onClick={grant}
        disabled={requesting}
        className="flex-shrink-0"
        data-testid="button-grant-permissions"
      >
        {requesting ? "Pidiendo..." : "Activar"}
      </Button>
      <button
        onClick={dismiss}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground p-1"
        data-testid="button-dismiss-permissions"
        aria-label="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
