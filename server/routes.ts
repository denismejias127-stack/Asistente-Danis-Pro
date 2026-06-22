import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { registerAudioRoutes } from "./replit_integrations/audio/routes";
import { registerLiveChatRoutes } from "./live-chat";
// Extend session type
declare module "express-session" {
  interface SessionData {
    userId?: string;
    isPro?: boolean;
  }
}

const POLLINATIONS_URL = "https://text.pollinations.ai/";

type PollinationsMsg = { role: "system" | "user" | "assistant"; content: string };

async function* streamPollinations(messages: PollinationsMsg[], model = "openai-large"): AsyncGenerator<string> {
  const resp = await fetch(POLLINATIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model, stream: true, seed: Math.floor(Math.random() * 99999) }),
  });
  if (!resp.ok || !resp.body) throw new Error(`Pollinations error: ${resp.status}`);
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const d = line.slice(6).trim();
      if (d === "[DONE]") return;
      try {
        const text = JSON.parse(d)?.choices?.[0]?.delta?.content;
        if (text) yield text;
      } catch { /* skip malformed chunk */ }
    }
  }
}

const MODEL_MAP: Record<string, string> = {
  fast:   "openai",
  normal: "openai-large",
  think:  "openai-large",
  pro:    "openai-large",
};

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
      const user = await storage.findOrCreateUserByEmail(email.toLowerCase().trim());
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
  // Rutas corregidas con strings limpios para evitar errores de parámetros en Express moderno
  app.get("/api/conversations", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const convs = await storage.getAllConversations(userId);
      res.json(convs);
    } catch {
      res.status(500).json({ error: "Error al cargar conversaciones" });
    }
  });

  app.get("/api/conversations/:id", async (req, res) => {
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

  app.post("/api/conversations", async (req, res) => {
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

  app.delete("/api/conversations/:id", async (req, res) => {
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
  app.post("/api/conversations/:id/messages", async (req, res) => {
    const userId = requireUser(req, res);
    if (!userId) return;
    try {
      const conversationId = parseInt(req.params.id);
      const { content, model: modelKey, images } = req.body as { content: string; model?: string; images?: string[] };
      const imgs: string[] = Array.isArray(images) ? images.filter((s) => typeof s === "string" && s.startsWith("data:image")) : [];
      if (!content && imgs.length === 0) return res.status(400).json({ error: "El contenido es requerido" });

      const model = MODEL_MAP[modelKey || "normal"] || "openai-large";

      const conv = await storage.getConversation(conversationId, userId);
      if (!conv) return res.status(404).json({ error: "Conversación no encontrada" });

      const imageVerbNoun = /\b(genera|crea|haz|hazme|hazle|as|dame|muéstrame|dibuja|pinta|diseña|ilustra|make|create|generate|draw|show)\b.{0,30}\b(imagen|foto|picture|image|photo|ilustración|dibujo)\b/i;
      const imageNounOf = /\b(imagen|foto|picture|image|photo)\s+(de|del|of|para|con)\b/i;
      const isImageRequest = imgs.length === 0 && content && (imageVerbNoun.test(content) || imageNounOf.test(content));

      if (isImageRequest) {
        await storage.createMessage(conversationId, "user", content);
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.write(`data: ${JSON.stringify({ content: "⏳ Generando imagen..." })}\n\n`);
        try {
          const seed = Math.floor(Math.random() * 1000000);
          const encodedPrompt = encodeURIComponent(content);
          const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&enhance=false&seed=${seed}`;
          const assistantContent = `![](${imageUrl})`;
          await storage.createMessage(conversationId, "assistant", assistantContent);
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

      const persistedContent = imgs.length
        ? `${content}${content ? "\n\n" : ""}${imgs.map((u) => `![](${u})`).join("\n")}`
        : content;
      await storage.createMessage(conversationId, "user", persistedContent);
      const chatMessages = await storage.getMessagesByConversation(conversationId);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const SYSTEM_PROMPT = `You are ChatDanis, a helpful and friendly AI assistant created by Danis. Your name is ChatDanis. If anyone asks what your name is, always say your name is ChatDanis. If anyone asks who created you, always answer that you were created by Danis. Always respond in the same language the user writes in. When the user pastes HTML, CSS, or any code and asks you to improve or modify it, return the complete improved code inside a proper markdown code block with the correct language tag (e.g. \`\`\`html). Always return full working code, never partial snippets. Use markdown when helpful.`;

      const imgRegex = /!\[\]\((data:image[^)]+|https?:[^)]+)\)/g;
      const pollinationsMsgs: PollinationsMsg[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...chatMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: m.content.replace(imgRegex, "[imagen]").trim(),
        })),
      ];

      let fullResponse = "";
      for await (const text of streamPollinations(pollinationsMsgs, model)) {
        fullResponse += text;
        res.write(`data: ${JSON.stringify({ content: text })}\n\n`);
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

      const seed = Math.floor(Math.random() * 1000000);
      const encodedPrompt = encodeURIComponent(prompt);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=512&height=512&nologo=true&enhance=false&seed=${seed}`;
      const markdownImage = `![Imagen generada: ${prompt}](${imageUrl})`;

      if (conversationId) {
        await storage.createMessage(conversationId, "assistant", markdownImage);
      }

      res.json({ imageUrl, markdown: markdownImage });
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
      return res.status(503).json({ error: "La generación de video no está configurada." });
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
            input: { prompt, resolution: "480p", duration: 5, aspect_ratio: "16:9" },
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
      if (!predictionId) return res.status(500).json({ error: "Respuesta inesperada del servidor" });

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
  app.post("/api/conversations/:id/messages/save", async (req, res) => {
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

      if (!response.ok) return res.status(500).json({ error: "Error consultando el video" });
      const data = await response.json() as any;

      if (data.status === "succeeded") {
        const videoUrl = Array.isArray(data.output) ? data.output[0] : data.output;
        return res.json({ status: "SUCCEEDED", videoUrl: videoUrl || null });
      }

      if (data.status === "failed" || data.status === "canceled") {
        return res.json({ status: "FAILED", videoUrl: null });
      }

      return res.json({ status: "RUNNING", videoUrl: null });
    } catch (error) {
      console.error("Video task poll error:", error);
      res.status(500).json({ error: "Error consultando el video" });
    }
  });

  return httpServer;
    }
