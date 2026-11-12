import { mirrorStatus } from "./banner";
import {
  MAX_BET,
  MIN_BET,
  START_CHIPS,
  addBet,
  createSession,
  deal,
  dealerCards,
  dealerShown,
  double,
  doubleError,
  handValue,
  hit,
  isBlackjack,
  isBroke,
  nextRound,
  rebet,
  setBet,
  split,
  splitError,
  stand,
  type Card,
  type Random,
  type Result,
  type State,
} from "../games/blackjack/rules";
import { cryptoRandom } from "../games/blackjack/shoe";
import {
  BlackjackView,
  type TableModel,
  type Tone,
} from "../games/blackjack/view";
import { Sound } from "../engine/sound";
import { modal, setupDialog } from "./dialog";
import type { Settings } from "../core/storage";

interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
}
export interface BlackjackController {
  dispose(): void;
  setSettings(settings: Settings): void;
}
const SUIT = { S: "♠", H: "♥", D: "♦", C: "♣" } as const;
const SUIT_NAME = { S: "스페이드", H: "하트", D: "다이아몬드", C: "클럽" } as const;
const chips = (n: number) => n.toLocaleString("ko-KR");
const signed = (n: number) => (n > 0 ? `+${chips(n)}` : n < 0 ? `−${chips(-n)}` : "±0");
const cardText = (c: Card) =>
  `<span class="bj-card ${c.suit === "H" || c.suit === "D" ? "red" : ""}" aria-label="${SUIT_NAME[c.suit]} ${c.rank}">${c.rank}${SUIT[c.suit]}</span>`;
const totalText = (cards: readonly Card[]) => {
  const v = handValue(cards);
  return v.total > 21 ? `버스트 ${v.total}` : v.soft && v.total < 21 ? `소프트 ${v.total}` : String(v.total);
};
const RESULT: Record<Result, { text: string; tone: Tone }> = {
  blackjack: { text: "블랙잭", tone: "win" },
  win: { text: "승리", tone: "win" },
  push: { text: "푸시", tone: "push" },
  lose: { text: "패배", tone: "lose" },
  bust: { text: "버스트", tone: "lose" },
};

/**
 * Mounts blackjack. `random` shuffles the shoe; the collection passes the
 * default, so no card control exists anywhere in the interface.
 */
