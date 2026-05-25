import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const { login, isLoggingIn, loginError } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    try {
      await login(email.trim());
    } catch {}
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center shadow-inner">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">Bienvenido a ChatDanis</h1>
            <p className="text-muted-foreground mt-2 text-base">
              Escribe tu correo y entra de inmediato
            </p>
          </div>
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3" noValidate>
          <Input
            type="text"
            placeholder="tucorreo@ejemplo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 text-base rounded-xl px-4"
            autoComplete="email"
            inputMode="email"
            data-testid="input-email"
          />

          {loginError && (
            <p className="text-sm text-destructive text-center">{loginError}</p>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full h-12 text-base rounded-xl shadow-md"
            disabled={isLoggingIn || !email.includes("@")}
            data-testid="button-enter"
          >
            {isLoggingIn ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Entrando...
              </span>
            ) : (
              "Entrar"
            )}
          </Button>
        </form>

        {/* Features */}
        <div className="w-full rounded-2xl border border-border bg-card p-5 space-y-3">
          {[
            { icon: "💬", text: "Chat en cualquier idioma" },
            { icon: "🎙️", text: "Mensajes de voz con IA" },
            { icon: "🎨", text: "Generación de imágenes" },
            { icon: "⚡", text: "Modos: Rápido, Pensar y Pro" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-sm">
              <span className="text-xl">{icon}</span>
              <span className="text-foreground/80">{text}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Si ya usaste este correo antes, tu cuenta y conversaciones se recuperan automáticamente.
        </p>
      </div>
    </div>
  );
}
