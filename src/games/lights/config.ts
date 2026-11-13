import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { SIZES, hint, lights, type State } from "./rules";
import { LIGHT_COLORS, LightsView } from "./view";

/** A small picture of a stage: a board of its size with a cross of lamps lit. */
function boardArt(size: number) {
  const cell = 104 / size,
    mid = Math.floor(size / 2),
    lit = (r: number, c: number) => Math.abs(r - mid) + Math.abs(c - mid) <= 1 || (r + c * 2) % 5 === 0;
  let lamps = "";
  for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) lamps += `<rect x="${18 + c * cell + 1.5}" y="${18 + r * cell + 1.5}" width="${cell - 3}" height="${cell - 3}" rx="${cell * 0.16}" fill="${lit(r, c) ? "#ffc94a" : "#3a4352"}"/>`;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="6" y="6" width="128" height="128" rx="14" fill="#1b1f26"/>${lamps}</svg>`;
}
export const lightsConfig: PointConfig<State> = {
  game: lights,
  solo: true,
  showMovable: false,
  view: (host, quality) => new LightsView(host, quality),
  colors: LIGHT_COLORS,
  keyPoints: (state) => state.on.map((_, i) => ({ x: i % state.size, z: Math.floor(i / state.size) })),
  contact: (sound) => sound.plastic(),
  puzzle: { hint, hintText: "힌트 — 빨간 고리가 쳐진 불을 누르세요." },
  stagesFirst: true,
  stages: SIZES.map((size, i) => ({ value: String(i + 1), name: `${size}×${size}`, note: `불 ${size * size}개`, art: boardArt(size) })),
  tallyHtml: (state) => [`<span class="solo-stat"><small>누른 횟수</small><b>${state.ply}</b></span><span class="solo-stat"><small>최소 횟수</small><b>${state.best}</b></span>`, ""],
  name: "불 끄기",
  english: "Lights Off",
  number: "NO. 44 — EVERY LAMP OUT",
  intro: `<p>어두운 방의 네모난 등불 판.<br>하나를 누르면 그 불과 위아래·좌우의 불이 함께 뒤집힙니다. 모두 끄세요. '라이츠 아웃'으로 알려진 퍼즐입니다.</p>`,
  meta: "1인 · 3×3부터 7×7 · 문제는 무작위",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>EVERY LAMP OUT</span>`,
  artClass: "hexa-art",
  artLabel: "불 끄기 미리보기",
  tableLabel: "THE LAMP PANEL",
  tableNote: (variant) => {
    const size = SIZES[Math.max(1, Math.min(SIZES.length, Number(variant) || 1)) - 1];
    return `${size}×${size} · 무작위 문제`;
  },
  rulesTitle: "누르면 이웃까지 뒤집힙니다",
  rules:
    part("기본 규칙", steps("판에 불이 여럿 켜져 있습니다.", "불 하나를 누르면 <b>그 불과 위·아래·왼쪽·오른쪽 불</b>이 함께 뒤집힙니다. 켜진 불은 꺼지고 꺼진 불은 켜집니다.", "가장자리에서는 판 안에 있는 이웃만 뒤집힙니다.", "불을 <b>모두 끄면</b> 성공입니다.")) +
    part("판과 횟수", table(["판의 크기", "앉을 때와 <b>새 게임</b>에서 3×3부터 7×7까지 고릅니다."], ["무작위 문제", "문제는 할 때마다 새로 만들어집니다. 꺼진 판에서 불을 눌러 만든 것이라 반드시 풀립니다."], ["누른 횟수 · 최소 횟수", "오른쪽 판에 지금까지 누른 횟수와, 이 문제를 풀 수 있는 가장 적은 횟수가 나란히 나옵니다."])) +
    part("오른쪽 판", table(["힌트", "가장 빨리 끄는 길에서 눌러야 할 불 하나에 빨간 고리가 쳐집니다."], ["무르기 · 처음부터", "한 번씩 되돌리거나, 처음 상태로 되돌립니다."], ["다른 퍼즐 · 다음 스테이지", "같은 크기의 새 문제가 나옵니다."])) +
    part("처음이라면", notes("같은 불을 <b>두 번 누르면 제자리</b>입니다. 그러니 어떤 불이든 한 번 누르거나 안 누르거나 둘 중 하나입니다.", "누르는 <b>순서는 상관없습니다</b>. 어떤 불들을 누를지만 정하면 됩니다.", "맨 윗줄부터 차례로: 윗줄에 켜진 불이 있으면 바로 아래 칸을 눌러 끄면서 내려갑니다. 마지막 줄에 남은 불은 맨 윗줄을 다시 눌러 맞춥니다.")),
  help: "마우스·터치: 불을 누릅니다<br>키보드: 방향키로 고르고 Enter",
  sides: ["나", ""],
  startWord: "등불 판 앞에 앉기",
};
