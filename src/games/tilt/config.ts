import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { LEFT, RIGHT, STAGES, hint, tilt, type State } from "./rules";
import { TILT_COLORS, TiltView } from "./view";

/** A small picture of a stage: a round dial with a square maze and the two blocks. */
function dialArt(size: number) {
  const span = 76,
    cell = span / size,
    x0 = 70 - span / 2,
    walls = [1, 3, 5, 7, 9]
      .filter((k) => k < size * 2)
      .map((k) => `<rect x="${x0 + ((k * 3) % size) * cell}" y="${x0 + ((k * 5) % size) * cell}" width="${cell * 1.2}" height="3" fill="#c9a44a"/>`)
      .join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#e6dccb"/><circle cx="70" cy="70" r="58" fill="#4a2c19"/><rect x="${x0}" y="${x0}" width="${span}" height="${span}" fill="#e9d2a8" stroke="#c9a44a" stroke-width="3"/>${walls}<rect x="${x0 + cell * 0.15}" y="${x0 + span - cell * 0.85}" width="${cell * 0.7}" height="${cell * 0.7}" rx="2" fill="${TILT_COLORS[0]}"/><rect x="${x0 + span - cell * 0.85}" y="${x0 + span - cell * 0.85}" width="${cell * 0.7}" height="${cell * 0.7}" rx="2" fill="${TILT_COLORS[1]}"/></svg>`;
}
const NAMES = ["쉬움", "보통", "도전", "어려움", "고수"];
export const tiltConfig: PointConfig<State> = {
  game: tilt,
  contact: (sound) => sound.knock(2),
  solo: true,
  showMovable: false,
  view: (host, quality) => new TiltView(host, quality),
  colors: TILT_COLORS,
  keyPoints: () => [
    { x: -1, z: 0 },
    { x: 1, z: 0 },
  ],
  keyMove: (key, state) =>
    state.winner !== null ? null : key === "ArrowLeft" || key === "q" || key === "Q" ? { from: -1, to: LEFT, extra: -1 } : key === "ArrowRight" || key === "e" || key === "E" ? { from: -1, to: RIGHT, extra: -1 } : null,
  // The knobs on the table turn the dial; these stay for readers and the keyboard.
  tools: [
    { label: "왼쪽으로 돌리기", point: LEFT, onBoard: true },
    { label: "오른쪽으로 돌리기", point: RIGHT, onBoard: true },
  ],
  puzzle: { hint, hintText: "힌트 — 금색 고리가 빛나는 손잡이 쪽으로 돌리세요." },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({ value: String(i + 1), name: `${stage.size}×${stage.size} · ${NAMES[i]}`, note: `${stage.turns}번 이상 돌려야`, art: dialArt(stage.size) })),
  tallyHtml: () => ["", ""],
  name: "회전 미로",
  english: "Turning Maze",
  number: "NO. 50 — TURN, AND LET IT FALL",
  intro: `<p>똑바로 선 둥근 판 속의 네모난 미로.<br>판을 왼쪽·오른쪽으로 90도씩 돌리면 안의 블록이 아래로 떨어집니다. 빨간 블록은 빨간 표시에, 파란 블록은 파란 표시에 멈추게 하세요. 미로는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 5×5부터 8×8 · 문제는 무작위",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>TURN, AND LET IT FALL</span>`,
  artClass: "morris-art",
  artLabel: "회전 미로 미리보기",
  tableLabel: "THE TURNING DIAL",
  tableNote: (variant) => {
    const stage = STAGES[Math.max(1, Math.min(STAGES.length, Number(variant) || 1)) - 1];
    return `${stage.size}×${stage.size} · 무작위 미로`;
  },
  rulesTitle: "돌리면 떨어집니다",
  rules:
    part(
      "기본 규칙",
      steps(
        "판 아래의 <b>왼쪽 손잡이</b>를 누르면 판이 왼쪽으로, <b>오른쪽 손잡이</b>를 누르면 오른쪽으로 90도 돕니다.",
        "판이 돌고 나면 두 블록은 <b>아래로 곧장 떨어져</b>, 벽이나 테두리나 다른 블록에 닿으면 멈춥니다.",
        "<b>빨간 블록이 빨간 고리 표시</b>에, <b>파란 블록이 파란 X 표시</b>에 함께 멈추면 성공입니다.",
      ),
    ) +
    part(
      "판의 것들",
      table(
        ["놋쇠 벽", "블록은 벽을 지나지 못합니다. 바로 아래가 벽이면 그 자리에 멈춥니다."],
        ["두 블록", "서로를 지나지 못합니다. 위의 블록은 아래 블록 위에 얹혀 멈춥니다."],
        ["무작위 미로", "벽은 매번 새로 놓입니다. 돌려서 닿을 수 있는 모든 상태를 따져, 단계에 맞는 횟수만큼 돌려야 풀리는 자리에만 표시를 둡니다. 그래서 언제나 풀립니다."],
      ),
    ) +
    part("오른쪽 판", table(["힌트", "가장 빨리 푸는 길의 다음 한 번을, 그쪽 손잡이에 금색 고리로 알려 줍니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다."], ["다른 퍼즐 · 다음 스테이지", "같은 크기의 새 미로가 나옵니다."])) +
    part("처음이라면", notes("두 블록은 늘 <b>함께</b> 떨어집니다. 한 블록을 맞춰 두고 다른 블록만 옮기기는 어렵습니다.", "같은 쪽으로 네 번 돌리면 판은 제자리로 오지만 블록은 그 사이 미로 안을 돌아다닙니다.", "한 블록을 다른 블록에 얹어 멈추게 하는 것이 길이 될 때가 많습니다.")),
  help: "마우스·터치: 판 아래 손잡이를 누릅니다<br>키보드: ← → 로 돌립니다",
  sides: ["나", ""],
  startWord: "미로 앞에 앉기",
};
