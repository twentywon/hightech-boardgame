import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { ENDS, SPIN, STONES, curling, totals, type State } from "./rules";
import { CURLING_COLORS, CurlingView } from "./view";

const TURNS = ["없음", "시계 방향 ↻", "반시계 방향 ↺"];
export const curlingConfig: PointConfig<State> = {
  game: curling,
  contact: (sound) => sound.stone(3),
  noPanel: true,
  view: (host, quality) => new CurlingView(host, quality),
  colors: CURLING_COLORS,
  // A stone slid cannot be taken back, and a turn being set is not a move of the stone.
  noUndo: true,
  cheer: (before, state, mode) => {
    const points = state.last && state.last !== before.last ? state.last.points : null;
    if (!points) return null;
    const [a, b] = points;
    return a ? `${mode === "ai" ? "내가" : "빨강"} ${a}점!` : b ? `${mode === "ai" ? "컴퓨터" : "노랑"} ${b}점!` : "블랭크 엔드";
  },
  tools: [{ label: "회전", point: SPIN, text: (s) => `회전: ${TURNS[s.spin]}` }],
  tallyHtml: (s) => totals(s).map((n) => String(n)) as [string, string],
  name: "컬링",
  english: "Curling",
  number: "NO. 63 — SLIDE TO THE BUTTON",
  intro: `<p>얼음판 위로 스톤을 밀어 하우스 한가운데에 가깝게 세웁니다.<br>엔드마다 네 개씩, 상대 스톤을 쳐내기도 하며 ${ENDS}엔드를 겨룹니다.</p>`,
  meta: `2인 · ${ENDS}엔드 · 스톤 ${STONES}개씩`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>SLIDE TO THE BUTTON</span>`,
  artClass: "ludo-art",
  artLabel: "컬링 미리보기",
  tableLabel: "THE SHEET",
  tableNote: () => `${ENDS}엔드 · 스톤 ${STONES}개씩`,
  rulesTitle: "버튼에 가장 가깝게",
  rules:
    part(
      "기본 규칙",
      steps(
        `한 엔드에 두 사람이 스톤을 <b>${STONES}개씩</b> 번갈아 밉니다. 왼쪽 핵(발판)의 스톤을 <b>뒤로 당겼다 놓으면</b> 그 반대쪽으로 나갑니다. 많이 당길수록 멀리 갑니다.`,
        "엔드가 끝나면 오른쪽 <b>하우스</b>(과녁) 한가운데 버튼에 가장 가까운 스톤의 편이, 상대의 가장 가까운 스톤보다 안쪽에 있는 자기 스톤 수만큼 점수를 얻습니다. 하우스 밖의 스톤은 세지 않습니다.",
        `${ENDS}엔드를 마치고 점수가 많은 쪽이 이깁니다.`,
      ),
    ) +
    part(
      "얼음판",
      table(
        ["회전", "미기 전에 <b>회전</b> 버튼으로 시계·반시계 방향을 고르면 스톤이 느려지면서 옆으로 휘어 갑니다. 다른 스톤을 피해 돌아 들어갈 때 씁니다."],
        ["호그 라인", "빨간 선입니다. 민 스톤이 이 선을 넘지 못하면 빼냅니다."],
        ["뒷선과 옆", "하우스 뒤의 선을 넘거나 얼음판 밖으로 나간 스톤도 빼냅니다."],
        ["해머", "엔드의 마지막 스톤입니다. 점수를 낸 쪽은 다음 엔드에 먼저 밀어, 상대가 해머를 갖습니다."],
      ),
    ) +
    part("처음이라면", notes("세기 11~15 정도로 밀면 하우스 안에 멈춥니다. 그보다 세게 밀면 상대 스톤을 쳐냅니다.", "하우스 앞에 스톤을 세워 두면(가드) 상대가 곧게 들어오지 못합니다.", "마지막 스톤이 있는 쪽이 유리합니다. 해머가 없을 때는 점수를 적게 주는 데 힘씁니다.")),
  help: "마우스·터치: 핵의 스톤을 뒤로 당겼다 놓습니다. 회전은 버튼으로 고릅니다",
  sides: ["빨강", "노랑"],
  startWord: "얼음판에 서기",
};
