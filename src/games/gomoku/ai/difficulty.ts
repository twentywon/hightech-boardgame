export const difficulties = [
  "beginner",
  "easy",
  "normal",
  "hard",
  "expert",
] as const;
export type Difficulty = (typeof difficulties)[number];
export type ColorChoice = "black" | "white" | "random";
export interface AIOptions {
  difficulty: Difficulty;
  color: ColorChoice;
}
export const defaultAI: AIOptions = { difficulty: "normal", color: "black" };
export const profiles = {
  beginner: {
    label: "입문",
    depth: 0,
    width: 6,
    timeMs: 100,
    defense: 0.55,
    extensions: 0,
    table: false,
  },
  easy: {
    label: "쉬움",
    depth: 0,
    width: 10,
    timeMs: 300,
    defense: 0.95,
    extensions: 0,
    table: false,
  },
  normal: {
    label: "보통",
    depth: 3,
    width: 10,
    timeMs: 1000,
    defense: 1.1,
    extensions: 0,
    table: false,
  },
  hard: {
    label: "어려움",
    depth: 5,
    width: 14,
    timeMs: 2000,
    defense: 1.15,
    extensions: 2,
    table: false,
  },
  expert: {
    label: "전문가",
    depth: 8,
    width: 18,
    timeMs: 3000,
    defense: 1.2,
    extensions: 4,
    table: true,
  },
} as const;
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
