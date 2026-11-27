import { HOST_ONLY } from "../../net/match";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { COLORS, COLOR_NAMES, DEFAULT_ROUND, ROUNDS, createNet, seatOfMover, territory, type State } from "./rules";
import { RESPAWN, WIN_SHARE } from "./sim";
import { TERRITORY_COLORS, TerritoryView } from "./view";

const minutes = (s: number) => (s % 60 ? `${Math.floor(s / 60)}분 ${s % 60}초` : `${s / 60}분`);
export const territoryConfig: PointConfig<State> = {
  game: territory,
  live: true,
  pausable: true,
  noUndo: true,
  computerOnly: true,
  // The clock, the shares and the map stand over the field (the view's own); the panel stays in the page for readers.
  noPanel: true,
  view: (host, quality, _variant, _mode, level, _net, live) => new TerritoryView(host, quality, level, live),
  // Over Wi-Fi (와이파이 여럿이) two to four devices steer a mover each; a seat nobody takes is the host's computer's or
  // closed. The round is run by the host's view (`src/net/live.ts`, `net.ts`): each guest sends the heading it wants,
  // the host tells every mover and the field; who is put out and the end are the host's moves alone. A dropped
  // person's mover is steered by the host's computer until they come back. The round's length is the host's.
  net: {
    seats: () => COLOR_NAMES.map((label, k) => ({ label, color: COLORS[k], kinds: k < 2 ? ["computer"] : ["computer", "closed"] })),
    create: (variant, _options, seated) => createNet(variant, seated),
    toMove: () => HOST_ONLY,
    winnerSeat: (s) => (s.ranking ? seatOfMover(s, s.ranking[0]) : null),
    hint: (s, seat) => {
      const k = seat === null ? -1 : (s.seats ?? []).indexOf(seat);
      return k < 0 ? "구경하는 중입니다." : `내 색은 ${COLOR_NAMES[seat!]}입니다. 내 땅 밖으로 나가 한 바퀴 돌아오면 둘러싼 곳이 내 땅이 됩니다.`;
    },
  },
  colors: TERRITORY_COLORS,
  // Land taken (a bigger loop rings brighter), someone put out (my own end heavier), one I cut, the countdown.
  knock: (sound, kind: string, strength) => {
    if (kind === "count" || kind === "go") sound.startLight(kind === "go");
    else if (kind === "claim") {
      sound.pop();
      if (strength > 0.55) sound.sparkle();
      if (strength > 0.8) sound.chime();
    } else if (kind === "out") {
      if (strength > 0.8) {
        sound.crunch();
        sound.bonk();
      } else sound.plop();
    } else if (kind === "cut") {
      sound.ding(0.9);
      sound.chips();
    } else if (kind === "back") sound.hop();
  },
  variants: ROUNDS.map((s) => ({ value: String(s), label: `${minutes(s)} 판` })),
  variantLabel: "시간",
  settings: [
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
  ],
  movingText: "땅따먹기 중…",
  name: "땅따먹기",
  english: "Territory",
  number: "NO. 115 — PAINT YOUR LAND",
  intro: `<p>풀밭에 펼친 커다란 천 위에서 꼬마 페인터들이 땅을 넓힙니다.<br>내 땅 밖으로 나가면 꼬리가 남고, 꼬리를 끌고 내 땅으로 돌아오면 꼬리가 둘러싼 곳이 모두 내 땅이 됩니다. 꼬리를 밟히면 탈락! 시간이 끝났을 때 땅이 가장 넓으면 이깁니다.</p>`,
  meta: "컴퓨터 대전 · 와이파이 여럿이 · 최대 4인 · 실시간",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>PAINT YOUR LAND</span>`,
  artClass: "foosball-art",
  artLabel: "땅따먹기 들판 미리보기",
  tableLabel: "THE PAINTED MEADOW",
  tableNote: (variant) => `실시간 · ${minutes(Number(variant) || DEFAULT_ROUND)} 판`,
  firstNote: "내 꼬마 페인터는 빨강입니다. 화면이 늘 나를 따라갑니다.",
  rulesTitle: "꼬리로 둘러싸 내 땅을 넓히세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "모두 작고 둥근 내 땅에서 시작합니다. 꼬마 페인터는 멈추지 않고 늘 앞으로 갑니다. 방향만 바꿀 수 있습니다.",
        "내 땅 밖으로 나가면 지나간 자리에 <b>꼬리</b>가 남습니다.",
        "꼬리를 끌고 <b>내 땅으로 돌아오면</b> 꼬리와, 꼬리가 둘러싼 안쪽이 모두 내 땅이 됩니다. 남의 땅을 둘러싸면 그 땅도 내 것이 됩니다.",
        "누구든 내 꼬리를 밟으면 나는 <b>탈락</b>합니다. 내가 내 꼬리를 밟아도 탈락입니다. 내 땅 안에 있을 때는 꼬리가 없으니 안전합니다.",
        "머리끼리 부딪히면 자기 땅 밖에 있던 쪽이 탈락합니다(둘 다 밖이면 둘 다).",
        `탈락하면 내 땅과 꼬리가 모두 사라지고, ${RESPAWN}초 뒤 빈 곳에 작은 땅을 받아 다시 시작합니다. 땅을 모두 빼앗겨도 탈락입니다.`,
        `시간이 끝났을 때 땅이 가장 넓은 사람이 이깁니다. 들판의 ${Math.round(WIN_SHARE * 100)}%를 먼저 차지하면 그 자리에서 이깁니다.`,
        "들판 가장자리는 낮은 울타리입니다. 부딪히면 울타리를 따라 미끄러지듯 돕니다.",
      ),
    ) +
    part(
      "조작",
      table(
        ["키보드", "방향키 또는 W A S D. 두 키를 함께 누르면 대각선으로 갑니다."],
        ["마우스", "들판 위에 마우스를 두면 꼬마 페인터가 마우스 쪽으로 방향을 틉니다."],
        ["휴대폰", "왼쪽 아래 레버를 가고 싶은 쪽으로 밀거나, 들판 아무 곳이나 손가락으로 그 방향으로 밀면 됩니다."],
        ["일시정지", "오른쪽 위 버튼이나 P 키."],
      ),
    ) +
    part(
      "화면",
      table(
        ["왼쪽 위", "남은 시간과 내 땅의 넓이(들판의 몇 %인지)."],
        ["오른쪽 위", "모두의 땅 넓이 순위. 탈락해 기다리는 사람은 흐리게 나옵니다."],
        ["오른쪽 아래", "들판 전체의 작은 지도: 저마다의 땅과 꼬리, 꼬마 페인터의 자리(내 것은 크게)."],
        ["땅의 무늬", "빨강은 빗금, 파랑은 비늘, 노랑은 물방울, 초록은 나뭇잎 무늬입니다."],
      ),
    ) +
    part(
      "모드와 레벨",
      table(
        ["컴퓨터 대전", "나는 빨강, 컴퓨터 1~3명과 겨룹니다. 1등을 해야 이깁니다."],
        [
          "와이파이 여럿이",
          "같은 와이파이의 기기 2~4대가 저마다 꼬마 페인터 하나를 몹니다. 빈자리는 방장이 컴퓨터로 채우거나(3·4번은) 닫습니다. 시간은 방장이 고른 대로입니다. 한 사람이 일시정지하면 모두 멈추고, 연결이 끊긴 사람의 페인터는 다시 들어올 때까지 방장 기기의 컴퓨터가 몹니다.",
        ],
        ["쉬움", "작게 돌고, 위험을 늦게 알아챕니다. 남의 꼬리를 노리지 않습니다."],
        ["보통", "알맞게 돌고, 가까이 있는 꼬리는 자르러 옵니다."],
        ["어려움", "크게 돌면서도 위험하면 곧장 집으로 돌아가고, 멀리 있는 꼬리도 노립니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "처음에는 내 땅 가까이에서 작게 고리를 그리며 돌아오세요. 지나간 길이 둘러싼 모양 그대로 내 땅이 됩니다. 작은 고리를 여러 번 그리는 것이 안전합니다.",
        "꼬리가 길수록 위험합니다. 다른 페인터가 다가오면 바로 집으로 돌아가세요.",
        "다른 페인터의 꼬리가 길게 늘어져 있으면 가로질러 잘라 보세요.",
        "남의 땅 사이를 잇듯이 둘러싸면 한 번에 큰 땅을 빼앗을 수 있습니다.",
      ),
    ),
  help: "방향키 또는 W A S D · 마우스 쪽으로 방향 틀기<br>휴대폰: 레버 또는 들판을 손가락으로 밀기<br>일시정지 P",
  sides: ["빨강", "파랑"],
  startWord: "들판에 서기",
};
