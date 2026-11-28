import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { FROG_PAINTS, landingAfter } from "./layout";
import { NONE, STAGES, frogHop, hint, stageOf, type State } from "./rules";
import { FROG_COLORS, FrogView } from "./view";

/**
 * A small picture of a stage: dusk over a swamp, a far bank of trees, and the stage's row of stumps standing in the
 * water, each with a ribbon in its colour (or bare), frogs sitting on most of them, out of place.
 */
function swampArt(stage: number) {
  const { stumps } = STAGES[stage - 1],
    // The ribbons of the picture, and which frog sits on each stump (a fixed muddle for each stage).
    ribbons = [
      [0, 3, NONE, 5, 2],
      [4, 0, 6, NONE, 3, 1],
      [2, 5, 0, 7, NONE, 3, 4],
      [1, 6, NONE, 4, 0, 1, 5, NONE, 6],
    ][stage - 1],
    sitting = [
      [3, NONE, 5, 2, 0],
      [0, 3, NONE, 1, 6, 4],
      [5, 0, NONE, 2, 3, 4, 7],
      [6, NONE, 0, 1, 4, 5, NONE, 6, 1],
    ][stage - 1],
    tops = [0, 6, -4, 3, -2, 7, -5, 4, -1],
    span = 112,
    step = span / stumps,
    w = Math.min(15, step * 0.7),
    id = `frog-sky-${stage}`;
  let row = "";
  ribbons.forEach((ribbon, i) => {
    const x = 14 + step * (i + 0.5),
      top = 84 + tops[i],
      frog = sitting[i];
    row += `<ellipse cx="${x}" cy="114" rx="${w * 0.75}" ry="2.4" fill="#7c6d8e" opacity="0.35"/>`;
    row += `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${114 - top}" fill="#5d4130"/><ellipse cx="${x}" cy="${top}" rx="${w / 2}" ry="${w * 0.2}" fill="#c99a62"/>`;
    if (ribbon !== NONE) row += `<rect x="${x - w / 2 - 0.5}" y="${top + 5}" width="${w + 1}" height="3.4" fill="${FROG_PAINTS[ribbon].paint}"/>`;
    if (frog !== NONE) {
      const s = w / 15,
        y = top - 1;
      row += `<ellipse cx="${x}" cy="${y - 4 * s}" rx="${6.2 * s}" ry="${4.6 * s}" fill="${FROG_PAINTS[frog].paint}"/><ellipse cx="${x}" cy="${y - 2.6 * s}" rx="${3.6 * s}" ry="${2.4 * s}" fill="#fff1d8" opacity="0.8"/>`;
      for (const e of [-1, 1]) row += `<circle cx="${x + e * 2.9 * s}" cy="${y - 8.4 * s}" r="${2.2 * s}" fill="#fbfaf3"/><circle cx="${x + e * 3 * s}" cy="${y - 8.2 * s}" r="${1.2 * s}" fill="#141414"/>`;
    }
  });
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5b4c7d"/><stop offset="0.55" stop-color="#c88b8a"/><stop offset="0.56" stop-color="#2f4a47"/><stop offset="1" stop-color="#1c3330"/></linearGradient></defs><rect x="6" y="6" width="128" height="128" rx="14" fill="url(#${id})"/><path d="M6 80 Q20 70 34 76 T62 74 T92 72 T120 76 T134 74 V82 H6 Z" fill="#2a3426" opacity="0.85"/><rect x="6" y="81" width="128" height="3" fill="#e8b38c" opacity="0.35"/>${row}<circle cx="28" cy="40" r="1.6" fill="#eaff9c"/><circle cx="110" cy="52" r="1.3" fill="#eaff9c"/><circle cx="96" cy="34" r="1.1" fill="#eaff9c"/></svg>`;
}
const NAMES = ["쉬움", "보통", "어려움", "고수"],
  // No counts of moves are shown (the user asked for none in the puzzles): the stages are told in words.
  NOTES = ["그루터기 다섯 개", "그루터기 여섯 개", "그루터기 일곱 개", "아홉 개 · 같은 색 둘"];
