import {
  normalizeAI,
  type AIOptions,
  type Difficulty,
} from "../games/gomoku/ai/difficulty";
import type { Player } from "../games/gomoku/rules";
import { createGame, play, type State } from "../games/gomoku/rules";
export type Mode = "local" | "ai";
export interface Settings {
  sound: boolean;
  quality: "high" | "low";
  top: boolean;
}
export const defaults: Settings = { sound: true, quality: "high", top: false };
export interface Session {
  state: State;
  mode: Mode;
  difficulty?: Difficulty;
  human?: Player;
}
const KEY = "wtg.session.v1";
export function encode(session: Session) {
  return JSON.stringify({
    version: 2,
    difficulty: session.difficulty,
    human: session.human,
    mode: session.mode,
    moves: session.state.moves,
  });
}
export function decode(raw: string): Session | null {
  try {
    const data = JSON.parse(raw);
    if (
      ![1, 2].includes(data.version) ||
      !["local", "ai"].includes(data.mode) ||
      !Array.isArray(data.moves) ||
      data.moves.length > 225
    )
      return null;
    let state = createGame();
    for (const move of data.moves) {
      if (!move || move.player !== state.turn) return null;
      const next = play(state, move);
      if (!next) return null;
      state = next;
    }
    return {
      state,
      mode: data.mode,
      ...(data.difficulty !== undefined || data.human !== undefined
        ? {
            difficulty: normalizeAI(data).difficulty,
            human: data.human === 2 ? (2 as const) : (1 as const),
          }
        : {}),
    };
  } catch {
    return null;
  }
}
export function save(session: Session): boolean {
  try {
    localStorage.setItem(KEY, encode(session));
    return true;
  } catch {
    return false;
  }
}
export function load(): Session | null {
  try {
    return decode(localStorage.getItem(KEY) || "");
  } catch {
    return null;
  }
}
export function getSettings(): Settings {
  try {
    const s = JSON.parse(localStorage.getItem("wtg.settings.v1") || "{}");
    return {
      sound: typeof s.sound === "boolean" ? s.sound : true,
      quality: s.quality === "low" ? "low" : "high",
      top: s.top === true,
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

export function getAIOptions(): AIOptions {
  try {
    const data = JSON.parse(localStorage.getItem("wtg.ai.v1") || "null");
    return normalizeAI(data?.version === 1 ? data : null);
  } catch {
    return normalizeAI(null);
  }
}
export function setAIOptions(options: AIOptions): void {
  try {
    localStorage.setItem(
      "wtg.ai.v1",
      JSON.stringify({ version: 1, ...normalizeAI(options) }),
    );
  } catch {
    /* Keep session playable when storage is unavailable. */
  }
}
