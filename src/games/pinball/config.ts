import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { pinball, type State } from "./rules";
import { BALLS, MULTIPLIER_MOST, POINTS, SAVE_TIME } from "./sim";
import { PINBALL_COLORS, PinballView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
export const pinballConfig: PointConfig<State> = {
  game: pinball,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  view: (host, quality) => new PinballView(host, quality),
  colors: PINBALL_COLORS,
  tallyHtml: (state) => [stat("점수", state.score.toLocaleString("ko-KR")) + stat("공", `${state.ball}/${BALLS}`), ""],
  // The table's parts each sound their own (`onKnock` in the view): the flippers' plastic clack, a bumper's chime
  // over its thump, a slingshot's snap, a drop target's knock, the plunger's spring, the ball down the drain.
  knock: ((sound, kind: string, strength: number) => {
    if (kind === "flipper") sound.puck(0.3 + 0.4 * strength);
    else if (kind === "bumper") {
      sound.ding(0.7);
      sound.rail(0.5);
    } else if (kind === "sling") sound.rail(0.7);
    else if (kind === "target") sound.knock(1);
    else if (kind === "bank") sound.double();
    else if (kind === "lane") sound.ding(0.4);
    else if (kind === "laneSet") sound.sparkle();
    else if (kind === "spinner") sound.bbTick(0.4 + 0.6 * strength);
    else if (kind === "plunger") sound.trap();
    else if (kind === "drain") sound.hollow(0.7);
    else if (kind === "save") sound.chime();
    else if (kind === "post" || kind === "wall") sound.rail(0.25 * strength);
  }) as PointConfig<State>["knock"],
  name: "핀볼",
  english: "Pinball",
  number: "NO. 107 — COMET RUN",
  intro: `<p>밤의 오락실, 우주를 그린 핀볼 기계 앞에 섭니다.<br>플런저를 당겨 쇠공을 쏘아 올리고, 양쪽 플리퍼로 받아쳐 범퍼와 타깃을 맞히세요. 공 ${BALLS}개로 몇 점을 낼 수 있을까요?</p>`,
  meta: `1인 · 공 ${BALLS}개 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>COMET RUN</span>`,
  artClass: "hexa-art",
  artLabel: "핀볼 미리보기",
  tableLabel: "THE ARCADE",
  tableNote: () => "COMET RUN",
  rulesTitle: "공을 떨어뜨리지 마세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "공은 오른쪽 아래 <b>플런저</b> 위에서 기다립니다. 플런저를 당겼다 놓으면 공이 오른쪽 길을 따라 올라가 위쪽 둥근 벽을 돌아 판으로 나옵니다. 많이 당길수록 세게 나갑니다.",
        "판은 앞쪽으로 기울어 있어 공이 아래로 굴러 내려옵니다. 아래쪽 두 <b>플리퍼</b>로 공을 쳐 올리세요.",
        "공이 두 플리퍼 사이로 빠지거나, 양쪽 바깥 길(아웃레인)로 빠지면 그 공은 끝납니다.",
        `공 <b>${BALLS}개</b>를 모두 쓰면 게임이 끝납니다. 점수는 계속 더해집니다.`,
      ),
    ) +
    part(
      "조작",
      table(
        ["플리퍼", "화면 <b>왼쪽 절반</b>을 누르고 있으면 왼쪽 플리퍼, <b>오른쪽 절반</b>을 누르고 있으면 오른쪽 플리퍼가 올라갑니다. 두 손가락으로 양쪽을 함께 누를 수 있습니다. 키보드는 Z 또는 ←(왼쪽), / 또는 →(오른쪽)입니다."],
        ["플런저", "공이 플런저 위에 있을 때 오른쪽 아래의 <b>빨간 손잡이</b>를 누른 채 아래로 끌어 당겼다가 놓습니다. 누르고만 있어도 조금씩 당겨집니다. 키보드는 스페이스·↓·Enter를 누르고 있다가 뗍니다."],
        ["치는 힘", "플리퍼는 끝으로 칠수록 공이 세게 나갑니다. 플리퍼를 올린 채로 있으면 공이 플리퍼 위에 멈춰(받쳐 두기) 겨눌 시간을 벌 수 있습니다."],
      ),
    ) +
    part(
      "점수",
      table(
        ["팝 범퍼", `세 개의 둥근 범퍼가 닿은 공을 힘껏 튕겨 냅니다. ${POINTS.bumper}점.`],
        ["슬링샷", `플리퍼 위 양쪽 세모난 고무벽이 공을 튕겨 냅니다. ${POINTS.sling}점.`],
        ["드롭 타깃", `왼쪽 위 주황 타깃 세 개는 맞으면 쓰러집니다. 하나에 ${POINTS.target}점, 셋 다 쓰러뜨리면 ${POINTS.bank}점을 더 받고 다시 일어섭니다.`],
        ["롤오버 레인", `맨 위 세 길을 지나가면 불이 켜지고 ${POINTS.lane}점. 셋 다 켜면 ${POINTS.laneSet}점과 함께 <b>보너스 배수</b>가 하나 올라갑니다(최대 ×${MULTIPLIER_MOST}). 플리퍼를 누를 때마다 켜진 불이 한 칸씩 옮겨 가니, 비어 있는 길로 불을 옮겨 노려 보세요.`],
        ["스피너", `오른쪽 바깥 길(오비트)의 회전판은 공이 빠르게 지나갈수록 많이 돌고, 한 바퀴에 ${POINTS.spinner}점입니다.`],
        ["보너스", "공이 끝날 때 그 공으로 쌓은 보너스(범퍼·타깃·레인·스피너)에 보너스 배수를 곱해 더 받습니다."],
        ["볼 세이브", `공을 쏘고 ${SAVE_TIME}초 안에 빠지면 한 번은 공을 다시 줍니다(아래쪽 SHOOT AGAIN 불이 깜박이는 동안).`],
      ),
    ) +
    part("처음이라면", notes("공이 내려오는 쪽 플리퍼만 눌러 받아치세요. 양쪽을 함께 누르면 가운데로 빠지기 쉽습니다.", "공이 빠르면 플리퍼를 올린 채 받쳐 세운 뒤, 천천히 굴러 내려올 때 쳐 보세요.", "이번에 들어와서 낸 가장 높은 점수는 위쪽 점수판에 HIGH로 보입니다.")),
  help: "터치·마우스: 화면 왼쪽/오른쪽 절반을 누르면 플리퍼, 오른쪽 아래 손잡이를 끌어 당겼다 놓으면 플런저<br>키보드: Z·← 왼쪽, /·→ 오른쪽 플리퍼, 스페이스·↓를 누르고 있다 떼면 플런저",
  sides: ["나", ""],
  startWord: "기계에 동전 넣기",
};
