import { HOST_ONLY } from "../../net/match";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { COLORS, COLOR_NAMES, DEFAULT_LAPS, LAP_CHOICES, carName, createNet, seatOfCar, slotCar, type State } from "./rules";
import { COUNTDOWN, FLY, MARSHAL, WAIT } from "./sim";
import { COURSES } from "./track";
import { SLOT_COLORS, SlotCarView } from "./view";

/** The car a person drives that a move speaks of, or null (a computer's car, or not a car's move). */
const offCar = (before: State, state: State) => {
  const car = state.offs.findIndex((n, k) => n > before.offs[k]);
  return car >= 0 && car < state.people ? car : null;
};
const penalty = Math.round((FLY + MARSHAL) * 10) / 10;
export const slotCarConfig: PointConfig<State> = {
  game: slotCar,
  live: true,
  pausable: true,
  noUndo: true,
  // The board of laps and places stands over the table (the view's own); the panel stays in the page for readers.
  noPanel: true,
  view: (host, quality, variant, mode, level, _net, live) => new SlotCarView(host, quality, variant, level, mode === "local" && !live, live),
  // Over Wi-Fi (와이파이 여럿이) up to four devices drive a car each, one to a lane; a seat nobody takes is the host's
  // computer's or closed (no car in the race). The race is run by the host's view (`src/net/live.ts`, `net.ts`): each
  // guest sends its pedal, the host tells every car; laps, flights off and the end are the host's moves alone. A
  // dropped person's car is driven by the host's computer until they come back. Course and laps are the host's.
  net: {
    seats: () => COLOR_NAMES.map((label, k) => ({ label, color: COLORS[k], kinds: ["computer", "closed"] })),
    create: (variant, options, seated) => createNet(variant, options, seated),
    toMove: () => HOST_ONLY,
    winnerSeat: (s) => (s.ranking ? seatOfCar(s, s.ranking[0]) : null),
    hint: (s, seat) => {
      const car = seat === null ? -1 : (s.seats ?? []).indexOf(seat);
      return car < 0 ? "구경하는 중입니다." : `내 차는 ${COLOR_NAMES[seat!]}입니다. 가속 페달을 누르고 있으면 빨라지고, 코너에 너무 빨리 들어가면 튕겨 나갑니다.`;
    },
  },
  colors: SLOT_COLORS,
  sides: ["빨강", "파랑"],
  // At one screen the result names the person whose car came home first.
  whoOf: (s, _player, mode) => (mode !== "local" ? null : s.ranking ? carName(s, s.ranking[0]) : ""),
  localLabel: "로컬 2–4인",
  // Over the table: a person's car flying off, the leader on the last lap, and the first car home.
  cheer: (before, state, mode) => {
    const off = offCar(before, state);
    if (off !== null) return mode === "local" ? `${COLOR_NAMES[seatOfCar(state, off)]} 이탈!` : "코스 이탈!";
    if (state.order.length && !before.order.length) {
      const first = state.order[0];
      return mode === "local" ? `${carName(state, first)} 1위!` : first === 0 ? "1위로 골인!" : `${carName(state, first)} 골인`;
    }
    const lead = (s: State) => Math.max(...s.done);
    if (state.laps > 1 && lead(state) === state.laps - 1 && lead(before) < state.laps - 1) return "마지막 바퀴!";
    return null;
  },
  // The motors whine with the pedal and the speed (the people's cars, and the computer's as a quieter pack), a car
  // at the edge of its grip screeches (카가각, so that the pedal can be let go in time), flying off skids and clatters, the start lights beep and go, a lap of mine blips, a car set back clicks.
  knock: (sound, kind: string, strength) => {
    if (kind === "whine" || kind === "coast") sound.slotMotor(strength, kind === "whine");
    else if (kind === "pack") sound.slotPack(strength);
    else if (kind === "screech") sound.slotScreech(strength);
    else if (kind === "crash") sound.deslot(strength);
    else if (kind === "light" || kind === "go") sound.startLight(kind === "go");
    else if (kind === "lap") sound.lapBeep();
    else if (kind === "back") sound.plastic();
  },
  variants: COURSES.map((c) => ({ value: c.value, label: c.name })),
  variantLabel: "코스",
  settings: [
    {
      id: "laps",
      kind: "choice",
      label: "바퀴 수",
      value: String(DEFAULT_LAPS),
      options: LAP_CHOICES.map((n) => ({ value: String(n), label: `${n}바퀴` })),
    },
    {
      id: "computers",
      kind: "choice",
      label: "컴퓨터 수",
      value: "3",
      ai: true,
      options: [
        { value: "1", label: "1명" },
        { value: "2", label: "2명" },
        { value: "3", label: "3명" },
      ],
    },
    {
      id: "people",
      kind: "choice",
      label: "사람 수",
      value: "2",
      local: true,
      net: false,
      options: [
        { value: "2", label: "2명" },
        { value: "3", label: "3명" },
        { value: "4", label: "4명" },
      ],
    },
  ],
  movingText: "경주 중…",
  name: "슬롯 카",
  english: "Slot Car",
  number: "NO. 103 — FOUR LANES",
  intro: `<p>다락방 취미실의 커다란 테이블에 깔린 슬롯카 트랙.<br>가속 페달을 누르고 있으면 차가 빨라집니다. 코너에서 너무 빠르면 튕겨 나가니, 코너 앞에서 페달을 떼고 정해진 바퀴를 먼저 도세요.</p>`,
  meta: "컴퓨터 대전 · 로컬 2–4인 · 와이파이 여럿이 · 레인 최대 4개 · 실시간",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FOUR LANES</span>`,
  artClass: "foosball-art",
  artLabel: "슬롯카 트랙 미리보기",
  tableLabel: "THE ATTIC RACEWAY",
  tableNote: (variant, options) => `${COURSES.find((c) => c.value === variant)?.name ?? COURSES[0].name} · ${options.laps ?? DEFAULT_LAPS}바퀴`,
  firstNote: "컴퓨터 대전에서는 내가 빨간 1번 차를 몹니다. 오른쪽 아래의 가속 페달(또는 스페이스)을 누르고 있으면 달립니다.",
  rulesTitle: "튕겨 나가지 않게, 정해진 바퀴를 먼저",
  rules:
    part(
      "기본 규칙",
      steps(
        "트랙에는 차마다 자기 <b>레인</b>이 있습니다(최대 네 개). 차는 바닥의 홈(슬롯)에 끼운 가이드 날을 따라 달리므로 핸들은 없고, <b>가속 페달</b>만 씁니다.",
        "페달을 <b>누르고 있으면</b> 모터가 차를 끌어 점점 빨라집니다. <b>떼면</b> 모터가 멈추고 브레이크가 걸려 느려집니다.",
        "코너마다 <b>버틸 수 있는 속도</b>가 있습니다. 반지름이 작은 급한 코너, 그리고 코너 안쪽 레인일수록 낮고, 기울어진(뱅크) 코너는 높습니다.",
        "그 속도에 가까워지면 타이어가 <b>'카가각'</b> 하고 비명을 지릅니다. 이 소리가 나면 페달에서 손을 떼세요.",
        "그 속도를 넘으면 차 뒤꽁무니가 미끄러져 나가고, 페달을 계속 누르고 있거나 한꺼번에 아주 많이 넘으면 원심력에 차가 코너 바깥으로 <b>튕겨 나가</b> 테이블 위를 구릅니다. 직선에서는 아무리 빨라도 튕겨 나가지 않습니다.",
        `튕겨 나간 차는 약 ${penalty}초 뒤 마셜이 튕겨 나간 그 자리의 레인에 다시 올려 줍니다. 그동안 다른 차는 계속 달립니다.`,
        `출발 신호등 세 개가 하나씩 빨갛게 켜진 뒤(${COUNTDOWN}초) 모두 초록으로 바뀌면 출발합니다.`,
        "출발선을 지날 때마다 한 바퀴입니다. 정해진 바퀴(3·5·10바퀴)를 가장 먼저 마친 차가 1위입니다.",
        `모든 차가 들어오거나, 1위가 들어온 뒤 ${WAIT}초가 지나면 경주가 끝납니다. 그때까지 못 들어온 차는 달린 거리로 순위를 매깁니다.`,
      ),
    ) +
    part(
      "코스",
      table(
        ...COURSES.map((c): [string, string] => [c.name, `${c.note}.`]),
        ["레인 길이", "모든 코스는 8자 모양이라 왼쪽으로 도는 만큼 오른쪽으로도 돕니다. 그래서 한 고리에서 안쪽인 레인이 다른 고리에서는 바깥쪽이 되어, 모든 레인의 한 바퀴 길이가 똑같습니다."],
        ["다리", "트랙이 스스로를 건너는 곳은 높은 다리로 넘어갑니다. 레인끼리 겹치지 않아 차는 끝까지 자기 레인만 달립니다."],
      ),
    ) +
    part(
      "모드",
      table(
        ["컴퓨터 대전", "나는 빨간 1번 차를 몰고, 컴퓨터 차 1~3대와 겨룹니다. 1위로 들어와야 이깁니다."],
        ["로컬 2–4인", "한 화면에서 2~4명이 각자 자기 차를 몹니다. 페달은 화면 모서리에 하나씩, 앉은 쪽을 향해 놓이고, 여러 손가락으로 동시에 눌러도 됩니다."],
        [
          "와이파이 여럿이",
          "같은 와이파이의 기기 2~4대가 레인 하나씩, 자기 차를 몹니다. 아무도 앉지 않은 레인은 방장이 <b>컴퓨터</b> 차로 두거나 빼 둡니다. 코스와 바퀴 수는 방장이 고른 대로입니다. 모든 기기에 코스 전체가 보이고, 내 차 위에는 <b>나</b> 표시가 뜨며, 화면에는 내 차의 페달 하나만 있습니다. 한 사람이 일시정지하면 모두 멈춥니다. 연결이 끊긴 사람의 차는 다시 들어올 때까지 방장 기기의 컴퓨터가 몹니다.",
        ],
      ),
    ) +
    part(
      "페달",
      table(
        ["누르기", "화면의 큰 가속 페달을 누르고 있는 동안 가속합니다. 컴퓨터 대전에서는 테이블 아무 곳이나 누르고 있어도 됩니다."],
        ["키보드", "스페이스(또는 ↑)가 1번 차, Enter가 2번 차입니다. 숫자 1~4는 그 번호의 차입니다."],
      ),
    ) +
    part(
      "순위판",
      table(
        ["LAP", "선두가 달리는 바퀴입니다."],
        ["순위", "차마다 지금 순위, 색, 이름, 달리는 바퀴가 나옵니다. 튕겨 나간 차는 '이탈', 들어온 차는 '완주'로 나옵니다."],
      ),
    ) +
    part(
      "레벨",
      table(
        ["쉬움", "코너를 조심히 돌지만 판단이 들쭉날쭉하고 브레이크가 늦어 가끔 튕겨 나갑니다."],
        ["보통", "알맞게 빠르고, 아주 가끔 실수합니다."],
        ["어려움", "코너마다 한계에 가깝게, 거의 실수 없이 돕니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "직선에서는 페달을 끝까지 누르고, 코너가 보이면 조금 일찍 떼세요. 코너 안에서는 '카가각' 소리를 들으며 짧게 눌렀다 뗐다 해 속도를 지킵니다.",
        "차 뒤꽁무니가 바깥으로 흔들리면 한계에 가까운 것입니다. 바로 페달을 떼세요.",
        "튕겨 나가면 몇 초를 잃습니다. 조금 느려도 튕겨 나가지 않는 쪽이 대개 빠릅니다.",
        "같은 코너라도 안쪽 레인은 더 천천히 돌아야 합니다.",
      ),
    ),
  help: "가속 페달을 누르고 있으면 가속, 떼면 감속<br>컴퓨터 대전: 테이블 아무 곳이나 눌러도 됩니다<br>키보드: 스페이스(1번) · Enter(2번) · 숫자 1~4",
  startWord: "트랙에 서기",
};
