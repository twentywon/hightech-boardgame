export const difficulties = [
  "beginner",
  "easy",
  "normal",
  "hard",
  "expert",
] as const;
export type Difficulty = (typeof difficulties)[number];
export const difficultyLabels = {
  beginner: "입문",
  easy: "쉬움",
  normal: "보통",
  hard: "어려움",
  expert: "전문가",
} as const;
export type ColorChoice = "black" | "white" | "random";
export interface AIOptions {
  difficulty: Difficulty;
  color: ColorChoice;
}
export const defaultAI: AIOptions = { difficulty: "normal", color: "black" };
export function normalizeAI(value: unknown): AIOptions {
  const s = value as Partial<AIOptions> | null;
  return {
    difficulty:
      s && difficulties.includes(s.difficulty as Difficulty)
        ? s.difficulty!
        : "normal",
    color:
      s && ["black", "white", "random"].includes(s.color!) ? s.color! : "black",
  };
}
export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
