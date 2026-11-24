import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { REPAIRS, STAGES, answers, hint, queens, repairOf, sizeOf, type State } from "./rules";
import { QUEEN_COLORS, QueensView } from "./view";
import { withLazy } from "../../core/lazy";

/** A small picture of a stage: its board, with the given queens of one answer drawn dark (or, for a repair, every queen, the misplaced ones red). */
function boardArt(size: number, given: number, wrong = 0) {
  const cell = 104 / size,
    cols = [...answers(size)[Math.min(3, answers(size).length - 1)]];
  for (let r = 0; r < wrong; r++) cols[r * 2] = (cols[r * 2] + 2) % size;
  let squares = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      squares += `<rect x="${18 + c * cell}" y="${18 + r * cell}" width="${cell}" height="${cell}" fill="${(r + c) % 2 ? "#8a6448" : "#f3e3c3"}"/>`;
      const at = `cx="${18 + (c + 0.5) * cell}" cy="${18 + (r + 0.5) * cell}" r="${cell * 0.3}"`;
      if (cols[r] === c && wrong) squares += `<circle ${at} fill="${r % 2 === 0 && r / 2 < wrong ? "#e0533e" : "#ecdcb4"}" stroke="#3b2617" stroke-width="1"/>`;
      else if (cols[r] === c && r < given) squares += `<circle ${at} fill="#1d1a18" stroke="#c9a44a" stroke-width="1.5"/>`;
    }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="${wrong ? "#4a1a20" : "#3b2617"}"/>${squares}</svg>`;
}
/** The stages with givens by value (1–5 as always; 6–8 the 4×4, 9×9 and 10×10 added in the upgrade). */
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수", "입문", "달인", "명인"];
/** The cards in the stage window: by size, the repairs last. */
const CARDS = [
  // A card's picture needs the board's answers, which are found by search: it is drawn when the cards are first shown.
  ...STAGES.map((stage, i) => withLazy({ value: String(i + 1), name: `${stage.size}×${stage.size} · ${NAMES[i]}`, note: `주어진 퀸 ${stage.given}개`, order: stage.size * 10 + (5 - stage.given) }, "art", () => boardArt(stage.size, stage.given))),
  ...REPAIRS.map((repair, k) => withLazy({ value: String(STAGES.length + k + 1), name: `${repair.size}×${repair.size} · 고쳐 놓기`, note: `잘못 놓인 퀸 ${repair.wrong}개`, order: 1000 + k }, "art", () => boardArt(repair.size, 0, repair.wrong))),
].sort((a, b) => a.order - b.order);
export const queensConfig: PointConfig<State> = {
  game: queens,
  contact: (sound) => sound.wood(1),
  // A solved board rings a chime as its queens hop.
  knock: (sound) => sound.chime(),
  solo: true,
  showMovable: false,
  view: (host, quality, variant) => new QueensView(host, quality, variant),
  colors: QUEEN_COLORS,
  keyPoints: (state) => state.queens.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  puzzle: { hint, hintText: "힌트 — 금색 고리가 쳐진 칸을 누르세요. 퀸이 있으면 치우고, 없으면 놓습니다." },
  stagesFirst: true,
  stages: CARDS,
  tallyHtml: () => ["", ""],
  name: "체스판의 퀸",
  english: "Queens on the Board",
  number: "NO. 48 — NONE IN ANOTHER'S WAY",
  intro: `<p>궁전 응접실 탁자 위의 체스판과 퀸들.<br>어느 퀸도 다른 퀸의 가로·세로·대각선 위에 서지 않도록, 판의 크기만큼 퀸을 놓으세요. 잘못 놓인 퀸을 바로잡는 '고쳐 놓기'도 있습니다. 'N-퀸'으로 알려진 오래된 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 4×4부터 10×10 · 문제는 무작위",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>NONE IN ANOTHER'S WAY</span>`,
  artClass: "morris-art",
  artLabel: "체스판의 퀸 미리보기",
  tableLabel: "THE QUEENS' BOARD",
  tableNote: (variant) => {
    const size = sizeOf(Number(variant) || 1);
    return `${size}×${size} · ${repairOf(Number(variant) || 1) ? "고쳐 놓기" : "무작위 문제"}`;
  },
  rulesTitle: "어느 퀸도 다른 퀸에게 갈 수 없게",
  rules:
    part(
      "기본 규칙",
      steps(
        "퀸은 체스에서 <b>가로·세로·대각선</b>으로 원하는 만큼 움직입니다.",
        "판이 n×n이면 퀸 <b>n개</b>를 놓습니다. 빈 칸을 누르면 퀸이 놓이고, 내가 놓은 퀸을 누르면 치워집니다. 내 퀸을 <b>끌어서</b> 다른 빈 칸으로 옮길 수도 있습니다.",
        "어느 퀸도 다른 퀸과 <b>같은 줄·같은 칸줄·같은 대각선</b>에 서지 않으면 성공입니다. 서로 걸리는 퀸 사이에는 빨간 선이 그어집니다.",
        "<b>고쳐 놓기</b>는 퀸 n개가 이미 다 놓여 있고 그중 몇 개가 잘못 놓여 있습니다. 빨간 퀸을 옮겨 바로잡으세요.",
      ),
    ) +
    part(
      "판의 퀸",
      table(
        ["검은 퀸", "처음부터 <b>주어진</b> 퀸입니다. 움직이거나 치울 수 없습니다. 주어진 퀸으로 답이 하나로 정해지게 문제를 만듭니다(8×8 고수는 답이 여럿일 수 있고, 어느 답이든 성공입니다)."],
        ["흰 퀸", "내가 놓은 퀸입니다. 마우스를 올리면 그 퀸이 가는 줄이 옅은 금색으로 보입니다."],
        ["빨간 퀸", "다른 퀸과 같은 줄이나 대각선에 서 있는 내 퀸입니다. 옮기기 전까지 빨갛게 빛나고, 걸리는 퀸과 빨간 선으로 이어집니다. 주어진 퀸이 걸리면 발치의 놋쇠 고리가 빨개집니다."],
      ),
    ) +
    part("오른쪽 판", table(["힌트", "금색 고리가 쳐진 칸을 누르면 답에 한 걸음 다가갑니다. 퀸이 있으면 치울 퀸, 없으면 놓을 자리입니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다."], ["다른 퍼즐 · 다음 스테이지", "같은 크기의 새 문제가 나옵니다."])) +
    part("처음이라면", notes("한 줄(가로)에는 퀸이 <b>꼭 하나</b> 들어갑니다. 세로줄도 마찬가지입니다.", "주어진 퀸이 막는 줄과 대각선을 먼저 지우고, 남은 칸이 가장 적은 줄부터 채웁니다.", "나이트가 뛰는 모양(두 칸 가고 한 칸 옆)으로 퀸을 이어 놓으면 서로 막지 않는 경우가 많습니다.")),
  help: "마우스·터치: 칸을 누르면 퀸을 놓거나 치우고, 내 퀸은 끌어서 옮깁니다<br>키보드: 방향키로 고르고 Enter",
  sides: ["나", ""],
  startWord: "체스판 앞에 앉기",
};
