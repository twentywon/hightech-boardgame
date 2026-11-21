import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CLINK, HIT, LEVEL_NAMES, MISS, ROUND, whackAMole, type State } from "./rules";
import { PACE, WORTH } from "./sim";
import { WHACK_COLORS, WhackView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a level: seven holes, with as many moles up as the level is hard. */
function levelArt(level: number) {
  const holes: [number, number][] = [[50, 46], [90, 46], [30, 76], [70, 76], [110, 76], [50, 106], [90, 106]],
    up = [[3], [1, 4, 5], [0, 2, 3, 6]][level - 1];
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="16" fill="#1f5fd0"/><rect x="14" y="22" width="112" height="106" rx="8" fill="#e8ea4e"/><text x="70" y="17" text-anchor="middle" font-size="12" font-weight="800" fill="#ffd84a" font-family="Helvetica, Arial, sans-serif">${LEVEL_NAMES[level - 1]}</text>${holes
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="13" fill="#f6b81e"/><circle cx="${x}" cy="${y}" r="9.5" fill="#1a1208"/>${up.includes(i) ? `<ellipse cx="${x}" cy="${y - 5}" rx="8" ry="10" fill="#7a5234"/><circle cx="${x - 3}" cy="${y - 8}" r="1.6" fill="#fff"/><circle cx="${x + 3}" cy="${y - 8}" r="1.6" fill="#fff"/><circle cx="${x}" cy="${y - 3}" r="2" fill="#ff7a9a"/>` : ""}`)
    .join("")}</svg>`;
}
export const whackConfig: PointConfig<State> = {
  game: whackAMole,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  newGameLabel: "레벨 선택",
  view: (host, quality) => new WhackView(host, quality),
  colors: WHACK_COLORS,
  tallyHtml: (state) => [stat("점수", state.score) + stat("남은 시간", `${state.left}초`), ""],
  // A mole knocked takes the mallet with a heavy, dull thud (a golden one rings over it), a hard hat clinks, a blow on
  // an empty hole knocks lightly on the deck.
  contact: (sound, state) => {
    const last = state.last ?? -1;
    if (last >= HIT) {
      sound.thud();
      if (last - HIT >= WORTH[1]) sound.sparkle();
      return;
    }
    if (last === CLINK) return sound.tile(2);
    if (last === MISS) return sound.soft(1);
  },
  // 새 게임 (레벨 선택) asks how quick the moles are.
  stages: LEVEL_NAMES.map((name, i) => ({ value: String(i + 1), name, note: `${PACE[i].stay[0].toFixed(1)}초 → ${PACE[i].stay[1].toFixed(1)}초`, art: levelArt(i + 1) })),
  name: "두더지 잡기",
  english: "Whack-a-Mole",
  number: "NO. 66 — KNOCK THEM BACK",
  intro: `<p>오락실의 두더지 잡기 기계 앞에 섭니다.<br>일곱 구멍에서 두더지가 불쑥 튀어나오면 뿅망치로 재빨리 내리치세요. ${ROUND}초 동안 몇 점을 낼 수 있을까요?</p>`,
  meta: `1인 · 구멍 7개 · ${ROUND}초 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>KNOCK THEM BACK</span>`,
  artClass: "hexa-art",
  artLabel: "두더지 잡기 미리보기",
  tableLabel: "THE ARCADE",
  tableNote: (variant) => LEVEL_NAMES[(Number(variant) || 1) - 1] ?? LEVEL_NAMES[0],
  rulesTitle: "튀어나오면 내리치세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "구멍에서 두더지가 튀어나와 잠깐 있다가 다시 들어갑니다.",
        "들어가기 전에 <b>두더지를 누르면</b> 뿅망치가 내리쳐 점수를 얻습니다. 빈 구멍을 치면 헛손질입니다.",
        "잇달아 맞히면 <b>콤보</b>가 붙어 점수를 더 받습니다. 두더지를 놓치거나 헛손질하면 콤보가 끊깁니다.",
        `시간이 흐를수록 두더지가 더 자주, 더 짧게 나옵니다. <b>${ROUND}초</b>가 지나면 끝납니다.`,
      ),
    ) +
    part(
      "두더지",
      table(
        ["갈색 두더지", `${WORTH[0]}점`],
        ["황금 두더지", `${WORTH[1]}점. 드물게 나오고 금방 들어갑니다.`],
        ["안전모 두더지", `두 번 쳐야 합니다. 처음엔 안전모만 날아가고, 두 번째에 ${WORTH[2]}점.`],
        ["콤보", "세 번째 연속 명중부터 한 번에 2점씩, 최대 10점을 더 받습니다."],
      ),
    ) +
    part("치기", table(["마우스·터치", "두더지나 구멍을 누르는 순간 망치가 내려갑니다."], ["키보드", "숫자 1~7: 뒷줄 왼쪽부터 오른쪽으로, 앞줄까지 차례대로 구멍 일곱 개입니다."])) +
    part(
      "나오는 모양",
      table(
        ["한 마리", "가장 흔합니다."],
        ["두세 마리", "아무 구멍에서나 동시에 튀어나옵니다."],
        ["한 줄", "뒷줄·가운뎃줄·앞줄 한 줄이 한꺼번에 나옵니다."],
        ["떼", "네다섯 마리가 한꺼번에 나옵니다."],
        ["물결", "한 줄을 따라, 또는 바깥 구멍을 빙 돌며 차례로 잇달아 나옵니다."],
        ["무작위", "모양은 매번 무작위로 정해지고, 시간이 흐를수록·레벨이 높을수록 여러 마리 모양이 잦아집니다."],
      ),
    ) +
    part("레벨", table(...LEVEL_NAMES.map((name, i): [string, string] => [name, `두더지가 처음엔 ${PACE[i].stay[0].toFixed(1)}초, 끝무렵엔 ${PACE[i].stay[1].toFixed(1)}초 머뭅니다.`]), ["고르기", "위쪽의 <b>레벨 선택</b>을 누르면 고를 수 있습니다."])) +
    part("처음이라면", notes("기계 한가운데를 보며 기다리면 일곱 구멍이 한눈에 들어옵니다.", "황금 두더지는 금방 들어가니 먼저 칩니다.", "헛손질은 점수를 깎지 않지만 콤보를 끊습니다.")),
  help: "마우스·터치: 두더지를 누르면 망치가 내리칩니다<br>키보드: 숫자 1~7로 구멍을 칩니다",
  sides: ["나", ""],
  startWord: "기계에 동전 넣기",
};
