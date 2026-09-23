export interface RunTokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

const STORAGE_KEY = "context-lab-run-tokens";
const CHANGE_EVENT = "context-lab-run-tokens";

function readMap(): Record<string, RunTokenUsage> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, Partial<RunTokenUsage>>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([id, usage]) => {
        if (!usage || !Number.isFinite(usage.totalTokens)) return [];
        return [[id, {
          promptTokens: Number(usage.promptTokens) || 0,
          completionTokens: Number(usage.completionTokens) || 0,
          totalTokens: Number(usage.totalTokens) || 0,
        }]];
      }),
    );
  } catch {
    return {};
  }
}

export function rememberRunUsage(runId: string, usage: RunTokenUsage | null | undefined) {
  if (!runId || !usage || !Number.isFinite(usage.totalTokens)) return;
  const next = readMap();
  next[runId] = usage;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function listRunUsage(): Record<string, RunTokenUsage> {
  return readMap();
}

export function readRunUsage(runId: string): RunTokenUsage | null {
  return readMap()[runId] ?? null;
}

export function tokenUsageEventName() {
  return CHANGE_EVENT;
}
