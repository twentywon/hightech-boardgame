import { capturing } from "../../ui/banner";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { hexAt } from "./layout";
import { CELLS, STAGES, hint, refusal, stageOf, trapCat, type State } from "./rules";
import { TRAP_COLORS, TrapCatView } from "./view";

/**
 * A small picture of a stage: a lawn of hexes in the evening light, the stage's box bushes dotted over it (fewer as
 * the stages go up), a pot of flowers or two of mine, and the ginger cat's face in the middle.
 */
function gardenArt(stage: number) {
  const rows = 7,
    step = 15.5,
    rowH = step * 0.866,
    x0 = 70 - ((rows - 1) * step) / 2 - step / 4,
    y0 = 72 - ((rows - 1) * rowH) / 2,
    // Bushes of each stage's picture, as row × 7 + column: many at first, few at the top.
    bushes = [
      [1, 3, 8, 12, 15, 19, 23, 29, 31, 33, 36, 40, 44, 46],
      [2, 8, 12, 16, 19, 29, 33, 36, 41, 45],
      [3, 8, 15, 20, 30, 40, 44],
      [5, 9, 29, 36, 43],
      [10, 30, 44],
    ][stage - 1],
    pots = stage < 3 ? [17, 31] : [18],
    hexPath = (cx: number, cy: number, r: number) =>
      Array.from({ length: 6 }, (_, k) => {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        return `${k ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
      }).join("") + "Z";
  let out = "";
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < rows; c++) {
      const cx = x0 + (c + (r & 1) * 0.5) * step,
        cy = y0 + r * rowH,
        edge = r === 0 || c === 0 || r === rows - 1 || c === rows - 1,
        cell = r * rows + c;
      out += `<path d="${hexPath(cx, cy, step * 0.56)}" fill="${edge ? "#d9dc8e" : "#9cc46a"}" stroke="#6e4c33" stroke-width="1.1"/>`;
      if (bushes.includes(cell)) out += `<circle cx="${cx}" cy="${cy - 1}" r="5.6" fill="#3f7230"/><circle cx="${cx - 1.8}" cy="${cy - 2.8}" r="2.4" fill="#5c9442"/>`;
      if (pots.includes(cell)) out += `<path d="M${cx - 4.4} ${cy - 2}h8.8l-1.4 6.4h-6z" fill="#c4673e"/><circle cx="${cx - 1.8}" cy="${cy - 4.4}" r="2.4" fill="#e2463a"/><circle cx="${cx + 2}" cy="${cy - 4.8}" r="2.4" fill="#ffc93c"/>`;
    }
  // The cat's face in the middle hex.
  const cx = x0 + 3.5 * step,
    cy = y0 + 3 * rowH;
  out += `<g transform="translate(${cx} ${cy}) scale(1.4) translate(${-cx} ${-cy})"><circle cx="${cx}" cy="${cy}" r="11" fill="#fff6e0" opacity="0.7"/><path d="M${cx - 8} ${cy - 3}l1 -9 6 5zM${cx + 8} ${cy - 3}l-1 -9 -6 5z" fill="#dc823d"/><circle cx="${cx}" cy="${cy}" r="8.6" fill="#e08a42"/><path d="M${cx - 2.6} ${cy - 8}v4M${cx} ${cy - 8.4}v4.4M${cx + 2.6} ${cy - 8}v4" stroke="#a9531f" stroke-width="1.4" stroke-linecap="round"/><ellipse cx="${cx}" cy="${cy + 3.6}" rx="4.6" ry="3.2" fill="#fbeedd"/><circle cx="${cx - 3.3}" cy="${cy - 0.6}" r="1.7" fill="#8fd14f"/><circle cx="${cx + 3.3}" cy="${cy - 0.6}" r="1.7" fill="#8fd14f"/><circle cx="${cx}" cy="${cy + 2}" r="1.1" fill="#f2a3a6"/></g>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="trapcat-sky-${stage}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6d9a6"/><stop offset="1" stop-color="#b9c98e"/></linearGradient></defs><rect x="6" y="6" width="128" height="128" rx="14" fill="url(#trapcat-sky-${stage})"/>${out}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수", "달인"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told in words.
  NOTES = ["덤불 많음 · 느긋한 고양이", "덤불 넉넉 · 영리한 고양이", "한 수 앞을 보는 고양이", "덤불 적음 · 꾀 많은 고양이", "덤불 거의 없음"];
export const trapCatConfig: PointConfig<State> = {
  game: trapCat,
  // A pot set down on the lawn: a soft thump on earth; when the cat is caught, its small 냐옹 as it crouches.
  contact: (sound, state) => {
    sound.soft(3);
    if (state.winner === 0) sound.meow(0.7);
  },
  solo: true,
  showMovable: false,
  view: (host, quality) => new TrapCatView(host, quality),
  colors: TRAP_COLORS,
  keyPoints: () => Array.from({ length: CELLS }, (_, i) => hexAt(i)),
  keyStart: (state) => state.cat,
  // Enter (or Space) blocks the hex under the keyboard's cursor, through the same way as a tap, so that a refused hex
  // is told why; H plays the hint while the collection's picture is taken.
  keyMove: (key, state, _repeat, held) => {
    if (typeof document !== "undefined" && capturing() && (key === "h" || key === "H")) return hint(state);
    if ((key === "Enter" || key === " ") && held?.cursor !== null && held?.cursor !== undefined) return { from: -1, to: held.cursor, extra: -1 };
    return null;
  },
  refusal,
  puzzle: { hint, hintText: "힌트 — 금색 고리가 있는 칸을 막으세요." },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: gardenArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "고양이 가두기",
  english: "Trap the Cat",
  number: "NO. 94 — DON'T LET IT GET AWAY",
  intro: `<p>해 질 녘 정원, 육각형 잔디 한가운데 앉은 생강색 고양이.<br>한 번에 한 칸씩 화분을 놓아 길을 막으세요. 고양이는 그때마다 한 칸씩 가장자리로 달아납니다. 가장자리에 닿기 전에 빙 둘러싸서 꼼짝 못 하게 하면 성공입니다. 플래시 게임 'Chat Noir'로 알려진 종류의 퍼즐이고, 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 다섯 단계 · 문제는 무작위 · 언제나 가둘 수 있음",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>DON'T LET IT GET AWAY</span>`,
  artClass: "morris-art",
  artLabel: "고양이 가두기 미리보기",
  tableLabel: "THE EVENING GARDEN",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "고양이를 가두세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "육각형 잔디밭 한가운데에 <b>고양이</b>가 있고, 군데군데 <b>회양목 덤불</b>이 처음부터 길을 막고 있습니다.",
        "빈 칸 하나를 누르면 그 칸에 <b>화분</b>이 놓여 길이 막힙니다. 이미 막힌 칸이나 고양이가 앉은 칸에는 놓을 수 없습니다.",
        "화분을 놓을 때마다 고양이가 곧바로 <b>옆 칸 하나</b>로 옮겨 갑니다. 막힌 칸으로는 가지 못합니다.",
        "고양이가 <b>가장자리 칸</b>(빛이 바랜 테두리 잔디)에 닿으면 빠져나간 것입니다. 실패이며, 무르기로 되돌릴 수 있습니다.",
        "고양이가 옮겨 갈 빈 칸이 하나도 없게 둘러싸면 <b>성공</b>입니다.",
      ),
    ) +
    part(
      "정원의 것들",
      table(
        ["덤불", "처음부터 놓인 둥근 회양목입니다. 화분과 똑같이 길을 막습니다."],
        ["화분", "내가 놓은 꽃 화분입니다. 한 번 놓으면 무르기 전에는 치울 수 없습니다."],
        ["가장자리", "테두리의 밝은 잔디 칸입니다. 고양이가 여기에 닿으면 그다음엔 정원 밖으로 달아나므로, 닿는 순간 실패입니다."],
        ["고양이", "언제나 가장 빨리 빠져나갈 길로 갑니다. 위 단계의 고양이는 내가 다음에 어디를 막을지까지 생각해, 막혀도 다른 길이 남는 쪽을 고릅니다. 완전히 갇히면 남은 빈 칸이 가장 넓은 쪽으로 버팁니다."],
        ["단계", "<b>쉬움</b>은 덤불이 많고 고양이가 가끔 딴 길로 샙니다. 단계가 오를수록 덤불이 줄고 고양이는 영리해집니다. 어느 단계든 가둘 수 있는 판만 나옵니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "고양이 바로 옆을 막는 것보다, 고양이가 가려는 가장자리 쪽에 미리 벽을 세우는 편이 낫습니다. 고양이가 다가오는 동안 벽을 이어 붙이세요.",
        "이미 있는 덤불을 이어서 울타리를 만들면 화분이 적게 듭니다.",
        "고양이가 더는 가장자리로 갈 수 없게 되면 이긴 것이나 같습니다. 남은 빈 칸을 하나씩 막아 마무리하세요.",
      ),
    ),
  help: "마우스·터치: 막을 빈 칸을 누릅니다<br>키보드: 방향키로 칸을 고르고 Enter",
  sides: ["나", ""],
  startWord: "정원으로 가기",
};
