import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CAST, CATCH, HOOK, LATE, LEVEL, SCARED, SLIP, SNAP, fishing, seaOf, type State } from "./rules";
import { BOOT, CAN, GOLDEN, KINDS, LEVELS, MARLIN, SEA, SHARK, SLACK, STARFISH, TUNA, WHALE } from "./sim";

/** The rare big catches: a sparkle when landed, and 드물게 in the guide. */
const RARE = [GOLDEN, TUNA, MARLIN, SHARK, WHALE];
import { FISHING_COLORS, FishingView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/**
 * A small picture of a stage: the lake at evening (wooded shore, a pier) or the open sea seen from a boat's bow (a
 * far island, a lighthouse), the float out on it and fish under it.
 */
function waterArt(sea: boolean) {
  const id = `fs${sea ? "sea" : "lake"}`,
    shore = sea
      ? `<path d="M80 66 Q96 56 112 60 T136 62 V67 H80Z" fill="#7f98a8"/><rect x="20" y="40" width="6" height="22" fill="#f2f0ea"/><rect x="20" y="46" width="6" height="4" fill="#c8352e"/><path d="M19 40 h8 l-4 -5z" fill="#c8352e"/><path d="M12 66 Q22 58 34 66Z" fill="#5b5d5a"/>`
      : `<path d="M4 62 Q30 48 52 58 T100 52 T136 58 V70 H4Z" fill="#5d7f5a"/>`,
    near = sea
      ? `<path d="M30 136 L60 104 L80 104 L110 136Z" fill="#f4f2ec"/><path d="M38 136 L62 110 L78 110 L102 136Z" fill="#b98a5a"/><path d="M30 136 L60 104 L80 104 L110 136" fill="none" stroke="#1f4f86" stroke-width="3"/>`
      : `<rect x="54" y="112" width="32" height="24" fill="#8a6a48"/><rect x="50" y="108" width="6" height="28" fill="#5e4632"/><rect x="84" y="108" width="6" height="28" fill="#5e4632"/>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sea ? "#5c9be0" : "#7eaedb"}"/><stop offset="1" stop-color="${sea ? "#d8e8f2" : "#e9e3cf"}"/></linearGradient></defs><rect x="4" y="4" width="132" height="132" rx="16" fill="url(#${id})"/>${shore}<path d="M4 66 H136 V120 Q136 136 120 136 H20 Q4 136 4 120Z" fill="${sea ? "#155a86" : "#2f6474"}"/><circle cx="${sea ? 104 : 38}" cy="40" r="9" fill="#fff4d6"/><text x="70" y="26" text-anchor="middle" font-size="14" font-weight="800" fill="#1d3442" font-family="Helvetica, Arial, sans-serif">${sea ? "바다 (배)" : "호수 (잔교)"}</text><ellipse cx="70" cy="80" rx="12" ry="3" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/><rect x="68.5" y="66" width="3" height="14" rx="1.5" fill="#ff3a2a"/><rect x="68.5" y="72" width="3" height="3" fill="#ffd22a"/><ellipse cx="44" cy="96" rx="11" ry="4.5" fill="#173a44" opacity=".75"/><path d="M34 96 l-7 -5 v10z" fill="#173a44" opacity=".75"/>${near}<path d="M70 66 Q100 40 120 8" stroke="#fff" stroke-opacity=".8" stroke-width="1" fill="none"/></svg>`;
}
export const fishingConfig: PointConfig<State> = {
  game: fishing,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  newGameLabel: "장소 선택",
  view: (host, quality) => new FishingView(host, quality),
  colors: FISHING_COLORS,
  tallyHtml: (state) => [stat("점수", state.score) + stat("잡은 물고기", `${state.caught.filter((c) => !KINDS[c.kind].junk).length}마리`), ""],
  // The float lands with a plop; a strike swishes; a catch comes out with a splash (a golden carp rings over it, a
  // can clinks, a boot thuds); a snapped line twangs; a fish lost slips away softly.
  contact: (sound, state) => {
    const last = state.last ?? -1;
    if (last >= CATCH) {
      const kind = state.landed?.kind ?? 0;
      if (kind === CAN) return sound.tile(2);
      if (kind === BOOT || kind === STARFISH) return sound.soft(3);
      sound.splash();
      if (RARE.includes(kind)) sound.sparkle();
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
  // 새 게임 (장소 선택) asks where: the lake from a pier, its day going by; the sea from a boat, bigger fish and a
  // longer fight. There is no level and no clock (the user asked to take both away).
  stages: [
    { value: "lake", name: "호수", note: "잔교에서 · 낮에서 밤으로", art: waterArt(false) },
    { value: "sea", name: "바다", note: "배 위에서 · 큰 물고기 · 긴 싸움", art: waterArt(true) },
  ],
  name: "낚시",
  english: "Fishing",
  number: "NO. 105 — WATCH THE FLOAT",
  intro: `<p>잔잔한 호수의 나무 잔교나 탁 트인 바다의 배 위에서 낚싯대를 드리웁니다.<br>찌가 쑥 들어가는 순간 당겨 물고기를 걸고, 줄이 끊어지지 않게 릴을 돌려 감아 올리세요. 시간 제한 없이 마음껏 낚습니다.</p>`,
  meta: "1인 · 시간 제한 없음 · 실시간",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>WATCH THE FLOAT</span>`,
  artClass: "hexa-art",
  artLabel: "낚시 미리보기",
  tableLabel: "THE WATER",
  tableNote: (variant) => (seaOf(variant) ? "바다 · 배 위" : "호수 · 잔교"),
  rulesTitle: "찌가 움직일 때 당기세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "물을 누르면 그곳으로 찌를 던집니다. 너무 가깝거나 먼 곳은 던질 수 있는 데까지만 날아갑니다.",
        "물고기가 오면 먼저 찌가 <b>톡톡</b> 움직입니다(입질). 이때 당기면 물고기가 놀라 달아납니다.",
        "찌가 <b>쑥 들어가는 순간</b> 눌러 챔질하면 물고기가 걸립니다. 늦으면 미끼만 먹고 달아납니다.",
        "걸린 물고기는 <b>릴을 돌려야</b> 감깁니다. 화면에 손가락(마우스는 누른 채)으로 <b>빙글빙글 원을 그리면</b> 릴이 돕니다. 빠르게 계속 돌릴수록 빨리 감기고, 느리게 돌리면 거의 감기지 않습니다. 잔교(바다에서는 배)까지 끌어오면 잡힙니다.",
        "시간 제한은 없습니다. 잡은 것의 점수가 계속 더해집니다.",
      ),
    ) +
    part(
      "줄다리기",
      table(
        ["장력", "감는 동안 오르는 줄의 힘입니다. 화면 오른쪽 막대가 끝까지 차면 <b>줄이 끊어집니다</b>."],
        ["차고 나가기", "물고기가 가끔 물을 튀기며 힘껏 달아납니다. 이때 릴을 돌리면 장력이 빠르게 오르니 <b>릴을 멈추고</b> 줄을 풀어 주세요(손가락을 떼면 릴이 바로 멈춥니다)."],
        ["느슨함", `릴을 멈추면 장력은 내려가지만, 물고기가 당기지 않는데 ${SLACK}초 넘게 감지 않으면 바늘이 빠집니다. 오른쪽 아래의 도는 화살표와 막대가 릴이 도는 빠르기이고, 막대가 초록이 되면 충분히 빠릅니다.`],
      ),
    ) +
    part(
      "물고기와 점수",
      table(
        ...KINDS.map((k, i): [string, string] => [
          `${k.name}${k.water === "both" ? "" : k.water === "sea" ? " (바다)" : " (호수)"}`,
          k.junk
            ? `${k.flat}점. 싸우지 않고 그냥 끌려옵니다.`
            : `${k.min}~${k.max}cm, 1cm에 ${k.worth}점.${RARE.includes(i) ? " 드물게 나옵니다." : ""}${k.pull >= 0.9 ? " 무겁고 세게 당깁니다." : k.lively > 1.2 ? " 자주 차고 나갑니다." : ""}`,
        ]),
        ["크기", "같은 물고기라도 크기가 제각각이고, 멀리 던질수록 큰 물고기가 잘 겁니다."],
      ),
    ) +
    part(
      "호수와 바다",
      table(
        ["호수", "나무 잔교에 서서 낚습니다. 붕어·잉어·송어·메기·황금 잉어와 개구리·가재가 삽니다. 시간이 흐르면서 하늘이 낮에서 해질녘을 지나 밤으로, 다시 새벽을 지나 낮으로 천천히 바뀝니다. 밤에는 찌 끝이 밝게 빛납니다."],
        ["바다", `작은 낚싯배 위에서 낚습니다. 배는 너울에 천천히 흔들립니다. 전갱이·고등어 같은 작은 물고기부터 우럭·장어·감성돔·광어·방어·참치, 드물게 아주 큰 청새치·상어·고래까지 삽니다. 하늘은 호수처럼 낮에서 해질녘·밤·새벽으로 천천히 바뀌고, 밤에는 등대 불이 밝게 켜집니다. 물고기가 무거워 호수보다 감는 데 훨씬 오래 걸리고(약 ${Math.round(1 / SEA.reel * 10) / 10}배), 더 세고 길게 차고 나가며 크게 요동칩니다.`],
      ),
    ) +
    part("장소 고르기", table(["고르기", "위쪽의 <b>장소 선택</b>을 누르면 호수와 바다 가운데 고를 수 있습니다. 새로 고르면 점수가 0부터 다시 시작합니다."], ["챔질", `찌가 들어가 있는 시간은 약 ${LEVELS[LEVEL - 1].bite}초입니다.`])) +
    part("처음이라면", notes("입질에 속지 말고, 찌가 물속으로 쑥 들어갈 때만 누르세요.", "물고기가 차고 나가면 바로 손을 떼고, 멈추면 다시 원을 그려 빠르게 돌리세요.", "장력 막대가 빨갛게 되면 잠깐 멈췄다가 다시 돌리세요.")),
  help: "마우스·터치: 물을 누르면 던지고, 찌가 들어갈 때 눌러 챔질, 화면에 원을 그려 릴 돌리기<br>키보드: 스페이스(또는 Enter)로 던지기·챔질, 걸린 뒤에는 스페이스 연타로 릴 돌리기",
  sides: ["나", ""],
  startWord: "낚시 시작",
};
