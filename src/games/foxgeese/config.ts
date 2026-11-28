import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { FEWEST, STALL_LIMIT, STAY, foxGeese, type State } from "./rules";
import { FOX, GOOSE, FoxGeeseView, pointAt } from "./view";
import { POINTS } from "./rules";

export const foxGeeseConfig: PointConfig<State> = {
  game: foxGeese,
  contact: (sound) => sound.wood(4),
  noPanel: true,
  // Modelled geese and a fox (the user asked), on a board of their own.
  view: (host, quality) => new FoxGeeseView(host, quality),
  colors: [GOOSE, FOX],
  keyPoints: () => POINTS.map((_, i) => pointAt(i)),
  showMovable: false,
  variants: [
    { value: "geese", label: "거위 (열세 마리)" },
    { value: "fox", label: "여우 (한 마리)" },
  ],
  variantLabel: "내 말 (컴퓨터 대전)",
  sidesOf: (variant) => (variant === "fox" ? ["여우", "거위"] : ["거위", "여우"]),
  colorsOf: (variant) => (variant === "fox" ? [FOX, GOOSE] : [GOOSE, FOX]),
  firstNote: "거위가 먼저 둡니다. 여우를 고르면 컴퓨터가 먼저 움직입니다.",
  // A goose taken is called out: 잡혔다! when the computer's fox takes one of my geese.
  cheer: (before, state, mode) => (state.last && state.last !== before.last && state.last.taken !== null ? (mode === "ai" && state.herd === 0 ? "잡혔다!" : "잡았다!") : null),
  // After a jump the fox may stop instead of jumping on.
  tools: [{ label: "그만 뛰기", point: STAY }],
  // Over one Wi-Fi each device plays one side (nothing is hidden and nothing left to chance).
  net: {},
  name: "여우와 거위",
  english: "Fox and Geese",
  number: "NO. 54 — THE FOX IN THE YARD",
  intro: `<p>십자 모양 판 위의 여우 한 마리와 거위 열세 마리.<br>거위는 여우를 몰아 가두고, 여우는 거위를 뛰어넘어 잡습니다.</p>`,
  meta: "2인 · 점 33개 · 거위 13 대 여우 1",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>PEN THE FOX</span>`,
  artClass: "hare-art",
  artLabel: "여우와 거위 판 미리보기",
  tableLabel: "THE CROSS BOARD",
  tableNote: () => "점 33개 · 거위 선공",
  rulesTitle: "가두느냐, 잡아먹느냐",
  rules:
    part(
      "기본 규칙",
      steps(
        "점 33개가 선으로 이어진 십자 모양 판입니다. 아래쪽에 거위 13마리, 가운데 위에 여우 한 마리가 섭니다.",
        "<b>거위가 먼저</b> 두고, 번갈아 말 하나를 <b>선을 따라 이웃한 빈 점으로 한 칸</b> 옮깁니다.",
        "여우는 바로 옆 거위를 <b>선을 따라 뛰어넘어</b> 그 너머 빈 점에 내려앉으며 잡습니다. 내려앉은 자리에서 또 뛸 수 있으면 이어서 뛰거나 <b>그만 뛰기</b>로 멈춥니다.",
      ),
    ) +
    part("말", table(["거위", "앞(위쪽)이나 옆으로만 갑니다. <b>뒤로는 갈 수 없고</b> 뛰어넘지도 못합니다."], ["여우", "선이 이어진 어느 쪽으로든 한 칸 가거나 거위를 뛰어넘습니다."], ["비스듬한 선", "판에 그어진 비스듬한 선이 있는 점에서만 비스듬히 갈 수 있습니다."])) +
    part("승부", table(["거위의 승리", "여우가 움직일 곳이 하나도 없게 가둡니다."], ["여우의 승리", `거위를 잡아 ${FEWEST - 1}마리 이하로 줄이면 이깁니다. 거위가 더 움직일 수 없거나, ${STALL_LIMIT}번 잇달아 옆으로만 움직여도 여우가 이깁니다.`])) +
    part("처음이라면", notes("거위는 <b>빈틈없이 줄을 맞춰</b> 밀고 올라갑니다. 뒤에 빈 점이 있는 거위는 뛰어넘힐 수 있습니다.", "여우는 거위 줄의 빈틈을 찾아 한 번에 여러 마리를 잡을 기회를 노립니다.", "거위가 빈틈없이 두면 거위가 이기는 놀이로 알려져 있습니다.")),
  sides: ["거위", "여우"],
  startWord: "판 앞에 앉기",
};
