import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { isAuthenticated } from "./replit_integrations/auth/replitAuth";
import { registerAudioRoutes } from "./replit_integrations/audio/routes";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const PAYPAL_VIDEO_PRICE = "10.00";
const PAYPAL_CURRENCY = "USD";

function getUserId(req: any): string {
  return req.user?.claims?.sub as string;
}

// PayPal helpers
async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal credentials not configured");

  const base = process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";

  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error("Failed to get PayPal access token");
  const data = await res.json() as any;
  return data.access_token;
}

function getPayPalBase() {
  return process.env.PAYPAL_SANDBOX === "true"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

export async function registerRoutes(httpServer: Server, app: Express): Promise<Server> {
  registerAudioRoutes(app);

  // ── Auth ────────────────────────────────────────────────────────────────────
  app.get("/api/auth/user", async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });
    const userId = getUserId(req);
    const user = await storage.getUser(userId);
    res.json(user);
  });

  // ── Conversations ───────────────────────────────────────────────────────────
  app.get(api.conversations.list.path, isAuthenticated, async (req, res) => {
    try {
      const conversations = await storage.getAllConversations(getUserId(req));
      res.json(conversations);
    } catch {
      res.status(500).json({ error: "Error al cargar conversaciones" });
    }
  });

  app.get(api.conversations.get.path, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const conversation = await storage.getConversation(id, getUserId(req));
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });
      const messages = await storage.getMessagesByConversation(id);
      res.json({ ...conversation, messages });
    } catch {
      res.status(500).json({ error: "Error al cargar conversación" });
    }
  });

  app.post(api.conversations.create.path, isAuthenticated, async (req, res) => {
    try {
      const { title } = req.body;
      const conversation = await storage.createConversation(title || "Nueva conversación", getUserId(req));
      res.status(201).json(conversation);
    } catch {
      res.status(500).json({ error: "Error al crear conversación" });
    }
  });

  app.delete(api.conversations.delete.path, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteConversation(id, getUserId(req));
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Error al eliminar conversación" });
    }
  });

  // ── Chat (SSE streaming) ────────────────────────────────────────────────────
  app.post(api.messages.create.path, isAuthenticated, async (req, res) => {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = getUserId(req);
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: "El contenido es requerido" });

      const conversation = await storage.getConversation(conversationId, userId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });

      await storage.createMessage(conversationId, "user", content);
      const chatMessages = await storage.getMessagesByConversation(conversationId);

      const formattedMessages = [
        {
          role: "system" as const,
          content:
            "You are a helpful, friendly AI assistant. Respond in the same language the user writes in. Use markdown when helpful.",
        },
        ...chatMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

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

  // ── Image Generation ────────────────────────────────────────────────────────
  app.post("/api/generate-image", isAuthenticated, async (req, res) => {
    try {
      const { prompt, conversationId } = req.body;
      if (!prompt) return res.status(400).json({ error: "Se requiere un prompt" });

      if (conversationId) {
        await storage.createMessage(conversationId, "user", `🎨 Generar imagen: ${prompt}`);
      }

      const response = await openai.images.generate({
        model: "gpt-image-1",
        prompt,
        n: 1,
        size: "1024x1024",
      });

      const imageBase64 = response.data[0]?.b64_json;
      if (!imageBase64) return res.status(500).json({ error: "No se pudo generar la imagen" });

      const imageDataUrl = `data:image/png;base64,${imageBase64}`;
      const markdownImage = `![Imagen generada: ${prompt}](${imageDataUrl})`;

      if (conversationId) {
        await storage.createMessage(conversationId, "assistant", markdownImage);
      }

      res.json({ imageUrl: imageDataUrl, markdown: markdownImage });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Error al generar la imagen" });
    }
  });

  // ── PayPal: Create Order ($10 for Pro video access) ─────────────────────────
  app.post("/api/subscribe/video/create-order", isAuthenticated, async (req, res) => {
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      return res.status(503).json({ error: "Pagos no configurados aún. Contacta al administrador." });
    }

    try {
      const accessToken = await getPayPalAccessToken();
      const base = getPayPalBase();

      const response = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              amount: { currency_code: PAYPAL_CURRENCY, value: PAYPAL_VIDEO_PRICE },
              description: "Generación de Video con IA — Acceso Pro de por vida",
            },
          ],
          application_context: {
            user_action: "PAY_NOW",
            brand_name: "AI Assistant",
          },
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("PayPal create order error:", err);
        return res.status(500).json({ error: "Error al crear la orden de pago" });
      }

      const order = await response.json() as any;
      res.json({ orderID: order.id });
    } catch (error) {
      console.error("PayPal error:", error);
      res.status(500).json({ error: "Error al procesar el pago" });
    }
  });

  // ── PayPal: Capture Order (confirm payment, grant Pro) ──────────────────────
  app.post("/api/subscribe/video/capture-order", isAuthenticated, async (req, res) => {
    try {
      const { orderID } = req.body;
      if (!orderID) return res.status(400).json({ error: "orderID requerido" });

      const accessToken = await getPayPalAccessToken();
      const base = getPayPalBase();

      const response = await fetch(`${base}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const err = await response.text();
        console.error("PayPal capture error:", err);
        return res.status(500).json({ error: "Error al confirmar el pago" });
      }

      const capture = await response.json() as any;
      const status = capture.status;

      if (status === "COMPLETED") {
        const userId = getUserId(req);
        await storage.setUserPro(userId, true);
        return res.json({ success: true, message: "¡Pago completado! Ya tienes acceso Pro." });
      }

      res.status(400).json({ error: "El pago no fue completado", status });
    } catch (error) {
      console.error("PayPal capture error:", error);
      res.status(500).json({ error: "Error al confirmar el pago" });
    }
  });

  // ── PayPal Client ID (public, for frontend SDK) ─────────────────────────────
  app.get("/api/paypal/client-id", (req, res) => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) return res.status(503).json({ configured: false });
    res.json({ clientId, configured: true });
  });

  // ── Video Generation ────────────────────────────────────────────────────────
  app.post("/api/generate-video", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user?.isPro) {
        return res.status(403).json({ error: "Se requiere acceso Pro para generar videos", requiresUpgrade: true });
      }
      res.status(503).json({ error: "Generación de video próximamente disponible." });
    } catch {
      res.status(500).json({ error: "Error al generar el video" });
    }
  });

  return httpServer;
}
