import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { APPLE, GOAL, GOLD, GOLD_EVERY, LEVELS, TURN, W, H, snake, stonesOf, xy, type State } from "./rules";
import { SNAKE_COLORS, SnakeView } from "./view";

/** The keys that turn the snake: the arrows and WASD. */
const KEYS: Record<string, number> = { ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3, w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3 };
const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a level: the garden with its stones and a gauge of the pace. */
function levelArt(lv: number) {
  const cell = 6,
    ox = 13,
    oy = 26,
    stones = stonesOf(lv)
      .map((sq) => {
        const [x, y] = xy(sq);
        return `<rect x="${ox + x * cell}" y="${oy + y * cell}" width="${cell}" height="${cell}" rx="2" fill="#8a8f95"/>`;
      })
      .join(""),
    pace = Math.round(((220 - LEVELS[lv - 1].speed) / 120) * 5) + 1,
    bars = Array.from({ length: 6 }, (_, i) => `<rect x="${86 + i * 8}" y="${14 - Math.min(i, 5)}" width="5" height="${4 + i}" rx="1" fill="${i < pace ? "#ffd24a" : "#2f5a2c"}"/>`).join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="14" fill="#2f6a2c"/><rect x="${ox - 3}" y="${oy - 3}" width="${W * cell + 6}" height="${H * cell + 6}" rx="4" fill="#a8743f"/><rect x="${ox}" y="${oy}" width="${W * cell}" height="${H * cell}" fill="#8fcf5a"/>${stones}<path d="M${ox + 3 * cell} ${oy + 9.5 * cell} h${4 * cell} v${-3 * cell} h${3 * cell}" stroke="#2f8a2c" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${ox + 10 * cell}" cy="${oy + 6.5 * cell}" r="4" fill="#46a83f"/><circle cx="${ox + 14.5 * cell}" cy="${oy + 6.5 * cell}" r="3.4" fill="#e0302a"/><text x="14" y="18" font-size="12" font-weight="800" fill="#ffffff" font-family="Helvetica, Arial, sans-serif">${lv}</text>${bars}</svg>`;
}
export const snakeConfig: PointConfig<State> = {
  game: snake,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  newGameLabel: "레벨 선택",
  view: (host, quality) => new SnakeView(host, quality),
  colors: SNAKE_COLORS,
  keyMove: (key) => (key in KEYS ? { from: -1, to: TURN + KEYS[key], extra: -1 } : null),
  tallyHtml: (state) => [stat("사과", state.eaten) + stat("점수", state.score), ""],
  // An apple crunches, a golden one glitters, a crash knocks.
  contact: (sound, state) => (state.last?.crashed ? sound.knock(2) : state.last?.ate === "gold" ? sound.sparkle() : sound.pop()),
  // Arrow keys at the lower left, as on a keyboard.
  toolsLayout: "arrows",
  tools: [
    { label: "↑", name: "위로", point: TURN + 0, area: "up", show: (state) => state.winner === null },
    { label: "←", name: "왼쪽으로", point: TURN + 3, area: "left", show: (state) => state.winner === null },
    { label: "↓", name: "아래로", point: TURN + 2, area: "down", show: (state) => state.winner === null },
    { label: "→", name: "오른쪽으로", point: TURN + 1, area: "right", show: (state) => state.winner === null },
  ],
  // 새 게임 (레벨 선택) asks for the level; the first is laid on sitting down.
  stages: LEVELS.map((level, i) => ({ value: String(i + 1), name: `${i + 1}. ${level.name}`, note: level.stones ? (level.stones > 1 ? "돌담 미로" : "돌이 놓인 정원") : "빈 정원", art: levelArt(i + 1) })),
  name: "스네이크",
  english: "Snake",
  number: "NO. 65 — EAT AND GROW",
  intro: `<p>울타리 친 정원을 뱀이 쉬지 않고 기어갑니다.<br>방향을 틀어 사과를 먹을 때마다 뱀이 한 칸 길어집니다. 울타리나 돌, 제 몸에 부딪히면 끝납니다.</p>`,
  meta: `1인 · 정원 ${W}×${H} · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>EAT AND GROW</span>`,
  artClass: "hexa-art",
  artLabel: "스네이크 미리보기",
  tableLabel: "THE GARDEN",
  tableNote: (variant) => LEVELS[(Number(variant) || 1) - 1]?.name ?? LEVELS[0].name,
  rulesTitle: "사과를 먹고 길어지세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "뱀은 멈추지 않고 앞으로 한 칸씩 나아갑니다. <b>방향만 바꿀 수 있고</b>, 바로 뒤로 돌아설 수는 없습니다.",
        `<b>사과</b>를 먹으면 한 칸 길어지고 ${APPLE}점을 얻습니다. 사과는 곧 다른 자리에 다시 생깁니다.`,
        `사과를 ${GOLD_EVERY}개 먹을 때마다 <b>황금 사과</b>가 잠시 나타납니다. 둘레의 고리가 다 줄기 전에 먹으면 ${GOLD}점이고 두 칸 길어집니다.`,
        "사과를 먹을수록 조금씩 빨라집니다.",
        `<b>울타리, 돌, 자기 몸</b>에 머리가 부딪히면 끝납니다. 그때까지 사과를 ${GOAL}개 이상 먹었으면 성공입니다.`,
      ),
    ) +
    part("움직이기", table(["키보드", "방향키나 W·A·S·D로 방향을 바꿉니다."], ["터치·마우스", "판 위를 바꾸고 싶은 쪽으로 쓸어 넘기거나, 왼쪽 아래의 화살표 버튼을 누릅니다."], ["미리 누르기", "다음 두 번의 방향 바꾸기까지 미리 눌러 둘 수 있습니다. 좁은 곳에서 유턴할 때 씁니다."])) +
    part("레벨", table(...LEVELS.map((level, i): [string, string] => [`${i + 1}. ${level.name}`, `${level.stones ? (level.stones > 1 ? "돌담으로 된 미로" : "모서리마다 돌이 놓인 정원") : "빈 정원"}, ${level.speed >= 180 ? "느린 걸음" : level.speed >= 130 ? "보통 걸음" : "빠른 걸음"}`]), ["고르기", "위쪽의 <b>레벨 선택</b>을 누르면 고를 수 있습니다."])) +
    part("처음이라면", notes("벽을 따라 크게 돌면 몸이 길어져도 갇히지 않습니다.", "몸으로 막힌 곳에 들어가기 전에 나올 길이 있는지 봅니다.", "황금 사과가 멀면 무리하지 말고 사과부터 먹습니다.")),
  help: "키보드: 방향키·WASD로 방향을 바꿉니다<br>터치·마우스: 판을 쓸어 넘기거나 화살표 버튼을 누릅니다",
  sides: ["나", ""],
  startWord: "정원에 풀어 놓기",
};
