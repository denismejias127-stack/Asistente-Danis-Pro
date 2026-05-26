import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { registerAudioRoutes } from "./replit_integrations/audio/routes";
import { registerLiveChatRoutes } from "./live-chat";
import OpenAI from "openai";

// Extend session type
declare module "express-session" {
  interface SessionData {
    userId?: string;
    isPro?: boolean;
  }
}

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const PAYPAL_VIDEO_PRICE = "10.00";
const PAYPAL_CURRENCY = "USD";

function getEffectiveUserId(req: any): string | null {
  return req.session?.userId ?? null;
}

function requireUser(req: any, res: any): string | null {
  const userId = getEffectiveUserId(req);
  if (!userId) {
    res.status(401).json({ message: "Inicia sesión primero" });
    return null;
  }
  return userId;
}

// PayPal helpers
async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !secret) throw new Error("PayPal no configurado");
  const base = getPayPalBase();
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`PayPal auth error ${res.status}:`, body);
    throw new Error(`PayPal auth failed (${res.status}): ${body}`);
  }
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
  registerLiveChatRoutes(app);

  // ── Email Login (no password) ───────────────────────────────────────────────
  app.post("/api/auth/email-login", async (req, res) => {
    try {
      const { email } = req.body;
      if (!email || !email.includes("@")) {
        return res.status(400).json({ error: "Ingresa un correo válido" });
      }
      // Find existing account or create new one by email
      const user = await storage.findOrCreateUserByEmail(email.toLowerCase().trim());
      // Store in session and explicitly save before responding
      req.session.userId = user.id;
      req.session.isPro = user.isPro ?? false;
      req.session.save((err) => {
        if (err) {
          console.error("Session save error:", err);
          return res.status(500).json({ error: "Error al guardar sesión" });
        }
        res.json(user);
      });
    } catch (e) {
      console.error("Email login error:", e);
      res.status(500).json({ error: "Error al iniciar sesión" });
    }
  });

  // ── Current User ────────────────────────────────────────────────────────────
  app.get("/api/auth/user", async (req, res) => {
    const userId = getEffectiveUserId(req);
    if (!userId) return res.status(401).json({ message: "No autenticado" });
    const user = await storage.getUser(userId);
    if (!user) return res.status(401).json({ message: "Usuario no encontrado" });
    res.json(user);
  });

  // ── Logout ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy(() => {
      res.json({ ok: true });
    });
  });

  // ── Conversations ───────────────────────────────────────────────────────────
  app.get(api.conversations.list.path, async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const convs = await storage.getAllConversations(userId);
      res.json(convs);
    } catch {
      res.status(500).json({ error: "Error al cargar conversaciones" });
    }
  });

  app.get(api.conversations.get.path, async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      const conv = await storage.getConversation(id, userId);
      if (!conv) return res.status(404).json({ error: "Conversación no encontrada" });
      const messages = await storage.getMessagesByConversation(id);
      res.json({ ...conv, messages });
    } catch {
      res.status(500).json({ error: "Error al cargar conversación" });
    }
  });

  app.post(api.conversations.create.path, async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const { title } = req.body;
      const conv = await storage.createConversation(title || "Nueva conversación", userId);
      res.status(201).json(conv);
    } catch {
      res.status(500).json({ error: "Error al crear conversación" });
    }
  });

  app.delete(api.conversations.delete.path, async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      await storage.deleteConversation(id, userId);
      res.status(204).send();
    } catch {
      res.status(500).json({ error: "Error al eliminar conversación" });
    }
  });

  // ── Chat (SSE streaming) ────────────────────────────────────────────────────
  app.post(api.messages.create.path, async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const conversationId = parseInt(req.params.id);
      const { content, model: modelKey, images } = req.body as { content: string; model?: string; images?: string[] };
      const imgs: string[] = Array.isArray(images) ? images.filter((s) => typeof s === "string" && s.startsWith("data:image")) : [];
      if (!content && imgs.length === 0) return res.status(400).json({ error: "El contenido es requerido" });

      const MODEL_MAP: Record<string, string> = {
        fast:  "gpt-4o-mini",
        normal: "gpt-4o",
        think: "o4-mini",
        pro:   "gpt-5.2",
      };
      // Vision-capable model required when images are attached; o4-mini doesn't accept images.
      let model = MODEL_MAP[modelKey || "normal"] || "gpt-4o";
      if (imgs.length > 0 && model === "o4-mini") model = "gpt-4o";

      const conv = await storage.getConversation(conversationId, userId);
      if (!conv) return res.status(404).json({ error: "Conversación no encontrada" });

      // ── Auto-detect image generation requests ────────────────────────────────
      // Detect: verb + image noun OR "imagen/foto de" pattern
      const imageVerbNoun = /\b(genera|crea|haz|hazme|hazle|as|dame|muéstrame|dibuja|pinta|diseña|ilustra|make|create|generate|draw|show)\b.{0,30}\b(imagen|foto|picture|image|photo|ilustración|dibujo)\b/i;
      const imageNounOf = /\b(imagen|foto|picture|image|photo)\s+(de|del|of|para|con)\b/i;
      const isImageRequest = imgs.length === 0 && content && (imageVerbNoun.test(content) || imageNounOf.test(content));

      if (isImageRequest) {
        await storage.createMessage(conversationId, "user", content);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        // Send a "thinking" signal so the frontend shows loading
        res.write(`data: ${JSON.stringify({ content: "⏳ Generando imagen..." })}\n\n`);
        try {
          const imgRes = await openai.images.generate({
            model: "gpt-image-1",
            prompt: content,
            n: 1,
            size: "1024x1024",
            quality: "medium",
          } as any);
          const imageBase64 = (imgRes.data?.[0] as any)?.b64_json;
          if (!imageBase64) throw new Error("No image returned");
          const dataUrl = `data:image/png;base64,${imageBase64}`;
          const assistantContent = `![](${dataUrl})`;
          // Save to DB — frontend will refetch on done signal
          await storage.createMessage(conversationId, "assistant", assistantContent);
          // Overwrite the "thinking" message with a blank so the DB version shows cleanly
          res.write(`data: ${JSON.stringify({ replace: assistantContent })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        } catch (err) {
          console.error("Auto image gen error:", err);
          const errMsg = "No pude generar la imagen. Intenta de nuevo.";
          await storage.createMessage(conversationId, "assistant", errMsg);
          res.write(`data: ${JSON.stringify({ replace: errMsg })}\n\n`);
          res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        }
        res.end();
        return;
      }
      // ─────────────────────────────────────────────────────────────────────────

      const persistedContent = imgs.length
        ? `${content}${content ? "\n\n" : ""}${imgs.map((u) => `![](${u})`).join("\n")}`
        : content;
      await storage.createMessage(conversationId, "user", persistedContent);
      const chatMessages = await storage.getMessagesByConversation(conversationId);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await openai.chat.completions.create({
        model,
        messages: [
          {
            role: "system",
            content: `You are ChatDanis, a helpful and friendly AI assistant created by Danis. Your name is ChatDanis. If anyone asks what your name is, always say your name is ChatDanis. If anyone asks who created you, always answer that you were created by Danis. Always respond in the same language the user writes in. When the user pastes HTML, CSS, or any code and asks you to improve or modify it, return the complete improved code inside a proper markdown code block with the correct language tag (e.g. \`\`\`html). Always return full working code, never partial snippets. Use markdown when helpful.

OPENING APPS: When the user asks you to open, launch, or go to any app, website or service (e.g. "abre YouTube", "open WhatsApp", "go to Gmail", "abre Instagram"), you MUST include the special tag [OPEN_URL:URL] at the very end of your response with the correct URL. Use these URLs:
- YouTube → [OPEN_URL:https://youtube.com]
- WhatsApp → [OPEN_URL:https://web.whatsapp.com]
- Gmail / Google Mail → [OPEN_URL:https://mail.google.com]
- Google → [OPEN_URL:https://google.com]
- Google Maps → [OPEN_URL:https://maps.google.com]
- Google Drive → [OPEN_URL:https://drive.google.com]
- Google Docs → [OPEN_URL:https://docs.google.com]
- Google Translate → [OPEN_URL:https://translate.google.com]
- Instagram → [OPEN_URL:https://instagram.com]
- Facebook → [OPEN_URL:https://facebook.com]
- TikTok → [OPEN_URL:https://tiktok.com]
- Twitter / X → [OPEN_URL:https://x.com]
- Netflix → [OPEN_URL:https://netflix.com]
- Spotify → [OPEN_URL:https://open.spotify.com]
- Amazon → [OPEN_URL:https://amazon.com]
- Wikipedia → [OPEN_URL:https://wikipedia.org]
- ChatGPT → [OPEN_URL:https://chatgpt.com]
- GitHub → [OPEN_URL:https://github.com]
- LinkedIn → [OPEN_URL:https://linkedin.com]
- Zoom → [OPEN_URL:https://zoom.us]
- For any other website or app the user names, use its direct URL.
Always include this tag when the user asks to open/launch something. The app will automatically open it in a new tab.`,
          },
          ...chatMessages.map((m) => {
            // Detect inline image data URLs in user messages and split into vision content parts.
            const imgRegex = /!\[\]\((data:image[^)]+)\)/g;
            const matches = Array.from(m.content.matchAll(imgRegex)).map((mt) => mt[1]);
            if (m.role === "user" && matches.length > 0) {
              const text = m.content.replace(imgRegex, "").trim();
              const parts: any[] = [];
              if (text) parts.push({ type: "text", text });
              for (const url of matches) parts.push({ type: "image_url", image_url: { url } });
              return { role: "user" as const, content: parts };
            }
            return { role: m.role as "user" | "assistant", content: m.content };
          }),
        ],
        stream: true,
      });

      let fullResponse = "";
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          fullResponse += text;
          res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
        }
      }

      await storage.createMessage(conversationId, "assistant", fullResponse);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Error de conexión" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Error al procesar el mensaje" });
      }
    }
  });

  // ── Image Generation ────────────────────────────────────────────────────────
  app.post("/api/generate-image", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
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
        quality: "medium",
      } as any);

      const imageBase64 = response.data[0]?.b64_json;
      if (!imageBase64) return res.status(500).json({ error: "No se pudo generar la imagen" });

      const imageDataUrl = `data:image/png;base64,${imageBase64}`;
      const markdownImage = `![Imagen generada: ${prompt}](${imageDataUrl})`;

      if (conversationId) {
        await storage.createMessage(conversationId, "assistant", markdownImage);
      }

      res.json({ imageUrl: imageDataUrl, markdown: markdownImage });
    } catch (error) {
      console.error("Image gen error:", error);
      res.status(500).json({ error: "Error al generar la imagen" });
    }
  });

  // ── PayPal Client ID ────────────────────────────────────────────────────────
  app.get("/api/paypal/client-id", (req, res) => {
    const clientId = process.env.PAYPAL_CLIENT_ID;
    if (!clientId) return res.status(503).json({ configured: false });
    const isSandbox = process.env.PAYPAL_SANDBOX === "true";
    res.json({ clientId, configured: true, sandbox: isSandbox });
  });

  // ── PayPal: Verify credentials ──────────────────────────────────────────────
  app.get("/api/paypal/verify", async (_req, res) => {
    try {
      const token = await getPayPalAccessToken();
      res.json({ ok: true, sandbox: process.env.PAYPAL_SANDBOX === "true", hasToken: !!token });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e?.message || "unknown" });
    }
  });

  // ── PayPal: Create Order ────────────────────────────────────────────────────
  app.post("/api/subscribe/video/create-order", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
      return res.status(503).json({ error: "Pagos no configurados aún." });
    }
    try {
      const accessToken = await getPayPalAccessToken();
      const response = await fetch(`${getPayPalBase()}/v2/checkout/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            amount: { currency_code: PAYPAL_CURRENCY, value: PAYPAL_VIDEO_PRICE },
            description: "Generación de Video con IA — Acceso Pro",
          }],
          application_context: { user_action: "PAY_NOW", brand_name: "AI Assistant" },
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        console.error(`PayPal create order error ${response.status}:`, body);
        throw new Error(`PayPal order failed (${response.status})`);
      }
      const order = await response.json() as any;
      res.json({ orderID: order.id });
    } catch (error: any) {
      console.error("PayPal create order error:", error?.message || error);
      res.status(500).json({ error: "Error al crear el pago: " + (error?.message || "desconocido") });
    }
  });

  // ── PayPal: Capture Order ───────────────────────────────────────────────────
  app.post("/api/subscribe/video/capture-order", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const { orderID } = req.body;
      if (!orderID) return res.status(400).json({ error: "orderID requerido" });

      const accessToken = await getPayPalAccessToken();
      const response = await fetch(`${getPayPalBase()}/v2/checkout/orders/${orderID}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) throw new Error("Error capturando pago");
      const capture = await response.json() as any;

      if (capture.status === "COMPLETED") {
        await storage.setUserPro(userId, true);
        req.session.isPro = true;
        return res.json({ success: true });
      }

      res.status(400).json({ error: "Pago no completado", status: capture.status });
    } catch (error) {
      console.error("PayPal capture error:", error);
      res.status(500).json({ error: "Error al confirmar el pago" });
    }
  });

  // ── PayPal.me: Confirm Payment (honor system) ───────────────────────────────
  app.post("/api/subscribe/video/confirm", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      await storage.setUserPro(userId, true);
      req.session.isPro = true;
      res.json({ success: true });
    } catch (e) {
      console.error("Confirm payment error:", e);
      res.status(500).json({ error: "Error al activar el acceso" });
    }
  });

  // ── Video Generation (Replicate - wan-2.2-t2v-fast) ───────────────────────
  app.post("/api/generate-video", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: "Se requiere un prompt" });

    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "La generación de video no está configurada. Se necesita una clave de Replicate API." });
    }

    try {
      const response = await fetch(
        "https://api.replicate.com/v1/models/wan-video/wan-2.2-t2v-fast/predictions",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Prefer": "wait",
          },
          body: JSON.stringify({
            input: {
              prompt,
              resolution: "480p",
              duration: 5,
              aspect_ratio: "16:9",
            },
          }),
        }
      );

      if (!response.ok) {
        const body = await response.text();
        console.error("Replicate video error:", response.status, body);
        return res.status(500).json({ error: "Error al iniciar la generación de video" });
      }

      const data = await response.json() as any;
      const predictionId = data.id;
      if (!predictionId) {
        console.error("No prediction id:", JSON.stringify(data).slice(0, 300));
        return res.status(500).json({ error: "Respuesta inesperada del servidor de video" });
      }

      // If already completed (Prefer: wait worked)
      if (data.status === "succeeded" && data.output) {
        const videoUrl = Array.isArray(data.output) ? data.output[0] : data.output;
        return res.json({ taskId: predictionId, status: "SUCCEEDED", videoUrl });
      }

      res.json({ taskId: predictionId, status: "RUNNING", videoUrl: null });
    } catch (error) {
      console.error("Video gen error:", error);
      res.status(500).json({ error: "Error al generar el video" });
    }
  });

  // ── Save direct message ────────────────────────────────────────────────────
  app.post(api.messages.save.path, async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const id = parseInt(req.params.id);
      const { role, content } = req.body;
      if (!role || !content) return res.status(400).json({ error: "role y content son requeridos" });
      const conv = await storage.getConversation(id, userId);
      if (!conv) return res.status(404).json({ error: "Conversación no encontrada" });
      const message = await storage.createMessage(id, role, content);
      res.status(201).json(message);
    } catch {
      res.status(500).json({ error: "Error al guardar el mensaje" });
    }
  });

  // ── Video Task Status (Replicate) ──────────────────────────────────────────
  app.get("/api/video-task", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;

    const taskId = req.query.taskId as string;
    if (!taskId) return res.status(400).json({ error: "taskId requerido" });
    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) return res.status(503).json({ error: "No configurado" });

    try {
      const response = await fetch(
        `https://api.replicate.com/v1/predictions/${taskId}`,
        { headers: { "Authorization": `Bearer ${apiKey}` } }
      );

      if (!response.ok) {
        const body = await response.text();
        console.error("Replicate poll error:", response.status, body.slice(0, 200));
        return res.status(500).json({ error: "Error consultando el estado del video" });
      }

      const data = await response.json() as any;

      if (data.status === "succeeded") {
        const videoUrl = Array.isArray(data.output) ? data.output[0] : data.output;
        return res.json({ status: "SUCCEEDED", videoUrl: videoUrl || null });
      }

      if (data.status === "failed" || data.status === "canceled") {
        console.error("Replicate prediction failed:", data.error);
        return res.json({ status: "FAILED", videoUrl: null });
      }

      // still processing (starting, processing)
      return res.json({ status: "RUNNING", videoUrl: null });
    } catch (error) {
      console.error("Video task poll error:", error);
      res.status(500).json({ error: "Error consultando el video" });
    }
  });

  return httpServer;
}
