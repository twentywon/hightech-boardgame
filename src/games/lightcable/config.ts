import { capturing } from "../../ui/banner";
import { notes, part, steps, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { restEnd, cableLines } from "./layout";
import {
  DEPTH,
  HAZARD_R,
  POST_R,
  RING_R,
  STAGES,
  WHITE,
  WIDTH,
  boardOf,
  decode,
  hint,
  isLit,
  lightCable,
  play,
  plugMove,
  refusal,
  stageOf,
  unwrapMove,
  type Kind,
  type Post,
  type State,
} from "./rules";
import { CABLE_COLORS, LightCableView, keyboard } from "./view";
import { withLazy } from "../../core/lazy";

/** The colours of the pictures: the light of each cable colour, and the enamel of a coloured post. */
const ART_LIGHT = ["#ffe2a8", "#ff6a56", "#62b0ff", "#6ae598"],
  ART_ENAMEL = ["#e6dfcf", "#c4362c", "#2d6fd2", "#2f9a55"];
/**
 * The pictures of the stages: boards the generator once laid (start, exit, posts as x, z, kind — p plain, c coloured,
 * r ring, n counted —, colour and need, the coils), with the first wraps of their plans made.
 */
const PICTURES: { start: [number, number]; exit: [number, number]; posts: [number, number, string, number, number][]; hazards: [number, number][]; plan: number[]; made: number }[] = [
  { start: [-3.8, -1.58], exit: [3.8, 0.99], posts: [[-0.28, -1.25, "p", 0, 1], [2.7, -1.91, "p", 0, 1], [0.53, 1.19, "p", 0, 1], [-2.98, 0.97, "p", 0, 1], [-2.14, -0.54, "p", 0, 1]], hazards: [[0.17, -0.08], [0.75, -1.27]], plan: [9, 0, 7, 5, 2], made: 3 },
  { start: [-3.8, 1.2], exit: [3.8, 1.05], posts: [[-0.39, -0.91, "p", 0, 1], [-1.23, -0.11, "p", 0, 1], [0.76, 0.47, "p", 0, 1], [2.74, 0.99, "p", 0, 1], [-1.17, 1.64, "p", 0, 1], [-2.52, -0.46, "p", 0, 1]], hazards: [[-0.24, -0.04], [1.5, 0.08], [-2.91, 1.53]], plan: [3, 10, 0, 4, 9, 6], made: 4 },
  { start: [-3.8, 1.67], exit: [3.8, 0.81], posts: [[-0.92, 1.68, "p", 0, 1], [-1.79, -0.18, "p", 0, 1], [0.02, 0.37, "p", 0, 1], [2.86, -1.63, "p", 0, 1], [-0.66, -1.3, "p", 0, 1], [1.65, 1.64, "p", 0, 1], [2.57, 0.05, "p", 0, 1], [1.22, -0.85, "p", 0, 1]], hazards: [[1.4, 0.15], [2.37, 1.01], [-2.06, 0.7], [2.1, -0.68]], plan: [2, 5, 15, 8, 6, 12, 1, 11], made: 5 },
  { start: [-3.8, -0.76], exit: [3.8, -1.02], posts: [[0.43, 0.64, "p", 0, 1], [-1.55, 1.6, "p", 0, 1], [-2.24, 0.33, "c", 1, 1], [-1.14, -1.42, "p", 0, 1], [2.93, 1.88, "p", 0, 1], [1.74, -0.32, "c", 3, 1], [-0.71, -0.22, "c", 1, 1], [-3.25, 1.2, "r", 1, 0], [2.34, 0.66, "r", 3, 0]], hazards: [[0.86, -0.2], [-0.88, 0.63], [-1.83, -0.63]], plan: [15, 3, 4, 12, 1, 9, 16, 11, 6], made: 6 },
  { start: [-3.8, 0.08], exit: [3.8, -0.96], posts: [[-0.55, -0.16, "p", 0, 1], [1.32, -0.56, "p", 0, 1], [0.92, 1.24, "p", 0, 1], [2.48, 1.81, "c", 2, 1], [2.52, -1.27, "c", 1, 1], [-0.67, 1.98, "n", 0, 2], [-1.98, 0.09, "r", 1, 0], [-2.08, 1.42, "r", 2, 0]], hazards: [[-1.32, 1.18], [0.15, 1.36], [0.64, 0.29], [1.83, 1.29]], plan: [13, 0, 3, 8, 4, 10, 14, 11, 7], made: 6 },
];
const KINDS: Record<string, Kind> = { p: "plain", c: "coloured", r: "ring", n: "counted" };
/** The board of a stage's picture, with its first wraps made. */
function pictureState(stage: number): State {
  const pic = PICTURES[stage - 1],
    posts: Post[] = pic.posts.map(([x, z, k, colour, need]) => ({ x, z, kind: KINDS[k], colour, need, r: k === "r" ? RING_R : k === "n" ? POST_R + 0.02 : POST_R })),
    hazards = pic.hazards.map(([x, z]) => ({ x, z, r: HAZARD_R }));
  let s = boardOf(stage, posts, hazards, { x: pic.start[0], z: pic.start[1] }, { x: pic.exit[0], z: pic.exit[1] });
  for (const to of pic.plan.slice(0, pic.made)) s = play(s, { from: -1, to, extra: -1 }) ?? s;
  return s;
}
/**
 * A small picture of a stage, drawn by the rules themselves: the dark board, the reel, the cable as far as it has
 * come (in the colours it took), the posts (lit ones glowing), the rings, the coils and the exit socket.
 */
function workshopArt(stage: number) {
  const s = pictureState(stage),
    scale = 124 / (WIDTH * 2 + 0.5),
    at = (x: number, z: number) => [70 + x * scale, 70 + z * scale] as const,
    f = (v: number) => v.toFixed(1),
    halfW = (WIDTH + 0.25) * scale,
    halfD = (DEPTH + 0.25) * scale;
  let out = `<rect x="${f(70 - halfW - 4)}" y="${f(70 - halfD - 4)}" width="${f(halfW * 2 + 8)}" height="${f(halfD * 2 + 8)}" rx="8" fill="#5a3e2d"/>`;
  out += `<rect x="${f(70 - halfW)}" y="${f(70 - halfD)}" width="${f(halfW * 2)}" height="${f(halfD * 2)}" rx="4" fill="#2b231e"/>`;
  out += `<rect x="${f(70 - WIDTH * scale)}" y="${f(70 - DEPTH * scale)}" width="${f(WIDTH * 2 * scale)}" height="${f(DEPTH * 2 * scale)}" fill="none" stroke="#a77b35" stroke-width="0.9"/>`;
  // The coils: a warning ring round a black core.
  for (const h of s.hazards) {
    const [x, y] = at(h.x, h.z);
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(h.r * scale * 0.85)}" fill="#1a1716" stroke="#f2c230" stroke-width="1.5"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(h.r * scale * 0.85)}" fill="none" stroke="#c8281e" stroke-width="1.5" stroke-dasharray="1.6 1.6"/><circle cx="${f(x)}" cy="${f(y)}" r="1.2" fill="#bfe4ff"/>`;
  }
  // The reel and the exit socket.
  const [rx, ry] = at(s.start.x - 0.2, s.start.z),
    [sx, sy] = at(s.exit.x + 0.12, s.exit.z);
  out += `<circle cx="${f(rx)}" cy="${f(ry)}" r="5" fill="#c9973f"/><circle cx="${f(rx)}" cy="${f(ry)}" r="3.2" fill="#efe6d4"/><circle cx="${f(rx)}" cy="${f(ry)}" r="1.4" fill="#231c18"/>`;
  out += `<rect x="${f(sx - 3)}" y="${f(sy - 5)}" width="6" height="10" rx="1.5" fill="#231c18" stroke="#c9973f" stroke-width="1"/><circle cx="${f(sx - 1)}" cy="${f(sy)}" r="1.6" fill="#0b0908"/>`;
  // The cable in runs of one colour.
  const end = restEnd(s),
    { fixed, free } = cableLines(s, end),
    line = [...fixed, ...free.slice(1)];
  for (let a = 0; a < line.length - 1; ) {
    const tint = line[a + 1].tint;
    let b = a + 1;
    while (b + 1 < line.length && line[b + 1].tint === tint) b++;
    const d = line
      .slice(a, b + 1)
      .filter((_, i, all) => i % 2 === 0 || i === all.length - 1)
      .map((p, i) => `${i ? "L" : "M"}${f(at(p.x, p.z)[0])} ${f(at(p.x, p.z)[1])}`)
      .join("");
    out += `<path d="${d}" fill="none" stroke="${ART_LIGHT[tint]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" opacity="${tint === WHITE ? 0.92 : 1}"/>`;
    a = b;
  }
  const [ex, ey] = at(end.x, end.z);
  out += `<circle cx="${f(ex)}" cy="${f(ey)}" r="2.2" fill="#231c18" stroke="#c9973f" stroke-width="0.9"/>`;
  // The posts: brass rings with a glass middle, glowing when lit, a band of enamel for a coloured one.
  s.posts.forEach((post, i) => {
    const [x, y] = at(post.x, post.z),
      r = (post.kind === "ring" ? 0.15 : 0.24) * scale,
      lit = isLit(s, i);
    if (post.kind === "ring") {
      out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 1.3)}" fill="none" stroke="${ART_LIGHT[post.colour]}" stroke-width="1.4"/><circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.6)}" fill="#c9973f"/>`;
      return;
    }
    if (lit) out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 2.4)}" fill="url(#lc-halo-${stage}-${post.colour})"/>`;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="#c9973f"/>`;
    if (post.colour !== WHITE) out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.8)}" fill="${ART_ENAMEL[post.colour]}"/>`;
    out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.55)}" fill="${lit ? ART_LIGHT[post.colour] : "#5d5650"}"/>`;
    if (post.kind === "counted") out += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r * 0.28)}" fill="#f6f1e4"/>`;
  });
  const halos = ART_LIGHT.map((light, k) => `<radialGradient id="lc-halo-${stage}-${k}"><stop offset="0" stop-color="${light}" stop-opacity="0.85"/><stop offset="1" stop-color="${light}" stop-opacity="0"/></radialGradient>`).join("");
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><defs>${halos}</defs>${out}</svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수", "달인"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told in words.
  NOTES = ["기둥 4~5개", "기둥 6개", "겹치기 금지", "색 고리", "숫자 기둥"];
