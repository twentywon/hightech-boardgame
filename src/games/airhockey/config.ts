import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { HOST_ONLY } from "../../net/match";
import { NEED, POINTS, SETS, airHockey, setNumber, type State } from "./rules";
import { HOLD } from "./sim";
import { AIRHOCKEY_COLORS, AirHockeyView } from "./view";

/**
 * What the two sides are called: against the computer 나 and 컴퓨터, two at one screen 왼쪽 and 오른쪽 (as they sit);
 * over Wi-Fi by their mallets' colours, since each device sees the table from its own side.
 */
const NAMES = { ai: ["나", "컴퓨터"], local: ["왼쪽", "오른쪽"], net: ["빨강", "파랑"] } as const;
/** The set scores: a column for each set (finished ones with their score, the one being played with its goals so far). */
function setTable(state: State, mode: "local" | "ai" | "net") {
  const now = state.winner === null ? state.done.length : -1,
    cell = (k: number, p: 0 | 1) => {
      const score = k < state.done.length ? state.done[k] : k === now ? state.score : null;
      if (!score) return `<i class="ah-cell">·</i>`;
      const won = k < state.done.length && score[p] > score[1 - p];
      return `<i class="ah-cell${k === now ? " now" : ""}${won ? " won" : ""}">${score[p]}</i>`;
    },
    row = (p: 0 | 1, name: string) => `<span class="ah-row ah-side-${p}"><b>${name}</b>${Array.from({ length: SETS }, (_, k) => cell(k, p)).join("")}<em>${state.sets[p]}</em></span>`;
  return `<span class="ah-table" aria-hidden="true"><span class="ah-row ah-head"><b></b>${Array.from({ length: SETS }, (_, k) => `<i class="ah-cell${k === now ? " now" : ""}">${k + 1}</i>`).join("")}<em>세트</em></span>${row(0, NAMES[mode][0])}${row(1, NAMES[mode][1])}</span>`;
}
export const airHockeyConfig: PointConfig<State> = {
  game: airHockey,
  // The goals are on a lit scoreboard of their own over the table (the panel, drawn as a stadium board).
  panel: "scoreboard",
  live: true,
  pausable: true,
  noUndo: true,
  // A goal, by either side, is told across the table, and a set won or lost (the match's end has its own word); for
  // two at one screen a set is told by the side that took it, never as one person's win or loss.
  cheer: (before, state) => (state.ply <= before.ply || state.winner !== null ? null : "GOAL"),
  // A set won or lost is told over the table with its score (the set that ends the match is told by the finale);
  // two at one screen hear which side took it.
  setResult: (before, state, mode, seat) => {
    if (state.winner !== null || state.done.length <= before.done.length) return null;
    const n = state.done.length,
      [left, right] = state.done[n - 1],
      took = left > right ? 0 : 1,
      detail = `${left} : ${right} · 세트 ${state.sets[0]} : ${state.sets[1]}`;
    // Over Wi-Fi each device hears its own seat's win or loss (one watching hears the colour that took it).
    if (seat !== undefined)
      return seat === 0 || seat === 1 ? { outcome: took === seat ? "win" : "lose", word: `${n}세트 ${took === seat ? "승리" : "패배"}`, detail } : { outcome: "win", word: `${n}세트 · ${NAMES.net[took]}`, detail };
    return mode === "local"
      ? { outcome: "win", word: `${n}세트 · ${NAMES.local[took]}`, detail }
      : { outcome: took === 0 ? "win" : "lose", word: `${n}세트 ${took === 0 ? "승리" : "패배"}`, detail };
  },
  // The board: the set being played over the middle and each side's goals in it, and under it, as on curling's board,
  // every set's score in its column with the sets won at the end (the set being played lit, a set's winner bright).
  tallyHtml: (state, mode = "ai", seat) =>
    [0, 1].map((p) => `${p === 0 ? `<span class="ah-set">SET ${setNumber(state)}</span>${setTable(state, seat !== undefined ? "net" : mode)}` : ""}<span class="ah-points">${state.score[p]}</span>`) as [string, string],
  view: (host, quality, _variant, mode, level, _net, live) => new AirHockeyView(host, quality, level, mode === "local" && !live, live),
  // Over Wi-Fi (와이파이 여럿이) two devices play a mallet each, the table run by the host's (`src/net/live.ts`); a goal
  // is the host's move alone. A dropped player's mallet is the host's computer's until they come back.
  net: {
    seats: () => NAMES.net.map((label, p) => ({ label, color: AIRHOCKEY_COLORS[p], kinds: ["computer"] })),
    toMove: () => HOST_ONLY,
    hint: (s, seat) =>
      `${setNumber(s)}세트 ${s.score[0]} 대 ${s.score[1]} (세트 ${s.sets[0]} 대 ${s.sets[1]}). ${seat === 0 || seat === 1 ? `내 말렛은 ${NAMES.net[seat]}입니다. 퍽을 쳐서 상대 골문에 넣으세요.` : "구경하는 중입니다."}`,
  },
  colors: AIRHOCKEY_COLORS,
  // The puck clacks off a mallet, knocks on a rail and clatters down a goal's chute, each as hard as it was struck.
  knock: (sound, kind, strength) => (kind === "disc" ? sound.puck(strength) : kind === "cushion" ? sound.rail(strength) : sound.slot()),
  name: "에어하키",
  english: "Air Hockey",
  number: "NO. 69 — BEST OF THREE SETS",
  intro: `<p>펍 한쪽의 에어하키 테이블.<br>공기 위에 뜬 퍽을 말렛으로 쳐서 상대의 골문에 넣으세요. 컴퓨터와 겨루거나, 한 화면에서 둘이 손가락으로 함께 칩니다. ${POINTS}점 내기 ${SETS}세트, ${NEED}세트를 먼저 따면 이깁니다.</p>`,
  meta: `컴퓨터 대전 · 로컬 2인 · 와이파이 여럿이 · ${POINTS}점 내기 ${SETS}세트 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>BEST OF ${SETS} SETS</span>`,
  artClass: "foosball-art",
  artLabel: "에어하키 테이블 미리보기",
  tableLabel: "THE PUB AIR HOCKEY",
  tableNote: () => `실시간 · ${POINTS}점 내기 ${SETS}세트`,
  firstNote: "내가 빨간 말렛으로 왼쪽 골문을 지키고 오른쪽 골문으로 공격합니다.",
  rulesTitle: `${POINTS}점 내기 ${SETS}세트, ${NEED}세트를 먼저 따세요`,
  rules:
    part("기본 규칙", steps("테이블 표면에서 공기가 나와 <b>퍽</b>이 거의 미끄러지듯 움직입니다.", "왼쪽은 빨간 말렛, 오른쪽은 파란 말렛입니다. 컴퓨터 대전에서는 내가 왼쪽, 컴퓨터가 오른쪽이고, 로컬 2인에서는 두 사람이 한 화면의 왼쪽과 오른쪽을 맡습니다. 말렛은 <b>자기 쪽 절반</b>에서만 움직입니다.", "퍽이 상대 쪽 끝의 <b>골문 틈</b>으로 들어가면 1점입니다. 골을 내준 쪽 진영에 퍽이 다시 놓입니다.", `퍽이 한쪽 진영에 <b>${HOLD}초</b>보다 오래 머물면 '시간 초과'로 상대 진영에 퍽이 놓입니다. 구석에 갇힌 퍽도 이렇게 다시 나옵니다.`, `<b>${POINTS}점</b>을 먼저 내면 그 세트를 땁니다. 다음 세트는 0 대 0에서 다시 시작합니다.`, `${SETS}세트 가운데 <b>${NEED}세트</b>를 먼저 따면 이깁니다.`)) +
    part("모드", table(["컴퓨터 대전", "내가 왼쪽 빨간 말렛을 잡고 오른쪽의 컴퓨터와 겨룹니다. 컴퓨터의 실력은 레벨로 고릅니다."], ["로컬 2인", "한 화면에서 둘이 겨룹니다. 화면을 동시에 여러 손가락으로 눌러도 되어서, 휴대폰이나 태블릿을 가운데 두고 양쪽에서 함께 칠 수 있습니다."], ["와이파이 여럿이", "같은 와이파이의 두 기기가 말렛을 하나씩 잡습니다. 방장이 빨강, 들어온 사람이 파랑이고, 저마다 자기 골문이 왼쪽에 오도록 테이블을 봅니다. 한 사람이 일시정지하면 모두 멈춥니다. 연결이 끊긴 사람의 말렛은 다시 들어올 때까지 방장 기기의 컴퓨터가 잡습니다."])) +
    part("전광판", table(["숫자", "이번 세트의 점수입니다. 왼쪽 점수는 빨강, 오른쪽 점수는 파랑입니다."], ["SET", "지금 몇 번째 세트인지 가운데 위에 나옵니다."], ["세트 스코어", "전광판 옆 표에 세트마다의 점수가 칸마다 나오고(지금 세트는 밝게, 이긴 쪽 점수는 굵게), 맨 끝에 딴 세트 수가 나옵니다."])) +
    part("치기", table(["말렛 움직이기", "마우스는 테이블 위로 움직이기만 하면, 터치는 손가락을 댄 채 끌면 말렛이 손이 있는 곳으로 곧바로 따라옵니다(속도 제한 없음). 키보드는 방향키나 W A S D입니다."], ["둘이 칠 때", "테이블 왼쪽 절반을 누른 손가락은 왼쪽 말렛을, 오른쪽 절반을 누른 손가락은 오른쪽 말렛을 잡고, 손을 뗄 때까지 그 말렛을 움직입니다. 같은 쪽을 다른 손가락으로 누르면 그 손가락이 말렛을 넘겨받습니다. 키보드는 왼쪽이 W A S D, 오른쪽이 방향키입니다."], ["세게 치기", "말렛을 빠르게 움직이며 부딪칠수록 퍽이 세게 나갑니다. 가만히 대고 있으면 막기만 합니다."], ["벽 맞히기", "퍽은 옆 레일에 맞고 튕겨 나옵니다. 비스듬히 쳐서 레일을 맞히면 상대가 막기 어렵습니다."], ["구석의 퍽", "구석이나 끝 레일에 붙은 퍽을 말렛으로 누르고만 있으면 빠져나오지 않습니다. 열린 쪽에서 비스듬히 쳐서 레일에 맞고 나오게 하세요."])) +
    part("레벨", table(["쉬움", "컴퓨터의 말렛이 느리고 자주 엉뚱한 곳을 노립니다."], ["보통", "알맞은 빠르기로 막고 칩니다."], ["어려움", "빠르게 반응하고 정확히 노립니다."])) +
    part("처음이라면", notes("퍽이 내 쪽으로 오면 먼저 골문 앞을 막고, 퍽이 느려졌을 때 칩니다.", "퍽의 바로 뒤에서 상대 골문 쪽으로 밀어내듯 치면 곧게 나갑니다.", "공격한 뒤에는 말렛을 얼른 골문 앞으로 되돌립니다.", `퍽을 오래 붙잡고 있지 마세요. ${HOLD}초가 지나면 상대에게 넘어갑니다.`)),
  help: "마우스: 테이블 위로 움직이면 말렛이 그대로 따라옵니다<br>터치: 끌어서 움직입니다(둘이서는 각자 자기 쪽 절반을 누릅니다)<br>키보드: 방향키 · W A S D (둘이서는 왼쪽 W A S D, 오른쪽 방향키)",
  sides: ["왼쪽", "오른쪽"],
  startWord: "말렛을 잡기",
};
