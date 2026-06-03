import type { Express } from "express";
import express from "express";
import OpenAI from "openai";
import { ensureCompatibleFormat, speechToText } from "./replit_integrations/audio/client";

const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: "https://api.groq.com/openai/v1",
});

const liveBodyParser = express.json({ limit: "50mb" });

type LiveTurn = { role: "user" | "assistant"; content: string };

export function registerLiveChatRoutes(app: Express) {
  // Speech-to-text only (dictation for text chat)
  app.post("/api/transcribe", liveBodyParser, async (req, res) => {
    const userId = (req as any).session?.userId;
    if (!userId) return res.status(401).json({ error: "No autenticado" });
    try {
      const { audio } = req.body as { audio: string };
      if (!audio) return res.status(400).json({ error: "Falta el audio" });
      const rawBuffer = Buffer.from(audio, "base64");
      const { buffer, format } = await ensureCompatibleFormat(rawBuffer);
      const text = (await speechToText(buffer, format)).trim();
      res.json({ text });
    } catch (e) {
      console.error("Transcribe error:", e);
      res.status(500).json({ error: "Error al transcribir" });
    }
  });

  app.post("/api/live-chat", liveBodyParser, async (req, res) => {
    const userId = (req as any).session?.userId;
    if (!userId) return res.status(401).json({ error: "No autenticado" });

    try {
      const { audio, image, history, voice = "alloy" } = req.body as {
        audio: string;
        image?: string;
        history?: LiveTurn[];
        voice?: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
      };

      if (!audio) return res.status(400).json({ error: "Falta el audio" });

      const rawBuffer = Buffer.from(audio, "base64");
      const { buffer: audioBuffer, format } = await ensureCompatibleFormat(rawBuffer);
      const userText = (await speechToText(audioBuffer, format)).trim();

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify({ type: "user_transcript", data: userText })}\n\n`);

      if (!userText) {
        res.write(`data: ${JSON.stringify({ type: "done", transcript: "" })}\n\n`);
        return res.end();
      }

      const systemMsg = {
        role: "system" as const,
        content:
          "Eres ChatDanis, un asistente conversacional en vivo. Hablas como una persona, breve y natural (1-3 frases por respuesta). Si el usuario te muestra algo por la cámara, descríbelo y reacciona a ello. Responde siempre en el idioma del usuario.",
      };

      const userContent: any[] = [{ type: "text", text: userText }];
      if (image) {
        userContent.push({
          type: "image_url",
          image_url: { url: image.startsWith("data:") ? image : `data:image/jpeg;base64,${image}` },
        });
      }

      const historyMsgs = (history || []).slice(-8).map((t) => ({
        role: t.role,
        content: t.content,
      }));

      const textResp = await openai.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [systemMsg, ...historyMsgs, { role: "user", content: userText }],
      });
      const assistantText = textResp.choices[0]?.message?.content?.toString().trim() || "";
      res.write(`data: ${JSON.stringify({ type: "transcript", data: assistantText })}\n\n`);
      res.write(`data: ${JSON.stringify({ type: "done", transcript: assistantText })}\n\n`);
      res.end();
    } catch (e: any) {
      console.error("Live chat error:", e);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: e?.message || "Error" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Error en el chat en vivo" });
      }
    }
  });
}
