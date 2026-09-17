import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createLocalConversation,
  deleteLocalConversation,
  getLocalConversation,
  getLocalConversations,
} from "@/lib/local-chat";

export function useConversations() {
  return useQuery({
    queryKey: [api.conversations.list.path],
    queryFn: async () => {
      return getLocalConversations();
    },
  });
}

export function useConversation(id?: number) {
  return useQuery({
    queryKey: [api.conversations.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      return getLocalConversation(id);
    },
    enabled: !!id,
  });
}

export function useCreateConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (title?: string) => {
      return createLocalConversation(title);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.conversations.list.path] });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      deleteLocalConversation(id);
    },
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: [api.conversations.list.path] });
      queryClient.removeQueries({ queryKey: [api.conversations.get.path, deletedId] });
    },
  });
}
