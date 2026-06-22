import { MessageSquare, Plus, Trash2, LogOut, Crown, Image, Video, Settings, User2 } from "lucide-react";
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

export function AppSidebar() {
  const { data: conversations, isLoading } = useConversations();
  const deleteMutation = useDeleteConversation();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { settings, updateSettings } = useVoiceSettings();
  const { name, setName } = useUserName();
  const [showSettings, setShowSettings] = useState(false);
  const [nameInput, setNameInput] = useState(name);

  const currentId = location.startsWith("/c/") ? parseInt(location.split("/")[2]) : null;

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMutation.mutate(id, {
      onSuccess: () => { if (currentId === id) setLocation("/"); },
    });
  };

  const handleNameSave = () => {
    setName(nameInput.trim());
  };

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
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setLocation("/?mode=image")}
            data-testid="button-image-mode"
          >
            <Image className="w-3.5 h-3.5" />
            Imagen
          </Button>
        </div>
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

      {/* Settings Panel */}
      {showSettings && (
        <div className="px-4 pb-3 border-t border-border pt-3 space-y-4">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
              <User2 className="w-3.5 h-3.5" />
              Tu nombre
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => { if (e.key === "Enter") { handleNameSave(); (e.target as HTMLInputElement).blur(); } }}
                placeholder="¿Cómo te llamas?"
                className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                data-testid="input-user-name"
              />
            </div>
            {name && (
              <p className="text-[11px] text-muted-foreground">
                La IA te llamará <span className="font-semibold text-foreground">{name}</span>
              </p>
            )}
          </div>

          {/* Voice Profile */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              🔊 Voz de la IA
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {(Object.keys(VOICE_PROFILES) as VoiceProfile[]).map((key) => {
                const profile = VOICE_PROFILES[key];
                const isActive = settings.profile === key;
                return (
                  <button
                    key={key}
                    onClick={() => updateSettings({ profile: key, enabled: true })}
                    className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border text-xs font-medium transition-all ${
                      isActive
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                    }`}
                    data-testid={`button-voice-${key}`}
                  >
                    <span className="text-base">{profile.emoji}</span>
                    <span>{profile.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                onClick={() => updateSettings({ enabled: !settings.enabled })}
                className={`relative w-8 h-4 rounded-full transition-colors ${settings.enabled ? "bg-primary" : "bg-muted-foreground/30"}`}
                data-testid="toggle-voice-enabled"
              >
                <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${settings.enabled ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
              <span className="text-xs text-muted-foreground">
                {settings.enabled ? "Voz activada" : "Voz desactivada"}
              </span>
            </div>
          </div>
        </div>
      )}

      <SidebarFooter className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">
                {name || user?.email || "Invitado"}
              </p>
              {user?.isPro && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 shrink-0">
                  <Crown className="w-2.5 h-2.5 mr-0.5" />
                  Pro
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{user?.email || "Sin cuenta"}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className={`w-8 h-8 shrink-0 transition-colors ${showSettings ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => setShowSettings((v) => !v)}
            title="Ajustes"
            data-testid="button-settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="w-8 h-8 text-muted-foreground hover:text-foreground shrink-0"
            onClick={() => logout()}
            title="Cambiar cuenta"
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
