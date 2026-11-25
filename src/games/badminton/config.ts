import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { HOST_ONLY } from "../../net/match";
import { FULL_GAME, SHORT_GAME, badminton, capOf, deuce, gameNumber, line, need, serverOf, type State } from "./rules";
import { BADMINTON_COLORS, BadmintonView } from "./view";
import { gameResult } from "./result";

export const badmintonConfig: PointConfig<State> = {
  game: badminton,
  panel: "scoreboard",
  live: true,
  pausable: true,
  noUndo: true,
  computerOnly: true,
  cheer: (before, state) => (state.ply <= before.ply || state.winner !== null ? null : deuce(state) && !deuce(before) ? "듀스" : null),
  setResult: (before, state, _mode, seat) => gameResult(before, state, seat === undefined ? 0 : seat),
  // The broadcast board in the corner: each player's serve dot, name, games won and points, a GAME tab over the first.
  tallyHtml: (state, _mode, seat) =>
    [0, 1].map(
      (p) =>
        `${p === 0 ? `<span class="bd-head">GAME ${gameNumber(state)}${state.done.length ? ` · ${state.done.map(([a, b]) => `${a}-${b}`).join(" ")}` : ""}</span>` : ""}<i class="bd-serve${state.winner === null && serverOf(state) === p ? " on" : ""}" aria-hidden="true"></i><span class="bd-name">${seat === undefined ? (p === 0 ? "나" : "컴퓨터") : seat === p ? "나" : seat === 0 || seat === 1 ? "상대" : p === 0 ? "빨강" : "파랑"}</span><em class="bd-games">${state.games[p]}</em><strong class="bd-points tt-points">${state.score[p]}</strong>`,
    ) as [string, string],
  view: (host, quality, _variant, _mode, level, _net, live) => new BadmintonView(host, quality, level, live),
  // Over Wi-Fi (와이파이 여럿이) two devices hold a racket each, the court run by the host's (`src/net/live.ts`); a point
  // is the host's move alone. A dropped player's side is the host's computer's until they come back.
  net: {
    seats: () => (["빨강", "파랑"] as const).map((label, p) => ({ label, color: BADMINTON_COLORS[p], kinds: ["computer"] })),
    toMove: () => HOST_ONLY,
    hint: (s, seat) => {
      if (seat !== 0 && seat !== 1) return `${line(s)}. 구경하는 중입니다.`;
      return serverOf(s) === seat ? `${line(s)}. 내 서브: 화면을 위로 밀어 서브하세요. 빠르게 밀수록 멀리 갑니다.` : `${line(s)}. 상대 서브: 셔틀콕이 다가오면 화면을 밀어 치세요.`;
    },
    reason: (s) =>
      s.best === 1
        ? `${s.done[0][0]} 대 ${s.done[0][1]}로 끝났습니다. ${s.points}점 단판 승부입니다.`
        : `게임 스코어 ${s.games[0]} 대 ${s.games[1]}로 끝났습니다 (${s.done.map(([a, b]) => `${a}:${b}`).join(", ")}). 3게임 가운데 ${need(s)}게임을 먼저 땄습니다.`,
  },
  colors: BADMINTON_COLORS,
  // The racket's crisp strike (a smash heavier), the shuttle's soft landing on the mat, the net.
  knock: (sound, kind, strength) => (kind === "disc" ? (strength > 0.7 ? sound.backboard(Math.min(1, strength)) : sound.knock(3)) : kind === "cushion" ? sound.soft(1, 0.3) : sound.soft(2)),
  variants: [
    { value: "1", label: `단판 승부 (${SHORT_GAME}점)` },
    { value: "21", label: `단판 승부 (${FULL_GAME}점)` },
    { value: "3", label: `3게임 (2게임 선승, ${FULL_GAME}점)` },
  ],
  variantLabel: "경기",
  name: "배드민턴",
  english: "Badminton",
  number: "NO. 106 — RALLY POINT",
  intro: `<p>실내 체육관의 배드민턴 코트, 내 선수의 눈높이 바로 뒤에서 네트 너머를 봅니다.<br>선수는 셔틀콕을 따라 저절로 움직입니다. 화면을 밀어 치세요. 빠르게 밀수록 세고 멀리 나갑니다. 높이 뜬 셔틀콕은 점프하고 밀면 스매싱입니다.</p>`,
  meta: `컴퓨터 대전 · 와이파이 여럿이 · 단식 · ${SHORT_GAME}점 또는 ${FULL_GAME}점 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>RALLY POINT</span>`,
  artClass: "foosball-art",
  artLabel: "배드민턴 코트 미리보기",
  tableLabel: "WTG BADMINTON HALL",
  tableNote: (variant) => (variant === "3" ? `실시간 · ${FULL_GAME}점 3게임` : `실시간 · ${variant === "21" ? FULL_GAME : SHORT_GAME}점 단판 승부`),
  firstNote: "첫 서브는 내가 합니다. 그 뒤로는 점수를 딴 쪽이 서브합니다.",
  rulesTitle: "셔틀콕을 상대 코트에 떨어뜨리세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "나는 앞쪽(빨강), 컴퓨터는 네트 건너편(파랑)입니다. 단식 경기이고, <b>안쪽 옆줄(단식 라인)과 맨 뒤 줄</b> 안이 코트입니다. 줄 위에 떨어지면 안(인)입니다.",
        "셔틀콕을 쳐서 네트를 넘겨 <b>상대 코트 바닥에 떨어뜨리면</b> 내가 1점을 얻습니다. 내 코트에 떨어지거나, 내가 친 셔틀콕이 코트 밖에 떨어지거나(아웃) 네트에 걸리면 상대가 1점을 얻습니다.",
        "셔틀콕은 바닥에 닿기 전에 한 번에 쳐서 넘깁니다. 상대가 친 셔틀콕이 밖으로 나갈 것 같으면 <b>치지 않고 두면</b> 아웃이 되어 내 점수가 됩니다.",
        `랠리마다 점수가 나고(랠리 포인트), 점수를 딴 쪽이 다음 서브를 합니다. <b>${SHORT_GAME}점</b>(또는 <b>${FULL_GAME}점</b>)을 먼저 내면 이기지만, 듀스부터는 <b>2점</b>을 앞서야 합니다. 그래도 끝나지 않으면 ${capOf(SHORT_GAME)}점(${FULL_GAME}점 경기는 ${capOf(FULL_GAME)}점)을 먼저 내는 쪽이 이깁니다.`,
        `<b>3게임</b>은 ${FULL_GAME}점 게임을 2게임 먼저 따는 쪽이 이깁니다. 게임을 딴 쪽이 다음 게임의 첫 서브를 합니다.`,
      ),
    ) +
    part(
      "치기",
      table(
        ["시점과 이동", "내 선수의 머리 바로 뒤에서 보는 세미 1인칭입니다. 내 몸과 팔은 보이지 않고 라켓만 보입니다. 선수는 셔틀콕이 오는 곳으로 <b>저절로 달려가고</b>, 시점은 <b>날아가는 셔틀콕을 따라갑니다</b>. 높이 뜨면 올려다보고, 바닥 가까이 오면 내려다봅니다."],
        ["밀기", "셔틀콕이 다가오면 화면 어디든 손가락(마우스는 누른 채)으로 <b>밀었다가 놓으면</b> 라켓을 휘두릅니다."],
        ["치는 때", "날아오는 셔틀콕에는 주황색 빛이 둘려 있고, 라켓이 닿는 거리에 들어오면 <b>연두색으로 밝게</b> 빛납니다. 그때 밀면 맞습니다. 빛나기 조금 전에 밀어도 휘두르는 동안 셔틀콕이 들어오면 맞습니다."],
        ["떼지 않고 치기", "손가락을 화면에 댄 채로 <b>빠르게 밀기만 해도</b> 칩니다. 밀고 멈추거나 느려지는 순간 한 번 치고, 다시 빠르게 밀면 또 칩니다. 천천히 움직이면 라켓만 따라오고 치지는 않습니다. 손가락을 떼면서 밀어도 예전처럼 칩니다."],
        ["세기와 거리", "<b>빠르게 밀수록 셔틀콕이 세고 멀리</b> 나갑니다. 천천히 밀면 네트 바로 너머에 떨어지는 드롭, 빠르게 밀면 상대 코트 끝까지 가는 클리어가 됩니다. 높이 뜨는 셔틀콕일수록 더 빠르게 올라갔다가 떨어집니다. 내가 코트 어디에 있든 같은 빠르기면 같은 깊이로 갑니다. 셔틀콕은 늘 네트를 넘어가고, <b>아무리 세게 밀어도 뒷줄 안쪽</b>에 떨어집니다(뒤로 나가는 아웃은 없습니다)."],
        ["라켓", "PC에서는 라켓이 <b>마우스 커서</b>를 따라가고, 앱에서는 화면을 <b>누르고 있는 손가락</b>을 따라갑니다. 커서가 코트 밖에 있거나 손가락을 떼면 다가오는 셔틀콕 쪽으로 저절로 돌아갑니다. <b>낮은 셔틀콕은 아래에서 위로</b> 퍼 올리고, 높은 셔틀콕은 위에서 아래로 내리칩니다."],
        ["방향", "위로 곧게 밀면 가운데로, <b>비스듬히 왼쪽·오른쪽으로 밀면</b> 그쪽으로 갑니다. 거의 옆으로 눕혀 밀 때만 옆줄 밖으로 나갑니다."],
        ["스매싱", "셔틀콕이 높이 떠서 오면 '높이 떴습니다!'가 뜨고, 뛰면 닿는 순간에 <b>점프 버튼이 깜박이며 '지금 점프!'</b>가 뜹니다. <b>왼쪽 아래의 점프 버튼</b>을 눌러 뛰어오른 다음, 공중에 있을 때 밀면 <b>스매싱</b>입니다. 선수는 높은 셔틀콕을 점프로 닿는 자리에서 기다립니다. 셔틀콕이 아주 빠르게 아래로 꽂힙니다. 빠르게 밀수록 세고 깊게 들어갑니다. 점프 중에 밀어 두면 내려올 때까지 셔틀콕을 기다렸다가 칩니다. 높이 뜬 셔틀콕이 머리 위로 내려올 때 뛰어야 맞힐 수 있습니다(점프 중에는 낮은 셔틀콕에 닿지 않습니다)."],
        ["키보드", "↑ 멀리(클리어), ↓ 짧게(드롭), ← → 그쪽으로, 스페이스(또는 J) 점프입니다."],
      ),
    ) +
    part(
      "서브",
      table(
        ["서브 자리", "서브하는 쪽의 점수가 짝수이면 오른쪽, 홀수이면 왼쪽 서비스 코트에서 서브하고, 대각선 건너편 서비스 코트에 넣어야 합니다."],
        ["내 서브", "셔틀콕을 든 채 기다립니다. 화면을 <b>위로 밀면</b> 서브합니다. 천천히 밀면 네트 바로 너머 짧은 서브, 빠르게 밀면 뒤쪽까지 가는 높은 서브입니다."],
        ["서브 실수", "셔틀콕이 <b>쇼트 서비스 라인</b>(네트에서 가장 가까운 가로줄)보다 짧거나, 대각선 서비스 코트 밖에 떨어지거나, 네트에 걸리면 상대 점수입니다."],
      ),
    ) +
    part("와이파이 여럿이", table(["함께 하기", "같은 와이파이의 두 기기가 라켓을 하나씩 잡습니다. 방장이 빨강, 들어온 사람이 파랑이고, 저마다 자기 쪽 코트 뒤에서 봅니다."], ["치기와 점프", "혼자 할 때와 똑같이 밀어서 치고, 점프 버튼을 누른 뒤 밀면 스매싱입니다."], ["일시정지", "한 사람이 멈추면 두 기기 모두 멈추고, 누구든 다시 누르면 이어집니다."], ["연결이 끊기면", "끊긴 사람의 자리는 다시 들어올 때까지 방장 기기의 컴퓨터가 칩니다."])) +
    part("레벨", table(["쉬움", "컴퓨터가 느리게 움직이고 자주 실수하며, 스매싱이 드뭅니다. 셔틀콕이 내 쪽으로 올 때 떨어질 자리에 노란 고리가 보입니다."], ["보통", "알맞은 빠르기로 받아 넘기고, 내가 없는 쪽으로 보냅니다. 밖으로 나가는 셔틀콕을 꽤 잘 골라 둡니다."], ["어려움", "빠르게 따라가고, 높이 뜬 셔틀콕은 거의 스매싱으로 때립니다. 아웃이 될 셔틀콕은 거의 치지 않습니다."])) +
    part("처음이라면", notes("셔틀콕이 연두색으로 빛나는 순간에 맞춰 화면을 위로 휙 밀어 보세요.", "천천히 밀면 짧게, 빠르게 밀면 깊게 갑니다. 뒤로 나가는 아웃은 없으니 마음껏 세게 밀어도 됩니다.", "점프 버튼이 깜박이는 순간 누르고 바로 밀어 스매싱을 노려 보세요.")),
  help: "마우스 커서·누른 손가락: 라켓이 따라감<br>밀기(드래그 후 놓기): 라켓 휘두르기, 빠를수록 멀리<br>왼쪽 아래 점프 버튼 → 밀기: 스매싱<br>키보드: ↑ ↓ ← → 치기, 스페이스 점프",
  sides: ["빨강", "파랑"],
  startWord: "코트에 서기",
};
