import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { POINTS, deuce, gameNumber, need, serverOf, tableTennis, type State } from "./rules";
import { TABLE_TENNIS_COLORS, TableTennisView } from "./view";
import { gameResult } from "./result";

/** The game scores: a column for each game (finished ones with their score, the one being played with its points so far). */
function gameTable(state: State) {
  const now = state.winner === null ? state.done.length : -1,
    cell = (k: number, p: 0 | 1) => {
      const score = k < state.done.length ? state.done[k] : k === now ? state.score : null;
      if (!score) return `<i class="tt-cell">·</i>`;
      const won = k < state.done.length && score[p] > score[1 - p];
      return `<i class="tt-cell${k === now ? " now" : ""}${won ? " won" : ""}">${score[p]}</i>`;
    },
    row = (p: 0 | 1, name: string) => `<span class="tt-row tt-side-${p}"><b>${name}</b>${Array.from({ length: state.best }, (_, k) => cell(k, p)).join("")}<em>${state.games[p]}</em></span>`;
  return `<span class="tt-table" aria-hidden="true" style="--games:${state.best}"><span class="tt-row tt-head"><b></b>${Array.from({ length: state.best }, (_, k) => `<i class="tt-cell${k === now ? " now" : ""}">${k + 1}</i>`).join("")}<em>게임</em></span>${row(0, "나")}${row(1, "컴퓨터")}</span>`;
}
export const tableTennisConfig: PointConfig<State> = {
  game: tableTennis,
  // The points stand on a lit scoreboard of their own over the table (the panel, drawn as a stadium board).
  panel: "scoreboard",
  live: true,
  pausable: true,
  noUndo: true,
  computerOnly: true,
  // The first 10 all is called across the table.
  cheer: (before, state) => (state.ply <= before.ply || state.winner !== null ? null : deuce(state) && !deuce(before) ? "듀스" : null),
  // A game won or lost is told over the table with its score (the match's end has its own word).
  setResult: (before, state) => gameResult(before, state),
  // The board: the game being played over the middle, each side's points in it with a ball by the server's, and
  // beside it every game's score in its column with the games won at the end.
  tallyHtml: (state) =>
    [0, 1].map(
      (p) =>
        `${p === 0 ? `<span class="tt-game">GAME ${gameNumber(state)}</span>${gameTable(state)}` : ""}<span class="tt-points">${state.score[p]}</span><i class="tt-serve${state.winner === null && serverOf(state) === p ? " on" : ""}" aria-hidden="true"></i>`,
    ) as [string, string],
  view: (host, quality, _variant, _mode, level) => new TableTennisView(host, quality, level),
  colors: TABLE_TENNIS_COLORS,
  // The paddle's wooden knock, the ball's light tap on the table or the floor, the soft net.
  knock: (sound, kind) => (kind === "disc" ? sound.knock(4) : kind === "cushion" ? sound.tap() : sound.soft(1)),
  variants: [
    { value: "3", label: "3게임 (2게임 선승)" },
    { value: "5", label: "5게임 (3게임 선승)" },
  ],
  variantLabel: "경기",
  name: "탁구",
  english: "Table Tennis",
  number: "NO. 75 — FIRST TO ELEVEN",
  intro: `<p>탁구 클럽의 경기장, 내 쪽 끝에서 탁구대를 내려다봅니다.<br>라켓을 휘둘러 컴퓨터와 랠리를 주고받으세요. ${POINTS}점 내기, 3게임 또는 5게임 경기입니다.</p>`,
  meta: `컴퓨터 대전 · ${POINTS}점 내기 · 3게임 또는 5게임 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FIRST TO ${POINTS}</span>`,
  artClass: "foosball-art",
  artLabel: "탁구대 미리보기",
  tableLabel: "WTG TABLE TENNIS CLUB",
  tableNote: (variant) => `실시간 · ${POINTS}점 내기 ${variant === "5" ? 5 : 3}게임`,
  firstNote: "첫 게임은 컴퓨터가 먼저 서브합니다. 서브는 2점마다, 10 대 10부터는 1점마다 바뀝니다.",
  rulesTitle: `${POINTS}점을 먼저 내고, 게임을 먼저 따세요`,
  rules:
    part(
      "기본 규칙",
      steps(
        "나는 앞쪽(빨간 숫자), 컴퓨터는 탁구대 건너편(파란 숫자)입니다. 공을 라켓으로 쳐서 <b>상대 쪽 코트에 한 번 튀게</b> 넘깁니다.",
        "상대가 친 공은 <b>내 쪽 코트에 한 번 튄 뒤</b>에 칩니다. 튀기 전의 공은 라켓에 맞지 않고 지나갑니다.",
        "공을 놓치거나, 상대 코트를 벗어나거나(아웃), 네트에 걸리거나, 내 코트에서 두 번 튀면(투 바운드) 상대가 1점을 얻습니다.",
        `<b>${POINTS}점</b>을 먼저 내면 그 게임을 땁니다. 단 10 대 10(듀스)부터는 <b>2점</b>을 앞서야 합니다.`,
        "3게임이면 2게임, 5게임이면 3게임을 먼저 따는 쪽이 이깁니다.",
      ),
    ) +
    part(
      "서브",
      table(
        ["내 서브", "화면을 누르면(키보드는 스페이스) 공을 띄웁니다. 공이 떨어질 때 라켓을 <b>위로 휘둘러</b> 칩니다. 공을 못 치고 떨어뜨리면 다시 띄웁니다."],
        ["바른 서브", "공이 먼저 <b>내 코트에 한 번</b>, 그다음 <b>상대 코트에 한 번</b> 튀어야 합니다. 바로 상대 코트로 가거나 밖으로 나가면 서브 실수입니다."],
        ["렛", "서브가 네트에 스친 뒤 상대 코트에 바르게 떨어지면 점수 없이 다시 서브합니다."],
        ["서브 순서", "2점마다 서브가 바뀝니다. 10 대 10부터는 1점마다 바뀝니다. 게임마다 먼저 서브하는 쪽이 번갈아 바뀝니다."],
      ),
    ) +
    part(
      "치기",
      table(
        ["라켓 움직이기", "마우스는 탁구대 위로 움직이기만 하면, 터치는 손가락을 댄 채 끌면 라켓이 손이 있는 곳으로 곧바로 따라옵니다(속도 제한 없음). 높이는 공에 맞춰 저절로 맞춰집니다. 키보드는 방향키입니다."],
        ["세게 치기", "공이 올 때 라켓을 화면 <b>위쪽(네트 쪽)으로 빠르게</b> 휘두를수록 공이 세고 깊게 나가고 탑스핀이 걸립니다. 너무 세게 휘두르면 길게 나가 아웃이 됩니다. 키보드는 스페이스로 앞으로 휘두릅니다."],
        ["막기와 커트", "라켓을 가만히 대면 공을 부드럽게 막아 넘깁니다. 맞는 순간 <b>아래쪽(내 쪽)으로 당기면</b> 백스핀이 걸린 느린 공이 됩니다."],
        ["방향과 커브", "공이 라켓의 어디에 맞든 상관없이, <b>휘두르는 방향</b>으로 갑니다. 맞는 순간 <b>왼쪽으로 휘두르면 왼쪽</b>, <b>오른쪽으로 휘두르면 오른쪽</b>으로 가고, 사이드스핀이 걸려 휘어 나갑니다. 빠르게 옆으로 휘두를수록 각이 커지지만 옆으로 나가기 쉽습니다."],
        ["스매싱", "네트 쪽으로 아주 빠르게 휘두르면 스매싱이 됩니다. 이것도 라켓의 맞는 자리가 아니라 휘두르는 빠르기와 방향으로 정해집니다."],
        ["맞는 판정", "라켓 가장자리를 조금 벗어난 공도 맞은 것으로 칩니다(내 라켓만 넉넉하게 봅니다)."],
        ["낮은 공", "네트보다 낮은 공을 세게 치면 네트에 걸리기 쉽습니다. 공이 튀어 오른 꼭대기에서 치는 것이 좋습니다."],
      ),
    ) +
    part("레벨", table(["쉬움", "컴퓨터가 느리게 움직이고 자주 놓치며, 공을 천천히 가운데로 넘깁니다."], ["보통", "알맞은 빠르기로 받아 넘기고, 좌우로 나눠 칩니다."], ["어려움", "빠르게 읽고 따라가며, 내 라켓에서 먼 쪽으로 세게 칩니다."])) +
    part("처음이라면", notes("공이 내 코트에 튄 뒤 올라올 때, 공의 바로 뒤에 라켓을 갖다 대기만 해도 넘어갑니다.", "익숙해지면 공이 맞는 순간 라켓을 앞으로 살짝 밀어 쳐 보세요.", "치고 나면 라켓을 탁구대 가운데 뒤쪽으로 되돌려 다음 공을 기다립니다.")),
  help: "마우스: 탁구대 위로 움직이면 라켓이 그대로 따라옵니다<br>터치: 끌어서 움직입니다<br>키보드: 방향키, 스페이스로 서브 띄우기·치기",
  sides: ["빨강", "파랑"],
  startWord: "라켓 잡기",
};
