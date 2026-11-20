import { capturing } from "../../ui/banner";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CELLS, GO, KIT, PUT, STAGES, hint, marbleDrop, postureOf, putOf, refusal, stageOf, voxelsOf, type State } from "./rules";
import { funnelLevel } from "./layout";
import { MARBLE_COLORS, MarbleView, marbleKeyPoints } from "./view";

/**
 * A small picture of a stage: the 4 × 4 grid on its turntable seen from above and a little in front, the start with
 * its brass funnel, the target cup with its flag, and a few towers drawn as stacks of open frames with their painted
 * caps; a stack from the second stage, a tower lying on two others from the third.
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
      {
        columns: [
          [1, 2, 2, "#e9a521", false],
          [2, 2, 1, "#3a68c9", true],
        ],
        beams: [],
        start: [0, 1, 3],
        goal: [3, 2],
      },
      {
        columns: [
          [1, 1, 2, "#86b324", false],
          [1, 2, 3, "#7a4fae", false],
          [2, 2, 1, "#3a68c9", true],
        ],
        beams: [],
        start: [0, 0, 4],
        goal: [3, 3],
      },
      {
        columns: [
          [1, 1, 3, "#e9a521", true],
          [1, 3, 3, "#86b324", false],
          [2, 3, 1, "#d65a9a", false],
        ],
        beams: [[1, 1, 3, 3, "#d65a9a"]],
        start: [0, 0, 4],
        goal: [3, 1],
      },
      {
        columns: [
          [1, 0, 3, "#169a94", true],
          [1, 2, 3, "#7a4fae", false],
          [2, 2, 2, "#e9a521", false],
          [2, 3, 1, "#3a68c9", false],
        ],
        beams: [[1, 0, 3, 3, "#d65a9a"]],
        start: [0, 3, 4],
        goal: [3, 0],
      },
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
  things.push({
    r: sr,
    level: sl,
    svg: `<ellipse cx="${fx + cell / 2}" cy="${fy + cell / 2 - 2}" rx="9" ry="6.5" fill="#d9a845" stroke="#8a6420" stroke-width="1"/><ellipse cx="${fx + cell / 2}" cy="${fy + cell / 2 - 2}" rx="3.5" ry="2.5" fill="#1a120c"/>`,
  });
  const [gx, gy] = at(scene.goal[0], scene.goal[1], 0);
  things.push({
    r: scene.goal[0],
    level: 0,
    svg: `<circle cx="${gx + cell / 2}" cy="${gy + cell / 2}" r="7.5" fill="#d9a845"/><circle cx="${gx + cell / 2}" cy="${gy + cell / 2}" r="5.2" fill="#2a6a3b"/><path d="M${gx + cell - 5} ${gy + cell / 2} v-17 h9 v6 h-9" fill="#fbfaf5" stroke="#1d1d22" stroke-width="1"/>`,
  });
  things.sort((a, b) => a.r - b.r || a.level - b.level);
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#a8784e"/><circle cx="70" cy="${y0 + 2 * cell}" r="56" fill="#c58e5a" stroke="#d9a845" stroke-width="2"/><rect x="${x0 - 3}" y="${y0 - 3}" width="${4 * cell + 6}" height="${4 * cell + 6}" rx="3" fill="#6e4329"/>${grid}${things.map((t) => t.svg).join("")}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told in words.
  NOTES = ["탑 두 개", "탑 세 개 · 쌓기", "탑 서너 개 · 눕히기·거꾸로", "탑 네 개 · 눕히기"],
  /** The colours of the caps, as the guide names them. */
  COLOURS = ["청록", "분홍", "연두", "파랑", "노랑", "보라"];
const esc = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
/**
 * The challenge card, our own: the grid seen from above with the fixed towers (each in its cap's colour, its height
 * in storeys written on it, an ivory notch on the side its peg faces), the start's funnel and the target's flag; and
 * under it the towers to add, by their caps' colours and letters: a square stands, a square with a notch at its foot
 * stands on its head, a long bar lies.
 */
