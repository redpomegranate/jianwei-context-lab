import { useEffect, useState } from "react";

export const AI_MODELS = [
  { id: "deepseek-flash", label: "DeepSeek Flash", detail: "更快，适合整理事实、问题和预测候选" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", detail: "更慢一些，适合复杂情境" },
] as const;

export const CUSTOM_MODEL = "custom";
const STORAGE_KEY = "context-lab-ai-settings";
const CHANGE_EVENT = "context-lab-ai-settings";

export interface AiSettings {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export const defaultAiSettings: AiSettings = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-flash",
};

export function readAiSettings(): AiSettings {
  if (typeof window === "undefined") return defaultAiSettings;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAiSettings;
    const parsed = JSON.parse(raw) as Partial<AiSettings>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      baseUrl: typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
        ? parsed.baseUrl
        : defaultAiSettings.baseUrl,
      model: typeof parsed.model === "string" && parsed.model.trim()
        ? parsed.model
        : defaultAiSettings.model,
    };
  } catch {
    return defaultAiSettings;
  }
}

export function writeAiSettings(settings: AiSettings) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function aiAnalyzeFields(settings: AiSettings) {
  const fields: { model?: string; baseUrl?: string; apiKey?: string } = {};
  const model = settings.model.trim();
  const baseUrl = settings.baseUrl.trim();
  const apiKey = settings.apiKey.trim();
  if (model) fields.model = model;
  if (baseUrl) fields.baseUrl = baseUrl;
  if (apiKey) fields.apiKey = apiKey;
  return fields;
}

export function useAiSettings() {
  const [settings, setSettings] = useState<AiSettings>(readAiSettings);

  useEffect(() => {
    const sync = () => setSettings(readAiSettings());
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const save = (next: AiSettings) => {
    writeAiSettings(next);
    setSettings(next);
  };

  return { settings, save };
}
