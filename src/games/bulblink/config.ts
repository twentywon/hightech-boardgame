import { capturing } from "../../ui/banner";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { cellAt } from "./layout";
import { STAGES, bulbLink, hint, refusal, stageOf, type State } from "./rules";
import { BULB_COLORS, BulbLinkView } from "./view";

/**
 * A small picture of a stage: the pegboard of the stage's size with its sockets, a few bulbs lit along a red wire and
 * others still dark, and from the third stage on the grey boxes.
 */
function benchArt(stage: number) {
  const n = STAGES[stage - 1].size,
    cell = 104 / n,
    x0 = 70 - (n * cell) / 2 + cell / 2,
    at = (r: number, c: number) => [x0 + c * cell, x0 + r * cell] as const,
    // Bulbs of each picture (row, column), the first ones lit along the wire (which passes over empty sockets only), and the boxes.
    pictures: { bulbs: [number, number][]; lit: number; boxes: [number, number][] }[] = [
      { bulbs: [[0, 0], [0, 3], [3, 3], [1, 1], [4, 1]], lit: 3, boxes: [] },
      { bulbs: [[1, 0], [1, 4], [4, 1], [4, 4], [0, 2], [5, 2], [2, 2]], lit: 3, boxes: [] },
      { bulbs: [[0, 1], [0, 5], [4, 5], [4, 1], [2, 3], [6, 3], [6, 6], [2, 0]], lit: 4, boxes: [[2, 6], [5, 2]] },
      { bulbs: [[0, 0], [0, 6], [4, 2], [4, 6], [7, 6], [7, 1], [2, 3], [5, 4], [1, 7]], lit: 5, boxes: [[2, 1], [6, 3], [1, 3]] },
      { bulbs: [[1, 1], [1, 7], [7, 7], [7, 1], [4, 4], [4, 0], [0, 4], [8, 4], [4, 8], [2, 6]], lit: 6, boxes: [[3, 2], [6, 5], [2, 4], [5, 8]] },
    ],
    picture = pictures[stage - 1];
  let out = `<rect x="10" y="10" width="120" height="120" rx="10" fill="#d9b48a"/><rect x="16" y="16" width="108" height="108" rx="6" fill="#b48c63"/>`;
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const [x, y] = at(r, c);
      out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(cell * 0.2).toFixed(1)}" fill="#f3efe6"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(cell * 0.08).toFixed(1)}" fill="#2a2522"/>`;
    }
  for (const [r, c] of picture.boxes) {
    const [x, y] = at(r, c),
      s = cell * 0.36;
    out += `<rect x="${(x - s).toFixed(1)}" y="${(y - s).toFixed(1)}" width="${(2 * s).toFixed(1)}" height="${(2 * s).toFixed(1)}" rx="1.6" fill="#8d949b" stroke="#5c6268" stroke-width="0.8"/>`;
  }
  // The wire, through the lit bulbs in order.
  const lit = picture.bulbs.slice(0, picture.lit).map(([r, c]) => at(r, c));
  out += `<path d="${lit.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("")}" fill="none" stroke="#b8442f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
  picture.bulbs.forEach(([r, c], i) => {
    const [x, y] = at(r, c),
      on = i < picture.lit,
      radius = cell * 0.3;
    if (on) out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(radius * 2.1).toFixed(1)}" fill="url(#bulb-halo-${stage})"/>`;
    out += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${radius.toFixed(1)}" fill="${on ? "#ffd277" : "#dfe8ea"}" stroke="${on ? "#e79a2a" : "#8f9a9e"}" stroke-width="1"/>`;
  });
  // The battery by the first bulb.
  const [bx, by] = at(...picture.bulbs[0]);
  out += `<rect x="${(bx + cell * 0.22).toFixed(1)}" y="${(by + cell * 0.3).toFixed(1)}" width="${(cell * 0.5).toFixed(1)}" height="${(cell * 0.22).toFixed(1)}" rx="1" fill="#1c1d20"/><rect x="${(bx + cell * 0.6).toFixed(1)}" y="${(by + cell * 0.3).toFixed(1)}" width="${(cell * 0.12).toFixed(1)}" height="${(cell * 0.22).toFixed(1)}" fill="#c8793a"/>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><defs><radialGradient id="bulb-halo-${stage}"><stop offset="0" stop-color="#ffe9a8" stop-opacity="0.9"/><stop offset="1" stop-color="#ffb347" stop-opacity="0"/></radialGradient></defs><rect x="4" y="4" width="132" height="132" rx="14" fill="#3a2d24"/>${out}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수", "달인"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told by their boards.
  NOTES = ["5×5", "6×6", "7×7 · 상자", "8×8 · 상자", "9×9 · 상자"];
export const bulbLinkConfig: PointConfig<State> = {
  game: bulbLink,
  // A bulb coming on: the click of a switch.
  contact: (sound) => sound.plastic(),
  solo: true,
  showMovable: false,
  view: (host, quality) => new BulbLinkView(host, quality),
  colors: BULB_COLORS,
  keyPoints: (state) => state.cells.map((_, i) => cellAt(state.size, i)),
  keyStart: (state) => (state.path.length ? state.path[state.path.length - 1] : (state.cells.indexOf(1) >= 0 ? state.cells.indexOf(1) : 0)),
  // Enter (or Space) lights the bulb under the keyboard's cursor, through the same way as a tap, so that a refused one
  // is told why; H plays the hint while the collection's picture is taken.
  keyMove: (key, state, _repeat, held) => {
    if (typeof document !== "undefined" && capturing() && (key === "h" || key === "H")) return hint(state);
    if ((key === "Enter" || key === " ") && held?.cursor !== null && held?.cursor !== undefined) return { from: -1, to: held.cursor, extra: -1 };
    return null;
  },
  refusal,
  // Taps given while a wire is still being laid are kept and played in order, one as each wire arrives (the user asked).
  queueMoves: "all",
  puzzle: { hint, hintText: (state) => (state.path.length ? "힌트 — 금색 고리가 있는 전구를 다음에 켜세요." : "힌트 — 금색 고리가 있는 전구에서 시작하세요.") },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: benchArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "전구 잇기",
  english: "Bulb Link",
  number: "NO. 95 — LIGHT THEM ALL",
  intro: `<p>전기공의 작업대, 구멍 뚫린 판 위에 꺼진 전구들.<br>전구에서 전구로 가로·세로·대각선으로 곧게 전선을 이어, 한 줄로 모든 전구를 켜세요. 전구를 건너뛸 수는 없어서, 줄은 처음 만나는 전구에서 멈춥니다. 웹 게임 'Switch the Bulb'로 알려진 종류의 퍼즐이고, 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 다섯 단계 · 문제는 무작위 · 언제나 풀림",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>LIGHT THEM ALL</span>`,
  artClass: "morris-art",
  artLabel: "전구 잇기 미리보기",
  tableLabel: "THE ELECTRICIAN'S BENCH",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "전구를 모두 켜세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "판 위의 소켓 몇 곳에 꺼진 <b>전구</b>가 꽂혀 있습니다. 전선 한 줄로 모든 전구를 하나씩 이어 켜면 <b>성공</b>입니다.",
        "먼저 <b>시작할 전구</b>를 하나 누르세요. 그 전구가 켜지고 옆에 배터리가 이어집니다.",
        "그다음부터는 마지막에 켠 전구(줄 끝)에서 <b>가로·세로·대각선</b> 여덟 방향 가운데 한쪽으로 곧게 전선을 잇습니다. 이을 전구를 누르면 전선이 놓이고 그 전구가 켜집니다.",
        "전선은 빈 소켓 위로만 지나가고, 그 방향에서 <b>처음 만나는 전구</b>에서 멈춥니다. <b>전구는 건너뛸 수 없습니다</b>. 꺼진 전구든 이미 켜진 전구든, 사이에 전구가 있으면 그 너머로는 이을 수 없습니다.",
        "그래서 그 방향에서 처음 만나는 전구가 <b>이미 켜져 있으면</b> 그쪽으로는 이을 곳이 없습니다.",
        "<b>금속 상자</b>는 전선을 막습니다. 상자 너머로는 이을 수 없습니다.",
        "전선은 공중으로 지나가므로 <b>서로 엇갈려도</b> 됩니다. 한 번 켠 전구는 다시 켤 수 없습니다.",
        "줄 끝에서 닿는 꺼진 전구가 없는데 아직 꺼진 전구가 남았다면 <b>막다른 곳</b>입니다. 실패는 아니니 무르기로 되돌려 다른 길을 찾으세요.",
      ),
    ) +
    part(
      "작업대의 것들",
      table(
        ["전구", "꺼진 전구는 투명한 유리 안에 어두운 필라멘트가 보이고, 켜지면 따뜻하게 빛납니다."],
        ["줄 끝", "마지막에 켠 전구입니다. 파란 고리가 둘러 있고, 다음 전선은 여기서 나갑니다. 전선이 닿는 꺼진 전구에는 옅은 고리가 보입니다."],
        ["전선", "빨간 천을 씌운 전선입니다. 빈 소켓 위로만 걸쳐 지나가고, 전구 위로는 지나가지 않습니다."],
        ["금속 상자", "회색 정션 박스입니다. 그 칸으로도, 그 칸 너머로도 전선이 지나가지 못합니다. <b>어려움</b>부터 나옵니다."],
        ["배터리", "처음 켠 전구 옆에 놓여 전선의 시작을 알려 줍니다."],
        ["단계", "<b>쉬움</b>은 5×5 판에 전구 다섯·여섯 개, 단계가 오를수록 판이 넓어지고 전구와 상자가 늘어 <b>달인</b>은 9×9 판입니다. 위 단계일수록 아무 데서나 시작하면 막다른 곳에 갇히기 쉽습니다. 어느 판이든 풀 수 있는 판만 나옵니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "가로·세로·대각선으로 다른 전구와 거의 줄이 닿지 않는 외톨이 전구를 찾아보세요. 그런 전구는 줄의 처음이나 끝이 되어야 합니다.",
        "켜진 전구는 길을 막습니다. 두 전구 사이에 있는 전구를 먼저 켜 버리면, 그 둘은 그 줄로 다시 이어지지 않습니다.",
        "꺼진 전구 하나를 남겨 두고 멀리 가 버리면 돌아올 길이 막히기 쉽습니다. 막히면 무르기로 몇 수 되돌아가세요.",
      ),
    ),
  help: "마우스·터치: 켤 전구를 누릅니다<br>키보드: 방향키로 칸을 고르고 Enter",
  sides: ["나", ""],
  startWord: "작업대 앞에 서기",
};