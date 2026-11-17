import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { plotAt, trayAt } from "./layout";
import { GO, PUT, STAGES, hint, marbleDrop, stageOf, type State } from "./rules";
import { MARBLE_COLORS, MarbleView } from "./view";

/**
 * A small picture of a stage, seen from above: the board of its size on the bench, the start tower with its funnel,
 * a few towers with their coloured bands and spouts, a trough's groove, a dark pillar, the goal cup with its flag,
 * and the marble's way dotted between them.
 */
function benchArt(stage: number) {
  const { size } = STAGES[stage - 1],
    span = 96,
    cell = span / size,
    x0 = 22,
    centre = (r: number, c: number) => [x0 + (c + 0.5) * cell, x0 + (r + 0.5) * cell],
    w = cell * 0.74,
    // A fixed way for each size: [row, column] from the start to the goal.
    ways = [
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [1, 2],
        [2, 2],
        [3, 2],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
        [1, 2],
        [2, 2],
        [2, 3],
        [3, 3],
      ],
      [
        [0, 4],
        [1, 4],
        [1, 3],
        [2, 3],
        [2, 2],
        [3, 2],
        [3, 1],
        [4, 1],
      ],
      [
        [0, 1],
        [1, 1],
        [1, 2],
        [1, 3],
        [2, 3],
        [3, 3],
        [3, 4],
        [4, 4],
        [5, 4],
      ],
    ][stage - 1],
    bands = ["#f2c230", "#4caf5a", "#3b86d8", "#8a5ccc"];
  let plots = "";
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) {
      const [x, y] = centre(r, c);
      plots += `<rect x="${x - cell * 0.44}" y="${y - cell * 0.44}" width="${cell * 0.88}" height="${cell * 0.88}" rx="2" fill="#efd8b6"/>`;
    }
  const dots = ways.map(([r, c]) => centre(r, c).join(",")).join(" ");
  let things = "";
  ways.forEach(([r, c], i) => {
    const [x, y] = centre(r, c),
      h = w / 2;
    if (i === 0) {
      // The start tower: striped, a brass funnel, its spout toward the next plot.
      const [nr, nc] = ways[1],
        [dx, dy] = [nc - c, nr - r];
      things += `<rect x="${x + dx * h - 2.2 + (dx ? dx * 2 : 0)}" y="${y + dy * h - 2.2 + (dy ? dy * 2 : 0)}" width="4.4" height="4.4" fill="#d9a845"/><rect x="${x - h}" y="${y - h}" width="${w}" height="${w}" rx="3" fill="#177e7c" stroke="#f5ecd6" stroke-width="2"/><circle cx="${x}" cy="${y}" r="${w * 0.42}" fill="#d9a845"/><circle cx="${x}" cy="${y}" r="${w * 0.16}" fill="#1a120c"/>`;
    } else if (i === ways.length - 1) {
      things += `<circle cx="${x}" cy="${y}" r="${w * 0.48}" fill="#6e4a30"/><circle cx="${x}" cy="${y}" r="${w * 0.34}" fill="#2a6a3b"/><circle cx="${x}" cy="${y}" r="${w * 0.19}" fill="#cfe6ff" stroke="#1f57c8" stroke-width="1.5"/><path d="M${x + w * 0.42} ${y + w * 0.1} v-${w * 0.8} h${w * 0.48} v${w * 0.3} h-${w * 0.48}" fill="#fbfaf5" stroke="#1d1d22" stroke-width="1"/>`;
    } else {
      const band = bands[(i * 3 + stage) % bands.length],
        [pr, pc] = ways[i - 1],
        [nr, nc] = ways[i + 1],
        into = [c - pc, r - pr],
        out = [nc - c, nr - r];
      things += `<rect x="${x - h}" y="${y - h}" width="${w}" height="${w}" rx="3" fill="#f6dcb4" stroke="${band}" stroke-width="2.4"/>`;
      if (i % 2) {
        // A drop tower: the dark hole in its brass rim, and its spout.
        things += `<rect x="${x + out[0] * (h + 1.5) - 2.2}" y="${y + out[1] * (h + 1.5) - 2.2}" width="4.4" height="4.4" fill="#d9a845"/><circle cx="${x}" cy="${y}" r="${w * 0.25}" fill="#1a120c" stroke="#d9a845" stroke-width="1.8"/>`;
      } else {
        // A trough: its groove from the side the marble comes in by to the side it leaves by.
        const ax = x - into[0] * h,
          ay = y - into[1] * h,
          bx = x + out[0] * h,
          by = y + out[1] * h;
        things += `<path d="M${ax} ${ay} Q${x} ${y} ${bx} ${by}" fill="none" stroke="#5a3a26" stroke-width="${w * 0.3}"/>`;
      }
    }
  });
  const [br, bc] = [size - 1, 0],
    [bx, by] = centre(br, bc);
  things += `<rect x="${bx - w * 0.43}" y="${by - w * 0.43}" width="${w * 0.86}" height="${w * 0.86}" rx="4" fill="#3b2f2a"/>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#a8784e"/><rect x="${x0 - 6}" y="${x0 - 6}" width="${span + 12}" height="${span + 12}" rx="6" fill="#d9ae80"/>${plots}<polyline points="${dots}" fill="none" stroke="#1f57c8" stroke-width="2.4" stroke-dasharray="0.5 4.5" stroke-linecap="round"/>${things}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told in words.
  NOTES = ["4×4 · 부품 두 개", "5×5 · 부품 세 개", "5×5 · 부품 네 개", "6×6 · 부품 다섯 개"];
export const marbleDropConfig: PointConfig<State> = {
  game: marbleDrop,
  // A wooden tower set down on the board; the marble knocks on what it lands on, strikes a wall, or drops into the cup.
  contact: (sound) => sound.wood(4),
  knock: (sound, kind) => (kind === "cushion" ? sound.knock(2) : kind === "pocket" ? sound.pocket() : sound.marble()),
  solo: true,
  showMovable: false,
  view: (host, quality) => new MarbleView(host, quality),
  colors: MARBLE_COLORS,
  // The keyboard walks the plots and then the tray's places, as they lie on the bench (the tray before the board, or
  // beside it on a wide screen).
  keyPoints: (state) => {
    const host = typeof document === "undefined" ? null : document.getElementById("board"),
      aspect = host?.clientHeight ? host.clientWidth / host.clientHeight : 1;
    return [
      ...Array.from({ length: state.size * state.size }, (_, i) => plotAt(state.size, i, aspect)),
      ...state.tray.map((_, j) => trayAt(state.size, state.tray.length, j, aspect)),
    ];
  },
  keyStart: (state) => state.start.at,
  // A tap on the funnel does the same; the button stays for readers and the keyboard.
  tools: [{ label: "구슬 넣기", point: GO, onBoard: true }],
  puzzle: {
    hint,
    hintText: (_state, move) =>
      move.to === GO
        ? "힌트 — 길이 다 이어졌습니다. 금색 고리의 깔때기를 눌러 구슬을 넣으세요."
        : move.to >= PUT && move.from === Math.floor((move.to - PUT) / 4)
          ? "힌트 — 금색 고리의 부품을 금색 그림자처럼 돌려 놓으세요."
          : move.to >= PUT
            ? "힌트 — 금색 고리의 부품을 금색 그림자가 있는 자리에, 그림자처럼 돌려 놓으세요."
            : "힌트 — 금색 고리의 부품을 판 앞의 쟁반으로 되돌리세요.",
  },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: benchArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "구슬 낙하 미로",
  english: "Marble Drop Maze",
  number: "NO. 80 — LET GRAVITY DO THE REST",
  intro: `<p>장난감 공방의 작업대 위, 나무 탑과 물길이 선 판.<br>쟁반의 부품을 판에 놓고 돌려서, 출발탑에 넣은 구슬이 중력만으로 모든 부품을 지나 도착 컵에 들어가게 하세요. ThinkFun의 'Gravity Maze' 같은 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 4×4부터 6×6 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>LET GRAVITY DO THE REST</span>`,
  artClass: "morris-art",
  artLabel: "구슬 낙하 미로 미리보기",
  tableLabel: "THE TOYMAKER'S BENCH",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "구슬이 굴러갈 길을 이으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "판 앞 <b>쟁반의 부품</b>을 모두 판의 빈자리에 놓습니다. 놓은 부품은 누를 때마다 시계 방향으로 <b>한 번씩 돌아가고</b>, 다른 자리로 옮기거나 쟁반으로 되돌릴 수 있습니다.",
        "부품의 높이는 <b>층</b>으로 셉니다. 나무 층 하나가 한 층이고, 띠의 색으로도 높이를 알 수 있습니다(노랑 1층, 초록 2층, 파랑 3층, 보라 4층).",
        "길이 이어졌다 싶으면 <b>출발탑의 깔때기</b>를 누릅니다. 구슬은 중력만으로 굴러가, 빠져나온 높이보다 <b>높지 않은</b> 옆자리 부품으로만 들어갑니다.",
        "구슬이 <b>쟁반의 부품을 모두 지나</b> 도착 컵에 들어가면 성공입니다.",
        "구슬이 판 밖이나 빈자리로 떨어지거나, 더 높은 부품의 벽이나 막힌 기둥에 부딪히거나, 지나온 자리로 되돌아오면 실패입니다. 무르기로 되돌려 다시 해 보세요.",
      ),
    ) +
    part(
      "판의 부품",
      table(
        ["출발탑", "줄무늬로 칠한 가장 높은 탑입니다. 꼭대기 깔때기에 넣은 구슬은 맨 위층 옆의 놋쇠 관으로 나옵니다. 움직이거나 돌릴 수 없습니다."],
        ["낙하탑", "꼭대기에 구멍이 뚫린 탑입니다. 구슬이 탑의 높이 이상에서 오면 구멍으로 떨어져, 맨 위층 옆의 <b>놋쇠 관</b>으로 한 층 낮게 나옵니다. 관이 향한 쪽으로 갑니다."],
        ["곧은 물길", "꼭대기에 홈이 곧게 파인 탑입니다. 홈이 열린 쪽에서 구슬이 오면 홈을 따라 굴러 맞은편으로 같은 높이 그대로 나갑니다."],
        ["굽은 물길", "홈이 직각으로 꺾인 탑입니다. 한쪽 입구로 들어온 구슬은 꺾여서 옆 입구로 나갑니다."],
        ["막힌 기둥", "구멍도 홈도 없는 짙은 기둥입니다. 구슬이 닿으면 거기서 멈춥니다."],
        ["도착 컵", "판에 묻힌, 펠트를 깐 컵입니다. 깃발이 꽂혀 있고, 구슬이 어느 높이에서 와도 들어갑니다."],
        ["고정된 것", "짙은 받침 위에 선 것은 처음부터 놓여 있는 것입니다. 움직이거나 돌릴 수 없습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "출발탑의 관에서 시작해 구슬이 갈 길을 한 칸씩 따라가 보세요. 빈자리를 만나면 그곳에 맞는 부품이 쟁반에 있습니다.",
        "구슬은 내려가기만 합니다. 낙하탑을 지날 때마다 한 층씩 낮아지고, 물길은 높이를 그대로 지킵니다.",
        "관과 홈의 방향은 부품을 눌러 돌리며 맞추세요. 금색 고리의 힌트는 놓을 자리와 방향을 금색 그림자로 보여 줍니다.",
      ),
    ),
  help: "마우스·터치: 쟁반의 부품을 판의 빈자리로 끌어다 놓고, 놓은 부품을 누르면 돌아갑니다. 판 밖으로 끌어내면 쟁반으로 돌아가고, 깔때기를 누르면 구슬이 들어갑니다<br>키보드: 방향키로 고르고 Enter, 같은 부품에서 한 번 더 Enter로 돌리기, 출발탑에서 Enter로 구슬 넣기",
  sides: ["나", ""],
  startWord: "공방으로 가기",
};
