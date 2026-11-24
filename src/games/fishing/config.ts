import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CAST, CATCH, HOOK, LATE, LEVEL_NAMES, ROUND, SCARED, SLIP, SNAP, fishing, type State } from "./rules";
import { BOOT, CAN, GOLDEN, KINDS, LEVELS, SLACK } from "./sim";
import { FISHING_COLORS, FishingView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a level: the lake at evening, the float out on it, and as many fish under it as the level is hard. */
function levelArt(level: number) {
  const fish = [[[70, 104]], [[46, 98], [96, 110]], [[34, 96], [76, 112], [108, 100]]][level - 1];
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="fs${level}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7eaedb"/><stop offset="1" stop-color="#e9e3cf"/></linearGradient></defs><rect x="4" y="4" width="132" height="132" rx="16" fill="url(#fs${level})"/><path d="M4 62 Q30 48 52 58 T100 52 T136 58 V70 H4Z" fill="#5d7f5a"/><path d="M4 66 H136 V120 Q136 136 120 136 H20 Q4 136 4 120Z" fill="#2f6474"/><circle cx="38" cy="40" r="9" fill="#fff4d6"/><text x="70" y="26" text-anchor="middle" font-size="13" font-weight="800" fill="#1d3442" font-family="Helvetica, Arial, sans-serif">${LEVEL_NAMES[level - 1]}</text><ellipse cx="70" cy="80" rx="12" ry="3" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/><rect x="68.5" y="66" width="3" height="14" rx="1.5" fill="#ff3a2a"/><rect x="68.5" y="72" width="3" height="3" fill="#ffd22a"/>${fish
    .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="11" ry="4.5" fill="#173a44" opacity=".75"/><path d="M${x - 10} ${y} l-7 -5 v10z" fill="#173a44" opacity=".75"/>`)
    .join("")}<path d="M70 66 Q100 40 120 8" stroke="#fff" stroke-opacity=".8" stroke-width="1" fill="none"/></svg>`;
}
export const fishingConfig: PointConfig<State> = {
  game: fishing,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  newGameLabel: "레벨 선택",
  view: (host, quality) => new FishingView(host, quality),
  colors: FISHING_COLORS,
  tallyHtml: (state) => [stat("점수", state.score) + stat("남은 시간", `${state.left}초`), ""],
  // The float lands with a plop; a strike swishes; a catch comes out with a splash (a golden carp rings over it, a
  // can clinks, a boot thuds); a snapped line twangs; a fish lost slips away softly.
  contact: (sound, state) => {
    const last = state.last ?? -1;
    if (last >= CATCH) {
      const kind = state.landed?.kind ?? 0;
      if (kind === CAN) return sound.tile(2);
      if (kind === BOOT) return sound.soft(3);
      sound.splash();
      if (kind === GOLDEN) sound.sparkle();
      return;
    }
    if (last === CAST) return sound.plop();
    if (last === HOOK) return sound.swish();
    if (last === SNAP) return sound.bow();
    if (last === SCARED || last === LATE || last === SLIP) return sound.soft(2);
  },
  // What the lake does between moves (`onKnock` in the view): the rod's whoosh as it is cast, the float's small
  // nibbles and the bite pulling it under, a fish surging (a splash when it runs hard), and the reel's clicks.
  knock: (sound, kind: string, strength) => {
    if (kind === "cast") sound.swish();
    else if (kind === "nibble") sound.plunk(0.25, 0.2);
    else if (kind === "bite") sound.plunk(0.8, 0.7);
    else if (kind === "surge") {
      if (strength > 0.6) sound.splash();
      else sound.plop();
    } else if (kind === "reel") sound.bbTick(strength);
  },
  // 새 게임 (레벨 선택) asks how quick the bites are.
  stages: LEVEL_NAMES.map((name, i) => ({ value: String(i + 1), name, note: `챔질 ${LEVELS[i].bite.toFixed(i === 2 ? 2 : 1)}초`, art: levelArt(i + 1) })),
  name: "낚시",
  english: "Fishing",
  number: "NO. 105 — WATCH THE FLOAT",
  intro: `<p>잔잔한 호수의 나무 잔교에 서서 낚싯대를 드리웁니다.<br>찌가 쑥 들어가는 순간 당겨 물고기를 걸고, 줄이 끊어지지 않게 감아 올리세요. ${ROUND}초 동안 몇 점을 낼 수 있을까요?</p>`,
  meta: `1인 · ${ROUND}초 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>WATCH THE FLOAT</span>`,
  artClass: "hexa-art",
  artLabel: "낚시 미리보기",
  tableLabel: "THE LAKE",
  tableNote: (variant) => LEVEL_NAMES[(Number(variant) || 1) - 1] ?? LEVEL_NAMES[0],
  rulesTitle: "찌가 움직일 때 당기세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "물을 누르면 그곳으로 찌를 던집니다. 너무 가깝거나 먼 곳은 던질 수 있는 데까지만 날아갑니다.",
        "물고기가 오면 먼저 찌가 <b>톡톡</b> 움직입니다(입질). 이때 당기면 물고기가 놀라 달아납니다.",
        "찌가 <b>쑥 들어가는 순간</b> 눌러 챔질하면 물고기가 걸립니다. 늦으면 미끼만 먹고 달아납니다.",
        "걸린 물고기는 <b>누르고 있는 동안</b> 감깁니다. 잔교까지 끌어오면 잡힙니다.",
        `<b>${ROUND}초</b>가 지나면 끝납니다. 잡은 것의 점수를 모두 더합니다.`,
      ),
    ) +
    part(
      "줄다리기",
      table(
        ["장력", "감는 동안 오르는 줄의 힘입니다. 화면 오른쪽 막대가 끝까지 차면 <b>줄이 끊어집니다</b>."],
        ["차고 나가기", "물고기가 가끔 물을 튀기며 힘껏 달아납니다. 이때 감으면 장력이 빠르게 오르니 <b>손을 놓아</b> 줄을 풀어 주세요."],
        ["느슨함", `손을 놓고 있으면 장력은 내려가지만, 물고기가 당기지 않는데 ${SLACK}초 넘게 감지 않으면 바늘이 빠집니다.`],
      ),
    ) +
    part(
      "물고기와 점수",
      table(
        ...KINDS.map((k, i): [string, string] => [
          k.name,
          k.junk
            ? `${k.flat}점. 싸우지 않고 그냥 끌려옵니다.`
            : `${k.min}~${k.max}cm, 1cm에 ${k.worth}점.${i === GOLDEN ? " 드물게 나옵니다." : ""}${k.pull >= 0.9 ? " 무겁고 세게 당깁니다." : k.lively > 1.2 ? " 자주 차고 나갑니다." : ""}`,
        ]),
        ["크기", "같은 물고기라도 크기가 제각각이고, 멀리 던질수록 큰 물고기가 잘 겁니다."],
      ),
    ) +
    part("레벨", table(...LEVEL_NAMES.map((name, i): [string, string] => [name, `찌가 들어가 있는 시간 약 ${LEVELS[i].bite}초. 레벨이 높을수록 물고기가 더 세고 자주 차고 나갑니다.`]), ["고르기", "위쪽의 <b>레벨 선택</b>을 누르면 고를 수 있습니다."])) +
    part("처음이라면", notes("입질에 속지 말고, 찌가 물속으로 쑥 들어갈 때만 누르세요.", "물고기가 차고 나가면 바로 손을 떼고, 멈추면 다시 누르세요.", "장력 막대가 빨갛게 되면 잠깐 놓았다가 감으세요.")),
  help: "마우스·터치: 물을 누르면 던지고, 찌가 들어갈 때 눌러 챔질, 누르고 있으면 감기<br>키보드: 스페이스(또는 Enter)로 던지기·챔질·감기",
  sides: ["나", ""],
  startWord: "낚시 시작",
};
