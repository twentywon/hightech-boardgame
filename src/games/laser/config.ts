import { capturing } from "../../ui/banner";
import type { Sound } from "../../engine/sound";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { CELLS, GO, PUT, STAGES, hint, laserPuzzle, refusal, stageOf, type State } from "./rules";
import { LASER_COLORS, LaserView, laserKeyPoints } from "./view";

/**
 * A small picture of a stage: the dark breadboard seen from above with its mounts, the laser at one side, a few
 * mirrors and a frosted target, and the red beam bending between them; a splitter's two ways from the third stage.
 */
function benchArt(stage: number) {
  const cell = 22,
    x0 = 15,
    y0 = 15,
    mid = (c: number) => x0 + c * cell + cell / 2,
    // The beam's way through the cells (column, row), and the pieces it meets.
    scenes: { ways: [number, number][][]; laser: [number, number, number]; mirrors: [number, number, string][]; targets: [number, number, number][]; splitters: [number, number][]; checks: [number, number, number][] }[] = [
      { ways: [[[0, 3], [3, 3], [3, 1]]], laser: [0, 3, 1], mirrors: [[3, 3, "/"]], targets: [[3, 1, 2]], splitters: [], checks: [] },
      { ways: [[[0, 1], [2, 1], [2, 4], [4, 4]]], laser: [0, 1, 1], mirrors: [[2, 1, "\\"], [2, 4, "\\"]], targets: [[4, 4, 3]], splitters: [], checks: [[2, 3, 0]] },
      { ways: [[[2, 0], [2, 2], [4, 2]], [[2, 2], [2, 4], [0, 4]]], laser: [2, 0, 2], mirrors: [[2, 4, "/"]], targets: [[4, 2, 3], [0, 4, 1]], splitters: [[2, 2]], checks: [] },
      { ways: [[[0, 2], [1, 2], [1, 0], [4, 0], [4, 3]], [[1, 2], [3, 2], [3, 4]], [[1, 2], [1, 4]]], laser: [0, 2, 1], mirrors: [[1, 0, "/"], [4, 0, "\\"], [3, 2, "\\"]], targets: [[4, 3, 0], [3, 4, 0], [1, 4, 0]], splitters: [[1, 2]], checks: [] },
    ],
    scene = scenes[stage - 1];
  let grid = "";
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) grid += `<circle cx="${mid(c)}" cy="${mid(r)}" r="5.2" fill="#8d949c"/>`;
  const beam = scene.ways
    .map((way) => `<polyline points="${way.map(([c, r]) => `${mid(c)},${mid(r)}`).join(" ")}" fill="none" stroke="#ff3a24" stroke-width="5" stroke-linejoin="round" opacity="0.35"/><polyline points="${way.map(([c, r]) => `${mid(c)},${mid(r)}`).join(" ")}" fill="none" stroke="#ffd9d0" stroke-width="1.6" stroke-linejoin="round"/>`)
    .join("");
  const [lc, lr, ld] = scene.laser,
    laser = `<g transform="translate(${mid(lc)} ${mid(lr)}) rotate(${ld * 90})"><rect x="-6" y="-8" width="12" height="17" rx="2.5" fill="#24456e" stroke="#0f1d30"/><rect x="-3.5" y="-10.5" width="7" height="3" fill="#111"/><rect x="-5" y="1" width="10" height="4" fill="#f5c518"/></g>`,
    mirrors = scene.mirrors
      .map(([c, r, d]) => {
        const x = mid(c),
          y = mid(r),
          h = 8;
        return d === "/" ? `<line x1="${x - h}" y1="${y + h}" x2="${x + h}" y2="${y - h}" stroke="#eaf1f8" stroke-width="3.2" stroke-linecap="round"/>` : `<line x1="${x - h}" y1="${y - h}" x2="${x + h}" y2="${y + h}" stroke="#eaf1f8" stroke-width="3.2" stroke-linecap="round"/>`;
      })
      .join(""),
    targets = scene.targets.map(([c, r]) => `<circle cx="${mid(c)}" cy="${mid(r)}" r="7.5" fill="#fff6ec" stroke="#ff7a50" stroke-width="2.4"/><circle cx="${mid(c)}" cy="${mid(r)}" r="3.6" fill="none" stroke="#d8322a" stroke-width="1.6"/><circle cx="${mid(c)}" cy="${mid(r)}" r="11" fill="#ffb070" opacity="0.28"/>`).join(""),
    splitters = scene.splitters.map(([c, r]) => `<rect x="${mid(c) - 7}" y="${mid(r) - 7}" width="14" height="14" rx="1.5" fill="#bfe8ff" fill-opacity="0.55" stroke="#e8f8ff"/><line x1="${mid(c) - 7}" y1="${mid(r) - 7}" x2="${mid(c) + 7}" y2="${mid(r) + 7}" stroke="#ffd889" stroke-width="2"/>`).join(""),
    checks = scene.checks.map(([c, r]) => `<rect x="${mid(c) - 8}" y="${mid(r) - 2.5}" width="16" height="5" rx="1.5" fill="#23262c" stroke="#d6a84c"/><circle cx="${mid(c)}" cy="${mid(r)}" r="2.2" fill="#58ff8c"/>`).join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="12" fill="#8f969d"/><rect x="10" y="10" width="120" height="120" rx="5" fill="#2a2e35"/>${grid}${beam}${mirrors}${splitters}${checks}${targets}${laser}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told in words.
  NOTES = ["부품 둘 · 표적 하나", "부품 셋 · 통과 고리", "부품 넷 · 빔 분할기 · 표적 둘", "부품 네다섯 · 분할기 둘 · 표적 셋"];
