import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { HOST_ONLY } from "../../net/match";
import { POINTS, SHORT, deuce, gameNumber, need, serverOf, tableTennis, type State } from "./rules";
import { TABLE_TENNIS_COLORS, TableTennisView } from "./view";
import { gameResult } from "./result";

/** The game scores: a column for each game (finished ones with their score, the one being played with its points so far). */
function gameTable(state: State, names: [string, string] = ["나", "컴퓨터"]) {
  const now = state.winner === null ? state.done.length : -1,
    cell = (k: number, p: 0 | 1) => {
      const score = k < state.done.length ? state.done[k] : k === now ? state.score : null;
      if (!score) return `<i class="tt-cell">·</i>`;
      const won = k < state.done.length && score[p] > score[1 - p];
      return `<i class="tt-cell${k === now ? " now" : ""}${won ? " won" : ""}">${score[p]}</i>`;
    },
    row = (p: 0 | 1, name: string) => `<span class="tt-row tt-side-${p}"><b>${name}</b>${Array.from({ length: state.best }, (_, k) => cell(k, p)).join("")}<em>${state.games[p]}</em></span>`;
  return `<span class="tt-table" aria-hidden="true" style="--games:${state.best}"><span class="tt-row tt-head"><b></b>${Array.from({ length: state.best }, (_, k) => `<i class="tt-cell${k === now ? " now" : ""}">${k + 1}</i>`).join("")}<em>게임</em></span>${row(0, names[0])}${row(1, names[1])}</span>`;
}
export const tableTennisConfig: PointConfig<State> = {
  game: tableTennis,
  // The points stand on a lit scoreboard of their own over the table (the panel, drawn as a stadium board).
  panel: "scoreboard",
  live: true,
  pausable: true,
  noUndo: true,
  computerOnly: true,
  // The first deuce (10 all, or 6 all in a game to 7) is called across the table.
  cheer: (before, state) => (state.ply <= before.ply || state.winner !== null ? null : deuce(state) && !deuce(before) ? "듀스" : null),
  // A game won or lost is told over the table with its score (the match's end has its own word).
  setResult: (before, state, _mode, seat) => gameResult(before, state, seat === undefined ? 0 : seat),
  // The board: the game being played over the middle, each side's points in it with a ball by the server's, and
  // beside it every game's score in its column with the games won at the end.
  tallyHtml: (state, _mode, seat) =>
    [0, 1].map(
      (p) =>
        `${p === 0 ? `<span class="tt-game">GAME ${gameNumber(state)}</span>${gameTable(state, seat === undefined ? undefined : ["빨강", "파랑"])}` : ""}<span class="tt-points">${state.score[p]}</span><i class="tt-serve${state.winner === null && serverOf(state) === p ? " on" : ""}" aria-hidden="true"></i>`,
    ) as [string, string],
  view: (host, quality, _variant, _mode, level, live) => new TableTennisView(host, quality, level, live),
  // Over Wi-Fi (와이파이 여럿이) two devices hold a paddle each, the hall run by the host's (`src/net/live.ts`); a point
  // is the host's move alone. A dropped player's paddle is the host's computer's until they come back.
  net: {
    seats: () => (["빨강", "파랑"] as const).map((label, p) => ({ label, color: TABLE_TENNIS_COLORS[p], kinds: ["computer"] })),
    toMove: () => HOST_ONLY,
    hint: (s, seat) => {
      const line = s.best === 1 ? `${s.score[0]} 대 ${s.score[1]}` : `${gameNumber(s)}게임 ${s.score[0]} 대 ${s.score[1]} (게임 ${s.games[0]} 대 ${s.games[1]})`;
      if (seat !== 0 && seat !== 1) return `${line}. 구경하는 중입니다.`;
      return serverOf(s) === seat
        ? `${line}. 내 서브: 화면을 눌러 공을 띄우고, 떨어질 때 라켓을 위로 휘둘러 치세요.`
        : `${line}. 상대 서브: 공이 내 쪽에 한 번 튀면 라켓을 대어 넘기세요.`;
    },
    reason: (s) =>
      s.best === 1
        ? `${s.done[0][0]} 대 ${s.done[0][1]}로 끝났습니다. ${s.points}점 단판 승부입니다.`
        : `게임 스코어 ${s.games[0]} 대 ${s.games[1]}로 끝났습니다 (${s.done.map(([a, b]) => `${a}:${b}`).join(", ")}). ${s.best}게임 가운데 ${need(s)}게임을 먼저 땄습니다.`,
  },
  colors: TABLE_TENNIS_COLORS,
  // The paddle's wooden knock, the ball's light tap on the table or the floor, the soft net.
  knock: (sound, kind) => (kind === "disc" ? sound.knock(4) : kind === "cushion" ? sound.tap() : sound.soft(1)),
  variants: [
    { value: "1", label: `단판 승부 (${POINTS}점)` },
    { value: "3", label: `3게임 (2게임 선승, ${SHORT}점)` },
  ],
  variantLabel: "경기",
  name: "탁구",
  english: "Table Tennis",
  number: "NO. 75 — FIRST TO ELEVEN",
  intro: `<p>탁구 클럽의 경기장, 내 쪽 끝에서 탁구대를 내려다봅니다.<br>라켓을 휘둘러 컴퓨터와 랠리를 주고받으세요. ${POINTS}점 단판 승부 또는 ${SHORT}점 3게임 경기입니다.</p>`,
  meta: `컴퓨터 대전 · 와이파이 여럿이 · ${POINTS}점 단판 또는 ${SHORT}점 3게임 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FIRST TO ${POINTS}</span>`,
  artClass: "foosball-art",
  artLabel: "탁구대 미리보기",
  tableLabel: "WTG TABLE TENNIS CLUB",
  tableNote: (variant) => (variant === "3" ? `실시간 · ${SHORT}점 3게임` : `실시간 · ${POINTS}점 단판 승부`),
  firstNote: "첫 게임은 컴퓨터가 먼저 서브합니다. 서브는 2점마다, 듀스부터는 1점마다 바뀝니다.",
  rulesTitle: "점수를 먼저 내고, 경기를 따세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "나는 앞쪽(빨간 숫자), 컴퓨터는 탁구대 건너편(파란 숫자)입니다. 공을 라켓으로 쳐서 <b>상대 쪽 코트에 한 번 튀게</b> 넘깁니다.",
        "상대가 친 공은 <b>내 쪽 코트에 한 번 튄 뒤</b>에 칩니다. 튀기 전의 공은 라켓에 맞지 않고 지나갑니다.",
        "공을 놓치거나, 상대 코트를 벗어나거나(아웃), 네트에 걸리거나, 내 코트에서 두 번 튀면(투 바운드) 상대가 1점을 얻습니다.",
        `<b>단판 승부</b>는 <b>${POINTS}점</b>을 먼저 내는 쪽이 이깁니다. 단 10 대 10(듀스)부터는 <b>2점</b>을 앞서야 합니다.`,
        `<b>3게임</b>은 한 게임이 <b>${SHORT}점</b>이고, 2게임을 먼저 따는 쪽이 이깁니다. 6 대 6(듀스)부터는 2점을 앞서야 합니다.`,
      ),
    ) +
    part(
      "서브",
      table(
        ["내 서브", "화면을 누르면(키보드는 스페이스) 공을 띄웁니다. 공이 떨어질 때 라켓을 <b>위로 휘둘러</b> 칩니다. 공을 못 치고 떨어뜨리면 다시 띄웁니다."],
        ["바른 서브", "공이 먼저 <b>내 코트에 한 번</b>, 그다음 <b>상대 코트에 한 번</b> 튀어야 합니다. 바로 상대 코트로 가거나 밖으로 나가면 서브 실수입니다."],
        ["렛", "서브가 네트에 스친 뒤 상대 코트에 바르게 떨어지면 점수 없이 다시 서브합니다. 단, 같은 포인트에서 <b>두 번 연속</b> 렛이 나오면 서브한 쪽이 1점을 잃습니다(렛 두 번)."],
        ["서브 순서", "2점마다 서브가 바뀝니다. 듀스(10 대 10, 3게임에서는 6 대 6)부터는 1점마다 바뀝니다. 게임마다 먼저 서브하는 쪽이 번갈아 바뀝니다."],
      ),
    ) +
    part(
      "치기",
      table(
        ["라켓 움직이기", "마우스는 탁구대 위로 움직이기만 하면, 터치는 손가락을 댄 채 끌면 라켓이 손이 있는 곳으로 곧바로 따라옵니다(속도 제한 없음). 높이는 공에 맞춰 저절로 맞춰지고, 높이 올라가도 화면에서는 늘 <b>손가락(커서) 바로 아래</b>에 있습니다. 키보드는 방향키입니다."],
        ["타점 표시", "<b>쉬움</b>에서만 보입니다. 상대 공이 내 쪽으로 오는 동안(내 서브는 공을 띄웠을 때) 라켓과 공이 만날 자리에 <b>빛나는 연두색 고리</b>가 뜨고, 공이 그리로 가는 길이 점으로 이어집니다. 라켓 가운데를 고리에 맞추면 됩니다. 라켓을 화면 위아래로 옮기면 고리도 공이 지나는 길을 따라 옮겨 가니, 공이 가장 치기 좋은 자리에서 고리와 라켓을 맞추세요. 공을 치거나 포인트가 끝나면 사라집니다."],
        ["공 높이", "공은 탁구대 위로 높이 뜨지 않게 날아옵니다(느린 공도 높이 띄우지 않고 낮게 빠르게 보냅니다). 그래도 높이 뜬 공은 라켓이 탁구대 위 <b>1.2m</b>까지 올라가 칠 수 있고, 시점이 조금 올라가 라켓과 공이 함께 보입니다."],
        ["세게 치기", "공이 맞는 순간 <b>라켓이 빠를수록</b> 공이 세게 나갑니다. 화면 위쪽(네트 쪽)으로 밀어 치면 탑스핀이 걸립니다. 스매싱보다도 훨씬 세게 휘두르면 길게 나가 아웃이 됩니다. 키보드는 스페이스로 앞으로 휘두릅니다."],
        ["막기와 커트", "라켓을 가만히 대면 공을 부드럽게 막아 넘깁니다. 맞는 순간 <b>아래쪽(내 쪽)으로 당기면</b> 백스핀이 걸린 느린 공이 됩니다."],
        ["방향과 커브", "공이 라켓의 어디에 맞든 상관없이, <b>휘두르는 방향</b>으로 갑니다. 맞는 순간 <b>왼쪽으로 휘두르면 왼쪽</b>, <b>오른쪽으로 휘두르면 오른쪽</b>으로 갑니다. 이때 사이드스핀이 세게 걸려, 공이 바깥쪽으로 크게 돌아 나갔다가 <b>안쪽으로 휘어 들어와</b> 노린 자리에 떨어집니다. 옆으로 빠르게 휘두를수록 더 많이 휘고 각도 커지지만, 너무 빠르면 사이드 라인 밖으로 나갑니다."],
        ["스매싱", "공이 맞는 순간의 <b>라켓 속도</b>로 정해집니다. 어느 쪽으로 휘두르든 라켓이 빠르게 지나가며 맞으면 스매싱이 되어(화면에 '스매싱!'이 뜹니다) 공이 아주 빠르고 낮게, 깊숙이 꽂히고 탑스핀이 걸립니다. 라켓이 천천히 맞으면 부드럽게 넘어갑니다. 내 쪽으로 당기며 맞으면 빠르더라도 커트(백스핀)가 됩니다."],
        ["옆으로 빠진 공", "공이 옆으로 빠질수록 내 시점이 그쪽으로 따라가고, 라켓이 닿는 범위도 그쪽으로 넓어집니다. 포인트가 끝나면 가운데로 돌아옵니다."],
        ["맞는 판정", "아주 넉넉합니다. 라켓 가장자리에서 <b>라켓 하나 너비 넘게</b> 벗어난 공도 맞은 것으로 칩니다(옆으로 라켓 가운데에서 26cm, 위아래로 32cm까지; 내 라켓만 넉넉하게 봅니다). 옆으로 빠르게 휘둘러 라켓이 공을 지나가면, 공이 라켓 면에 닿기 조금 전이나 뒤라도 맞은 것으로 칩니다."],
        ["낮은 공", "네트보다 낮은 공을 세게 치면 네트에 걸리기 쉽습니다. 공이 튀어 오른 꼭대기에서 치는 것이 좋습니다."],
      ),
    ) +
    part("와이파이 여럿이", table(["함께 하기", "같은 와이파이의 두 기기가 라켓을 하나씩 잡습니다. 방장이 빨강, 들어온 사람이 파랑이고, 저마다 자기 쪽 끝 뒤에서 탁구대를 봅니다. 첫 게임은 파랑이 먼저 서브합니다."], ["일시정지", "한 사람이 멈추면 두 기기 모두 멈추고, 누구든 다시 누르면 이어집니다."], ["연결이 끊기면", "끊긴 사람의 라켓은 다시 들어올 때까지 방장 기기의 컴퓨터가 잡습니다."], ["시점", "방장이 빨강을 잡으면 혼자 할 때처럼 시점이 옆으로 따라가고 높은 공에 올라갑니다. 다른 자리에서는 시점이 제자리에 있고, 타점 표시는 나오지 않습니다."])) +
    part("레벨", table(["쉬움", "컴퓨터가 느리게 움직이고 자주 놓치며, 공을 천천히 가운데로 넘깁니다. 타점 표시가 보입니다."], ["보통", "알맞은 빠르기로 받아 넘기고, 좌우로 나눠 칩니다."], ["어려움", "빠르게 읽고 따라가며, 내 라켓에서 먼 쪽으로 세게 칩니다. 공이 조금만 떠도 <b>스매싱</b>을 날립니다."])) +
    part("처음이라면", notes("공이 내 코트에 튄 뒤 올라올 때, 공의 바로 뒤에 라켓을 갖다 대기만 해도 넘어갑니다.", "익숙해지면 공이 맞는 순간 라켓을 앞으로 살짝 밀어 쳐 보세요.", "치고 나면 라켓을 탁구대 가운데 뒤쪽으로 되돌려 다음 공을 기다립니다.")),
  help: "마우스: 탁구대 위로 움직이면 라켓이 그대로 따라옵니다<br>터치: 끌어서 움직입니다<br>키보드: 방향키, 스페이스로 서브 띄우기·치기",
  sides: ["빨강", "파랑"],
  startWord: "라켓 잡기",
};
