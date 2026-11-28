import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { SIZES, hint, lights, type State } from "./rules";
import { cellAt } from "./layout";
import { LIGHT_COLORS, LightsView } from "./view";

/** A small picture of a stage: the pegboard of its size in its wooden frame, a bulb at every place, a cross of them lit. */
function boardArt(size: number) {
  const cell = 104 / size,
    mid = Math.floor(size / 2),
    lit = (r: number, c: number) => Math.abs(r - mid) + Math.abs(c - mid) <= 1 || (r + c * 2) % 5 === 0;
  let out = `<rect x="10" y="10" width="120" height="120" rx="10" fill="#d9b48a"/><rect x="16" y="16" width="108" height="108" rx="6" fill="#b48c63"/>`;
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const x = (18 + c * cell + cell / 2).toFixed(1),
        y = (18 + r * cell + cell / 2).toFixed(1),
        on = lit(r, c),
        radius = cell * 0.3;
      out += `<circle cx="${x}" cy="${y}" r="${(cell * 0.34).toFixed(1)}" fill="#2a2623"/>`;
      if (on) out += `<circle cx="${x}" cy="${y}" r="${(radius * 2).toFixed(1)}" fill="url(#lamp-halo-${size})"/>`;
      out += `<circle cx="${x}" cy="${y}" r="${radius.toFixed(1)}" fill="${on ? "#ffd277" : "#dfe8ea"}" stroke="${on ? "#e79a2a" : "#8f9a9e"}" stroke-width="1"/>`;
    }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="lamp-halo-${size}"><stop offset="0" stop-color="#ffe9a8" stop-opacity="0.9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs><rect x="4" y="4" width="132" height="132" rx="14" fill="#3a2d24"/>${out}</svg>`;
}
export const lightsConfig: PointConfig<State> = {
  game: lights,
  solo: true,
  showMovable: false,
  view: (host, quality) => new LightsView(host, quality),
  colors: LIGHT_COLORS,
  keyPoints: (state) => state.on.map((_, i) => cellAt(state.size, i)),
  contact: (sound) => sound.tile(3),
  puzzle: { hint, hintText: "힌트 — 금색 고리가 쳐진 전구를 누르세요." },
  stagesFirst: true,
  stages: SIZES.map((size, i) => ({ value: String(i + 1), name: `${size}×${size}`, note: `불 ${size * size}개`, art: boardArt(size) })),
  // No count of moves made or of the fewest (the user asked).
  tallyHtml: () => ["", ""],
  name: "불 켜기",
  english: "Lights On",
  number: "NO. 44 — EVERY LAMP LIT",
  intro: `<p>작업대 위, 전구가 빼곡히 꽂힌 네모난 판.<br>하나를 누르면 그 불과 위아래·좌우의 불이 함께 뒤집힙니다. 모두 켜세요. '라이츠 아웃'으로 알려진 퍼즐을 거꾸로 한 것입니다.</p>`,
  meta: "1인 · 3×3부터 7×7 · 문제는 무작위",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>EVERY LAMP LIT</span>`,
  artClass: "hexa-art",
  artLabel: "불 켜기 미리보기",
  tableLabel: "THE LAMP PANEL",
  tableNote: (variant) => {
    const size = SIZES[Math.max(1, Math.min(SIZES.length, Number(variant) || 1)) - 1];
    return `${size}×${size} · 무작위 문제`;
  },
  rulesTitle: "누르면 이웃까지 뒤집힙니다",
  rules:
    part("기본 규칙", steps("판의 불 가운데 몇이 꺼져 있습니다.", "불 하나를 누르면 <b>그 불과 위·아래·왼쪽·오른쪽 불</b>이 함께 뒤집힙니다. 켜진 불은 꺼지고 꺼진 불은 켜집니다.", "가장자리에서는 판 안에 있는 이웃만 뒤집힙니다.", "불을 <b>모두 켜면</b> 성공입니다.")) +
    part("판과 문제", table(["판의 크기", "앉을 때와 <b>새 게임</b>에서 3×3부터 7×7까지 고릅니다."], ["무작위 문제", "문제는 할 때마다 새로 만들어집니다. 다 켜진 판에서 불을 눌러 만든 것이라 반드시 풀립니다."])) +
    part("오른쪽 판", table(["힌트", "가장 빨리 켜는 길에서 눌러야 할 불 하나에 금색 고리가 쳐집니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다."], ["다른 퍼즐 · 다음 스테이지", "같은 크기의 새 문제가 나옵니다."])) +
    part("처음이라면", notes("같은 불을 <b>두 번 누르면 제자리</b>입니다. 그러니 어떤 불이든 한 번 누르거나 안 누르거나 둘 중 하나입니다.", "누르는 <b>순서는 상관없습니다</b>. 어떤 불들을 누를지만 정하면 됩니다.", "맨 윗줄부터 차례로: 윗줄에 꺼진 불이 있으면 바로 아래 칸을 눌러 켜면서 내려갑니다. 마지막 줄에 남은 불은 맨 윗줄을 다시 눌러 맞춥니다.")),
  help: "마우스·터치: 불을 누릅니다<br>키보드: 방향키로 고르고 Enter",
  sides: ["나", ""],
  startWord: "등불 판 앞에 앉기",
};
