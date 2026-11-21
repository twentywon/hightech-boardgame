import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { chooseMove } from "./ai";
import { HEXES } from "./board";
import { hexAt } from "./layout";
import { CAPITAL, CAPITAL_MEN, COLORS, END, LIMIT, MAX, MOVES, NAMES, PORT, START, TOWN, TOWN_MEN, hexConquest, movable, standing, type State } from "./rules";
import { HexConquestView } from "./view";

/** A nation's line in the lettering over the table: its colour, its name, its men, its morale and its towns. */
function row(s: State, nation: number) {
  const n = s.nations[nation],
    who = nation === 0 ? `${NAMES[0]} (나)` : NAMES[nation],
    turn = s.winner === null && s.seat === nation ? " hc-now" : "";
  if (!n.alive) return `<span class="hc-row hc-out"><i class="hc-dot" style="background:${COLORS[nation]}"></i><b>${who}</b> 멸망</span>`;
  const st = standing(s, nation);
  return `<span class="hc-row${turn}"><i class="hc-dot" style="background:${COLORS[nation]}"></i><b>${who}</b> 병력 ${st.men} · 사기 ${st.morale} · 도시 ${st.towns}</span>`;
}
const others = (s: State) => [1, 2, 3].filter((n) => s.nations[n].present);
export const hexConquestConfig: PointConfig<State> = {
  // The computer weighs every move of every army that may still move, one move at a time, for whichever nation moves.
  game: { ...hexConquest, choose: (state, level, random) => chooseMove(state, level, random) },
  view: (host, quality) => new HexConquestView(host, quality),
  colors: [COLORS[0], COLORS[1]],
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
  tallyHtml: (s) => [row(s, 0), others(s).map((n) => row(s, n)).join("")],
  thinkingText: (s) => `${NAMES[s.seat]} 차례 — 남은 이동 ${s.left}/${s.budget}`,
  movingText: "군대가 움직이는 중…",
  // The keyboard walks every hex of the map; it starts on an army that may move, or on my capital.
  keyPoints: () => Array.from({ length: HEXES }, (_, h) => hexAt(h)),
  keyStart: (s) => movable(s, 0)[0] ?? s.nations[0].capital,
  rehome: (before, next) => before.seat !== next.seat,
  keyMove: (key, s) => (s.seat === 0 && s.winner === null && (key === "e" || key === "E" || key === "ㄷ") ? { from: -1, to: END, extra: -1 } : null),
  tools: [{ label: "턴 종료", point: END, show: (s) => s.seat === 0 && s.winner === null }],
  // Several nations take turns against me, and a battle cannot be taken back.
  computerOnly: true,
  noUndo: true,
  // Each computer's move waits only a moment, so that a round of three nations does not drag.
  ponder: () => -230,
  cheer: (before, s) => {
    const last = s.last;
    if (!last || s.ply !== before.ply + 1 || last.kind === "end") return null;
    if (last.conquered > 0) return last.nation === 0 ? "정복!" : `${NAMES[last.conquered]} 멸망!`;
    if (last.restored.length) return `${last.restored.map((n) => NAMES[n]).join(", ")} 부활!`;
    if (last.nation === 0) {
      if (last.captured === "capital") return "수도 점령!";
      if (last.captured === "town") return "도시 점령";
      if (last.captured === "port") return "항구 점령";
      return null;
    }
    const estate = s.map.estate[last.to];
    if (before.owner[last.to] === 0 && s.owner[last.to] !== 0 && (estate === TOWN || estate === CAPITAL || estate === PORT)) return estate === PORT ? "항구를 빼앗겼다!" : "도시를 빼앗겼다!";
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
  intro: `<p>육각형 칸으로 나뉜 세계 지도 위에서 네 나라가 맞섭니다. 군대를 움직여 땅과 도시를 넓히고, 사기를 올려 다른 나라의 수도를 차지하세요.<br>옛 플래시 게임 '헥스 엠파이어'와 같은 종류의 게임입니다. 지도는 판마다 새로 만들어집니다.</p>`,
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
        `지도의 네 귀퉁이에 나라가 하나씩 있습니다. 나는 왼쪽 아래의 <b>${NAMES[0]}</b>입니다. 나라마다 수도에 군대 하나(병력 ${START.count}, 사기 ${START.morale})를 가지고 시작합니다.`,
        `내 차례에는 군대를 <b>최대 ${MOVES}번</b> 움직입니다(군대가 그보다 적으면 군대 수만큼). 한 군대는 한 차례에 한 번만 움직입니다. 다 움직이면 차례가 저절로 넘어가고, <b>턴 종료</b>로 일찍 마칠 수도 있습니다.`,
        "군대는 이웃한 땅으로, 또는 사이 칸이 건물도 군대도 없는 빈 땅이면 두 칸까지 갑니다. 항구에서는 바다로 나가 배가 되고, 바다에서는 한두 칸을 가거나 이웃한 땅에 오릅니다.",
        "다른 나라의 군대가 있는 칸으로 가면 전투가 벌어집니다. 우리 군대가 있는 칸으로 가면 합쳐집니다.",
        "다른 나라의 <b>수도</b>를 차지하면 그 나라는 멸망하고 땅은 모두 내 것이 됩니다. 다른 나라를 모두 멸망시키면 이기고, 내 수도를 빼앗기면 집니다.",
      ),
    ) +
    part(
      "군대와 전투",
      table(
        ["병력/사기", `군대 위의 패에 적힌 두 수입니다. 병력은 1~${MAX}, 사기는 0부터 병력까지입니다. 힘은 병력 + 사기입니다.`],
        ["전투", "힘이 더 큰 쪽이 이깁니다(같으면 지키는 쪽). 진 군대는 사라지고, 이긴 군대는 진 쪽의 힘에 비례해 병력을 잃습니다. 진 나라의 모든 군대는 사기가 진 병력의 10분의 1만큼 떨어집니다. 주사위는 없습니다."],
        ["합치기", `병력은 더하고 사기는 병력에 따라 평균을 냅니다. ${MAX}명을 넘는 만큼은 원래 칸에 남습니다.`],
        ["쉬는 군대", "차례 동안 움직이지 않은 군대는 사기가 1 떨어집니다."],
        ["증원", `차례가 끝날 때 수도마다 병력 ${CAPITAL_MEN}, 도시마다 ${TOWN_MEN} + (빈 땅 수 + 항구 수 × 5) ÷ 도시 수만큼 군대가 생깁니다. 땅이 넓을수록 도시가 강해집니다.`],
      ),
    ) +
    part(
      "땅과 사기",
      table(
        ["땅 넓히기", "군대가 들어간 칸과 그 둘레의 빈 땅(건물도 군대도 없는 칸)이 내 땅이 됩니다."],
        ["수도", "다른 나라의 수도: 그 나라가 멸망하고 차지한 군대 사기 +30, 모든 군대 +50. 남이 차지하고 있던 수도는 +20, 모든 군대 +30이며 빼앗긴 나라는 모든 군대 사기 −30."],
        ["도시·항구", "도시를 차지하면 그 군대와 모든 군대 사기 +10(빼앗긴 나라 −10), 항구는 +5(빼앗긴 나라 −5)."],
        ["빈 땅", "새로 얻은 빈 땅 한 칸마다 모든 군대 사기 +1."],
        ["사기의 바닥", "사기는 병력보다 높을 수 없고, 나라 전체 병력 ÷ 50보다 낮아지지 않습니다."],
        ["부활", "멸망한 나라의 수도를 차지하고 있던 나라가 멸망하면, 그 수도는 원래 나라에게 돌아가고 병력 99, 사기 99의 군대가 생깁니다."],
        ["무승부", `${LIMIT}턴이 지나도록 승부가 나지 않으면 비깁니다.`],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "가까운 도시부터 차지하세요. 도시가 있어야 군대가 늘어납니다.",
        "수도를 비워 두지 마세요. 가까이 강한 적이 있으면 수도에 군대를 남겨 둡니다.",
        "작은 군대 여럿보다 합친 큰 군대가 강합니다. 적의 수도를 칠 때는 먼저 합치세요.",
        "움직이지 않는 군대는 사기가 떨어집니다. 남는 이동으로 빈 땅을 넓히세요.",
      ),
    ),
  help: "마우스·터치: 내 군대를 누른 뒤 갈 칸을 누르거나, 군대를 끌어다 놓습니다. E 키는 턴 종료",
  firstNote: "내가 먼저 움직이고, 컴퓨터 나라들이 차례로 뒤따릅니다.",
  sides: [NAMES[0], "컴퓨터 나라"],
  startWord: "작전 지도 펼치기",
};
