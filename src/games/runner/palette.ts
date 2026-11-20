/**
 * 네모 러너's colours, a set to each stage (our own): the room's single-hue ground with its dither and pale squares,
 * the frame's two alternating tiles, and the stacks' block with its light and dark bevel. Free of Vite-only imports,
 * so that the stage cards and the browser tests may use it.
 */
export interface Palette {
  ground: string;
  dither: string;
  pale: string;
  tileA: string;
  tileB: string;
  block: string;
  hi: string;
  lo: string;
}
export const PALETTES: Palette[] = [
  { ground: "#7fd6a4", dither: "#70c895", pale: "#b9efcf", tileA: "#1f3b2c", tileB: "#f4f1e4", block: "#2f8f5b", hi: "#5fc28a", lo: "#1d5e3a" },
  { ground: "#6aaee8", dither: "#5ea0db", pale: "#b8dcfb", tileA: "#11294a", tileB: "#ffffff", block: "#2c5f9e", hi: "#5a8fd0", lo: "#1a3d6a" },
  { ground: "#f2a878", dither: "#e8996a", pale: "#fbd6bc", tileA: "#5b2a17", tileB: "#fff4e6", block: "#c4643a", hi: "#e98e5f", lo: "#8a3f20" },
  { ground: "#a993e6", dither: "#9c85da", pale: "#d9cdfa", tileA: "#2b1f4d", tileB: "#f7f2ff", block: "#6a50b8", hi: "#9278dc", lo: "#45317f" },
  { ground: "#a3a8ad", dither: "#979ca1", pale: "#d2d5d8", tileA: "#ff7a1a", tileB: "#1b1b1b", block: "#5c6166", hi: "#868b90", lo: "#3a3e42" },
  { ground: "#46bdb4", dither: "#3cb0a7", pale: "#a6e6e0", tileA: "#0f3b3a", tileB: "#f4e04d", block: "#1f7f79", hi: "#45a9a2", lo: "#125451" },
  { ground: "#e98aa6", dither: "#df7c99", pale: "#f9c9d7", tileA: "#4d1131", tileB: "#ffffff", block: "#b2456b", hi: "#d76e92", lo: "#7a2546" },
  { ground: "#7a4fb3", dither: "#6f45a8", pale: "#a888d8", tileA: "#1a0f30", tileB: "#ead6ff", block: "#3d2470", hi: "#5d3e96", lo: "#24134a" },
  { ground: "#2e3350", dither: "#282c47", pale: "#4a5178", tileA: "#ffcc33", tileB: "#14141f", block: "#4a527e", hi: "#6c75a6", lo: "#2a2f4c" },
  { ground: "#b8343e", dither: "#ab2c36", pale: "#de7a80", tileA: "#1c0a0f", tileB: "#ffd23f", block: "#6e1820", hi: "#94303a", lo: "#45090f" },
];
export const paletteOf = (stage: number) => PALETTES[Math.max(1, Math.min(PALETTES.length, stage)) - 1];
/** Each pair of holes has its colour, so that the two ends of a portal are told apart from another pair's. */
export const PORTAL_COLORS = ["#39e6ff", "#ff5bd6", "#b6ff3a"];
/** The flying squares: plain ones black and white by turns, the homing one red, the spinning four yellow, the falling blue, the boss's dark. */
export const SQUARE_COLORS = { plain: ["#ffffff", "#1d1b2e"], homing: "#ff4d5e", spin: "#ffd23f", rain: "#4dc3ff", shot: "#1d1b2e" };
