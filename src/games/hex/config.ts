import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { GRAPHITE, PENCILS, PaperView, hatch, type PaperGame } from "../paper/view";
import { hex, sizeOf, type State } from "./rules";

// The board runs from edge to edge of the page.
const REACH = 3.95,
  ROOT3 = Math.sqrt(3);
/** Radius of a cell and the centres of all cells, for a board of `size`. */
export function hexLayout(size: number) {
  // The rhombus is 1.5·size − 0.5 cells wide.
  const radius = (REACH * 2) / ((size * 1.5 - 0.5) * ROOT3 + 0.4),
    width = radius * ROOT3,
    points = Array.from({ length: size * size }, (_, cell) => {
      const r = Math.floor(cell / size),
        c = cell % size;
      return {
        x: (c + r * 0.5 - (size - 1) * 0.75) * width,
        z: (r - (size - 1) / 2) * radius * 1.5,
      };
    });
  return { radius, points };
}
const corners = (cx: number, cy: number, r: number) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r] as [number, number];
  });
const paper: PaperGame<State> = {
  half: 4.1,
  corner: true,
  points: (s) => hexLayout(s.size).points,
  reach: (s) => hexLayout(s.size).radius * 0.95,
  ply: (s) => s.ply,
  paint(ctx, px, unit, s, fresh) {
    const { radius, points } = hexLayout(s.size),
      r = radius * unit,
      newest = s.effect?.to;
    points.forEach((p, cell) => {
      const [cx, cy] = px(p.x, p.z),
        shape = corners(cx, cy, r),
        owner = s.cells[cell],
        row = Math.floor(cell / s.size),
        col = cell % s.size;
      const outline = () => {
        ctx.beginPath();
        shape.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      };
      outline();
      if (owner !== null) {
        hatch(ctx, [cx - r, cy - r, r * 2, r * 2], PENCILS[owner], r * 0.2, cell === newest ? fresh : 1);
        // Hatching leaves its last stroke as the path: trace the cell again.
        outline();
      }
      ctx.strokeStyle = GRAPHITE;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = unit * 0.025;
      ctx.stroke();
      ctx.globalAlpha = 1;
      // The four edges of the board are edged in the colour that has to join them.
      const edge = (from: number, to: number, color: string) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = unit * 0.075;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(...shape[from]);
        ctx.lineTo(...shape[(from + 1) % 6]);
        ctx.lineTo(...shape[to]);
        ctx.stroke();
      };
      if (row === 0) edge(3, 5, PENCILS[0]);
      if (row === s.size - 1) edge(0, 2, PENCILS[0]);
      if (col === 0) edge(1, 3, PENCILS[1]);
      if (col === s.size - 1) edge(4, 0, PENCILS[1]);
    });
  },
};
export const hexConfig: PointConfig<State> = {
  game: hex,
  view: (host, quality) => new PaperView(host, quality, paper),
  colors: PENCILS as [string, string],
  keyPoints: (s) => hexLayout(s.size).points,
  name: "헥스",
  english: "Hex",
  number: "NO. 15 — CONNECT",
  intro: `<p>공책에 그린 육각 판을 색연필로 한 칸씩 칠합니다.<br>마주 보는 내 두 변을 먼저 이으면 이깁니다.</p>`,
  meta: "2인 · 7×7 · 9×9 · 11×11",
  art: `<div class="pg-mini hexa">${"<i></i>".repeat(7)}</div><span>EDGE TO EDGE</span>`,
  artClass: "paper-art",
  artLabel: "헥스 공책 미리보기",
  tableLabel: "THE NOTEBOOK",
  tableNote: (variant) => `${sizeOf(variant)} × ${sizeOf(variant)}`,
  rulesTitle: "내 두 변을 먼저 이으세요",
  rules:
    part("기본 규칙", steps("<b>빨강 색연필이 먼저</b> 칠합니다.", "차례마다 <b>빈칸 하나</b>를 내 색으로 칠합니다. 한번 칠한 칸은 바뀌지 않습니다.", "내 두 변을 내 칸으로 끊기지 않게 먼저 이으면 이깁니다.")) +
    part("이을 변", table(["빨강", "빨간 선이 그어진 <b>위쪽 변과 아래쪽 변</b>"], ["파랑", "파란 선이 그어진 <b>왼쪽 변과 오른쪽 변</b>"], ["이웃", "칸은 여섯 방향으로 이웃합니다. 네 귀퉁이 칸은 두 변에 모두 닿습니다."])) +
    part("처음이라면", notes("판이 가득 차면 반드시 한쪽이 이어집니다. 무승부가 없습니다.", "상대의 길을 막는 것이 곧 내 길을 잇는 것입니다.", "한 칸 띄워 두 길로 이을 수 있게 두면 상대가 끊기 어렵습니다.", "가운데가 양쪽 변에 모두 가까워 좋은 자리입니다.")) +
    part("그 밖에", notes("먼저 두는 쪽이 유리합니다. 선수를 바꾸는 규칙은 넣지 않았습니다.", "새 게임 설정에서 판 크기와 컴퓨터 난이도를 고릅니다.", "<b>무르기</b>는 직전 수를 지웁니다.", "저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  sides: ["빨강", "파랑"],
  variantLabel: "판 크기",
  variants: [
    { value: "7", label: "7 × 7" },
    { value: "9", label: "9 × 9" },
    { value: "11", label: "11 × 11" },
  ],
  startWord: "공책 펴기",
  help: "마우스·터치: 빈칸을 누르면 칠합니다<br>키보드: 판을 선택하고 방향키·Enter",
};
