import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { numberCode } from "./game";
import { AGAIN, DRAW_BLACK, DRAW_WHITE, GAP, HELPER, POOL, STOP, handOf, said, seatNames, tileCode, type State } from "./rules";
import { NUMBERCODE_COLORS, NumberCodeView } from "./view";
import { gapAt, lieAt, poolAt, standAt } from "./layout";

/** Where the keyboard's points are: every tile on the table, the pool's places, and the gaps a joker of mine may go to. */
function keyPoints(s: State) {
  const points = Array.from({ length: GAP + 40 }, () => ({ x: NaN, z: NaN }));
  s.rows.forEach((row, seat) =>
    row.forEach((id, i) => {
      const pose = s.open[id] ? lieAt(s.seats, seat, i, row.length) : standAt(s.seats, seat, i, row.length);
      points[tileCode(seat, i)] = { x: pose.p[0], z: pose.p[2] };
    }),
  );
  s.pool.forEach((id, slot) => {
    if (id !== null) points[POOL + slot] = poolAt(slot, s.pool.length);
  });
  if (s.phase === "joker" && s.seat === 0) for (let k = 0; k <= s.rows[0].length; k++) points[GAP + k] = gapAt(s.seats, k, s.rows[0].length);
  return points;
}
/** Where the keyboard begins for what is to be done: the pool, the first hidden tile of the next player, my own row, the first gap. */
function keyStart(s: State) {
  if (s.phase === "draw") return POOL + Math.max(0, s.pool.findIndex((id) => id !== null));
  if (s.phase === "joker") return GAP;
  if (s.phase === "reveal") return tileCode(0, Math.max(0, s.rows[0].findIndex((id) => !s.open[id])));
  for (let k = 1; k < s.seats; k++) {
    const seat = (s.seat + k) % s.seats,
      i = s.rows[seat].findIndex((id) => !s.open[id]);
    if (seat !== s.seat && !s.out[seat] && i >= 0) return tileCode(seat, i);
  }
  return tileCode(0, 0);
}
/** What a guess was, in a few words: right or wrong, by whom, and what it did. */
function cheer(before: State, s: State) {
  const last = s.last;
  if (!last || last === before.last || (last.kind !== "right" && last.kind !== "wrong")) return null;
  const names = seatNames(s.seats),
    aimed = s.rows.findIndex((row) => row.includes(last.target!));
  if (last.kind === "right") {
    if (aimed === 0) return "들켰다!";
    const gone = last.out.filter((seat) => seat !== 0);
    return gone.length ? `${names[gone[0]]} 탈락!` : last.seat === 0 ? `정답! ${said(last.said!)}` : "정답!";
  }
  return aimed === 0 ? "막았다!" : last.seat === 0 ? "땡!" : "빗나갔다!";
}

