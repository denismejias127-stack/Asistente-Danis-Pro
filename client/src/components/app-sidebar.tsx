import { MessageSquare, Plus, Trash2, LogOut, Crown, Image, Video, Play, User2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useConversations, useDeleteConversation } from "@/hooks/use-conversations";
import { useAuth } from "@/hooks/use-auth";
import { useVoiceSettings, useUserName, VOICE_PROFILES, VoiceProfile } from "@/hooks/use-voice-settings";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuAction,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useState } from "react";

function testVoice(key: VoiceProfile) {
  if (!window.speechSynthesis) return;
  const profile = VOICE_PROFILES[key];
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(`Hola, soy la voz ${profile.label}`);
  u.rate = profile.rate;
  u.pitch = profile.pitch;
  u.volume = 1.0;
  const apply = () => {
    const voices = window.speechSynthesis.getVoices();
    const pool = voices.filter(v => v.lang.startsWith("es"));
    const all = pool.length > 0 ? pool : voices;
    const femH = ["female","mujer","woman","maria","elena","isabel","lucia","paulina","sabina","ines","camila","valentina","sofia"];
    const manH = ["male","hombre","man","jorge","carlos","diego","antonio","pablo","juan","miguel"];
    let pick: SpeechSynthesisVoice | undefined;
    if (key === "joven" || profile.preferFemale) pick = all.find(v => femH.some(h => v.name.toLowerCase().includes(h)));
    else pick = all.find(v => manH.some(h => v.name.toLowerCase().includes(h)));
    if (!pick) pick = all[0];
    if (pick) u.voice = pick;
    u.lang = pick?.lang || "es-ES";
    window.speechSynthesis.speak(u);
  };
  if (window.speechSynthesis.getVoices().length > 0) apply();
  else { window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged = null; apply(); }; }
}

export function AppSidebar() {
  const { data: conversations, isLoading } = useConversations();
  const deleteMutation = useDeleteConversation();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { settings, updateSettings } = useVoiceSettings();
  const { name, setName } = useUserName();
  const [nameInput, setNameInput] = useState(name);

  const currentId = location.startsWith("/c/") ? parseInt(location.split("/")[2]) : null;

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMutation.mutate(id, {
      onSuccess: () => { if (currentId === id) setLocation("/"); },
    });
  };

  const handleNameSave = () => setName(nameInput.trim());

  return (
    <Sidebar>
      <SidebarHeader className="p-4 space-y-2">
        <Button
          onClick={() => setLocation("/")}
          className="w-full justify-start gap-2"
          variant={!currentId ? "default" : "outline"}
          data-testid="button-new-chat"
        >
          <Plus className="w-4 h-4" />
          Nueva conversación
        </Button>

        <Button
          onClick={() => setLocation("/live")}
          className="w-full justify-start gap-2 bg-gradient-to-r from-red-500 to-pink-500 text-white hover:opacity-90"
          data-testid="button-live-mode"
        >
          <Video className="w-4 h-4" />
          Chat en vivo (cámara + voz)
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-1.5 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setLocation("/?mode=image")}
          data-testid="button-image-mode"
        >
          <Image className="w-3.5 h-3.5" />
          Generar imagen
        </Button>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Cargando...</div>
              ) : conversations?.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">
                  Empieza una nueva conversación
                </div>
              ) : (
                conversations?.map((conv) => (
                  <SidebarMenuItem key={conv.id}>
                    <SidebarMenuButton
                      asChild
                      isActive={currentId === conv.id}
                      className="group"
                      data-testid={`link-conversation-${conv.id}`}
                    >
                      <Link href={`/c/${conv.id}`} className="flex flex-col items-start px-3 py-2 h-auto gap-1">
                        <div className="flex w-full items-center gap-2">
                          <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground group-data-[active=true]:text-foreground" />
                          <span className="truncate font-medium flex-1 text-left text-sm">
                            {conv.title || "Nueva conversación"}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground pl-6">
                          {formatDistanceToNow(new Date(conv.createdAt), { addSuffix: true, locale: es })}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      onClick={(e) => handleDelete(e, conv.id)}
                      className="opacity-0 group-hover:opacity-100 transition-opacity mr-2"
                      title="Eliminar"
                      data-testid={`button-delete-${conv.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive transition-colors" />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* ─── Voice + Name (always visible) ─── */}
      <div className="px-4 pt-3 pb-2 border-t border-border space-y-3">

        {/* Name input */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
            <User2 className="w-3 h-3" /> Tu nombre
          </label>
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => { if (e.key === "Enter") { handleNameSave(); (e.target as HTMLInputElement).blur(); } }}
            placeholder="¿Cómo te llamas?"
            className="w-full px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
            data-testid="input-user-name"
          />
        </div>

        {/* Voice selector */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-muted-foreground">🔊 Voz de la IA</span>
            {/* ON/OFF toggle */}
            <button
              onClick={() => updateSettings({ enabled: !settings.enabled })}
              className={`relative w-9 h-5 rounded-full transition-colors ${settings.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
              data-testid="toggle-voice-enabled"
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
            </button>
          </div>

          {/* Three voice cards */}
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(VOICE_PROFILES) as VoiceProfile[]).map((key) => {
              const profile = VOICE_PROFILES[key];
              const isActive = settings.profile === key;
              return (
                <div key={key} className="flex flex-col gap-1">
                  <button
                    onClick={() => updateSettings({ profile: key, enabled: true })}
                    className={`flex flex-col items-center gap-0.5 py-2.5 rounded-xl border text-xs font-semibold transition-all active:scale-95 ${
                      isActive
                        ? "border-primary bg-primary/10 text-primary shadow-sm"
                        : "border-border text-muted-foreground bg-muted/30 hover:border-primary/50 hover:text-foreground"
                    }`}
                    data-testid={`button-voice-${key}`}
                  >
                    <span className="text-lg leading-none">{profile.emoji}</span>
                    <span className="text-[11px]">{profile.label}</span>
                    {isActive && <span className="text-[9px] opacity-70">✓ activa</span>}
                  </button>
                  {/* Test voice button */}
                  <button
                    onClick={() => testVoice(key)}
                    className="flex items-center justify-center gap-1 py-1 rounded-lg border border-border text-[10px] text-muted-foreground hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all active:scale-95"
                    data-testid={`button-test-voice-${key}`}
                    title={`Escuchar voz ${profile.label}`}
                  >
                    <Play className="w-2.5 h-2.5 fill-current" />
                    Probar
                  </button>
                </div>
              );
            })}
          </div>

          {/* Volume */}
          <div className="space-y-0.5 pt-0.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">🔈 Volumen</span>
              <span className="text-[10px] font-semibold">{Math.round(settings.volume * 100)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => updateSettings({ volume: parseFloat(e.target.value) })}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-primary"
              data-testid="slider-volume"
            />
          </div>
        </div>
      </div>

      <SidebarFooter className="p-3 border-t border-border">
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{name || user?.email || "Invitado"}</p>
            {user?.isPro && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                <Crown className="w-2.5 h-2.5 mr-0.5" />Pro
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => logout()}
            title="Cerrar sesión"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
