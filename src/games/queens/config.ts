import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { STAGES, answers, hint, queens, type State } from "./rules";
import { QUEEN_COLORS, QueensView } from "./view";

/** A small picture of a stage: its board, with the given queens of one answer drawn dark. */
function boardArt(size: number, given: number) {
  const cell = 104 / size,
    cols = answers(size)[Math.min(3, answers(size).length - 1)];
  let squares = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      squares += `<rect x="${18 + c * cell}" y="${18 + r * cell}" width="${cell}" height="${cell}" fill="${(r + c) % 2 ? "#8a6448" : "#f3e3c3"}"/>`;
      if (cols[r] === c && r < given) squares += `<circle cx="${18 + (c + 0.5) * cell}" cy="${18 + (r + 0.5) * cell}" r="${cell * 0.3}" fill="#1d1a18" stroke="#c9a44a" stroke-width="1.5"/>`;
    }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#3b2617"/>${squares}</svg>`;
}
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수"];
export const queensConfig: PointConfig<State> = {
  game: queens,
  contact: (sound) => sound.wood(1),
  solo: true,
  showMovable: false,
  view: (host, quality) => new QueensView(host, quality),
  colors: QUEEN_COLORS,
  keyPoints: (state) => state.queens.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  puzzle: { hint, hintText: "힌트 — 금색 고리가 쳐진 칸을 누르세요. 퀸이 있으면 치우고, 없으면 놓습니다." },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({ value: String(i + 1), name: `${stage.size}×${stage.size} · ${NAMES[i]}`, note: `주어진 퀸 ${stage.given}개`, art: boardArt(stage.size, stage.given) })),
  tallyHtml: () => ["", ""],
  name: "체스판의 퀸",
  english: "Queens on the Board",
  number: "NO. 48 — NONE IN ANOTHER'S WAY",
  intro: `<p>체스판 위의 퀸들.<br>어느 퀸도 다른 퀸의 가로·세로·대각선 위에 서지 않도록, 판의 크기만큼 퀸을 놓으세요. 'N-퀸'으로 알려진 오래된 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 5×5부터 8×8 · 문제는 무작위",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>NONE IN ANOTHER'S WAY</span>`,
  artClass: "morris-art",
  artLabel: "체스판의 퀸 미리보기",
  tableLabel: "THE QUEENS' BOARD",
  tableNote: (variant) => {
    const stage = STAGES[Math.max(1, Math.min(STAGES.length, Number(variant) || 1)) - 1];
    return `${stage.size}×${stage.size} · 무작위 문제`;
  },
  rulesTitle: "어느 퀸도 다른 퀸에게 갈 수 없게",
  rules:
    part(
      "기본 규칙",
      steps(
        "퀸은 체스에서 <b>가로·세로·대각선</b>으로 원하는 만큼 움직입니다.",
        "판이 n×n이면 퀸 <b>n개</b>를 놓습니다. 빈 칸을 누르면 퀸이 놓이고, 내가 놓은 퀸을 누르면 치워집니다.",
        "어느 퀸도 다른 퀸과 <b>같은 줄·같은 칸줄·같은 대각선</b>에 서지 않으면 성공입니다. 그러면 어떤 퀸도 다른 퀸에게 갈 수 없습니다.",
      ),
    ) +
    part(
      "판의 퀸",
      table(
        ["검은 퀸", "처음부터 <b>주어진</b> 퀸입니다. 움직이거나 치울 수 없습니다. 주어진 퀸으로 답이 하나로 정해지게 문제를 만듭니다(8×8 고수는 답이 여럿일 수 있고, 어느 답이든 성공입니다)."],
        ["흰 퀸", "내가 놓은 퀸입니다."],
        ["빨간 퀸", "다른 퀸과 같은 줄이나 대각선에 서 있는 내 퀸입니다. 옮기기 전까지 빨갛게 빛납니다. 주어진 퀸이 걸리면 발치의 놋쇠 고리가 빨개집니다."],
      ),
    ) +
    part("오른쪽 판", table(["힌트", "금색 고리가 쳐진 칸을 누르면 답에 한 걸음 다가갑니다. 퀸이 있으면 치울 퀸, 없으면 놓을 자리입니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다."], ["다른 퍼즐 · 다음 스테이지", "같은 크기의 새 문제가 나옵니다."])) +
    part("처음이라면", notes("한 줄(가로)에는 퀸이 <b>꼭 하나</b> 들어갑니다. 세로줄도 마찬가지입니다.", "주어진 퀸이 막는 줄과 대각선을 먼저 지우고, 남은 칸이 가장 적은 줄부터 채웁니다.", "나이트가 뛰는 모양(두 칸 가고 한 칸 옆)으로 퀸을 이어 놓으면 서로 막지 않는 경우가 많습니다.")),
  help: "마우스·터치: 칸을 누르면 퀸을 놓거나 치웁니다<br>키보드: 방향키로 고르고 Enter",
  sides: ["나", ""],
  startWord: "체스판 앞에 앉기",
};
