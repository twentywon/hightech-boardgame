import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { valet, stageOf, type State } from "./rules";
import { ANGRY_FINE, BUMP_FINE, LATE_PAY, PAY, SHIFT, STAGE_NAMES, TIDY, TIP, lotOf } from "./sim";
import { VALET_COLORS, ValetView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
const won = (units: number) => `${(units * 100).toLocaleString("ko-KR")}원`;
const NOTES = ["넓은 칸 · 처음이라면", "비스듬한 칸", "좁은 칸 · 기둥 · 평행 주차"];
/** A small map of a lot: its bays as they lie (square, slanted, along the wall), its pillars, the entrance and the exit. */
function lotArt(stage: number) {
  const lot = lotOf(stage),
    s = 132 / 32,
    px = (x: number) => 70 + x * s,
    pz = (z: number) => 76 + z * s;
  const bays = lot.bays
    .map((b) => `<rect x="${(-b.l / 2) * s}" y="${(-b.w / 2) * s}" width="${b.l * s}" height="${b.w * s}" fill="none" stroke="#f1efe6" stroke-width="1.2" transform="translate(${px(b.x)} ${pz(b.z)}) rotate(${(b.angle * 180) / Math.PI})"/>`)
    .join("");
  const pillars = lot.pillars.map((p) => `<circle cx="${px(p.x)}" cy="${pz(p.z)}" r="2.4" fill="#f2c230"/>`).join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="16" fill="#6a9550"/><text x="70" y="24" text-anchor="middle" font-size="13" font-weight="800" fill="#fff" font-family="Helvetica, Arial, sans-serif">${STAGE_NAMES[stage - 1]}</text><rect x="${px(lot.minX)}" y="${pz(lot.minZ)}" width="${(lot.maxX - lot.minX) * s}" height="${(lot.maxZ - lot.minZ) * s}" rx="3" fill="#54585f"/>${bays}${pillars}<rect x="${px(-13.4)}" y="${pz(-0.6)}" width="10" height="5" rx="1.5" fill="#e8452e"/><path d="M${px(11)} ${pz(0)} h12 m-4 -4 l4 4 l-4 4" fill="none" stroke="#ffc42e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
export const valetConfig: PointConfig<State> = {
  game: valet,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  newGameLabel: "주차장 선택",
  view: (host, quality) => new ValetView(host, quality),
  colors: VALET_COLORS,
  tallyHtml: (state) => [stat("수입", won(state.money)) + stat("주차·출차", `${state.parked}·${state.returned}대`), ""],
  // What the lot is heard doing (`onKnock` in the view): the engine by the car's speed (fuller with a pedal down),
  // the tyres' chirp, a bump's crunch, the till on a job paid, a horn when a customer runs out of patience, a ding as a
  // customer comes, the door as the valet gets in.
  knock: ((sound, kind: string, strength: number) => {
    if (kind === "rev" || kind === "coast" || kind === "off") sound.carEngine(strength, kind === "rev", kind !== "off");
    else if (kind === "chirp") sound.slotScreech(Math.min(0.5, strength * 0.5));
    else if (kind === "bump") {
      sound.thud();
      if (strength > 0.3) sound.crunch();
    } else if (kind === "pay") sound.cash();
    else if (kind === "horn") sound.horn();
    else if (kind === "ask") sound.ding(0.5);
    else if (kind === "arrive") sound.ding(0.3);
    else if (kind === "door") sound.clasp(0.6);
  }) as PointConfig<State>["knock"],
  // 새 게임 (주차장 선택) asks which car park.
  stages: STAGE_NAMES.map((name, i) => ({ value: String(i + 1), name, note: NOTES[i], art: lotArt(i + 1) })),
  name: "주차 요원",
  english: "Valet Parking",
  number: "NO. 112 — PARK THEM ALL",
  intro: `<p>주차장의 발레파킹 요원이 됩니다.<br>요원을 직접 뛰게 해 차에 타고, 손님이 말한 칸에 차를 대세요. 손님이 돌아오면 출구까지 몰아 내어 드리세요. ${SHIFT / 60}분 근무 동안 얼마나 벌 수 있을까요?</p>`,
  meta: `1인 · ${SHIFT / 60}분 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>PARK THEM ALL</span>`,
  artClass: "hexa-art",
  artLabel: "주차 요원 미리보기",
  tableLabel: "THE CAR PARK",
  tableNote: (variant) => STAGE_NAMES[stageOf(variant) - 1],
  rulesTitle: "손님이 말한 칸에 반듯하게",
  rules:
    part(
      "기본 규칙",
      steps(
        "손님 차가 왼쪽 <b>입구</b>로 한 대씩 들어옵니다. 입구가 차 있으면 다음 손님은 바깥 길에서 기다립니다.",
        "주차 요원(빨간 옷, 발밑에 노란 고리)은 내가 <b>레버나 방향키로 움직입니다</b>. 차·연석·기둥·부스는 뚫고 지나갈 수 없습니다.",
        "탈 수 있는 차 옆에 서면 차 둘레가 노랗게 빛나고 <b>탑승</b> 버튼이 켜집니다. 탈 수 있는 차는 손님이 맡긴 차(입구에 선 차, 내가 몰다 세워 둔 차)와 주인이 찾으러 온 차입니다. 주차된 다른 차는 탈 수 없습니다.",
        "차에 타면 손님이 <b>말풍선으로 칸 번호</b>를 말해 줍니다. 그 칸 하나만 초록빛으로 빛나고 위에 번호 표가 뜹니다. 화면 위쪽 손님 줄에도 그 번호가 남습니다.",
        "그 칸 안에 칸과 나란히 들어가 멈춘 뒤 <b>하차</b>하면 주차 완료입니다(앞으로 대든 뒤로 대든 됩니다). 다른 칸이거나 비뚤면 손님이 알려 주고 내리지 않습니다. 칸 밖 통로에서 하차하면 차를 그 자리에 세워 두고 내립니다(다시 타서 마저 대세요).",
        "얼마 뒤 손님이 돌아와 차를 찾습니다. 그 차 옆으로 뛰어가 타고, 오른쪽 <b>출구</b>(노란 빗금)로 몰고 들어가면 출차 완료입니다. 출구에서는 하차하지 않아도 요원이 저절로 내립니다.",
        `근무는 <b>${SHIFT / 60}분</b>입니다. 오른쪽 위 시계가 0이 되면 끝나고, 그때까지의 수입이 기록입니다.`,
      ),
    ) +
    part(
      "조작",
      table(
        ["걷기", "화면 왼쪽 아래 <b>레버</b>를 엄지로 미는 쪽으로, 또는 <b>↑↓←→(WASD)</b>. 많이 밀수록 빨리 뜁니다."],
        ["탑승·하차", "화면 오른쪽 아래 <b>탑승/하차</b> 버튼, 또는 <b>E</b>(Enter). 하차는 차가 멈춰 있을 때만 됩니다."],
        ["가속", "<b>↑(W)</b> 또는 오른쪽 아래 <b>가속</b> 페달(운전할 때만 보입니다). 누르고 있는 동안 앞으로 갑니다."],
        ["후진·브레이크", "<b>↓(S)</b> 또는 <b>후진</b> 페달. 앞으로 가는 중이면 먼저 브레이크가 걸리고, 멈춘 뒤 계속 누르면 뒤로 갑니다."],
        ["핸들", "운전할 때는 <b>레버를 좌우로</b>(조금 밀면 조금 꺾입니다), 또는 <b>← →(A·D)</b>. 떼면 핸들이 저절로 풀립니다. 후진할 때는 차 꼬리가 핸들 방향으로 갑니다."],
        ["사이드 브레이크", "<b>스페이스</b>. 바로 멈춥니다."],
        ["기어 표시", "하차 버튼 왼쪽에 D(전진)·R(후진)·N(중립)·P(사이드 브레이크)가 보입니다."],
      ),
    ) +
    part(
      "수입",
      table(
        ["주차·출차", `한 대에 ${won(PAY)}.`],
        ["빠른 서비스 팁", `손님의 인내심이 많이 남았을수록 최대 ${won(TIP)}.`],
        ["깔끔한 주차", `칸 한가운데에 반듯하게 댈수록 최대 ${won(TIDY)}.`],
        ["접촉 사고", `벽·기둥·다른 차에 부딪히면 벌금 ${won(BUMP_FINE)}, 그 차의 팁도 사라집니다. 차에 흠집이 남습니다.`],
        ["화난 손님", `인내심(손님 머리 위와 화면 위쪽의 막대)이 바닥나면 벌금 ${won(ANGRY_FINE)}. 아직 아무도 타지 않은 차의 손님은 차를 몰고 떠나고, 이미 맡은 일은 끝내면 ${won(LATE_PAY)}만 받습니다.`],
      ),
    ) +
    part(
      "주차장",
      table(
        [STAGE_NAMES[0], "칸이 넓고 통로와 직각입니다. 위아래 두 줄, 14칸. 손님이 가장 느긋합니다."],
        [STAGE_NAMES[1], "칸이 60°로 비스듬하고 조금 좁습니다. 들어오는 방향 그대로 비스듬히 꺾어 넣으면 쉽습니다. 12칸."],
        [STAGE_NAMES[2], "칸이 좁고 칸 입구마다 기둥이 서 있으며, 통로 가운데에도 기둥이 있습니다. 아래쪽 벽에는 벽과 나란한 평행 주차 칸이 있습니다. 11칸, 손님도 더 자주 옵니다."],
        ["고르기", "위쪽의 <b>주차장 선택</b>을 누르면 고를 수 있습니다."],
      ),
    ) +
    part("처음이라면", notes("걸을 때는 노란 화살표가 가장 급한 손님의 차 위에 떠 있습니다. 막대가 짧아진 손님부터 맡으세요.", "칸 앞을 조금 지나치듯 크게 돌아 들어가면 한 번에 들어갑니다. 통로의 반대쪽으로 붙어서 가다가 꺾으세요.", "천천히 들어가서 칸이 노랗게 빛나면 멈추고 하차하세요.", "차를 뺄 때는 먼저 곧게 후진해 앞머리를 빼고, 핸들을 꺾어 출구 쪽을 보게 돌리세요.")),
  help: "키보드: 걸을 때 ↑↓←→ 이동, E(Enter) 탑승·하차, 운전할 때 ↑ 가속, ↓ 후진·브레이크, ← → 핸들, 스페이스 사이드 브레이크<br>터치·마우스: 왼쪽 아래 레버로 걷기(운전할 때는 좌우로 핸들), 오른쪽 아래 탑승·하차 버튼과 후진·가속 페달",
  sides: ["나", ""],
  startWord: "근무 시작",
};