export function challengeCard(state: State) {
  const cell = 26,
    x0 = 14,
    y0 = 30,
    width = x0 * 2 + cell * 4,
    rows = Math.ceil(state.tray.length / 4),
    height = y0 + cell * 4 + 30 + rows * 34 + 8,
    at = (c: number) => ({ x: x0 + (c % 4) * cell, y: y0 + Math.floor(c / 4) * cell }),
    notch = (x: number, y: number, dir: number, size: number) => {
      const cx = x + size / 2,
        cy = y + size / 2,
        d = [
          [0, -1],
          [1, 0],
          [0, 1],
          [-1, 0],
        ][dir];
      return `<circle cx="${cx + (d[0] * size) / 2.6}" cy="${cy + (d[1] * size) / 2.6}" r="2.3" fill="#fbf6e6" stroke="#5a3a24" stroke-width="0.6"/>`;
    };
  let svg = `<rect x="1" y="1" width="${width - 2}" height="${height - 2}" rx="10" fill="#fbf3e0" stroke="#a47a52" stroke-width="1.5"/><text x="${width / 2}" y="19" text-anchor="middle" font-size="11" font-weight="700" fill="#5a3a24">도전 카드</text>`;
  for (let c = 0; c < 16; c++) {
    const { x, y } = at(c);
    svg += `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="3" fill="#ead2ad"/>`;
  }
  // The fixed towers seen from above: the highest in each cell, its stack's height written on it.
  const heights = new Map<number, number>(),
    top = new Map<number, number>();
  state.given.forEach((t, g) => {
    for (const v of voxelsOf(t))
      if ((heights.get(v.cell) ?? 0) <= v.level) {
        heights.set(v.cell, v.level + 1);
        top.set(v.cell, g);
      }
  });
  state.given.forEach((t, g) => {
    const cells = voxelsOf(t)
      .map((v) => v.cell)
      .filter((c) => top.get(c) === g);
    if (!cells.length) return;
    const paint = KIT[t.kind].paint;
    if (t.lying) {
      const xs = cells.map((c) => at(c).x),
        ys = cells.map((c) => at(c).y),
        lx = Math.min(...xs) + 4,
        ly = Math.min(...ys) + 7,
        w = Math.max(...xs) - Math.min(...xs) + cell - 8,
        h = Math.max(...ys) - Math.min(...ys) + cell - 14;
      svg += `<rect x="${lx}" y="${ly}" width="${w}" height="${h}" rx="4" fill="${paint}" stroke="#3a2616" stroke-width="1"/>`;
    } else
      for (const c of cells) {
        const { x, y } = at(c);
        svg += `<rect x="${x + 4}" y="${y + 4}" width="${cell - 8}" height="${cell - 8}" rx="3" fill="${paint}" stroke="#3a2616" stroke-width="1"/>${notch(x + 4, y + 4, (t.inverted ? (t.yaw + 2) % 4 : t.yaw) % 4, cell - 8)}${t.inverted ? `<path d="M${x + cell / 2 - 3} ${y + cell - 7} h6 l-3 3z" fill="#fbf6e6"/>` : ""}<text x="${x + cell / 2}" y="${y + cell / 2 + 4}" text-anchor="middle" font-size="10" font-weight="800" fill="#fff">${heights.get(c)}</text>`;
      }
  });
  const s = at(state.start),
    g = at(state.goal),
    funnelTop = funnelLevel(state);
  svg += `<circle cx="${s.x + cell / 2}" cy="${s.y + cell / 2}" r="7" fill="#d9a845" stroke="#8a6420" stroke-width="1.2"/><circle cx="${s.x + cell / 2}" cy="${s.y + cell / 2}" r="2.6" fill="#1a120c"/><text x="${s.x + cell - 3}" y="${s.y + 9}" text-anchor="end" font-size="8" font-weight="800" fill="#5a3a24">${funnelTop}</text>`;
  svg += `<circle cx="${g.x + cell / 2}" cy="${g.y + cell / 2}" r="8" fill="#d9a845"/><circle cx="${g.x + cell / 2}" cy="${g.y + cell / 2}" r="5.5" fill="#2a6a3b"/><path d="M${g.x + cell - 6} ${g.y + cell / 2 + 2} v-13 h7 v5 h-7" fill="#fbfaf5" stroke="#1d1d22" stroke-width="0.8"/>`;
  // The towers to add.
  const ty = y0 + cell * 4 + 14;
  svg += `<text x="${x0}" y="${ty + 6}" font-size="9.5" font-weight="700" fill="#5a3a24">놓을 탑</text>`;
  state.tray.forEach((t, j) => {
    const col = j % 4,
      row = Math.floor(j / 4),
      cx = x0 + col * cell + cell / 2,
      cy = ty + 26 + row * 34,
      paint = KIT[t.kind].paint,
      letter = KIT[t.kind].id;
    if (t.lying) svg += `<rect x="${cx - 12}" y="${cy - 5}" width="24" height="10" rx="3" fill="${paint}" stroke="#3a2616" stroke-width="1"/>`;
    else
      svg += `<rect x="${cx - 9}" y="${cy - 9}" width="18" height="18" rx="3" fill="${paint}" stroke="#3a2616" stroke-width="1"/>${t.inverted ? `<path d="M${cx - 4} ${cy + 4} h8 l-4 4z" fill="#fbf6e6"/>` : ""}`;
    svg += `<text x="${cx}" y="${cy + 3.5}" text-anchor="middle" font-size="9" font-weight="800" fill="#fff">${letter}</text><text x="${cx}" y="${cy + (t.lying ? 16 : 20)}" text-anchor="middle" font-size="7.5" fill="#5a3a24">${["서기", "거꾸로", "눕기"][postureOf(t)]}</text>`;
  });
  const words = `도전 카드: 놓을 탑 ${state.tray.map((t) => `${KIT[t.kind].id}(${["세워서", "거꾸로 세워서", "눕혀서"][postureOf(t)]})`).join(", ")}`;
  return `<figure class="md-card" style="margin:0;display:flex;justify-content:center"><svg viewBox="0 0 ${width} ${height}" width="${width * 1.35}" height="${height * 1.35}" role="img" aria-label="${esc(words)}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">${svg}</svg></figure>`;
}
/** A tower's levels in words, bottom to top, with the ways as seen from above with its ivory peg at the top. */
function towerWords(kind: number) {
  const side = ["위", "오른쪽", "아래", "왼쪽"];
  return KIT[kind].units
    .map((u) =>
      u.kind === 1
        ? `경사(${side[u.face]})`
        : u.kind === 2
          ? `곧은 길(${side[u.face % 2]}–${side[(u.face % 2) + 2]})`
          : u.kind === 3
            ? `굽은 길(${side[u.face]}–${side[(u.face + 1) % 4]})`
            : u.kind === 4
              ? "십자 길"
              : u.kind === 5
                ? "매달린 십자 길"
                : "빈 칸",
    )
    .join(" · ");
}
export const marbleDropConfig: PointConfig<State> = {
  game: marbleDrop,
  // A wooden tower set down on the board; the marble knocks on what it lands on, strikes a wall, or drops into the cup.
  contact: (sound) => sound.wood(4),
  knock: (sound, kind) => (kind === "cushion" ? sound.knock(2) : kind === "pocket" ? sound.pocket() : sound.marble()),
  solo: true,
  showMovable: false,
  view: (host, quality) => new MarbleView(host, quality),
  colors: MARBLE_COLORS,
  keyPoints: marbleKeyPoints,
  keyStart: (state) => state.start,
  // A tap on the funnel does the same; the button stays for readers and the keyboard.
  tools: [{ label: "구슬 넣기", point: GO, onBoard: true }],
  refusal: (state, move) => refusal(state, move),
  // Only while a thumbnail is captured: H plays the hint's next move (never the drop), so that the picture can show
  // the answer's stacks and lying tower built.
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
        ? "힌트 — 모든 탑이 제자리에 있습니다. 금색 고리의 깔때기를 눌러 구슬을 넣으세요."
        : move.to >= PUT
          ? move.from >= 0 && move.from < CELLS && putOf(move.to).cell === move.from
            ? "힌트 — 금색 고리의 탑을 금색 그림자처럼 돌려 놓으세요."
            : "힌트 — 금색 고리의 탑을 금색 그림자가 있는 자리에, 그림자처럼 돌려 놓으세요."
          : "힌트 — 금색 고리의 탑을 쟁반으로 되돌리세요. 그 자리에는 다른 탑이 들어갑니다.",
  },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: benchArt(i + 1) })),
  // The challenge card stands in the panel.
  tallyHtml: (state) => [challengeCard(state), ""],
  name: "구슬 낙하 미로",
  english: "Marble Drop Maze",
  number: "NO. 80 — LET GRAVITY DO THE REST",
  intro: `<p>장난감 공방의 작업대 위, 돌림판에 새긴 4×4 칸.<br>늘 같은 아홉 개의 탑으로, 도전 카드가 말하는 탑을 세우거나 거꾸로 세우거나 눕혀 놓아서, 깔때기에 넣은 구슬이 중력만으로 도착 컵에 들어가게 하세요. 어느 탑을, 어디에, 어느 쪽으로 돌려 놓느냐가 퍼즐입니다. ThinkFun의 'Gravity Maze'와 같은 규칙의 퍼즐이고, 문제는 매번 새로 만들어지며 답은 하나뿐입니다.</p>`,
  meta: "1인 · 4×4 돌림판 · 탑 아홉 개 · 문제는 무작위",
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
        "판에는 처음부터 <b>출발</b>(놋쇠 깔때기를 얹은 탑)과 <b>도착 컵</b>, 그리고 짙은 색의 <b>고정 탑</b>이 놓여 있습니다. 고정 탑은 움직일 수 없습니다.",
        "<b>도전 카드</b>에 그려진 <b>놓을 탑을 모두</b> 쟁반에서 판으로 끌어다 놓습니다. 네모는 세워서, 아래에 흰 홈이 있는 네모는 거꾸로 세워서, 긴 막대는 눕혀서 놓는 탑이고, 그 자세는 바뀌지 않습니다.",
        "놓은 탑은 누를 때마다 시계 방향으로 한 번씩 돌아갑니다(누운 탑은 놓일 수 있는 방향으로만). 탑마다 경사가 정해진 방향을 향하고 있어서, 탑을 돌리면 모든 층의 출구가 함께 돌아갑니다. <b>어느 탑을, 어디에, 어느 쪽으로</b> 놓느냐가 퍼즐입니다.",
        "깔때기를 누르면 구슬이 출발 탑 맨 위로 떨어져 굴러갑니다. 구슬이 <b>도착 컵</b>에 들어가면 성공입니다. 놓은 탑을 구슬이 모두 지나가지 않아도 됩니다.",
        "구슬이 막히거나 너무 깊이 떨어지거나 판 밖으로 나가면 실패입니다. 붉은 표시가 그 자리를 알려 줍니다. 무르기로 되돌려 다시 해 보세요.",
      ),
    ) +
    part(
      "칸의 종류",
      table(
        [
          "경사",
          "비스듬한 호두나무 판이 든 칸입니다. 구슬은 <b>위에서만</b> 들어오고, 판이 낮아지는 쪽으로 나갑니다. 그쪽에는 놋쇠 아치가 서 있고, 판에 새긴 <b>화살표가 출구를 가리킵니다</b>. 나머지 세 옆면은 낮은 벽으로 막혀 있습니다.",
        ],
        ["곧은 길", "바닥에 곧은 홈이 난 칸입니다. 아치가 있는 한쪽으로 들어온 구슬은 맞은편 아치로 나갑니다."],
        ["굽은 길", "바닥의 홈이 직각으로 굽은 칸입니다. 아치가 있는 한쪽으로 들어온 구슬은 꺾여서 다른 아치로 나갑니다."],
        ["십자 길", "네 옆면 모두에 아치가 있는 칸입니다. 어느 쪽으로 들어온 구슬이든 곧장 맞은편으로 나갑니다."],
        ["매달린 십자 길", "십자 길이 칸의 천장에 거꾸로 매달려 있습니다. 바로 선 탑에서는 바닥이 없어 빈 칸과 같고, 탑을 <b>거꾸로 세우면</b> 바닥이 되어 십자 길로 쓰입니다."],
        ["빈 칸", "틀만 있는 칸입니다. 옆에서 들어오거나 위에서 떨어진 구슬은 그대로 아래로 떨어집니다."],
        ["거꾸로 선 탑", "모든 칸이 뒤집힙니다. 경사는 막힌 칸이 되고, 바닥이 위로 간 길은 빈 칸이 되며, 매달린 십자 길만 십자 길이 됩니다."],
        ["누운 탑", "모든 칸이 옆으로 눕습니다. 길은 바닥이 옆을 향해 빈 칸이 되고, 경사는 탑의 끝 쪽에서 들어온 구슬을 옆으로 꺾거나 아래로 떨어뜨리거나 막습니다."],
        ["출발", "놋쇠 깔때기를 얹은 고정 탑입니다. 맨 위 칸이 경사이고, 구슬은 여기서 출발합니다."],
        ["도착 컵", "판 바닥에 놓인 펠트 컵입니다. 바닥 층에서 옆으로 굴러오거나, 한 층 위에서 떨어진 구슬을 받습니다."],
      ),
    ) +
    part(
      "탑 아홉 개",
      table(
        ["방향", "탑마다 뚜껑 한쪽에 <b>상아 못</b>이 박혀 있습니다. 아래에 적은 방향은 그 못이 위쪽에 오게 두고 위에서 내려다볼 때입니다. 어느 문제에서나 탑의 칸은 늘 같습니다."],
        ...KIT.map((k, i): [string, string] => [`${k.id} (${k.units.length}층${k.count > 1 ? ` × ${k.count}` : ""})`, `${COLOURS[i]} 뚜껑. 아래부터 ${towerWords(i)}.`]),
      ),
    ) +
    part(
      "쌓는 규칙",
      table(
        ["쌓기", "선 탑은 판 위나 다른 선 탑 위에 놓습니다. 끌어다 놓으면 그 칸 맨 위에 얹힙니다. 한 칸에는 탑을 <b>세 개까지만</b> 쌓을 수 있습니다."],
        [
          "누운 탑",
          "가운데 칸이 놓은 자리에 오도록, 그 밑의 선 탑이 끝나는 높이에 눕습니다. <b>높이가 같게 끝나는 선 탑 두 개 이상</b>에 걸쳐야 하고, 나머지는 허공에 떠도 됩니다. 판 밖으로 삐져나갈 수 없습니다.",
        ],
        ["누운 탑 위", "누운 탑 위에는 아무것도 놓을 수 없고, 누운 탑을 다른 누운 탑 위에 놓을 수도 없습니다."],
        ["출발과 도착", "출발과 도착 컵이 있는 칸에는 위에도, 그 위 허공에도 아무것도 놓을 수 없습니다."],
        ["들기", "들 수 있는 것은 그 칸 맨 위의 탑과 누운 탑뿐입니다."],
      ),
    ) +
    part(
      "구슬 규칙",
      table(
        ["한 층씩", "구슬은 한 번에 <b>한 층</b>만 떨어집니다. 떨어진 바로 아래 칸이 경사여야 하고, 비어 있으면 실패입니다."],
        ["경사가 아닌 곳", "구슬은 길 위로 <b>떨어질 수 없습니다</b>. 길에는 옆에서 굴러 들어가야 합니다."],
        ["수평 한 칸", "경사를 내려온 구슬은 길을 <b>한 칸만</b> 지날 수 있습니다. 그다음에는 경사로 떨어지거나 도착 컵에 들어가야 합니다."],
        ["막힌 벽", "경사의 옆면, 길의 막힌 쪽, 위로 향한 출구로는 지나갈 수 없습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "출발의 경사가 향한 쪽부터 구슬이 갈 길을 한 칸씩 따라가 보세요. 구슬은 내려가기만 하고, 경사를 하나 지날 때마다 한 층씩 낮아집니다.",
        "경사의 화살표와 놋쇠 아치가 출구입니다. 놓은 탑을 눌러 돌리며 맞추세요.",
        "판의 빈 곳을 끌면 돌림판과 쟁반의 탑이 함께 돌아가 탑의 뒤쪽을 볼 수 있습니다. 시점 전환을 누르면 처음 방향으로 돌아옵니다.",
        "힌트는 놓을 탑에 금색 고리를, 놓을 자리에 금색 그림자를 보여 줍니다. 받침이 되는 아래 탑부터 알려 줍니다.",
      ),
    ),
  help: "마우스·터치: 쟁반의 탑을 판으로 끌어다 놓고, 놓은 탑을 누르면 돌아갑니다. 판 밖으로 끌어내면 쟁반으로 돌아가고, 빈 곳을 끌면 돌림판이 돌아갑니다. 깔때기를 누르면 구슬이 들어갑니다<br>키보드: 방향키로 고르고 Enter, 같은 탑에서 한 번 더 Enter로 돌리기, 출발에서 Enter로 구슬 넣기",
  sides: ["나", ""],
  startWord: "공방으로 가기",
};
