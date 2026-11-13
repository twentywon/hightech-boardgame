import { announce, dress } from "./chrome";
import { bankrupt, mirrorStatus } from "./banner";
import type { Action } from "../games/cards/betting";
import type { BettingGame, TableView } from "../games/cards/game";
import { CardTableView, type CardSkin } from "../games/cards/table-view";
import { cryptoRandom, type Random } from "../core/random";
import { Sound } from "../engine/sound";
import { modal, setupDialog } from "./dialog";
import type { Settings } from "../core/storage";

export interface BettingOptions {
  opponents: number;
  /** Which form of the game to play, when it has more than one. */
  variant?: string;
}
/** Everything that differs between the betting card games. */
export interface BettingConfig<S> {
  game: BettingGame<S>;
  skin: CardSkin;
  name: string;
  english: string;
  /** Inner HTML of the setup panel's description: paragraph and rule list. */
  intro: string;
  meta: string;
  /** Thumbnail markup and its accessible name. */
  art: string;
  artLabel: string;
  artClass: string;
  tableLabel: string;
  tableNote: string;
  rulesTitle: string;
  rules: string;
  /** Word for dealing a hand, e.g. "패 받기". */
  dealWord: string;
  /** Name of the card the person uncovers by hand, e.g. "세 번째 패". */
  peekWord?: string;
  /** Forms of the game offered at the table, when there is more than one. */
  variants?: { value: string; label: string }[];
}
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: BettingOptions;
  remember: (options: BettingOptions) => void;
}
export interface BettingController {
  dispose(): void;
  setSettings(settings: Settings): void;
}
const chips = (n: number) => n.toLocaleString("ko-KR");
const signed = (n: number) => (n > 0 ? `+${chips(n)}` : n < 0 ? `−${chips(-n)}` : "±0");

/**
 * Mounts a betting card game: seat 0 plays with HTML buttons, the other seats
 * are played by the game's own judgement. `random` shuffles; the collection
 * passes the default, so the interface cannot choose cards.
 */
