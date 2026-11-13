import { dress } from "./chrome";
import { bankrupt, capturing, cheer, mirrorStatus } from "./banner";
import { modal, setupDialog } from "./dialog";
import { LEVELS, choose, type Level } from "../games/points/ai";
import type { Move, PointGame } from "../games/points/types";
import { PointBoardView, type BoardSpec, type Marks } from "../games/points/view";
import { cryptoRandom } from "../core/random";
import { Sound } from "../engine/sound";
import type { Settings } from "../core/storage";

export interface PointOptions {
  mode: "local" | "ai";
  variant: string;
  level: Level;
}
/** What the screen needs from a board, whichever way it is drawn. */
export interface PointView<S> {
  readonly renderer: { domElement: HTMLCanvasElement };
  readonly animating: boolean;
  onContact: () => void;
  onSettled: () => void;
  onPick: (point: number) => void;
  /** A whole move made by a gesture of the view's own (a flick), instead of by picking points. */
  onMove?: (move: Move) => void;
  sync(state: S, animate?: boolean): void;
  setMarks(marks: Marks): void;
  setQuality(quality: "high" | "low"): void;
  dispose(): void;
}
/** Everything that differs between two games played on the points of a board. */
export interface PointConfig<S> {
  game: PointGame<S>;
  /** The board as pieces on points; games with a `view` of their own leave it out. */
  board?: (variant: string) => BoardSpec;
  /** Colours of the two sides and the points the keyboard walks, for a game with its own `view`. */
  colors?: [string, string];
  keyPoints?: (state: S) => { x: number; z: number }[];
  /** A board drawn its own way instead of as pieces on points. */
  view?: (host: HTMLElement, quality: "high" | "low", variant: string, mode: "local" | "ai", level: Level) => PointView<S>;
  /** What the further choice of a move is, when it is not a piece to take off. */
  extraHint?: string;
  /** A table that needs more height on a narrow screen: an upright rack, or two boards one above the other. */
  shape?: "tall" | "taller";
  /** Buttons that play the move to a point which is not on the board (turn the ship, lay the fleet at random). */
  /** `show` keeps a tool in place (greyed) while its move is not legal; `text` rewrites its label for the state. */
  tools?: { label: string; point: number; onBoard?: boolean; show?: (state: S) => boolean; text?: (state: S) => string }[];
  /** Extra time, in milliseconds, the computer takes over the move it is about to make. */
  ponder?: (state: S) => number;
  /** No panel beside the table: the table takes the whole width (the panel stays in the page, unseen, for readers). */
  noPanel?: boolean;
  /** How the panel shows the two tallies: "big" writes them large at the right of each side; "scoreboard" sets the two sides against each other like a stadium board. */
  panel?: "big" | "scoreboard";
  /** The two tallies as markup, for a game that draws them; it must tell no more than `tally` does. */
  tallyHtml?: (state: S) => [string, string];
  /** True when the game has ended with side 0 out of money: the 파산 stamp is shown. */
  bankrupt?: (state: S) => boolean;
  /** A line to flash over the table for what a move has just done (a piece taken), or null. */
  cheer?: (before: S, state: S, mode: "local" | "ai") => string | null;
  /** No table for two: one side's pieces are hidden from the other. */
  computerOnly?: boolean;
  /** A game for one: no other side, no computer, no level. `winner` 0 is a game won and 1 a game lost; the result is told by `reason` alone. */
  solo?: boolean;
  /** The table runs in real time: what it reports is never refused for being busy, and nothing is kept for undo. */
  live?: boolean;
  /** A key that is a whole move (an arrow that slides the tiles), or null for the usual walk over the points. */
  keyMove?: (key: string, state: S) => Move | null;
  /** The names and colours of the two sides, when they depend on the variant. */
  sidesOf?: (variant: string) => [string, string];
  colorsOf?: (variant: string) => [string, string];
  /** Who moves first against the computer, when it is not simply side 0. */
  firstNote?: string;
  /** What a piece coming to rest sounds like, instead of a tap. */
  contact?: (sound: Sound, state: S) => void;
  /** A piece with a single legal move makes it as soon as it is picked. */
  autoSingle?: boolean;
  /** No taking back: something hidden would be learnt from it. */
  noUndo?: boolean;
  /** Where the keyboard starts on the board. */
  keyStart?: (state: S) => number;
  /** True when a move has changed where the keyboard belongs (a new phase): it goes back to `keyStart`. */
  rehome?: (before: S, next: S) => boolean;
  /** A button that plays the only legal move, such as a roll of the die. */
  action?: string;
  /** How the game is operated, when it is not by picking a piece and a destination. */
  help?: string;
  name: string;
  english: string;
  number: string;
  intro: string;
  meta: string;
  art: string;
  artClass: string;
  artLabel: string;
  tableLabel: string;
  tableNote: (variant: string) => string;
  rulesTitle: string;
  rules: string;
  /** Names of the two sides; side 0 moves first. */
  sides: [string, string];
  variants?: { value: string; label: string }[];
  /** What the variants are called in the setup panel. */
  variantLabel?: string;
  /** False to mark only the piece that was picked up, not every piece that can move. */
  showMovable?: boolean;
  startWord: string;
}
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: PointOptions;
  remember: (options: PointOptions) => void;
}
export interface PointController {
  dispose(): void;
  setSettings(settings: Settings): void;
}

