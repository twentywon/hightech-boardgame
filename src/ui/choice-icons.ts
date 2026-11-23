/**
 * Pictures for the choices of the settings windows (the user asked: what a small picture can show, as the player's
 * colour, is shown as one). Drawn here in SVG, nothing fetched. `choiceIcon` gives the picture for an option of a
 * list (by the list's id, the option's value and words, and the game), `only` when the picture says it all and the
 * words are kept for readers alone; `modeIcon` gives one for the mode buttons (alone, two at one screen, against the
 * computer). Lines and shapes drawn in `currentColor` follow the button's ink, so a pressed button turns them white.
 */
import { layoutPicture } from "../games/push/art";
export interface ChoiceIcon {
  svg: string;
  only: boolean;
}
const svg = (w: number, h: number, body: string) => `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg" focusable="false">${body}</svg>`;
/** A go or Reversi stone, black or white, with an edge that shows on a light or a dark button. */
const stone = (x: number, y: number, r: number, black: boolean) =>
  black
    ? `<circle cx="${x}" cy="${y}" r="${r}" fill="#17181a" stroke="#8b8b8b" stroke-width="1.2"/><circle cx="${x - r * 0.35}" cy="${y - r * 0.38}" r="${r * 0.3}" fill="#ffffff30"/>`
    : `<circle cx="${x}" cy="${y}" r="${r}" fill="#f6f3ea" stroke="#8c8678" stroke-width="1.2"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.32}" fill="#ffffffaa"/>`;
/** A chess king, white or black. */
const king = (x: number, black: boolean) => {
  const fill = black ? "#17181a" : "#f6f3ea",
    edge = black ? "#9a9a9a" : "#4a463e";
  return `<g transform="translate(${x} 1)" fill="${fill}" stroke="${edge}" stroke-width="1.1" stroke-linejoin="round"><rect x="9.2" y="0.5" width="1.6" height="6"/><rect x="7.2" y="2.2" width="5.6" height="1.6"/><path d="M10 6.5c2.6 0 4.4 1.6 4.4 3.4 0 1.4-.9 2.4-1.6 3.3L13.6 20H6.4l.8-6.8C6.5 12.3 5.6 11.3 5.6 9.9 5.6 8.1 7.4 6.5 10 6.5z"/><rect x="4.6" y="20" width="10.8" height="3.4" rx="1"/></g>`;
};
/** An octagonal janggi piece with its letter, 楚 in green or 漢 in red, or a formation's 馬 and 象. */
const piece = (x: number, y: number, r: number, letter: string, ink: string) => {
  const points = Array.from({ length: 8 }, (_, k) => {
    const a = (Math.PI / 8) * (2 * k + 1);
    return `${(x + Math.cos(a) * r).toFixed(2)},${(y + Math.sin(a) * r).toFixed(2)}`;
  }).join(" ");
  return `<polygon points="${points}" fill="#f2e4c4" stroke="#8a6d3e" stroke-width="1"/><text x="${x}" y="${y + r * 0.42}" font-size="${r * 1.15}" font-weight="700" text-anchor="middle" fill="${ink}" font-family="'Noto Serif KR','Noto Sans KR',serif">${letter}</text>`;
};
/** Someone, in the button's ink. */
const person = (x: number, y: number, s = 1) =>
  `<circle cx="${x}" cy="${y - 4.2 * s}" r="${3.1 * s}" fill="currentColor"/><path d="M${x - 5.6 * s} ${y + 6.5 * s}c0-4.4 2.5-6.6 ${5.6 * s}-6.6s${5.6 * s} 2.2 ${5.6 * s} 6.6z" fill="currentColor"/>`;
/** A computer: a screen on a stand, in the button's ink. */
const computer = (x: number, y: number, s = 1) =>
  `<rect x="${x - 6 * s}" y="${y - 7 * s}" width="${12 * s}" height="${8.5 * s}" rx="${1.4 * s}" fill="none" stroke="currentColor" stroke-width="${1.8 * s}"/><path d="M${x - 2 * s} ${y + 3.2 * s}h${4 * s}M${x} ${y + 1.6 * s}v${1.6 * s}" stroke="currentColor" stroke-width="${1.8 * s}" stroke-linecap="round"/><circle cx="${x}" cy="${y - 2.8 * s}" r="${1.3 * s}" fill="currentColor"/>`;
