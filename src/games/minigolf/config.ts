import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { HOLES, PAR } from "./course";
import { MAX_STROKES, minigolf, type State } from "./rules";
import { GOLF_COLORS, MiniGolfView } from "./view";

export const minigolfConfig: PointConfig<State> = {
  game: minigolf,
  // 와이파이 여럿이: each device shoots its own side; the host's state after each shot goes with it (`settled`).
  // A room is for two: the variant played alone is played as the one for two.
  net: { settled: true, variant: () => "duel" },
  // The score card over the table tells everything; the panel stays in the page for readers.
  noPanel: true,
  // A putt cannot be taken back.
  noUndo: true,
  // A hole in one is called once the ball is in.
  cheerOnRest: true,
  soloOf: (variant) => variant === "solo",
  view: (host, quality, _variant, mode) => new MiniGolfView(host, quality, mode),
  variants: [
    { value: "duel", label: "둘이 치기" },
    { value: "solo", label: "혼자 치기" },
  ],
  variantLabel: "방식",
  colors: GOLF_COLORS,
  // The computer waits for the eye to come to rest behind its ball before it swings.
  ponder: () => 350,
  cheer: (before, state) => {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return null;
    if (last.result === "water") return "퐁당!";
    if (last.result !== "cup") return null;
    const par = HOLES[last.hole].par;
    return last.strokes === 1 ? "홀인원!" : last.strokes <= par - 2 ? "이글!" : last.strokes === par - 1 ? "버디!" : null;
  },
  // The putter's click (and a rubber bumper's), the knock of a rail, the drop into the cup; a pond splashes.
  knock: (sound, kind, strength) => (kind === "pocket" ? sound.pocket() : kind === "cushion" ? sound.cushion(strength) : sound.ball(strength)),
  contact: (sound) => sound.splash(),
  movingText: "공이 구르는 중…",
  name: "미니골프",
  english: "Mini Golf",
  number: "NO. 89 — NINE HOLES BY THE SEA",
  intro: `<p>등대가 보이는 바닷가 정원의 아홉 홀.<br>공을 뒤로 당겼다 놓아 굴리고, 언덕과 풍차와 다리를 지나 적은 타수로 컵에 넣으세요.</p>`,
  meta: `1–2인 · 9홀 · 파 ${PAR}`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>NINE HOLES BY THE SEA</span>`,
  artClass: "ludo-art",
  artLabel: "미니골프 미리보기",
  tableLabel: "SEASIDE PUTTING GREEN",
  tableNote: (variant) => (variant === "solo" ? `혼자 치기 · 9홀 · 파 ${PAR}` : `둘이 치기 · 9홀 · 파 ${PAR}`),
  rulesTitle: "아홉 홀, 적은 타수로",
  rules:
    part(
      "기본 규칙",
      steps(
        `바닷가 정원에 홀이 <b>아홉 개</b> 있습니다. 출발 매트에서 공을 쳐 <b>컵</b>에 넣으면 그 홀이 끝나고, 친 횟수가 그 홀의 <b>타수</b>입니다.`,
        "<b>공을 누른 채 뒤로 당겼다가 놓으면</b> 당긴 반대쪽으로 굴러갑니다. 길게 당길수록 세게 칩니다. 당기는 동안 공이 갈 방향이 점으로, 세기가 왼쪽 막대로 보입니다.",
        "둘이 칠 때는 한 사람이 한 홀을 끝까지 친 뒤 다른 사람이 같은 홀을 칩니다. 앞 홀에서 적게 친 쪽이 다음 홀을 먼저 칩니다.",
        `아홉 홀을 마치고 <b>타수의 합이 적은 쪽</b>이 이깁니다. 혼자 칠 때는 코스의 파 ${PAR}와 겨룹니다.`,
      ),
    ) +
    part(
      "타수와 벌타",
      table(
        ["파", "그 홀을 잘 치면 넣을 수 있는 타수입니다. 홀마다 2에서 4까지이고, 출발 매트 옆 팻말과 점수표에 적혀 있습니다."],
        ["홀인원", "한 번에 컵에 넣은 것. 점수표에 금색으로 적힙니다."],
        ["버디 · 이글", "파보다 하나 적게 넣으면 버디, 둘 적게 넣으면 이글입니다. 점수표에 빨간 숫자로 적힙니다."],
        ["물에 빠지면", "<b>1벌타</b>: 그 타에 한 타가 더해지고, 공은 친 자리로 돌아옵니다."],
        ["최대 타수", `한 홀은 <b>${MAX_STROKES}타</b>까지입니다. ${MAX_STROKES}타째에도 들어가지 않으면 공을 집어 들고 ${MAX_STROKES}타로 적습니다.`],
        ["컵", "공이 느리게 지나가면 빨려 들어가지만, 너무 빠르면 컵 가장자리를 넘어 튀어 나갑니다. 컵 가운데로 갈수록 조금 빨라도 들어갑니다."],
      ),
    ) +
    part(
      "코스",
      table(
        ["언덕과 비탈", "공은 비탈을 따라 굴러 내려갑니다. 오르막은 세게, 내리막은 살살 치세요."],
        ["범퍼", "흰 기둥에 빨간 고무를 두른 범퍼는 공을 잘 튕겨 냅니다. 테두리의 난간도 공을 되튀깁니다."],
        ["풍차", "날개가 돌다가 아래로 내려오면 집의 문을 막습니다. 날개 사이가 문 앞에 올 때를 기다렸다가 치세요."],
        ["모래", "모래에 들어가면 공이 금세 멈춥니다. 돌아가는 길이 나을 때도 있습니다."],
        ["다리와 연못", "좁은 다리에는 난간이 없어 조금만 비껴도 연못에 빠집니다."],
        ["멈춘 공", "비탈에서 난간에 기대 거의 움직이지 않는 공은 잠시 뒤 그 자리에 멈춘 것으로 치고, 다음 타로 넘어갑니다."],
        ["갈림길과 터널", "꽃밭이 길을 둘로 나눕니다. 왼쪽 돌 터널은 짧지만 좁고, 오른쪽은 범퍼를 돌아가는 넓은 길입니다."],
      ),
    ) +
    part(
      "치기",
      table(
        ["방향", "당긴 쪽의 반대로 굴러갑니다. 공 앞의 흰 점이 굴러갈 방향입니다. 벽에 맞으면 튕겨 나오니 그 각도까지 생각해서 칩니다."],
        ["세기", "당긴 길이만큼 셉니다. 짧게 당길 때는 세기가 천천히 늘어 가까운 퍼트를 맞추기 쉽습니다. 너무 조금 당기면 치지 않습니다."],
        ["홀 전체 보기", "오른쪽 위 버튼(키보드 V)을 누르면 홀 전체를 위에서 내려다봅니다. 그 자리에서도 공을 칠 수 있고, 다시 누르면 공 뒤로 돌아옵니다."],
        ["키보드", "← →로 방향을 돌리고(Shift를 함께 누르면 조금씩), 스페이스를 누르고 있으면 세기가 오르내리다가 떼는 순간 칩니다."],
        ["컴퓨터", "같은 물리로 수많은 샷을 미리 굴려 보고, 손이 조금 빗나가도 괜찮은 샷을 고릅니다. 공이 멈출 곳은 다리와 터널을 따라 돌아가는 길로 따지고, 연못은 크게 꺼려서 좁은 다리 앞에서는 먼저 끊어 갑니다. 쉬움일수록 손이 많이 흔들립니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "처음 홀은 곧은 길입니다. 왼쪽 세기 막대가 60쯤 되게 곧게 당겼다 놓으면 컵까지 굴러갑니다.",
        "컵을 지나칠 만큼만 세게 치세요. 모자라면 들어갈 수가 없습니다.",
        "꺾인 길에서는 벽에 맞혀 튕겨 보내는 길이 짧을 때가 많습니다. 홀 전체 보기로 각도를 살펴보세요.",
        "풍차 앞에서는 날개가 문을 막는 동안 당겨 두었다가, 문이 열리는 순간 놓으세요.",
      ),
    ),
  help: "마우스·터치: 공을 누른 채 뒤로 당겼다 놓아 칩니다<br>키보드: ← → 방향, 스페이스를 눌렀다 떼면 치기, V 홀 전체 보기",
  sides: ["빨강", "파랑"],
  firstNote: "컴퓨터 대전에서는 내가 빨간 공으로 먼저 칩니다.",
  startWord: "출발 매트에 서기",
};
