import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { BOSS, HURT, JUMP, PORTAL, SMASH, STAGE_COUNT, STRIKE, TURN, runner, type State } from "./rules";
import { PORTAL_COLORS, paletteOf } from "./palette";
import { HEARTS, N, STAGES, cellOf, createWorld, toWorld } from "./sim";
import { RUNNER_COLORS, RunnerView } from "./view";

const STRIKE_KEYS = new Set([" ", "z", "Z", "j", "J", "ㅋ", "ㅓ"]),
  JUMP_KEYS = new Set(["ArrowUp", "w", "W", "k", "K", "ㅈ", "ㅏ"]);
/** A small picture of a stage's room: its frame, stacks, slopes, holes, pistons and boss, and the runner on the floor. */
function roomArt(stage: number) {
  const world = createWorld(stage),
    palette = paletteOf(stage),
    c = 8,
    o = 6,
    at = (x: number, y: number) => [o + (x + 1) * c, o + (y + 1) * c],
    parts: string[] = [`<rect x="0" y="0" width="140" height="140" rx="14" fill="${palette.ground}"/>`, `<rect x="24" y="18" width="34" height="34" fill="${palette.pale}" opacity="0.5"/><rect x="84" y="80" width="40" height="40" fill="none" stroke="${palette.pale}" stroke-width="3" opacity="0.6"/>`];
  const holes = new Map(world.holes.map((h, i) => [cellOf(h.side, h.col, -1).join(","), PORTAL_COLORS[Math.floor(i / 2) % PORTAL_COLORS.length]]));
  for (let i = -1; i <= N; i++)
    for (let j = -1; j <= N; j++) {
      if (i >= 0 && i < N && j >= 0 && j < N) continue;
      const [x, y] = at(i, j),
        hole = holes.get(`${i},${j}`);
      parts.push(hole ? `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="#0b0a14"/><circle cx="${x + c / 2}" cy="${y + c / 2}" r="2.6" fill="none" stroke="${hole}" stroke-width="1.6"/>` : `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="${(i + j) % 2 ? palette.tileA : palette.tileB}"/>`);
    }
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (world.solid[y * N + x]) {
        const [px, py] = at(x, y);
        parts.push(`<rect x="${px + 0.5}" y="${py + 0.5}" width="${c - 1}" height="${c - 1}" fill="${palette.block}" stroke="${palette.lo}" stroke-width="1"/>`);
      }
  for (const ramp of world.spec.ramps ?? []) {
    const corners = [toWorld(ramp.side, ramp.col, 0), toWorld(ramp.side, ramp.col + 1, 0), toWorld(ramp.side, ramp.col + 1, ramp.to), toWorld(ramp.side, ramp.col, ramp.from)].map(([x, y]) => {
      const [px, py] = at(x - 1, y - 1);
      return `${px},${py}`;
    });
    parts.push(`<polygon points="${corners.join(" ")}" fill="${palette.block}"/>`);
  }
  for (const p of world.spec.pistons ?? []) {
    const [ax, ay] = toWorld(p.side, p.col + 0.15, 0),
      [bx, by] = toWorld(p.side, p.col + 0.85, p.top * 0.7),
      [x0, y0] = at(Math.min(ax, bx) - 1, Math.min(ay, by) - 1),
      [x1, y1] = at(Math.max(ax, bx) - 1, Math.max(ay, by) - 1);
    parts.push(`<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${palette.lo}" stroke="#ffd23f" stroke-width="1.2"/>`);
  }
  if (world.boss) {
    const [bx, by] = at(5.2, 5.2),
      face = 4.6 * c;
    parts.push(
      `<rect x="${bx}" y="${by}" width="${face}" height="${face}" rx="3" fill="#1d1b2e"/><rect x="${bx + face * 0.18}" y="${by + face * 0.3}" width="${face * 0.22}" height="${face * 0.22}" fill="#fff"/><rect x="${bx + face * 0.6}" y="${by + face * 0.3}" width="${face * 0.22}" height="${face * 0.22}" fill="#fff"/><rect x="${bx + face * 0.2}" y="${by + face * 0.68}" width="${face * 0.6}" height="${face * 0.1}" fill="#fff"/><path d="M${bx + face * 0.2} ${by} l${face * 0.1} ${-face * 0.2} l${face * 0.1} ${face * 0.12} l${face * 0.1} ${-face * 0.14} l${face * 0.1} ${face * 0.14} l${face * 0.1} ${-face * 0.12} l${face * 0.1} ${face * 0.2} z" fill="#ffd23f"/>`,
    );
  } else if (world.spec.dark) parts.push(`<rect x="${o + c}" y="${o + c}" width="${N * c}" height="${N * c}" fill="#06060f" opacity="0.6"/><circle cx="${o + c * 4.5}" cy="${o + c * 13.6}" r="${c * 3.2}" fill="${palette.pale}" opacity="0.35"/>`);
  // A few flying squares and the runner on the floor (a cap and a red scarf).
  for (const [x, y, fill] of [[9.5, 4, "#ffffff"], [3.5, 7, "#1d1b2e"], [10.5, 9.5, "#ffffff"]] as const) {
    if (world.boss && x > 4 && x < 10 && y > 4 && y < 10) continue;
    const [px, py] = at(x - 0.4, y - 0.4);
    parts.push(`<rect x="${px}" y="${py}" width="6" height="6" fill="${fill}" stroke="#1d1b2e" stroke-width="1"/>`);
  }
  const [rx, ry] = at(3, 12.6);
  parts.push(`<rect x="${rx}" y="${ry - 2}" width="7" height="4" fill="#ffcf3a"/><rect x="${rx}" y="${ry + 2}" width="6" height="4" fill="#ffd2ad"/><rect x="${rx - 4}" y="${ry + 5}" width="6" height="2" fill="#ef3b4a"/><rect x="${rx}" y="${ry + 6}" width="6" height="5" fill="#3b7be8"/>`);
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${parts.join("")}<text x="12" y="17" font-size="12" font-weight="800" fill="#ffffff" stroke="#1d1b2e" stroke-width="3" paint-order="stroke" font-family="Helvetica, Arial, sans-serif">${stage}</text></svg>`;
}
const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
const noteOf = (i: number) => {
  const spec = STAGES[i];
  return spec.boss ? `보스 · ${spec.note}` : `${spec.time}초 · ${spec.note}`;
};
export const runnerConfig: PointConfig<State> = {
  game: runner,
  solo: true,
  live: true,
  pausable: true,
  noUndo: true,
  noPanel: true,
  newGameLabel: "레벨 선택",
  view: (host, quality) => new RunnerView(host, quality),
  colors: RUNNER_COLORS,
  // A tap of Space, Z or J strikes; ↑, W or K jumps (a key held down does not repeat).
  keyMove: (key, _state, repeat) => (repeat ? null : STRIKE_KEYS.has(key) ? { from: -1, to: STRIKE, extra: -1 } : JUMP_KEYS.has(key) ? { from: -1, to: JUMP, extra: -1 } : null),
  tallyHtml: (state) => [stat("단계", `${state.stage}/${STAGE_COUNT}`) + stat("하트", `${state.hearts}/${HEARTS}`) + (state.bossMax ? stat("보스", `${state.boss}/${state.bossMax}`) : stat("남은 시간", `${state.left}초`)), ""],
  // Chiptune sounds of its own: a swish, a thwack on a square, a spring, a tumble, a hurt, a blow on the boss, a portal.
  contact: (sound, state) => {
    const kind = ({ [STRIKE]: "swish", [SMASH]: "smash", [JUMP]: "jump", [TURN]: "turn", [HURT]: "hurt", [BOSS]: "boss", [PORTAL]: "portal" } as const)[state.last ?? -1];
    if (kind) sound.runner(kind);
  },
  // 레벨 선택 shows the ten rooms; the first is laid on sitting down.
  stages: STAGES.map((spec, i) => ({ value: String(i + 1), name: `${i + 1}. ${spec.name}`, note: noteOf(i), art: roomArt(i + 1) })),
  name: "네모 러너",
  english: "Square Runner",
  number: "NO. 93 — RUN THE ROOM",
  intro: `<p>네모난 방 안을 꼬마 러너가 쉬지 않고 달립니다. 바닥에서 벽으로, 천장으로, 다시 벽으로.<br>날아오는 네모는 쳐내고, 벽 앞에서는 뛰어올라 벽을 타세요. 게임빌의 '놈3' 같은 버튼 하나짜리 달리기 게임입니다.</p>`,
  meta: `1인 · 스테이지 ${STAGE_COUNT}개 · 하트 ${HEARTS}개 · 실시간`,
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>RUN THE ROOM</span>`,
  artClass: "hexa-art",
  artLabel: "네모 러너 미리보기",
  tableLabel: "THE ROOM",
  tableNote: (variant) => {
    const i = Math.max(1, Math.min(STAGE_COUNT, Number(variant) || 1)) - 1;
    return `${i + 1}단계 ${STAGES[i].name}`;
  },
  rulesTitle: "벽을 타고 끝까지 버티세요",
  rules:
    part(
      "기본 규칙",
      steps(
        "러너는 방의 안쪽 면을 따라 <b>저절로 달립니다</b>. 바닥에서 오른쪽 벽, 천장, 왼쪽 벽 순서로 방을 빙 돕니다. 화면은 돌지 않고 러너가 돕니다.",
        "<b>판을 탭하면</b> 앞을 주먹으로 치고(공중에서는 발차기), <b>위로 쓸어 올리면</b> 점프합니다.",
        "앞에 벽이 가까울 때 점프하면 <b>90도 돌아 그 벽에 올라타</b> 계속 달립니다. 점프하지 않고 벽에 부딪히면 하트 하나를 잃고 벽 위에 올려집니다.",
        "날아오는 <b>네모</b>는 쳐내야 합니다. 몸에 닿으면 하트 하나를 잃고 잠시 깜빡이며 무적이 됩니다.",
        `하트는 ${HEARTS}개입니다. 정해진 시간을 하트가 남은 채로 버티면 성공, 하트를 모두 잃으면 실패입니다. 점수는 없습니다.`,
        "<b>보스 단계</b>에는 시간이 없습니다. 보스가 던지는 네모를 쳐내면 보스에게 날아가 맞습니다. 보스를 쓰러뜨리면 성공입니다.",
      ),
    ) +
    part(
      "치기와 점프",
      table(
        ["치기", "탭 한 번(키보드는 스페이스·Z·J). 러너 앞 두 칸쯤과 머리 위까지 닿습니다. 두 번 잇달아 치면 두 번째는 발차기입니다."],
        ["점프", "판을 위로 쓸어 올립니다(키보드는 ↑·W·K). 러너가 어느 면에 있든 화면 위로 쓸면 됩니다."],
        ["벽 타기", "앞 벽까지 세 칸 안쪽에서 점프하면 곧바로 벽에 올라탑니다. 점프한 채로 벽에 닿아도 올라탑니다."],
        ["너그러운 점프", "턱에서 막 떨어진 순간이나, 착지 직전에 누른 점프도 들어갑니다."],
      ),
    ) +
    part(
      "방 안의 것들",
      table(
        ["낮은 기둥", "한두 칸 높이의 기둥과 계단은 저절로 오르내립니다."],
        ["높은 기둥", "세 칸 이상은 점프로 넘어야 합니다. 부딪히면 하트를 잃고 튕겨 넘어갑니다."],
        ["비탈", "오르막과 내리막을 그대로 따라 달립니다."],
        ["구멍", "테두리에 뚫린 구멍에 빠지면 같은 색 고리가 있는 다른 구멍에서 튀어나옵니다. 점프로 건너뛸 수도 있습니다."],
        ["피스톤", "강철 띠가 감긴 기둥이 오르내립니다. 높이 올라와 있을 때는 점프로 넘습니다."],
        ["가속 띠", "노란 화살표가 그려진 곳에서는 빨라집니다."],
        ["어두운 방", "러너 둘레만 보입니다. 네모는 테두리만 희미하게 빛납니다."],
        ["방향 전환", "'방향이 바뀝니다!'가 깜빡이면 곧 반대쪽으로 달립니다."],
      ),
    ) +
    part(
      "네모",
      table(
        ["흰 네모·검은 네모", "곧게 날아다니며 벽과 기둥에 튕깁니다."],
        ["빨간 눈 네모", "러너를 천천히 따라옵니다."],
        ["도는 네모", "노란 네모 넷이 한데 돌면서 떠다닙니다."],
        ["파란 네모", "천장 쪽에서 아래로 떨어집니다."],
        ["나타날 때", "점선 테두리로 깜빡이는 동안은 닿아도 괜찮고 칠 수도 없습니다."],
        ["연쇄", "쳐낸 네모가 다른 네모에 맞으면 그것도 함께 날아갑니다."],
        ["보스", "보스는 눈이 빨개진 뒤 네모를 던집니다. 보스 몸에 닿아도 하트를 잃습니다."],
      ),
    ) +
    part("단계", table(...STAGES.map((spec, i): [string, string] => [`${i + 1}. ${spec.name}`, noteOf(i)]), ["고르기", "위쪽의 <b>레벨 선택</b>을 누르면 열 개의 방이 그림으로 나옵니다."])) +
    part("처음이라면", notes("1단계 연습 방에서 말풍선이 언제 탭하고 언제 쓸어 올릴지 알려 줍니다.", "벽이 보이면 너무 일찍도 늦지도 않게, 벽까지 서너 걸음 남았을 때 쓸어 올립니다.", "네모는 러너 앞으로 다가올 때 치면 됩니다. 뒤에서 오는 네모는 점프로 피합니다.", "보스 단계에서는 피하기보다 쳐내는 쪽이 빨리 끝납니다.")),
  help: "탭: 주먹·발차기 · 위로 쓸기: 점프<br>키보드: 스페이스·Z·J 치기, ↑·W·K 점프, P 일시정지",
  sides: ["나", ""],
  startWord: "방에 들어가기",
};
