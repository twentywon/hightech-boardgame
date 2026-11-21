import { dress } from "./chrome";
import { mirrorStatus } from "./banner";
import { modal, setupDialog } from "./dialog";
import { PatienceView, type Setting } from "../games/patience/view";
import type { PatienceLayout } from "../games/patience/layout";
import { cryptoRandom, type Random } from "../core/random";
import { Sound } from "../engine/sound";
import type { Settings } from "../core/storage";

/** A move of a card or a run from one pile to another. */
export interface PileMove {
  from: number;
  index: number;
  to: number;
}
/** What a hint names: a move, or a tap on the stock, and how to say it. */
export interface PatienceHint {
  /** The run to outline and the pile it would go to (null for a pile only tapped, as the stock). */
  move: { from: number; index: number; to: number | null } | null;
  text: string;
}
/**
 * One patience game for the shared screen (Klondike, FreeCell): its rules, its layout and setting, and its words.
 * `O` is what the setup chooses, `S` the game's state.
 */
export interface PatienceConfig<S, O> {
  /** The catalog id, also `data-game`. */
  id: string;
  title: string;
  en: string;
  /** The setup panel's inner form (its start button is `#pc-start`), and its wiring. */
  setup(options: O): string;
  bind(read: () => O, remember: (options: O) => void): void;
  /** Reads the form as it stands. */
  read(): O;
  create(options: O, random: Random): S;
  layout: PatienceLayout<S>;
  setting(): Setting;
  /** The foundations, for the celebration. */
  foundations: number[];
  canPick(state: S, pile: number, index: number): boolean;
  move(state: S, from: number, index: number, to: number): S | null;
  /** Why a run let go over `to` did not go there. */
  refusal(state: S, from: number, index: number, to: number): string;
  undo(state: S): S | null;
  /** Where a double tap sends a card, or null. */
  autoTarget(state: S, pile: number, index: number): number | null;
  /** A tap on a pile that nothing is picked up from (the stock): the state after it, or null. */
  tap?(state: S, pile: number): S | null;
  hint(state: S): PatienceHint | null;
  /** Cards that went home by themselves with the last move, in order. */
  later?(state: S): number[];
  /** When the game has come out: the next card to send home by itself, or null. */
  finish?(state: S): PileMove | null;
  won(state: S): boolean;
  moves(state: S): number;
  stuck(state: S): boolean;
  /** The figures over the table: a label and a value each. */
  stats(state: S): [string, string][];
  /** The status line while nothing else is said: the rule. */
  status(state: S): string;
  /** The game's settings in a few words (the panel's head line). */
  mode(options: O): string;
  rules(): void;
}
interface Navigation<O> {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: O;
  remember: (options: O) => void;
}
export interface PatienceController {
  /** Shows the game's 게임 방법. */
  rules(): void;
  dispose(): void;
  setSettings(settings: Settings): void;
}
/**
 * Mounts a patience game on the screen spider's table taught: the table over the whole width, the figures and the
 * buttons (무르기, 힌트) at its lower left, cards moved only by dragging them, a double tap sending a card on.
 */
