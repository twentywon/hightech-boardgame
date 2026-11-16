import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BONUS, DROP, LEVELS, MISSED, PRIZE, STEER, clawMachine, type State } from "./rules";
import { AIM_TIME, GRIP, KINDS } from "./sim";
import { CLAW_COLORS, ClawView } from "./view";

/** The keys: arrows steer the claw (up is toward the back), space or Enter lets it down. */
const KEYS: Record<string, number> = { ArrowUp: STEER, ArrowRight: STEER + 1, ArrowDown: STEER + 2, ArrowLeft: STEER + 3, " ": DROP, Enter: DROP };
const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a level: a claw over a toy, gripping it more or less tightly. */
function levelArt(level: number) {
  const open = [6, 12, 18][level - 1];
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="16" fill="#ff6fae"/><rect x="14" y="14" width="112" height="112" rx="10" fill="#d8ccff"/><line x1="70" y1="14" x2="70" y2="52" stroke="#3a3f48" stroke-width="3"/><circle cx="70" cy="56" r="8" fill="#d8dde4"/><path d="M64 60 l-${open} 22 l6 8 M76 60 l${open} 22 l-6 8" stroke="#d8dde4" stroke-width="5" fill="none" stroke-linecap="round"/><circle cx="70" cy="100" r="17" fill="#a86a3a"/><circle cx="57" cy="86" r="6" fill="#a86a3a"/><circle cx="83" cy="86" r="6" fill="#a86a3a"/><circle cx="64" cy="98" r="2" fill="#141018"/><circle cx="76" cy="98" r="2" fill="#141018"/><ellipse cx="70" cy="105" rx="6" ry="4" fill="#f0d2a8"/><rect x="14" y="116" width="112" height="10" fill="#ffb3d1"/><text x="70" y="30" text-anchor="middle" font-size="12" font-weight="800" fill="#7a1450" font-family="Helvetica, Arial, sans-serif">${LEVELS[level - 1].tries}회</text></svg>`;
}
export const clawConfig: PointConfig<State> = {
  game: clawMachine,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  newGameLabel: "레벨 선택",
  view: (host, quality) => new ClawView(host, quality),
  colors: CLAW_COLORS,
  keyMove: (key) => (key in KEYS ? { from: -1, to: KEYS[key], extra: -1 } : null),
  tallyHtml: (state) => [stat("뽑은 인형", state.prizes.length) + stat("남은 횟수", state.tries), ""],
  // A toy down the chute rings, a try that comes to nothing thuds, the prongs closing clack.
  contact: (sound, state) => {
    const last = state.last ?? -1;
    if (last >= PRIZE) return sound.sparkle();
    if (last === MISSED) return sound.soft(2);
    return sound.knock(1);
  },
  // The arrow keys at the lower left, and the button beside them.
  toolsLayout: "arrows",
  tools: [
    { label: "↑", name: "집게 안쪽으로", point: STEER, area: "up", show: (state) => state.winner === null },
    { label: "←", name: "집게 왼쪽으로", point: STEER + 3, area: "left", show: (state) => state.winner === null },
    { label: "↓", name: "집게 앞쪽으로", point: STEER + 2, area: "down", show: (state) => state.winner === null },
    { label: "→", name: "집게 오른쪽으로", point: STEER + 1, area: "right", show: (state) => state.winner === null },
    { label: "뽑기", name: "집게 내리기", point: DROP, area: "drop", show: (state) => state.winner === null },
  ],
  stages: LEVELS.map((level, i) => ({ value: String(i + 1), name: level.name, note: `${level.tries}회 · 집는 힘 ${Math.round(GRIP[i].close * GRIP[i].hold * 100)}%`, art: levelArt(i + 1) })),
  name: "인형뽑기",
  english: "Claw Machine",
  number: "NO. 67 — CATCH A PRIZE",
  intro: `<p>오락실의 인형뽑기 기계 앞에 섭니다.<br>집게를 인형 위로 옮겨 버튼을 누르면 집게가 내려가 인형을 집어 올립니다. 왼쪽 앞 구멍에 떨어뜨리면 내 것!</p>`,
  meta: `1인 · 인형 ${KINDS.length}가지 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>CATCH A PRIZE</span>`,
  artClass: "hexa-art",
  artLabel: "인형뽑기 미리보기",
  tableLabel: "THE PRIZE CATCHER",
  tableNote: (variant) => LEVELS[(Number(variant) || 1) - 1]?.name ?? LEVELS[0].name,
  rulesTitle: "집게를 맞춰 내리세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "한 번 할 때마다 집게를 인형 위로 옮기고 <b>뽑기</b>를 누릅니다.",
        `옮길 시간은 ${AIM_TIME}초입니다. 시간이 다 되면 집게가 그 자리에서 저절로 내려갑니다.`,
        "집게는 인형이나 바닥에 닿을 때까지 내려가 오므리고 올라온 뒤, 왼쪽 앞의 <b>출구</b> 위로 가서 벌립니다.",
        "인형의 <b>한가운데</b>에 맞춰 내릴수록 잘 집히고, 위로 올라가다 놓칠 일도 적습니다. 놓친 인형은 다른 인형 위로 떨어집니다.",
        "출구로 떨어진 인형은 내 것이 됩니다. 남은 횟수를 다 쓰면 끝나고, 하나라도 뽑았으면 성공입니다.",
      ),
    ) +
    part(
      "움직이기",
      table(
        ["터치·마우스", "유리 너머 인형을 누르면 집게가 그리로 가고, 누른 채 끌면 따라옵니다. 기계 앞 판의 <b>빨간 버튼</b>이나 왼쪽 아래 <b>뽑기</b>로 내립니다."],
        ["키보드", "방향키로 옮기고(↑는 안쪽, ↓는 앞쪽) 스페이스나 Enter로 내립니다."],
        ["빨간 고리", "집게 바로 아래, 집게가 내려가 닿을 자리에 빨간 고리가 보입니다. 앞뒤 거리를 맞출 때 봅니다."],
      ),
    ) +
    part("인형", table(...KINDS.map((kind): [string, string] => [kind.name, kind.r >= 0.42 ? "크고 무거워 잘 미끄러집니다." : kind.r <= 0.34 ? "작고 가벼워 잘 집힙니다." : "보통 크기입니다."]), ["보너스", "놓친 인형이 우연히 출구로 떨어지면 횟수를 쓰지 않고 내 것이 됩니다."])) +
    part("레벨", table(...LEVELS.map((level, i): [string, string] => [level.name, `${level.tries}회. 집게가 ${i === 0 ? "단단히" : i === 1 ? "보통으로" : "약하게"} 집습니다.`]), ["고르기", "위쪽의 <b>레벨 선택</b>을 누르면 고를 수 있습니다."])) +
    part("처음이라면", notes("집게를 정면과 옆에서 맞추듯, 빨간 고리가 인형 한가운데에 오게 합니다.", "다른 인형에 깔린 인형보다 맨 위에 놓인 인형이 집기 쉽습니다.", "레벨이 낮을수록 집게가 단단히 집습니다. 처음에는 후한 기계로 감을 익힙니다.")),
  help: "터치·마우스: 인형을 눌러 집게를 옮기고 빨간 버튼·뽑기로 내립니다<br>키보드: 방향키로 옮기고 스페이스로 내립니다",
  sides: ["나", ""],
  startWord: "동전 넣기",
};
