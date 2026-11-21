import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { PICTURE_NAMES } from "./picture";
import { STAGES, arrowMove, hint, slide, stageOf, type State } from "./rules";
import { SLIDE_COLORS, SlideView } from "./view";

/** A small picture of a numbered stage: the tray, its tiles in order and the gap in the corner. */
function numberArt(size: number) {
  const span = 104,
    cell = span / size,
    x0 = 18,
    y0 = 18;
  let tiles = "";
  for (let i = 0; i < size * size - 1; i++) {
    const x = x0 + (i % size) * cell,
      y = y0 + Math.floor(i / size) * cell;
    tiles += `<rect x="${x + 1.2}" y="${y + 1.2}" width="${cell - 2.4}" height="${cell - 2.4}" rx="${cell * 0.14}" fill="#f1dcb4" stroke="#b58a58" stroke-width="0.8"/><text x="${x + cell / 2}" y="${y + cell * 0.68}" text-anchor="middle" font-size="${cell * 0.48}" font-weight="800" font-family="Georgia, serif" fill="#a3291c">${i + 1}</text>`;
  }
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="16" fill="#5e3a22"/><rect x="${x0}" y="${y0}" width="${span}" height="${span}" rx="3" fill="#1f5a3c"/>${tiles}</svg>`;
}
/** A small picture of a picture stage: the scene in a few shapes, cut into its places, the corner left empty. */
function pictureArt(which: number, size: number) {
  const scene =
    which === 1
      ? `<defs><linearGradient id="sl-sky1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#141b46"/><stop offset="0.55" stop-color="#5a4a8a"/><stop offset="0.8" stop-color="#e8a27a"/></linearGradient></defs><rect x="18" y="18" width="104" height="104" fill="url(#sl-sky1)"/><circle cx="92" cy="40" r="11" fill="#fff4cc"/><path d="M18 78 Q40 58 58 70 T96 62 T122 70 V122 H18Z" fill="#4b4680"/><path d="M18 90 Q46 76 70 86 T122 84 V122 H18Z" fill="#2e2f5e"/><path d="M26 98 Q50 86 74 96 L70 92 L30 92Z" fill="#424760"/><rect x="32" y="96" width="40" height="12" fill="#f1b45a"/><rect x="18" y="112" width="104" height="10" fill="#5d5a66"/><circle cx="104" cy="96" r="3" fill="#f07a1e"/><circle cx="110" cy="90" r="3" fill="#f07a1e"/>`
      : `<defs><linearGradient id="sl-sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5aa7e8"/><stop offset="1" stop-color="#cfe8f6"/></linearGradient></defs><rect x="18" y="18" width="104" height="104" fill="url(#sl-sky2)"/><ellipse cx="44" cy="32" rx="14" ry="6" fill="#fff"/><path d="M18 66 Q44 46 70 60 T122 56 V80 H18Z" fill="#5f9a72"/><rect x="18" y="80" width="104" height="42" fill="#5f9fc4"/><path d="M26 84 Q42 70 60 84Z" fill="#3e4d5c"/><rect x="30" y="84" width="3" height="18" fill="#b8442c"/><rect x="52" y="84" width="3" height="18" fill="#b8442c"/><circle cx="104" cy="88" r="12" fill="#f2a9c2"/><circle cx="96" cy="96" r="9" fill="#f7c6d6"/><path d="M80 104 Q88 108 98 104 L96 107 Q88 110 82 107Z" fill="#7a4a26"/>`;
  const span = 104,
    cell = span / size;
  let lines = "";
  for (let k = 1; k < size; k++) lines += `<path d="M${18 + k * cell} 18V122M18 ${18 + k * cell}H122" stroke="#3b2414" stroke-width="2.2"/>`;
  const gap = `<rect x="${18 + (size - 1) * cell}" y="${18 + (size - 1) * cell}" width="${cell}" height="${cell}" fill="#1f5a3c"/>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="16" fill="#5e3a22"/>${scene}${lines}${gap}<rect x="18" y="18" width="104" height="104" fill="none" stroke="#3b2414" stroke-width="2"/></svg>`;
}
const NOTES = ["숫자 여덟 조각", "숫자 열다섯 조각", "숫자 스물네 조각", PICTURE_NAMES[1], PICTURE_NAMES[2]];
export const slideConfig: PointConfig<State> = {
  game: slide,
  // A wooden tile pushed home: the heavier knock, a recording no other game takes.
  contact: (sound) => sound.knock(4),
  solo: true,
  showMovable: false,
  // A tap on a tile in the gap's line pushes it at once.
  autoSingle: true,
  view: (host, quality) => new SlideView(host, quality),
  colors: SLIDE_COLORS,
  keyMove: (key, state) => arrowMove(state, key),
  puzzle: { hint, hintText: "힌트 — 금색 테두리의 조각을 화살표 쪽 빈칸으로 미세요." },
  stagesFirst: true,
  stages: STAGES.map((stage, i) => ({
    value: String(i + 1),
    name: `${stage.size}×${stage.size}${stage.picture ? " 그림" : ""}`,
    note: NOTES[i],
    art: stage.picture ? pictureArt(stage.picture, stage.size) : numberArt(stage.size),
  })),
  tallyHtml: () => ["", ""],
  name: "슬라이딩 퍼즐",
  english: "Sliding Puzzle",
  number: "NO. 76 — SLIDE THEM HOME",
  intro: `<p>나무 쟁반 위의 조각들과 빈칸 하나.<br>빈칸 쪽으로 조각을 밀어 숫자를 차례대로, 또는 그림을 제자리로 맞추세요. '15 퍼즐'로 알려진 오래된 퍼즐이고 문제는 매번 새로 섞입니다.</p>`,
  meta: "1인 · 3×3부터 5×5 · 숫자와 그림 · 언제나 풀림",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>SLIDE THEM HOME</span>`,
  artClass: "morris-art",
  artLabel: "슬라이딩 퍼즐 미리보기",
  tableLabel: "THE STUDY DESK",
  tableNote: (variant) => {
    const stage = STAGES[stageOf(Number(variant)) - 1];
    return `${stage.size}×${stage.size} · ${stage.picture ? PICTURE_NAMES[stage.picture] : "숫자"}`;
  },
  rulesTitle: "조각을 밀어 제자리로",
  rules:
    part(
      "기본 규칙",
      steps(
        "쟁반에는 조각이 <b>한 칸 모자라게</b> 들어 있고, 빈칸이 하나 있습니다.",
        "빈칸과 <b>같은 줄이나 같은 칸줄</b>에 있는 조각을 누르면, 그 조각과 빈칸 사이의 조각이 모두 빈칸 쪽으로 한 칸씩 밀립니다. 한 번 미는 것이 한 수입니다.",
        "조각을 빈칸 쪽으로 끌어도 밀립니다.",
        "숫자 조각은 <b>왼쪽 위부터 1, 2, 3…</b> 차례로, 그림 조각은 그림이 맞게 놓고, 빈칸이 <b>오른쪽 아래</b>에 오면 성공입니다. 그러면 빠져 있던 마지막 조각이 빈칸에 떨어집니다.",
      ),
    ) +
    part(
      "조각과 단계",
      table(
        ["숫자", "3×3, 4×4, 5×5 쟁반입니다. 조각에 적힌 숫자를 차례대로 맞춥니다."],
        ["그림", `3×3은 <b>${PICTURE_NAMES[1]}</b>, 4×4는 <b>${PICTURE_NAMES[2]}</b> 그림을 잘라 만든 조각입니다. 조각 왼쪽 위의 흐린 숫자가 제자리 번호입니다.`],
        ["섞기", "다 맞춰진 쟁반에서 조각을 무작위로 수없이 밀어 섞습니다. 그래서 언제나 풀립니다."],
        ["힌트", "다음에 밀 조각을 금색 테두리와 화살표로 보여 줍니다. 3×3은 가장 짧은 길을, 더 큰 쟁반은 사람이 푸는 순서(윗줄, 왼쪽 칸줄부터)를 따릅니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "큰 쟁반은 <b>맨 윗줄</b>부터 맞춥니다. 그다음 <b>왼쪽 칸줄</b>을 맞추면 한 칸 작은 쟁반이 남습니다.",
        "한 줄의 <b>마지막 두 조각</b>은 함께 맞춥니다. 둘을 나란히 세로로 세워 두었다가 한꺼번에 돌려 넣으면 쉽습니다.",
        "다 맞춘 조각은 되도록 건드리지 않습니다. 빈칸을 아직 맞추지 않은 쪽에서 돌립니다.",
      ),
    ),
  help: "마우스·터치: 빈칸 줄의 조각을 누르거나 빈칸 쪽으로 끕니다<br>키보드: 방향키로 빈칸 옆 조각을 그 방향으로 밉니다",
  sides: ["나", ""],
  startWord: "쟁반 앞에 앉기",
};