export function mountPatience<S, O>(root: HTMLElement, nav: Navigation<O>, config: PatienceConfig<S, O>, random: Random = cryptoRandom): PatienceController {
  const sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    preferences = nav.preferences,
    state = config.create(preferences, random),
    view: PatienceView<S> | null = null,
    disposed = false,
    note = "",
    announced = false,
    /** Cards go home by themselves at the end only after a move by hand, not after one taken back. */
    finishing = true,
    timer: ReturnType<typeof setTimeout> | null = null;
  const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    view?.dispose();
    view = null;
  }
  function setup(host = nav.setupHost) {
    if (host === nav.setupHost) stop();
    host.innerHTML = config.setup(preferences);
    config.bind(config.read, (options) => {
      preferences = options;
      nav.remember(options);
    });
    $("pc-start").onclick = start;
  }
  function start() {
    preferences = config.read();
    nav.remember(preferences);
    state = config.create(preferences, random);
    note = "";
    announced = false;
    finishing = true;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  function screen() {
    stop();
    const stats = config
      .stats(state)
      .map(([label], i) => `<div><dt>${label}</dt><dd id="pc-stat-${i}"></dd></div>`)
      .join("");
    root.innerHTML =
      nav.header() +
      `<main class="game-layout yacht-game spider-game patience-game ${config.id}-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>${config.title} <small>${config.en}</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>${config.en}</span><span>${config.mode(preferences)}</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar yd-sidebar sp-sidebar pc-sidebar"><div id="turn" role="status" aria-live="polite"></div><dl class="bj-money">${stats}</dl><div class="yd-controls"><div class="bj-row"><button id="pc-undo">무르기</button><button id="pc-hint">힌트</button></div><p class="input-help">카드를 끌어서 놓을 곳에 놓으세요. 카드를 두 번 누르면 갈 수 있는 곳으로 보냅니다.</p></div><div id="pc-result" class="yd-result" data-outcome="win" hidden><p id="pc-final"></p><button id="pc-again" class="primary">새 게임</button></div></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = config.rules;
    dress(setup, [".yd-controls .bj-row"]);
    $("pc-again").onclick = () => setupDialog(setup);
    $("pc-undo").onclick = undo;
    $("pc-hint").onclick = showHint;
    try {
      view = new PatienceView($("board"), settings.quality, config.layout, config.setting());
      view.onSettled = settled;
      view.onDrop = drop;
      view.onTap = tap;
      view.onDouble = double;
      view.canDrag = (pile, index) => !busy() && !config.won(state) && config.canPick(state, pile, index);
      view.sync(state, false);
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요.</p></div>';
    }
    update();
  }
  const busy = () => !!view?.animating || !!document.querySelector("dialog[open]");
  function apply(next: S, animate = true) {
    state = next;
    finishing = true;
    sound.unlock();
    sound.card();
    view?.sync(state, animate, config.later?.(state) ?? []);
    update();
  }
  /** The table has come to rest: a won game is celebrated, and a game that has come out goes home by itself. */
  function settled() {
    update();
    if (disposed) return;
    if (config.won(state)) view?.celebrate(config.foundations);
    else if (finishing && config.finish && !timer) {
      const next = config.finish(state);
      if (next)
        timer = setTimeout(() => {
          timer = null;
          if (disposed || busy() || config.finish?.(state) === null) return;
          const after = config.move(state, next.from, next.index, next.to);
          if (after) apply(after);
        }, 90);
    }
  }
  /** A dragged run is let go over a pile: it moves there, or slides back. */
  function drop(pile: number, index: number, to: number) {
    const next = to === pile ? null : config.move(state, pile, index, to);
    if (!next) {
      if (to !== pile) note = config.refusal(state, pile, index, to);
      view?.sync(state);
      update();
      return;
    }
    note = "";
    apply(next);
  }
  /** A tap on the stock turns it. */
  function tap(pile: number) {
    if (busy() || !config.tap) return;
    const next = config.tap(state, pile);
    if (!next) return;
    note = "";
    apply(next);
  }
  /** A double tap sends a card where it may go (home, or a free cell). */
  function double(pile: number, index: number) {
    if (busy()) return;
    const to = config.autoTarget(state, pile, index),
      next = to === null ? null : config.move(state, pile, index, to);
    if (!next) {
      note = "그 카드는 지금 보낼 곳이 없습니다. 끌어서 옮겨 보세요.";
      update();
      return;
    }
    note = "";
    apply(next);
  }
  /** Points out a move worth trying, or says that none helps. */
  function showHint() {
    if (busy() || config.won(state)) return;
    const found = config.hint(state);
    if (!found) note = "도움이 될 만한 수가 없습니다. 무르거나 새 게임을 시작하세요.";
    else {
      note = found.text;
      if (found.move) view?.showHint(found.move.from, found.move.index, found.move.to);
    }
    update();
  }
  function undo() {
    if (busy()) return;
    const back = config.undo(state);
    if (!back) return;
    if (timer) clearTimeout(timer);
    timer = null;
    state = back;
    note = "";
    announced = false;
    finishing = false;
    view?.sync(state, false);
    update();
  }
  function update() {
    if (disposed || !document.getElementById("pc-undo")) return;
    mirrorStatus();
    const waiting = busy(),
      won = config.won(state);
    $("board").dataset.animating = String(!!view?.animating);
    $("move-count").textContent = `${config.moves(state)}수`;
    config.stats(state).forEach(([, value], i) => ($(`pc-stat-${i}`).textContent = value));
    $("turn").textContent = won ? "모든 카드를 모았습니다!" : note || (config.stuck(state) ? "더 옮길 수 있는 카드가 없습니다. 무르거나 새 게임을 시작하세요." : config.status(state));
    $<HTMLButtonElement>("pc-undo").disabled = waiting || won || !config.moves(state);
    $<HTMLButtonElement>("pc-hint").disabled = waiting || won;
    $("pc-result").hidden = !won;
    if (won) {
      $("pc-final").textContent = `성공! ${config.moves(state)}수 만에 모든 카드를 모았습니다.`;
      if (!announced) {
        announced = true;
        sound.win();
      }
    }
  }
  const dialogClosed = () => setTimeout(() => !disposed && update(), 0);
  document.addEventListener("close", dialogClosed, true);
  document.addEventListener("cancel", dialogClosed, true);
  document.addEventListener("click", dialogClosed, true);
  const hide = (e: PageTransitionEvent) => {
    if (!e.persisted) {
      stop();
      sound.dispose();
    }
  };
  window.addEventListener("pagehide", hide);
  setup();
  return {
    rules: config.rules,
    dispose() {
      disposed = true;
      stop();
      sound.dispose();
      document.removeEventListener("close", dialogClosed, true);
      document.removeEventListener("cancel", dialogClosed, true);
      document.removeEventListener("click", dialogClosed, true);
      window.removeEventListener("pagehide", hide);
    },
    setSettings(next) {
      settings = next;
      sound.enabled = next.sound;
      view?.setQuality(next.quality);
    },
  };
}
/** Opens a game's 게임 방법 window. */
export const showGuide = (title: string, body: string) => modal(title, body);
