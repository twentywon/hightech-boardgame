import { capturing } from "../../ui/banner";
import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { E, N, S, STAGES, W, hint, link, masksOf, neighbour, refusal, sideTo, tracks, wander, type State } from "./rules";
import { TRACKS_COLORS, TracksView } from "./view";

/** A small picture of a stage: a grassy grid on a wooden frame with a railway across it, from a tunnel to a station. */
function railwayArt(size: number, index: number) {
  let seed = size * 977 + index * 31 + 13;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296,
    path = wander(size, Math.round(size * size * 0.5), random),
    masks = masksOf(size, path, [
      { cell: path[0], bit: W },
      { cell: path[path.length - 1], bit: S },
    ]),
    cell = 88 / size,
    x0 = 34,
    y0 = 18,
    way: Record<number, [number, number]> = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
  let tiles = "",
    rails = "";
  masks.forEach((mask, i) => {
    const x = x0 + (i % size) * cell,
      y = y0 + Math.floor(i / size) * cell,
      cx = x + cell / 2,
      cy = y + cell / 2;
    tiles += `<rect x="${x + 0.6}" y="${y + 0.6}" width="${cell - 1.2}" height="${cell - 1.2}" rx="1" fill="${(i * 5) % 3 ? "#86b25c" : "#7da853"}"/>`;
    const sides = [N, E, S, W].filter((bit) => mask & bit);
    if (sides.length !== 2) return;
    const [a, b] = sides.map((bit) => [cx + (way[bit][0] * cell) / 2, cy + (way[bit][1] * cell) / 2]);
    if ((sides[0] | sides[1]) === (N | S) || (sides[0] | sides[1]) === (E | W)) rails += `M${a[0]} ${a[1]}L${b[0]} ${b[1]}`;
    else rails += `M${a[0]} ${a[1]}Q${cx} ${cy} ${b[0]} ${b[1]}`;
  });
  const first = path[0],
    last = path[path.length - 1],
    inY = y0 + (Math.floor(first / size) + 0.5) * cell,
    outX = x0 + ((last % size) + 0.5) * cell,
    bottom = y0 + size * cell;
  rails += `M${x0} ${inY}L${x0 - 16} ${inY}M${outX} ${bottom}L${outX} ${bottom + 12}`;
  const width = Math.max(2.2, cell * 0.36);
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#c99e6c"/><rect x="11" y="11" width="118" height="118" rx="10" fill="#6f9848"/><rect x="${x0 - 2}" y="${y0 - 2}" width="${size * cell + 4}" height="${size * cell + 4}" fill="#5a3c28"/>${tiles}<path d="${rails}" stroke="#8f8a82" stroke-width="${width * 1.9}" fill="none"/><path d="${rails}" stroke="#5b3d27" stroke-width="${width * 1.5}" stroke-dasharray="${Math.max(0.8, width * 0.35)} ${Math.max(0.8, width * 0.45)}" fill="none"/><path d="${rails}" stroke="#d7dbe0" stroke-width="${Math.max(0.6, width * 0.22)}" fill="none" transform="translate(${width * 0.38} ${width * 0.38})"/><path d="${rails}" stroke="#d7dbe0" stroke-width="${Math.max(0.6, width * 0.22)}" fill="none" transform="translate(${-width * 0.38} ${-width * 0.38})"/><path d="M${x0 - 26} ${inY + 8}Q${x0 - 21} ${inY - 12} ${x0 - 12} ${inY + 8}z" fill="#4f7a36"/><path d="M${x0 - 22} ${inY + 8}L${x0 - 22} ${inY}Q${x0 - 19} ${inY - 5} ${x0 - 16} ${inY}L${x0 - 16} ${inY + 8}z" fill="#1b1714"/><rect x="${outX + 4}" y="${bottom + 3}" width="13" height="8" fill="#efe3c8"/><path d="M${outX + 2.5} ${bottom + 3.5}L${outX + 10.5} ${bottom - 1}L${outX + 18.5} ${bottom + 3.5}z" fill="#8a3b2c"/></svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수", "달인"];
const NOTES = ["주어진 선로 넉넉히", "주어진 선로 조금", "주어진 선로 조금", "주어진 선로 적게", "꼭 필요한 선로만"];
const ARROWS: Record<string, number> = { ArrowUp: N, ArrowRight: E, ArrowDown: S, ArrowLeft: W };
export const tracksConfig: PointConfig<State> = {
  game: tracks,
  contact: (sound) => sound.knock(1),
  solo: true,
  showMovable: false,
  view: (host, quality) => new TracksView(host, quality),
  colors: TRACKS_COLORS,
  keyPoints: (state) => state.links.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  // Shift with an arrow lays or lifts the rail from the cursor's cell that way; H plays the hint while the collection's picture is taken.
  keyMove: (key, state, _repeat, held) => {
    if (typeof document !== "undefined" && capturing() && (key === "h" || key === "H")) return hint(state);
    const bit = ARROWS[key];
    if (!bit || !held?.shift || held.cursor === null) return null;
    const next = neighbour(state.size, held.cursor, bit);
    return next < 0 ? null : link(held.cursor, next);
  },
  refusal,
  puzzle: {
    hint,
    hintText: (state, move) =>
      move.from === -1
        ? "힌트 — 금색 고리가 쳐진 칸의 X를 지우세요. 그 칸으로 선로가 지나갑니다."
        : state.links[move.from] & sideTo(state.size, move.from, move.to)
          ? "힌트 — 금색 화살표가 가리키는 선로를 걷어 내세요. 답에 없는 선로입니다."
          : "힌트 — 금색 고리의 칸에서 화살표가 가리키는 칸으로 끌어 선로를 놓으세요.",
  },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({ value: String(i + 1), name: `${stage.size}×${stage.size} · ${NAMES[i]}`, note: NOTES[i], art: railwayArt(stage.size, i) })),
  tallyHtml: () => ["", ""],
  name: "기차 선로",
  english: "Train Tracks",
  number: "NO. 91 — FROM THE TUNNEL TO THE STATION",
  intro: `<p>모형 기차의 받침판, 터널에서 역까지.<br>칸에서 이웃 칸으로 끌어 선로를 놓고, 위와 오른쪽 숫자만큼 칸을 지나는 한 줄의 철길로 입구와 출구를 이으세요. 'Train Tracks'로 알려진 오래된 퍼즐이고 문제는 매번 새로 만들어지며 답은 하나뿐입니다.</p>`,
  meta: "1인 · 5×5부터 10×10 · 문제는 무작위 · 답은 하나",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>FROM THE TUNNEL TO THE STATION</span>`,
  artClass: "morris-art",
  artLabel: "기차 선로 미리보기",
  tableLabel: "THE MODEL RAILWAY",
  tableNote: (variant) => {
    const index = Math.max(1, Math.min(STAGES.length, Number(variant) || 1)) - 1,
      stage = STAGES[index];
    return `${stage.size}×${stage.size} · ${NAMES[index]} · 무작위 문제`;
  },
  rulesTitle: "터널에서 역까지 철길을 이으세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "받침판 왼쪽이나 아래쪽 가장자리 밖에 <b>터널</b>(입구)과 <b>역</b>(출구)이 있습니다. 둘을 잇는 <b>한 줄의 철길</b>을 칸 위에 놓습니다.",
        "칸을 누른 채 <b>이웃 칸으로 끌면</b> 두 칸 사이에 선로가 놓이고, 이미 놓인 선로 위로 끌면 걷힙니다. 여러 칸을 지나 끌면 지나는 대로 이어집니다.",
        "한 칸의 선로는 <b>곧은 선로</b>나 <b>굽은 선로</b>입니다. 철길은 갈라지거나 엇갈리지 않고, 고리를 이루지도 않습니다.",
        "위의 숫자는 그 <b>세로줄</b>에서, 오른쪽 숫자는 그 <b>가로줄</b>에서 철길이 지나는 칸의 수입니다. 꼭 맞으면 초록, 넘치면 빨강이 됩니다.",
        "처음부터 놓인 <b>주어진 선로</b>는 걷을 수 없고 모두 철길의 일부입니다. 숫자가 모두 맞고 입구에서 출구까지 한 줄로 이어지면 성공, 기차가 달립니다. 답은 하나뿐입니다.",
      ),
    ) +
    part(
      "칸과 선로",
      table(
        ["곧은 선로", "마주 보는 두 변을 잇습니다. 세로와 가로 두 가지입니다."],
        ["굽은 선로", "옆으로 이웃한 두 변을 잇는 4분의 1 원입니다. 네 가지 방향이 있습니다."],
        ["주어진 선로", "침목이 짙고 이음매가 놋쇠색입니다. 걷을 수도, 세 번째 선로를 덧붙일 수도 없습니다."],
        ["막다른 선로", "선로가 하나만 닿은 칸입니다. 끝에 붉은 차막이가 서며, 다 풀면 남아 있지 않아야 합니다."],
        ["X 표시", "칸을 한 번 누르면 철길이 지나지 않는다고 X로 적어 두고, 다시 누르면 지웁니다. X 칸에는 선로가 놓이지 않습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "숫자가 <b>0</b>인 줄은 모두 X입니다. 숫자가 줄의 칸 수와 같으면 그 줄은 모두 철길입니다.",
        "주어진 선로의 끝은 반드시 이웃 칸으로 이어집니다. 거기서부터 늘여 가세요.",
        "구석의 칸은 지난다면 굽은 선로일 수밖에 없습니다. 가장자리에서는 선로가 밖으로 나갈 수 없습니다(입구와 출구만 빼고).",
      ),
    ),
  help: "마우스·터치: 칸에서 이웃 칸으로 끌어 선로를 놓거나 걷고, 칸을 눌러 X 표시<br>키보드: 방향키로 칸을 고르고 Shift+방향키로 선로, Enter·Space로 X",
  sides: ["나", ""],
  startWord: "받침판 앞에 앉기",
};
