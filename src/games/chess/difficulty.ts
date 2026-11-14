import type { Difficulty } from "../../core/ai";
export const profiles: Record<
  Difficulty,
  { depth: number; timeMs: number; qDepth: number; advanced: boolean }
> = {
  beginner: { depth: 0, timeMs: 100, qDepth: 0, advanced: false },
  easy: { depth: 2, timeMs: 300, qDepth: 0, advanced: false },
  normal: { depth: 4, timeMs: 1000, qDepth: 3, advanced: false },
  hard: { depth: 6, timeMs: 2000, qDepth: 5, advanced: true },
  expert: { depth: 10, timeMs: 3000, qDepth: 7, advanced: true },
};
