import { createGame, play, type State, type Player } from "./rules";
import { getAIOptions, setAIOptions, type Mode } from "../../core/storage";
import { normalizeAI, type AIOptions, type Difficulty } from "../../core/ai";
export interface Session {
  state: State;
  mode: Mode;
  difficulty: Difficulty;
  human: Player;
}
export const SESSION_KEY = "wtg.reversi.session.v1",
  OPTIONS_KEY = "wtg.reversi.ai.v1";
export const getOptions = () => getAIOptions(OPTIONS_KEY);
export const setOptions = (options: AIOptions) =>
  setAIOptions(options, OPTIONS_KEY);
export function encode(s: Session) {
  return JSON.stringify({
    version: 1,
    game: "reversi",
    moves: s.state.moves,
    mode: s.mode,
    difficulty: s.difficulty,
    human: s.human,
  });
}
export function decode(raw: string): Session | null {
  try {
    const s = JSON.parse(raw);
    if (
      s.version !== 1 ||
      s.game !== "reversi" ||
      !["local", "ai"].includes(s.mode) ||
      !Array.isArray(s.moves) ||
      s.moves.length > 60
    )
      return null;
    let state = createGame();
    for (const move of s.moves) {
      if (!move || move.player !== state.turn) return null;
      const next = play(state, move);
      if (!next) return null;
      state = next;
    }
    return {
      state,
      mode: s.mode,
      difficulty: normalizeAI(s).difficulty,
      human: s.human === 2 ? 2 : 1,
    };
  } catch {
    return null;
  }
}
export function load() {
  try {
    return decode(localStorage.getItem(SESSION_KEY) || "");
  } catch {
    return null;
  }
}
export function save(s: Session) {
  try {
    localStorage.setItem(SESSION_KEY, encode(s));
    return true;
  } catch {
    return false;
  }
}
