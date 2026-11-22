import { allGames as games } from "../../core/catalog";
import { part, steps, notes, table } from "../../ui/guide";
import { modal } from "../../ui/dialog";
import type { PatienceConfig } from "../../ui/patience";
import { klondikeLayout } from "./layout";
import { study } from "./study";
import * as K from "./rules";

export interface KlondikeOptions {
  /** "1" or "3": how many cards a turn of the stock brings. */
  draw: string;
}
const number = () => String(games.findIndex((g) => g.en === "KLONDIKE") + 1).padStart(2, "0");
const $ = <E extends HTMLElement>(id: string) => document.getElementById(id) as E | null;
function rules() {
  modal(
    "일곱 줄을 풀어 무늬별로 모으기",
    part(
      "기본 규칙",
      steps(
        "카드 52장 가운데 28장이 일곱 줄에 한 장부터 일곱 장까지 깔립니다. 줄마다 맨 아래 한 장만 펴져 있고, 나머지 24장은 왼쪽 위 더미에 엎어져 있습니다.",
        "펴진 카드는 <b>숫자가 하나 높고 색이 다른 카드 위</b>로 옮길 수 있습니다. 이어진 묶음은 한꺼번에 옮깁니다.",
        "오른쪽의 모음 자리 네 곳에 무늬별로 <b>A부터 K까지</b> 차례대로 올립니다.",
        "52장을 모두 모음 자리에 올리면 성공입니다.",
      ),
    ) +
      part(
        "자리와 카드",
        table(
          ["더미", "누를 때마다 카드를 넘긴 카드 자리로 넘깁니다(설정에 따라 한 장 또는 세 장). 다 넘기면 넘긴 카드가 다시 더미로 돌아가며, 횟수에는 제한이 없습니다."],
          ["넘긴 카드", "맨 위 한 장만 줄이나 모음 자리로 옮길 수 있습니다."],
          ["모음 자리", "무늬마다 한 곳씩, A부터 같은 무늬로 쌓습니다. 맨 위 카드는 필요하면 줄로 다시 내릴 수 있습니다."],
          ["빈 줄", "<b>K</b>나 K로 시작하는 묶음만 놓을 수 있습니다."],
          ["엎어진 카드", "위가 비면 저절로 펴집니다."],
          ["두 번 누르기", "카드를 두 번 누르면 갈 수 있는 모음 자리로 바로 올라갑니다."],
        ),
      ) +
      part("넘기는 장수", table(["1장", "더미를 누를 때마다 한 장씩 넘깁니다. 더미의 어느 카드든 차례가 옵니다."], ["3장", "세 장씩 넘기고 맨 위 한 장만 쓸 수 있습니다. 훨씬 어렵습니다."])) +
      part(
        "처음이라면",
        notes(
          "엎어진 카드가 많은 줄부터 풀어 가세요.",
          "빈 줄은 K를 놓을 자리입니다. 옮길 K가 없다면 서둘러 비울 필요는 없습니다.",
          "모음 자리로 너무 일찍 올리면 줄에서 받침이 모자랄 수 있습니다.",
          "모든 카드가 펴지고 더미가 비면 남은 카드는 저절로 모음 자리로 올라갑니다.",
          "판은 되도록 풀 수 있는 것으로 골라 나눠 주지만, 길을 잘못 들면 막힐 수 있습니다. 무르기는 몇 번이든 됩니다.",
        ),
      ),
  );
}
export const klondikeConfig: PatienceConfig<K.State, KlondikeOptions> = {
  id: "klondike",
  title: "클론다이크",
  en: "KLONDIKE",
  setup: (options) =>
    `<section class="featured"><div class="feature-copy"><span class="game-number">NO. ${number()} — PATIENCE</span><h2>클론다이크 <span>Klondike Solitaire</span></h2><p>가장 널리 알려진 혼자 하는 카드놀이.<br>일곱 줄을 풀어 A부터 K까지 무늬별로 모으세요.</p><div class="game-meta">1인 · 카드 52장 · 일곱 줄</div><div class="ai-options"><label>한 번에 넘기는 카드<select id="kl-draw">${[["1", "1장"], ["3", "3장"]].map(([value, label]) => `<option value="${value}" ${options.draw === value ? "selected" : ""}>${label}</option>`).join("")}</select></label></div><button id="pc-start" class="primary">테이블에 앉기 <span>↗</span></button></div><div class="feature-art spider-art" role="img" aria-label="클론다이크 카드놀이 미리보기"><div class="pk-mini"><i class="bj-mini-card back"></i><i class="bj-mini-card">K<b>♠</b></i><i class="bj-mini-card">Q<b>♥</b></i><i class="bj-mini-card">J<b>♣</b></i><i class="bj-mini-card">10<b>♦</b></i></div><span>ACE UP TO KING</span></div></section>`,
  read: () => ({ draw: $<HTMLSelectElement>("kl-draw")?.value === "3" ? "3" : "1" }),
  bind(read, remember) {
    const select = $<HTMLSelectElement>("kl-draw");
    if (select) select.onchange = () => remember(read());
  },
  create: (options, random) => K.createGame(options.draw, random),
  layout: klondikeLayout,
  setting: study,
  foundations: [0, 1, 2, 3].map((suit) => K.FOUNDATION + suit),
  canPick: K.canPick,
  move: K.move,
  refusal(state, from, index, to) {
    const card = state.piles[from][index],
      run = state.piles[from].length - index;
    if (K.isFoundation(to)) return run > 1 ? "모음 자리에는 한 장씩 올립니다." : `모음 자리에는 같은 무늬로 A부터 차례대로 올립니다.`;
    if (!K.isTableau(to)) return "그곳에는 놓을 수 없습니다.";
    if (!state.piles[to].length) return card.rank === 13 ? "그곳에는 놓을 수 없습니다." : "빈 줄에는 K만 놓을 수 있습니다.";
    return "숫자가 하나 높고 색이 다른 카드 위에 놓으세요.";
  },
  undo: K.undo,
  autoTarget: K.autoTarget,
  tap: (state, pile) => (pile === K.STOCK ? K.turn(state) : null),
  hint(state) {
    const m = K.hint(state);
    return m ? { move: "turn" in m ? { from: K.STOCK, index: 0, to: null } : m, text: K.hintText(state, m) } : null;
  },
  finish: (state) => (K.open(state) ? K.homeward(state) : null),
  won: (state) => state.won,
  moves: (state) => state.moves,
  stuck: K.stuck,
  stats: (state) => [
    ["모은 카드", `${state.piles.slice(K.FOUNDATION, K.TABLEAU).reduce((n, cards) => n + cards.length, 0)} / 52`],
    ["남은 더미", `${state.piles[K.STOCK].length}장`],
  ],
  status: () => "색을 번갈아 내려 쌓고, 무늬별로 A부터 K까지 모으세요.",
  mode: (options) => `한 번에 ${options.draw === "3" ? 3 : 1}장씩 넘기기`,
  rules,
};
