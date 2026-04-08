import express, { type Express, type Request, type Response } from "express";
import { storage } from "../../storage";
import { openai, speechToText, ensureCompatibleFormat } from "./client";

const audioBodyParser = express.json({ limit: "50mb" });

function getEffectiveUserId(req: any): string | null {
  return req.session?.userId ?? null;
}

export function registerAudioRoutes(app: Express): void {
  app.post("/api/conversations/:id/voice-messages", audioBodyParser, async (req: Request, res: Response) => {
    try {
      const conversationId = parseInt(req.params.id);
      const userId = getEffectiveUserId(req);
      if (!userId) return res.status(401).json({ error: "No autenticado" });

      const { audio, voice = "alloy" } = req.body;
      if (!audio) return res.status(400).json({ error: "Se requieren datos de audio (base64)" });

      const conversation = await storage.getConversation(conversationId, userId);
      if (!conversation) return res.status(404).json({ error: "Conversación no encontrada" });

      const rawBuffer = Buffer.from(audio, "base64");
      const { buffer: audioBuffer, format: inputFormat } = await ensureCompatibleFormat(rawBuffer);
      const userTranscript = await speechToText(audioBuffer, inputFormat);

      await storage.createMessage(conversationId, "user", userTranscript);

      const existingMessages = await storage.getMessagesByConversation(conversationId);
      const chatHistory = [
        { role: "system" as const, content: "You are a helpful, friendly assistant created by Danis. If anyone asks who created you, who made you, or who is your creator, always answer that you were created by Danis. Always respond in the same language the user speaks." },
        ...existingMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.write(`data: ${JSON.stringify({ type: "user_transcript", data: userTranscript })}\n\n`);

      const stream = await openai.chat.completions.create({
        model: "gpt-audio",
        modalities: ["text", "audio"],
        audio: { voice, format: "pcm16" },
        messages: chatHistory,
        stream: true,
      });

      let assistantTranscript = "";
      for await (const chunk of stream) {
        const delta = chunk.choices?.[0]?.delta as any;
        if (!delta) continue;
        if (delta?.audio?.transcript) {
          assistantTranscript += delta.audio.transcript;
          res.write(`data: ${JSON.stringify({ type: "transcript", data: delta.audio.transcript })}\n\n`);
        }
        if (delta?.audio?.data) {
          res.write(`data: ${JSON.stringify({ type: "audio", data: delta.audio.data })}\n\n`);
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
