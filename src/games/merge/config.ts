import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { DOWN, GOAL, LEFT, RIGHT, UP, best, merge, type State } from "./rules";
import { MERGE_COLORS, MergeView } from "./view";

const KEYS: Record<string, number> = { ArrowUp: UP, ArrowRight: RIGHT, ArrowDown: DOWN, ArrowLeft: LEFT };
export const mergeConfig: PointConfig<State> = {
  game: merge,
  solo: true,
  // No panel: the score is written on a card on the desk, before the tray.
  noPanel: true,
  noUndo: true,
  view: (host, quality) => new MergeView(host, quality),
  colors: MERGE_COLORS,
  keyMove: (key) => (key in KEYS ? { from: -1, to: KEYS[key], extra: -1 } : null),
  tallyHtml: (state) => [`<span class="solo-stat"><small>점수</small><b>${state.score}</b></span><span class="solo-stat"><small>가장 큰 수</small><b>${best(state)}</b></span>`, ""],
  // Tiles click together.
  contact: (sound) => sound.plastic(),
  name: "2048",
  english: "2048",
  number: "NO. 36 — TWICE AND TWICE AGAIN",
  intro: `<p>책상 위의 숫자 타일 열여섯 칸.<br>한쪽으로 밀어 같은 수끼리 합치고, 2048을 만드세요.</p>`,
  meta: "1인 · 4×4 · 목표 2048",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>2 · 4 · 8 · 16</span>`,
  artClass: "hexa-art",
  artLabel: "2048 타일 미리보기",
  tableLabel: "THE TILE TRAY",
  tableNote: () => "4×4 · 목표 2048",
  rulesTitle: "같은 수끼리 합쳐 2048까지",
  rules:
    part("기본 규칙", steps("가로세로 네 칸씩, 열여섯 칸의 판에 2가 적힌 타일 두 개로 시작합니다.", "위·아래·왼쪽·오른쪽 가운데 <b>한쪽으로 밀면</b> 모든 타일이 그쪽 끝까지 미끄러집니다.", "밀리다가 <b>같은 수의 타일 둘이 만나면 하나로 합쳐져</b> 두 배가 됩니다. 합쳐진 수만큼 점수를 얻습니다.", "한 번 밀 때마다 빈칸 하나에 새 타일(2, 가끔 4)이 생깁니다.", `<b>${GOAL} 타일을 만들면 성공</b>입니다. 판이 가득 차고 합칠 곳이 없으면 끝납니다.`)) +
    part("밀기", table(["쓸기", "판 위를 손가락이나 마우스로 밀고 싶은 쪽으로 쓸어 줍니다."], ["방향키", "키보드의 ↑ ↓ ← → 로도 밉니다."], ["밀리지 않는 쪽", "아무 타일도 움직이지 않는 쪽으로는 밀 수 없고, 새 타일도 생기지 않습니다."], ["점수판", "판 아래쪽, 내 앞에 놓인 판에 지금까지의 총점이 적혀 있습니다."])) +
    part("합치기", table(["한 번에 한 번", "한 타일은 한 번 밀 때 한 번만 합쳐집니다. 2 2 2 2를 밀면 4 4가 되고, 8이 되지는 않습니다."], ["미는 쪽부터", "미는 쪽 끝에 가까운 타일부터 합쳐집니다. 2 2 2를 왼쪽으로 밀면 4 2가 됩니다."], ["점수", "합쳐서 생긴 수가 점수에 더해집니다."])) +
    part("처음이라면", notes("가장 큰 타일을 <b>한쪽 구석</b>에 두고 그 구석에서 떼지 않습니다.", "주로 두 방향(예: 아래와 왼쪽)으로만 밀고, 나머지 한 방향은 꼭 필요할 때만 씁니다.", "큰 수 옆에 그다음 큰 수가 오도록 한 줄로 차례대로 늘어놓으면 연달아 합쳐집니다.")),
  help: "마우스·터치: 판 위를 밀 쪽으로 쓸어 줍니다<br>키보드: 방향키",
  sides: ["나", ""],
  startWord: "책상 앞에 앉기",
};