export const numberCodeConfig: PointConfig<State> = {
  game: numberCode,
  contact: (sound) => sound.tile(5),
  noPanel: true,
  view: (host, quality) => new NumberCodeView(host, quality),
  colors: NUMBERCODE_COLORS,
  keyPoints,
  keyStart,
  rehome: (before, next) => before.phase !== next.phase || before.seat !== next.seat,
  // The others' tiles are hidden, and nothing said can be taken back.
  computerOnly: true,
  noUndo: true,
  showMovable: false,
  extraHint: "그 타일의 숫자를 고르세요. 다른 곳을 누르면 취소됩니다.",
  // The computer thinks a moment over a guess, so that its play can be followed.
  ponder: (s) => (s.phase === "guess" ? 550 : s.phase === "again" ? 450 : 200),
  cheer,
  settings: [
    {
      id: "rivals",
      kind: "choice",
      label: "상대",
      value: "1",
      options: [
        { value: "1", label: "컴퓨터 1명" },
        { value: "2", label: "컴퓨터 2명" },
        { value: "3", label: "컴퓨터 3명" },
      ],
    },
    { id: "jokers", kind: "flag", label: "조커 넣기", note: "검은 조커와 흰 조커(−)를 넣습니다. 조커는 줄 어디에나 설 수 있습니다.", value: true },
    { id: "helper", kind: "flag", label: "추리 도우미", note: "상대의 숨은 타일 아래에 아직 될 수 있는 숫자를 보여 줍니다. 판 위의 버튼으로도 켜고 끕니다.", value: false },
  ],
  firstNote: "내가 먼저 하고, 컴퓨터는 왼쪽부터 차례로 합니다.",
  tools: [
    // A tap on the pool, on the bubble or on my own tile does these; the buttons are kept for the keyboard and readers.
    { label: "검은 타일 가져오기", point: DRAW_BLACK, onBoard: true },
    { label: "흰 타일 가져오기", point: DRAW_WHITE, onBoard: true },
    { label: "계속 맞히기", point: AGAIN, onBoard: true },
    { label: "멈추기", point: STOP, onBoard: true },
    { label: "추리 도우미", point: HELPER, show: (s) => s.winner === null, text: (s) => (s.helper ? "도우미 끄기" : "추리 도우미") },
  ],
  name: "숫자 코드",
  english: "Number Code",
  number: "NO. 85 — CRACK THE CODE",
  intro: `<p>검은 타일과 흰 타일에 숨은 숫자를 추리해 맞히는 게임. 흔히 '다빈치 코드'라는 이름으로 알려져 있습니다.<br>작은 수부터 늘어선 상대의 타일을 하나씩 짚어 숫자를 말하고, 모두의 코드를 먼저 풀어내세요.</p>`,
  meta: "나 대 컴퓨터 1~3명 · 타일 24장과 조커 2장",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>CRACK THE CODE</span>`,
  artClass: "indian-art",
  artLabel: "숫자 코드 미리보기",
  tableLabel: "THE CODE TABLE",
  tableNote: (_variant, options) => {
    const seats = Math.min(3, Math.max(1, Number(options.rivals ?? 1))) + 1;
    return `${seats}명 · ${handOf(seats)}장씩${options.jokers === false ? "" : " · 조커 2장"}`;
  },
  rulesTitle: "상대의 코드를 풀어내세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "타일은 0부터 11까지 검은색과 흰색이 한 장씩 24장, 조커를 넣으면 검은 조커와 흰 조커(−)가 더해집니다. 둘이나 셋이면 4장씩, 넷이면 3장씩 받습니다.",
        "받은 타일은 <b>작은 수가 왼쪽</b>이 되게 줄을 세웁니다. 같은 수라면 <b>검은 타일이 왼쪽</b>입니다. 상대에게는 뒷면만 보이므로 색과 자리만 알 수 있습니다.",
        "차례가 오면 가운데 더미에서 타일 한 장을 가져온 뒤, 상대의 숨은 타일 하나를 짚어 숫자를 말합니다.",
        "맞히면 그 타일이 앞면으로 눕혀지고, 계속 맞히거나 멈출 수 있습니다. 멈추면 가져온 타일을 순서에 맞게 숨긴 채 내 줄에 넣습니다.",
        "틀리면 가져온 타일을 <b>앞면으로</b> 내 줄에 넣고 차례가 끝납니다. 더미가 비었다면 대신 내 숨은 타일 하나를 골라 공개합니다.",
        "타일이 모두 공개된 사람은 탈락합니다. 마지막까지 숨은 타일을 지킨 사람이 이깁니다.",
      ),
    ) +
    part(
      "숫자 코드의 말",
      table(
        ["줄 세우기", "작은 수부터 왼쪽에, 같은 수는 검은색이 먼저. 컴퓨터의 줄도 내가 보는 쪽에서 왼쪽부터 커집니다(옆자리는 시계 방향으로 읽습니다)."],
        ["조커(−)", "숫자가 없는 타일로, 줄 어디에나 둘 수 있습니다. 받거나 가져올 때 놓을 자리를 고릅니다. 맞히려면 −를 말합니다."],
        ["계속 맞히기", "맞힌 뒤 한 번 더 도전합니다. 틀리면 가져온 타일이 공개되니 확신이 있을 때만 계속하세요."],
        ["추리 도우미", "켜 두면 상대의 숨은 타일마다 아직 가능한 숫자를 아래에 보여 줍니다. 내가 볼 수 있는 것만으로 계산합니다."],
        ["탈락", "타일이 모두 앞면이 된 사람은 빠지고, 남은 사람끼리 계속합니다. 내가 탈락하면 게임이 끝납니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "공개된 타일 사이에 낀 숨은 타일은 될 수 있는 숫자가 적습니다. 그런 타일부터 노려 보세요.",
        "내가 가진 타일과 이미 공개된 타일의 숫자는 상대에게 있을 수 없습니다.",
        "누가 어떤 숫자를 틀리게 말했는지도 단서가 됩니다. 그 타일은 그 숫자가 아닙니다.",
      ),
    ),
  help: "마우스·터치: 더미의 타일을 눌러 가져오고, 상대의 숨은 타일을 누른 뒤 숫자를 고릅니다",
  sides: ["나", "컴퓨터"],
  startWord: "테이블에 앉기",
};
