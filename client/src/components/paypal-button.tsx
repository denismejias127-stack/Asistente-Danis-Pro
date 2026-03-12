import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

interface PayPalButtonProps {
  onSuccess: () => void;
}

const PAYPAL_ME_URL = "https://www.paypal.com/paypalme/danismejias172/10";

export function PayPalButton({ onSuccess }: PayPalButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"pay" | "confirm">("pay");
  const [loading, setLoading] = useState(false);

  function openPayPal() {
    window.open(PAYPAL_ME_URL, "_blank");
    setStep("confirm");
  }

  async function confirmPayment() {
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
        toast({
          title: "¡Acceso activado!",
          description: "Ya puedes generar videos con IA.",
        });
        onSuccess();
      } else {
        toast({
          title: "Error",
          description: data.error || "Intenta de nuevo.",
          variant: "destructive",
        });
      }
    } catch {
      toast({
        title: "Error de conexión",
        description: "Intenta de nuevo.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  if (step === "pay") {
    return (
      <div className="flex flex-col gap-3">
        <Button
          data-testid="button-paypal-pay"
          className="w-full bg-[#0070BA] hover:bg-[#005ea6] text-white font-semibold py-3 rounded-xl"
          onClick={openPayPal}
        >
          <img
            src="https://www.paypalobjects.com/webstatic/icon/pp258.png"
            alt="PayPal"
            className="w-5 h-5 mr-2"
          />
          Pagar $10 con PayPal
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Se abrirá PayPal en una nueva ventana. Después de pagar, regresa aquí.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm text-center text-muted-foreground bg-muted rounded-xl p-3">
        Completa el pago de <strong>$10</strong> en la ventana de PayPal que se abrió.
        <br />
        Cuando termines, toca el botón de abajo.
      </div>
      <Button
        data-testid="button-paypal-confirm"
        className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-3 rounded-xl"
        onClick={confirmPayment}
        disabled={loading}
      >
        {loading ? "Activando acceso..." : "Ya pagué — Activar acceso Pro"}
      </Button>
      <button
        className="text-xs text-center text-muted-foreground underline"
        onClick={() => setStep("pay")}
      >
        ← Volver
      </button>
    </div>
  );
}
