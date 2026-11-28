import { capturing } from "../../ui/banner";
import { notes, part, steps, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { tileAt } from "./layout";
import { SHUFFLE, STAGES, freeTiles, hint, isFree, mahjong, pickable, refusal, stageOf, stuck, type State } from "./rules";
import { MahjongView, TILE_COLORS, mahjongCue } from "./view";

/** A small picture of a layout from above: each tile an ivory face over its green back, upper layers set up and left. */
function layoutArt(stage: number) {
  const slots = STAGES[stage - 1].slots,
    xs = slots.map((s) => s.x),
    zs = slots.map((s) => s.z),
    span = Math.max(Math.max(...xs) - Math.min(...xs) + 2, (Math.max(...zs) - Math.min(...zs) + 2) * 1.36),
    unit = 112 / span,
    w = 2 * unit,
    d = 2 * unit * 1.36,
    cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cz = (Math.min(...zs) + Math.max(...zs)) / 2;
  let out = "";
  for (const s of slots) {
    const x = 70 + (s.x - cx) * unit - w / 2 - s.layer * 1.8,
      y = 72 + (s.z - cz) * unit * 1.36 - d / 2 - s.layer * 2.4;
    out += `<rect x="${(x + 0.8).toFixed(1)}" y="${(y + 1.6).toFixed(1)}" width="${(w - 0.6).toFixed(1)}" height="${(d - 0.6).toFixed(1)}" rx="1.4" fill="#1f7a52"/><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(w - 0.6).toFixed(1)}" height="${(d - 0.6).toFixed(1)}" rx="1.4" fill="${["#f6eedb", "#fbf5e6", "#fffaf0", "#fffdf7", "#ffffff"][s.layer]}" stroke="#b9a886" stroke-width="0.4"/>`;
  }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="14" fill="#5a2018"/><rect x="11" y="11" width="118" height="118" rx="8" fill="#c8a46a"/>${out}</svg>`;
}
const NOTES = STAGES.map((s) => `패 ${s.slots.length}개`);
export const mahjongConfig: PointConfig<State> = {
  game: mahjong,
  // A tile picked clicks; a pair coming together clicks and rings a soft chime; tiles dealt again clatter.
  contact: (sound) => {
    if (mahjongCue.kind === "match") {
      sound.tile(1);
      sound.chime();
    } else if (mahjongCue.kind === "shuffle") sound.chips();
    else sound.tile(1);
  },
  solo: true,
  showMovable: false,
  view: (host, quality, variant) => new MahjongView(host, quality, variant),
  colors: TILE_COLORS,
  // The keyboard walks the free tiles only: the others are given no place.
  keyPoints: (state) => state.slots.map((slot, i) => (isFree(state, i) ? tileAt(slot) : { x: NaN, z: NaN })),
  // Where the keyboard starts: the free tile nearest to the pair just taken, else the free tile farthest to the upper left.
  keyStart: (state) => {
    const free = freeTiles(state);
    if (!free.length) return 0;
    const last = state.last?.kind === "pair" ? state.last : null,
      from = last ? tileAt(state.slots[last.a]) : { x: -99, z: -99 };
    let best = free[0],
      near = Infinity;
    for (const i of free) {
      const at = tileAt(state.slots[i]),
        far = Math.hypot(at.x - from.x, (at.z - from.z) * 1.2);
      if (far < near) {
        near = far;
        best = i;
      }
    }
    return best;
  },
  rehome: () => true,
  // Enter on a tile that cannot be chosen is sent as a move, so that it is refused with words; H plays the hint while
  // the collection's picture is taken.
  keyMove: (key, state, _repeat, held) => {
    if (typeof document !== "undefined" && capturing() && (key === "h" || key === "H")) return hint(state);
    const at = held?.cursor;
    if ((key === "Enter" || key === " ") && at !== null && at !== undefined && state.present[at] && !pickable(state).has(at)) return { from: -1, to: at, extra: -1 };
    return null;
  },
  refusal,
  tools: [{ label: "다시 섞기", point: SHUFFLE, show: (state) => stuck(state) }],
  puzzle: {
    hint,
    hintText: (_state, move) => (move.to === SHUFFLE ? "힌트 — 맞출 수 있는 짝이 없습니다. 다시 섞기를 누르세요." : "힌트 — 금색 테두리의 두 패를 맞추세요."),
  },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({ value: String(i + 1), name: stage.name, note: NOTES[i], art: layoutArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "마작 솔리테어",
  english: "Mahjong Solitaire",
  number: "NO. 101 — MATCH THE PAIRS",
  intro: `<p>찻집의 옻칠한 탁자 위, 등나무 돗자리에 층층이 쌓인 마작 패.<br>위가 비고 왼쪽이나 오른쪽이 트인 자유로운 패 가운데 같은 그림 두 개를 골라 하나씩 걷어 내, 판을 모두 비우세요. 오래된 마작 패 맞추기 놀이이고, 배치마다 패는 매번 새로 섞이며 언제나 다 맞출 수 있게 놓입니다.</p>`,
  meta: "1인 · 다섯 배치 · 패는 무작위 · 언제나 풀림",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>MATCH THE PAIRS</span>`,
  artClass: "morris-art",
  artLabel: "마작 솔리테어 미리보기",
  tableLabel: "THE TEA HOUSE",
  tableNote: (variant) => `${STAGES[stageOf(Number(variant)) - 1].name} · 무작위 배치`,
  rulesTitle: "패를 모두 맞춰 걷어 내세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "탁자 위에 마작 패가 정해진 모양으로 여러 층 쌓여 있습니다. 패를 <b>두 개씩</b> 맞춰 걷어 내 판을 모두 비우면 <b>성공</b>입니다.",
        "걷어 낼 수 있는 것은 <b>자유로운 패</b>뿐입니다. 자유로운 패는 <b>위에 아무 패도 걸쳐 있지 않고</b>, <b>왼쪽이나 오른쪽</b> 가운데 한쪽이 비어 있는 패입니다. 앞뒤(위아래 줄)는 막혀도 상관없습니다.",
        "자유로운 패 하나를 누르면 들려 올라 빛납니다. 이어서 <b>짝이 맞는</b> 다른 자유로운 패를 누르면 두 패가 함께 날아가 쟁반에 담깁니다. 같은 패를 다시 누르면 고르기가 풀립니다.",
        "짝은 <b>같은 그림</b>끼리입니다. 다만 <b>꽃</b> 패 넷은 그림이 달라도 아무 꽃끼리, <b>계절</b> 패 넷도 아무 계절끼리 짝이 됩니다.",
        "막힌 패를 누르면 패가 흔들리고 왜 집을 수 없는지 알려 줍니다. 자유로운 패라도 짝이 될 패가 모두 막혀 있으면 아직 고를 수 없습니다.",
        "자유로운 패 가운데 맞는 짝이 하나도 없으면 <b>막힌 판</b>입니다. 무르기로 되돌리거나, <b>다시 섞기</b>를 누르면 남은 패가 제자리에서 다시 섞여 끝까지 맞출 수 있게 놓입니다.",
        "처음 놓이는 판은 언제나 끝까지 맞출 수 있습니다. 다만 어떤 짝부터 걷느냐에 따라 끝까지 못 가게 될 수도 있습니다.",
      ),
    ) +
    part(
      "패의 종류",
      table(
        ["만수(萬)", "一부터 九까지의 숫자 아래 붉은 萬이 쓰인 패입니다. 같은 숫자끼리 짝입니다."],
        ["통수", "동그란 엽전 무늬가 하나부터 아홉 개까지 있는 패입니다. 일통은 크고 화려한 엽전 하나입니다."],
        ["삭수", "대나무 마디가 둘부터 아홉 개까지 있는 패이고, 일삭은 작은 새 그림입니다."],
        ["바람", "東 南 西 北이 쓰인 패입니다. 같은 글자끼리 짝입니다."],
        ["삼원", "붉은 中, 초록 發, 파란 테두리만 있는 흰 패입니다. 같은 것끼리 짝입니다."],
        ["꽃", "매화(梅)·난초(蘭)·국화(菊)·대나무(竹) 그림에 1~4가 적힌 패입니다. 넷 가운데 아무 둘이나 짝입니다."],
        ["계절", "봄(春)·여름(夏)·가을(秋)·겨울(冬) 그림에 1~4가 적힌 패입니다. 넷 가운데 아무 둘이나 짝입니다."],
        ["배치", `<b>작은 피라미드</b>(${STAGES[0].slots.length}개)부터 <b>요새</b>, <b>다리</b>, <b>용</b>을 지나 다섯 층의 <b>거북 탑</b>(${STAGES[4].slots.length}개, 한 벌 전부)까지 점점 커집니다.`],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "높이 쌓인 곳과 긴 줄의 끝을 먼저 푸세요. 많은 패를 덮고 있는 패를 걷어야 다음 수가 늘어납니다.",
        "같은 그림 넷이 모두 보일 때까지 기다릴 수 있으면 기다리세요. 둘만 보일 때 서둘러 맞추면, 나머지 둘이 서로 겹쳐 쌓여 영영 짝을 못 지을 수 있습니다.",
        "같은 그림 둘이 위아래로 포개져 있으면 그 둘은 서로 짝이 될 수 없습니다. 위의 패는 다른 패와 맞춰야 합니다.",
        "막히면 힌트를 눌러 보세요. 끝까지 맞출 수 있는 짝을 금색 테두리로 보여 줍니다.",
      ),
    ),
  help: "마우스·터치: 자유로운 패를 누르고 짝을 누릅니다<br>키보드: 방향키로 자유로운 패를 고르고 Enter",
  sides: ["나", ""],
  startWord: "찻집 탁자에 앉기",
};