/** `n` of something side by side, centred in a picture `w` wide. */
const row = (n: number, w: number, gap: number, draw: (x: number) => string) => Array.from({ length: n }, (_, k) => draw(w / 2 + (k - (n - 1) / 2) * gap)).join("");
const people = (n: number) => svg(48, 26, row(n, 48, n > 4 ? 8 : n > 3 ? 10.5 : 12, (x) => person(x, 15, n > 4 ? 0.68 : n > 3 ? 0.85 : 1)));
// Up to three at full size; four or five (hold'em's tables) smaller and closer, so that they fit the picture.
const computers = (n: number) => svg(48, 26, row(n, 48, n > 4 ? 9.4 : n > 3 ? 11.5 : 15, (x) => computer(x, 14, n > 4 ? 0.66 : n > 3 ? 0.8 : 1)));
/** Rising bars, `n` of `of` filled: how hard the computer plays. */
const bars = (n: number, of: number) =>
  svg(
    6 * of + 2,
    18,
    Array.from({ length: of }, (_, k) => `<rect x="${1 + k * 6}" y="${16 - (k + 1) * (14 / of)}" width="4" height="${(k + 1) * (14 / of)}" rx="1" fill="currentColor" opacity="${k < n ? 1 : 0.22}"/>`).join(""),
  );
/** Hwatu cards fanned, `n` of them. */
const cards = (n: number) =>
  svg(
    44,
    28,
    Array.from({ length: n }, (_, k) => {
      const turn = (k - (n - 1) / 2) * 16;
      return `<g transform="rotate(${turn} 22 30)"><rect x="16" y="3" width="12" height="18" rx="2" fill="#b3261e" stroke="#fff" stroke-width="1.2"/><rect x="18.3" y="5.3" width="7.4" height="13.4" rx="1" fill="none" stroke="#f3d27a" stroke-width="0.9"/></g>`;
    }).join(""),
  );
/** Playing cards turned up from a stock, `n` of them fanned: how many a turn brings in Klondike. */
const turned = (n: number) =>
  svg(
    44,
    28,
    Array.from({ length: n }, (_, k) => {
      const turn = (k - (n - 1) / 2) * 15;
      return `<g transform="rotate(${turn} 22 30)"><rect x="16" y="3" width="12" height="18" rx="2" fill="#fbfaf6" stroke="#8c8678" stroke-width="1.1"/><path d="M22 8.6l2.4 3.4-2.4 3.4-2.4-3.4z" fill="#d33"/></g>`;
    }).join(""),
  );
