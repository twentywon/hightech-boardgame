import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { STALL_LIMIT, PLACES, hare, type State } from "./rules";
import { HARE_COLORS, HareView, placeAt } from "./view";

export const hareConfig: PointConfig<State> = {
  game: hare,
  noPanel: true,
  view: (host, quality) => new HareView(host, quality),
  colors: HARE_COLORS,
  keyPoints: () => PLACES.map((_, i) => placeAt(i)),
  showMovable: false,
  variants: [
    { value: "hounds", label: "사냥개 (세 마리)" },
    { value: "hare", label: "토끼 (한 마리)" },
  ],
  variantLabel: "내 말 (컴퓨터 대전)",
  sidesOf: (variant) => (variant === "hare" ? ["토끼", "사냥개"] : ["사냥개", "토끼"]),
  colorsOf: (variant) => (variant === "hare" ? [HARE_COLORS[1], HARE_COLORS[0]] : HARE_COLORS),
  firstNote: "사냥개가 먼저 둡니다. 토끼를 고르면 컴퓨터가 먼저 움직입니다.",
  // The dogs bark as they set off; the hare patters.
  contact: (sound, state) => (state.last && state.hare === state.last.to ? sound.hop() : sound.bark()),
  name: "토끼와 사냥개",
  english: "Hare and Hounds",
  number: "NO. 23 — THE CHASE",
  intro: `<p>사냥개 세 마리가 토끼 한 마리를 몰아넣습니다.<br>토끼는 사냥개 사이를 빠져나가면 이깁니다.</p>`,
  meta: "2인 · 점 11개 · 사냥개 3 대 토끼 1",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>THREE AGAINST ONE</span>`,
  artClass: "hare-art",
  artLabel: "토끼와 사냥개 판 미리보기",
  tableLabel: "THE MEADOW BOARD",
  tableNote: () => "점 11개 · 사냥개 선공",
  rulesTitle: "가두느냐, 빠져나가느냐",
  rules:
    part("기본 규칙", steps("점 11개가 선으로 이어진 판에서 합니다. 왼쪽 끝에 사냥개 셋, 오른쪽 끝에 토끼 하나가 섭니다.", "<b>사냥개가 먼저</b> 두고 번갈아 말 하나를 <b>선을 따라 이웃한 빈 점으로 한 칸</b> 옮깁니다.", "잡거나 뛰어넘는 수는 없습니다.")) +
    part("말", table(["사냥개", "앞(오른쪽)이나 위아래, 비스듬히 앞으로 갑니다. <b>뒤(왼쪽)로는 갈 수 없습니다.</b>"], ["토끼", "선이 이어진 어느 쪽으로든 갑니다."])) +
    part("승부", table(["사냥개의 승리", "토끼가 움직일 곳이 하나도 없게 가둡니다."], ["토끼의 승리", "모든 사냥개보다 왼쪽으로 빠져나갑니다. 사냥개는 뒤로 못 가므로 다시 잡을 수 없습니다."], ["제자리걸음", `사냥개가 ${STALL_LIMIT}번 잇달아 앞으로 나아가지 못하면(위아래로만 움직이면) 토끼가 이깁니다.`])) +
    part("처음이라면", notes("사냥개는 <b>줄을 맞춰 한 칸씩</b> 밀고 갑니다. 한 마리가 앞서 나가면 그 옆으로 토끼가 빠집니다.", "비스듬한 선은 가운데 점에만 있습니다. 가운데를 누가 쥐는지가 중요합니다.", "토끼는 서두르지 않습니다. 사냥개가 틈을 보일 때까지 기다리는 것도 수입니다.")) +
    part("그 밖에", notes("사냥개가 빈틈없이 두면 사냥개가 이기는 놀이로 알려져 있습니다.", "새 게임 설정의 <b>내 말</b>에서 사냥개와 토끼 중 무엇을 맡을지 고릅니다. 로컬 2인에서는 플레이어 1이 고른 쪽을 맡습니다.", "사냥개가 움직이면 멍멍, 토끼가 움직이면 총총총 소리가 납니다.", "새 게임 설정에서 대전 방식과 컴퓨터 난이도(쉬움·보통·어려움)를 고릅니다.", "<b>무르기</b>는 직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다.", "저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
  sides: ["사냥개", "토끼"],
  startWord: "판 앞에 앉기",
};
