import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { snowboard, type State } from "./rules";
import { CRASH_TIME, LAND_OK, MULT_MOST, POINTS, RUN } from "./sim";
import { SNOWBOARD_COLORS, SnowboardView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
const minutes = Math.round(RUN / 60);
export const snowboardConfig: PointConfig<State> = {
  game: snowboard,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  view: (host, quality) => new SnowboardView(host, quality),
  colors: SNOWBOARD_COLORS,
  tallyHtml: (state) => [stat("점수", state.score.toLocaleString("ko-KR")) + stat("넘어짐", state.crashes), ""],
  // The ride's own sounds (`onKnock` in the view): the board carving the snow (louder the quicker), the pop of a jump,
  // a landing's thump, a trick's chime, a crash's tumble, a gate's ding and a snowflake's tinkle.
  knock: ((sound, kind: string, strength: number) => {
    if (kind === "carve") sound.rolling(strength * 0.8);
    else if (kind === "jump") sound.swish();
    else if (kind === "land") sound.thud();
    else if (kind === "trick") strength > 1 ? sound.sparkle() : sound.chime();
    else if (kind === "crash") {
      sound.crunch();
      sound.soft(3);
    } else if (kind === "gate") sound.ding(0.6);
    else if (kind === "flake") sound.ding(0.3);
  }) as PointConfig<State>["knock"],
  name: "스노보드",
  english: "Snowboard",
  number: "NO. 111 — SUNSET SLOPE",
  intro: `<p>해 질 녘의 끝없는 눈 언덕을 보드 하나로 내려갑니다.<br>언덕을 타고 속도를 붙여 점프하고, 공중에서 플립을 돌아 깔끔하게 착지하세요. ${minutes}분 동안 몇 점을 낼 수 있을까요?</p>`,
  meta: `1인 · ${minutes}분 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>SUNSET SLOPE</span>`,
  artClass: "hexa-art",
  artLabel: "스노보드 미리보기",
  tableLabel: "THE SLOPE",
  tableNote: () => "SUNSET SLOPE",
  rulesTitle: "판이 비탈과 나란할 때 내려앉으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "라이더는 끝없이 이어지는 눈 언덕을 저절로 내려갑니다. 내리막에서는 빨라지고 오르막에서는 느려집니다.",
        "언덕 꼭대기나 점프대 끝에서는 저절로 공중에 뜨고, 누르고 있다가 떼면 그 자리에서 뛰어오릅니다(오래 누를수록 높이).",
        "공중에서 몸을 돌려 플립을 하고, <b>보드가 비탈과 나란할 때</b> 내려앉으면 깔끔한 착지입니다. 많이 기울어 내려앉거나 바위에 걸리면 넘어집니다.",
        `시간은 <b>${minutes}분</b>입니다. 왼쪽 아래 TIME이 0이 되면 끝나고, 그때까지의 점수가 기록입니다.`,
      ),
    ) +
    part(
      "조작",
      table(
        ["누르기 (웅크리기)", "화면 아무 곳이나 누르고 있으면 웅크립니다. <b>내리막에서 웅크리면 더 빨라지고</b>, 오르막에서 웅크리면 조금 더 느려집니다. 내리막에서 누르고 오르막에서 떼는 것을 되풀이하면(펌핑) 속도가 붙습니다."],
        ["떼기 (점프)", "땅 위에서 누르던 손을 떼면 뛰어오릅니다. 점프대 끝에서 떼면 가장 높이 납니다."],
        ["공중 회전", "공중에서 화면 <b>왼쪽 절반</b>을 누르고 있으면 뒤로(백플립), <b>오른쪽 절반</b>을 누르고 있으면 앞으로(프런트플립) 돕니다. 손을 떼면 회전이 멈춥니다."],
        ["키보드", "스페이스·↓를 누르고 있으면 웅크리기, 떼면 점프입니다. 공중에서 ←는 백플립, →는 프런트플립입니다."],
        ["착지", `보드와 비탈의 각도 차이가 ${Math.round((LAND_OK * 180) / Math.PI)}°보다 작으면 깔끔한 착지, 아주 작으면 <b>퍼펙트</b>입니다. 넘어지면 ${CRASH_TIME}초 동안 굴렀다가 다시 탑니다.`],
      ),
    ) +
    part(
      "점수",
      table(
        ["플립", `깔끔하게 착지한 플립 한 바퀴에 ${POINTS.flip}점입니다.`],
        ["체공", `공중에 떠 있던 1초마다 ${POINTS.air}점입니다(아주 짧은 점프는 점수가 없습니다).`],
        ["퍼펙트 착지", `보드가 비탈과 거의 꼭 맞게 내려앉으면 ${POINTS.perfect}점을 더 받습니다.`],
        ["깃발", `빨강·파랑 깃발 사이를 땅에 붙어 지나가면 ${POINTS.gate}점입니다(깃발 위로 날아 넘으면 없습니다).`],
        ["눈송이", `점프대 너머 공중에 떠 있는 빛나는 눈송이 하나에 ${POINTS.flake}점입니다.`],
        ["배수", `모든 점수에 오른쪽 위의 배수가 곱해집니다. 플립을 깔끔하게 착지할 때마다 그 바퀴 수만큼 배수가 올라가고(최대 ×${MULT_MOST}), 넘어지면 ×1로 돌아갑니다.`],
      ),
    ) +
    part("처음이라면", notes("먼저 점프대 끝에서 손을 떼 높이 뛰는 것부터 해 보세요.", "공중에서 한쪽을 짧게 눌러 한 바퀴만 돌고, 땅이 가까워지면 손을 떼 보드를 비탈에 맞추세요.", "바위가 보이면 바로 앞에서 손을 떼 뛰어넘으세요.", "이번에 들어와서 낸 가장 높은 점수는 SCORE 아래에 BEST로 보입니다(저장하지는 않습니다).")),
  help: "터치·마우스: 누르고 있으면 웅크리기, 떼면 점프, 공중에서 화면 왼쪽/오른쪽 절반을 누르면 백플립/프런트플립<br>키보드: 스페이스·↓ 웅크리기·점프, ←/→ 공중 회전",
  sides: ["나", ""],
  startWord: "출발",
};