/** A three by three board with marks, for tic-tac-toe's modes. */
const grid = (inner: string, size = 26, x0 = 2, y0 = 1) => {
  const c = size / 3,
    lines = [1, 2].map((k) => `<path d="M${x0 + k * c} ${y0}v${size}M${x0} ${y0 + k * c}h${size}" stroke="currentColor" stroke-width="1.4" opacity=".75"/>`).join("");
  return lines + inner;
};
const cross = (x: number, y: number, r: number, extra = "") => `<path d="M${x - r} ${y - r}L${x + r} ${y + r}M${x + r} ${y - r}L${x - r} ${y + r}" stroke="#d8402f" stroke-width="2.2" stroke-linecap="round"${extra}/>`;
const ring = (x: number, y: number, r: number, extra = "") => `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="#2f6fd0" stroke-width="2.2"${extra}/>`;
const TTT: Record<string, string> = {
  classic: svg(30, 28, grid(cross(6.3, 5.3, 2.6) + ring(15, 14, 3) + cross(23.7, 22.7, 2.6))),
  vanish: svg(30, 28, grid(cross(6.3, 5.3, 2.6, ' opacity=".25"') + cross(15, 14, 2.6) + ring(23.7, 5.3, 3))),
  misere: svg(30, 28, grid(cross(6.3, 14, 2.6) + cross(15, 14, 2.6) + cross(23.7, 14, 2.6) + `<path d="M3 14H27" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2"/><path d="M19 2l9 9M28 2l-9 9" stroke="#c0392b" stroke-width="2.2" stroke-linecap="round"/>`)),
  ultimate: svg(30, 28, Array.from({ length: 9 }, (_, k) => `<rect x="${2 + (k % 3) * 9.2}" y="${1 + Math.floor(k / 3) * 9}" width="7.8" height="7.6" rx="1" fill="none" stroke="currentColor" stroke-width="1.1" opacity="${k === 4 ? 1 : 0.6}"/>`).join("") + cross(15.8, 14.8, 2)),
  cube: svg(30, 28, [0, 1, 2].map((k) => `<path d="M${6 + k * 2} ${22 - k * 8}l6-5h14l-6 5z" fill="none" stroke="currentColor" stroke-width="1.3" opacity="${0.55 + k * 0.2}"/>`).join("") + cross(17, 5.4, 1.7)),
};
/** The dots of a dots and boxes board of `boxes` to a side: one more dot than boxes along each side. */
const dots = (boxes: number) => {
  const n = boxes + 1;
  return svg(26, 26, Array.from({ length: n * n }, (_, k) => `<circle cx="${3 + ((k % n) * 20) / (n - 1)}" cy="${3 + (Math.floor(k / n) * 20) / (n - 1)}" r="${n > 6 ? 0.85 : n > 4 ? 1.1 : 1.5}" fill="currentColor"/>`).join(""));
};
/** Card suits, in the order a spider game brings them in. */
const suits = (n: number) => {
  const all: [string, string][] = [["♠", "currentColor"], ["♥", "#d33"], ["♦", "#d33"], ["♣", "currentColor"]],
    shown = n === 1 ? [all[0]] : n === 2 ? [all[0], all[1]] : all;
  return svg(48, 24, shown.map(([s, fill], k) => `<text x="${24 + (k - (shown.length - 1) / 2) * 11}" y="18" font-size="16" text-anchor="middle" fill="${fill}" font-family="'Noto Sans Symbols 2','Segoe UI Symbol','DejaVu Sans',sans-serif">${s}&#xFE0E;</text>`).join(""));
};
/** 님's two modes: rings standing on a rod over a base, in fives of walnut and maple; and a scoop of ice cream in a cup. */
const NIM: Record<string, string> = {
  nim: svg(
    44,
    26,
    `<rect x="2" y="21" width="40" height="3.4" rx="1.2" fill="#e9cfa2" stroke="#9a7444" stroke-width=".8"/><rect x="38.6" y="5" width="2.6" height="17" rx="1" fill="#e9cfa2" stroke="#9a7444" stroke-width=".8"/><path d="M8 12.6H39" stroke="#c9a46e" stroke-width="1.6" stroke-linecap="round"/>` +
      Array.from({ length: 8 }, (_, k) => `<rect x="${17.4 + k * 2.6}" y="5.4" width="2.3" height="14.6" rx="1.1" fill="${k < 3 ? "#f0dcb4" : "#6b3f22"}" stroke="#4a2c16" stroke-width=".5"/>`).join(""),
  ),
  "31": svg(
    30,
    28,
    `<path d="M8.6 15.5h12.8l-2 10.5h-8.8z" fill="#bfe8da" stroke="#5aa58c" stroke-width="1"/><path d="M9.6 19.4h10.8" stroke="#fff" stroke-width="1.6"/><path d="M6.8 15.8c0-5.4 3.6-8.6 8.2-8.6s8.2 3.2 8.2 8.6c-2.6 1.4-13.8 1.4-16.4 0z" fill="#fbe58a" stroke="#c9a23c" stroke-width="1"/><path d="M10 12.4c1.6-1.2 3-1.6 4.6-1.4M14.8 9.6c1.6.2 3.2 1.2 4 2.6" fill="none" stroke="#e2c25a" stroke-width="1"/><circle cx="15.6" cy="5.4" r="2.6" fill="#d21f33"/><path d="M15.8 2.9c.6-1.4 1.8-2.2 3-2.2" fill="none" stroke="#5d3a1c" stroke-width=".9" stroke-linecap="round"/>`,
  ),
};
/** 당구's two kinds: a blue carom cloth in a wooden rail with its balls, two reds for 4구 and one for 3쿠션. */
const caromTable = (balls: string[]) =>
  svg(44, 26, `<rect x="1.5" y="3" width="41" height="21" rx="3" fill="#8a5a3a"/><rect x="4.5" y="6" width="35" height="15" rx="1" fill="#2b5fae"/>` + balls.map((fill, k) => `<circle cx="${11 + k * 7.4}" cy="${k % 2 ? 11 : 16}" r="2.7" fill="${fill}" stroke="#00000055" stroke-width=".6"/>`).join(""));
