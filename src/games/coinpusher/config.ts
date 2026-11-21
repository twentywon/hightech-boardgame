import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { HOLD, LET, MODES, SLIDE, STOP, coinPusher, type State } from "./rules";
import { PRIZES, PUSHER } from "./sim";
import { COIN_COLORS, CoinPusherView, HOLD_EVERY } from "./view";

const made = (to: number) => ({ from: -1, to, extra: -1 });
const ARROWS: Record<string, number> = { ArrowLeft: 0, ArrowRight: 1 };
const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a way to play: a heap of coins, larger for the larger purse, and the sign for without end. */
function modeArt(mode: string) {
  const coins = mode === "30" ? 5 : mode === "60" ? 9 : 0,
    coin = (x: number, y: number) => `<ellipse cx="${x}" cy="${y}" rx="17" ry="7" fill="#9a6a18"/><ellipse cx="${x}" cy="${y - 3}" rx="17" ry="7" fill="#f0c24a" stroke="#b8862a" stroke-width="2"/>`,
    heap = Array.from({ length: coins }, (_, k) => coin(44 + (k % 3) * 26 + (Math.floor(k / 3) % 2) * 13, 112 - Math.floor(k / 3) * 12)).join(""),
    endless = `<path d="M44 84 c0 -22 26 -22 26 0 s26 22 26 0 s-26 -22 -26 0 s-26 22 -26 0z" fill="none" stroke="#ffd23a" stroke-width="9" stroke-linecap="round"/>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="16" fill="#1d2a8c"/><rect x="14" y="14" width="112" height="22" rx="6" fill="#ff4fa8"/><rect x="14" y="44" width="112" height="82" rx="8" fill="#16288a"/>${coins ? heap : endless}</svg>`;
}
export const coinPusherConfig: PointConfig<State> = {
  game: coinPusher,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  view: (host, quality) => new CoinPusherView(host, quality),
  colors: COIN_COLORS,
  // A key held down repeats; only its first press is a move. An arrow held pushes the chute along; space or Enter held keeps dropping coins.
  keyMove: (key, _state, repeat) => (repeat ? null : key in ARROWS ? made(SLIDE + ARROWS[key]) : key === " " || key === "Enter" ? made(HOLD) : null),
  keyUp: (key) => (key in ARROWS ? made(STOP + ARROWS[key]) : key === " " || key === "Enter" ? made(LET) : null),
  tallyHtml: (state) => [stat("딴 동전", state.won) + stat(state.endless ? "넣은 동전" : "남은 동전", state.endless ? state.dropped : state.hand), ""],
  // Coins clink as they land and pour into the tray; the roulette ticks round, rings where it stops, and a jackpot rings the till.
  knock: (sound, kind: string, strength) => {
    if (kind === "clink") sound.coin(0.25 + 0.5 * strength);
    else if (kind === "drop") sound.coin(0.45);
    else if (kind === "tray") sound.coin(0.85);
    else if (kind === "rattle") {
      sound.coin(1);
      sound.chips();
    } else if (kind === "tick") sound.tap();
    else if (kind === "stop") sound.sparkle();
    else if (kind === "bonus") sound.chips();
    else if (kind === "jackpot") sound.cash();
  },
  toolsLayout: "arrows",
  tools: [
    { label: "←", name: "투입구 왼쪽으로", point: SLIDE, release: STOP, area: "left", show: (state) => state.winner === null },
    { label: "→", name: "투입구 오른쪽으로", point: SLIDE + 1, release: STOP + 1, area: "right", show: (state) => state.winner === null },
    { label: "동전 넣기", name: "동전 넣기", point: HOLD, release: LET, area: "drop", show: (state) => state.winner === null },
  ],
  stages: MODES.map((mode) => ({ value: mode.value, name: mode.name, note: mode.coins ? `${mode.coins}개보다 많이 따면 성공` : "동전이 떨어지지 않습니다", art: modeArt(mode.value) })),
  name: "코인 푸셔",
  english: "Coin Pusher",
  number: "NO. 99 — PUSH THEM OVER",
  intro: `<p>오락실의 코인 푸셔 앞에 섭니다.<br>동전을 떨어뜨리면 앞뒤로 움직이는 밀대가 동전 더미를 밀어 냅니다. 앞 끝으로 떨어지는 동전은 내 것!</p>`,
  meta: "1인 · 동전 수백 개 · 실시간",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>PUSH THEM OVER</span>`,
  artClass: "hexa-art",
  artLabel: "코인 푸셔 미리보기",
  tableLabel: "THE COIN PUSHER",
  tableNote: (variant) => MODES.find((m) => m.value === variant)?.name ?? MODES[0].name,
  rulesTitle: "밀대가 밀 때를 노리세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "기계를 누르면 투입구가 그 줄 위로 가서 동전 하나를 떨어뜨립니다. 누르고 있으면 " + HOLD_EVERY + "초마다 하나씩 계속 떨어집니다.",
        "동전은 앞뒤로 움직이는 <b>밀대</b> 위나 그 앞에 떨어집니다. 밀대가 나오면서 앞의 동전을 밀고, 들어갈 때는 위의 동전이 뒷벽에 긁혀 앞으로 떨어집니다.",
        "판 앞 끝으로 떨어진 동전은 아래 <b>받침</b>으로 나와 내 것이 됩니다. 양옆 <b>홈</b>으로 떨어진 동전은 잃습니다.",
        "가진 동전을 다 넣고 판이 멈추면 끝납니다. 처음 받은 동전보다 많이 따면 성공입니다.",
      ),
    ) +
    part(
      "기계",
      table(
        ["밀대", `앞뒤로 한 번 오가는 데 약 ${PUSHER.period}초가 걸립니다. 밀대가 물러나 있을 때 떨어진 동전은 바로 다음에 밀려 나갑니다.`],
        ["투입구", "뒷벽 위의 금빛 깔때기입니다. 왼쪽 아래 화살표나 방향키를 누르고 있으면 그쪽으로 움직입니다."],
        ["홈", "판 앞쪽 양옆의 어두운 틈입니다. 빨간 불이 켜져 있습니다. 가장자리로 너무 몰아 넣으면 이리로 빠집니다."],
        ["계수기", "받침 위 숫자판에 남은 동전과 딴 동전이 나옵니다."],
      ),
    ) +
    part(
      "보너스",
      table(
        ["별 메달", "빨간 바탕에 금별이 그려진 메달이 동전 사이에 섞여 있습니다. 넣는 동전도 가끔 메달로 나옵니다."],
        ["룰렛", "메달이 앞으로 떨어지면 뒷벽의 룰렛 불이 돌다가 멈춥니다."],
        ["동전 비", `멈춘 칸의 수만큼 동전이 위에서 판 위로 쏟아집니다(${[...new Set(PRIZES.filter((p) => p.shower && !p.jackpot).map((p) => p.shower))].join("·")}개).`],
        ["동전 받기", `+ 칸은 그만큼 동전을 손에 더 줍니다(${[...new Set(PRIZES.filter((p) => p.hand).map((p) => p.hand))].join("·")}개).`],
        ["잭팟", `금빛 ★칸에 멈추면 동전 ${PRIZES.find((p) => p.jackpot)?.shower}개가 쏟아집니다.`],
      ),
    ) +
    part(
      "모드",
      table(...MODES.map((mode): [string, string] => [mode.name, mode.coins ? `동전 ${mode.coins}개로 시작합니다.` : "동전이 끝없이 나옵니다. 끝나지 않고, 딴 동전만 셉니다."]), ["고르기", "위쪽의 <b>새 게임</b>을 누르면 고를 수 있습니다."]),
    ) +
    part(
      "처음이라면",
      notes(
        "밀대가 다 물러났을 때 동전이 그 앞에 떨어지게 하면 바로 밀려 들어갑니다.",
        "앞 끝에 동전이 많이 걸쳐 있는 줄을 노립니다.",
        "양 끝 줄은 홈으로 빠지기 쉽습니다. 가운데 쪽에 넣습니다.",
        "한꺼번에 많이 넣기보다 판이 움직이는 것을 보며 넣습니다.",
      ),
    ),
  help: "터치·마우스: 기계를 누르면 그 줄에 동전이 떨어지고, 누르고 있으면 계속 떨어집니다<br>키보드: ← →로 투입구를 옮기고 스페이스로 넣습니다",
  sides: ["나", ""],
  startWord: "기계 앞에 서기",
};