/** The laser firing: the laser chess's zap where the page has it, else a bright run of notes. */
function fire(sound: Sound) {
  const zap = (sound as Sound & { laser?: (what: "fire" | "block" | "burst") => void }).laser;
  if (zap) zap.call(sound, "fire");
  else sound.sparkle();
}
export const laserConfig: PointConfig<State> = {
  game: laserPuzzle,
  // A post set down in its mount on the breadboard; the beam fired, a target lit, the beam stopped on a face.
  contact: (sound) => sound.tile(4),
  knock: (sound, kind) => (kind === "disc" ? fire(sound) : kind === "pocket" ? sound.glass(3) : sound.glass(1)),
  solo: true,
  showMovable: false,
  view: (host, quality) => new LaserView(host, quality),
  colors: LASER_COLORS,
  // The keyboard walks the mounts, then the tray's places.
  keyPoints: laserKeyPoints,
  keyStart: (state) => state.given[0].at,
  // A tap on the laser does the same; the button stays for readers and the keyboard.
  tools: [{ label: "레이저 발사", point: GO, onBoard: true }],
  refusal: (state, move) => refusal(state, move),
  // Only while a thumbnail is captured: H plays the hint's next move (the firing too), so that the picture can show
  // the answer set out and its beam.
  keyMove: (key, state) => {
    if (!capturing() || (key !== "h" && key !== "H")) return null;
    return hint(state);
  },
  puzzle: {
    hint,
    hintText: (_state, move) =>
      move.to === GO
        ? "힌트 — 모든 부품이 제자리에 있습니다. 금색 고리의 레이저를 눌러 빛을 쏘세요."
        : move.to >= PUT
          ? move.from >= 0 && move.from < CELLS && Math.floor((move.to - PUT) / 4) === move.from
            ? "힌트 — 금색 고리의 부품을 눌러 금색 그림자처럼 돌려 놓으세요."
            : "힌트 — 금색 고리의 부품을 금색 그림자가 있는 자리로 옮기고, 그림자처럼 돌려 놓으세요."
          : "힌트 — 금색 고리의 부품을 쟁반으로 되돌리세요. 그 자리에는 다른 부품이 들어갑니다.",
  },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: benchArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "레이저 반사 퍼즐",
  english: "Laser Reflection",
  number: "NO. 88 — LIGHT THE TARGETS",
  intro: `<p>광학 실험대의 5×5 받침판.<br>쟁반의 거울과 부품을 받침판에 세우고 돌려서, 레이저 빛이 판 위의 모든 부품에 닿으며 정해진 수의 표적에 불을 켜게 하세요. ThinkFun의 'Laser Maze'와 같은 규칙의 퍼즐이고, 문제는 매번 새로 만들어지며 답은 하나뿐입니다.</p>`,
  meta: "1인 · 5×5 받침판 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>LIGHT THE TARGETS</span>`,
  artClass: "morris-art",
  artLabel: "레이저 반사 퍼즐 미리보기",
  tableLabel: "THE OPTICS BENCH",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "빛을 꺾어 표적을 켜세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "받침판에는 처음부터 <b>레이저</b>와 몇몇 <b>고정 부품</b>이 놓여 있습니다. 고정 부품은 받침에 죔쇠로 물려 있어 옮길 수 없고, 흰 화살표 고리가 있는 것만 돌릴 수 있습니다.",
        "판 앞 <b>쟁반의 부품을 모두</b> 받침판의 빈 자리에 놓습니다. 놓은 부품은 누를 때마다 시계 방향으로 90도씩 돌아가고, 판 밖으로 끌어내면 쟁반으로 돌아갑니다.",
        "레이저를 누르면 빛이 나갑니다. 빛은 부품을 하나라도 옮기거나 돌릴 때까지 보입니다. 쏘아 보는 것은 실패가 아니니 몇 번이든 쏘아 보세요.",
        "빛이 <b>판 위의 모든 부품에 닿고</b>(고무 마개는 빼고), 문제에 적힌 수만큼 <b>정확히</b> 표적에 불이 들어오면 성공입니다.",
      ),
    ) +
    part(
      "부품",
      table(
        ["레이저", "앞쪽 렌즈로 빛을 곧게 쏩니다. 돌아온 빛은 레이저에 막힙니다."],
        ["표적 거울", "칸의 반쪽을 채운 검은 블록 앞에 대각선 거울이 서 있습니다. 거울 쪽으로 들어온 빛은 90도 꺾이고, <b>흰 표적 면</b>으로 들어온 빛은 표적에 불을 켜고 멈춥니다. 표적 옆의 다른 검은 면은 빛을 막습니다."],
        ["양면 거울", "칸을 대각선으로 가로지르는 거울로, 양쪽 면 모두 빛을 90도 꺾습니다."],
        ["빔 분할기", "유리 상자 안의 대각선 막이 빛을 둘로 나눕니다. 반은 곧게 지나가고 반은 90도 꺾입니다."],
        ["통과 고리", "가운데 구멍이 뚫린 판입니다. 빛은 구멍을 따라서만 지나가고, 옆에서 온 빛은 막힙니다. 빛이 구멍을 <b>지나가야</b> 닿은 것으로 칩니다."],
        ["고무 마개", "받침에 꽂힌 낮은 마개입니다. 그 자리에는 아무것도 놓을 수 없지만 빛은 그 위로 지나갑니다."],
      ),
    ) +
    part(
      "표시",
      table(
        ["죔쇠", "받침에 물린 검은 죔쇠는 처음부터 놓인 부품입니다. 옮길 수 없습니다."],
        ["빨간 고리", "기둥에 빨간 고리를 낀 부품은 방향이 정해져 있어 돌릴 수 없습니다."],
        ["흰 화살표", "고정 부품 둘레의 흰 화살표는 그 부품을 돌릴 수 있다는 뜻입니다."],
        ["붉은 고리", "쏘아 본 뒤 빛이 닿지 않은 부품과 쟁반에 남은 부품에 붉은 고리가 둘립니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "레이저에서 시작해 빛이 갈 길을 한 칸씩 따라가 보세요. 빛은 거울에서만 꺾이고, 빈 칸과 고무 마개 위는 곧게 지나갑니다.",
        "표적은 한쪽 면에만 있습니다. 표적 거울을 거울로 쓸지, 표적으로 쓸지 정한 다음 돌리세요.",
        "빔 분할기가 있으면 빛이 두 갈래가 됩니다. 갈래마다 끝에 무엇이 있어야 할지 생각해 보세요.",
        "힌트는 옮길 부품에 금색 고리를, 놓을 자리에 금색 그림자를 보여 줍니다.",
      ),
    ),
  help: "마우스·터치: 쟁반의 부품을 받침판으로 끌어다 놓고, 놓은 부품을 누르면 돌아갑니다. 판 밖으로 끌어내면 쟁반으로 돌아갑니다. 레이저를 누르면 빛이 나갑니다<br>키보드: 방향키로 고르고 Enter, 같은 부품에서 한 번 더 Enter로 돌리기, 레이저에서 Enter로 발사",
  sides: ["나", ""],
  startWord: "실험대로 가기",
};