const CAROM: Record<string, string> = { four: caromTable(["#f6f3ea", "#f2c230", "#d0302a", "#d0302a"]), three: caromTable(["#f6f3ea", "#f2c230", "#d0302a"]) };
/**
 * 사격's three places: an orange clay flying over the grass with its trail, a booth's round targets lit blue and
 * yellow, a deer under trees by the water; and its BB tiers as the bronze, silver and gold coins of the price card.
 */
const SHOOT: Record<string, string> = {
  clay: svg(48, 26, `<rect x="0" y="19" width="48" height="7" rx="1.5" fill="#6f9a43"/><path d="M6 19 Q18 4 34 7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="2 2.2" opacity=".6"/><ellipse cx="36" cy="7.5" rx="6.4" ry="2.6" fill="#ff6a1c" stroke="#7a2c08" stroke-width=".8"/><rect x="3" y="15" width="7" height="4" rx="1" fill="#3c6b3a"/>`),
  bb: svg(48, 26, `<rect x="1" y="1" width="46" height="24" rx="3" fill="#121626"/>${[9, 19, 29, 39].map((x, i) => `<circle cx="${x}" cy="9" r="3.6" fill="${i === 1 ? "#ffcf2e" : i === 3 ? "#2f7bff" : "#3a4152"}" stroke="#8b93a3" stroke-width=".8"/>`).join("")}${[14, 24, 34].map((x, i) => `<circle cx="${x}" cy="18.5" r="3.6" fill="${i === 0 ? "#2f7bff" : "#3a4152"}" stroke="#8b93a3" stroke-width=".8"/>`).join("")}`),
  hunt: svg(48, 26, `<rect x="0" y="0" width="48" height="26" rx="3" fill="#f3b27e" opacity=".35"/><path d="M0 20 Q24 15 48 20 V26 H0z" fill="#56703a"/><ellipse cx="34" cy="22" rx="12" ry="2.4" fill="#5a6fa0"/><path d="M4 20 L8 6 L12 20z M10 20 L14 9 L18 20z" fill="#2a4424"/><path d="M22 13 h9 q2 0 2.6-2 l1.4-3 l1 1 l-1 3.4 v2.6 h-1.2 v5 h-1 v-4.6 h-8 v4.6 h-1 v-5 q-1.6-.6-1.8-2z" fill="#6b4426"/><path d="M33.6 8 l-1.2-3 M34.6 7.6 l.8-3.2 M32.8 5.6 l-1.6-.6 M35.2 5 l1.4-.8" stroke="#5a3a20" stroke-width=".8" stroke-linecap="round"/>`),
};
const coin = (fill: string, edge: string) => svg(26, 26, `<circle cx="13" cy="13" r="10.5" fill="${fill}" stroke="${edge}" stroke-width="2"/><circle cx="13" cy="13" r="6.5" fill="none" stroke="${edge}" stroke-width="1" opacity=".7"/><circle cx="10" cy="9.5" r="2.4" fill="#ffffff" opacity=".45"/>`);
const TIER_COINS: Record<string, string> = { "0": coin("#c0773a", "#7a4519"), "1": coin("#d9dde3", "#8b929c"), "2": coin("#f2c230", "#a77a0a") };
/** A die, for a choice left to chance. */
const die =svg(26, 26, `<rect x="4" y="4" width="18" height="18" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/>${[[9, 9], [17, 9], [13, 13], [9, 17], [17, 17]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.7" fill="currentColor"/>`).join("")}`);
const LEVEL_BARS: Record<string, [number, number]> = { beginner: [1, 5], easy: [2, 5], normal: [3, 5], hard: [4, 5], expert: [5, 5] };
const POINT_LEVEL: Record<string, [number, number]> = { easy: [1, 3], normal: [2, 3], hard: [3, 3] };
export function choiceIcon(select: string, value: string, label: string, game = ""): ChoiceIcon | null {
  // The player's colour: stones, kings, the two janggi sides; either of them for 무작위.
  if (select === "ai-color" || select === "rv-color")
    return value === "random" ? { svg: svg(40, 26, stone(15, 13, 9, true) + stone(25, 13, 9, false)), only: false } : { svg: svg(26, 26, stone(13, 13, 10, value === "black")), only: true };
  if (/-color$/.test(select) && select !== "jg-color")
    return value === "random" ? { svg: svg(36, 26, king(-1, true) + king(15, false)), only: false } : { svg: svg(20, 26, king(0, value === "black")), only: true };
  if (select === "jg-color")
    return value === "random"
      ? { svg: svg(40, 26, piece(14, 13, 10, "楚", "#1f7a3a") + piece(26, 13, 10, "漢", "#c0392b")), only: false }
      : { svg: svg(26, 26, piece(13, 13, 11, value === "black" ? "楚" : "漢", value === "black" ? "#1f7a3a" : "#c0392b")), only: false };
  // How hard the computer plays: bars, with the word.
  if (/difficulty$/.test(select) && LEVEL_BARS[value]) return { svg: bars(...LEVEL_BARS[value]), only: false };
  if (select === "pg-level" && POINT_LEVEL[value]) return { svg: bars(...POINT_LEVEL[value]), only: false };
  // How many: people, and computers.
  if (select === "tour-humans" || select === "yut-players" || select === "cq-humans" || (select === "pg-set-people" && game === "hex-conquest")) return { svg: people(Number(value)), only: true };
  if (select === "cq-opponents" && Number(value) > 0) return { svg: computers(Number(value)), only: true };
  if (select === "pg-set-computers" && game === "hex-conquest" && Number(value) > 0) return { svg: computers(Number(value)), only: true };
  if ((select === "tour-opponents" || select === "bg-opponents" || select === "pg-set-rivals") && Number(value) > 0) return { svg: computers(Number(value)), only: true };
  // A janggi formation: its four pieces in order, 馬 and 象.
  if (select === "jg-formation" || select === "jg-formation-2")
    return { svg: svg(52, 16, [...value].map((c, k) => piece(7 + k * 12.6, 8, 6.4, c === "N" ? "馬" : "象", "#3b2a14")).join("")), only: false };
  if (select === "sp-suits") return { svg: suits(Number(value)), only: false };
  if (select === "kl-draw") return { svg: turned(Number(value)), only: false };
  if (select === "bg-variant" && /두 장|세 장/.test(label)) return { svg: cards(label.includes("세 장") ? 3 : 2), only: false };
  if (select === "pg-variant" && game === "tic-tac-toe" && TTT[value]) return { svg: TTT[value], only: false };
  if (select === "pg-variant" && game === "dots-and-boxes" && Number(value) > 1) return { svg: dots(Number(value)), only: false };
  if (select === "pg-variant" && game === "nim" && NIM[value]) return { svg: NIM[value], only: false };
  if (select === "pg-variant" && game === "carom-billiards" && CAROM[value]) return { svg: CAROM[value], only: false };
  if (select === "pg-variant" && game === "shooting" && SHOOT[value]) return { svg: SHOOT[value], only: false };
  if (select === "pg-set-tier" && game === "shooting" && TIER_COINS[value]) return { svg: TIER_COINS[value], only: false };
  // 구슬 밀기's starting set-ups: the hexagon with the two sides' marbles where they begin.
  if (select === "pg-variant" && game === "marble-push") return { svg: layoutPicture(value), only: false };
  // Who moves first against the computer: me, the computer, or a throw of a die.
  if (select === "pg-set-first") return value === "me" ? { svg: svg(26, 26, person(13, 14)), only: false } : value === "computer" ? { svg: svg(26, 26, computer(13, 14)), only: false } : value === "random" ? { svg: die, only: false } : null;
  return null;
}
/**
 * The mode buttons: one person alone, two (or more) at one screen, a person against the computer. No letters as text:
 * the picture sits inside the radio's label, whose words find the radio ("VS" as text read "VS컴퓨터 대전").
 */
export function modeIcon(value: string, label: string): string | null {
  if (value === "solo") return svg(48, 26, person(24, 15));
  if (value === "local") return /2[–-]4/.test(label) ? people(3) : people(2);
  if (value === "ai") return svg(48, 26, person(16, 15) + `<path d="M19.6 11.6 L21.6 17 L23.6 11.6 M29 12.4 C28.4 11.5 25.6 11.4 25.5 12.9 C25.4 14.3 29 14.1 28.9 15.7 C28.8 17.3 25.8 17.2 25.2 16.2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` + computer(34, 14));
  return null;
}
