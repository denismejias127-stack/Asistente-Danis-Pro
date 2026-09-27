import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserName } from "@/hooks/use-voice-settings";

export default function LoginPage() {
  const [nameInput, setNameInput] = useState("");
  const { setName } = useUserName();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setName(nameInput.trim());
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
              Escribe tu nombre para comenzar
            </p>
          </div>
        </div>

        {/* Email form */}
        <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3" noValidate>
          <Input
            type="text"
            placeholder="¿Cómo te llamas?"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="h-12 text-base rounded-xl px-4"
            autoComplete="email"
            inputMode="email"
            data-testid="input-email"
          />

          <Button
            type="submit"
            size="lg"
            className="w-full h-12 text-base rounded-xl shadow-md"
            disabled={!nameInput.trim()}
            data-testid="button-enter"
          >
            Entrar
          </Button>
        </form>

        {/* Features */}
        <div className="w-full rounded-2xl border border-border bg-card p-5 space-y-3">
          {[
            { icon: "💬", text: "Chat en cualquier idioma" },
            { icon: "🎙️", text: "Mensajes de voz con IA" },
            { icon: "🎨", text: "Generación de imágenes" },
            { icon: "⚡", text: "Modos: Rápido, Normal, Pensamiento y Pro" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-sm">
              <span className="text-xl">{icon}</span>
              <span className="text-foreground/80">{text}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Tus conversaciones se guardan en este dispositivo y navegador.
        </p>
      </div>
    </div>
  );
}
