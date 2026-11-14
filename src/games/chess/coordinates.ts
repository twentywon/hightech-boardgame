import type { Square } from "chess.js";
export const squares = Array.from(
  { length: 64 },
  (_, i) => `${"abcdefgh"[i % 8]}${8 - Math.floor(i / 8)}` as Square,
);
export const toWorld = (s: Square) => ({
  x: (s.charCodeAt(0) - 97 - 3.5) * 0.78,
  z: (3.5 - (Number(s[1]) - 1)) * 0.78,
});
export function fromWorld(x: number, z: number): Square | null {
  const file = Math.floor(x / 0.78 + 4),
    rank = 7 - Math.floor(z / 0.78 + 4);
  return file >= 0 && file < 8 && rank >= 0 && rank < 8
    ? (`${"abcdefgh"[file]}${rank + 1}` as Square)
    : null;
}
