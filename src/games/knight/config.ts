import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CLOSED, STAGES, hint, knight, stageOf, type State } from "./rules";
import { KNIGHT_COLORS, KnightView } from "./view";

/** A small picture of a stage: its board with a few squares cut out and the knight in a corner (closed: a gold ring round it and an arrow home). */
function boardArt(cols: number, rows: number, closed = false) {
  const cell = 100 / Math.max(cols, rows),
    left = 70 - (cols * cell) / 2,
    top = 70 - (rows * cell) / 2,
    cut = new Set([cols * rows - 1, cols + 1 < cols * rows - 2 ? Math.floor((cols * rows) / 2) : -1]);
  let squares = "";
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      squares += `<rect x="${left + c * cell}" y="${top + r * cell}" width="${cell}" height="${cell}" fill="${cut.has(i) ? "#24160d" : (r + c) % 2 ? "#8a6448" : "#f3e3c3"}"/>`;
    }
  const home = closed
    ? `<circle cx="${left + cell / 2}" cy="${top + cell / 2}" r="${cell * 0.48}" fill="none" stroke="#e9b83a" stroke-width="2.5"/><path d="M ${left + cell * 2.5} ${top + cell * 1.5} Q ${left + cell * 2.2} ${top + cell * 0.4} ${left + cell * 1.05} ${top + cell * 0.55}" fill="none" stroke="#e9b83a" stroke-width="2.5" stroke-dasharray="4 3"/>`
    : "";
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="${closed ? "#2a1f3a" : "#3b2617"}"/>${squares}${home}<text x="${left + cell / 2}" y="${top + cell * 0.72}" font-size="${cell * 0.8}" text-anchor="middle" fill="#c9a44a">♞</text></svg>`;
}
/** The open journeys by value (1–5 as always; 6 and 7 the 7×7 and 8×8 added in the upgrade), then the closed ones. */
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수", "달인", "명인"];
export const knightConfig: PointConfig<State> = {
  game: knight,
  contact: (sound) => sound.wood(1),
  // A journey done rings a chime as the way lights up.
  knock: (sound) => sound.chime(),
  solo: true,
  showMovable: false,
  view: (host, quality, variant) => new KnightView(host, quality, variant),
  colors: KNIGHT_COLORS,
  keyPoints: (state) => state.open.map((_, i) => ({ x: i % state.cols, z: Math.floor(i / state.cols) })),
  puzzle: { hint, hintText: "힌트 — 금색 고리가 쳐진 칸으로 뛰세요." },
  stagesFirst: true,
  stages: [
    ...STAGES.map((stage, i) => ({ value: String(i + 1), name: `${stage.cols}×${stage.rows} · ${NAMES[i]}`, note: "빈 칸은 무작위", art: boardArt(stage.cols, stage.rows) })),
    ...CLOSED.map((stage, k) => ({ value: String(STAGES.length + k + 1), name: `${stage.cols}×${stage.rows} · 돌아오기`, note: "출발점에서 끝내기", art: boardArt(stage.cols, stage.rows, true) })),
  ],
  tallyHtml: () => ["", ""],
  name: "나이트의 여행",
  english: "Knight Tour",
  number: "NO. 49 — EVERY SQUARE ONCE",
  intro: `<p>성의 참나무 탁자 위, 체스 나이트 하나와 작은 체스판.<br>나이트가 뛰는 길로만, 판의 모든 칸을 꼭 한 번씩 밟으세요. 마지막에 출발점으로 돌아와야 하는 '돌아오기'도 있습니다. '나이트 투어'로 알려진 오래된 퍼즐이고 판은 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 3×4부터 8×8 · 문제는 무작위",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>EVERY SQUARE ONCE</span>`,
  artClass: "morris-art",
  artLabel: "나이트의 여행 미리보기",
  tableLabel: "THE KNIGHT'S BOARD",
  tableNote: (variant) => {
    const stage = stageOf(Number(variant) || 1);
    return `${stage.cols}×${stage.rows} · ${stage.closed ? "돌아오기" : "무작위 문제"}`;
  },
  rulesTitle: "모든 칸을 한 번씩만",
  rules:
    part(
      "기본 규칙",
      steps(
        "나이트는 <b>한 방향으로 두 칸 간 뒤 옆으로 한 칸</b>(L자) 뜁니다. 장기의 마처럼 움직이고, 사이에 무엇이 있어도 넘어갑니다. 가로·세로·대각선으로 곧장 가지는 못합니다.",
        "나이트가 선 자리에서 출발해, 판의 <b>모든 칸을 한 번씩만</b> 밟으면 성공입니다. 지나온 길은 금색 선으로 남습니다.",
        "한 번 밟은 칸에는 다시 갈 수 없습니다. 더 갈 칸이 없는데 남은 칸이 있으면 실패이고, 무르기로 되돌려 이어서 합니다.",
        "<b>돌아오기</b> 스테이지는 모든 칸을 밟은 뒤 한 번 더 뛰어 <b>출발점</b>(금색 고리)으로 돌아와야 성공입니다. 출발점은 마지막에만 밟을 수 있습니다.",
      ),
    ) +
    part(
      "판의 표시",
      table(
        ["빈 자리", "판에서 잘려 나간 칸입니다. 밟지 않아도 되고, 밟을 수도 없습니다. 무작위로 정해지지만 언제나 풀리게 만듭니다."],
        ["번호 원판", "지나온 칸입니다. 숫자는 몇 번째로 밟았는지를 말합니다. 금색 1이 출발점입니다."],
        ["금색 선", "나이트가 지나온 길입니다. 다 돌면 길 전체가 차례로 빛납니다."],
        ["초록 점", "지금 나이트가 뛸 수 있는 칸입니다."],
      ),
    ) +
    part("오른쪽 판", table(["힌트", "끝까지 가는 길에서 다음에 뛸 칸에 금색 고리가 쳐집니다. 이미 막힌 상태라면 무르기부터 하라고 알려 줍니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다."], ["다른 퍼즐 · 다음 스테이지", "같은 크기의 새 문제가 나옵니다."])) +
    part("처음이라면", notes("<b>갈 길이 가장 적은 칸</b>부터 밟으세요. 구석과 가장자리는 들어가고 나올 길이 적어서, 나중으로 미루면 갇히기 쉽습니다.", "초록 점이 하나뿐인 칸이 생기면 그 칸은 지금 가지 않으면 영영 못 갈 수도 있습니다.", "돌아오기에서는 출발점 둘레의 칸들을 아껴 두었다가 마지막에 밟으세요.")),
  help: "마우스·터치: 초록 점이 있는 칸을 누르면 나이트가 뜁니다<br>키보드: 방향키로 고르고 Enter",
  sides: ["나", ""],
  startWord: "체스판 앞에 앉기",
};
