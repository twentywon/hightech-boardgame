import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { SPIN, bowling, type State } from "./rules";
import { BOWLING_COLORS, BowlingView } from "./view";

/** The spin tool's words: short enough for one line on a phone. */
const SPIN_LABELS = ["회전 없음", "↶ 왼쪽 훅", "↷ 오른쪽 훅"];
export const bowlingConfig: PointConfig<State> = {
  game: bowling,
  // The score screen over the lane tells everything; the panel stays in the page for readers.
  noPanel: true,
  // A ball rolled cannot be taken back.
  noUndo: true,
  // Strikes and spares are called once the pins have stopped.
  cheerOnRest: true,
  soloOf: (variant) => variant === "solo",
  view: (host, quality, _variant, mode) => new BowlingView(host, quality, mode),
  variants: [
    { value: "duel", label: "둘이 번갈아" },
    { value: "solo", label: "혼자 치기" },
  ],
  variantLabel: "방식",
  colors: BOWLING_COLORS,
  tools: [{ label: "회전", point: SPIN, text: (s) => SPIN_LABELS[s.spin[s.turn]] }],
  // The computer waits for the pinsetter and the ball's return before it bowls.
  ponder: (state) => (state.last ? 2900 : 700),
  cheer: (before, state) => {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return null;
    if (last.mark === "strike") return last.run === 12 ? "퍼펙트!" : last.run === 3 ? "터키!" : last.run === 2 ? "더블!" : "스트라이크!";
    return last.mark === "spare" ? "스페어!" : null;
  },
  // The roll is a rumble as long as the ball takes down the lane; the pins crash, then knock; the gutter and the pit thud.
  knock: (sound, kind, strength) => (kind === "cushion" ? sound.rumble(Math.max(1.8, Math.min(4.5, 19 / (Math.max(0.3, strength) * 9.5)))) : kind === "disc" ? sound.pins(strength) : sound.knock(3)),
  contact: (sound) => sound.knock(2),
  name: "볼링",
  english: "Bowling",
  number: "NO. 78 — TEN PINS",
  intro: `<p>반짝이는 단풍나무 레인 끝에 선 핀 열 개.<br>공을 굴려 쓰러뜨리고, 스트라이크와 스페어로 열 프레임의 점수를 쌓으세요.</p>`,
  meta: "1–2인 · 10프레임 · 핀 10개",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>TEN PINS, TEN FRAMES</span>`,
  artClass: "ludo-art",
  artLabel: "볼링 미리보기",
  tableLabel: "STAR LANES",
  tableNote: (variant) => (variant === "solo" ? "혼자 치기 · 10프레임" : "둘이 번갈아 · 10프레임"),
  rulesTitle: "열 프레임, 핀 열 개",
  rules:
    part(
      "기본 규칙",
      steps(
        "레인 끝의 핀 열 개를 공으로 쓰러뜨립니다. 한 게임은 <b>10프레임</b>이고, 한 프레임에 공을 <b>두 번</b>까지 굴립니다.",
        "공을 <b>좌우로 끌어</b> 파울 라인 뒤에서 설 자리를 잡고, 화면을 <b>위로 밀어 올리면</b> 굴러갑니다. 민 방향으로 가고, 길게 밀수록 빠릅니다. 미는 동안 공이 갈 길이 점으로 보입니다.",
        "공이 핀에 닿으면 시점이 공을 따라가 핀이 쓰러지는 모습을 보여 주고, 핀세터가 쓰러진 핀을 치운 뒤 남은 핀을 다시 세웁니다.",
        "둘이 번갈아 칠 때는 한 프레임씩 차례를 바꿉니다. 10프레임을 마치고 점수가 많은 쪽이 이깁니다.",
      ),
    ) +
    part(
      "점수",
      table(
        ["스트라이크 (X)", "첫 공으로 열 개를 모두 쓰러뜨린 것. 10점에 <b>다음 두 공</b>의 점수를 더합니다."],
        ["스페어 (/)", "두 공으로 열 개를 모두 쓰러뜨린 것. 10점에 <b>다음 한 공</b>의 점수를 더합니다."],
        ["오픈 프레임", "두 공을 굴리고도 핀이 남은 것. 쓰러뜨린 핀 수가 그 프레임의 점수입니다."],
        ["10프레임", "스트라이크를 치면 공을 두 개, 스페어를 치면 한 개 더 굴립니다. 열두 번 모두 스트라이크면 <b>300점</b>, 퍼펙트 게임입니다."],
        ["거터 (-)", "레인 양옆의 홈에 빠진 공입니다. 핀을 하나도 쓰러뜨리지 못합니다."],
      ),
    ) +
    part(
      "공 굴리기",
      table(
        ["설 자리", "공을 옆으로 끌어 옮깁니다. 키보드는 ← →입니다."],
        ["방향과 세기", "위로 밀어 올린 방향과 길이로 정해집니다. 키보드는 A·D로 방향을 돌리고 스페이스를 눌렀다 떼면 굴러갑니다."],
        ["회전", "<b>회전</b> 버튼(키보드 S)으로 직구·왼쪽 훅·오른쪽 훅을 고릅니다. 처음에는 회전 없는 직구입니다. 훅을 건 공은 레인 앞쪽의 오일 위에서는 곧게 미끄러지다가, 기름이 없는 뒤쪽에서 그쪽으로 휘어 들어갑니다."],
        ["포켓", "1번 핀과 3번 핀 사이(오른쪽 훅은 1번과 2번 사이)입니다. 여기로 비스듬히 들어간 공이 스트라이크를 가장 잘 냅니다."],
        ["스플릿", "1번 핀이 쓰러지고 떨어진 핀들이 남은 것. 7-10처럼 양 끝에 남으면 스페어가 아주 어렵습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "회전을 왼쪽 훅으로 바꾸고 가운데에서 조금 오른쪽에 서서 곧게 밀면 휘어 들어가 포켓에 맞기 쉽습니다.",
        "핀을 정면으로 맞히면 양쪽이 남는 스플릿이 나기 쉽습니다. 조금 비껴 맞히세요.",
        "구석에 남은 핀은 반대쪽에 서서 레인을 가로지르게 직구로 노립니다.",
        "레인의 화살표 일곱 개를 겨냥점으로 삼으면 방향을 맞추기 쉽습니다.",
      ),
    ),
  help: "마우스·터치: 공을 좌우로 끌어 자리를 잡고, 위로 밀어 올려 굴립니다<br>키보드: ← → 자리, A·D 방향, 스페이스를 눌렀다 떼면 굴리기, S 회전",
  sides: ["파랑", "주황"],
  startWord: "레인에 서기",
};
