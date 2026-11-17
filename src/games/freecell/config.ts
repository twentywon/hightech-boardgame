import { games } from "../../core/catalog";
import { part, steps, notes, table } from "../../ui/guide";
import { modal } from "../../ui/dialog";
import type { PatienceConfig } from "../../ui/patience";
import { freecellLayout } from "./layout";
import { desk } from "./desk";
import * as F from "./rules";

export interface FreeCellOptions {
  /** "random" for a deal drawn at random, "number" for the one numbered `number`. */
  deal: string;
  number: string;
}
const number = () => String(games.findIndex((g) => g.en === "FREECELL") + 1).padStart(2, "0");
const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E | null;
/** The deal number the form asks for, kept within the classic deals. */
export const dealOf = (text: string) => Math.max(1, Math.min(F.DEALS, Math.floor(Number(text)) || 1));
function rules() {
  modal(
    "여덟 줄을 풀어 무늬별로 모으기",
    part(
      "기본 규칙",
      steps(
        "카드 52장이 모두 펴진 채로 여덟 줄에 깔립니다.",
        "펴진 카드는 <b>숫자가 하나 높고 색이 다른 카드 위</b>나 빈 줄, 빈 프리셀 칸으로 옮길 수 있습니다.",
        "오른쪽 위 모음 자리 네 곳에 무늬별로 <b>A부터 K까지</b> 차례대로 올립니다.",
        "52장을 모두 모음 자리에 올리면 성공입니다. 거의 모든 판을 풀 수 있습니다.",
      ),
    ) +
      part(
        "자리와 카드",
        table(
          ["프리셀 칸", "왼쪽 위 네 칸. 아무 카드나 <b>한 장씩</b> 잠시 놓아 둘 수 있습니다."],
          ["모음 자리", "무늬마다 한 곳씩, A부터 같은 무늬로 쌓습니다. 올린 카드는 내리지 않습니다."],
          ["빈 줄", "아무 카드나, 어떤 묶음이든 놓을 수 있습니다."],
          ["묶음 옮기기", "색을 번갈아 이어진 묶음은 한꺼번에 옮깁니다. 다만 한 장씩 옮겨서 될 만큼만: <b>(빈 프리셀 칸 + 1) × 2<sup>빈 줄 수</sup></b>장까지입니다. 빈 줄로 옮길 때는 그 줄은 세지 않습니다."],
          ["저절로 올리기", "더 이상 줄에서 받침으로 쓰일 일이 없는 카드는 저절로 모음 자리로 올라갑니다."],
          ["두 번 누르기", "카드를 두 번 누르면 모음 자리로, 갈 수 없으면 빈 프리셀 칸으로 보냅니다."],
          ["딜 번호", "판마다 1번부터 32000번까지 번호가 있어 같은 판을 다시 할 수 있습니다. 무작위로 고를 때는 풀 수 없는 단 하나의 판(11982번)은 나오지 않습니다."],
        ),
      ) +
      part(
        "처음이라면",
        notes(
          "프리셀 칸은 아껴 쓰세요. 칸이 찰수록 한꺼번에 옮길 수 있는 장수가 줄어듭니다.",
          "빈 줄은 프리셀 칸보다 값집니다. 묶음을 옮길 수 있는 장수를 두 배로 늘려 줍니다.",
          "A와 2가 깊이 묻힌 줄부터 풀어 가세요.",
          "막히면 힌트를 누르세요. 끝까지 풀리는 길을 찾아 다음 한 수를 보여 줍니다.",
        ),
      ),
  );
}
export const freecellConfig: PatienceConfig<F.State, FreeCellOptions> = {
  id: "freecell",
  title: "프리셀",
  en: "FREECELL",
  setup: (options) =>
    `<section class="featured"><div class="feature-copy"><span class="game-number">NO. ${number()} — PATIENCE</span><h2>프리셀 <span>FreeCell</span></h2><p>모든 카드가 펴진 채 시작하는 혼자 하는 카드놀이.<br>네 칸의 빈자리를 지혜롭게 써서 여덟 줄을 풀어 보세요.</p><div class="game-meta">1인 · 카드 52장 · 여덟 줄</div><div class="ai-options"><label>딜<select id="fc-deal">${[["random", "무작위"], ["number", "번호로 고르기"]].map(([value, label]) => `<option value="${value}" ${options.deal === value ? "selected" : ""}>${label}</option>`).join("")}</select></label><label id="fc-number-row" ${options.deal === "number" ? "" : "hidden"}>딜 번호 (1–${F.DEALS})<input id="fc-number" type="number" inputmode="numeric" min="1" max="${F.DEALS}" step="1" value="${dealOf(options.number)}"></label></div><button id="pc-start" class="primary">테이블에 앉기 <span>↗</span></button></div><div class="feature-art spider-art" role="img" aria-label="프리셀 카드놀이 미리보기"><div class="pk-mini"><i class="bj-mini-card">A<b>♠</b></i><i class="bj-mini-card">K<b>♥</b></i><i class="bj-mini-card">Q<b>♣</b></i><i class="bj-mini-card">J<b>♦</b></i></div><span>FOUR FREE CELLS</span></div></section>`,
  read: () => ({ deal: $<HTMLSelectElement>("fc-deal")?.value === "number" ? "number" : "random", number: String(dealOf($<HTMLInputElement>("fc-number")?.value ?? "1")) }),
  bind(read, remember) {
    const select = $<HTMLSelectElement>("fc-deal"),
      input = $<HTMLInputElement>("fc-number"),
      row = $("fc-number-row");
    if (!select || !input || !row) return;
    select.onchange = () => {
      row.hidden = select.value !== "number";
      remember(read());
    };
    input.onchange = () => {
      input.value = String(dealOf(input.value));
      remember(read());
    };
  },
  create: (options, random) => F.createGame(options.deal === "number" ? dealOf(options.number) : F.randomDeal(random)),
  layout: freecellLayout,
  setting: desk,
  foundations: [0, 1, 2, 3].map((suit) => F.FOUNDATION + suit),
  canPick: F.canPick,
  move: F.move,
  refusal: (state, from, index, to) => F.refusal(state, from, index, to) ?? "그곳에는 놓을 수 없습니다.",
  undo: F.undo,
  autoTarget: F.autoTarget,
  hint(state) {
    const m = F.hint(state);
    return m ? { move: m, text: F.hintText(state, m) } : null;
  },
  later: (state) => state.auto,
  won: (state) => state.won,
  moves: (state) => state.moves,
  stuck: F.stuck,
  stats: (state) => [
    ["딜", `#${state.deal}`],
    ["모은 카드", `${state.piles.slice(F.FOUNDATION, F.COLUMN).reduce((n, cards) => n + cards.length, 0)} / 52`],
  ],
  status: () => "색을 번갈아 내려 쌓고, 무늬별로 A부터 K까지 모으세요.",
  mode: (options) => (options.deal === "number" ? `${dealOf(options.number)}번 딜` : "무작위 딜"),
  rules,
};