export function mountBettingGame<S>(
  root: HTMLElement,
  nav: Navigation,
  config: BettingConfig<S>,
  random: Random = cryptoRandom,
): BettingController {
  const { game } = config,
    sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    preferences = { ...nav.preferences },
    variant = preferences.variant,
    state = game.create(preferences.opponents, preferences.variant),
    // What the panel describes: the last state whose cards have landed.
    shown = state,
    view: CardTableView | null = null,
    disposed = false,
    generation = 0,
    lockedUntil = 0,
    thinking = false,
    soundedRound = -1,
    stampedOver = false,
    // Cards dealt face down to seat 0 that the person has uncovered.
    peeked = new Set<number>(),
    // Cards tapped on the table toward a choice that needs more than one.
    picked: number[] = [];
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
    generation++;
    thinking = false;
    timers.forEach(clearTimeout);
    timers.clear();
    view?.dispose();
    view = null;
  }
  function setup(host = nav.setupHost) {
    if (host === nav.setupHost) stop();
    host.innerHTML = `<section class="featured"><div class="feature-copy"><h2>${config.name} <span>${config.english}</span></h2>${config.intro}<div class="game-meta">${config.meta}</div><div class="ai-options"><label>상대 수<select id="bg-opponents">${[1, 2, 3].map((n) => `<option value="${n}" ${preferences.opponents === n ? "selected" : ""}>컴퓨터 ${n}명</option>`).join("")}</select></label>${config.variants ? `<label>방식<select id="bg-variant">${config.variants.map((v) => `<option value="${v.value}" ${preferences.variant === v.value ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>` : ""}<small>선택한 설정은 새 세션부터 적용됩니다.</small></div><button id="bg-start" class="primary">테이블에 앉기 <span>↗</span></button></div><div class="feature-art ${config.artClass}" role="img" aria-label="${config.artLabel}">${config.art}</div></section>`;
    const remember = () => {
      preferences = {
        opponents: Number($<HTMLSelectElement>("bg-opponents").value),
        variant: document.getElementById("bg-variant")
          ? $<HTMLSelectElement>("bg-variant").value
          : preferences.variant,
      };
      nav.remember({ ...preferences });
    };
    $("bg-opponents").onchange = remember;
    if (document.getElementById("bg-variant")) $("bg-variant").onchange = remember;
    $("bg-start").onclick = start;
  }
  function start() {
    variant = preferences.variant;
    state = shown = game.create(preferences.opponents, variant);
    peeked.clear();
    soundedRound = -1;
    lockedUntil = 0;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  function screen() {
    stop();
    root.innerHTML =
      nav.header() +
      `<main class="game-layout betting-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>${config.name} <small>${config.english.toUpperCase()}</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>${config.tableLabel}</span><span>${config.tableNote}</span></div><div id="board"></div><div id="bg-acting" class="bj-controls bg-acting" role="group" aria-label="내 차례"><div class="bj-row"><button id="bg-call" class="primary">체크</button><button id="bg-fold">다이</button></div><div class="bj-row"><button id="bg-raise">하프</button><button id="bg-allin">올인</button></div></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0판</span></div></section><aside class="game-sidebar bj-sidebar bg-sidebar"><div id="turn" role="status" aria-live="polite"></div><dl class="bj-money"><div><dt>내 칩</dt><dd id="bg-chips"></dd></div><div><dt>판돈</dt><dd id="bg-pot"></dd></div></dl><ul id="bg-seats" class="bg-seats" aria-label="좌석 상황"></ul><div id="bg-peeking" class="bj-controls tap-only" hidden><button id="bg-peek" class="primary"></button></div><div id="bg-prompt" class="bj-controls bg-prompt" role="group" hidden></div><div id="bg-between" class="bj-controls bj-result" role="group" aria-label="판 결과"><ul id="bg-outcome"></ul><button id="bg-deal" class="sr-only">${config.dealWord}</button></div><div id="bg-after" class="bj-controls"><button id="bg-rebuy" class="primary">칩 다시 받기</button></div><p id="bg-note" class="input-help"></p></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = () => modal(config.rulesTitle, config.rules);
    dress(setup, ["#bg-peeking", "#bg-prompt", "#bg-after"]);
    const play = (action: Action) => () => act((s) => game.act(s, action));
    $("bg-call").onclick = play("call");
    $("bg-fold").onclick = play("fold");
    $("bg-raise").onclick = play("raise");
    $("bg-allin").onclick = play("allIn");
    $("bg-deal").onclick = () => act((s) => game.start(s, random), true);
    $("bg-rebuy").onclick = newSession;
    $("bg-peek").onclick = () => covered(state).forEach(peek);
    $("bg-prompt").onclick = (e) => {
      const chosen = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-value]");
      if (chosen) act((s) => game.choose(s, Number(chosen.dataset.value)), true);
    };
    try {
      view = new CardTableView($("board"), settings.quality, config.skin);
      view.onContact = () => sound.card();
      view.onSettled = present;
      view.onPeek = peek;
      view.onCard = pick;
      view.onDeck = () => {
        if (!$("bg-deal").hidden && !$("bg-between").hidden) $("bg-deal").click();
      };
      view.onChips = () => sound.chips();
      view.sync(table(state), false);
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요. 오른쪽 안내와 버튼으로는 계속 플레이할 수 있습니다.</p></div>';
    }
    present();
  }
  const busy = () =>
    !!view?.animating ||
    state !== shown ||
    performance.now() < lockedUntil ||
    !!document.querySelector("dialog[open]");
  /** Ids of seat 0's cards that are still under their cover. */
  const covered = (s: S) =>
    game
      .view(s)
      .seats[0].cards.filter((c) => c.peek && !peeked.has(c.id))
      .map((c) => c.id);
  /**
   * The table as the person may see it now: a card that has not been
   * uncovered yet carries no text, and the hand it would make is not named.
   */
  function table(s: S): TableView {
    const model = game.view(s),
      hidden = covered(s);
    if (!hidden.length) return model;
    const mine = model.seats[0];
    return {
      ...model,
      seats: [
        {
          ...mine,
          note: "",
          cards: mine.cards.map((c) =>
            hidden.includes(c.id) ? { ...c, text: "", covered: true } : c,
          ),
        },
        ...model.seats.slice(1),
      ],
    };
  }
  /** The person slid the cover off a card, on the table or with the button. */
  function peek(id: number) {
    if (peeked.has(id)) return;
    peeked.add(id);
    sound.unlock();
    if (view) view.sync(table(state));
    else present();
    update();
  }
  /** A card tapped on the table: the option made of the tapped cards is taken. */
  function pick(id: number) {
    const options = (game.phase(state) === "choosing" && !busy() && game.prompt(state)?.options) || [];
    if (!options.some((o) => o.cards?.includes(id))) return;
    picked = picked.includes(id) ? picked.filter((p) => p !== id) : [...picked, id];
    const size = Math.max(...options.map((o) => o.cards?.length ?? 0));
    if (picked.length > size) picked = [id];
    const chosen = options.find(
      (o) => o.cards?.length === picked.length && o.cards.every((c) => picked.includes(c)),
    );
    if (chosen) act((s) => game.choose(s, chosen.value), true);
    else update();
  }
  function apply(next: State) {
    picked = [];
    if (game.round(next) !== game.round(state)) peeked.clear();
    state = next;
    if (view) view.sync(table(state));
    else present();
    update();
  }
  type State = S;
  /**
   * A step by seat 0. Input stays locked until the cards have landed, so a
   * double click cannot bet or deal twice.
   */
  function act(change: (s: S) => S | null, dealing = false) {
    if (busy() || (!dealing && game.turn(state) !== 0)) return;
    const next = change(state);
    if (!next) return;
    sound.unlock();
    lockedUntil = performance.now() + 220;
    later(update, 240);
    apply(next);
  }
  function newSession() {
    generation++;
    thinking = false;
    timers.forEach(clearTimeout);
    timers.clear();
    state = game.create(shownSeats(), variant);
    soundedRound = -1;
    lockedUntil = 0;
    peeked.clear();
    if (view) view.sync(table(state), false);
    else present();
  }
  const shownSeats = () => game.view(state).seats.length - 1;
  /** The computer seats act one at a time, after a pause that can be followed. */
  function computer() {
    if (thinking || game.phase(state) !== "betting" || game.turn(state) <= 0) return;
    thinking = true;
    const current = generation;
    later(() => {
      thinking = false;
      if (current !== generation || game.phase(state) !== "betting" || game.turn(state) <= 0) return;
      if (busy()) {
        computer();
        return;
      }
      const seat = game.turn(state),
        next =
          game.act(state, game.decide(state, "normal", 1 + game.round(state) * 31 + seat)) ??
          // A refused choice must not stall the table.
          game.act(state, "call") ??
          game.act(state, "fold");
      if (next) apply(next);
      computer();
    }, 750);
  }
  function present() {
    if (disposed) return;
    const focused = document.activeElement as HTMLElement | null,
      hadFocus = !!focused && !!focused.closest?.(".betting-game");
    shown = state;
    update();
    const phase = game.phase(state),
      result = game.result(state);
    // My chips are gone: the stamp comes down once for the session.
    if (phase === "sessionOver") {
      if (!stampedOver) {
        if (!game.won(state)) bankrupt();
        announce(() => (game.phase(state) === "sessionOver" ? (game.won(state) ? "상대의 칩을 모두 땄습니다!" : "칩을 모두 잃었습니다.") : ""), setup, () => (game.won(state) ? "win" : "lose"));
      }
      stampedOver = true;
    } else stampedOver = false;
    if ((phase === "handOver" || phase === "sessionOver") && result && !result.rematch && soundedRound !== game.round(state)) {
      soundedRound = game.round(state);
      const net = result.rows.find((row) => row.name === "나")?.net ?? 0;
      if (net < 0) sound.lose();
      else if (net > 0) sound.win();
    }
    if (hadFocus && focused && (focused.offsetParent === null || (focused as HTMLButtonElement).disabled || !focused.isConnected))
      (covered(state).length
        ? $("bg-peek")
        : phase === "choosing"
          ? $("bg-prompt").querySelector<HTMLElement>("button")
          : phase === "betting" && game.turn(state) === 0
        ? $("bg-call")
        : phase === "sessionOver"
          ? $("bg-rebuy")
          : $("bg-deal")
      )?.focus({ preventScroll: true });
    computer();
  }
  function update() {
    if (disposed || !document.getElementById("bg-chips")) return;
    mirrorStatus();
    const s = shown,
      seats = table(s),
      phase = game.phase(s),
      turn = game.turn(s),
      waiting = busy(),
      // Nothing can be decided before the covered card has been looked at.
      sealed = covered(s).length > 0,
      mine = phase === "betting" && turn === 0,
      choice = mine && !sealed ? game.options(s) : null,
      prompt = phase === "choosing" && !sealed ? game.prompt(s) : null,
      result = game.result(s);
    $("board").dataset.animating = String(!!view?.animating || state !== shown);
    $("move-count").textContent = `${game.round(s)}판`;
    $("bg-chips").textContent = chips(seats.seats[0].chips);
    $("bg-pot").textContent = chips(seats.pot);
    const status = $("turn");
    status.dataset.phase = phase;
    status.dataset.seat = String(turn);
    status.textContent =
      state !== shown
        ? "카드를 나누는 중…"
        : phase === "idle"
          ? "덱을 눌러 시작하세요."
          : phase === "sessionOver"
            ? game.won(s)
              ? "상대의 칩을 모두 땄습니다!"
              : "칩을 모두 잃었습니다. 칩을 다시 받아 새로 시작하세요."
            : phase === "handOver"
              ? (result?.headline ?? "판이 끝났습니다.")
              : sealed
                ? `${config.peekWord ?? "카드"}를 아래로 밀어 확인하세요.`
                : phase === "choosing"
                  ? (prompt?.title ?? "")
                  : mine
                    ? `내 차례 — ${game.stage(s)}${choice && choice.call > 0 ? ` · 콜 ${chips(choice.call)}` : ""}`
                    : `${seats.seats[turn]?.name ?? "상대"} 차례…`;
    $("bg-seats").innerHTML = seats.seats
      .map(
        (seat) =>
          `<li class="${seat.active ? "active" : ""}${seat.folded || seat.out ? " gone" : ""}"${seat.active ? ' aria-current="true"' : ""}><b>${seat.name}</b> <span class="bg-stack">칩 ${chips(seat.chips)}${seat.bet ? ` · 건 칩 ${chips(seat.bet)}` : ""}</span><span class="bg-hand">${seat.out ? "탈락" : seat.folded ? "다이" : seat.cards.length ? seat.cards.map((c) => (c.face && c.text ? `<span class="bj-card${c.secret ? " secret" : ""}"${c.secret ? ' title="상대에게 보이지 않는 카드"' : ""}>${c.text}</span>` : `<span class="bj-card hidden">${c.covered ? "확인 전" : "비공개"}</span>`)).join(" ") : "—"}${seat.note && !seat.folded && !seat.out ? ` <em>${seat.note}</em>` : ""}</span></li>`,
      )
      .join("");
    $("bg-acting").hidden = phase !== "betting" || sealed;
    $("bg-between").hidden = phase === "betting" || phase === "choosing";
    $("bg-peeking").hidden = !sealed || state !== shown;
    $("bg-peek").textContent = `${config.peekWord ?? "카드"} 확인`;
    ($("bg-peek") as HTMLButtonElement).disabled = waiting;
    $("bg-prompt").hidden = !prompt;
    const promptKey = prompt ? JSON.stringify(prompt) : "";
    if ($("bg-prompt").dataset.key !== promptKey) {
      $("bg-prompt").dataset.key = promptKey;
      $("bg-prompt").setAttribute("aria-label", prompt?.title ?? "");
      $("bg-prompt").innerHTML = (prompt?.options ?? [])
        .map((o) => `<button data-value="${o.value}">${o.label}</button>`)
        .join("");
      // Every choice is a card to tap on the table: the buttons stay for the keyboard only.
      $("bg-prompt").classList.toggle("tap-only", !!prompt?.options.length && prompt.options.every((o) => o.cards?.length));
    }
    const offered = prompt && !waiting ? prompt.options.flatMap((o) => o.cards ?? []) : [];
    if (!prompt) picked = [];
    view?.setChoices(
      offered,
      picked,
      !waiting && (phase === "idle" || phase === "handOver"),
    );
    // Lifting a picked card is an animation of its own.
    $("board").dataset.animating = String(!!view?.animating || state !== shown);
    $("board").dataset.picked = String(picked.length);
    $("bg-prompt")
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((b) => (b.disabled = waiting));
    const off = (id: string, disabled: boolean) => (($(id) as HTMLButtonElement).disabled = disabled);
    off("bg-call", waiting || !choice);
    off("bg-fold", waiting || !choice);
    off("bg-raise", waiting || !choice || choice.raise === null);
    off("bg-allin", waiting || !choice || choice.allIn === null);
    $("bg-call").textContent = choice && choice.call > 0 ? `콜 (${chips(choice.call)})` : "체크";
    $("bg-raise").textContent = choice?.raise != null ? `하프 (${chips(choice.raise)})` : "하프";
    $("bg-allin").textContent = choice?.allIn != null ? `올인 (${chips(choice.allIn)})` : "올인";
    $("bg-outcome").innerHTML = (result?.rows ?? [])
      .map(
        (row) =>
          `<li><span>${row.name} · ${row.hand}</span><b class="${result!.rematch ? "push" : row.net > 0 ? "win" : row.net < 0 ? "lose" : "push"}">${result!.rematch ? "유지" : signed(row.net)}</b></li>`,
      )
      .join("");
    $("bg-deal").hidden = phase === "sessionOver";
    $("bg-rebuy").hidden = phase !== "sessionOver";
    $("bg-deal").textContent = result?.rematch ? "재경기" : phase === "idle" ? config.dealWord : "다음 판";
    $("bg-rebuy").textContent = game.won(s) ? "새 세션" : "칩 다시 받기";
    off("bg-deal", waiting);
    off("bg-rebuy", waiting);
    $("bg-note").textContent = !mine || !choice
      ? ""
      : choice.raise === null && choice.allIn === null
        ? "더 올릴 수 없습니다. 콜하거나 다이하세요."
        : choice.raise === null
          ? "하프는 한 번에 세 번까지이며 칩이 충분해야 합니다."
          : "하프는 판돈의 절반을 더 겁니다.";
  }
  const hide = (e: PageTransitionEvent) => {
    generation++;
    thinking = false;
    timers.forEach(clearTimeout);
    timers.clear();
    if (!e.persisted) {
      view?.dispose();
      view = null;
      sound.dispose();
    }
  };
  // Every rule step is complete when it is taken; a restored page resumes
  // from the state it holds and the computer seats pick up where they were.
  const show = (e: PageTransitionEvent) => {
    if (e.persisted && document.getElementById("bg-chips")) {
      lockedUntil = 0;
      if (view) view.sync(table(state), false);
      present();
    }
  };
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
