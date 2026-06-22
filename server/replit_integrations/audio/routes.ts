import express, { type Express, type Request, type Response } from "express";
import { storage } from "../../storage";
import { speechToText, ensureCompatibleFormat } from "./client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const audioBodyParser = express.json({ limit: "50mb" });

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI() {
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  return _genAI;
}

function getEffectiveUserId(req: any): string | null {
  return req.session?.userId ?? null;
}

export function registerAudioRoutes(app: Express): void {
  app.post("/api/conversations/:id/voice-messages", audioBodyParser, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = getEffectiveUserId(req);
      if (!userId) return res.status(401).json({ error: "No autenticado" });

      const { audio } = req.body;
      if (!audio) return res.status(400).json({ error: "Se requieren datos de audio (base64)" });

      const conversation = await storage.getConversation(conversationId, userId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });

      const rawBuffer = Buffer.from(audio, "base64");
      const { buffer: audioBuffer, format: inputFormat } = await ensureCompatibleFormat(rawBuffer);
      const userTranscript = await speechToText(audioBuffer, inputFormat);

      await storage.createMessage(conversationId, "user", userTranscript);

      const existingMessages = await storage.getMessagesByConversation(conversationId);

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify({ type: "user_transcript", data: userTranscript })}\n\n`);

      const SYSTEM = "You are ChatDanis, a helpful and friendly AI assistant created by Danis. Always respond in the same language the user speaks.";
      const history = existingMessages.slice(0, -1).map((m) => ({
        role: m.role === "assistant" ? "model" as const : "user" as const,
        parts: [{ text: m.content }],
      }));
      const geminiModel = getGenAI().getGenerativeModel({ model: "gemini-2.0-flash", systemInstruction: SYSTEM });
      const chat = geminiModel.startChat({ history });
      const result = await chat.sendMessageStream(userTranscript);

      let assistantTranscript = "";
      for await (const chunk of result.stream) {
        const text = chunk.text();
        if (text) {
          assistantTranscript += text;
          res.write(`data: ${JSON.stringify({ type: "transcript", data: text })}\n\n`);
        }
      }

      await storage.createMessage(conversationId, "assistant", assistantTranscript);
      res.write(`data: ${JSON.stringify({ type: "done", transcript: assistantTranscript })}\n\n`);
      res.end();
    } catch (error) {
      console.error("Voice message error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ type: "error", error: "Error procesando el audio" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Error procesando el mensaje de voz" });
      }
    }
  });
}
