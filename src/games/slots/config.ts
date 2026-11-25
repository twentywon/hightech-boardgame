import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BET, CASH, HURRY, LINES, MAX, MODES, PULL, slotMachine, type State } from "./rules";
import { ANY_HIGH, BETS, LINE_CHOICES, N, ONE_CHERRY, STRIPS, SYMBOLS, THREE, TWO_CHERRIES, returnToPlayer } from "./sim";
import { SLOT_COLORS, SlotView } from "./view";

const made = (to: number) => ({ from: -1, to, extra: -1 });
const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** The return to the player, worked out exactly from the strips (about 95.4%). */
const RTP = Math.round(returnToPlayer(1) * 1000) / 10;
/** A small picture of a purse: three reels with sevens, and a heap of coins, larger for the larger purse. */
function modeArt(credits: number) {
  const coins = credits >= 3000 ? 9 : credits >= 1000 ? 6 : 3,
    coin = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="13" ry="5" fill="#9a6a18"/><ellipse cx="${x}" cy="${y - 2}" rx="13" ry="5" fill="#f0c24a" stroke="#b8862a" stroke-width="1.5"/>`,
    heap = Array.from({ length: coins }, (_, k) => coin(44 + (k % 3) * 26, 124 - Math.floor(k / 3) * 9)).join(""),
    reel = (x: number) => `<rect x="${x}" y="40" width="30" height="50" rx="4" fill="#fffdf6"/><text x="${x + 15}" y="78" text-anchor="middle" font-size="34" font-weight="900" fill="#c8121a" font-family="Arial Black, sans-serif">7</text>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="16" fill="#8a1020"/><rect x="14" y="12" width="112" height="20" rx="6" fill="#ffd23a"/><text x="70" y="27" text-anchor="middle" font-size="14" font-weight="900" fill="#5a0a18" font-family="Helvetica, Arial, sans-serif">${credits}</text><rect x="18" y="36" width="104" height="58" rx="6" fill="#1a0a14"/>${reel(24)}${reel(55)}${reel(86)}${heap}</svg>`;
}
const count = (reel: number, symbol: number) => STRIPS[reel].filter((s) => s === symbol).length;
export const slotMachineConfig: PointConfig<State> = {
  game: slotMachine,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  view: (host, quality) => new SlotView(host, quality),
  colors: SLOT_COLORS,
  newGameLabel: "크레딧 고르기",
  // Space (or Enter, or ↓) pulls the lever and, while the reels turn, stops the next; ↑ the bet, ← → the lines, M the most.
  keyMove: (key, state, repeat) => {
    if (repeat) return null;
    if (key === " " || key === "Enter" || key === "ArrowDown") return made(state.pending ? HURRY : PULL);
    if (state.pending) return null;
    if (key === "ArrowUp") return made(BET);
    if (key === "ArrowLeft" || key === "ArrowRight") return made(LINES);
    if (key === "m" || key === "M") return made(MAX);
    return null;
  },
  bankrupt: (state) => state.winner === 1 && !state.cashed,
  tallyHtml: (state) => [stat("크레딧", state.credits) + stat("베팅", `${state.lines}라인 × ${state.bet}`) + stat("당첨", state.pending ? "-" : state.paid), ""],
  // The reels whirr while they turn and clack as each stops; the lever thunks, the buttons click, the credits tick
  // up, coins rattle into the tray, a win chimes, a big win rings the till, the jackpot more.
  knock: (sound, kind: string, strength) => {
    if (kind === "whirr") sound.motor(strength * 0.7);
    else if (kind === "stop") sound.clack(0.9);
    else if (kind === "lever") sound.clasp(1);
    else if (kind === "button") sound.tap();
    else if (kind === "deny") sound.soft(1, 0.3);
    else if (kind === "tick") sound.bbTick(0.35);
    else if (kind === "coin") sound.coin(0.5);
    else if (kind === "win") sound.chime();
    else if (kind === "big") {
      sound.cash();
      sound.sparkle();
    } else if (kind === "jackpot") {
      sound.ding(1);
      sound.applause(0.8, 0.2);
    }
  },
  tools: [
    { label: "스핀", name: "레버 당기기", point: PULL, onBoard: true, show: (state) => state.winner === null && !state.pending },
    { label: "멈춤", name: "다음 릴 멈추기", point: HURRY, onBoard: true, show: (state) => !!state.pending },
    { label: "라인", name: "라인 바꾸기", point: LINES, onBoard: true, show: (state) => state.winner === null && !state.pending },
    { label: "베팅", name: "베팅 바꾸기", point: BET, onBoard: true, show: (state) => state.winner === null && !state.pending },
    { label: "최대", name: "최대 베팅", point: MAX, onBoard: true, show: (state) => state.winner === null && !state.pending },
    { label: "정산", name: "정산하고 끝내기", point: CASH, onBoard: true, show: (state) => state.winner === null && !state.pending },
  ],
  stages: MODES.map((mode) => ({ value: mode.value, name: mode.name, note: `크레딧 ${mode.credits}으로 시작`, art: modeArt(mode.credits) })),
  name: "슬롯머신",
  english: "Slot Machine",
  number: "NO. 110 — PULL THE LEVER",
  intro: `<p>오락실 한쪽의 슬롯머신 앞에 앉습니다.<br>레버를 당기면 세 릴이 돌다가 하나씩 멈춥니다. 라인 위에 같은 그림이 세 개 서면 당첨!</p>`,
  meta: "1인 · 릴 3개 · 라인 5개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>PULL THE LEVER</span>`,
  artClass: "hexa-art",
  artLabel: "슬롯머신 미리보기",
  tableLabel: "THE SLOT MACHINE",
  tableNote: (variant) => MODES.find((m) => m.value === variant)?.name ?? MODES[1].name,
  rulesTitle: "레버를 당겨 보세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "라인 수와 한 라인에 걸 크레딧(베팅)을 고릅니다. 한 번 돌리는 데 <b>라인 수 × 베팅</b>만큼 크레딧이 듭니다.",
        "오른쪽의 <b>레버를 아래로 끌어 당기면</b>(또는 <b>스핀</b> 버튼, 스페이스) 세 릴이 돌기 시작해 왼쪽부터 하나씩 멈춥니다. 돌고 있을 때 스핀 버튼이나 스페이스를 누르면 다음 릴이 바로 멈춥니다(결과는 그대로입니다).",
        "고른 라인 위에 당첨 그림이 서면 그 라인의 배당 × 베팅만큼 크레딧을 받습니다. 여러 라인이 함께 맞으면 모두 받습니다.",
        "크레딧이 가장 작은 베팅(1)보다 적어지면 끝납니다(파산). 언제든 <b>정산</b>을 누르면 끝내고, 처음보다 크레딧이 늘었으면 승리입니다.",
      ),
    ) +
    part(
      "라인",
      table(
        ["1라인", "가운데 줄 하나."],
        ["3라인", "위·가운데·아래 세 줄."],
        ["5라인", `세 줄과 두 대각선(왼쪽 위에서 오른쪽 아래, 왼쪽 아래에서 오른쪽 위). 창 양옆의 번호 불이 고른 라인을 알려 줍니다.`],
        ["베팅", `한 라인에 ${BETS.join("·")} 가운데 고릅니다. <b>최대</b>는 크레딧이 되는 만큼 라인과 베팅을 가장 크게 맞춥니다.`],
      ),
    ) +
    part(
      "배당표 (한 라인, 베팅 1당)",
      table(
        ...[6, 5, 4, 3, 2, 1, 0].map((s): [string, string] => [`${SYMBOLS[s]} ${SYMBOLS[s]} ${SYMBOLS[s]}`, `${THREE[s]}${s === 6 ? " (잭팟)" : ""}`]),
        ["BAR·7·별 섞어서 셋", String(ANY_HIGH)],
        ["체리 체리 (왼쪽부터)", String(TWO_CHERRIES)],
        ["체리 (첫째 릴)", String(ONE_CHERRY)],
      ),
    ) +
    part(
      "공정함",
      table(
        ["릴", `릴마다 그림 ${N}칸이 둘러 있습니다. 첫째·둘째 릴은 체리 ${count(0, 0)}·레몬 ${count(0, 1)}·자두 ${count(0, 2)}·종 ${count(0, 3)}·BAR ${count(0, 4)}·7 ${count(0, 5)}·별 ${count(0, 6)}칸, 셋째 릴은 체리 ${count(2, 0)}·레몬 ${count(2, 1)}·자두 ${count(2, 2)}·종 ${count(2, 3)}·BAR ${count(2, 4)}·7 ${count(2, 5)}·별 ${count(2, 6)}칸입니다.`],
        ["멈출 자리", "레버를 당길 때 릴마다 멈출 칸을 무작위로 정합니다. 모든 칸이 똑같이 나옵니다. 멈춤 버튼은 빨리 멈추게 할 뿐 결과를 바꾸지 않습니다."],
        ["환급률", `모든 멈춤 조합을 셈하면 건 크레딧의 평균 <b>${RTP}%</b>가 돌아옵니다(${LINE_CHOICES.join("·")}라인 모두 같습니다). 오래 할수록 조금씩 줄어드는 셈입니다.`],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "라인을 늘리면 한 번에 드는 크레딧도 늘지만 맞을 기회도 늘어납니다.",
        "큰 당첨은 드뭅니다. 크레딧이 늘었을 때 정산하면 승리로 끝납니다.",
        "레버는 끝까지 끌어내려야 걸립니다. 놓으면 튕겨 올라옵니다.",
      ),
    ),
  help: "마우스·터치: 오른쪽 레버를 아래로 끌기, 또는 화면·스핀 버튼 누르기<br>버튼: 정산·라인·베팅·최대·스핀<br>키보드: 스페이스 스핀·멈춤, ↑ 베팅, ← → 라인, M 최대",
  sides: ["나", ""],
  startWord: "슬롯머신 앞에 앉기",
};
