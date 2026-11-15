import { part, steps, notes } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { oldMaid, source, type State } from "./rules";
import { OLDMAID_COLORS, OldMaidView } from "./view";
import { seatSpot } from "./layout";

export const oldMaidConfig: PointConfig<State> = {
  game: oldMaid,
  contact: (sound) => sound.card(),
  noPanel: true,
  view: (host, quality) => new OldMaidView(host, quality),
  colors: OLDMAID_COLORS,
  keyPoints: (s) => {
    const points = Array.from({ length: 53 }, () => ({ x: NaN, z: NaN })),
      from = source(s, 0);
    if (s.seat === 0) s.hands[from].forEach((id, i) => (points[id] = seatSpot(from, i, s.hands[from].length)));
    return points;
  },
  // The keyboard starts on the first card of the hand I draw from.
  keyStart: (s) => s.hands[source(s, 0)][0] ?? 0,
  rehome: (before, next) => before.seat !== next.seat || before.ply !== next.ply,
  // The others' hands are hidden, and a card drawn cannot be given back.
  computerOnly: true,
  noUndo: true,
  showMovable: false,
  ponder: () => 450,
  cheer: (before, state, mode) => (state.last && state.last !== before.last && state.last.laid.length && state.last.seat === 0 ? "짝!" : null),
  name: "도둑잡기",
  english: "Old Maid",
  number: "NO. 62 — WHO HOLDS THE JOKER",
  intro: `<p>컴퓨터 둘과 셋이서, 서로의 카드를 한 장씩 뽑아 짝을 맞춥니다.<br>마지막까지 조커를 들고 있는 사람이 도둑입니다.</p>`,
  meta: "나 대 컴퓨터 둘 · 카드 53장(조커 1장)",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>DON'T BE LEFT WITH THE JOKER</span>`,
  artClass: "indian-art",
  artLabel: "도둑잡기 미리보기",
  tableLabel: "THE GREEN TABLE",
  tableNote: () => "셋이서 · 조커 1장",
  rulesTitle: "조커를 남에게 넘기세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "카드 52장과 조커 1장을 셋이 모두 나눠 갖습니다. 숫자가 같은 두 장은 <b>짝</b>이 되어 가운데에 내려놓습니다.",
        "차례마다 <b>왼쪽 컴퓨터</b>의 카드 중 한 장을 보지 않고 뽑습니다. 짝이 맞으면 내려놓습니다. 왼쪽 컴퓨터는 오른쪽 컴퓨터에게서, 오른쪽 컴퓨터는 나에게서 뽑습니다.",
        "카드를 다 내려놓은 사람은 빠집니다. 마지막에 <b>조커</b>를 들고 남은 사람이 도둑이 되어 집니다.",
      ),
    ) +
    part("처음이라면", notes("뽑을 차례에는 왼쪽 컴퓨터의 카드 위에 금색 테두리가 뜹니다. 아무 카드나 누릅니다.", "조커를 뽑았다면 오른쪽 컴퓨터가 뽑아 가기를 바랄 수밖에 없습니다.", "뽑은 쪽의 카드는 매번 섞이므로 어디에 무엇이 있는지 알 수 없습니다.")),
  help: "마우스·터치: 금색 테두리가 뜬 왼쪽 컴퓨터의 카드 중 한 장을 누릅니다",
  sides: ["나", "컴퓨터"],
  startWord: "테이블에 앉기",
};
