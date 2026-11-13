import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { H, LEVELS, LIVES, W, buildMaze, maze, type State } from "./rules";
import { MAZE_COLORS, MazeView } from "./view";

const KEYS: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a level's maze. */
function mazeArt(level: number) {
  const wall = buildMaze(level),
    squares = wall.map((solid, i) => (solid ? `<rect x="${(i % W) * 7}" y="${Math.floor(i / W) * 7}" width="7" height="7" fill="#8a5233"/>` : "")).join("");
  return `<svg viewBox="0 0 ${W * 7} ${H * 7}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><rect width="${W * 7}" height="${H * 7}" fill="#efe4cb"/>${squares}</svg>`;
}
export const mazeConfig: PointConfig<State> = {
  game: maze,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  view: (host, quality) => new MazeView(host, quality),
  colors: MAZE_COLORS,
  keyMove: (key) => (key in KEYS ? { from: -1, to: KEYS[key], extra: -1 } : null),
  tallyHtml: (state) => [stat("점수", state.score) + stat("남은 목숨", state.lives) + stat("단계", `${state.level}/${LEVELS}`), ""],
  contact: (sound) => sound.hop(),
  toolsLayout: "arrows",
  tools: [
    { label: "↑", name: "위로", point: 0, area: "up" },
    { label: "←", name: "왼쪽으로", point: 3, area: "left" },
    { label: "↓", name: "아래로", point: 2, area: "down" },
    { label: "→", name: "오른쪽으로", point: 1, area: "right" },
  ],
  stages: Array.from({ length: LEVELS }, (_, i) => i + 1).map((level) => ({ value: String(level), name: `${level}단계`, note: `고양이 ${Math.min(4, 1 + level)}마리`, art: mazeArt(level) })),
  name: "생쥐 미로",
  english: "Mouse Maze",
  number: "NO. 39 — CRUMBS AND CATS",
  intro: `<p>도트로 그린 부엌 미로.<br>생쥐가 되어 고양이를 피해 다니며 치즈 부스러기를 남김없이 모으세요.</p>`,
  meta: `1인 · 미로 ${LEVELS}개 · 목숨 ${LIVES}개`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>CRUMBS AND CATS</span>`,
  artClass: "hexa-art",
  artLabel: "생쥐 미로 미리보기",
  tableLabel: "THE KITCHEN MAZE",
  tableNote: () => `미로 ${LEVELS}개 · 목숨 ${LIVES}개`,
  rulesTitle: "고양이를 피해 치즈를 모두 모으세요",
  rules:
    part("기본 규칙", steps("벽돌 벽 사이의 길마다 <b>치즈 부스러기</b>가 놓여 있습니다. 생쥐가 지나가면 줍습니다.", "<b>고양이</b>들이 미로 가운데 바구니에서 하나씩 나와 생쥐를 쫓습니다. 닿으면 목숨 하나를 잃고 처음 자리에서 다시 시작합니다.", "부스러기를 <b>모두 주우면</b> 다음 단계의 새 미로가 나옵니다.", `목숨은 ${LIVES}개입니다. 미로 ${LEVELS}개를 모두 비우면 성공, 목숨을 다 잃으면 끝납니다.`, "단계가 오를수록 고양이가 늘고 빨라지며, 고추의 효과는 짧아집니다.")) +
    part("움직이기", table(["방향", "방향키, 판 왼쪽 아래의 화살표 버튼, 또는 판 위를 가고 싶은 쪽으로 쓸어 줍니다."], ["미리 누르기", "모퉁이에 닿기 전에 눌러 두면 길이 열리는 곳에서 그쪽으로 돕니다."], ["되돌아가기", "가던 길을 거꾸로 가는 것은 모퉁이가 아니어도 바로 됩니다."], ["멈춤", "벽에 막히면 그 자리에 섭니다."])) +
    part("고추와 고양이", table(["매운 고추", "네 귀퉁이에 하나씩, 깜박이며 놓여 있습니다. 먹으면 잠시 동안 <b>고양이들이 파랗게 질려 도망칩니다</b>."], ["질린 고양이", "이때 닿으면 고양이가 바구니로 쫓겨 갑니다(200점). 잠시 뒤 다시 나옵니다."], ["끝날 때", "효과가 끝나기 직전에는 고양이가 깜박입니다."], ["고양이의 성격", "주황은 곧장 쫓아오고, 검정은 앞길을 막으려 하고, 흰둥이는 가까워지면 딴 데로 가며, 갈색은 제멋대로 다닙니다."])) +
    part("점수", table(["치즈 부스러기", "10점"], ["매운 고추", "50점"], ["질린 고양이", "200점"], ["미로 하나", "500점 × 단계"], ["시작 단계", "<b>새 게임</b>을 누르면 미로 그림을 보고 시작할 단계를 고를 수 있습니다."])) +
    part("일시정지", table(["멈추기", "판 오른쪽 위의 <b>❙❙</b> 버튼이나 키보드 P를 누르면 멈춥니다."], ["이어 하기", "같은 자리의 <b>▶</b> 버튼이나 P를 다시 누르면 이어집니다."])) +
    part("처음이라면", notes("막다른 길은 없습니다. 쫓기면 돌아갈 길이 있는 쪽으로 달립니다.", "고추는 고양이가 가까이 몰려왔을 때 먹어야 값을 합니다.", "고양이가 바구니에서 나오기 전, 시작하자마자 가운데 둘레를 먼저 비웁니다.")),
  help: "키보드: 방향키 · 터치: 가고 싶은 쪽으로 쓸거나 화살표 버튼",
  sides: ["나", ""],
  startWord: "미로에 들어가기",
};
