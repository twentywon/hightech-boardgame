import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { hitBlow, type State } from "./rules";
import { CHALK_COLORS, HitBlowView, keyAt } from "./view";

export const hitBlowConfig: PointConfig<State> = {
  game: hitBlow,
  view: (host, quality) => new HitBlowView(host, quality),
  colors: CHALK_COLORS,
  keyPoints: () => Array.from({ length: 12 }, (_, key) => ({ x: keyAt(key).x, z: 0 })),
  // Two hidden numbers cannot share one screen.
  computerOnly: true,
  noUndo: true,
  variants: [
    { value: "3", label: "세 자리" },
    { value: "4", label: "네 자리" },
  ],
  variantLabel: "자릿수",
  firstNote: "내 숫자를 정한 뒤, 내가 먼저 던집니다.",
  name: "숫자 야구",
  english: "Hit and Blow",
  number: "NO. 24 — STRIKES AND BALLS",
  intro: `<p>교실 칠판에 적어 가며 하는 숫자 맞히기.<br>'히트 앤 블로'라고도 합니다. 스트라이크와 볼을 실마리로 상대 숫자를 먼저 찾으세요.</p><ul class="rule-list"><li>서로 다른 숫자로 된 수를 하나씩 숨깁니다</li><li>자리까지 맞으면 스트라이크, 숫자만 맞으면 볼</li><li>같은 횟수로 던져 먼저 맞히면 승리</li></ul>`,
  meta: "나 대 컴퓨터 · 세 자리 또는 네 자리",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>STRIKE, BALL, OUT</span>`,
  artClass: "hitblow-art",
  artLabel: "숫자 야구 칠판 미리보기",
  tableLabel: "THE CLASSROOM",
  tableNote: (variant) => `${variant === "4" ? "네" : "세"} 자리 · 서로 다른 숫자`,
  rulesTitle: "스트라이크와 볼로 숫자를 찾으세요",
  rules:
    part("기본 규칙", steps("나와 컴퓨터가 <b>서로 다른 숫자</b>로 된 수를 하나씩 숨깁니다. 0으로 시작해도 됩니다.", "먼저 칠판 아래의 숫자판으로 <b>내 숫자</b>를 정합니다.", "번갈아 상대의 숫자를 <b>던져</b> 봅니다. 던질 때마다 스트라이크와 볼의 개수를 알려 줍니다.", "숫자를 모두 제자리에 맞히면(전부 스트라이크) 찾은 것입니다.", "두 사람은 <b>같은 횟수</b>로 던집니다. 내가 먼저 찾아도 컴퓨터가 그 회의 공을 던지며, 같은 회에 둘 다 찾으면 무승부입니다.")) +
    part("판정", table(["스트라이크 (S)", "숫자도 자리도 맞음."], ["볼 (B)", "숫자는 있지만 자리가 다름."], ["아웃", "맞는 숫자가 하나도 없음."], ["예", "숨긴 수가 <b>1 2 3</b>일 때 <b>1 3 5</b>를 던지면 1S 1B입니다. 1은 제자리, 3은 자리가 다릅니다."])) +
    part("칠판", table(["왼쪽", "내가 던진 숫자와 그 판정."], ["오른쪽", "컴퓨터가 내 숫자를 향해 던진 숫자와 그 판정."], ["아래", "지금 누르는 숫자, 내 숫자, 숫자판(0–9, 지움, 확인)."])) +
    part("처음이라면", notes("아웃도 큰 실마리입니다. 그 숫자들은 모두 지울 수 있습니다.", "스트라이크가 나온 수에서 숫자를 하나만 바꿔 던지면 어느 자리가 맞았는지 가려집니다.", "볼만 나오면 숫자는 맞으니 자리를 바꿔 던집니다.", "컴퓨터는 자기가 받은 판정만 보고 추리합니다. 내 숫자를 엿보지 않습니다.")),
  help: "마우스·터치: 칠판 아래 숫자판을 누릅니다<br>키보드: 판을 선택하고 좌우 방향키·Enter",
  sides: ["나", "컴퓨터"],
  startWord: "교실에 들어가기",
};
