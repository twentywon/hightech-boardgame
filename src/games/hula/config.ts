import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { ATTACH, DISCARD, HAND, canClaim, MELD_BASE, NEXT, PASS, REGISTER, SORT, STOCK, THANK, hula, myHand, type State } from "./rules";
import { HULA_COLORS, HulaView, registerSpot } from "./view";
import { HULA as L, handX, meldSpots, placeOf } from "./layout";

/** Where the keyboard's points are: my hand, the stock, the discard pile, the melds on the table and my next meld's place. */
function keyPoints(s: State) {
  const points = Array.from({ length: MELD_BASE + s.melds.length }, () => ({ x: NaN, z: NaN }));
  const mine = myHand(s);
  mine.forEach((id, i) => (points[id] = { x: handX(i, mine.length), z: L.HAND_Z - (s.picked.includes(id) ? L.LIFT : 0) }));
  points[STOCK] = { ...L.STOCK };
  points[DISCARD] = points[THANK] = { ...L.DISCARD };
  points[REGISTER] = registerSpot(s);
  for (let seat = 0; seat < s.players; seat++) {
    const own = s.melds.map((m, i) => ({ m, i })).filter(({ m }) => m.owner === seat),
      spots = meldSpots(placeOf(s.players, seat), own.map(({ m }) => m.cards.length));
    own.forEach(({ i }, k) => (points[MELD_BASE + i] = spots[k][0]));
  }
  return points;
}
/** Whether it is my move in `phase`. */
const mine = (s: State, phase: State["phase"]) => s.winner === null && s.seat === 0 && s.phase === phase;
const scoreText = (n: number) => (n > 0 ? `+${n}` : `${n}`);

