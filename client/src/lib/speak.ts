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
let speechRun = 0;

export function stopSpeaking() {
  stopRequested = true;
  speechRun++;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
}

export function checkIsSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused && !currentAudio.ended;
}

async function prepareAudio(text: string, voice: string, volume: number): Promise<{ audio: HTMLAudioElement; objectUrl: string } | null> {
  const url = `/api/tts?voice=${encodeURIComponent(voice)}&text=${encodeURIComponent(text)}`;
  // Fetch the bytes ourselves so playback never depends on a network request
  // starting between two chunks.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { cache: "force-cache" });
      if (!response.ok) throw new Error(`TTS ${response.status}`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const audio = new Audio(objectUrl);
      audio.preload = "auto";
      audio.volume = volume;
      return { audio, objectUrl };
    } catch {
      if (attempt < 2) await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  return null;
}

async function playPreparedAudio(audio: HTMLAudioElement): Promise<void> {
  return new Promise((resolve) => {
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

function speakNative(text: string, volume: number): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "es-HN";
    utterance.volume = volume;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    window.speechSynthesis.speak(utterance);
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

  const chunks = splitIntoChunks(clean, 150);
  if (chunks.length === 0) return;

  const seVoice = VOICE_MAP[settings.profile];
  const volume = settings.volume ?? 1.0;
  const run = ++speechRun;

  onStart?.();

  // Keep only one request ahead. Loading every chunk at once can make the TTS
  // service reject the final requests, which used to leave the last words out.
  let nextAudio = prepareAudio(chunks[0], seVoice, volume);
  for (let index = 0; index < chunks.length; index++) {
    if (stopRequested || run !== speechRun) break;
    const prepared = await nextAudio;
    // Begin downloading the following piece while this one is playing.
    if (index + 1 < chunks.length) {
      nextAudio = prepareAudio(chunks[index + 1], seVoice, volume);
    }
    if (prepared) {
      await playPreparedAudio(prepared.audio);
      URL.revokeObjectURL(prepared.objectUrl);
    } else {
      // Never silently lose text: use the browser voice if TTS failed.
      await speakNative(chunks[index], volume);
    }
  }

  if (run === speechRun) onEnd?.();
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
