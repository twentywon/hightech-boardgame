import { capturing } from "../../ui/banner";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CELLS, GO, PUT, STAGES, hint, marbleDrop, refusal, stageOf, type State } from "./rules";
import { MARBLE_COLORS, MarbleView, marbleKeyPoints } from "./view";

/**
 * A small picture of a stage: the 4 × 4 grid on its turntable seen from above and a little in front, the start with
 * its brass funnel, the target cup with its flag, and a few pieces drawn as stacks of open frames with their painted
 * caps; a stack from the second stage, a beam lying on two columns from the third.
 */
function benchArt(stage: number) {
  const cell = 20,
    x0 = 30,
    y0 = 38,
    rise = 7,
    at = (r: number, c: number, level: number) => [x0 + c * cell, y0 + r * cell - level * rise],
    frame = (x: number, y: number, w: number, paint: string, dark = false) =>
      `<rect x="${x + 1.5}" y="${y + 1.5}" width="${w - 3}" height="${cell - 3}" rx="2" fill="${dark ? "#8a5e40" : "#f7dcb0"}" stroke="${dark ? "#4a2c1c" : "#a47a52"}" stroke-width="1"/><rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="${cell - 10}" fill="#7a5038" opacity="0.55"/>` +
      [
        [x + 1.5, y + 1.5],
        [x + w - 5.5, y + 1.5],
        [x + 1.5, y + cell - 5.5],
        [x + w - 5.5, y + cell - 5.5],
      ]
        .map(([cx, cy]) => `<rect x="${cx}" y="${cy}" width="4" height="4" fill="${paint}"/>`)
        .join(""),
    // [row, column, levels, paint, dark] for each column; beams as [row, first column, length, level, paint].
    scenes: { columns: [number, number, number, string, boolean][]; beams: [number, number, number, number, string][]; start: [number, number, number]; goal: [number, number] }[] = [
      { columns: [[1, 2, 2, "#f2c230", false], [2, 2, 1, "#3b86d8", true]], beams: [], start: [0, 1, 3], goal: [3, 2] },
      { columns: [[1, 1, 2, "#4caf5a", false], [1, 2, 3, "#8a5ccc", false], [2, 2, 1, "#3b86d8", true]], beams: [], start: [0, 0, 4], goal: [3, 3] },
      { columns: [[1, 1, 3, "#f2c230", true], [1, 3, 3, "#4caf5a", false], [2, 3, 1, "#ee8a2a", false]], beams: [[1, 1, 3, 3, "#e05fa0"]], start: [0, 0, 4], goal: [3, 1] },
      { columns: [[1, 0, 3, "#18a5a5", true], [1, 2, 3, "#8a5ccc", false], [2, 2, 2, "#f2c230", false], [2, 3, 1, "#3b86d8", false]], beams: [[1, 0, 3, 3, "#ee8a2a"]], start: [0, 3, 4], goal: [3, 0] },
    ],
    scene = scenes[stage - 1];
  let grid = "";
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const [x, y] = at(r, c, 0);
      grid += `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="2" fill="#f2dcbc"/>`;
    }
  // Far rows first, lower levels first, so that nearer and higher frames are drawn over them.
  const things: { r: number; level: number; svg: string }[] = [];
  for (const [r, c, levels, paint, dark] of scene.columns)
    for (let l = 0; l < levels; l++) {
      const [x, y] = at(r, c, l);
      things.push({ r, level: l, svg: frame(x, y, cell, paint, dark) });
    }
  for (const [r, c, length, level, paint] of scene.beams) {
    const [x, y] = at(r, c, level);
    things.push({ r, level, svg: frame(x, y, cell * length, paint) });
  }
  const [sr, sc, sl] = scene.start;
  for (let l = 0; l < sl; l++) {
    const [x, y] = at(sr, sc, l);
    things.push({ r: sr, level: l, svg: frame(x, y, cell, "#177e7c", true) });
  }
  const [fx, fy] = at(sr, sc, sl - 1);
  things.push({ r: sr, level: sl, svg: `<ellipse cx="${fx + cell / 2}" cy="${fy + cell / 2 - 2}" rx="9" ry="6.5" fill="#d9a845" stroke="#8a6420" stroke-width="1"/><ellipse cx="${fx + cell / 2}" cy="${fy + cell / 2 - 2}" rx="3.5" ry="2.5" fill="#1a120c"/>` });
  const [gx, gy] = at(scene.goal[0], scene.goal[1], 0);
  things.push({ r: scene.goal[0], level: 0, svg: `<circle cx="${gx + cell / 2}" cy="${gy + cell / 2}" r="7.5" fill="#d9a845"/><circle cx="${gx + cell / 2}" cy="${gy + cell / 2}" r="5.2" fill="#2a6a3b"/><path d="M${gx + cell - 5} ${gy + cell / 2} v-17 h9 v6 h-9" fill="#fbfaf5" stroke="#1d1d22" stroke-width="1"/>` });
  things.sort((a, b) => a.r - b.r || a.level - b.level);
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#a8784e"/><circle cx="70" cy="${y0 + 2 * cell}" r="56" fill="#c58e5a" stroke="#d9a845" stroke-width="2"/><rect x="${x0 - 3}" y="${y0 - 3}" width="${4 * cell + 6}" height="${4 * cell + 6}" rx="3" fill="#6e4329"/>${grid}${things.map((t) => t.svg).join("")}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told in words.
  NOTES = ["부품 두 개", "부품 세 개 · 쌓기", "부품 서너 개 · 다리", "부품 네다섯 개 · 다리"];
