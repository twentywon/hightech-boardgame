import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { FINAL, FIRE, GOAL, LAST_STAGE, ROUND, SCORE, STAGE_NAMES, basketball, type State } from "./rules";
import { LEVELS } from "./sim";
import { BASKETBALL_COLORS, BasketballView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a stage: the hoop on its board, with arrows as far as it slides. */
function levelArt(level: number) {
  const sway = LEVELS[level - 1].sway * 34,
    arrows = sway ? `<path d="M${70 - sway - 18} 50 h-12 l6 -6 M${70 - sway - 30} 50 l6 6 M${70 + sway + 18} 50 h12 l-6 -6 M${70 + sway + 30} 50 l-6 6" stroke="#ffd84a" stroke-width="4" fill="none" stroke-linecap="round"/>` : "";
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="16" fill="#14306f"/><text x="70" y="22" text-anchor="middle" font-size="13" font-weight="800" fill="#ffd84a" font-family="Helvetica, Arial, sans-serif">${STAGE_NAMES[level - 1]}</text><rect x="38" y="32" width="64" height="40" rx="3" fill="rgba(220,235,255,0.25)" stroke="#fff" stroke-width="3"/><rect x="58" y="50" width="24" height="16" fill="none" stroke="#fff" stroke-width="2.5"/>${arrows}<ellipse cx="70" cy="74" rx="17" ry="5" fill="none" stroke="#f05a14" stroke-width="4"/><path d="M55 76 L60 98 M85 76 L80 98 M62 77 L66 98 M78 77 L74 98 M70 79 V98" stroke="#fff" stroke-width="2"/><circle cx="70" cy="120" r="11" fill="#d8611f"/><path d="M59 120 H81 M70 109 V131" stroke="#1b120d" stroke-width="2"/></svg>`;
}
const SWAY = ["골대가 움직이지 않습니다.", "골대가 좌우로 천천히 움직입니다.", "골대가 더 넓게, 조금 빠르게 움직입니다.", "골대가 빠르게 움직입니다.", "골대가 가장 넓고 빠르게 움직입니다."];
export const basketballConfig: PointConfig<State> = {
  game: basketball,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  newGameLabel: "레벨 선택",
  view: (host, quality) => new BasketballView(host, quality),
  colors: BASKETBALL_COLORS,
  tallyHtml: (state) => [stat("점수", state.score) + stat("단계", `${state.stage} · ${state.stageScore}/${GOAL}`) + stat("남은 시간", `${state.left}초`), ""],
  // A stage's goal reached is told across the table before the next begins; three in a row sets the shooter on
  // fire; the last seconds are worth three.
  cheer: (before, state) =>
    state.cleared > before.cleared && state.winner === null
      ? "성공!"
      : state.streak === FIRE && before.streak < FIRE
        ? "ON FIRE"
        : before.left > FINAL && state.left === FINAL
          ? "3점 타임"
          : null,
  // The rim rings, the backboard knocks, a ball bounces on the floor (softer off another ball or the tray's lip), the
  // net swishes, and balls rolling back down the ramp rumble (`Noise` in the view).
  knock: (sound, kind: string, strength) => {
    if (kind === "rim") sound.rim(strength);
    else if (kind === "board") sound.backboard(strength);
    else if (kind === "floor") sound.bounce(strength);
    else if (kind === "ball") sound.bounce(strength * 0.55);
    else if (kind === "lip") sound.bounce(strength * 0.35);
    else if (kind === "net") sound.swish();
    else if (kind === "roll") sound.rolling(strength);
  },
  contact: (sound, state) => {
    if ((state.last ?? 0) >= SCORE + 4) sound.sparkle();
  },
  // 레벨 선택 chooses the stage to begin at.
  stages: STAGE_NAMES.map((name, i) => ({ value: String(i + 1), name, note: SWAY[i], art: levelArt(i + 1) })),
  name: "농구",
  english: "Basketball",
  number: "NO. 70 — SHOOT HOOPS",
  intro: `<p>놀이공원의 농구 기계 앞에 섭니다.<br>앞에 놓인 공을 위로 밀어 던져 골대에 넣으세요. 단계마다 ${ROUND}초 안에 ${GOAL}점을 넣으면 성공, 다음 단계로 넘어갑니다.</p>`,
  meta: `1인 · 공 5개 · ${LAST_STAGE}단계 · 단계마다 ${ROUND}초에 ${GOAL}점 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>SHOOT HOOPS</span>`,
  artClass: "hexa-art",
  artLabel: "농구 미리보기",
  tableLabel: "THE ARCADE",
  tableNote: (variant) => `${STAGE_NAMES[(Number(variant) || 1) - 1] ?? STAGE_NAMES[0]}부터`,
  rulesTitle: "공을 밀어 던져 넣으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "앞쪽 받침대에 공이 놓여 있습니다. <b>화면을 누른 채 위로 밀었다가 놓으면</b> 공을 던집니다.",
        "길게 밀수록 멀리, 비스듬히 밀수록 그쪽으로 날아갑니다. 미는 동안 공이 날아갈 길이 점으로 보입니다.",
        "골대에 들어가면 점수를 얻습니다. 던진 공은 경사로를 굴러 받침대로 돌아와 떨어진 그대로 아무렇게나 놓이고, 손에 가장 가까운 공을 집어 던집니다.",
        `단계마다 <b>${ROUND}초</b> 안에 <b>${GOAL}점</b>을 넣으면 <b>성공</b>! 바로 다음 단계로 넘어갑니다. 각 단계의 시계는 그 단계의 첫 공을 던질 때 돌기 시작합니다.`,
        `시간 안에 ${GOAL}점을 못 넣으면 끝나고, ${LAST_STAGE}단계까지 모두 성공하면 이깁니다.`,
      ),
    ) +
    part(
      "점수",
      table(
        ["한 골", "2점"],
        ["단계 목표", `${GOAL}점. 넘친 점수는 다음 단계로 넘어가지 않지만 합계에는 들어갑니다.`],
        ["3점 타임", `마지막 ${FINAL}초에는 한 골에 3점입니다.`],
        ["불꽃 슛", `${FIRE}골을 잇달아 넣으면 공에 불이 붙어, 놓칠 때까지 한 골에 1점을 더 받습니다.`],
      ),
    ) +
    part("던지기", table(["마우스·터치", "누른 채 위로 밀었다가 놓습니다. 화면 아무 곳에서나 됩니다."], ["키보드", "스페이스를 누르고 있으면 힘이 오르내리고, 놓는 순간 던집니다. ← →로 방향을 바꿉니다."])) +
    part("단계", table(...STAGE_NAMES.map((name, i): [string, string] => [name, SWAY[i]]), ["고르기", "위쪽의 <b>레벨 선택</b>에서 시작할 단계를 고를 수 있습니다."])) +
    part("처음이라면", notes("화면 높이의 4분의 1쯤 곧게 밀어 올리면 골대 근처에 닿습니다.", "점이 가리키는 길을 보며 힘을 맞춥니다.", "골대가 움직일 때는 골대가 갈 곳을 앞질러 던집니다.")),
  help: "마우스·터치: 누른 채 위로 밀었다가 놓아 던집니다<br>키보드: 스페이스로 힘을 모아 놓으면 던지고, ← →로 방향",
  sides: ["나", ""],
  startWord: "기계에 동전 넣기",
};
