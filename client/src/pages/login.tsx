import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-sm flex flex-col items-center gap-8">

        {/* Logo */}
        <div className="flex flex-col items-center gap-4">
          <div className="w-20 h-20 rounded-3xl bg-primary/10 flex items-center justify-center shadow-inner">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight">AI Assistant</h1>
            <p className="text-muted-foreground mt-2 text-base">
              Tu asistente inteligente para chat, voz e imágenes
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="w-full rounded-2xl border border-border bg-card p-5 space-y-3">
          {[
            { icon: "💬", text: "Chat en cualquier idioma" },
            { icon: "🎙️", text: "Mensajes de voz con IA" },
            { icon: "🎨", text: "Generación de imágenes" },
            { icon: "🎬", text: "Generación de video (Pro)" },
          ].map(({ icon, text }) => (
            <div key={text} className="flex items-center gap-3 text-sm">
              <span className="text-lg">{icon}</span>
              <span className="text-foreground/80">{text}</span>
            </div>
          ))}
        </div>

        {/* Login button */}
        <a href="/api/login" className="w-full" data-testid="button-login">
          <Button size="lg" className="w-full text-base h-12 rounded-xl shadow-md">
            Iniciar sesión con Replit
          </Button>
        </a>

        <p className="text-xs text-muted-foreground text-center">
          Al continuar aceptas nuestros términos de uso.
        </p>
      </div>
    </div>
  );
}
