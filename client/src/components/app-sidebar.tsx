import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useConversations, useDeleteConversation } from "@/hooks/use-conversations";
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
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

export function AppSidebar() {
  const { data: conversations, isLoading } = useConversations();
  const deleteMutation = useDeleteConversation();
  const [location, setLocation] = useLocation();

  const currentId = location.startsWith('/c/') ? parseInt(location.split('/')[2]) : null;

  const handleNewChat = () => {
    setLocation('/');
  };

  const handleDelete = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMutation.mutate(id, {
      onSuccess: () => {
        if (currentId === id) setLocation('/');
      }
    });
  };

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <Button 
          onClick={handleNewChat} 
          className="w-full justify-start gap-2 shadow-sm"
          variant={!currentId ? "default" : "outline"}
        >
          <Plus className="w-4 h-4" />
          Nueva conversación
        </Button>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {isLoading ? (
                <div className="p-4 text-sm text-muted-foreground">Cargando...</div>
              ) : conversations?.length === 0 ? (
                <div className="p-4 text-sm text-muted-foreground text-center">No hay conversaciones aún</div>
              ) : (
                conversations?.map((conv) => (
                  <SidebarMenuItem key={conv.id}>
                    <SidebarMenuButton 
                      asChild 
                      isActive={currentId === conv.id}
                      className="group"
                    >
                      <Link href={`/c/${conv.id}`} className="flex flex-col items-start px-3 py-2 h-auto gap-1">
                        <div className="flex w-full items-center gap-2">
                          <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground group-data-[active=true]:text-foreground" />
                          <span className="truncate font-medium flex-1 text-left text-sm">
                            {conv.title || "Nueva conversación"}
                          </span>
                        </div>
                        <span className="text-[10px] text-muted-foreground pl-6">
                          {formatDistanceToNow(new Date(conv.createdAt), { addSuffix: true })}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                    <SidebarMenuAction 
                      onClick={(e) => handleDelete(e, conv.id)}
                      className="opacity-0 group-hover:opacity-100 data-[active=true]:opacity-100 transition-opacity mr-2"
                      title="Delete chat"
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
    </Sidebar>
  );
}
