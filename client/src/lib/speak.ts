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

let currentAudio: HTMLAudioElement | null = null;

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.src = "";
    currentAudio = null;
  }
}

export function checkIsSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused && !currentAudio.ended;
}

export async function speakText(
  rawText: string,
  onStart?: () => void,
  onEnd?: () => void
): Promise<void> {
  stopSpeaking();

  const settings = getVoiceSettings();
  if (!settings.enabled) return;

  const clean = stripMarkdown(rawText).slice(0, 600);
  if (!clean) return;

  const seVoice = VOICE_MAP[settings.profile];
  const url = `/api/tts?voice=${encodeURIComponent(seVoice)}&text=${encodeURIComponent(clean)}`;

  const audio = new Audio(url);
  audio.volume = settings.volume ?? 1.0;
  currentAudio = audio;

  audio.onplay = () => onStart?.();
  audio.onended = () => {
    if (currentAudio === audio) currentAudio = null;
    onEnd?.();
  };
  audio.onerror = () => {
    if (currentAudio === audio) currentAudio = null;
    onEnd?.();
  };

  try {
    await audio.play();
  } catch {
    currentAudio = null;
    onEnd?.();
  }
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
