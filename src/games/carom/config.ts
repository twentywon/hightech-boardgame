import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { TARGETS, carom, kindOf, targetOf, type State } from "./rules";
import { CAROM_COLORS, CaromView } from "./view";

const KINDS: Record<string, string> = { four: "4구", three: "3쿠션" };
export const caromConfig: PointConfig<State> = {
  game: carom,
  // 와이파이 여럿이: each device shoots its own side; the host's state after each shot goes with it (`settled`).
  net: { settled: true },
  // The score stands on a lit board of its own over the table, and on the beads on the hall's wall.
  panel: "scoreboard",
  view: (host, quality, _variant, mode) => new CaromView(host, quality, mode),
  colors: CAROM_COLORS,
  // A shot struck cannot be taken back.
  noUndo: true,
  contact: (sound) => sound.ball(),
  // Ivory on ivory clicks as billiard balls do, and the rubber thuds.
  knock: (sound, kind, strength) => (kind === "cushion" ? sound.cushion(strength) : sound.ball(strength)),
  // What a shot came to is called across the table once the balls have stopped.
  cheerOnRest: true,
  cheer: (before, state, mode) => {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return null;
    const who = mode === "ai" && last.by === 1 ? "컴퓨터 " : "";
    if (last.foul) return `${who}파울 −1`;
    if (last.point) return `${who}${state.kind === "three" ? "3쿠션 " : ""}득점!`;
    return null;
  },
  tallyHtml: (s) => [0, 1].map((p) => `<span class="ca-points">${s.score[p]}</span><small class="ca-goal">/ ${s.target}</small>`) as [string, string],
  variants: [
    { value: "four", label: "4구" },
    { value: "three", label: "3쿠션" },
  ],
  variantLabel: "종목",
  settings: [
    { id: "target4", kind: "choice", label: "목표 점수", value: "10", fixed: ["three"], options: TARGETS.four.map((n) => ({ value: String(n), label: `${n}점` })) },
    { id: "target3", kind: "choice", label: "목표 점수", value: "10", fixed: ["four"], options: TARGETS.three.map((n) => ({ value: String(n), label: `${n}점` })) },
  ],
  firstNote: "컴퓨터 대전에서는 내가 흰 공으로 먼저 칩니다. 컴퓨터는 노란 공입니다.",
  movingText: "공이 구르는 중…",
  name: "당구",
  english: "Carom Billiards",
  number: "NO. 82 — FOUR BALL · THREE CUSHION",
  intro: `<p>동네 당구장의 따뜻한 대대 위에서 4구와 3쿠션.<br>내 공으로 다른 공들을 맞혀 점수를 내고, 구슬 점수판의 알을 먼저 다 넘기세요.</p>`,
  meta: "2인 · 4구 10·20·30점 · 3쿠션 10·15·20점",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FOUR BALL · THREE CUSHION</span>`,
  artClass: "pool-art",
  artLabel: "당구대 미리보기",
  tableLabel: "THE CAROM TABLE",
  tableNote: (variant, options) => {
    const kind = kindOf(variant);
    return `${KINDS[kind]} · ${targetOf(kind, options)}점 내기`;
  },
  rulesTitle: "내 공으로 다른 공들을 맞히세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "구멍이 없는 당구대(대대)에서 큐로 <b>내 공</b>(수구)을 쳐서 다른 공들을 맞힙니다. <b>흰 공은 먼저 치는 쪽</b>(컴퓨터 대전에서는 나, 2인이면 플레이어 1), <b>노란 공은 상대</b>(컴퓨터나 플레이어 2)의 공입니다. 공은 멈춘 자리에서 그대로 다음 샷을 칩니다.",
        "<b>4구</b>: 빨간 공 둘, 흰 공, 노란 공의 네 개로 칩니다. 내 공이 한 샷에 <b>빨간 공 두 개를 모두</b> 맞히면 1점이고 한 번 더 칩니다.",
        "4구에서 내 공이 <b>상대의 공</b>을 맞히면 파울로 1점을 잃습니다(0점 아래로는 내려가지 않습니다). 빨간 공을 하나만 맞히거나 하나도 못 맞히면 점수 없이 차례가 넘어갑니다.",
        "<b>3쿠션</b>: 흰 공, 노란 공, 빨간 공의 세 개로 칩니다. 내 공이 나머지 두 공을 모두 맞히되, <b>두 번째 공을 맞히기 전에 쿠션(당구대 벽)에 세 번 이상</b> 닿으면 1점이고 한 번 더 칩니다. 첫 공을 맞히기 전에 닿은 쿠션도 셉니다.",
        "시작할 때 고른 <b>목표 점수</b>(4구 10·20·30점, 3쿠션 10·15·20점)를 먼저 채우면 이깁니다.",
      ),
    ) +
    part(
      "치기",
      table(
        ["당기기", "내 공을 누른 채 <b>보낼 쪽의 반대로</b> 당겼다 놓습니다. 멀리 당길수록 세게 나가고, 흰 점선이 공이 갈 길을 보여 줍니다."],
        ["점선", "흰 점선은 내 공이 갈 길입니다. 쿠션이나 다른 공에 닿는 곳에서 꺾여 그 뒤에 갈 쪽까지 보여 주고, 맞은 공이 갈 쪽은 흐린 작은 점으로 나옵니다. 회전과 힘은 셈하지 않은 곧은 길이라 실제로는 조금 달라지고, 점선의 길이는 세기와 상관없이 늘 같습니다."],
        ["당점", "오른쪽 아래의 작은 공 그림을 눌러 <b>큐가 공의 어디를 칠지</b> 고릅니다. 빨간 점이 당점이고, 샷을 치고 나면 가운데로 돌아옵니다."],
        ["위·아래", "위를 치면 공이 앞으로 구르는 힘(밀어치기)이 생겨 맞힌 뒤에도 따라가고, 아래를 치면 거꾸로 도는 힘(끌어치기)이 생겨 맞힌 뒤 되돌아옵니다."],
        ["왼쪽·오른쪽", "옆을 치면 공이 옆으로 돕니다(회전, 잉글리시). 쿠션에 닿을 때 도는 쪽으로 각이 넓어지거나 좁아집니다. 3쿠션에서 각을 맞추는 데 씁니다."],
      ),
    ) +
    part(
      "당구장",
      table(
        ["점수판", "벽에 걸린 구슬 점수판입니다. 위 줄이 흰 공, 아래 줄이 노란 공이고, 1점마다 알 하나가 왼쪽으로 넘어갑니다. 줄 아래의 빨간 표시가 목표 점수입니다."],
        ["전광판", "왼쪽 아래에 두 사람의 점수와 목표가 나옵니다."],
        ["포인트", "레일 위의 흰 점들입니다. 3쿠션에서 공이 닿을 쿠션 자리를 가늠하는 눈금으로 씁니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "4구는 가까운 빨간 공을 얇게(공의 가장자리를) 맞혀 내 공이 다른 빨간 공 쪽으로 흘러가게 하면 쉽습니다.",
        "상대 공이 가까이 있으면 세게 치지 마세요. 내 공이 돌아다니다 상대 공에 닿으면 1점을 잃습니다.",
        "3쿠션은 첫 공을 맞힌 뒤 내 공이 쿠션 세 개를 돌아 두 번째 공에 가도록 칩니다. 조금 세게, 도는 쪽으로 회전을 주면 각이 넓어져 돌아가기 쉽습니다.",
        "공이 멈출 때까지 기다리면 점수와 차례가 바뀝니다.",
      ),
    ),
  help: "마우스·터치: 내 공을 누른 채 뒤로 당겼다 놓습니다. 당점은 오른쪽 아래의 공 그림을 눌러 고릅니다",
  sides: ["흰 공", "노란 공"],
  startWord: "큐를 잡기",
};
