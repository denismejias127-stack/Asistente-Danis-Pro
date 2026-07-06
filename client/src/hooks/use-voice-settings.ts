import { useState } from "react";

export type VoiceProfile = "mujer" | "hombre" | "joven";

export interface VoiceSettings {
  profile: VoiceProfile;
  enabled: boolean;
  volume: number; // 0.0 – 1.0
}

const STORAGE_KEY = "chatdanis_voice_settings";
const NAME_KEY = "chatdanis_user_name";

const defaults: VoiceSettings = { profile: "mujer", enabled: true, volume: 1.0 };

export function useVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettings>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
    } catch {
      return defaults;
    }
  });

  const updateSettings = (next: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const merged = { ...prev, ...next };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    });
  };

  return { settings, updateSettings };
}

export function useUserName() {
  const [name, setNameState] = useState<string>(() => {
    return localStorage.getItem(NAME_KEY) || "";
  });

  const setName = (n: string) => {
    localStorage.setItem(NAME_KEY, n);
    setNameState(n);
  };

  return { name, setName };
}

export function getUserName(): string {
  return localStorage.getItem(NAME_KEY) || "";
}

export function getVoiceSettings(): VoiceSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export interface VoiceProfileConfig {
  rate: number;
  pitch: number;
  preferFemale: boolean;
  preferLang: string;
  label: string;
  emoji: string;
}

export const VOICE_PROFILES: Record<VoiceProfile, VoiceProfileConfig> = {
  mujer: {
    rate: 1.0,
    pitch: 1.15,
    preferFemale: true,
    preferLang: "es",
    label: "Mujer",
    emoji: "👩",
  },
  hombre: {
    rate: 0.9,
    pitch: 0.7,
    preferFemale: false,
    preferLang: "es",
    label: "Hombre",
    emoji: "👨",
  },
  joven: {
    rate: 1.2,
    pitch: 1.4,
    preferFemale: true,
    preferLang: "es",
    label: "Joven",
    emoji: "🧑",
  },
};
