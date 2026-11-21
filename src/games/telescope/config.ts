import { capturing } from "../../ui/banner";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { cellAt } from "./layout";
import { STAGES, hint, refusal, stageOf, telescope, type State } from "./rules";
import { COLOUR_OF, TELESCOPE_COLORS, TelescopeView } from "./view";

/**
 * A small picture of a stage: a wooden board of the stage's size with its grid, brass telescopes with their kinds'
 * rings (one drawn out against the ball), the white ball and the dark hole. More telescopes, and closer, as the
 * stages rise.
 */
function stageArt(stage: number) {
  const n = STAGES[stage - 1].size,
    cell = 104 / n,
    x0 = 70 - (n * cell) / 2,
    mid = (r: number, c: number) => [x0 + (c + 0.5) * cell, x0 + (r + 0.5) * cell] as const,
    // Telescopes of each picture: row, column, direction (N E S W), length; then the ball and the hole.
    pictures: { scopes: [number, number, number, number][]; ball: [number, number]; hole: [number, number] }[] = [
      { scopes: [[3, 0, 1, 2], [0, 4, 2, 0], [6, 5, 0, 0], [5, 1, 1, 0]], ball: [3, 3], hole: [1, 5] },
      { scopes: [[2, 0, 1, 1], [0, 6, 2, 0], [7, 3, 0, 0], [5, 6, 3, 0], [4, 1, 0, 0], [1, 2, 1, 0], [6, 0, 1, 0]], ball: [2, 2], hole: [5, 3] },
      { scopes: [[4, 1, 1, 2], [1, 7, 2, 0], [9, 4, 0, 0], [6, 8, 3, 0], [2, 2, 2, 0], [7, 1, 1, 0], [0, 4, 3, 0], [3, 9, 3, 0], [8, 6, 0, 0], [5, 5, 0, 0], [8, 2, 1, 0]], ball: [4, 4], hole: [1, 3] },
      { scopes: [[5, 0, 1, 3], [1, 8, 2, 0], [10, 4, 0, 0], [7, 9, 3, 0], [2, 2, 2, 0], [8, 1, 1, 0], [0, 5, 3, 0], [3, 10, 3, 0], [9, 7, 0, 0], [6, 6, 0, 0], [9, 2, 1, 0], [4, 7, 2, 0], [2, 4, 1, 0], [7, 4, 0, 0], [5, 9, 3, 0]], ball: [5, 4], hole: [2, 8] },
      { scopes: [[6, 1, 1, 3], [1, 9, 2, 0], [12, 5, 0, 0], [8, 11, 3, 0], [2, 2, 2, 0], [10, 1, 1, 0], [0, 6, 3, 0], [4, 12, 3, 0], [11, 8, 0, 0], [7, 7, 0, 0], [11, 3, 1, 0], [5, 9, 2, 0], [3, 4, 1, 0], [9, 5, 0, 0], [6, 10, 3, 0], [3, 7, 2, 0], [8, 3, 0, 0], [1, 5, 1, 0], [10, 10, 0, 0], [4, 1, 1, 0]], ball: [6, 5], hole: [2, 10] },
    ],
    picture = pictures[stage - 1],
    way = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
  let out = `<rect x="${x0 - 6}" y="${x0 - 6}" width="${n * cell + 12}" height="${n * cell + 12}" rx="6" fill="#d8b27c" stroke="#a4783f" stroke-width="1.4"/>`;
  for (let k = 0; k <= n; k++) {
    const at = (x0 + k * cell).toFixed(1);
    out += `<path d="M${at} ${x0}V${x0 + n * cell}M${x0} ${at}H${x0 + n * cell}" stroke="#9c7442" stroke-width="0.6" opacity="0.7"/>`;
  }
  const [hx, hy] = mid(...picture.hole);
  out += `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="${(cell * 0.36).toFixed(1)}" fill="#160d07" stroke="#c9a14a" stroke-width="${(cell * 0.08).toFixed(1)}"/>`;
  // The kinds (by reach): the one drawn out is of a kind that reaches the ball; the rest are mixed.
  const first = ([2, 4, 3, 3, 4] as const)[stage - 1],
    kinds = [2, 3, 4] as const;
  picture.scopes.forEach(([r, c, d, len], i) => {
    const reach = i ? kinds[(i + stage) % 3] : first;
    const [x, y] = mid(r, c),
      [dx, dy] = way[d],
      w = cell * 0.34,
      tip = (len + 0.62) * cell,
      back = cell * 0.42,
      // The tube, from behind its base to its tip, then the coloured ring at the tip and the eyepiece behind.
      x1 = x - dx * back,
      y1 = y - dy * back,
      x2 = x + dx * tip,
      y2 = y + dy * tip;
    out += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#a37c31" stroke-width="${(w + 1).toFixed(1)}" stroke-linecap="butt"/>`;
    out += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="#d6b05a" stroke-width="${(w * 0.6).toFixed(1)}" stroke-linecap="butt"/>`;
    out += `<circle cx="${(x2 - dx * w * 0.25).toFixed(1)}" cy="${(y2 - dy * w * 0.25).toFixed(1)}" r="${(w * 0.62).toFixed(1)}" fill="${COLOUR_OF[reach]}" stroke="#1a120c" stroke-width="0.7"/>`;
    out += `<circle cx="${(x1 - dx * w * 0.2).toFixed(1)}" cy="${(y1 - dy * w * 0.2).toFixed(1)}" r="${(w * 0.3).toFixed(1)}" fill="#2a1d14"/>`;
  });
  const [bx, by] = mid(...picture.ball);
  out += `<circle cx="${bx.toFixed(1)}" cy="${by.toFixed(1)}" r="${(cell * 0.3).toFixed(1)}" fill="#f7f4ec" stroke="#9aa0a6" stroke-width="0.8"/>`;
  out += `<circle cx="${(bx - cell * 0.09).toFixed(1)}" cy="${(by - cell * 0.1).toFixed(1)}" r="${(cell * 0.09).toFixed(1)}" fill="#ffffff"/>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="14" fill="#3a2a1e"/>${out}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수", "달인"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told by their boards and
  // by what their ways ask for.
  NOTES = ["7×7 · 밀고 당기기", "8×8 · 막아 세우기", "10×10 · 거듭 늘이기", "11×11 · 막고 열기", "13×13 · 긴 길"];
export const telescopeConfig: PointConfig<State> = {
  game: telescope,
  // The tip meeting the ball, or the tubes coming home: a knock of brass; a ball dropping into the hole.
  contact: (sound, state) => (state.last?.fell ? sound.pocket() : state.last && state.last.balls[0] !== state.ball ? sound.marble() : sound.knock(1)),
  solo: true,
  showMovable: false,
  view: (host, quality) => new TelescopeView(host, quality),
  colors: TELESCOPE_COLORS,
  keyPoints: (state) => state.scopes.map((s) => cellAt(state.size, s.cell)),
  keyStart: () => 0,
  // Enter (or Space) presses the telescope under the keyboard's cursor, the same way as a tap, so that a refused one
  // is told why; H plays the hint while the collection's picture is taken.
  keyMove: (key, state, _repeat, held) => {
    if (typeof document !== "undefined" && capturing() && (key === "h" || key === "H")) return hint(state);
    if ((key === "Enter" || key === " ") && held?.cursor !== null && held?.cursor !== undefined) return { from: -1, to: held.cursor, extra: -1 };
    return null;
  },
  refusal,
  // Presses given while a telescope still moves are kept and played in order, one as each comes to rest.
  queueMoves: "all",
  puzzle: { hint, hintText: "힌트 — 금색 고리가 있는 망원경을 누르세요." },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: stageArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "망원경 퍼즐",
  english: "Telescope Push",
  number: "NO. 96 — PUSH AND PULL",
  intro: `<p>나무 판 위에 놋쇠 망원경들이 빼곡히 서 있고, 하얀 공 하나와 검은 구멍 하나.<br>망원경을 누르면 쭉 늘어나며 앞의 공을 밀고, 다시 누르면 줄어들며 끝에 닿은 공을 끌고 옵니다. 끝 고리의 색이 늘어나는 길이를 알려 줍니다(본체 포함 초록 3칸, 노랑 4칸, 보라 5칸). 밀고 당겨서 공을 구멍에 넣으세요. 웹 게임 'Telescope Puzzle'(Mathsisfun)로 알려진 종류의 퍼즐이고, 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 다섯 단계 · 문제는 무작위 · 언제나 풀림",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>PUSH AND PULL</span>`,
  artClass: "morris-art",
  artLabel: "망원경 퍼즐 미리보기",
  tableLabel: "THE BRASS TELESCOPES",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "공을 구멍에 넣으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "판 위에 <b>망원경</b> 여러 개와 하얀 <b>공</b> 하나, 검은 <b>구멍</b> 하나가 있습니다. 공을 구멍에 넣으면 <b>성공</b>입니다.",
        "망원경은 제자리(접안부가 있는 칸)에 고정되어 한쪽을 바라봅니다. 줄어든 망원경을 누르면 바라보는 쪽으로 <b>한 번에 쭉</b> 늘어납니다.",
        "얼마나 늘어나는지는 끝에 두른 <b>고리의 색</b>이 정합니다. 본체 칸을 포함해 <b>초록</b>은 최대 3칸, <b>노랑</b>은 4칸, <b>보라</b>는 5칸입니다.",
        "늘어나다가 앞 칸에 <b>공</b>이 있으면 공을 앞으로 밀며 함께 나아갑니다.",
        "판 가장자리, 다른 망원경(접안부나 늘어난 몸통)에 닿으면 거기서 멈춥니다. 밀던 공 너머가 막혀 있어도 공과 함께 멈춥니다. 조금도 늘어날 수 없는 망원경은 누를 수 없습니다.",
        "늘어난 망원경을 누르면 끝까지 <b>줄어듭니다</b>. 이때 공이 망원경 끝 바로 앞 칸에 닿아 있으면 <b>함께 끌려와</b> 접안부 바로 앞 칸에 섭니다. 옆에 있거나 떨어져 있는 공은 그대로입니다.",
        "늘어난 망원경의 몸통도 칸을 차지합니다. 공도, 다른 망원경도 그 칸을 지나갈 수 없습니다.",
        "공은 밀리든 끌려오든 <b>구멍 칸에 들어서는 순간</b> 빠집니다. 망원경은 구멍 위로 지나갈 수 있습니다.",
        "실패는 없습니다. 막히면 무르기로 한 번씩 되돌리거나 처음부터 다시 하세요.",
      ),
    ) +
    part(
      "망원경의 색",
      table(
        ["초록", "본체 포함 최대 <b>3칸</b>. 경통 두 마디가 빠져나와 앞으로 두 칸까지 늘어납니다."],
        ["노랑", "본체 포함 최대 <b>4칸</b>. 경통 세 마디, 앞으로 세 칸까지 늘어납니다."],
        ["보라", "본체 포함 최대 <b>5칸</b>. 경통 네 마디, 앞으로 네 칸까지 늘어납니다."],
      ),
    ) +
    part(
      "판 위의 것들",
      table(
        ["망원경", "놋쇠로 된 접이식 망원경입니다. 접안부가 놓인 칸이 제자리이고, 경통 마디가 하나씩 빠져나와 늘어납니다. 마디 수와 끝의 색 고리가 얼마나 늘어나는지 알려 줍니다."],
        ["공", "하얀 대리석 공입니다. 망원경 끝에 밀려 굴러가고, 끝에 닿아 있으면 줄어드는 망원경에 끌려옵니다."],
        ["구멍", "놋쇠 테를 두른 검은 구멍입니다. 공이 이 칸에 들어서면 빠집니다."],
        ["단계", "<b>쉬움</b>은 7×7 판에서 밀고 당겨 넣습니다. <b>보통</b>부터는 다른 망원경을 늘여 공을 세우는 수가 꼭 들어가고, <b>어려움</b>부터는 같은 망원경을 몇 번이고 늘였다 줄여야 합니다. <b>고수</b>와 <b>달인</b>(13×13)은 길을 막았다 여는 수가 여럿 섞인 긴 길입니다. 구멍 쪽으로만 밀어서는 풀리지 않는 판만 나오고, 어느 판이든 풀 수 있습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "구멍에서 거꾸로 생각해 보세요. 어느 망원경이 공을 구멍으로 밀거나 끌어올 수 있는지, 그러려면 공이 어디에 있어야 하는지 따라가면 길이 보입니다.",
        "공을 멀리 보내고 싶지 않을 때는 짧은 망원경(초록)으로 밀거나, 먼저 다른 망원경을 늘여 길을 막아 두세요. 늘어난 몸통이 공을 세워 줍니다.",
        "공이 망원경 끝에 닿은 채로 멈췄다면, 그 망원경을 다시 눌러 공을 되끌어 올 수 있습니다.",
      ),
    ),
  help: "마우스·터치: 망원경을 누릅니다<br>키보드: 방향키로 망원경을 고르고 Enter",
  sides: ["나", ""],
  startWord: "판 앞에 앉기",
};
