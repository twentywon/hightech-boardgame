import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CELLS, SIZE, STAGES, hint, parking, stageOf, type State } from "./rules";
import { PAINT, PARKING_COLORS, ParkingView } from "./view";

/** The vehicles of the stage pictures: row, column, length, lying across, paint (one lot, filled further stage by stage). */
const ART: [number, number, number, boolean, number][] = [
  [2, 0, 2, true, 0],
  [0, 2, 3, false, 4],
  [1, 5, 3, false, 8],
  [1, 3, 2, false, 1],
  [3, 3, 2, false, 6],
  [0, 4, 2, true, 7],
  [5, 0, 3, true, 9],
  [3, 0, 2, true, 2],
  [4, 4, 2, true, 5],
];
/** A small picture of a stage: a lot seen from above, the gate open at the right of the third row, and some vehicles. */
function lotArt(stage: number) {
  const cell = 15,
    x0 = 23,
    y0 = 25,
    span = cell * SIZE,
    shown = [3, 5, 7, 9][stage - 1];
  let lines = "";
  for (let k = 1; k < SIZE; k++) lines += `<path d="M${x0 + k * cell} ${y0}V${y0 + span}M${x0} ${y0 + k * cell}H${x0 + span}" stroke="#e8e6dc" stroke-opacity="0.45" stroke-width="0.8"/>`;
  const cars = ART.slice(0, shown)
    .map(([r, c, len, across, paint]) => {
      const x = x0 + c * cell + 1.6,
        y = y0 + r * cell + 1.6,
        w = (across ? len : 1) * cell - 3.2,
        h = (across ? 1 : len) * cell - 3.2,
        roof = across ? `<rect x="${x + w * 0.3}" y="${y + 2.6}" width="${w * 0.36}" height="${h - 5.2}" rx="1.5" fill="#1a222c" opacity="0.75"/>` : `<rect x="${x + 2.6}" y="${y + h * 0.3}" width="${w - 5.2}" height="${h * 0.36}" rx="1.5" fill="#1a222c" opacity="0.75"/>`,
        stripe = paint === 0 ? `<rect x="${x + 1}" y="${y + h / 2 - 1.1}" width="${w - 2}" height="2.2" fill="#f7f5ef"/>` : "";
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${PAINT[paint]}" stroke="#1d1f22" stroke-width="0.8"/>${roof}${stripe}`;
    })
    .join("");
  const gateY = y0 + 2 * cell;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#6e9a4c"/><rect x="${x0 - 4}" y="${y0 - 4}" width="${span + 8}" height="${span + 8}" rx="3" fill="#c4c0b6"/><rect x="${x0}" y="${y0}" width="${span}" height="${span}" fill="#4a4d52"/><rect x="${x0 + span - 1}" y="${gateY}" width="${140 - x0 - span - 5}" height="${cell}" fill="#45484d"/>${lines}<rect x="${x0 + span + 6}" y="${gateY - 3}" width="3" height="${cell + 3}" fill="#d3322a"/><rect x="${x0 + span + 6}" y="${gateY + 2}" width="3" height="3" fill="#efede6"/><rect x="${x0 + span + 6}" y="${gateY + 8}" width="3" height="3" fill="#efede6"/>${cars}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told in words.
  NOTES = ["짧은 문제", "중간 문제", "긴 문제", "아주 긴 문제"];
export const parkingConfig: PointConfig<State> = {
  game: parking,
  contact: (sound) => sound.knock(3),
  solo: true,
  showMovable: false,
  view: (host, quality) => new ParkingView(host, quality),
  colors: PARKING_COLORS,
  keyPoints: () => Array.from({ length: CELLS }, (_, i) => ({ x: i % SIZE, z: Math.floor(i / SIZE) })),
  puzzle: { hint, hintText: "힌트 — 금색 테두리의 차를 화살표 쪽으로, 금색 자리까지 미세요." },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: lotArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "주차장 탈출",
  english: "Parking Escape",
  number: "NO. 72 — DRIVE THE RED CAR OUT",
  intro: `<p>차가 빽빽이 들어찬 주차장.<br>차와 트럭을 앞뒤로 밀어 길을 내고, 빨간 차를 오른쪽 출구로 빼내세요. '러시아워'로 알려진 종류의 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 6×6 주차장 · 문제는 무작위 · 언제나 풀림",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>DRIVE THE RED CAR OUT</span>`,
  artClass: "morris-art",
  artLabel: "주차장 탈출 미리보기",
  tableLabel: "THE CROWDED LOT",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "빨간 차를 빼내세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "주차장은 <b>6×6</b> 칸입니다. 승용차는 <b>두 칸</b>, 트럭은 <b>세 칸</b>을 차지하고, 가로나 세로로 서 있습니다.",
        "차는 <b>앞뒤로만</b> 움직입니다. 옆으로 비키거나 방향을 틀 수 없고, 다른 차를 넘어가지도 못합니다.",
        "빈칸이 이어지는 만큼 한 번에 몇 칸이든 밀 수 있습니다. 한 번 미는 것이 <b>한 수</b>입니다.",
        "<b>빨간 차</b>는 위에서 셋째 줄에 가로로 서 있습니다. 그 줄 오른쪽 끝의 <b>출구</b>까지 밀면 차단기가 올라가고 성공입니다.",
      ),
    ) +
    part(
      "밀기와 단계",
      table(
        ["밀기", "차를 눌러 제 방향으로 끌면 빈칸을 따라 미끄러집니다. 놓으면 가장 가까운 칸에 섭니다. 누르기만 해서는 움직이지 않습니다."],
        ["단계", `<b>쉬움</b>에서 <b>고수</b>로 갈수록 빨간 차를 빼내기까지 더 많이 옮겨야 하는 주차장입니다. 고수는 만들어 본 배치 가운데 가장 먼 자리에서 시작합니다.`],
        ["무작위 문제", "차를 무작위로 세운 뒤, 밀어서 닿을 수 있는 모든 배치를 따져 단계에 맞는 배치를 고릅니다. 그래서 언제나 풀립니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "빨간 차 앞을 막는 차부터 보세요. 그 차가 비키려면 어디가 비어야 하는지 거꾸로 따라가면 길이 보입니다.",
        "세로로 선 <b>트럭</b>이 셋째 줄을 비우려면 <b>맨 아래 세 칸</b>까지 내려가야 합니다. 위로는 비킬 자리가 없습니다.",
        "세로로 선 승용차는 위로 두 칸이나 아래로 비킬 수 있습니다. 어느 쪽이 나은지는 다른 차가 정합니다.",
      ),
    ),
  help: "마우스·터치: 차를 눌러 제 방향으로 끌어 밉니다<br>키보드: 방향키로 차의 왼쪽·위 끝 칸을 고르고 Enter, 그 끝이 갈 칸에서 다시 Enter",
  sides: ["나", ""],
  startWord: "주차장에 들어가기",
};
