import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { useUserName } from "@/hooks/use-voice-settings";
import NotFound from "@/pages/not-found";
import ChatPage from "@/pages/chat-page";
import LivePage from "@/pages/live-page";
import VideoPage from "@/pages/video-page";
import LoginPage from "@/pages/login";
import CalendarPage from "@/pages/calendar-page";

function AppContent() {
  const { name } = useUserName();

  if (!name) {
    return <LoginPage />;
  }

  return (
    <SidebarProvider style={{ "--sidebar-width": "18rem", "--sidebar-width-icon": "4rem" } as React.CSSProperties}>
      <div className="flex h-[100dvh] w-full bg-background text-foreground overflow-hidden">
        <AppSidebar />
        <Switch>
          <Route path="/" component={ChatPage} />
          <Route path="/c/:id" component={ChatPage} />
          <Route path="/live" component={LivePage} />
          <Route path="/video" component={VideoPage} />
          <Route path="/calendar" component={CalendarPage} />
          <Route component={NotFound} />
        </Switch>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
