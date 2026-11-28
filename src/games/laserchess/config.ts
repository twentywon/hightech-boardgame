import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { chooseMove } from "./ai";
import { cellAt } from "./layout";
import { CELLS, KING, LIMIT, SETUPS, SIDES, TURN_LEFT, TURN_RIGHT, VARIANTS, kindOf, laserChess, setupOf, sideOf, type State } from "./rules";
import { LaserView, METAL_COLORS } from "./view";

export const laserChessConfig: PointConfig<State> = {
  // The computer searches the moves and their shots itself, in a fixed time a level.
  game: { ...laserChess, choose: (state, level, random) => chooseMove(state, level, random) },
  view: (host, quality, _variant, mode) => new LaserView(host, quality, mode),
  variants: VARIANTS.map((value) => ({ value, label: SETUPS[value].label })),
  variantLabel: "시작 배치",
  colors: METAL_COLORS,
  // Every piece can always move: only the one picked up is marked.
  showMovable: false,
  // The keyboard walks the squares as the one to move sees them (the table is turned for the gold side at one screen).
  keyPoints: (state) =>
    Array.from({ length: CELLS }, (_, cell) => {
      const p = cellAt(cell);
      return state.turn === 1 ? { x: -p.x, z: -p.z } : p;
    }),
  keyStart: (state) => (state.turn === 1 ? 14 : 65),
  // The two turns are buttons over the piece picked up; these serve the keyboard and readers.
  tools: [
    { label: "왼쪽으로 돌리기 ↺", point: TURN_LEFT, onBoard: true },
    { label: "오른쪽으로 돌리기 ↻", point: TURN_RIGHT, onBoard: true },
  ],
  // A shot that takes a piece is called once the burst is over.
  cheer: (_before, state, mode) => {
    const last = state.last,
      shot = last?.shot;
    if (!last || !shot || shot.end !== "take" || kindOf(shot.taken) === KING) return null;
    if (sideOf(shot.taken) === last.side) return "오발!";
    return mode === "ai" && last.side === 1 ? "피격!" : "명중!";
  },
  cheerOnRest: true,
  // Metal set down on stone; the laser hums, a blocked beam clinks, a piece taken shatters.
  contact: (sound) => sound.tile(5),
  knock: (sound, kind) => sound.laser(kind === "disc" ? "fire" : kind === "pocket" ? "burst" : "block"),
  // Over one Wi-Fi each device plays one side (nothing is hidden and nothing left to chance).
  net: {},
  name: "레이저 체스",
  english: "Laser Chess",
  number: "NO. 83 — BEND THE BEAM",
  intro: `<p>거울과 방패를 옮기고 돌려 레이저를 꺾고, 상대의 왕을 맞히는 두뇌 게임입니다.<br>한 수를 둘 때마다 내 레이저포가 저절로 발사됩니다. 말과 시작 배치는 이 테이블만의 것입니다.</p>`,
  meta: "2인 · 10×8 · 기본 / 공격형",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>BEND THE BEAM</span>`,
  artClass: "morris-art",
  artLabel: "레이저 체스 판 미리보기",
  tableLabel: "THE LASER TABLE",
  tableNote: (variant) => `${setupOf(variant).label} 배치 · 은빛 선공`,
  rulesTitle: "빔을 꺾어 왕을 맞히세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "가로 10칸, 세로 8칸 판에서 <b>은빛</b>과 <b>금빛</b>이 겨룹니다. <b>은빛이 먼저</b> 둡니다. 두 편은 저마다 레이저포 하나, 왕 하나, 반사경 일곱, 이중 반사경 둘, 방패 둘을 가집니다.",
        "내 차례에는 말 하나를 <b>여덟 방향 가운데 한 칸</b> 빈 칸으로 옮기거나, 말 하나를 <b>4분의 1바퀴</b> 돌립니다.",
        "그러고 나면 내 <b>레이저포가 저절로 발사</b>됩니다. 빔은 곧게 나아가다 거울에 맞으면 90° 꺾이고, 막는 것에 닿거나 판 밖으로 나가면 멈춥니다.",
        "빔에 맞아 떨어지는 말은 <b>내 편 말이라도</b> 판에서 빠집니다. 한 번 쏠 때 빠지는 말은 많아야 하나입니다.",
        "<b>왕이 빔에 맞으면</b> 그 편이 집니다. 내 레이저로 내 왕을 맞혀도 집니다.",
        `${LIMIT}수가 지나도록 어느 왕도 맞지 않으면 비깁니다.`,
      ),
    ) +
    part(
      "말",
      table(
        ["레이저포", "판 구석에 고정되어 움직이지 않습니다. 쓸모 있는 두 방향(제 끝 줄을 따라 앞으로, 또는 첫째 줄을 따라 옆으로) 사이로만 돌릴 수 있습니다. 빔에 맞아도 빠지지 않고 빔을 막습니다."],
        ["왕", "꼭대기에 왕관을 얹은 오벨리스크입니다. 어느 쪽에서 맞아도 그 편이 집니다. 돌릴 필요가 없어 옮기기만 합니다."],
        ["반사경", "한쪽 빗면만 거울인 삼각 기둥입니다. 거울 면에 맞은 빔은 90° 꺾이고, 거울이 아닌 두 면에 맞으면 빠집니다."],
        ["이중 반사경", "양면이 모두 거울인 판으로, 어느 쪽에서 맞아도 빔을 꺾고 결코 빠지지 않습니다. 옮기는 대신 옆 칸(대각선 포함)의 <b>반사경이나 방패와 자리를 바꿀</b> 수 있습니다. 어느 편의 말이든 됩니다."],
        ["방패", "검은 앞면에 맞은 빔은 막아 냅니다. 옆면이나 뒷면에 맞으면 빠집니다."],
      ),
    ) +
    part(
      "편마다 정해진 칸",
      table(
        ["은빛 칸", "은빛 쪽에서 보아 오른쪽 끝 줄 전체(은빛 레이저포가 있는 줄)와 은빛 레이저포 바로 왼쪽 칸입니다. 푸르게 물들어 있고, 은빛 말만 들어갈 수 있습니다."],
        ["금빛 칸", "왼쪽 끝 줄 전체와 금빛 레이저포 바로 옆 칸입니다. 붉게 물들어 있고, 금빛 말만 들어갈 수 있습니다."],
        ["자리 바꾸기", "이중 반사경이 자리를 바꿀 때도 두 말이 저마다 들어갈 수 있는 칸이어야 합니다."],
      ),
    ) +
    part(
      "시작 배치",
      table(
        ["기본", "왕이 첫째 줄 가운데에서 방패 둘과 이중 반사경 둘에 둘러싸여 있습니다. 차분하게 길을 여는 배치입니다."],
        ["공격형", "왕은 왼쪽에 물러나 있고, 이중 반사경과 반사경이 판 가운데로 나와 있습니다. 처음부터 빔이 오가는 배치입니다."],
        ["첫 발사", "두 배치 모두 어느 편이든 첫 수의 발사로는 아무것도 맞힐 수 없습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "말을 누르면 갈 수 있는 칸에 점이, 말 위에 돌리는 버튼 ↺ ↻가 나타납니다. 이중 반사경은 자리를 바꿀 수 있는 말에 금색 고리가 뜹니다.",
        "레이저포는 처음에 제 끝 줄을 따라 쏩니다. 그 줄에는 내 말만 설 수 있으니, 그 줄에 반사경을 올려 빔을 상대 진영으로 꺾어 보내 보세요.",
        "수를 두기 전에 빔이 어디로 갈지 따라가 보세요. 내 레이저에 내 말이 맞을 수도 있습니다.",
        "왕 둘레의 방패와 이중 반사경은 빔을 막거나 비켜 보냅니다. 상대가 한 수 만에 내 왕을 맞힐 길이 열려 있지 않은지 늘 살피세요.",
      ),
    ),
  help: "마우스·터치: 말을 누르고, 점이나 ↺ ↻ 버튼을 누릅니다<br>키보드: 방향키·Enter로 말과 칸을 고르고, 돌리기는 Tab으로 버튼을 고릅니다",
  firstNote: "컴퓨터 대전에서는 내가 은빛으로 먼저 둡니다.",
  sides: SIDES,
  startWord: "테이블에 앉기",
};
