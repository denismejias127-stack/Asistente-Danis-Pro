import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import { registerAudioRoutes } from "./replit_integrations/audio/routes";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  // Register audio integrations
  registerAudioRoutes(app);

  app.get(api.conversations.list.path, async (req, res) => {
    try {
      const conversations = await storage.getAllConversations();
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ error: "Failed to fetch conversations" });
    }
  });

  app.get(api.conversations.get.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ error: "Conversation not found" });
      }
      const chatMessages = await storage.getMessagesByConversation(id);
      res.json({ ...conversation, messages: chatMessages });
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ error: "Failed to fetch conversation" });
    }
  });

  app.post(api.conversations.create.path, async (req, res) => {
    try {
      const { title } = req.body;
      const conversation = await storage.createConversation(title || "Nueva conversación");
      res.status(201).json(conversation);
    } catch (error) {
      console.error("Error creating conversation:", error);
      res.status(500).json({ error: "Failed to create conversation" });
    }
  });

  app.delete(api.conversations.delete.path, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteConversation(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      res.status(500).json({ error: "Failed to delete conversation" });
    }
  });

  // Send message and get AI response (streaming)
  app.post(api.messages.create.path, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const { content } = req.body;

      if (!content) {
        return res.status(400).json({ error: "El contenido del mensaje es requerido" });
      }

      // Guardar el mensaje del usuario
      await storage.createMessage(conversationId, "user", content);

      // Obtener el historial para el contexto
      const chatMessages = await storage.getMessagesByConversation(conversationId);
      const formattedMessages = [
        { role: "system" as const, content: "You are a helpful, friendly assistant capable of helping with a wide variety of tasks. Always respond in the same language the user writes in. If the user writes in Spanish, respond in Spanish. If they write in English, respond in English. If they write in French, respond in French, and so on. Respond clearly and in a structured way, using markdown when appropriate." },
        ...chatMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content,
        }))
      ];

      // Configurar SSE (Server-Sent Events)
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream the response from OpenAI (usando gpt-5.2 porque es el mejor modelo de propósito general disponible en Replit AI integrations)
      const stream = await openai.chat.completions.create({
        model: "gpt-5.2",
        messages: formattedMessages,
        stream: true,
      });

      let fullResponse = "";

      for await (const chunk of stream) {
        const chunkContent = chunk.choices[0]?.delta?.content || "";
        if (chunkContent) {
          fullResponse += chunkContent;
          res.write(`data: ${JSON.stringify({ content: chunkContent })}\n\n`);
        }
      }

      // Guardar la respuesta del asistente en la DB
      await storage.createMessage(conversationId, "assistant", fullResponse);

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Error sending message:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Error de conexión" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Error al procesar el mensaje" });
      }
    }
  });

  return httpServer;
}

// Seed the database with some examples if it's empty
async function seedDatabase() {
  try {
    const existing = await storage.getAllConversations();
    if (existing.length === 0) {
      const conv = await storage.createConversation("Bienvenida al asistente");
      await storage.createMessage(conv.id, "assistant", "¡Hola! Soy tu asistente virtual. Estoy aquí para ayudarte a organizar tus ideas, redactar textos, programar, o resolver cualquier duda que tengas. ¿En qué te puedo ayudar hoy?");
    }
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}

// Llama al seeder al iniciar el servidor (se ejecuta una vez en lugar de en cada petición)
setTimeout(seedDatabase, 2000);
