import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { chooseMove } from "./ai";
import { HEXES } from "./board";
import { CANNON_AT, TANK_AT, hexAt } from "./layout";
import {
  ACCEPT,
  CAPITAL,
  CAPITAL_MEN,
  CITY,
  CITY_MEN,
  COLORS,
  END,
  GAIN,
  LIMIT,
  MAX,
  MOVES,
  NAMES,
  NATION,
  NEW_MAP,
  PORT,
  PROPOSE,
  REFUSE,
  SPEECH,
  START,
  START_ARMY,
  VILLAGE,
  VILLAGE_MEN,
  allied,
  hexConquest,
  movable,
  offerable,
  standing,
  type State,
} from "./rules";
import { HexConquestView } from "./view";

/** The little marks of the nations allied with `nation`, each in its colour. */
function allyTag(s: State, nation: number) {
  const friends = [0, 1, 2, 3].filter((n) => allied(s, nation, n));
  if (!friends.length) return "";
  return `<span class="hc-ally" title="동맹"><em>동맹</em>${friends.map((n) => `<i class="hc-dot" style="background:${COLORS[n]}"></i>`).join("")}</span>`;
}
/** A nation's line in the lettering over the table: its colour, its name, its men, its morale, its estates and allies. */
function row(s: State, nation: number) {
  const n = s.nations[nation],
    who = nation === s.me ? `${NAMES[nation]} (나)` : NAMES[nation],
    turn = s.winner === null && s.phase !== "setup" && s.seat === nation ? " hc-now" : "";
  if (!n.alive) return `<span class="hc-row hc-out"><i class="hc-dot" style="background:${COLORS[nation]}"></i><b>${who}</b> 멸망</span>`;
  const st = standing(s, nation),
    speech = s.speaking === nation ? ' <span class="hc-speech">연설</span>' : "";
  return `<span class="hc-row${turn}"><i class="hc-dot" style="background:${COLORS[nation]}"></i><b>${who}</b> 병력 ${st.men} · 사기 ${st.morale}<span class="hc-estates"> · 마을 ${st.villages} · 도시 ${st.cities}</span>${speech}${allyTag(s, nation)}</span>`;
}
const others = (s: State) => [0, 1, 2, 3].filter((n) => n !== s.me && s.nations[n].present);
const mine = (s: State) => s.winner === null && s.phase !== "setup" && s.seat === s.me;
const tool = (to: number) => ({ from: -1, to, extra: -1 });
const ESTATE_WORD: Record<number, string> = { [CAPITAL]: "수도", [CITY]: "도시", [VILLAGE]: "마을", [PORT]: "항구" };
export const hexConquestConfig: PointConfig<State> = {
  // The computer weighs every move of every army that may still move, one move at a time, for whichever nation moves.
  game: { ...hexConquest, choose: (state, level, random) => chooseMove(state, level, random) },
  view: (host, quality) => new HexConquestView(host, quality),
  colors: [COLORS[0], COLORS[1]],
  // I am whichever empire I chose (`나 (청국)` in the status line).
  sidesOf: (_variant, s) => [s ? NAMES[s.me] : NAMES[0], "컴퓨터 나라"],
  settings: [
    {
      id: "computers",
      kind: "choice",
      label: "컴퓨터 수",
      value: "3",
      options: [
        { value: "1", label: "1명" },
        { value: "2", label: "2명" },
        { value: "3", label: "3명" },
      ],
    },
  ],
  // Every nation's line over the table: mine under my name, the computers' under theirs (all of it is public).
  tallyHtml: (s) => [row(s, s.me), others(s).map((n) => row(s, n)).join("")],
  thinkingText: (s) => `${NAMES[s.seat]} 차례 — 남은 이동 ${s.left}/${s.budget}`,
  movingText: "군대가 움직이는 중…",
  // The keyboard walks every hex of the map; it starts on an army that may move, or on my capital.
  keyPoints: () => Array.from({ length: HEXES }, (_, h) => hexAt(h)),
  keyStart: (s) => movable(s, s.me)[0] ?? s.world.corners[s.me],
  rehome: (before, next) => before.seat !== next.seat || before.phase !== next.phase,
  keyMove: (key, s) => (mine(s) && s.phase === "play" && (key === "e" || key === "E" || key === "ㄷ") ? tool(END) : null),
  tools: [
    { label: "턴 종료", point: END, show: (s) => mine(s) && s.phase === "play" },
    { label: "다른 맵", point: NEW_MAP, show: (s) => s.phase === "setup" },
    ...[0, 1, 2, 3].map((n) => ({
      label: NAMES[n],
      point: NATION + n,
      show: (s: State) => s.winner === null && (s.phase === "setup" || (s.phase === "propose" && mine(s) && offerable(s).includes(n))),
      text: (s: State) => (s.phase === "setup" ? (s.me === n ? `${NAMES[n]} (나)` : NAMES[n]) : `${NAMES[n]}에 제안`),
    })),
    { label: "시작", point: START, show: (s) => s.phase === "setup" },
    {
      label: "동맹 제안",
      point: PROPOSE,
      show: (s) => mine(s) && (s.phase === "play" || s.phase === "propose"),
      text: (s) => (s.phase === "propose" ? "제안 취소" : "동맹 제안"),
    },
    { label: "연설", point: SPEECH, show: (s) => mine(s) && s.phase === "play" && !s.speeches[s.me] },
    { label: "수락", point: ACCEPT, show: (s) => s.phase === "offer" && s.winner === null },
    { label: "거절", point: REFUSE, show: (s) => s.phase === "offer" && s.winner === null },
  ],
  // Several nations take turns against me, and a battle cannot be taken back.
  computerOnly: true,
  noUndo: true,
  // Each computer's move waits only a moment, so that a round of three nations does not drag.
  ponder: () => -230,
  cheer: (before, s) => {
    const last = s.last;
    if (!last || s.ply !== before.ply + 1) return null;
    const me = s.me;
    if (last.kind === "speech") return last.nation === me ? "연설!" : `${NAMES[last.nation]} 연설!`;
    if (last.pact) {
      const { from, to, accepted } = last.pact;
      if (last.dissolved) return "동맹이 모두 풀렸습니다";
      if (accepted === null) return `${NAMES[from]}: 동맹 제안`;
      // My answer, a computer's answer to me, and two computers' alliance.
      if (last.kind === "answer") return accepted ? `${NAMES[from]}과 동맹!` : `${NAMES[from]}의 제안 거절`;
      if (from === me || accepted === false) return `${NAMES[to]}: 동맹 ${accepted ? "수락" : "거절"}`;
      return `${NAMES[from]}·${NAMES[to]} 동맹`;
    }
    if (last.kind === "end" || last.kind === "setup" || last.kind === "start" || last.kind === "propose") return last.dissolved ? "동맹이 모두 풀렸습니다" : null;
    if (last.conquered >= 0 && last.conquered !== me) return last.nation === me ? "정복!" : `${NAMES[last.conquered]} 멸망!`;
    if (last.restored.length) return `${last.restored.map((n) => NAMES[n]).join(", ")} 부활!`;
    if (last.broken >= 0) return `${NAMES[last.nation]}·${NAMES[last.broken]} 동맹 해제`;
    if (last.dissolved) return "동맹이 모두 풀렸습니다";
    if (last.nation === me) {
      if (last.captured === "capital") return "수도 점령!";
      if (last.captured === "city") return "도시 점령";
      if (last.captured === "village") return "마을 점령";
      if (last.captured === "port") return "항구 점령";
      return null;
    }
    const word = ESTATE_WORD[s.map.estate[last.to]];
    if (before.owner[last.to] === me && s.owner[last.to] !== me && word) return `${word}${word === "마을" ? "을" : "를"} 빼앗겼다!`;
    return null;
  },
  cheerOnRest: true,
  // Boots on the map's tiles, oars at sea, and a battle's volley.
  contact: (sound, s) => {
    const last = s.last;
    if (last?.kind === "attack") return sound.explosion();
    if (last && !s.map.land[last.to]) return sound.soft(2);
    sound.knock(2);
  },
  name: "헥스 정복전",
  english: "Hex Conquest",
  number: "NO. 93 — TAKE THE CAPITALS",
  intro: `<p>육각형 칸으로 나뉜 세계 지도 위에서 네 나라가 맞섭니다. 지도와 나라를 골라 시작하고, 군대를 움직여 땅과 마을·도시를 넓히고, 동맹과 연설로 기회를 잡아 다른 나라의 수도를 차지하세요.<br>옛 플래시 게임 '헥스 엠파이어'와 같은 종류의 게임입니다. 지도는 판마다 새로 만들어집니다.</p>`,
  meta: "나 대 컴퓨터 1~3 · 20×11 헥스 · 무작위 지도",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>TAKE THE CAPITALS</span>`,
  artClass: "morris-art",
  artLabel: "헥스 정복전 미리보기",
  tableLabel: "THE WAR ROOM",
  tableNote: (_variant, options) => `${Number(options.computers) + 1}개국 · 무작위 지도`,
  rulesTitle: "다른 나라의 수도를 모두 차지하세요",
  rules:
    part(
      "기본 규칙",
      steps(
        `시작하기 전에 지도와 나라를 고릅니다. <b>다른 맵</b>을 누르면 새 지도가 나오고, 네 나라(${NAMES.join(", ")}) 가운데 하나의 수도나 이름을 눌러 내 나라로 정합니다. <b>시작</b>을 누르면 게임이 시작됩니다.`,
        `컴퓨터가 셋보다 적으면 내 나라에서 먼 귀퉁이부터 차지합니다(하나면 대각선 건너편, 둘이면 그 나라와 가로로 건너편). 빈 귀퉁이는 수도 없는 빈 땅이 됩니다. 나라마다 수도에 군대 하나(병력 ${START_ARMY.count}, 사기 ${START_ARMY.morale})를 가지고 시작합니다.`,
        `차례는 ${NAMES.join(" → ")} 순서로 돕니다. 내 차례에는 군대를 <b>최대 ${MOVES}번</b> 움직입니다(군대가 그보다 적으면 군대 수만큼). 한 군대는 한 차례에 한 번만 움직입니다. 다 움직이면 차례가 저절로 넘어가고, <b>턴 종료</b>로 일찍 마칠 수도 있습니다.`,
        "군대는 이웃한 땅으로, 또는 사이 칸이 건물도 군대도 없는 빈 땅이면 두 칸까지 갑니다. 항구에서는 바다로 나가 배가 되고, 배는 바다에서 한두 칸을 가거나 땅에 오릅니다.",
        "다른 나라의 군대가 있는 칸으로 가면 전투가 벌어집니다. 우리 군대가 있는 칸으로 가면 합쳐집니다.",
        "다른 나라의 <b>수도</b>를 차지하면 그 나라는 멸망하고 땅은 모두 내 것이 됩니다. 다른 나라를 모두 멸망시키면 이기고, 내 수도를 빼앗기면 집니다.",
      ),
    ) +
    part(
      "군대와 전투",
      table(
        ["병력/사기", `군대 위의 패에 적힌 두 수입니다. 병력은 1~${MAX}, 사기는 0부터 병력까지입니다. 힘은 병력 + 사기입니다.`],
        ["기물", `땅 위의 군대는 병력에 따라 모습이 바뀝니다. ${CANNON_AT}명 미만은 보병, ${CANNON_AT}~${TANK_AT - 1}명은 대포, ${TANK_AT}명 이상은 탱크입니다. 바다에서는 배입니다.`],
        ["전투", "힘이 더 큰 쪽이 이깁니다(같으면 지키는 쪽). 진 군대는 사라지고, 이긴 군대는 진 쪽의 힘에 비례해 병력을 잃습니다. 진 나라의 모든 군대는 사기가 진 병력의 10분의 1만큼 떨어집니다. 주사위는 없습니다."],
        ["상륙", "배는 이웃한 땅이면 마을·도시·항구·수도 어디든 오를 수 있고, 빈 바다 한 칸을 지나 두 칸 떨어진 땅에도 오릅니다. 적군이 있는 칸이면 오르면서 바로 공격하고, 이기면 그 칸에 섭니다."],
        ["합치기", `병력은 더하고 사기는 병력에 따라 평균을 냅니다. ${MAX}명을 넘는 만큼은 원래 칸에 남습니다.`],
        ["쉬는 군대", "차례 동안 움직이지 않은 군대는 사기가 1 떨어집니다."],
      ),
    ) +
    part(
      "마을·도시·항구·수도",
      table(
        ["몫", "차례가 끝날 때 몫 = (빈 땅 수 + 항구 수 × 5) ÷ (마을 수 + 도시 수)를 셉니다(마을도 도시도 없으면 0). 땅과 항구가 많을수록 몫이 큽니다."],
        ["수도", `증원 병력 ${CAPITAL_MEN} + 몫 × 2. 가장 많은 병력이 나옵니다. 다른 나라의 수도를 차지하면 그 나라가 멸망하고 차지한 군대 사기 +${GAIN.conquest[0]}, 모든 군대 +${GAIN.conquest[1]}. 남이 차지하고 있던 수도는 +${GAIN.capital[0]}, 모든 군대 +${GAIN.capital[1]}이며 빼앗긴 나라는 모든 군대 사기 −${GAIN.capital[2]}.`],
        ["도시", `증원 병력 ${CITY_MEN} + 몫 × 2. 마을보다 드뭅니다(귀퉁이마다 같은 수). 차지하면 그 군대와 모든 군대 사기 +${GAIN.city[0]}, 빼앗긴 나라 −${GAIN.city[2]}.`],
        ["마을", `증원 병력 ${VILLAGE_MEN} + 몫. 차지하면 그 군대와 모든 군대 사기 +${GAIN.village[0]}, 빼앗긴 나라 −${GAIN.village[2]}.`],
        ["항구", `병력은 나오지 않지만 몫을 크게 늘리고(항구 하나가 빈 땅 다섯 칸), 바다로 나가는 길입니다. 차지하면 사기 +${GAIN.port[0]}, 빼앗긴 나라 −${GAIN.port[2]}.`],
      ),
    ) +
    part(
      "땅과 사기",
      table(
        ["땅 넓히기", "군대가 들어간 칸과 그 둘레의 빈 땅(건물도 군대도 없는 칸)이 내 땅이 됩니다. 동맹국의 땅은 둘레로 넘어오지 않습니다."],
        ["빈 땅", "새로 얻은 빈 땅 한 칸마다 모든 군대 사기 +1."],
        ["사기의 바닥", "사기는 병력보다 높을 수 없고, 나라 전체 병력 ÷ 50보다 낮아지지 않습니다."],
        ["부활", "멸망한 나라의 수도를 차지하고 있던 나라가 멸망하면, 그 수도는 원래 나라에게 돌아가고 병력 99, 사기 99의 군대가 생깁니다."],
        ["무승부", `${LIMIT}바퀴가 지나도록 승부가 나지 않으면 비깁니다.`],
      ),
    ) +
    part(
      "동맹과 연설",
      table(
        ["동맹 제안", "세 나라 이상 남아 있으면 내 차례에 <b>동맹 제안</b>을 누르고 나라의 수도나 이름을 고릅니다. 이동 횟수는 쓰지 않고, 한 나라에는 한 차례에 한 번만 제안할 수 있습니다."],
        ["대답", "컴퓨터는 판세를 따져 답합니다. 자기 힘(군대의 병력 + 사기 합)이 가장 크고 다음 나라의 1.3배 이상이거나 모든 나라 합의 40%를 넘으면 거절하고, 그렇지 않으면 수락합니다. 컴퓨터가 나에게 제안하면 내 차례가 시작될 때 수락이나 거절을 고릅니다."],
        ["동맹국", "동맹국끼리는 서로 공격하지 않고 국경도 넘지 않습니다. 동맹국의 땅에 들어가거나 군대를 공격하면 그 동맹은 곧바로 풀립니다. 남은 나라가 모두 서로 동맹이 되면 모든 동맹이 저절로 풀립니다."],
        ["연설", "나라마다 한 판에 한 번, 내 차례에 사기가 떨어졌을 때(모든 군대의 사기 합이 병력 합의 절반보다 낮을 때) 쓸 수 있습니다. 그 차례 동안 모든 군대의 사기가 병력만큼 가득 찹니다. 차례가 끝나면 사기는 연설 전 값으로 돌아갑니다(그 사이 더 낮아졌으면 낮은 쪽). 이동 횟수는 쓰지 않습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "가까운 마을과 도시부터 차지하세요. 마을과 도시가 있어야 군대가 늘어나고, 도시가 더 많이 늘려 줍니다.",
        "수도를 비워 두지 마세요. 가까이 강한 적이 있으면 수도에 군대를 남겨 둡니다.",
        "작은 군대 여럿보다 합친 큰 군대가 강합니다. 적의 수도를 칠 때는 먼저 합치세요.",
        "약할 때는 강한 이웃과 동맹을 맺어 시간을 버세요. 사기가 바닥일 때 큰 싸움을 앞두고 연설을 아껴 두면 좋습니다.",
      ),
    ),
  help: "마우스·터치: 내 군대를 누른 뒤 갈 칸을 누르거나, 군대를 끌어다 놓습니다. E 키는 턴 종료",
  firstNote: "맵과 나라를 고르고 시작하면 홍국부터 차례로 움직입니다.",
  sides: [NAMES[0], "컴퓨터 나라"],
  startWord: "작전 지도 펼치기",
};
