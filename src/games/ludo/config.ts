import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { COLOR_NAMES, ROLL, createGame, ludo, sideFor, type State } from "./rules";
import { LUDO_COLORS, LudoView, TOKEN_COLORS } from "./view";

export const ludoConfig: PointConfig<State> = {
  game: ludo,
  contact: (sound) => sound.wood(1),
  noPanel: true,
  view: (host, quality) => new LudoView(host, quality),
  colors: LUDO_COLORS,
  autoSingle: true,
  // The colour to move, where the side alone cannot name it (three or four over Wi-Fi, or two that are not red and green).
  whoOf: (s, player) => {
    const color = s.colors[sideFor(s, player)];
    return color === player && s.tokens.length <= 2 ? null : COLOR_NAMES[color];
  },
  // Over Wi-Fi (와이파이 여럿이) each device plays one colour; a colour nobody takes is the host's computer's or left
  // out (its yard stays empty). The order of play is the road's (빨강, 노랑, 초록, 파랑), whoever sits where.
  net: {
    seats: () => COLOR_NAMES.map((label, c) => ({ label, color: TOKEN_COLORS[c], kinds: ["computer", "closed"] })),
    create: (_variant, _options, seated) => createGame([0, 1, 2, 3].filter((c) => seated[c])),
    toMove: (s) => s.colors[s.turn],
    seatOf: (s, player) => s.colors[sideFor(s, player)],
    winnerSeat: (s) => (s.winner === null ? null : s.colors[s.winner]),
  },
  cheer: (before, state, mode) =>
    state.last && state.last !== before.last && state.last.sent.length ? (mode === "ai" && state.last.side === 1 ? "잡혔다!" : "잡았다!") : null,
  // A roll cannot be taken back.
  noUndo: true,
  // The die itself is tapped: the button is kept for the keyboard only.
  tools: [{ label: "주사위 굴리기", point: ROLL, onBoard: true }],
  name: "루도",
  english: "Ludo",
  number: "NO. 31 — ROUND AND HOME",
  intro: `<p>흰 테이블 위의 십자 모양 판.<br>주사위를 굴려 말 네 개를 한 바퀴 돌려 가운데 집에 먼저 넣으세요.</p>`,
  meta: "2인 · 와이파이 2~4인 · 말 4개씩 · 주사위 1개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>ROLL, RACE, RETURN</span>`,
  artClass: "ludo-art",
  artLabel: "루도 판 미리보기",
  tableLabel: "THE WHITE TABLE",
  tableNote: () => "말 4개씩 · 빨강 선공",
  rulesTitle: "한 바퀴 돌아 집으로",
  rules:
    part("기본 규칙", steps("각자 말 네 개를 자기 <b>마당</b>(귀퉁이)에 두고 시작합니다. <b>빨강이 먼저</b> 굴립니다.", "차례마다 주사위를 굴리고, 나온 눈만큼 <b>말 하나</b>를 시계 방향으로 옮깁니다.", "말은 길을 한 바퀴 돈 뒤 <b>자기 색 줄</b>로 꺾어 들어가 가운데 집에 닿습니다.", "말 네 개를 먼저 모두 집에 넣으면 이깁니다.")) +
    part("주사위", table(["6", "마당의 말 하나를 출발 칸에 내놓을 수 있습니다. 그리고 <b>한 번 더</b> 굴립니다."], ["움직일 말이 없으면", "그 눈은 버리고 차례가 넘어갑니다."], ["집에 들어가기", "집까지 남은 칸과 <b>딱 맞는 눈</b>이 나와야 들어갑니다. 넘치는 눈으로는 그 말을 움직일 수 없습니다."], ["한 번 더", "6이 나왔을 때, 상대 말을 돌려보냈을 때, 말을 집에 넣었을 때."])) +
    part("잡기와 안전한 칸", table(["잡기", "상대 말이 있는 칸에 서면 그 말은 자기 마당으로 돌아가 6을 다시 기다립니다."], ["별 칸", "별이 그려진 여덟 칸(네 출발 칸 포함)에서는 잡히지 않습니다. 두 사람의 말이 함께 설 수 있습니다."], ["자기 색 줄", "집으로 들어가는 줄에는 상대가 들어올 수 없습니다."])) +
    part(
      "와이파이 여럿이",
      table(
        ["색 고르기", "같은 와이파이에 있는 기기 2~4대가 한 색씩 맡습니다. 아무도 앉지 않은 색은 방장이 <b>컴퓨터</b>로 두거나 빼 둡니다. 빠진 색의 마당은 비어 있습니다."],
        ["차례", "누가 어느 색에 앉든 길이 도는 순서대로 <b>빨강 → 노랑 → 초록 → 파랑</b>으로 돕니다. 내 색 차례에 내 기기에서 주사위를 굴립니다."],
        ["주사위", "눈은 굴리는 순간 방장의 기기에서 정해져 모든 기기에 똑같이 나옵니다. 누구도 미리 알 수 없습니다."],
      ),
    ) +
    part("화면", table(["굴리기", "판 위의 <b>주사위 굴리기</b> 버튼이나 주사위를 누릅니다."], ["말 고르기", "움직일 수 있는 말에 금색 고리가 뜹니다. 누르면 바로 갑니다."])) +
    part("처음이라면", notes("6이 나오면 새 말을 내놓을지, 나와 있는 말을 6칸 보낼지 고릅니다. 말이 여럿 나와 있어야 눈을 버리지 않습니다.", "상대 말 뒤 1–6칸에 서 있으면 다음 차례에 잡힐 수 있습니다. 별 칸에서 쉬어 갑니다.", "잡을 수 있으면 대개 잡는 것이 좋습니다. 한 번 더 굴리기도 합니다.")),
  help: "마우스·터치: 주사위를 누르고, 금색 고리가 뜬 말을 누릅니다",
  sides: ["빨강", "초록"],
  startWord: "테이블에 앉기",
};
