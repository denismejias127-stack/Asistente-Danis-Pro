import { getVoiceSettings, VoiceProfile } from "@/hooks/use-voice-settings";

export const VOICE_MAP: Record<VoiceProfile, string> = {
  mujer: "Lucia",
  hombre: "Enrique",
  joven: "Mia",
};

export function stripMarkdown(text: string): string {
  return text
    .replace(/!\[.*?\]\(.*?\)/g, "imagen generada")
    .replace(/\[([^\]]+)\]\(.*?\)/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "código")
    .replace(/>\s.+/g, "")
    .replace(/[-*+]\s/g, "")
    .replace(/\n+/g, " ")
    .trim();
}

// Split text into chunks of ~180 chars, breaking at sentence or word boundaries
function splitIntoChunks(text: string, maxLen = 180): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    // Try to break at sentence end (. ! ?) within the limit
    let breakAt = -1;
    for (let i = maxLen; i >= maxLen / 2; i--) {
      if (/[.!?]/.test(remaining[i])) {
        breakAt = i + 1;
        break;
      }
    }

    // Fall back to breaking at a space
    if (breakAt === -1) {
      for (let i = maxLen; i >= maxLen / 2; i--) {
        if (remaining[i] === " ") {
          breakAt = i;
          break;
        }
      }
    }

    // Hard cut if no good break point found
    if (breakAt === -1) breakAt = maxLen;

    chunks.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }

  return chunks.filter(Boolean);
}

let currentAudio: HTMLAudioElement | null = null;
let stopRequested = false;

export function stopSpeaking() {
  stopRequested = true;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

export function checkIsSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused && !currentAudio.ended;
}

async function playChunk(text: string, voice: string, volume: number): Promise<void> {
  return new Promise((resolve) => {
    const url = `/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`;
    const audio = new Audio(url);
    audio.volume = volume;
    currentAudio = audio;

    audio.onended = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve();
    };
    audio.onerror = () => {
      if (currentAudio === audio) currentAudio = null;
      resolve(); // continue to next chunk even on error
    };

    audio.play().catch(() => {
      currentAudio = null;
      resolve();
    });
  });
}

export async function speakText(
  rawText: string,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  stopSpeaking();
  stopRequested = false;

  const settings = getVoiceSettings();
  if (!settings.enabled) return;

  const clean = stripMarkdown(rawText);
  if (!clean) return;

  const chunks = splitIntoChunks(clean);
  if (chunks.length === 0) return;

  const seVoice = VOICE_MAP[settings.profile];
  const volume = settings.volume ?? 1.0;

  onStart?.();

  for (const chunk of chunks) {
    if (stopRequested) break;
    await playChunk(chunk, seVoice, volume);
  }

  onEnd?.();
}

export async function testVoiceProfile(profile: VoiceProfile, volume = 1.0): Promise<void> {
  stopSpeaking();
  const seVoice = VOICE_MAP[profile];
  const labels: Record<VoiceProfile, string> = { mujer: "Mujer", hombre: "Hombre", joven: "Joven" };
  const text = `Hola, soy la voz ${labels[profile]}`;
  const url = `/api/tts?voice=${encodeURIComponent(seVoice)}&text=${encodeURIComponent(text)}`;
  const audio = new Audio(url);
  audio.volume = volume;
  currentAudio = audio;
  audio.onended = () => { if (currentAudio === audio) currentAudio = null; };
  audio.onerror = () => { if (currentAudio === audio) currentAudio = null; };
  await audio.play().catch(() => { currentAudio = null; });
}