/** Mounts a point-board game: its setup panel in the collection, then its table. */
export function mountPointGame<S>(root: HTMLElement, nav: Navigation, config: PointConfig<S>): PointController {
  const { game } = config,
    sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    preferences = { ...nav.preferences },
    mode = preferences.mode,
    variant = preferences.variant,
    level = preferences.level,
    state = game.create(variant),
    // What the panel describes: the last state whose pieces have come to rest.
    shown = state,
    past: S[] = [],
    spec: BoardSpec | null = config.board?.(variant) ?? null,
    view: PointView<S> | null = null,
    disposed = false,
    generation = 0,
    lockedUntil = 0,
    announced = false,
    thinking = false,
    // The points chosen so far toward a move, and the keyboard's place on the board.
    chosen: { from?: number; to?: number } = {},
    cursor: number | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) fn();
    }, ms);
    timers.add(timer);
  };
  const over = (s: S = state) => game.winner(s) !== null;
  const solo = !!config.solo,
    alone = solo || !!config.computerOnly;
  const computerTurn = (s: S = state) => mode === "ai" && !solo && game.turn(s) === 1 && !over(s);
  const sides = () => config.sidesOf?.(variant) ?? config.sides;
  const who = (player: number) =>
    solo ? "나" : mode === "local" ? `${sides()[player]} (플레이어 ${player + 1})` : player === 0 ? `나 (${sides()[0]})` : `컴퓨터 · ${LEVELS[level].label} (${sides()[1]})`;
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
    host.innerHTML = `<section class="featured"><div class="feature-copy"><span class="game-number">${config.number}</span><h2>${config.name} <span>${config.english}</span></h2>${config.intro}<div class="game-meta">${config.meta}</div><div class="mode-select" ${alone ? "hidden" : ""}><label><input type="radio" name="pg-mode" value="local"> 로컬 2인</label><label><input type="radio" name="pg-mode" value="ai"> 컴퓨터 대전</label></div><div class="ai-options">${config.variants ? `<label>${config.variantLabel ?? "종류"}<select id="pg-variant">${config.variants.map((v) => `<option value="${v.value}" ${preferences.variant === v.value ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>` : ""}<label id="pg-level-field">컴퓨터 난이도<select id="pg-level">${(Object.keys(LEVELS) as Level[]).map((l) => `<option value="${l}" ${preferences.level === l ? "selected" : ""}>${LEVELS[l].label}</option>`).join("")}</select></label></div><small id="pg-options" class="session-note" hidden>${config.firstNote ?? `컴퓨터 대전에서는 내가 ${config.sides[0]}으로 먼저 둡니다.`}</small><button id="pg-start" class="primary">${config.startWord} <span>↗</span></button></div><div class="feature-art ${config.artClass}" role="img" aria-label="${config.artLabel}">${config.art}</div></section>`;
    const radios = document.querySelectorAll<HTMLInputElement>("input[name=pg-mode]");
    const remember = () => {
      preferences = {
        mode: [...radios].find((r) => r.checked)!.value as PointOptions["mode"],
        variant: document.getElementById("pg-variant") ? $<HTMLSelectElement>("pg-variant").value : preferences.variant,
        level: $<HTMLSelectElement>("pg-level").value as Level,
      };
      $("pg-options").hidden = $("pg-level-field").hidden = solo || preferences.mode !== "ai";
      nav.remember({ ...preferences });
    };
    if (alone) preferences = { ...preferences, mode: "ai" };
    radios.forEach((r) => {
      r.checked = r.value === preferences.mode;
      r.onchange = remember;
    });
    if (document.getElementById("pg-variant")) $("pg-variant").onchange = remember;
    $("pg-level").onchange = remember;
    $("pg-options").hidden = $("pg-level-field").hidden = solo || preferences.mode !== "ai";
    $("pg-start").onclick = start;
  }
  function start() {
    mode = alone ? "ai" : preferences.mode;
    variant = preferences.variant;
    level = preferences.level;
    state = shown = game.create(variant);
    spec = config.board?.(variant) ?? null;
    past = [];
    chosen = {};
    cursor = null;
    announced = false;
    lockedUntil = 0;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  const model = (s: S) => ({ owners: game.owners(s), crowned: game.crowned?.(s), moveId: game.ply(s), effect: game.effect(s) });
  function screen() {
    stop();
    const side = (p: number) =>
      `<li id="pg-side-${p}"${solo && p ? " hidden" : ""}><i class="yut-dot" style="background:${(spec?.colors ?? config.colorsOf?.(variant) ?? config.colors ?? ["#16181a", "#b9b3a4"])[p]}"></i><b>${who(p)}</b><span id="pg-count-${p}"></span></li>`;
    root.innerHTML =
      nav.header() +
      `<main class="game-layout yacht-game point-game${config.shape ? ` board-${config.shape}` : ""}${config.noPanel ? " no-panel" : ""}${solo ? " solo" : ""}${config.panel ? ` panel-${config.panel}` : ""}"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>${config.name} <small>${config.english.toUpperCase()}</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>${config.tableLabel}</span><span>${config.tableNote(variant)}</span></div><div id="board"></div><div class="pg-tools">${(config.tools ?? []).map((tool, i) => `<button id="pg-tool-${i}" class="pg-tool${tool.onBoard ? " sr-only" : ""}" hidden>${tool.label}</button>`).join("")}</div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar yd-sidebar pg-sidebar"><div id="turn" role="status" aria-live="polite"></div><ul class="yut-sides">${side(0)}${side(1)}</ul><div class="yd-controls">${config.action ? `<button id="pg-action" class="primary">${config.action}</button>` : ""}<button id="pg-undo" ${config.action || config.noUndo ? "hidden" : ""}>무르기</button><p id="pg-note" class="input-help"></p><p class="input-help">${config.help ?? "마우스·터치: 말을 누른 뒤 갈 곳을 누릅니다<br>키보드: 판을 선택하고 방향키·Enter, Escape로 취소"}</p></div><div id="pg-result" class="yd-result" hidden><p id="pg-final"></p><button id="pg-again" class="primary">다시 플레이</button></div></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = () => modal(config.rulesTitle, config.rules);
    dress(setup, ["#pg-action", "#pg-undo"]);
    $("pg-again").onclick = () => setupDialog(setup);
    $("pg-undo").onclick = undo;
    if (config.action) $("pg-action").onclick = () => pick(game.moves(state)[0]?.to ?? -1);
    // On a table that runs by itself a button is a move at once, whatever else is going on.
    (config.tools ?? []).forEach((tool, i) => ($(`pg-tool-${i}`).onclick = () => (config.live ? commit({ from: -1, to: tool.point, extra: -1 }) : pick(tool.point))));
    try {
      if (config.view) view = config.view($("board"), settings.quality, variant, mode, level);
      else {
        const board = new PointBoardView($("board"), settings.quality, spec!);
        view = {
          renderer: board.renderer,
          get animating() {
            return board.animating;
          },
          set onContact(fn: () => void) {
            board.onContact = fn;
          },
          set onSettled(fn: () => void) {
            board.onSettled = fn;
          },
          set onPick(fn: (point: number) => void) {
            board.onPick = fn;
          },
          sync: (s, animate) => board.sync(model(s), animate),
          setMarks: (marks) => board.setMarks(marks),
          setQuality: (quality) => board.setQuality(quality),
          dispose: () => board.dispose(),
        } as PointView<S>;
      }
      view.onContact = () => (config.contact ? config.contact(sound, state) : sound.tap());
      view.onSettled = present;
      view.onPick = pick;
      view.onMove = commit;
      const canvas = view.renderer.domElement;
      canvas.tabIndex = 0;
      canvas.setAttribute("aria-label", `${config.name} 판`);
      canvas.addEventListener("keydown", key);
      view.sync(state, false);
      // Keys that are moves must work from the start, without a first click on the table.
      if (config.keyMove || config.live) canvas.focus({ preventScroll: true });
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요.</p></div>';
    }
    present();
  }
  const busy = () =>
    !!view?.animating ||
    state !== shown ||
    thinking ||
    performance.now() < lockedUntil ||
    !!document.querySelector("dialog[open]");
  function apply(next: S) {
    const shout = config.cheer?.(state, next, mode);
    if (shout) cheer(shout);
    if (cursor !== null && config.rehome?.(state, next)) cursor = config.keyStart?.(next) ?? cursor;
    state = next;
    chosen = {};
    if (view) view.sync(state);
    else present();
    update();
  }
  /** The legal moves that agree with the points chosen so far. */
  const open = () =>
    game.moves(state).filter(
      (m) => (chosen.from === undefined || m.from === chosen.from) && (chosen.to === undefined || m.to === chosen.to),
    );
  /** What the next tap chooses: a piece, a destination, or a piece to take. */
  function stage(): { field: "from" | "to" | "extra"; points: number[] } {
    const moves = open(),
      distinct = (values: number[]) => [...new Set(values)];
    if (chosen.from === undefined && moves.some((m) => m.from >= 0))
      return { field: "from", points: distinct(moves.map((m) => m.from)) };
    if (chosen.to === undefined) return { field: "to", points: distinct(moves.map((m) => m.to)) };
    return { field: "extra", points: distinct(moves.map((m) => m.extra)) };
  }
  /** A tap on a point (or -1): the choice it completes is played at once. */
  function pick(point: number) {
    if (busy() || computerTurn() || over()) return;
    // A move that needs no piece (a tool, a draw) is played from wherever the choice stands.
    const direct = game.moves(state).filter((m) => m.from === -1 && m.to === point && m.extra === -1);
    if (direct.length === 1 && stage().field === "from") return commit(direct[0]);
    const { field, points } = stage();
    if (!points.includes(point)) {
      // Another of my pieces changes the choice; anything else clears it.
      const first = game.moves(state).some((m) => m.from === point);
      chosen = first && point !== chosen.from ? { from: point } : {};
      update();
      return;
    }
    if (field === "from") chosen = { from: point };
    else if (field === "to") chosen = { ...chosen, to: point };
    const moves = open(),
      move: Move | undefined =
        field === "extra"
          ? moves.find((m) => m.extra === point)
          : (field === "to" || (field === "from" && config.autoSingle)) && moves.length === 1
            ? moves[0]
            : undefined;
    if (!move) {
      update();
      return;
    }
    commit(move);
  }
  /** Plays a move of mine. */
  function commit(move: Move) {
    if ((!config.live && busy()) || computerTurn() || over()) return;
    const next = game.play(state, move, cryptoRandom);
    if (!next) return;
    sound.unlock();
    if (config.live) return apply(next);
    // A choice that is not yet a move (a bet being set, a ball put down by hand) is neither kept for undo nor followed by a pause.
    if (game.ply(next) !== game.ply(state)) {
      past.push(state);
      lockedUntil = performance.now() + 200;
      later(update, 220);
    }
    apply(next);
  }
  /** Arrow keys walk the points of the board; Enter taps the one under the cursor. */
  function key(e: KeyboardEvent) {
    const direct = config.keyMove?.(e.key, state);
    if (direct) {
      e.preventDefault();
      e.stopPropagation();
      commit(direct);
      return;
    }
    const steps: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (e.key === "Escape") {
      chosen = {};
      update();
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (cursor !== null) pick(cursor);
    } else if (steps[e.key]) {
      e.preventDefault();
      const points = spec?.points ?? config.keyPoints?.(state) ?? [];
      if (!points.length) return;
      const start = config.keyStart?.(state) ?? 0,
        here = points[cursor ?? start],
        [dx, dz] = steps[e.key];
      let best = cursor ?? start,
        cost = Infinity;
      if (cursor !== null)
        points.forEach((p, i) => {
          const along = (p.x - here.x) * dx + (p.z - here.z) * dz,
            across = Math.abs((p.x - here.x) * dz) + Math.abs((p.z - here.z) * dx);
          // The nearest point lying mostly in that direction.
          if (along > 0.05 && across <= along * 1.6 && along + across * 2 < cost) {
            cost = along + across * 2;
            best = i;
          }
        });
      cursor = best;
      update();
    }
  }
  function undo() {
    if (busy() || !past.length) return;
    // Against the computer, go back to my own last turn.
    let back = past.pop()!;
    while (mode === "ai" && game.turn(back) !== 0 && past.length) back = past.pop()!;
    generation++;
    state = shown = back;
    chosen = {};
    announced = false;
    if (view) view.sync(state, false);
    else present();
  }
  function computer() {
    if (thinking || !computerTurn() || state !== shown) return;
    thinking = true;
    const current = generation;
    update();
    later(() => {
      const move =
          current === generation && computerTurn()
            ? game.choose
              ? game.choose(state, level, cryptoRandom)
              : choose(game, state, LEVELS[level].budget, LEVELS[level].depth, undefined, LEVELS[level].slip)
            : null,
        next = move && game.play(state, move, cryptoRandom);
      thinking = false;
      if (current !== generation || !next) {
        update();
        return;
      }
      past.push(state);
      apply(next);
    }, 450 + (config.ponder?.(state) ?? 0));
  }
  /** Everything has come to rest: describe the current state. */
  function present() {
    if (disposed) return;
    shown = state;
    update();
    if (over() && !announced) {
      announced = true;
      if (config.bankrupt?.(state)) bankrupt();
      if (mode === "ai" && game.winner(state) === 1) sound.lose();
      else sound.win();
    }
    computer();
  }
  function update() {
    if (disposed || !document.getElementById("pg-undo")) return;
    mirrorStatus();
    const s = shown,
      waiting = busy(),
      bot = computerTurn(s),
      done = over(s),
      turn = game.turn(s),
      next = done || bot || waiting ? null : stage();
    $("board").dataset.animating = String(!!view?.animating || state !== shown || thinking);
    $("board").dataset.turn = String(turn);
    $("move-count").textContent = `${game.ply(s)}수`;
    $("turn").dataset.player = String(turn);
    $("turn").textContent = solo
      ? done
        ? "게임이 끝났습니다."
        : game.hint(s)
      : done
      ? "대국이 끝났습니다."
      : state !== shown
        ? "말이 움직이는 중…"
        : bot
          ? `${who(1)}가 생각하는 중…`
          : next?.field === "extra"
            ? `${who(turn)} 차례 — ${config.extraHint ?? "떼어낼 상대 말을 고르세요."}`
            : next?.field === "to" && chosen.from !== undefined
              ? `${who(turn)} 차례 — 갈 곳을 고르세요.`
              : `${who(turn)} 차례 — ${game.hint(s)}`;
    const tally = game.tally(s);
    for (const p of [0, 1]) {
      // A game may draw its tally (a fleet) instead of writing it.
      const drawn = config.tallyHtml?.(s);
      if (drawn) $(`pg-count-${p}`).innerHTML = drawn[p];
      else $(`pg-count-${p}`).textContent = tally[p];
      $(`pg-side-${p}`).classList.toggle("active", !done && turn === p);
    }
    $<HTMLButtonElement>("pg-undo").disabled = waiting || !past.length;
    if (config.action) $<HTMLButtonElement>("pg-action").disabled = waiting || bot || done;
    // A tool is offered only while the move it stands for is legal.
    (config.tools ?? []).forEach((tool, i) => {
      const button = $<HTMLButtonElement>(`pg-tool-${i}`);
      const legal = game.moves(s).some((m) => m.to === tool.point);
      button.hidden = done || !(tool.show ? tool.show(s) : legal);
      button.disabled = waiting || bot || !legal;
      if (tool.text) button.textContent = tool.text(s);
    });
    $("pg-note").textContent = "";
    const marks: Marks = {
      movable:
        next?.field === "from" && config.showMovable !== false
          ? next.points
          : chosen.from !== undefined && next
            ? [chosen.from]
            : [],
      selected: chosen.from ?? null,
      targets: next?.field === "to" ? next.points : [],
      removable: next?.field === "extra" ? next.points : [],
      cursor: view && document.activeElement === view.renderer.domElement ? cursor : null,
      pending: next?.field === "extra" ? (chosen.to ?? null) : null,
    };
    view?.setMarks(capturing() ? { movable: [], selected: null, targets: [], removable: [], cursor: null } : marks);

    // Whether the person at the screen won, lost or drew: two at one screen always have a winner to cheer.
    $("pg-result").dataset.outcome = game.winner(s) === "draw" ? "draw" : mode === "ai" && game.winner(s) === 1 ? "lose" : "win";
    $("pg-result").hidden = !done;
    if (done) {
      const winner = game.winner(s);
      $("pg-final").textContent = solo
        ? game.reason(s)
        : winner === "draw"
          ? `비겼습니다. ${game.reason(s)}`
          : `${mode === "ai" ? (winner === 0 ? "이겼습니다!" : "컴퓨터가 이겼습니다.") : `${who(winner as number)} 승리!`} ${game.reason(s)}`;
    }
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
  const show = (e: PageTransitionEvent) => {
    if (e.persisted && document.getElementById("pg-undo")) {
      lockedUntil = 0;
      if (view) view.sync(state, false);
      present();
    }
  };
  const dialogClosed = () => later(update, 0);
  /** Keys that are moves are taken from the page as well, when nothing else has the focus. */
  const pageKey = (e: KeyboardEvent) => {
    if (config.keyMove && (e.target === document.body || e.target === document.documentElement) && document.getElementById("pg-undo") && !document.querySelector("dialog[open]")) key(e);
  };
  document.addEventListener("keydown", pageKey);
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
      document.removeEventListener("keydown", pageKey);
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
