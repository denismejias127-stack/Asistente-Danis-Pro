import { useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

interface PayPalButtonProps {
  onSuccess: () => void;
}

declare global {
  interface Window {
    paypal?: any;
  }
}

export function PayPalButton({ onSuccess }: PayPalButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        // Fetch client ID from backend
        const res = await fetch("/api/paypal/client-id");
        const data = await res.json();

        if (!data.configured) {
          setError("Pagos no configurados aún. Contacta al administrador.");
          setLoading(false);
          return;
        }

        const clientId = data.clientId;

        // Load PayPal SDK if not already loaded
        if (!window.paypal) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = `https://www.paypal.com/sdk/js?client-id=${clientId}&currency=USD`;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error("Error cargando PayPal"));
            document.head.appendChild(script);
          });
        }

        if (cancelled || !containerRef.current) return;

        setLoading(false);

        window.paypal.Buttons({
          style: {
            layout: "vertical",
            color: "blue",
            shape: "rect",
            label: "pay",
          },
          createOrder: async () => {
            const res = await fetch("/api/subscribe/video/create-order", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
            });
            const data = await res.json();
            if (!data.orderID) throw new Error(data.error || "Error creando orden");
            return data.orderID;
          },
          onApprove: async (paypalData: { orderID: string }) => {
            const res = await fetch("/api/subscribe/video/capture-order", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orderID: paypalData.orderID }),
            });
            const result = await res.json();
            if (result.success) {
              queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
              toast({
                title: "¡Pago completado! 🎉",
                description: "Ya tienes acceso Pro para generar videos.",
              });
              onSuccess();
            } else {
              toast({
                title: "Error en el pago",
                description: result.error || "Intenta de nuevo.",
                variant: "destructive",
              });
            }
          },
          onError: (err: any) => {
            console.error("PayPal error:", err);
            toast({
              title: "Error en el pago",
              description: "Hubo un problema. Intenta de nuevo.",
              variant: "destructive",
            });
          },
        }).render(containerRef.current);
      } catch (e: any) {
        if (!cancelled) {
          setError(e.message || "Error cargando el sistema de pago");
          setLoading(false);
        }
      }
    }

    init();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-12 gap-2 text-sm text-muted-foreground">
        <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        Cargando PayPal...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-center text-muted-foreground bg-muted rounded-xl p-3">
        {error}
      </div>
    );
  }

  return <div ref={containerRef} data-testid="paypal-buttons" />;
}