export const hulaConfig: PointConfig<State> = {
  game: hula,
  contact: (sound) => sound.card(),
  // The panel's words (the round and everyone's points) stand over the table's lower left (`HUD` in chrome.ts).
  view: (host, quality) => new HulaView(host, quality),
  colors: HULA_COLORS,
  keyPoints,
  keyStart: (s) => (s.phase === "scored" ? NEXT : (myHand(s)[0] ?? STOCK)),
  rehome: (before, next) => before.seat !== next.seat || before.phase !== next.phase || before.round !== next.round,
  // The others' hands are hidden, and a card drawn cannot be put back.
  computerOnly: true,
  noUndo: true,
  showMovable: false,
  // The computer takes a moment over each card, so that its play can be followed; a claim is quick.
  ponder: (s) => (s.phase === "claim" ? 150 : s.phase === "scored" ? 0 : 320),
  cheer: (before, state) => {
    const said = state.last && state.last !== before.last ? state.last.events : [];
    return said.length ? said.join(" ") : null;
  },
  variants: [
    { value: "1", label: "한 판" },
    { value: "3", label: "3판" },
    { value: "5", label: "5판" },
  ],
  variantLabel: "판 수",
  settings: [
    {
      id: "rivals",
      kind: "choice",
      label: "상대",
      value: "3",
      options: [
        { value: "1", label: "컴퓨터 1명" },
        { value: "2", label: "컴퓨터 2명" },
        { value: "3", label: "컴퓨터 3명" },
      ],
    },
  ],
  firstNote: "첫 판은 내가 먼저 하고, 다음 판부터는 앞 판에서 이긴 사람이 먼저 합니다.",
  // My turn's buttons stand (greyed until the cards picked allow them) so that they do not shift as I pick; 땡큐
  // shows whenever I could claim the top discard.
  tools: [
    { label: "등록", point: REGISTER, show: (s) => mine(s, "meld") },
    { label: "붙이기", point: ATTACH, show: (s) => mine(s, "meld") && s.melds.length > 0 },
    { label: "버리기", point: DISCARD, show: (s) => mine(s, "meld") },
    { label: "땡큐", point: THANK, show: (s) => mine(s, "claim") || (mine(s, "draw") && canClaim(s, 0)) },
    { label: "패스", point: PASS },
    { label: "정렬", point: SORT, text: (s) => (s.sortBy === "suit" ? "숫자순 정렬" : "무늬순 정렬") },
    { label: "다음 판", point: NEXT },
    // The stock itself is tapped to draw: the button is kept for the keyboard.
    { label: "한 장 가져오기", point: STOCK, onBoard: true },
  ],
  tallyHtml: (s) => {
    const others = s.scores.slice(1).map((x, k) => `${["왼쪽", "맞은편", "오른쪽"][placeOf(s.players, k + 1) - 1]} ${scoreText(x)}`);
    return [`<span class="hula-score">${s.round}/${s.rounds}판 · 나 <b>${scoreText(s.scores[0])}</b>점</span>`, `<span class="hula-score">${others.join(" · ")}</span>`];
  },
  name: "훌라",
  english: "Hula",
  number: "NO. 108 — MELD AND GO OUT",
  intro: `<p>같은 숫자나 같은 무늬로 이어지는 카드를 모아 바닥에 등록하고, 남의 묶음에 붙여 가며 손을 비우는 한국식 러미.<br>캠핑장 테이블에서 컴퓨터 1~3명과 겨룹니다. 한 번에 모두 털면 <b>훌라!</b></p>`,
  meta: `나 대 컴퓨터 1~3명 · 카드 52장 · ${HAND}장씩 · 1·3·5판`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>MELD AND GO OUT</span>`,
  artClass: "indian-art",
  artLabel: "훌라 미리보기",
  tableLabel: "THE CAMP TABLE",
  tableNote: (variant, options) => `${Math.min(3, Math.max(1, Number(options.rivals ?? 3))) + 1}명 · ${HAND}장씩 · ${Number(variant) || 3}판`,
  rulesTitle: "모아서 등록하고, 먼저 손을 비우세요",
  rules:
    part(
      "기본 규칙",
      steps(
        `조커를 뺀 카드 52장을 섞어 ${HAND}장씩 나눠 갖고, 한 장을 펼쳐 버린 카드 더미를 시작합니다. 나머지는 가운데 더미입니다. 나 → 왼쪽 → 맞은편 → 오른쪽 차례로 돌아갑니다.`,
        "내 차례에는 먼저 <b>더미에서 한 장</b>을 가져옵니다. 버린 카드 더미의 맨 위 카드로 바로 등록할 수 있으면 그 카드를 대신 가져와도 됩니다(<b>땡큐</b>).",
        "그다음 손의 카드로 묶음을 <b>등록</b>하거나 바닥의 묶음에 <b>붙이기</b>를 원하는 만큼 하고, 마지막에 카드 <b>한 장을 버립니다</b>.",
        "손의 카드를 가장 먼저 모두 없앤 사람이 그 판을 이깁니다. 마지막 카드는 버려도 되고, 등록이나 붙이기로 없애도 됩니다.",
        "정한 판 수를 마치고 점수 합계가 가장 높은 사람이 이깁니다.",
      ),
    ) +
    part(
      "묶음과 7",
      table(
        ["같은 숫자", "숫자가 같은 카드 3장이나 4장입니다. 예: 5♠ 5♥ 5◆."],
        ["같은 무늬 연속", "무늬가 같고 숫자가 이어지는 카드 3장 이상입니다. 예: 4♥ 5♥ 6♥. A는 A 2 3처럼 맨 아래로도, Q K A처럼 맨 위로도 쓰지만 K A 2처럼 넘어가지는 않습니다."],
        ["7", "7은 <b>한 장만으로도</b> 등록할 수 있습니다. 7 두 장, 7과 같은 무늬의 6이나 8도 함께 등록할 수 있습니다."],
        ["붙이기", "바닥에 등록된 묶음이면 누구의 것이든 카드를 붙일 수 있습니다. 붙인 뒤에도 묶음이 맞아야 합니다(같은 숫자의 4번째 카드, 연속의 양 끝, 7에 이어지는 같은 무늬)."],
      ),
    ) +
    part(
      "땡큐",
      table(
        ["땡큐", "방금 버려진 카드로 <b>바로 등록하거나 붙일 수 있을 때만</b> 그 카드를 가져옵니다. 가져온 카드는 곧바로 묶음이 되어 바닥에 놓입니다."],
        ["차례가 아닐 때", "바로 다음 사람은 자기 차례에 가져오면 됩니다. 그 밖의 사람도 등록할 수 있으면 <b>차례가 아니어도</b> 땡큐할 수 있고, 차례 순서로 먼저인 사람이 가져갑니다. 내가 땡큐할 수 있으면 화면에서 물어봅니다(땡큐 또는 패스)."],
        ["땡큐한 다음", "땡큐한 사람이 그 자리에서 차례를 이어받아 더 등록하거나 붙이고 한 장을 버립니다. 그다음은 그 사람의 다음 사람 차례이고, 사이의 사람은 건너뜁니다."],
      ),
    ) +
    part(
      "점수",
      table(
        ["남은 카드", "A는 1점, 2~10은 숫자대로, J·Q·K는 10점입니다."],
        ["이긴 판", "진 사람은 저마다 손에 남은 카드 점수만큼 잃고, 이긴 사람이 그 합을 모두 얻습니다."],
        ["훌라", "그 판에 아무것도 등록하지 않은 채로 시작한 차례에 손을 <b>한 번에 모두</b> 비우면 훌라입니다. 점수가 <b>두 배</b>입니다."],
        ["더미가 떨어지면", "가운데 더미가 다 떨어지면 판이 끝나고, 손에 남은 카드 점수가 가장 낮은 사람이 이깁니다(같으면 카드가 적은 사람, 그것도 같으면 다음 차례에 가까운 사람)."],
      ),
    ) +
    part(
      "조작",
      table(
        ["카드 고르기", "손의 카드를 누르면 위로 올라옵니다(골라짐). 다시 누르면 내려갑니다."],
        ["등록", "카드를 골라 <b>등록</b> 버튼을 누르거나, 내 묶음 줄의 빈자리를 누릅니다."],
        ["붙이기", "카드를 골라 바닥의 묶음을 누르거나 <b>붙이기</b> 버튼을 누릅니다. 붙일 수 있는 묶음 아래가 초록으로 빛납니다."],
        ["버리기", "카드 한 장을 골라 버린 카드 더미를 누르거나 <b>버리기</b> 버튼을 누릅니다."],
        ["땡큐", "함께 등록할 카드를 골라 버린 카드 더미를 누릅니다. 붙이거나 7 한 장으로 낼 때는 고르지 않고 누릅니다."],
        ["정렬", "손의 카드를 무늬순이나 숫자순으로 바꿔 놓습니다."],
      ),
    ) +
    part("처음이라면", notes("7은 혼자서도 등록되니 들고 있지 말고 일찍 내려놓으세요.", "J·Q·K처럼 점수가 큰 카드는 묶음이 안 될 것 같으면 먼저 버리세요.", "남이 바로 붙일 수 있는 카드를 버리면 땡큐를 당합니다.")),
  help: "마우스·터치: 손의 카드를 눌러 고르고, 더미(가져오기)·버린 카드(버리기·땡큐)·바닥의 묶음(붙이기)·내 묶음 줄(등록)을 누릅니다<br>키보드: 화살표로 옮기고 Enter, 아래 버튼",
  sides: ["나", "컴퓨터"],
  startWord: "테이블에 앉기",
};
