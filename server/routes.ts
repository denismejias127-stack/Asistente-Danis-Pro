import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { isAuthenticated } from "./replit_integrations/auth/replitAuth";
import { registerAudioRoutes } from "./replit_integrations/audio/routes";
import OpenAI from "openai";
import Stripe from "stripe";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY);
}

function getUserId(req: any): string {
  return req.user?.claims?.sub as string;
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
    } catch (e) {
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
    } catch (e) {
      res.status(500).json({ error: "Error al cargar conversación" });
    }
  });

  app.post(api.conversations.create.path, isAuthenticated, async (req, res) => {
    try {
      const { title } = req.body;
      const conversation = await storage.createConversation(title || "Nueva conversación", getUserId(req));
      res.status(201).json(conversation);
    } catch (e) {
      res.status(500).json({ error: "Error al crear conversación" });
    }
  });

  app.delete(api.conversations.delete.path, isAuthenticated, async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteConversation(id, getUserId(req));
      res.status(204).send();
    } catch (e) {
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
            "You are a helpful, friendly AI assistant. Respond in the same language the user writes in. Use markdown when helpful. You can generate images when asked — just tell the user you are generating one and the frontend will handle the request.",
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

      const userId = getUserId(req);

      // Save user request message
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

      // Save assistant message with the image
      if (conversationId) {
        await storage.createMessage(conversationId, "assistant", markdownImage);
      }

      res.json({ imageUrl: imageDataUrl, markdown: markdownImage });
    } catch (error) {
      console.error("Error generating image:", error);
      res.status(500).json({ error: "Error al generar la imagen" });
    }
  });

  // ── Video Subscription (Stripe $10) ────────────────────────────────────────
  app.post("/api/subscribe/video", isAuthenticated, async (req, res) => {
    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({ error: "Pagos no configurados aún. Contacta al administrador." });
    }

    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ error: "Usuario no encontrado" });

      const origin = `${req.protocol}://${req.hostname}`;
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: "Generación de Video con IA",
                description: "Acceso para generar videos con inteligencia artificial",
              },
              unit_amount: 1000, // $10.00
            },
            quantity: 1,
          },
        ],
        customer_email: user.email || undefined,
        metadata: { userId },
        success_url: `${origin}/?video_success=1`,
        cancel_url: `${origin}/`,
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error("Stripe error:", error);
      res.status(500).json({ error: "Error al crear sesión de pago" });
    }
  });

  // ── Stripe Webhook ──────────────────────────────────────────────────────────
  app.post("/api/stripe/webhook", async (req, res) => {
    const stripe = getStripe();
    if (!stripe) return res.status(200).send();

    const sig = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;
    try {
      if (webhookSecret && sig) {
        event = stripe.webhooks.constructEvent(req.rawBody as Buffer, sig, webhookSecret);
      } else {
        event = req.body as Stripe.Event;
      }
    } catch (err) {
      return res.status(400).send(`Webhook Error: ${err}`);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.CheckoutSession;
      const userId = session.metadata?.userId;
      if (userId) {
        await storage.setUserPro(userId, true);
      }
    }

    res.json({ received: true });
  });

  // ── Video Generation ────────────────────────────────────────────────────────
  app.post("/api/generate-video", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      if (!user?.isPro) {
        return res.status(403).json({ error: "Se requiere suscripción Pro para generar videos", requiresUpgrade: true });
      }
      // Video generation placeholder — connect a video API (Luma AI, Runway, etc.)
      res.status(503).json({ error: "Generación de video próximamente. El pago fue registrado correctamente." });
    } catch (error) {
      res.status(500).json({ error: "Error al generar el video" });
    }
  });

  return httpServer;
}
