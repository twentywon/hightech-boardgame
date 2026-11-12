import {
  difficulties,
  normalizeAI,
  type AIOptions,
  type Difficulty,
} from "./ai";
export type Mode = "local" | "ai";
export interface Settings {
  sound: boolean;
  quality: "high" | "low";
  top: boolean;
  /** Coordinate letters and numbers on the Gomoku board. */
  labels: boolean;
}
export const defaults: Settings = {
  sound: true,
  quality: "high",
  top: false,
  labels: true,
};
export function getSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("wtg.settings.v1") || "{}");
    return {
      sound: typeof s.sound === "boolean" ? s.sound : true,
      quality: s.quality === "low" ? "low" : "high",
      top: s.top === true,
      labels: s.labels !== false,
    };
  } catch {
    return { ...defaults };
  }
}
export function setSettings(s: Settings) {
  try {
    localStorage.setItem("wtg.settings.v1", JSON.stringify(s));
  } catch {
    /* Storage may be disabled; gameplay remains available. */
  }
}

export function getAIOptions(key = "wtg.ai.v1"): AIOptions {
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    return normalizeAI(data?.version === 1 ? data : null);
  } catch {
    return normalizeAI(null);
  }
}
export function setAIOptions(options: AIOptions, key = "wtg.ai.v1"): void {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 1, ...normalizeAI(options) }),
    );
  } catch {
    /* Keep session playable when storage is unavailable. */
  }
}

export interface Record {
  win: number;
  loss: number;
  draw: number;
}
export type Stats = { [D in Difficulty]: Record };
const tally = (v: unknown) =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
/** Results against the computer per difficulty. Unreadable data starts over. */
export function getStats(key = "wtg.gomoku.stats.v1"): Stats {
  let raw: unknown = null;
  try {
    const data = JSON.parse(localStorage.getItem(key) || "null");
    if (data?.version === 1) raw = data;
  } catch {
    /* Storage may be disabled or corrupted. */
  }
  const stats = {} as Stats;
  for (const d of difficulties) {
    const r = (raw as { [k: string]: Partial<Record> } | null)?.[d];
    stats[d] = { win: tally(r?.win), loss: tally(r?.loss), draw: tally(r?.draw) };
  }
  return stats;
}
export function addResult(
  difficulty: Difficulty,
  result: keyof Record,
  key = "wtg.gomoku.stats.v1",
): Stats {
  const stats = getStats(key);
  stats[difficulty][result]++;
  try {
    localStorage.setItem(key, JSON.stringify({ version: 1, ...stats }));
  } catch {
    /* Keep the game playable when storage is unavailable. */
  }
  return stats;
}
