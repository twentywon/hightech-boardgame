import { capturing } from "../../ui/banner";
import { notes, part, steps, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { ARROWS, cableLine, cellAt, outside } from "./layout";
import { E, N, OFF, S, STAGES, W, WHITE, behind, bitCount, boardOf, hint, lightCable, neighbour, refusal, stageOf, trace, type Port, type Post, type State } from "./rules";
import { CABLE_COLORS, LightCableView } from "./view";

/** The colours of the pictures: the light of each cable colour, and the enamel of a coloured post. */
const ART_LIGHT = ["#ffe2a8", "#ff6a56", "#62b0ff", "#6ae598"],
  ART_ENAMEL = ["#e6dfcf", "#c4362c", "#2d6fd2", "#2f9a55"];
/** The pictures of the stages: a board, its start, the way the cable has gone so far, its posts and its exit. */
const PICTURES: { n: number; start: Port; way: string; exit: Port | null; posts: [number, number, number][] }[] = [
  { n: 5, start: { cell: 10, bit: W }, way: "ENEESSWW", exit: null, posts: [[12, 0, 2], [1, 0, 2], [23, 0, 2], [9, 0, 2]] },
  { n: 6, start: { cell: 6, bit: W }, way: "EESSWWSSEE", exit: { cell: 35, bit: E }, posts: [[13, 0, 2], [25, 0, 2], [2, 0, 2], [21, 0, 2], [28, 0, 2]] },
  { n: 7, start: { cell: 21, bit: W }, way: "ENNEESSEESSW", exit: { cell: 48, bit: S }, posts: [[16, 1, 2], [31, 2, 2], [23, 0, 2], [2, 0, 2], [27, 0, 2]] },
  { n: 8, start: { cell: 8, bit: W }, way: "EENEESSSWWSSEEE", exit: { cell: 63, bit: E }, posts: [[11, 1, 2], [35, 2, 2], [19, 0, 2], [36, 0, 2], [1, 0, 2], [50, 0, 2], [54, 2, 2]] },
  { n: 9, start: { cell: 9, bit: W }, way: "EESSWSSEEENNNEE", exit: { cell: 80, bit: S }, posts: [[19, 0, 3], [38, 3, 2], [30, 1, 2], [41, 0, 4], [12, 0, 2], [32, 2, 2], [60, 0, 2]] },
];
const STEP_OF: Record<string, number> = { N, E, S, W };
/**
 * A small picture of a stage, drawn by the rules themselves: the dark board with its scored cells, the reel, the
 * cable as far as it has come (in the colours it took), the posts (lit ones glowing) and the exit socket.
 */
function workshopArt(stage: number) {
  const pic = PICTURES[stage - 1],
    n = pic.n,
    cell = 96 / n,
    at = (x: number, z: number) => [70 + x * cell, 70 + z * cell] as const,
    path = [pic.start.cell];
  for (const ch of pic.way) path.push(neighbour(n, path[path.length - 1], STEP_OF[ch]));
  const posts: Post[] = pic.posts.map(([c, colour, need]) => ({ cell: c, colour, need })),
    board = boardOf(n, stage, posts, pic.start, pic.exit),
    { tints, sides } = trace(board, path),
    f = (v: number) => v.toFixed(1);
  let out = `<rect x="6" y="6" width="128" height="128" rx="12" fill="#5a3e2d"/><rect x="12" y="12" width="116" height="116" rx="7" fill="#2b231e"/>`;
  for (let k = 1; k < n; k++) {
    const [u] = at(-n / 2 + k, 0);
    out += `<path d="M${f(u)} ${f(22)}V${f(118)}M${f(22)} ${f(u)}H${f(118)}" stroke="#14100d" stroke-width="0.9"/>`;
  }
  out += `<rect x="21" y="21" width="98" height="98" fill="none" stroke="#a77b35" stroke-width="1.2"/>`;
  // The reel and the exit socket outside their cells.
  const reel = outside(n, pic.start, 0.42),
    [rx, ry] = at(reel.x, reel.z);
  out += `<circle cx="${f(rx)}" cy="${f(ry)}" r="${f(Math.max(4.5, cell * 0.32))}" fill="#c9973f"/><circle cx="${f(rx)}" cy="${f(ry)}" r="${f(Math.max(3, cell * 0.22))}" fill="#efe6d4"/><circle cx="${f(rx)}" cy="${f(ry)}" r="1.6" fill="#231c18"/>`;
  if (pic.exit) {
    const socket = outside(n, pic.exit, 0.42),
      [sx, sy] = at(socket.x, socket.z),
      w = Math.max(7, cell * 0.55);
    out += `<rect x="${f(sx - w / 2)}" y="${f(sy - w / 2)}" width="${f(w)}" height="${f(w)}" rx="2" fill="#231c18" stroke="#c9973f" stroke-width="1.2"/><circle cx="${f(sx)}" cy="${f(sy)}" r="${f(w * 0.2)}" fill="#0b0908"/>`;
  }
  // The cable in runs of one colour.
  const line = cableLine(n, pic.start, path, tints);
  for (let a = 0; a < line.length - 1; ) {
    const tint = line[a + 1].tint;
    let b = a + 1;
    while (b + 1 < line.length && line[b + 1].tint === tint) b++;
    const d = line
      .slice(a, b + 1)
      .map((p, i) => `${i ? "L" : "M"}${f(at(p.x, p.z)[0])} ${f(at(p.x, p.z)[1])}`)
      .join("");
    out += `<path d="${d}" fill="none" stroke="${ART_LIGHT[tint]}" stroke-width="${f(Math.max(2.2, cell * 0.16))}" stroke-linecap="round" stroke-linejoin="round" opacity="${tint === WHITE ? 0.92 : 1}"/>`;
    a = b;
  }
  const end = line[line.length - 1],
    [ex, ey] = at(end.x, end.z);
  out += `<circle cx="${f(ex)}" cy="${f(ey)}" r="${f(Math.max(2.4, cell * 0.14))}" fill="#231c18" stroke="#c9973f" stroke-width="1"/>`;
  // The posts: brass rings with a glass middle, glowing when lit, a band of enamel for a coloured one.
  posts.forEach((post, i) => {
    const p = cellAt(n, post.cell),
      [x, y] = at(p.x, p.z),
      lit = bitCount(sides[i]) >= post.need,
      r = cell * 0.24;
    if (lit) out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.3)}" fill="url(#lc-halo-${stage}-${post.colour})"/>`;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#c9973f"/>`;
    if (post.colour !== WHITE) out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.78)}" fill="${ART_ENAMEL[post.colour]}"/>`;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.55)}" fill="${lit ? ART_LIGHT[post.colour] : "#5d5650"}"/>`;
    if (post.need > 2) out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.28)}" fill="#f6f1e4"/>`;
  });
  const halos = ART_LIGHT.map((light, k) => `<radialGradient id="lc-halo-${stage}-${k}"><stop offset="0" stop-color="${light}" stop-opacity="0.85"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>`).join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><defs>${halos}</defs>${out}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수", "달인"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told in words.
  NOTES = ["5×5 · 기둥을 모두 밝히기", "6×6 · 출구 소켓까지", "7×7 · 색 기둥", "8×8 · 색 기둥 더", "9×9 · 숫자 기둥까지"];
