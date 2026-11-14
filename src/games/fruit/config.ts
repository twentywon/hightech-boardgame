import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { FRUITS, MERGE, fruit, worth, type State } from "./rules";
import { FRUIT_COLORS, FruitView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
export const fruitConfig: PointConfig<State> = {
  game: fruit,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  view: (host, quality) => new FruitView(host, quality),
  colors: FRUIT_COLORS,
  tallyHtml: (state) => [stat("점수", state.score) + stat("가장 큰 과일", state.largest >= 0 ? FRUITS[state.largest] : "–") + stat("떨어뜨린 수", state.drops), ""],
  contact: (sound, state) => (state.last !== null && state.last >= MERGE ? sound.hop() : sound.tap()),
  name: "과일 합치기",
  english: "Fruit Merge",
  number: "NO. 46 — TWO OF A KIND MAKE ONE",
  intro: `<p>유리 상자에 과일을 하나씩 떨어뜨립니다.<br>같은 과일끼리 닿으면 더 큰 과일 하나가 됩니다. 넘치기 전에 수박까지 키워 보세요. '수박 게임'으로 알려진 놀이입니다.</p>`,
  meta: `1인 · 과일 ${FRUITS.length}가지 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>TWO OF A KIND MAKE ONE</span>`,
  artClass: "hexa-art",
  artLabel: "과일 합치기 미리보기",
  tableLabel: "THE GLASS BOX",
  tableNote: () => `과일 ${FRUITS.length}가지`,
  rulesTitle: "같은 과일 둘이 큰 과일 하나",
  rules:
    part("기본 규칙", steps("상자 위에 과일 하나가 매달려 있습니다. 좌우로 자리를 잡고 <b>떨어뜨립니다</b>.", "<b>같은 과일 둘이 닿으면</b> 합쳐져 한 단계 큰 과일 하나가 됩니다.", "과일은 구르고 밀립니다. 합쳐져 커진 과일이 옆의 과일을 밀어 또 합쳐지기도 합니다.", "쌓인 과일이 <b>빨간 선 위에 한동안 머물면</b> 끝납니다. 떨어지는 중인 과일은 세지 않습니다.", "끝이 따로 없습니다. 넘치기 전까지 점수를 모읍니다.")) +
    part("과일의 순서", table(...FRUITS.map((name, kind): [string, string] => [`${kind + 1}. ${name}`, kind + 1 < FRUITS.length ? `둘이 합쳐지면 ${FRUITS[kind + 1]} · ${worth(kind)}점` : `가장 큰 과일. 둘이 닿으면 함께 사라지고 ${worth(kind)}점`]), ["손에 오는 과일", `${FRUITS.slice(0, 5).join(", ")} 가운데 하나가 무작위로 옵니다. 그다음에 올 과일은 상자 오른쪽 접시에 놓여 있습니다.`])) +
    part("떨어뜨리기", table(["마우스", "좌우로 움직여 자리를 잡고 누릅니다."], ["터치", "손가락을 대고 좌우로 끌다가 떼면 떨어집니다."], ["키보드", "← → 로 옮기고 스페이스(또는 ↓)로 떨어뜨립니다."], ["기다림", "하나를 떨어뜨리면 다음 과일이 손에 올 때까지 잠깐 기다립니다."])) +
    part("일시정지", table(["멈추기", "판 오른쪽 위의 <b>❙❙</b> 버튼이나 키보드 P를 누르면 멈춥니다."], ["이어 하기", "같은 자리의 <b>▶</b> 버튼이나 P를 다시 누릅니다."], ["저절로 멈출 때", "게임 방법이나 설정 창이 열려 있는 동안에도 멈춥니다."])) +
    part("처음이라면", notes("큰 과일은 <b>한쪽 구석</b>에 모으고, 그 옆으로 차례로 작아지게 쌓으면 잇달아 합쳐집니다.", "작은 과일이 큰 과일 밑에 끼면 꺼내기 어렵습니다. 작은 것은 작은 것끼리 가까이 둡니다.", "접시의 <b>다음 과일</b>을 보고 지금 과일의 자리를 정합니다.")),
  help: "마우스: 좌우로 움직이고 눌러서 떨어뜨립니다<br>터치: 끌다가 떼면 떨어집니다<br>키보드: ← → 와 스페이스",
  sides: ["나", ""],
  startWord: "과일 올려놓기",
};
