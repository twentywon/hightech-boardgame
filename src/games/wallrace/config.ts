import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { N, WALLS, wallRace, type State } from "./rules";
import { PAWN_COLORS, WallRaceView, racePoints } from "./view";

export const wallRaceConfig: PointConfig<State> = {
  game: wallRace,
  view: (host, quality) => new WallRaceView(host, quality),
  colors: PAWN_COLORS,
  keyPoints: racePoints,
  keyStart: (state) => state.pawns[state.turn],
  name: "길막기",
  english: "Wall Race",
  number: "NO. 27 — RACE AND BLOCK",
  intro: `<p>흔히 '쿼리도'로 알려진 놀이 방식입니다.<br>말을 한 칸 옮기거나 벽을 세워, 맞은편 끝줄에 먼저 닿으세요.</p>`,
  meta: `2인 · ${N}×${N} · 벽 ${WALLS}개씩`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>RACE OR BLOCK</span>`,
  artClass: "wallrace-art",
  artLabel: "길막기 판 미리보기",
  tableLabel: "THE GROOVED BOARD",
  tableNote: () => `${N} × ${N} · 벽 ${WALLS}개씩`,
  rulesTitle: "달리거나, 막거나",
  rules:
    part("기본 규칙", steps(`${N}×${N} 판의 양 끝줄 가운데에 말이 하나씩 섭니다. <b>빨강이 먼저</b> 둡니다.`, "차례마다 <b>말을 한 칸 옮기거나</b>, <b>벽 하나를 세우거나</b> 둘 중 하나를 합니다.", "말은 앞·뒤·옆으로 한 칸 갑니다. 대각선으로는 못 가고 벽을 넘을 수 없습니다.", "<b>맞은편 끝줄</b>(내 색으로 칠한 줄)의 어느 칸에든 먼저 닿으면 이깁니다.")) +
    part("벽", table(["크기", "두 칸 길이입니다. 칸과 칸 사이 홈에 세웁니다."], ["개수", `각자 ${WALLS}개. 다 쓰면 말만 옮길 수 있습니다.`], ["세울 수 없는 곳", "다른 벽과 겹치거나 엇갈리는 자리, 판 밖으로 나가는 자리."], ["길 막기 금지", "어느 말이든 끝줄로 가는 길이 <b>하나도 남지 않게</b> 막을 수는 없습니다."], ["한번 세우면", "옮기거나 치울 수 없습니다."])) +
    part("말 넘기", table(["마주 섰을 때", "상대 말이 바로 옆에 있고 그 뒤가 비어 있으면 뛰어넘어 그 뒤 칸으로 갑니다."], ["뒤가 막혔을 때", "상대 말 뒤에 벽이나 판 끝이 있으면 상대 말의 양옆 칸으로 비껴 갑니다."])) +
    part("벽 세우는 법", table(["가로 벽", "위아래로 붙은 두 칸 <b>사이</b>를 누릅니다. 누른 곳에서 오른쪽으로 두 칸 길이로 놓입니다."], ["세로 벽", "좌우로 붙은 두 칸 <b>사이</b>를 누릅니다. 누른 곳에서 아래쪽으로 두 칸 길이로 놓입니다."], ["미리 보기", "마우스를 올리면 놓일 벽이 노랗게 보입니다."])) +
    part("처음이라면", notes("옆 패널의 \"앞으로 n칸\"은 지금 벽들 사이로 끝줄까지 가는 가장 짧은 길입니다. 내 숫자가 작으면 달리고, 크면 막습니다.", "벽은 상대가 끝줄에 가까워졌을 때 세워야 돌아가는 길이 길어집니다.", "벽을 일찍 다 쓰면 나중에 막을 수가 없습니다.", "상대 벽을 내 길 막기에 함께 쓸 수 있는 자리를 찾습니다.")),
  help: "마우스·터치: 금색 고리가 뜬 칸을 누르면 말이 가고, 칸 사이를 누르면 벽이 놓입니다<br>키보드: 판을 선택하고 방향키·Enter",
  sides: ["빨강", "파랑"],
  startWord: "판 앞에 앉기",
};
