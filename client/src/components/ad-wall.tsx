import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface AdWallProps {
  onSuccess: () => void;
}

const ADS = [
  {
    id: 1,
    title: "Anuncio 1 de 3",
    brand: "🛍️ Oferta del día",
    headline: "¡Descuentos increíbles en tecnología!",
    description: "Visita nuestra tienda y encuentra los mejores precios en electrónicos, gadgets y más.",
    color: "from-blue-500 to-blue-700",
  },
  {
    id: 2,
    title: "Anuncio 2 de 3",
    brand: "🎮 Gaming Pro",
    headline: "El mejor equipo gamer al mejor precio",
    description: "Controles, audífonos, sillas gamer y accesorios para llevar tu experiencia al siguiente nivel.",
    color: "from-purple-500 to-purple-700",
  },
  {
    id: 3,
    title: "Anuncio 3 de 3",
    brand: "📱 App Destacada",
    headline: "¡Descarga la app más popular del momento!",
    description: "Millones de usuarios ya la usan. Gratis para iOS y Android. ¡Descárgala ahora!",
    color: "from-green-500 to-green-700",
  },
];

const AD_DURATION = 3;

export function AdWall({ onSuccess }: AdWallProps) {
  const [adIndex, setAdIndex] = useState(0);
  const [countdown, setCountdown] = useState(AD_DURATION);
  const [canSkip, setCanSkip] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (done) return;
    setCountdown(AD_DURATION);
    setCanSkip(false);

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanSkip(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [adIndex, done]);

  async function nextAd() {
    if (adIndex < ADS.length - 1) {
      setAdIndex(adIndex + 1);
    } else {
      setLoading(true);
      try {
        const res = await fetch("/api/subscribe/video/confirm", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        const data = await res.json();
        if (data.success) {
          queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
          setDone(true);
          toast({ title: "¡Acceso desbloqueado!", description: "Ya puedes generar videos con IA." });
          onSuccess();
        }
      } catch {
        toast({ title: "Error", description: "Intenta de nuevo.", variant: "destructive" });
      } finally {
        setLoading(false);
      }
    }
  }

  const ad = ADS[adIndex];

  return (
    <div className="flex flex-col gap-4 w-full">
      <p className="text-center text-sm text-muted-foreground">
        Ve <strong>3 anuncios</strong> para desbloquear la generación de videos gratis.
      </p>

      {/* Ad Card */}
      <div className={`rounded-2xl bg-gradient-to-br ${ad.color} text-white p-5 flex flex-col gap-3 shadow-lg`}>
        <div className="flex items-center justify-between text-xs opacity-80">
          <span>{ad.brand}</span>
          <span className="bg-white/20 rounded px-2 py-0.5">Publicidad</span>
        </div>
        <h4 className="text-lg font-bold leading-tight">{ad.headline}</h4>
        <p className="text-sm opacity-90">{ad.description}</p>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        {ADS.map((_, i) => (
          <div
            key={i}
            className={`w-2 h-2 rounded-full transition-all ${
              i < adIndex ? "bg-primary" : i === adIndex ? "bg-primary w-4" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <Button
        data-testid="button-next-ad"
        onClick={nextAd}
        disabled={!canSkip || loading}
        className="w-full rounded-xl"
      >
        {!canSkip
          ? `Espera ${countdown}s...`
          : loading
          ? "Desbloqueando..."
          : adIndex < ADS.length - 1
          ? `Siguiente anuncio (${adIndex + 2} de ${ADS.length})`
          : "¡Desbloquear videos gratis!"}
      </Button>
    </div>
  );
}