/** Keys that draw the free end, and which way (screen up is away from the player). */
const ARROWS: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
export const lightCableConfig: PointConfig<State> = {
  game: lightCable,
  // A catch: the soft sound of the cloth cable drawn round brass; a post coming on: a clear glass note; a short
  // circuit: a crackle and a thump.
  contact: (sound, state) => {
    const last = state.last;
    if (last?.short) sound.laser("burst");
    else if (last?.lit.length) sound.glass(3);
    else if (last?.kind === "plug") sound.knock(1);
    else sound.soft(last?.kind === "unwrap" ? 2 : 3);
  },
  solo: true,
  showMovable: false,
  view: (host, quality) => new LightCableView(host, quality),
  colors: CABLE_COLORS,
  // Arrows draw the free end a little that way (through the same sweep as the hand); Enter plugs it into the exit,
  // Backspace frees the last wrap; H plays the hint while the collection's picture is taken.
  keyMove: (key, state) => {
    if (typeof document !== "undefined" && capturing() && (key === "h" || key === "H")) return hint(state);
    if (state.winner !== null) return null;
    const arrow = ARROWS[key];
    if (arrow) {
      keyboard.nudge?.(arrow[0], arrow[1]);
      return null;
    }
    if (key === "Enter") return plugMove();
    if (key === "Backspace") return unwrapMove();
    return null;
  },
  refusal,
  // Wraps reported while the light runs at the end are refused as the game is over; otherwise nothing waits.
  queueMoves: "all",
  puzzle: {
    hint,
    hintText: (state, move) => {
      const m = decode(move, state.posts.length);
      if (m?.kind === "plug") return "힌트 — 기둥이 모두 켜졌습니다. 케이블 끝을 금빛으로 빛나는 출구 소켓에 꽂으세요.";
      if (m?.kind === "unwrap") return "힌트 — 이대로는 모두 밝힐 수 없습니다. 마지막으로 감은 기둥(금빛)에서 케이블을 화살표 쪽으로 풀어 주세요.";
      const post = m ? state.posts[m.post] : null,
        what = post?.kind === "ring" ? "색 고리를" : "기둥을",
        way = m?.side === 1 ? "시계 방향" : "반시계 방향";
      return `힌트 — 금빛 ${what} 화살표 쪽(${way})으로 감으세요.`;
    },
  },
  stagesFirst: true,
  // A card's picture lays its stage out: drawn when the cards are first shown, not as the page opens.
  stages: STAGES.map((_, i) => withLazy({ value: String(i + 1), name: NAMES[i], note: NOTES[i] }, "art", () => workshopArt(i + 1))),
  tallyHtml: () => ["", ""],
  name: "빛 케이블",
  english: "Light Cable",
  number: "NO. 97 — WRAP EVERY PILLAR",
  intro: `<p>어두운 작업대 위의 놋쇠 기둥들과 고압 코일.<br>릴에서 케이블을 끌어 실을 못에 걸듯 기둥에 걸어 감으면, 감긴 기둥에 불이 들어옵니다. 케이블은 늘 팽팽하게 기둥에서 기둥으로 곧게 뻗으니, 감는 차례와 방향을 잘 골라 코일을 피하고 기둥을 모두 밝힌 뒤 출구에 꽂으세요. 게임 'Filament'로 알려진 종류의 퍼즐이고, 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 다섯 단계 · 문제는 무작위 · 언제나 풀림",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>WRAP EVERY PILLAR</span>`,
  artClass: "morris-art",
  artLabel: "빛 케이블 미리보기",
  tableLabel: "THE CABLE WORKSHOP",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "케이블로 기둥을 모두 밝히세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "작업대 위에 놋쇠 <b>기둥</b>과 고압 <b>코일</b>이 서 있습니다. 왼쪽 <b>릴</b>에서 나온 케이블 한 줄로 기둥을 모두 밝히고, 케이블 끝을 오른쪽 <b>출구 소켓</b>에 꽂으면 <b>성공</b>입니다.",
        "케이블 <b>끝(플러그)</b>을 눌러 끌면 손가락을 따라 자유롭게 움직입니다. 케이블은 늘 팽팽해서, 끝을 움직이면 마지막으로 감은 기둥(처음에는 릴)에서 끝까지 <b>곧은 줄</b>로 뻗습니다.",
        "그 곧은 줄이 다른 기둥에 닿으면 실이 못에 걸리듯 케이블이 그 기둥에 <b>걸려 감깁니다</b>. 줄이 기둥의 어느 쪽에서 다가와 걸렸는지에 따라 감기는 방향(시계 방향, 반시계 방향)이 정해집니다.",
        "기둥은 케이블이 <b>감아 돌면</b> 켜집니다. 곁을 곧게 스쳐 지나가는 것만으로는 켜지지 않습니다.",
        "끝을 되돌려 마지막 기둥에서 케이블이 곧게 펴질 만큼 풀면, 그 기둥에서 케이블이 <b>풀려</b> 불이 꺼집니다. 무르기도 마지막 한 번을 되돌립니다.",
        "<b>고압 코일</b>에 케이블이 닿으면 합선되어 <b>실패</b>입니다. 끌고 있는 마지막 줄은 코일 위를 지나도 괜찮지만(빨갛게 번쩍입니다), 그 상태로 다음 기둥에 걸리면 그 줄이 고정되며 합선됩니다. 실패하면 무르기로 되돌리세요.",
        "기둥을 모두 밝혔으면 끝을 출구 소켓에 놓아 꽂으세요. 출구까지 가는 줄이 기둥에 걸리거나 코일에 닿으면 꽂을 수 없습니다.",
        "같은 기둥을 연달아 두 번 감을 수는 없고, 다른 기둥을 거친 뒤라면 다시 감아도 됩니다. <b>어려움</b>부터는 케이블이 <b>자기 자신을 가로질러 겹칠 수 없습니다</b>.",
      ),
    ) +
    part(
      "작업대의 것들",
      table(
        ["흰 기둥", "어느 색 케이블로 감아도 켜집니다."],
        ["색 기둥", "빨강·파랑·초록 띠를 두른 기둥입니다(<b>고수</b>부터). <b>이미 그 색인 케이블</b>로 감아야 켜집니다. 다른 색으로 감아도 되지만 켜지지는 않습니다."],
        ["색 고리", "꼭대기에 색 유리 고리를 얹은 작은 못입니다. 케이블이 감고 지나가면 거기서부터 케이블이 그 색으로 바뀝니다. 고리 자체는 밝힐 필요가 없습니다."],
        ["숫자 기둥", "뚜껑에 2나 3이 적힌 기둥입니다(<b>달인</b>). 그 수만큼 <b>따로따로</b> 감아야 켜집니다. 한 번 감은 뒤 다른 기둥을 거쳐 다시 와서 감으세요. 기둥의 작은 구슬이 감은 횟수만큼 켜집니다."],
        ["고압 코일", "빨강·노랑 경고 띠를 두른 검은 쇠 코일입니다. 케이블이 다가오면 불꽃이 튀고, 고정된 케이블이 닿으면 합선됩니다."],
        ["단계", "<b>쉬움</b> 기둥 4~5개, <b>보통</b> 6개, <b>어려움</b> 7~8개(겹치기 금지), <b>고수</b> 색 고리와 색 기둥, <b>달인</b> 숫자 기둥까지. 위 단계일수록 코일이 많습니다. 문제는 매번 새로 만들어지고 언제나 풀 수 있습니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "끝을 기둥 가까이로 데려와 돌리면 다른 기둥에 걸리지 않고 방향을 바꿀 수 있습니다. 그다음 감을 기둥 쪽으로 쭉 뻗었다가 옆으로 쓸어 걸으세요.",
        "코일 바로 옆을 스치는 길은 위험합니다. 어느 기둥을 어느 쪽으로 감아야 다음 줄이 코일을 비켜 가는지 먼저 살펴보세요.",
        "힌트는 다음에 감을 기둥에 금빛 고리를 켜고, 감을 방향을 화살표로 보여 줍니다. 이미 길이 막혔다면 풀어야 할 기둥을 알려 줍니다.",
      ),
    ),
  help: "마우스·터치: 케이블 끝을 끌어 기둥에 걸고, 출구 소켓에 놓아 꽂습니다<br>키보드: 방향키로 끝을 조금씩, Enter로 꽂기, Backspace로 풀기",
  sides: ["나", ""],
  startWord: "작업대 앞에 서기",
};
