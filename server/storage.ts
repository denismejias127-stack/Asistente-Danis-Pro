import { db } from "./db";
import { conversations, messages, users, userMemories, type User, type UpsertUser } from "@shared/schema";
import { eq, desc, and } from "drizzle-orm";
import { sql } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  findOrCreateUserByEmail(email: string): Promise<User>;
  upsertUser(user: UpsertUser): Promise<User>;
  setUserPro(id: string, isPro: boolean): Promise<void>;
  getConversation(id: number, userId: string): Promise<typeof conversations.$inferSelect | undefined>;
  getAllConversations(userId: string): Promise<(typeof conversations.$inferSelect)[]>;
  createConversation(title: string, userId: string): Promise<typeof conversations.$inferSelect>;
  deleteConversation(id: number, userId: string): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<(typeof messages.$inferSelect)[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<typeof messages.$inferSelect>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async findOrCreateUserByEmail(email: string): Promise<User> {
    // Try to find existing user
    const existing = await this.getUserByEmail(email);
    if (existing) return existing;
    // Create new user with email
    const [user] = await db
      .insert(users)
      .values({ email, firstName: email.split("@")[0] })
      .returning();
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({ target: users.id, set: { ...userData, updatedAt: new Date() } })
      .returning();
    return user;
  }

  async setUserPro(id: string, isPro: boolean): Promise<void> {
    await db.update(users).set({ isPro, updatedAt: new Date() }).where(eq(users.id, id));
  }

  async getConversation(id: number, userId: string) {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    return conversation;
  }

  async getAllConversations(userId: string) {
    return db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.createdAt));
  }

  async createConversation(title: string, userId: string) {
    const [conversation] = await db.insert(conversations).values({ title, userId }).returning();
    return conversation;
  }

  async deleteConversation(id: number, userId: string) {
    const [conv] = await db.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
    if (!conv) return;
    await db.delete(messages).where(eq(messages.conversationId, id));
    await db.delete(conversations).where(eq(conversations.id, id));
  }

  async getMessagesByConversation(conversationId: number) {
    return db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.createdAt);
  }

  async createMessage(conversationId: number, role: string, content: string) {
    const [message] = await db.insert(messages).values({ conversationId, role, content }).returning();
    return message;
  }

  // ── Long-term memory ──────────────────────────────────────────────────────
  async getUserMemories(userId: string): Promise<{ key: string; value: string }[]> {
    const rows = await db.select({ key: userMemories.key, value: userMemories.value })
      .from(userMemories)
      .where(eq(userMemories.userId, userId))
      .orderBy(desc(userMemories.updatedAt));
    return rows;
  }

  async upsertMemory(userId: string, key: string, value: string): Promise<void> {
    await db.insert(userMemories)
      .values({ userId, key, value })
      .onConflictDoUpdate({
        target: [userMemories.userId, userMemories.key],
        set: { value, updatedAt: new Date() },
      });
  }

  async deleteMemory(userId: string, key: string): Promise<void> {
    await db.delete(userMemories)
      .where(and(eq(userMemories.userId, userId), eq(userMemories.key, key)));
  }
}

export const storage = new DatabaseStorage();
