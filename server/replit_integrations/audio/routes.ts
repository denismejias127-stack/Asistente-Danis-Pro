import express, { type Express, type Request, type Response } from "express";
import { storage } from "../../storage";
import { speechToText, ensureCompatibleFormat } from "./client";

const audioBodyParser = express.json({ limit: "50mb" });

const POLLINATIONS_URL = "https://text.pollinations.ai/";
type PMsg = { role: "system" | "user" | "assistant"; content: string };
async function* streamPollinations(messages: PMsg[]): AsyncGenerator<string> {
  const resp = await fetch(POLLINATIONS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, model: "openai", stream: true, seed: Math.floor(Math.random() * 99999) }),
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
      try { const t = JSON.parse(d)?.choices?.[0]?.delta?.content; if (t) yield t; } catch { /* skip */ }
    }
  }
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

      const msgs: PMsg[] = [
        { role: "system", content: "You are ChatDanis, a helpful and friendly AI assistant created by Danis. Always respond in the same language the user speaks." },
        ...existingMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
      ];

      let assistantTranscript = "";
      for await (const text of streamPollinations(msgs)) {
        assistantTranscript += text;
        res.write(`data: ${JSON.stringify({ type: "transcript", data: text })}\n\n`);
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
