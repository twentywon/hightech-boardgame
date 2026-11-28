import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { ACCUSE, CHECK, DOWN, SET, UP, WEIGH, balance, hint, putOf, type State } from "./rules";
import type { Move } from "../points/types";
import { BALANCE_COLORS, BalanceView } from "./view";
import { coinRest } from "./layout";

/** What a hint asks for, by the kind of move it points at. */
function hintText(s: State, move: Move) {
  if (putOf(move.to)) return "힌트 — 금색 화살표가 가리키는 것을 금색 고리로 끌어다 놓으세요.";
  if (move.to >= SET) return "힌트 — 금색 숫자가 뜬 다이얼을 버튼으로 그 값에 맞추세요.";
  if (move.to === CHECK) return "힌트 — 숫자가 모두 맞습니다. 정답 확인을 누르세요.";
  if (move.to === WEIGH) return "힌트 — 지금 접시 그대로 저울 달기를 누르세요.";
  if (move.to === ACCUSE) return s.accusing ? "힌트 — 아직 가짜를 확신할 수 없습니다. 저울로 돌아가기를 누르세요." : "힌트 — 가짜가 하나로 좁혀졌습니다. 가짜 지목하기를 누르세요.";
  return "힌트 — 금색 화살표가 가리키는 동전을 누르세요.";
}
const STAGES: [string, string][] = [
  ["가짜 동전", "저울을 정해진 횟수만"],
  ["추 달기", "꾸러미를 수평으로"],
  ["물건 무게", "모든 저울을 수평으로"],
  ["모빌", "막대를 모두 수평으로"],
];
/** A small picture of a stage: a scale with what it weighs, or a mobile. */
function stageArt(stage: number) {
  const scale = (left: string, right: string, lean = 0) =>
    `<line x1="70" y1="112" x2="70" y2="52" stroke="#a8862f" stroke-width="5"/><rect x="48" y="110" width="44" height="8" rx="3" fill="#a8862f"/><g transform="rotate(${lean} 70 52)"><line x1="30" y1="52" x2="110" y2="52" stroke="#c9a24a" stroke-width="5"/><line x1="30" y1="52" x2="30" y2="78" stroke="#5a4636" stroke-width="1.5"/><line x1="110" y1="52" x2="110" y2="78" stroke="#5a4636" stroke-width="1.5"/></g><path d="M14 ${78 + lean * 0.7} q16 14 32 0 z" fill="#c9a24a"/><path d="M94 ${78 - lean * 0.7} q16 14 32 0 z" fill="#c9a24a"/>${left}${right}`;
  const coins = [0, 1, 2].map((i) => `<circle cx="${22 + i * 8}" cy="74" r="5" fill="#e2b84a" stroke="#6a4a12"/>`).join(""),
    art = [
      scale(coins, [0, 1, 2].map((i) => `<circle cx="${102 + i * 8}" cy="74" r="5" fill="#e2b84a" stroke="#6a4a12"/>`).join(""), -8),
      scale(`<ellipse cx="30" cy="66" rx="12" ry="11" fill="#d9c49a"/><path d="M24 56 l6 -8 l6 8 z" fill="#9a6a34"/>`, `<rect x="102" y="64" width="9" height="12" fill="#c9a24a"/><rect x="114" y="68" width="7" height="8" fill="#c9a24a"/>`),
      scale(`<circle cx="24" cy="70" r="7" fill="#a8202c"/><ellipse cx="38" cy="71" rx="8" ry="5.5" fill="#f0cc2a"/>`, `<path d="M110 60 q6 10 0 16 q-6 -6 0 -16z" fill="#5a2a5a"/><rect x="116" y="66" width="8" height="10" fill="#c9a24a"/>`),
      `<line x1="10" y1="16" x2="130" y2="16" stroke="#6a4a2c" stroke-width="5"/><line x1="70" y1="16" x2="70" y2="38" stroke="#3a2a1a"/><line x1="34" y1="38" x2="118" y2="38" stroke="#c9a24a" stroke-width="4"/><line x1="34" y1="38" x2="34" y2="62" stroke="#3a2a1a"/><line x1="118" y1="38" x2="118" y2="90" stroke="#3a2a1a"/><line x1="18" y1="62" x2="56" y2="62" stroke="#c9a24a" stroke-width="4"/><line x1="18" y1="62" x2="18" y2="84" stroke="#3a2a1a"/><line x1="56" y1="62" x2="56" y2="84" stroke="#3a2a1a"/><rect x="11" y="84" width="14" height="16" fill="#c9a24a"/><ellipse cx="56" cy="94" rx="9" ry="10" fill="#d9c49a"/><text x="56" y="99" font-size="13" text-anchor="middle" font-weight="900" fill="#3a2410">?</text><rect x="110" y="90" width="16" height="20" fill="#c9a24a"/>`,
    ][stage - 1];
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="14" fill="#9e2f2a"/><rect x="12" y="12" width="116" height="116" rx="10" fill="#f3e6c8"/>${art}</svg>`;
}
export const balanceConfig: PointConfig<State> = {
  game: balance,
  solo: true,
  showMovable: false,
  view: (host, quality) => new BalanceView(host, quality),
  colors: BALANCE_COLORS,
  // The keyboard walks the coins or weights in a row, or the dials: ▲ on one line and ▼ on the next.
  keyPoints: (s) => {
    const points = Array.from({ length: DOWN + 16 }, () => ({ x: NaN, z: NaN }));
    if (s.kind === "coins") for (let c = 0; c < s.coins; c++) points[c] = coinRest(c, s.coins);
    else if (s.kind === "weights") s.weights.forEach((_, i) => (points[i] = { x: i, z: 0 }));
    else
      s.guess.forEach((_, i) => {
        points[UP + i] = { x: i, z: 0 };
        points[DOWN + i] = { x: i, z: 1 };
      });
    return points;
  },
  keyStart: (s) => (s.kind === "coins" || s.kind === "weights" ? 0 : UP),
  contact: (sound) => sound.chips(),
  puzzle: { hint, hintText },
  stagesFirst: true,
  stages: STAGES.map(([name, note], i) => ({ value: String(i + 1), name, note, art: stageArt(i + 1) })),
  tools: [
    { label: "저울 달기", point: WEIGH, show: (s) => s.kind === "coins" && s.winner === null && !s.accusing },
    { label: "가짜 지목하기", point: ACCUSE, show: (s) => s.kind === "coins" && s.winner === null, text: (s) => (s.accusing ? "저울로 돌아가기" : "가짜 지목하기") },
    { label: "정답 확인", point: CHECK, show: (s) => (s.kind === "goods" || s.kind === "mobile") && s.winner === null },
  ],
  tallyHtml: () => ["", ""],
  name: "저울 퀴즈",
  english: "Balance Quiz",
  number: "NO. 64 — LEVEL THE SCALES",
  intro: `<p>향신료 냄새 가득한 시장 좌판 위의 놋쇠 저울.<br>가짜 동전 찾기, 추 달기, 물건 무게 맞히기, 모빌 균형까지 네 가지 저울 퍼즐을 풉니다. 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 스테이지 네 가지 · 매번 새 문제",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>LEVEL THE SCALES</span>`,
  artClass: "morris-art",
  artLabel: "저울 퀴즈 미리보기",
  tableLabel: "THE SPICE MARKET",
  tableNote: (variant) => STAGES[(Number(variant) || 1) - 1]?.[0] ?? STAGES[0][0],
  rulesTitle: "저울을 읽고, 수평을 맞추세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "스테이지는 네 가지이고, 문제는 매번 무작위로 새로 만들어집니다. 어느 문제든 답은 <b>하나뿐</b>입니다.",
        "가짜 동전: 동전을 <b>끌어다</b> 왼쪽이나 오른쪽 접시에 놓고(접시 밖에 놓으면 받침대로 돌아갑니다), <b>저울 달기</b>를 누릅니다. 저울은 언제든 달 수 있지만, 양쪽 동전 수가 다르면 많은 쪽으로 기울 뿐 아무것도 알려 주지 않고 한 번을 씁니다. 정해진 횟수 안에 가짜를 확실히 알아낸 뒤 <b>가짜 지목하기</b>를 누르고 그 동전을 누릅니다.",
        "추 달기: 왼쪽 접시에 꾸러미가 있습니다. 추를 <b>끌어다</b> 접시에 놓아 저울을 <b>수평</b>으로 맞춥니다(접시 밖에 놓으면 받침으로 돌아갑니다). 추는 꾸러미와 같은 쪽에 올려도 됩니다.",
        "물건 무게: 저울들은 물건이 제 무게일 때 모두 수평입니다. 저울을 읽고 물건마다 무게를 알아내, 숫자 옆의 ▲▼ 버튼으로 맞춘 뒤 <b>정답 확인</b>을 누릅니다. 숫자를 바꿔도 저울은 움직이지 않습니다.",
        "모빌: 막대는 왼쪽 무게 × 왼쪽 길이와 오른쪽 무게 × 오른쪽 길이가 같을 때 수평입니다. 막대의 눈금으로 길이를 세어 ? 자루의 무게를 알아내, 숫자 옆의 ▲▼ 버튼으로 맞춘 뒤 <b>정답 확인</b>을 누릅니다. 숫자를 바꿔도 모빌은 움직이지 않습니다.",
      ),
    ) +
    part(
      "스테이지",
      table(
        ["가짜 동전", "동전 6~9개에 저울 2번(가짜가 무거운지 가벼운지 알려 줌), 13~27개에 3번(알려 줌), 10~12개에 3번(모름) 가운데 하나가 나옵니다. 가짜는 미리 정해져 있지 않아서, 저울은 늘 가장 많은 동전이 의심받는 쪽으로 기웁니다. 확실하지 않은 채 지목하면 틀립니다."],
        ["추 달기", "추 4~5개와 꾸러미 하나. 수평이 되는 방법은 하나뿐입니다."],
        ["물건 무게", "석류·레몬·무화과(·오이)의 무게는 1~9이고, 저울 3~5개가 주어집니다. 다이얼은 1~12까지 돌아갑니다."],
        ["모빌", "막대 2~3개짜리 모빌에서 ? 자루 1~3개의 무게(1~15)를 맞힙니다."],
      ),
    ) +
    part("힌트와 되돌리기", table(["힌트", "옮길 동전·추 위에 금색 화살표가, 놓을 곳에 금색 고리가 뜹니다. 다이얼이면 맞출 값이 금색 숫자로 뜨고, 버튼을 눌러야 할 때는 위의 안내가 알려 줍니다."], ["정답 확인", "물건 무게와 모빌은 정답 확인을 눌러야 맞았는지 알 수 있습니다. 틀리면 고른 무게대로 저울이나 모빌이 기울며 실패하고, 무르기로 이어서 할 수 있습니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다. 동전을 잘못 지목하거나 정답 확인에서 틀려도 무르기로 이어서 할 수 있습니다."], ["다른 퍼즐 · 다음 스테이지", "같은 스테이지의 새 문제가 나옵니다."])) +
    part("처음이라면", notes("가짜 동전은 셋으로 나눠 둘을 다는 것이 기본입니다. 수평이면 남은 묶음에 가짜가 있습니다.", "물건 무게는 물건 하나와 추만 있는 저울부터 풉니다.", "모빌은 맨 아래 막대부터 풉니다.")),
  help: "마우스·터치: 동전·추를 끌어다 접시에 놓고, 숫자 옆의 ▲▼ 버튼을 누릅니다<br>키보드: 방향키로 고르고 Enter(동전·추는 왼쪽 접시 → 오른쪽 접시 → 받침 순서로 옮겨집니다)",
  sides: ["나", ""],
  startWord: "좌판 앞에 서기",
};