export const frogConfig: PointConfig<State> = {
  game: frogHop,
  // Heard as the frog leaves its stump (the view calls it then): a springy 폴짝 and its soft landing, not a knock on wood (the user asked).
  contact: (sound, state) => {
    const last = state.last;
    if (!last) return;
    const land = landingAfter(last.from, last.to);
    sound.leap(Math.abs(last.to - last.from) === 2, land);
    if (state.winner === 0) sound.croak(land);
  },
  solo: true,
  showMovable: false,
  // A frog with one way to go goes at once (the view does the same for a tap); one with two is picked, then its stump.
  autoSingle: true,
  view: (host, quality) => new FrogView(host, quality),
  colors: FROG_COLORS,
  keyPoints: (state) => state.frogs.map((_, i) => ({ x: i, z: 0 })),
  puzzle: { hint, hintText: "힌트 — 금색 고리의 개구리를 금색 화살표를 따라 옮기세요." },
  stagesFirst: true,
  stages: STAGES.map((_, i) => ({ value: String(i + 1), name: NAMES[i], note: NOTES[i], art: swampArt(i + 1) })),
  tallyHtml: () => ["", ""],
  name: "개구리 징검다리",
  english: "Frog Hop",
  number: "NO. 79 — EVERY FROG TO ITS OWN STUMP",
  intro: `<p>안개 낀 저녁 늪, 한 줄로 선 나무 그루터기.<br>개구리를 옆 그루터기로 폴짝 뛰게 하거나 개구리 하나를 뛰어넘게 해서, 모두 제 색 리본이 묶인 그루터기에 앉히세요. 오래된 퍼즐이고 문제는 매번 새로 만들어집니다.</p>`,
  meta: "1인 · 그루터기 5~9개 · 문제는 무작위 · 언제나 풀림",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>EVERY FROG TO ITS OWN STUMP</span>`,
  artClass: "morris-art",
  artLabel: "개구리 징검다리 미리보기",
  tableLabel: "THE MISTY SWAMP",
  tableNote: (variant) => `${NAMES[stageOf(Number(variant)) - 1]} · 무작위 문제`,
  rulesTitle: "개구리를 제자리로",
  rules:
    part(
      "기본 규칙",
      steps(
        "그루터기마다 <b>리본</b>이 묶여 있고, 리본의 색과 무늬가 그 그루터기의 주인을 알려 줍니다. 리본이 없는 그루터기도 있습니다.",
        "개구리는 바로 옆 그루터기가 비어 있으면 그리로 <b>폴짝</b> 뜁니다.",
        "옆에 개구리가 있으면 그 <b>개구리 하나를 뛰어넘어</b> 바로 너머의 빈 그루터기에 앉을 수 있습니다.",
        "<b>두 마리를 한꺼번에</b> 뛰어넘거나 빈 그루터기를 건너뛸 수는 없습니다.",
        "개구리가 <b>모두</b> 제 색 리본의 그루터기에 앉으면 성공입니다. 리본 없는 그루터기는 비게 됩니다.",
      ),
    ) +
    part(
      "늪의 것들",
      table(
        ["리본과 무늬", "색마다 무늬가 하나씩 있습니다(동그라미, 세모, 별, 네모, 마름모, 십자, 하트, 초승달). 리본의 장식과 개구리가 목에 건 메달에 같은 무늬가 있어, 색을 구별하기 어려워도 짝을 찾을 수 있습니다."],
        ["같은 색 둘", "<b>고수</b>에서는 두 가지 색의 개구리가 두 마리씩 있습니다. 같은 색 개구리는 그 색 그루터기 어느 쪽에 앉아도 됩니다."],
        ["단계", "<b>쉬움</b>에서 <b>고수</b>로 갈수록 그루터기와 개구리가 늘고, 모두 제자리로 보내기까지 더 많이 뛰어야 하는 문제가 나옵니다. 고수에는 빈 그루터기가 둘입니다."],
        ["무작위 문제", "리본을 무작위로 묶은 뒤, 뛰어서 닿을 수 있는 모든 배치를 따져 단계에 맞는 배치를 고릅니다. 그래서 언제나 풀립니다."],
      ),
    ) +
    part(
      "처음이라면",
      notes(
        "빈 그루터기가 움직이는 길을 따라가 보세요. 개구리가 뛸 때마다 빈자리는 한 칸이나 두 칸 옮겨 갑니다.",
        "개구리 하나를 뛰어넘으면 두 개구리의 순서가 바뀝니다. 순서를 바꾸고 싶은 두 마리 옆에 빈자리를 데려오세요.",
        "끝에 있는 그루터기부터 채우면 나머지가 쉬워집니다.",
      ),
    ),
  help: "마우스·터치: 갈 곳이 하나뿐인 개구리는 누르면 바로 뜁니다. 갈 곳이 둘이면 개구리를 누른 뒤 앉을 그루터기를 누르거나, 개구리를 그루터기까지 끌어다 놓습니다<br>키보드: ←→로 그루터기를 고르고 Enter",
  sides: ["나", ""],
  startWord: "늪으로 가기",
};
