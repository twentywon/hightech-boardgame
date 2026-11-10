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
}
const KEY = "wtg.session.v1";
export function encode(session: Session) {
  return JSON.stringify({
    version: 1,
    mode: session.mode,
    moves: session.state.moves,
  });
}
export function decode(raw: string): Session | null {
  try {
    const data = JSON.parse(raw);
    if (
      data.version !== 1 ||
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
    return { state, mode: data.mode };
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
