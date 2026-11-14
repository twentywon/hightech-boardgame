export const profiles = {
  beginner: { depth: 0, width: 4, timeMs: 100 },
  easy: { depth: 0, width: 64, timeMs: 300 },
  normal: { depth: 4, width: 8, timeMs: 1000 },
  hard: { depth: 6, width: 12, timeMs: 2000 },
  expert: { depth: 12, width: 64, timeMs: 3000 },
} as const;
