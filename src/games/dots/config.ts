import type { PointConfig } from "../../ui/point-game";
import { GRAPHITE, PENCILS, PaperView, hatch, pencilLine, type PaperGame } from "../paper/view";
import { dots, lineCount, sizeOf, type State } from "./rules";

const REACH = 3.3;
/** Ends of a line, in dot coordinates (column, row). */
function ends(size: number, line: number): [[number, number], [number, number]] {
  const vertical = size * (size + 1);
  if (line < vertical) {
    const r = Math.floor(line / size),
      c = line % size;
    return [[c, r], [c + 1, r]];
  }
  const r = Math.floor((line - vertical) / (size + 1)),
    c = (line - vertical) % (size + 1);
  return [[c, r], [c, r + 1]];
}
const at = (size: number, [c, r]: [number, number]) => ({ x: (c / size - 0.5) * REACH * 2, z: (r / size - 0.5) * REACH * 2 });
/** Middles of the lines, where they are tapped. */
export const dotsPoints = (size: number) =>
  Array.from({ length: lineCount(size) }, (_, line) => {
    const [a, b] = ends(size, line).map((e) => at(size, e));
    return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
  });
const paper: PaperGame<State> = {
  half: 4.1,
  points: (s) => dotsPoints(s.size),
  reach: (s) => (REACH / s.size) * 0.95,
  ply: (s) => s.ply,
  paint(ctx, px, unit, s, fresh) {
    const cell = ((REACH * 2) / s.size) * unit,
      newest = s.last?.line;
    // Boxes: hatched in their owner's colour with an initial.
    s.boxes.forEach((owner, box) => {
      if (owner === null) return;
      const corner = px(...Object.values(at(s.size, [box % s.size, Math.floor(box / s.size)])) as [number, number]),
        share = s.last?.closed.includes(box) ? fresh : 1;
      ctx.beginPath();
      ctx.rect(corner[0] + cell * 0.1, corner[1] + cell * 0.1, cell * 0.8, cell * 0.8);
      hatch(ctx, [corner[0], corner[1], cell, cell], PENCILS[owner], cell * 0.14, share);
    });
    // Faint guides for the lines not drawn yet, then the drawn ones in pencil.
    s.lines.forEach((owner, line) => {
      const [a, b] = ends(s.size, line).map((e) => px(...(Object.values(at(s.size, e)) as [number, number])));
      if (owner === null) {
        ctx.strokeStyle = "rgba(74, 79, 87, 0.16)";
        ctx.lineWidth = unit * 0.03;
        ctx.setLineDash([unit * 0.06, unit * 0.09]);
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
        ctx.setLineDash([]);
        return;
      }
      const grow = line === newest ? fresh : 1;
      pencilLine(ctx, a, [a[0] + (b[0] - a[0]) * grow, a[1] + (b[1] - a[1]) * grow], PENCILS[owner], unit * 0.11);
    });
    ctx.fillStyle = GRAPHITE;
    for (let r = 0; r <= s.size; r++)
      for (let c = 0; c <= s.size; c++) {
        ctx.beginPath();
        ctx.arc(...px(...(Object.values(at(s.size, [c, r])) as [number, number])), unit * 0.085, 0, Math.PI * 2);
        ctx.fill();
      }
  },
};
export const dotsConfig: PointConfig<State> = {
  game: dots,
  view: (host, quality) => new PaperView(host, quality, paper),
  colors: PENCILS as [string, string],
  keyPoints: (s) => dotsPoints(s.size),
  name: "도츠 앤 박시스",
  english: "Dots and Boxes",
  number: "NO. 14 — PENCIL LINES",
  intro: `<p>공책에 점을 찍고 색연필로 선을 긋는 놀이.<br>네모의 네 번째 변을 그으면 그 네모는 내 것입니다.</p><ul class="rule-list"><li>차례마다 이웃한 두 점을 선으로 잇습니다</li><li>네모를 완성하면 한 번 더 긋습니다</li><li>네모를 더 많이 가진 쪽이 승리</li></ul>`,
  meta: "2인 · 네모 3×3 · 5×5 · 7×7",
  art: `<div class="pg-mini dots">${"<i></i>".repeat(6)}</div><span>CLOSE THE BOX</span>`,
  artClass: "paper-art",
  artLabel: "도츠 앤 박시스 공책 미리보기",
  tableLabel: "THE NOTEBOOK",
  tableNote: (variant) => `네모 ${sizeOf(variant)} × ${sizeOf(variant)}`,
  rulesTitle: "네 번째 변을 긋는 사람이 네모를 갖습니다",
  rules: `<ol><li>빨강 색연필이 먼저 긋습니다. 차례마다 <b>가로나 세로로 이웃한 두 점</b>을 선 하나로 잇습니다.</li><li>내가 그은 선으로 네모의 <b>네 변이 모두</b> 그어지면 그 네모는 내 것이 되고 내 색으로 칠해집니다.</li><li>네모를 하나라도 완성하면 <b>한 번 더</b> 긋습니다. 선 하나로 네모 둘을 한꺼번에 완성할 수도 있습니다.</li><li>선을 모두 그으면 끝나고, 네모를 더 많이 가진 쪽이 이깁니다.</li></ol><p>세 변이 그어진 네모는 다음에 긋는 사람이 가져가므로, 세 번째 변을 긋지 않고 버티는 것이 요령입니다. 긋고 싶은 자리(두 점 사이)를 누르면 됩니다. <b>무르기</b>는 직전 선을 지웁니다. 저장은 없습니다.</p>`,
  sides: ["빨강", "파랑"],
  variantLabel: "판 크기",
  variants: [
    { value: "3", label: "3 × 3" },
    { value: "5", label: "5 × 5" },
    { value: "7", label: "7 × 7" },
  ],
  startWord: "공책 펴기",
  help: "마우스·터치: 두 점 사이를 누르면 선을 긋습니다<br>키보드: 판을 선택하고 방향키·Enter",
};
