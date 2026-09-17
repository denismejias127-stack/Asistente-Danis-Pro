export type LocalMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

export type LocalConversation = {
  id: number;
  userId: string;
  title: string;
  createdAt: string;
  messages: LocalMessage[];
};

const STORAGE_KEY = "chatdanis_local_conversations";
let nextId = -1;

function read(): LocalConversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function write(conversations: LocalConversation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  window.dispatchEvent(new Event("chatdanis-conversations-updated"));
}

export function getLocalConversations(): LocalConversation[] {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getLocalConversation(id: number): LocalConversation | null {
  return read().find((conversation) => conversation.id === id) || null;
}

export function createLocalConversation(title = "Nueva conversación"): LocalConversation {
  const conversation: LocalConversation = {
    id: nextId--,
    userId: "local-user",
    title: title.trim().slice(0, 60) || "Nueva conversación",
    createdAt: new Date().toISOString(),
    messages: [],
  };
  write([conversation, ...read()]);
  return conversation;
}

export function addLocalMessage(id: number, role: LocalMessage["role"], content: string) {
  const conversations = read();
  const conversation = conversations.find((item) => item.id === id);
  if (!conversation) return;
  conversation.messages.push({
    id: Date.now() + conversation.messages.length,
    role,
    content,
    createdAt: new Date().toISOString(),
  });
  if (role === "user" && conversation.messages.length === 1) {
    conversation.title = content.replace(/\s+/g, " ").trim().slice(0, 60) || "Nueva conversación";
  }
  write(conversations);
}

export function deleteLocalConversation(id: number) {
  write(read().filter((conversation) => conversation.id !== id));
}