export const lightCableConfig: PointConfig<State> = {
  game: lightCable,
  // A step: the soft sound of the cloth cable laid on the board; a post coming on: a clear glass note.
  contact: (sound, state) => (state.last?.lit.length ? sound.glass(3) : sound.soft(state.last?.back ? 2 : 3)),
  solo: true,
  showMovable: false,
  view: (host, quality) => new LightCableView(host, quality),
  colors: CABLE_COLORS,
  keyPoints: (state) => state.postAt.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  keyStart: (state) => state.path[state.path.length - 1],
  // Arrows draw the cable's end a cell that way (off the board is refused with words), Backspace winds it back a
  // cell; H plays the hint while the collection's picture is taken.
  keyMove: (key, state) => {
    if (typeof document !== "undefined" && capturing() && (key === "h" || key === "H")) return hint(state);
    if (state.winner !== null) return null;
    if (key === "Backspace") return state.path.length > 1 ? { from: -1, to: behind(state), extra: -1 } : null;
    const bit = ARROWS[key];
    if (!bit) return null;
    const next = neighbour(state.size, state.path[state.path.length - 1], bit);
    return { from: -1, to: next < 0 ? OFF : next, extra: -1 };
  },
  refusal,
  // Steps given while the light runs at the end are refused as the game is over; otherwise nothing waits.
  queueMoves: "all",
  puzzle: {
    hint,
    hintText: (state, move) =>
      move.to === behind(state)
        ? "힌트 — 이대로는 모두 밝힐 수 없습니다. 케이블 끝을 금빛 칸으로 한 칸 되감으세요."
        : state.path.length === 1
          ? "힌트 — 케이블 끝을 금빛 칸으로 끌어 시작하세요."
          : "힌트 — 케이블 끝을 금빛 칸으로 끄세요.",
  },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: workshopArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "빛 케이블",
  english: "Light Cable",
  number: "NO. 97 — WRAP EVERY PILLAR",
  intro: `<p>어두운 작업대 위의 놋쇠 기둥들.<br>릴에서 케이블을 끌어 기둥을 감아 돌면 기둥이 하나씩 켜집니다. 케이블은 자기 자신과 겹치거나 엇갈릴 수 없으니 감는 차례가 중요합니다. 게임 'Filament'로 알려진 종류의 퍼즐이고, 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 다섯 단계 · 문제는 무작위 · 언제나 풀림",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>WRAP EVERY PILLAR</span>`,
  artClass: "morris-art",
  artLabel: "빛 케이블 미리보기",
  tableLabel: "THE CABLE WORKSHOP",
  tableNote: (variant) => {
    const index = stageOf(Number(variant)) - 1;
    return `${NAMES[index]} · ${STAGES[index].size}×${STAGES[index].size} · 무작위 문제`;
  },
  rulesTitle: "케이블로 기둥을 모두 밝히세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "작업대의 판 위에 놋쇠 <b>기둥</b>이 서 있습니다. 가장자리의 <b>릴</b>에서 나온 케이블 한 줄로 기둥을 모두 밝히면 <b>성공</b>입니다.",
        "케이블 <b>끝(플러그)</b>을 눌러 끌면 손가락을 따라 칸에서 칸으로, 가로·세로로 늘어납니다. 끝 바로 옆 빈칸을 눌러도 한 칸 늘어납니다.",
        "케이블은 기둥 사이의 빈칸으로만 지나가고 <b>한 칸을 두 번 지날 수 없습니다</b>. 그래서 자기 자신과 겹치거나 엇갈리지 않습니다.",
        "케이블이 기둥 바로 옆 칸(위·아래·왼쪽·오른쪽)에 들어서면 기둥의 그쪽 <b>면</b>을 지난 것입니다. 기둥 밑동의 작은 구슬이 그쪽에 켜집니다. 대각선 칸은 세지 않습니다.",
        "기둥은 케이블이 <b>서로 다른 두 면</b>을 지나면 켜집니다. 기둥의 모서리를 돌아 감거나, 양쪽으로 한 번씩 지나가면 됩니다.",
        "<b>보통</b>부터는 <b>출구 소켓</b>이 있습니다. 기둥을 모두 밝히고 케이블 끝이 출구 칸에 닿으면 플러그가 꽂히며 성공입니다.",
        "끝을 지나온 칸으로 되돌려 끌면 케이블이 한 칸씩 감겨 들어갑니다. 무르기도 마지막 한 칸을 되돌립니다. 막다른 곳에 가도 실패는 없으니 되감아 다른 길을 찾으세요.",
      ),
    ) +
    part(
      "작업대의 것들",
      table(
        ["기둥", "놋쇠 기둥에 유리 갓이 씌워져 있습니다. 켜지면 갓이 빛나고 둘레의 판이 밝아집니다."],
        ["면 구슬", "기둥 밑동 네 방향의 작은 구슬입니다. 케이블이 그쪽 옆 칸을 지나면 켜지고, 두 개가 켜지면 기둥이 켜집니다."],
        ["색 기둥", "빨강·파랑·초록 띠를 두른 기둥입니다(<b>어려움</b>부터). 케이블이 옆 칸에 들어서면 그 칸부터 기둥의 색으로 바뀝니다. 색 기둥은 <b>이미 그 색인 케이블</b>이 지나간 면만 셉니다. 흰 기둥은 어느 색이든 셉니다."],
        ["색이 바뀌는 칸", "흰 케이블이 빨간 기둥 옆에 처음 들어선 면은 세지 않고, 거기서부터 케이블이 빨개집니다. 그래서 빨간 기둥은 세 면을 돌아 감거나, 다른 빨간 기둥에서 빨개진 채로 와서 두 면을 지나야 켜집니다. 색이 다른 두 색 기둥에 함께 닿는 칸에서는 색이 그대로입니다."],
        ["숫자 기둥", "꼭대기에 3이나 4가 적힌 기둥입니다(<b>달인</b>). 그 수만큼 서로 다른 면을 지나야 켜집니다. 4는 네 면을 모두 돌아야 합니다."],
        ["릴과 출구", "릴은 케이블이 나오는 곳입니다. 출구 소켓에 플러그가 꽂히면 빛이 케이블을 따라 출구까지 흐릅니다."],
        ["단계", "<b>쉬움</b> 5×5, <b>보통</b> 6×6(출구), <b>어려움</b> 7×7(색 기둥), <b>고수</b> 8×8(색 기둥이 더 많이), <b>달인</b> 9×9(숫자 기둥까지). 문제는 매번 새로 만들어지고 언제나 풀 수 있습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "구석이나 가장자리, 다른 기둥 옆에 붙은 기둥은 지날 수 있는 면이 적습니다. 그런 기둥부터 어떻게 감을지 생각하세요.",
        "케이블이 지나간 칸은 다시 쓸 수 없어서, 한 기둥을 크게 돌면 옆 기둥으로 가는 길이 막히기 쉽습니다. 기둥 사이의 좁은 칸은 아껴 두세요.",
        "힌트는 다음 칸에 금빛을 켜 줍니다. 이미 길이 막혔다면 되감을 칸을 알려 줍니다.",
      ),
    ),
  help: "마우스·터치: 케이블 끝을 끌거나 끝 옆 칸을 누릅니다<br>키보드: 방향키로 한 칸, Backspace로 되감기",
  sides: ["나", ""],
  startWord: "작업대 앞에 서기",
};
