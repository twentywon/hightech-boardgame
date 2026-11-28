import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { SnakesView, TOKENS } from "./view";
import { LADDERS, SNAKES, TOKEN_NAMES, createGame, sideFor, snakes, type State } from "./rules";

export const snakesConfig: PointConfig<State> = {
  game: snakes,
  contact: (sound) => sound.wood(2),
  // The view tells a rung trodden (disc), the top of a ladder (pocket) and a snake's hiss and ride (cushion, its seconds).
  knock: (sound, kind, strength) => (kind === "disc" ? sound.stick(0.16) : kind === "pocket" ? sound.pop() : sound.hiss(strength)),
  noPanel: true,
  view: (host, quality) => new SnakesView(host, quality),
  colors: TOKENS.slice(0, 2) as [string, string],
  // The token to move, where the side alone cannot name it (three or four over Wi-Fi, or two that are not red and blue).
  whoOf: (s, player) => {
    const color = s.colors[sideFor(s, player)];
    return color === player && s.positions.length <= 2 ? null : TOKEN_NAMES[color];
  },
  // Over Wi-Fi (와이파이 여럿이) two to four devices play a token each, in the order of the seats; a token nobody takes
  // is the host's computer's or left out.
  net: {
    seats: () => TOKEN_NAMES.map((label, c) => ({ label, color: TOKENS[c], kinds: ["computer", "closed"] })),
    create: (_variant, _options, seated) => createGame([0, 1, 2, 3].filter((c) => seated[c])),
    toMove: (s) => s.colors[s.turn],
    seatOf: (s, player) => s.colors[sideFor(s, player)],
    winnerSeat: (s) => (s.winner === null ? null : s.colors[s.winner]),
  },
  name: "뱀과 사다리",
  english: "Snakes and Ladders",
  number: "NO. 17 — UP AND DOWN",
  intro: `<p>주사위를 굴려 100번 칸까지 먼저 가는 놀이.<br>사다리는 올라가고, 뱀을 만나면 미끄러집니다.</p>`,
  meta: `2인 · 와이파이 2~4인 · 100칸 · 사다리 ${Object.keys(LADDERS).length}개 · 뱀 ${Object.keys(SNAKES).length}마리`,
  art: `<div class="pg-mini snakes">${"<i></i>".repeat(3)}</div><span>UP THE LADDER</span>`,
  artClass: "snakes-art",
  artLabel: "뱀과 사다리 판 미리보기",
  tableLabel: "THE BOARD",
  tableNote: () => "100칸",
  rulesTitle: "100번 칸에 먼저 도착하세요",
  rules:
    part("기본 규칙", steps("<b>빨강이 먼저</b> 주사위를 굴립니다.", "주사위 눈만큼 번호 순서대로 앞으로 갑니다. 판 밖에서 시작하므로 처음 3이 나오면 3번 칸에 섭니다.", "100번 칸에 먼저 도착하면 이깁니다.")) +
    part("특별한 칸과 눈", table(["사다리", "<b>아래쪽</b> 칸에 서면 꼭대기 칸으로 올라갑니다."], ["뱀", "<b>머리</b> 칸에 서면 꼬리 칸으로 미끄러져 내려갑니다."], ["6", "한 번 더 굴립니다."], ["100번 칸", "<b>딱 맞는 눈</b>이 나와야 들어갑니다. 넘치는 눈이 나오면 그 차례는 움직이지 않습니다."])) +
    part("와이파이 여럿이", table(["말 고르기", "같은 와이파이에 있는 기기 2~4대가 말 하나씩 맡습니다. 아무도 앉지 않은 말은 방장이 <b>컴퓨터</b>로 두거나 빼 둡니다."], ["차례", "빨강 → 파랑 → 초록 → 노랑 순서로, 앉은 말만 돕니다. 내 차례에 내 기기에서 주사위를 굴립니다."], ["주사위", "눈은 굴리는 순간 방장의 기기에서 정해져 모든 기기에 똑같이 나옵니다. 누구도 미리 알 수 없습니다."])) +
    part("그 밖에", notes("운으로만 겨루는 놀이입니다. 컴퓨터 난이도는 결과에 영향을 주지 않습니다.", "저장과 무르기는 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  sides: ["빨강", "파랑"],
  startWord: "테이블에 앉기",
  action: "주사위 굴리기",
  help: "마우스·터치: 판을 누르면 주사위를 굴립니다<br>키보드: 주사위 굴리기 버튼",
};
