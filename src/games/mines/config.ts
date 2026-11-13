import { part, steps, notes, table } from "../../ui/guide";
import type { PointConfig } from "../../ui/point-game";
import { FIELDS, FLAG, flags, mines, opened, type State } from "./rules";
import { MINE_COLORS, MinesView } from "./view";

const stat = (label: string, value: string | number) => `<span class="solo-stat"><small>${label}</small><b>${value}</b></span>`;
/** A small picture of a field: its squares, a patch opened and a flag. */
function fieldArt(rows: number, cols: number) {
  const cell = Math.min(116 / cols, 116 / rows),
    x0 = 70 - (cols * cell) / 2,
    y0 = 70 - (rows * cell) / 2;
  let squares = "";
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const open = r < rows / 2 && c < cols / 2 && r + c < rows / 2 + 1;
      squares += `<rect x="${x0 + c * cell + 0.5}" y="${y0 + r * cell + 0.5}" width="${cell - 1}" height="${cell - 1}" fill="${open ? "#f1e3c2" : (r + c) % 2 ? "#63ad4c" : "#70ba56"}"/>`;
    }
  const fx = x0 + (cols - 2.5) * cell,
    fy = y0 + (rows - 2.5) * cell;
  return `<svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="4" width="132" height="132" rx="14" fill="#5a3a22"/>${squares}<path d="M${fx} ${fy} l${cell * 0.9} ${cell * 0.4} l${-cell * 0.9} ${cell * 0.4} z" fill="#e2362c"/><rect x="${fx - 1}" y="${fy}" width="2" height="${cell * 1.3}" fill="#3a2c22"/></svg>`;
}
export const minesConfig: PointConfig<State> = {
  game: mines,
  solo: true,
  noUndo: true,
  showMovable: false,
  view: (host, quality) => new MinesView(host, quality),
  colors: MINE_COLORS,
  keyPoints: (state) => state.open.map((_, i) => ({ x: i % state.cols, z: Math.floor(i / state.cols) })),
  // F switches between opening and flagging.
  keyMove: (key, state) => ((key === "f" || key === "F" || key === "ㄹ") && state.winner === null ? { from: -1, to: FLAG, extra: -1 } : null),
  contact: (sound, state) => (state.winner === 1 ? sound.explosion() : state.flagging ? sound.plastic() : sound.tap()),
  stages: FIELDS.map((field, i) => ({ value: String(i + 1), name: field.name, note: `${field.cols}×${field.rows} · 지뢰 ${field.mines}개`, art: fieldArt(field.rows, field.cols) })),
  tools: [{ label: "깃발 꽂기", point: FLAG, show: (state) => state.winner === null, text: (state) => (state.flagging ? "깃발 끄기" : "깃발 꽂기") }],
  tallyHtml: (state) => [stat("남은 지뢰", state.mines - flags(state)) + stat("연 칸", `${opened(state)}/${state.rows * state.cols - state.mines}`), ""],
  name: "지뢰찾기",
  english: "Minesweeper",
  number: "NO. 45 — READ THE NUMBERS",
  intro: `<p>잔디로 덮인 밭 어딘가에 지뢰가 묻혀 있습니다.<br>숫자를 읽어 지뢰를 피해 가며 나머지 칸을 모두 여세요.</p>`,
  meta: "1인 · 세 가지 크기 · 첫 칸은 안전",
  art: `<div class="pg-mini"><i></i><i></i><i></i></div><span>READ THE NUMBERS</span>`,
  artClass: "morris-art",
  artLabel: "지뢰찾기 미리보기",
  tableLabel: "THE FIELD",
  tableNote: (variant) => {
    const field = FIELDS[Math.max(1, Math.min(FIELDS.length, Number(variant) || 1)) - 1];
    return `${field.name} · ${field.cols}×${field.rows} · 지뢰 ${field.mines}개`;
  },
  rulesTitle: "숫자는 둘레의 지뢰 수입니다",
  rules:
    part("기본 규칙", steps("칸을 누르면 열립니다. <b>지뢰가 있는 칸을 열면 끝</b>입니다.", "열린 칸의 <b>숫자</b>는 그 칸을 둘러싼 여덟 칸에 묻힌 지뢰의 수입니다.", "숫자가 없는 칸은 둘레에 지뢰가 없다는 뜻이라, 둘레 칸까지 <b>저절로 넓게</b> 열립니다.", "지뢰가 없는 칸을 <b>모두 열면</b> 성공입니다. 깃발은 꽂지 않아도 됩니다.", "<b>첫 칸은 언제나 안전</b>합니다. 지뢰는 첫 칸을 연 뒤에, 그 칸과 둘레를 피해 묻힙니다.")) +
    part("깃발과 숫자", table(["깃발 꽂기", "판 오른쪽 아래의 <b>깃발 꽂기</b>를 누르면(키보드 F) 누르는 칸에 깃발이 꽂힙니다. 다시 누르면 뽑힙니다. 버튼을 한 번 더 누르면 여는 쪽으로 돌아옵니다."], ["깃발 꽂힌 칸", "실수로 열리지 않습니다."], ["숫자 눌러 열기", "열린 숫자 둘레에 그 수만큼 깃발이 꽂혀 있으면, 그 숫자를 눌러 <b>둘레의 나머지 칸을 한꺼번에</b> 엽니다. 깃발이 틀렸다면 지뢰가 터집니다."], ["남은 지뢰", "오른쪽 판의 수는 지뢰 수에서 꽂은 깃발 수를 뺀 것입니다."])) +
    part("크기", table(...FIELDS.map((field): [string, string] => [field.name, `${field.cols}×${field.rows}칸, 지뢰 ${field.mines}개`]), ["고르기", "위쪽의 <b>새 게임</b>을 누르면 세 크기가 그림으로 나옵니다. 처음 앉으면 쉬움입니다."])) +
    part("끝났을 때", table(["지뢰를 밟으면", "밟은 칸이 빨갛게 되고 모든 지뢰가 드러납니다. 잘못 꽂은 깃발에는 가위표가 쳐집니다."], ["다 열면", "남은 지뢰 자리에 깃발이 꽂힙니다."])) +
    part("처음이라면", notes("모서리의 <b>1</b> 옆에 닫힌 칸이 하나뿐이면 그 칸이 지뢰입니다.", "숫자만큼 깃발을 이미 꽂았다면 그 숫자 둘레의 나머지 칸은 안전합니다.", "확실한 칸이 없을 때는 닫힌 칸이 많이 붙은 숫자보다, 넓게 비어 있는 쪽을 엽니다.")),
  help: "마우스·터치: 칸을 눌러 엽니다. 깃발 꽂기 버튼으로 깃발을 꽂습니다<br>키보드: 방향키·Enter, F로 깃발 꽂기 전환",
  sides: ["나", ""],
  startWord: "밭에 들어서기",
};