export const marbleDropConfig: PointConfig<State> = {
  game: marbleDrop,
  // A wooden piece set down on the board; the marble knocks on what it lands on, strikes a wall, or drops into the cup.
  contact: (sound) => sound.wood(4),
  knock: (sound, kind) => (kind === "cushion" ? sound.knock(2) : kind === "pocket" ? sound.pocket() : sound.marble()),
  solo: true,
  showMovable: false,
  view: (host, quality) => new MarbleView(host, quality),
  colors: MARBLE_COLORS,
  // The keyboard walks the cells as the turntable shows them, then the tray's places.
  keyPoints: marbleKeyPoints,
  keyStart: (state) => state.start.at,
  // A tap on the funnel does the same; the button stays for readers and the keyboard.
  tools: [{ label: "구슬 넣기", point: GO, onBoard: true }],
  refusal: (state, move) => refusal(state, move),
  // Only while a thumbnail is captured: H plays the hint's next move (never the drop), so that the picture can show
  // the answer's stacks and beam built.
  keyMove: (key, state) => {
    if (!capturing() || (key !== "h" && key !== "H")) return null;
    const move = hint(state);
    return move && move.to !== GO ? move : null;
  },
  turnable: true,
  puzzle: {
    hint,
    hintText: (_state, move) =>
      move.to === GO
        ? "힌트 — 모든 부품이 제자리에 있습니다. 금색 고리의 깔때기를 눌러 구슬을 넣으세요."
        : move.to >= PUT
          ? move.from >= 0 && move.from < CELLS && Math.floor((move.to - PUT) / 4) === move.from
            ? "힌트 — 금색 고리의 부품을 금색 그림자처럼 돌려 놓으세요."
            : "힌트 — 금색 고리의 부품을 금색 그림자가 있는 자리에, 그림자처럼 돌려 놓으세요."
          : "힌트 — 금색 고리의 부품을 쟁반으로 되돌리세요. 그 자리에는 다른 부품이 들어갑니다.",
  },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: benchArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "구슬 낙하 미로",
  english: "Marble Drop Maze",
  number: "NO. 80 — LET GRAVITY DO THE REST",
  intro: `<p>장난감 공방의 작업대 위, 돌림판에 새긴 4×4 칸.<br>쟁반의 부품을 세우거나 눕혀 쌓아서, 깔때기에 넣은 구슬이 중력만으로 모든 부품을 지나 도착 컵에 들어가게 하세요. ThinkFun의 'Gravity Maze'와 같은 규칙의 퍼즐이고, 문제는 매번 새로 만들어지며 답은 하나뿐입니다.</p>`,
  meta: "1인 · 4×4 돌림판 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>LET GRAVITY DO THE REST</span>`,
  artClass: "morris-art",
  artLabel: "구슬 낙하 미로 미리보기",
  tableLabel: "THE TOYMAKER'S BENCH",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "구슬이 굴러갈 길을 쌓으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "판에는 처음부터 <b>출발</b>(놋쇠 깔때기를 얹은 기둥)과 <b>도착 컵</b>, 그리고 짙은 색의 <b>고정 부품</b>이 놓여 있습니다. 고정 부품은 움직일 수 없습니다.",
        "판 옆 <b>쟁반의 부품을 모두</b> 판에 놓습니다. 선 부품은 <b>기둥</b>, 누운 부품은 <b>다리</b>이고 자세는 바뀌지 않습니다. 놓은 부품은 누를 때마다 시계 방향으로 돌아갑니다(다리는 놓일 수 있는 방향으로만). 놓을 수 없는 자리에 놓으면 부품이 돌아오고 그 까닭이 위에 나옵니다.",
        "부품은 한 층짜리 <b>칸</b>을 이어 만든 것입니다. 칸에는 경사, 곧은 길, 굽은 길이 들어 있거나 비어 있습니다.",
        "깔때기를 누르면 구슬이 출발의 경사로 떨어져 굴러갑니다. 구슬이 <b>판 위의 모든 부품을 지나</b> 도착 컵에 들어가면 성공입니다.",
        "구슬이 막히거나 떨어지거나 판 밖으로 나가면 실패입니다. 붉은 표시가 그 자리를 알려 줍니다. 무르기로 되돌려 다시 해 보세요.",
      ),
    ) +
    part(
      "칸의 종류",
      table(
        ["경사", "비스듬한 판이 든 칸입니다. 구슬은 <b>위에서만</b> 들어오고, 판이 낮아지는 쪽(놋쇠 테와 흰 화살표가 있는 쪽)으로 같은 층의 옆 칸으로 나갑니다. 옆에서 굴러온 구슬에게는 벽입니다."],
        ["곧은 길", "낮은 벽 두 줄 사이로 바닥이 곧게 난 칸입니다. 열린 한쪽으로 들어온 구슬은 맞은편으로 같은 층 그대로 나갑니다."],
        ["굽은 길", "벽이 직각으로 굽은 칸입니다. 열린 한쪽으로 들어온 구슬은 꺾여서 다른 열린 쪽으로 나갑니다."],
        ["빈 칸", "틀만 있는 칸입니다. 위의 것을 받쳐 줄 뿐 구슬에게는 빈 공간이라, 옆에서 굴러 들어오거나 위에서 떨어진 구슬은 그대로 아래로 떨어집니다."],
        ["출발", "놋쇠 깔때기를 얹은 고정 기둥입니다. 맨 위 칸이 경사이고, 구슬은 여기서 출발합니다."],
        ["도착 컵", "판 바닥에 놓인 펠트 컵입니다. 바닥 층에서 옆으로 굴러오거나, 한 층 위에서 떨어진 구슬을 받습니다."],
      ),
    ) +
    part(
      "쌓는 규칙",
      table(
        ["쌓기", "기둥은 판 위나 다른 기둥 위에 놓습니다. 끌어다 놓으면 그 칸 맨 위에 얹힙니다. 한 칸에는 <b>세 개까지만</b> 쌓을 수 있습니다."],
        ["다리", "다리는 그 밑의 기둥이 끝나는 높이에 눕습니다. <b>높이가 같은 기둥 두 개 이상</b>에 걸쳐야 하고, 나머지는 허공에 떠도 됩니다."],
        ["판 가장자리", "다리는 판 밖으로 삐져나갈 수 없습니다."],
        ["다리 위", "다리 위에는 기둥도 다리도 놓을 수 없습니다."],
        ["출발과 도착", "출발과 도착 컵이 있는 칸에는 위에도, 그 위 허공에도 아무것도 놓을 수 없습니다."],
        ["들기", "들 수 있는 것은 그 칸 맨 위의 부품과 다리뿐입니다. 다리나 다른 기둥이 얹힌 기둥은 들 수 없습니다."],
      ),
    ) +
    part(
      "구슬 규칙",
      table(
        ["한 층씩", "구슬은 한 번에 <b>한 층</b>만 떨어집니다. 떨어진 바로 아래 칸이 경사여야 하고, 비어 있으면 실패입니다."],
        ["평평한 곳 금지", "구슬은 곧은 길이나 굽은 길 <b>위로 떨어질 수 없습니다</b>. 그 위로는 옆에서 굴러 들어가야 합니다."],
        ["수평 한 칸", "경사를 내려온 구슬은 곧은 길이나 굽은 길을 <b>한 칸만</b> 지날 수 있습니다. 그다음에는 경사로 떨어지거나 도착 컵에 들어가야 합니다. 두 칸째에서 힘을 잃고 멈춥니다."],
        ["모두 지나기", "구슬이 지나가지 않은 부품이 하나라도 있으면 컵에 들어가도 성공이 아닙니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "출발의 경사가 향한 쪽부터 구슬이 갈 길을 한 칸씩 따라가 보세요. 구슬은 내려가기만 하고, 경사를 하나 지날 때마다 한 층씩 낮아집니다.",
        "경사 칸의 흰 화살표가 구슬이 나가는 쪽입니다. 놓은 부품을 눌러 돌리며 맞추세요.",
        "판의 빈 곳을 끌면 돌림판이 돌아가 탑의 뒤쪽을 볼 수 있습니다. 시점 전환을 누르면 처음 방향으로 돌아옵니다.",
        "힌트는 놓을 부품에 금색 고리를, 놓을 자리에 금색 그림자를 보여 줍니다. 받침이 되는 아래 부품부터 알려 줍니다.",
      ),
    ),
  help: "마우스·터치: 쟁반의 부품을 판으로 끌어다 놓고, 놓은 부품을 누르면 돌아갑니다. 판 밖으로 끌어내면 쟁반으로 돌아가고, 빈 곳을 끌면 돌림판이 돌아갑니다. 깔때기를 누르면 구슬이 들어갑니다<br>키보드: 방향키로 고르고 Enter, 같은 부품에서 한 번 더 Enter로 돌리기, 출발에서 Enter로 구슬 넣기",
  sides: ["나", ""],
  startWord: "공방으로 가기",
};