export function mountBlackjack(
  root: HTMLElement,
  nav: Navigation,
  random: Random = cryptoRandom,
): BlackjackController {
  const sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    // No cards are shuffled until the player sits down.
    state = createSession(random, []),
    // What the text panel describes: the last state whose cards have landed.
    shown = state,
    view: BlackjackView | null = null,
    disposed = false,
    lockedUntil = 0,
    soundedRound = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const $ = <E extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as E;
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) fn();
    }, ms);
    timers.add(timer);
  };
  function stop() {
    timers.forEach(clearTimeout);
    timers.clear();
    view?.dispose();
    view = null;
  }
  function setup(host = nav.setupHost) {
    if (host === nav.setupHost) stop();
    host.innerHTML = `<section class="featured"><div class="feature-copy"><div class="pill">지금 플레이 가능</div><span class="game-number">NO. 04 — TWENTY-ONE</span><h2>블랙잭 <span>Blackjack</span></h2><p>21에 가깝게, 하지만 넘지 않게.<br>딜러보다 높은 합계를 만들면 이깁니다.</p><ul class="rule-list"><li>블랙잭(A + 10점 카드)은 3 : 2 지급</li><li>딜러는 17 이상에서 멈춥니다</li><li>더블 다운과 스플릿을 지원합니다</li></ul><div class="game-meta">1인 대 딜러 · 6덱 · 시작 칩 ${chips(START_CHIPS)}</div><button id="bj-start" class="primary">테이블에 앉기 <span>↗</span></button><small class="session-note">가상 칩으로만 진행하며, 이 페이지를 여는 동안만 유지됩니다.</small></div><div class="feature-art blackjack-art" role="img" aria-label="블랙잭 테이블 미리보기"><div class="bj-mini"><i class="bj-mini-card back"></i><i class="bj-mini-card">K<b>♠</b></i><i class="bj-mini-card red">A<b>♥</b></i><span class="bj-mini-chips"><b></b><b></b><b></b></span></div><span>TWENTY-ONE, NOT ONE MORE</span></div></section>`;
    $("bj-start").onclick = start;
  }
  function start() {
    state = shown = createSession(random);
    soundedRound = 0;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  function screen() {
    stop();
    root.innerHTML =
      nav.header() +
      `<main class="game-layout blackjack-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>블랙잭 <small>BLACKJACK</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE BLACKJACK TABLE</span><span>6덱 · 딜러는 17에서 스탠드</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0라운드</span></div></section><aside class="game-sidebar bj-sidebar"><div id="turn" role="status" aria-live="polite"></div><dl class="bj-money"><div><dt>보유 칩</dt><dd id="bj-chips"></dd></div><div><dt>베팅</dt><dd id="bj-bet"></dd></div></dl><div class="bj-text" role="group" aria-label="테이블 상황"><p id="bj-dealer"></p><ul id="bj-hands"></ul></div><div id="bj-betting" class="bj-controls" role="group" aria-label="베팅"><div class="bj-chips-row"><button id="bj-add-10" aria-label="10 칩 추가">+10</button><button id="bj-add-50" aria-label="50 칩 추가">+50</button><button id="bj-add-100" aria-label="100 칩 추가">+100</button></div><div class="bj-row"><button id="bj-clear">베팅 초기화</button><button id="bj-rebet">이전 베팅</button></div><button id="bj-deal" class="primary">카드 받기</button></div><div id="bj-playing" class="bj-controls" role="group" aria-label="내 차례"><div class="bj-row"><button id="bj-hit" class="primary">히트</button><button id="bj-stand" class="primary">스탠드</button></div><div class="bj-row"><button id="bj-double">더블 다운</button><button id="bj-split">스플릿</button></div></div><div id="bj-result" class="bj-controls bj-result" role="group" aria-label="라운드 결과"><ul id="bj-outcome"></ul><p id="bj-net"></p><button id="bj-next" class="primary">다음 라운드</button><button id="bj-rebuy" class="primary">칩 다시 받기</button></div><p id="bj-note" class="input-help"></p></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    $("restart").onclick = () => setupDialog(setup);
    $("bj-add-10").onclick = () => bet((s) => addBet(s, 10));
    $("bj-add-50").onclick = () => bet((s) => addBet(s, 50));
    $("bj-add-100").onclick = () => bet((s) => addBet(s, 100));
    $("bj-clear").onclick = () => bet((s) => setBet(s, 0));
    $("bj-rebet").onclick = () => bet(rebet);
    $("bj-deal").onclick = () => act((s) => deal(s, random));
    $("bj-hit").onclick = () => act(hit);
    $("bj-stand").onclick = () => act(stand);
    $("bj-double").onclick = () => act(double);
    $("bj-split").onclick = () => act(split);
    $("bj-next").onclick = () => act(nextRound);
    $("bj-rebuy").onclick = newSession;
    try {
      view = new BlackjackView($("board"), settings.quality);
      view.onContact = () => sound.card();
      view.onSettled = present;
      // The shoe stands for the button that draws the next card.
      view.onShoe = () => {
        const next = ["bj-deal", "bj-hit", "bj-next"]
          .map((id) => $(id) as HTMLButtonElement)
          .find((b) => b.offsetParent !== null && !b.hidden);
        if (next && !next.disabled) next.click();
      };
      view.sync(model(state), false);
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요. 오른쪽 안내와 버튼으로는 계속 플레이할 수 있습니다.</p></div>';
    }
    present();
  }
  /** The table as the player may see it; the hole card carries no face. */
  function model(s: State): TableModel {
    const dealer = handValue(s.dealer);
    return {
      stake: s.phase === "betting" ? s.bet : 0,
      dealer: dealerCards(s).map((c) => ({ id: c.id, face: "hidden" in c ? null : c })),
      dealerLabel: !s.dealer.length
        ? ""
        : s.holeHidden
          ? `딜러 ${dealerShown(s).total}`
          : dealer.total > 21
            ? `딜러 버스트 ${dealer.total}`
            : s.dealer.length === 2 && dealer.total === 21
              ? "딜러 블랙잭"
              : `딜러 ${dealer.total}`,
      hands: s.hands.map((hand, i) => {
        const outcome = s.outcome?.hands[i];
        return {
          cards: hand.cards.map((c) => ({ id: c.id, face: c })),
          bet: hand.bet,
          active: s.phase === "playerTurn" && i === s.active,
          label: outcome
            ? s.outcome!.refunded
              ? "베팅 반환"
              : `${RESULT[outcome.result].text} ${signed(outcome.net)}`
            : totalText(hand.cards),
          tone: outcome && !s.outcome!.refunded ? RESULT[outcome.result].tone : "neutral",
        };
      }),
    };
  }
  const busy = () =>
    !!view?.animating ||
    performance.now() < lockedUntil ||
    !!document.querySelector("dialog[open]");
  /** Stake changes are instant and may repeat quickly; the engine validates each. */
  function bet(change: (s: State) => State | null) {
    if (view?.animating) return;
    const next = change(state);
    if (!next) return;
    state = next;
    if (view) view.sync(model(state), false);
    else present();
  }
  /**
   * A game action. Input stays locked until its cards have landed, so a
   * double click cannot deal, draw or settle twice.
   */
  function act(change: (s: State) => State | null) {
    if (busy()) return;
    const next = change(state);
    if (!next) return;
    sound.unlock();
    state = next;
    lockedUntil = performance.now() + 220;
    later(update, 240);
    if (view) view.sync(model(state));
    else present();
    update();
  }
  function newSession() {
    timers.forEach(clearTimeout);
    timers.clear();
    state = createSession(random);
    soundedRound = 0;
    lockedUntil = 0;
    if (view) view.sync(model(state), false);
    else present();
  }
  /** The cards have landed: describe the current state and play the result. */
  function present() {
    if (disposed) return;
    const focused = document.activeElement as HTMLElement | null,
      hadFocus = !!focused && !!focused.closest?.(".bj-sidebar");
    shown = state;
    update();
    if (state.phase === "roundComplete" && state.round !== soundedRound && state.outcome) {
      soundedRound = state.round;
      if (state.outcome.net < 0) sound.lose();
      else if (state.outcome.net > 0) sound.win();
    }
    // Keep keyboard focus on the step that replaced the one just used.
    if (hadFocus && focused && (focused.offsetParent === null || (focused as HTMLButtonElement).disabled)) {
      const target =
        shown.phase === "betting"
          ? "bj-add-10"
          : shown.phase === "playerTurn"
            ? "bj-hit"
            : isBroke(shown)
              ? "bj-rebuy"
              : "bj-next";
      $(target)?.focus({ preventScroll: true });
    }
  }
  function update() {
    if (disposed || !document.getElementById("bj-chips")) return;
    mirrorStatus();
    const s = shown,
      waiting = busy() || state !== shown,
      broke = isBroke(s);
    $("board").dataset.animating = String(!!view?.animating || state !== shown);
    $("move-count").textContent = `${s.round}라운드`;
    $("bj-chips").textContent = chips(s.chips);
    $("bj-bet").textContent = chips(
      s.phase === "betting" ? s.bet : s.hands.reduce((sum, h) => sum + h.bet, 0),
    );
    const turn = $("turn");
    turn.dataset.phase = s.phase;
    if (state !== shown)
      turn.textContent = state.phase === "roundComplete" && shown.phase === "playerTurn"
        ? "딜러 차례입니다…"
        : "카드를 나누는 중…";
    else if (s.phase === "betting")
      turn.textContent = broke
        ? "칩이 부족합니다. 칩을 다시 받아 새로 시작하세요."
        : s.bet >= MIN_BET
          ? `베팅 ${chips(s.bet)} — 카드 받기를 누르세요.`
          : "칩을 올려 베팅하세요.";
    else if (s.phase === "playerTurn") {
      const hand = s.hands[s.active];
      turn.textContent = `${s.hands.length > 1 ? `핸드 ${s.active + 1} 차례` : "내 차례"} — 합계 ${totalText(hand.cards)}, 딜러 ${dealerShown(s).total}`;
    } else
      turn.textContent = s.outcome!.refunded
        ? "카드가 부족해 베팅을 돌려드렸습니다."
        : `라운드 종료 — ${s.outcome!.net > 0 ? "이겼습니다" : s.outcome!.net < 0 ? "졌습니다" : "비겼습니다"} (${signed(s.outcome!.net)})`;
    // Table in words. The hole card is only ever described as hidden.
    const seen = dealerCards(s);
    $("bj-dealer").innerHTML = seen.length
      ? `<b>딜러</b> ${seen.map((c) => ("hidden" in c ? '<span class="bj-card hidden">비공개 카드</span>' : cardText(c))).join(" ")} <span class="bj-total">${s.holeHidden ? `보이는 합계 ${dealerShown(s).total}` : `합계 ${totalText(s.dealer)}${s.dealer.length === 2 && handValue(s.dealer).total === 21 ? " · 블랙잭" : ""}`}</span>`
      : "<b>딜러</b> 카드를 기다리는 중";
    $("bj-hands").innerHTML = s.hands
      .map((hand, i) => {
        const active = s.phase === "playerTurn" && i === s.active,
          outcome = s.outcome?.hands[i];
        return `<li class="${active ? "active" : ""}"${active ? ' aria-current="true"' : ""}><b>${s.hands.length > 1 ? `핸드 ${i + 1}` : "내 카드"}${active && s.hands.length > 1 ? " · 지금 차례" : ""}</b> ${hand.cards.map(cardText).join(" ")} <span class="bj-total">합계 ${totalText(hand.cards)}${isBlackjack(hand) ? " · 블랙잭" : ""} · 베팅 ${chips(hand.bet)}${outcome && !s.outcome!.refunded ? ` · ${RESULT[outcome.result].text} ${signed(outcome.net)}` : ""}</span></li>`;
      })
      .join("");
    // Controls for the current step only.
    $("bj-betting").hidden = s.phase !== "betting" || broke;
    $("bj-playing").hidden = s.phase !== "playerTurn";
    $("bj-result").hidden = s.phase !== "roundComplete" && !(s.phase === "betting" && broke);
    const off = (id: string, disabled: boolean) =>
      (($(id) as HTMLButtonElement).disabled = disabled);
    for (const amount of [10, 50, 100])
      off(`bj-add-${amount}`, waiting || !addBet(s, amount));
    off("bj-clear", waiting || s.bet === 0);
    off("bj-rebet", waiting || !rebet(s) || s.bet === s.lastBet);
    $("bj-rebet").textContent = s.lastBet ? `이전 베팅 ${chips(s.lastBet)}` : "이전 베팅";
    off("bj-deal", waiting || s.bet < MIN_BET);
    const hand = s.phase === "playerTurn" ? s.hands[s.active] : null,
      extra = hand ? ` (+${chips(hand.bet)})` : "";
    off("bj-hit", waiting || !hand);
    off("bj-stand", waiting || !hand);
    off("bj-double", waiting || !!doubleError(s));
    off("bj-split", waiting || !!splitError(s));
    $("bj-double").textContent = `더블 다운${extra}`;
    $("bj-split").textContent = `스플릿${extra}`;
    $("bj-outcome").innerHTML = (s.outcome?.hands ?? [])
      .map(
        (h, i, all) =>
          `<li><span>${all.length > 1 ? `핸드 ${i + 1}` : "내 핸드"} · 베팅 ${chips(h.bet)}</span><b class="${s.outcome!.refunded ? "push" : RESULT[h.result].tone}">${s.outcome!.refunded ? "반환" : RESULT[h.result].text} ${signed(h.net)}</b></li>`,
      )
      .join("");
    $("bj-net").textContent = s.outcome
      ? `이번 라운드 ${signed(s.outcome.net)} · 돌려받은 칩 ${chips(s.outcome.returned)}`
      : "";
    $("bj-next").hidden = broke;
    $("bj-rebuy").hidden = !broke;
    off("bj-next", waiting);
    off("bj-rebuy", waiting);
    // Say why a step is unavailable when it is not obvious from the table.
    const note = $("bj-note");
    if (broke) note.textContent = `칩이 최소 베팅 ${MIN_BET}보다 적습니다.`;
    else if (s.phase === "betting")
      note.textContent =
        s.bet >= Math.min(MAX_BET, s.chips)
          ? s.chips < MAX_BET
            ? "보유 칩을 모두 올렸습니다."
            : `최대 베팅은 ${chips(MAX_BET)}입니다.`
          : `베팅은 ${MIN_BET}–${chips(MAX_BET)}, ${MIN_BET} 단위입니다.`;
    else if (hand) {
      const reasons = [
        doubleError(s) === "칩이 부족합니다" ? "더블 다운" : "",
        splitError(s) === "칩이 부족합니다" ? "스플릿" : "",
      ].filter(Boolean);
      note.textContent = reasons.length
        ? `${reasons.join("·")}은 같은 금액의 칩이 더 필요합니다.`
        : hand.cards.length > 2
          ? "더블 다운은 처음 두 장에서만 할 수 있습니다."
          : "";
    } else note.textContent = "";
  }
  function rules() {
    modal(
      "21에 가깝게, 넘지 않게",
      `<ol><li>칩을 걸고 카드 두 장을 받습니다. 딜러는 한 장만 보여 줍니다.</li><li><b>히트</b>로 한 장 더 받고, <b>스탠드</b>로 멈춥니다. 21을 넘으면 바로 집니다(버스트).</li><li>2–10은 숫자대로, J·Q·K는 10, A는 11 또는 1로 셉니다.</li><li>내 차례가 끝나면 딜러가 16 이하에서 받고 17 이상에서 멈춥니다. 딜러보다 높으면 이깁니다.</li><li>처음 두 장이 A와 10점 카드면 <b>블랙잭</b>으로 3 : 2를 받습니다. 그 밖의 승리는 1 : 1, 같으면 베팅을 돌려받습니다.</li></ol><p><b>더블 다운</b>은 처음 두 장에서 베팅을 두 배로 하고 한 장만 받습니다. <b>스플릿</b>은 같은 랭크 두 장을 두 핸드로 나누며 한 라운드에 한 번입니다. 나눈 A는 한 장씩만 받고, 나눈 뒤의 21은 블랙잭이 아닙니다.</p><p>카드는 6덱을 섞어 쓰고 104장 아래로 줄면 다음 라운드 전에 다시 섞습니다. 보험·이븐 머니·서렌더·사이드 베팅은 없습니다. 가상 칩만 쓰며 새로고침하면 처음으로 돌아갑니다.</p>`,
    );
  }
  const hide = (e: PageTransitionEvent) => {
    timers.forEach(clearTimeout);
    timers.clear();
    if (!e.persisted) {
      view?.dispose();
      view = null;
      sound.dispose();
    }
  };
  // Every rule step is finished the moment it is taken, so a restored page
  // only needs to describe the state it already holds.
  const show = (e: PageTransitionEvent) => {
    if (e.persisted && document.getElementById("bj-chips")) {
      lockedUntil = 0;
      if (view) view.sync(model(state), false);
      else present();
    }
  };
  // A dialog closing frees the controls again.
  const dialogClosed = () => later(update, 0);
  document.addEventListener("close", dialogClosed, true);
  document.addEventListener("cancel", dialogClosed, true);
  document.addEventListener("click", dialogClosed, true);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  setup();
  return {
    dispose() {
      disposed = true;
      stop();
      sound.dispose();
      document.removeEventListener("close", dialogClosed, true);
      document.removeEventListener("cancel", dialogClosed, true);
      document.removeEventListener("click", dialogClosed, true);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", show);
    },
    setSettings(next) {
      settings = next;
      sound.enabled = next.sound;
      view?.setQuality(next.quality);
    },
  };
}
