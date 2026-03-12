import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { User } from "@shared/schema";

async function fetchUser(): Promise<User | null> {
  const response = await fetch("/api/auth/user", { credentials: "include" });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error(`${response.status}: ${response.statusText}`);
  return response.json();
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchUser,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const loginMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/auth/email-login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al iniciar sesión");
      }
      return res.json() as Promise<User>;
    },
    onSuccess: (user) => {
      queryClient.setQueryData(["/api/auth/user"], user);
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
    },
  });

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login: loginMutation.mutateAsync,
    isLoggingIn: loginMutation.isPending,
    loginError: loginMutation.error?.message,
    logout: logoutMutation.mutate,
  };
}
