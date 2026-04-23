import { MessageSquare, Plus, Trash2, LogOut, Crown, Image, Video } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useConversations, useDeleteConversation } from "@/hooks/use-conversations";
import { useAuth } from "@/hooks/use-auth";
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

export function AppSidebar() {
  const { data: conversations, isLoading } = useConversations();
  const deleteMutation = useDeleteConversation();
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();

  const currentId = location.startsWith("/c/") ? parseInt(location.split("/")[2]) : null;

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMutation.mutate(id, {
      onSuccess: () => { if (currentId === id) setLocation("/"); },
    });
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

        {/* Mode shortcuts */}
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

      <SidebarFooter className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-medium truncate">{user?.email || "Invitado"}</p>
              {user?.isPro && (
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 shrink-0">
                  <Crown className="w-2.5 h-2.5 mr-0.5" />
                  Pro
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Cambiar cuenta</p>
          </div>
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
