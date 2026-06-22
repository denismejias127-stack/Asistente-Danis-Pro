import { Buffer } from "node:buffer";
import { spawn } from "child_process";
import { writeFile, unlink } from "fs/promises";
import { randomUUID } from "crypto";
import { tmpdir } from "os";
import { join } from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";

let _genAI: GoogleGenerativeAI | null = null;
function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) _genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
  return _genAI;
}

// Stub kept for backward compat — not used with Gemini
export const openai = {} as any;

export type AudioFormat = "wav" | "mp3" | "webm" | "mp4" | "ogg" | "unknown";

/**
 * Detect audio format from buffer magic bytes.
 * Supports: WAV, MP3, WebM (Chrome/Firefox), MP4/M4A/MOV (Safari/iOS), OGG
 */
export function detectAudioFormat(buffer: Buffer): AudioFormat {
  if (buffer.length < 12) return "unknown";

  // WAV: RIFF....WAVE
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    return "wav";
  }
  // WebM: EBML header
  if (buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return "webm";
  }
  // MP3: ID3 tag or frame sync
  if (
    (buffer[0] === 0xff && (buffer[1] === 0xfb || buffer[1] === 0xfa || buffer[1] === 0xf3)) ||
    (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33)
  ) {
    return "mp3";
  }
  // MP4/M4A/MOV: ....ftyp (Safari/iOS records in these containers)
  if (buffer[4] === 0x66 && buffer[5] === 0x74 && buffer[6] === 0x79 && buffer[7] === 0x70) {
    return "mp4";
  }
  // OGG: OggS
  if (buffer[0] === 0x4f && buffer[1] === 0x67 && buffer[2] === 0x67 && buffer[3] === 0x53) {
    return "ogg";
  }
  return "unknown";
}

/**
 * Convert any audio/video format to WAV using ffmpeg.
 * Uses temp files instead of pipes because video containers (MP4/MOV)
 * require seeking to find the audio track.
 */
export async function convertToWav(audioBuffer: Buffer): Promise<Buffer> {
  const inputPath = join(tmpdir(), `input-${randomUUID()}`);
  const outputPath = join(tmpdir(), `output-${randomUUID()}.wav`);

  try {
    // Write input to temp file (required for video containers that need seeking)
    await writeFile(inputPath, audioBuffer);

    // Run ffmpeg with file paths
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        "-i", inputPath,
        "-vn",              // Extract audio only (ignore video track)
        "-f", "wav",
        "-ar", "16000",     // 16kHz sample rate (good for speech)
        "-ac", "1",         // Mono
        "-acodec", "pcm_s16le",
        "-y",               // Overwrite output
        outputPath,
      ]);

      ffmpeg.stderr.on("data", () => {}); // Suppress logs
      ffmpeg.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg exited with code ${code}`));
      });
      ffmpeg.on("error", reject);
    });

    // Read converted audio
    return await readFile(outputPath);
  } finally {
    // Clean up temp files
    await unlink(inputPath).catch(() => {});
    await unlink(outputPath).catch(() => {});
  }
}

/**
 * Auto-detect and convert audio to OpenAI-compatible format.
 * - WAV/MP3: Pass through (already compatible)
 * - WebM/MP4/OGG: Convert to WAV via ffmpeg
 */
export async function ensureCompatibleFormat(
  audioBuffer: Buffer
): Promise<{ buffer: Buffer; format: "wav" | "mp3" }> {
  const detected = detectAudioFormat(audioBuffer);
  if (detected === "wav") return { buffer: audioBuffer, format: "wav" };
  if (detected === "mp3") return { buffer: audioBuffer, format: "mp3" };
  // Convert WebM, MP4, OGG, or unknown to WAV
  const wavBuffer = await convertToWav(audioBuffer);
  return { buffer: wavBuffer, format: "wav" };
}

/**
 * Voice Chat: User speaks, LLM responds with audio (audio-in, audio-out).
 * Uses gpt-audio model via Replit AI Integrations.
 * Note: Browser records WebM/opus - convert to WAV using ffmpeg before calling this.
 */
// TTS not available with Gemini — stubs kept for interface compatibility
export async function voiceChat(): Promise<{ transcript: string; audioResponse: Buffer }> {
  return { transcript: "", audioResponse: Buffer.alloc(0) };
}
export async function voiceChatStream(): Promise<AsyncIterable<{ type: "transcript" | "audio"; data: string }>> {
  return (async function* () {})();
}
export async function textToSpeech(): Promise<Buffer> {
  return Buffer.alloc(0);
}
export async function textToSpeechStream(): Promise<AsyncIterable<string>> {
  return (async function* () {})();
}

/**
 * Speech-to-Text: Transcribes audio using dedicated transcription model.
 * Uses gpt-4o-mini-transcribe for accurate transcription.
 */
/**
 * Speech-to-Text: Transcribes audio using Gemini multimodal.
 */
export async function speechToText(
  audioBuffer: Buffer,
  format: "wav" | "mp3" | "webm" | "mp4" | "ogg" | "unknown" = "wav"
): Promise<string> {
  const mimeMap: Record<string, string> = {
    wav: "audio/wav", mp3: "audio/mpeg", webm: "audio/webm",
    mp4: "audio/mp4", ogg: "audio/ogg", unknown: "audio/wav",
  };
  const mimeType = mimeMap[format] || "audio/wav";
  const model = getGenAI().getGenerativeModel({ model: "gemini-2.0-flash" });
  const result = await model.generateContent([
    { inlineData: { data: audioBuffer.toString("base64"), mimeType } },
    "Transcribe this audio exactly. Return only the transcribed text, nothing else.",
  ]);
  return result.response.text().trim();
}
