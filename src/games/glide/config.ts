import { capturing } from "../../ui/banner";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { E, N, S, STAGES, W, glide, hint, refusal, stageOf, type State } from "./rules";
import { GLIDE_COLORS, GlideView } from "./view";

/** A small picture of a stage: tiles floating on a lilac haze, the turtle on its back, the lit well, and the stage's new piece. */
function stageArt(stage: number) {
  // Tiles of a little board (row, column), the same for every stage, and what stands on some of them.
  const tiles = [
      [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [1, 3], [1, 4], [2, 0], [2, 1], [2, 3], [2, 4],
      [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [4, 1], [4, 2], [4, 3],
    ],
    cell = 19,
    x0 = 23,
    y0 = 26,
    at = (r: number, c: number) => [x0 + c * cell, y0 + r * cell] as const,
    piece: Record<number, string> = {
      1: "",
      2: (() => {
        const [x, y] = at(1, 3);
        return `<rect x="${x + 2}" y="${y + 2}" width="${cell - 4}" height="${cell - 4}" rx="2" fill="#efe9de"/><path d="M${x + 4} ${y + cell - 4}L${x + cell - 4} ${y + 4}" stroke="#c99a3e" stroke-width="3.2" stroke-linecap="round"/>`;
      })(),
      3: (() => {
        const [x, y] = at(3, 3);
        return `<rect x="${x + 2.5}" y="${y + 2.5}" width="${cell - 5}" height="${cell - 5}" rx="3" fill="#c6ecff" stroke="#ffffff" stroke-width="1"/><path d="M${x + 6} ${y + 6}l4 4l-2 4M${x + 10} ${y + 10}l4 -2" stroke="#ffffff" stroke-width="1" fill="none"/>`;
      })(),
      4: (() => {
        const [x, y] = at(1, 0),
          [x2, y2] = at(4, 3);
        return [
          [x, y],
          [x2, y2],
        ]
          .map(([px, py]) => `<circle cx="${px + cell / 2}" cy="${py + cell / 2}" r="6.4" fill="#d9c6ff" stroke="#a46bff" stroke-width="2.4"/>`)
          .join("");
      })(),
      5: (() => {
        const [x, y] = at(0, 2),
          [x2, y2] = at(2, 0);
        return `<rect x="${x + 2.5}" y="${y + 2.5}" width="${cell - 5}" height="${cell - 5}" rx="2" fill="#2fa86b"/><rect x="${x + 2.5}" y="${y + 9}" width="${cell - 5}" height="2.4" fill="#f5f3ee"/><circle cx="${x2 + cell / 2}" cy="${y2 + cell / 2}" r="5.5" fill="#2fa86b" stroke="#c99a3e" stroke-width="1.6"/>`;
      })(),
    };
  let out = "";
  for (const [r, c] of tiles) {
    const [x, y] = at(r, c);
    out += `<rect x="${x + 1}" y="${y + 1}" width="${cell - 2}" height="${cell - 2}" rx="2.4" fill="#efe9de" stroke="#cfc6b8" stroke-width="0.8"/>`;
  }
  for (const [r, c] of [
    [1, 4],
    [3, 0],
  ]) {
    const [x, y] = at(r, c);
    out += `<rect x="${x + 2.5}" y="${y + 2.5}" width="${cell - 5}" height="${cell - 5}" rx="3" fill="#3b3e44"/>`;
  }
  for (let k = 2; k <= stage; k++) out += piece[k];
  const [gx, gy] = at(3, 4),
    [cx, cy] = at(1, 1);
  out += `<circle cx="${gx + cell / 2}" cy="${gy + cell / 2}" r="6.2" fill="#1f4f63" stroke="#c99a3e" stroke-width="1.6"/><circle cx="${gx + cell / 2}" cy="${gy + cell / 2}" r="3" fill="#9ff2ff"/>`;
  // The turtle seen from above, on its back: legs up at the corners, its head toward the eye, the cream belly plate.
  const tx = cx + cell / 2,
    ty = cy + cell / 2;
  out += [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ]
    .map(([sx, sy]) => `<circle cx="${tx + sx * 6}" cy="${ty + sy * 5.6}" r="2.3" fill="#8fcf63" stroke="#3f7f2c" stroke-width="0.7"/>`)
    .join("");
  out += `<circle cx="${tx}" cy="${ty + 8.4}" r="3" fill="#8fcf63" stroke="#3f7f2c" stroke-width="0.7"/><ellipse cx="${tx}" cy="${ty}" rx="7" ry="7.8" fill="#4f9e3c" stroke="#2f6e2c" stroke-width="0.9"/><ellipse cx="${tx}" cy="${ty}" rx="5" ry="5.8" fill="#f4e4ae"/><path d="M${tx} ${ty - 5}V${ty + 5}M${tx - 4} ${ty - 1.8}H${tx + 4}M${tx - 4} ${ty + 1.8}H${tx + 4}" stroke="#b9945a" stroke-width="0.7"/>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="glide-sky-${stage}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9db7dc"/><stop offset="0.55" stop-color="#ddd9ec"/><stop offset="1" stop-color="#f4dccf"/></linearGradient></defs><rect x="6" y="6" width="128" height="128" rx="14" fill="url(#glide-sky-${stage})"/>${out}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수", "달인"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told by their pieces.
  NOTES = ["9×9 · 돌기둥", "10×10 · +방향판", "10×10 · +얼음", "11×11 · +고리", "12×12 · +문"];
const KEYS: Record<string, number> = {
  ArrowUp: N,
  ArrowRight: E,
  ArrowDown: S,
  ArrowLeft: W,
  w: N,
  W: N,
  d: E,
  D: E,
  s: S,
  S: S,
  a: W,
  A: W,
  // The same keys with a Korean keyboard layout.
  ㅈ: N,
  ㅇ: E,
  ㄴ: S,
  ㅁ: W,
};
export const glideConfig: PointConfig<State> = {
  game: glide,
  // A stone knock against basalt, a gate or a turner; ice breaks with a crystal ring.
  contact: (sound, state) => (state.last?.end === "ice" ? sound.glass(3) : sound.stone(6)),
  solo: true,
  showMovable: false,
  view: (host, quality) => new GlideView(host, quality),
  colors: GLIDE_COLORS,
  // An arrow or W A S D is a push; H plays the hint while the collection's picture is taken.
  keyMove: (key, state, repeat) => {
    if (typeof document !== "undefined" && capturing() && (key === "h" || key === "H")) return hint(state);
    const dir = KEYS[key];
    return dir === undefined || repeat ? null : { from: -1, to: dir, extra: -1 };
  },
  refusal,
  // A push given while the cube still slides is played the moment it stops (the user asked).
  queueMoves: true,
  // A fall begins the board again by itself (the user asked).
  restartOnFail: (s) => s.winner === 1,
  puzzle: { hint, hintText: "힌트 — 거북이를 금색 화살표 쪽으로 미세요." },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: stageArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "미끄럼 큐브",
  english: "Glide Cube",
  number: "NO. 92 — SLIDE INTO THE WELL",
  intro: `<p>안개 위에 뜬 대리석 타일, 등껍질로 뒤집어진 초록 거북이 한 마리.<br>밀면 뱅글뱅글 돌며 막힐 때까지 미끄러집니다. 허공으로 떨어지지 않게, 빛나는 우물 위에 딱 멈추도록 길을 찾으세요. 'Orbox'로 알려진 종류의 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 다섯 단계 · 문제는 무작위 · 언제나 풀림",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>SLIDE INTO THE WELL</span>`,
  artClass: "morris-art",
  artLabel: "미끄럼 큐브 미리보기",
  tableLabel: "THE FLOATING TILES",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "거북이를 우물에 넣으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "안개 위에 대리석 타일이 떠 있고, 그 위에 등껍질로 뒤집어진 <b>거북이</b> 한 마리와 빛나는 <b>우물</b>(출구)이 있습니다.",
        "거북이를 위·아래·왼쪽·오른쪽 가운데 한쪽으로 밀면, 등껍질로 뱅글뱅글 돌면서 무언가에 막힐 때까지 <b>한 칸씩 계속 미끄러집니다</b>. 한 번 미는 것이 한 수입니다.",
        "<b>돌기둥</b>에 닿으면 그 앞 칸에서 '아쿵!' 하고 멈춥니다. 바로 앞이 막혀 있어 조금도 움직일 수 없는 쪽으로는 밀 수 없습니다.",
        "앞에 타일이 없으면 거북이는 가장자리를 넘어 '으아악!' 하며 <b>허공으로 떨어집니다</b>. 실패이며, 무르기로 되돌릴 수 있습니다.",
        "거북이가 우물 <b>위에 멈추면</b> 성공입니다. 우물 위를 지나치기만 해서는 안 됩니다. 우물 너머에 거북이를 세워 줄 무언가가 있어야 합니다.",
      ),
    ) +
    part(
      "타일 위의 것들",
      table(
        ["돌기둥", "검은 현무암 기둥입니다. 거북이는 그 앞 칸에서 멈춥니다."],
        ["방향판", "대각선으로 놓인 놋쇠 판입니다. 들어온 거북이를 직각으로 꺾어 보내고, 거북이는 계속 미끄러집니다. 방향판 위에는 멈추지 않습니다. 꺾여 나갈 칸이 막혀 있으면 방향판이 벽처럼 거북이를 세웁니다."],
        ["얼음", "거북이는 얼음 앞에서 멈추고, 부딪힌 얼음은 깨져 그 칸이 열립니다. 미끄러져 와서 부딪혀야 깨집니다. 바로 앞에 놓인 얼음 쪽으로는 밀 수 없습니다."],
        ["순간이동 고리", "같은 색 고리가 한 쌍입니다. 한쪽에 들어가면 다른 쪽에서 같은 방향으로 나와 계속 미끄러집니다. 나오자마자 막히면 그 고리 위에 멈춥니다."],
        ["스위치와 문", "스위치를 지나거나 그 위에 멈추면 같은 색 문이 모두 바뀝니다. 솟은 문은 돌기둥처럼 막고, 내려간 문은 바닥처럼 지나갑니다."],
        ["단계", "<b>쉬움</b>은 9×9 판에 돌기둥만 있고, 단계마다 새것이 하나씩 더해져 <b>달인</b>(12×12)에서는 모두 나옵니다. 길에는 그 단계의 것이 모두 쓰이고(보통은 방향판 둘 이상, 어려움은 방향판과 얼음, 고수는 고리까지, 달인은 스위치와 문까지), 위 단계일수록 판이 넓고 길이 길며 우물에서 멀어졌다 돌아오는 수가 많이 끼어 있습니다. 우물 쪽으로만 밀어서는 풀리지 않는 판만 나옵니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "우물에서 거꾸로 생각해 보세요. 우물 너머에 무엇이 있어 거북이를 세우는지, 그 줄로 거북이를 보내려면 어디에 서 있어야 하는지 따라가면 길이 보입니다.",
        "가장자리 쪽으로 미는 수는 대개 떨어집니다. 밀기 전에 그 줄 끝에 무엇이 있는지 보세요.",
        "얼음은 한 번만 거북이를 세웁니다. 깨고 나면 그 줄은 열리니, 언제 깰지가 중요합니다.",
      ),
    ),
  help: "마우스·터치: 판 위 어디서든 밀 쪽으로 쓸어 넘기거나, 거북이 둘레의 화살표를 누릅니다<br>키보드: 방향키나 W A S D",
  sides: ["나", ""],
  startWord: "타일 위에 서기",
};
