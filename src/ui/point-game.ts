import { dress, interlude, type SetResult } from "./chrome";
import { bankrupt, capturing, cheer, mirrorStatus } from "./banner";
import { modal, setupDialog } from "./dialog";
import { LEVELS, choose, type Level } from "../games/points/ai";
import type { GameOptions, Move, PointGame } from "../games/points/types";
import { INK, PointBoardView, type BoardSpec, type Marks } from "../games/points/view";
import { cryptoRandom } from "../core/random";
import { Sound } from "../engine/sound";
import type { Settings } from "../core/storage";

export interface PointOptions {
  mode: "local" | "ai";
  variant: string;
  level: Level;
  /** What was set for a game's own `settings`, by id (kept for this page only, like the rest). */
  settings?: GameOptions;
}
/**
 * Something a game lets the player set before it starts, beyond its variant (the user asked for a game whose numbers
 * can be chosen): a number is offered as − value + (the value may be typed too), a rule only on or off as a
 * checkbox, a list as buttons. It is not offered for the variants in `fixed`, nor out of play against the computer
 * when it is `ai`; `value` is then what `create` receives.
 */
export type PointSetting = {
  id: string;
  label: string;
  note?: string;
  ai?: boolean;
  fixed?: string[];
} & (
  | { kind: "number"; value: number; min: number; max: number }
  | { kind: "flag"; value: boolean }
  | { kind: "choice"; value: string; options: { value: string; label: string }[] }
);
/** What the screen needs from a board, whichever way it is drawn. */
export interface PointView<S> {
  readonly renderer: { domElement: HTMLCanvasElement };
  readonly animating: boolean;
  onContact: () => void;
  /** A shot striking a disc, a cushion or a pocket, for a table that tells them apart (pocket ball). */
  onKnock?: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null;
  /** Dice thrown on the table: `land` is how many seconds from now they come down. */
  onRoll?: (count: number, land: number) => void;
  onSettled: () => void;
  onPick: (point: number) => void;
  /** A whole move made by a gesture of the view's own (a flick), instead of by picking points. */
  onMove?: (move: Move) => void;
  /** Stops and starts the clock of a table that runs in real time. */
  setPaused?: (paused: boolean) => void;
  /** Brings a view the player has turned back to where it started (the 시점 전환 of a `turnable` table). */
  resetView?: () => void;
  /** A move of mine the screen refused (at once, or when its turn in a `queueMoves` queue came), for a view that shows it (a shake). */
  refused?: (move: Move) => void;
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
  /** What the status line says while the computer thinks, for a game where several computer sides take turns (which of them moves); the default names the computer. */
  thinkingText?: (state: S) => string;
  /** What the status line says while the table is still moving (a ball rolling, an arrow in flight); the default speaks of pieces. */
  movingText?: string;
  /** A table that needs more height on a narrow screen: an upright rack, or two boards one above the other. */
  shape?: "tall" | "taller";
  /** Buttons that play the move to a point which is not on the board (turn the ship, lay the fleet at random). */
  /** `show` keeps a tool in place (greyed) while its move is not legal; `text` rewrites its label for the state. */
  /** `keep` holds a tool's place, unseen, while its move is not legal, so that the buttons beside it do not shift. */
  /** On a live table a tool with `release` is held: its move is made when it is pressed and `release` when it is let go. */
  tools?: { label: string; point: number; release?: number; onBoard?: boolean; show?: (state: S) => boolean; keep?: (state: S) => boolean; text?: (state: S) => string; area?: string; name?: string }[];
  /** Extra time, in milliseconds, the computer takes over the move it is about to make. */
  ponder?: (state: S) => number;
  /** No panel beside the table: the table takes the whole width (the panel stays in the page, unseen, for readers). */
  noPanel?: boolean;
  /** How the panel shows the two tallies: "big" writes them large at the right of each side; "scoreboard" sets the two sides against each other like a stadium board. */
  panel?: "big" | "scoreboard";
  /** The two tallies as markup, for a game that draws them; it must tell no more than `tally` does. `mode` names the sides. */
  tallyHtml?: (state: S, mode: "local" | "ai") => [string, string];
  /** True when the game has ended with side 0 out of money: the 파산 stamp is shown. */
  bankrupt?: (state: S) => boolean;
  /** A line to flash over the table for what a move has just done (a piece taken), or null. */
  cheer?: (before: S, state: S, mode: "local" | "ai") => string | null;
  /** The cheer waits until the table has come to rest (curling's score is called only once the stones have stopped). */
  cheerOnRest?: boolean;
  /**
   * A set (a game, an end) of a match has just ended with the match going on: its word for the person at the screen
   * (`n세트 승리`, or the side that took it when two play at one screen) and its scores, shown over the table by
   * `interlude`; null otherwise. It is not asked for when the move ends the match (`finale` tells that alone), and
   * it waits for the table to rest like the cheer when `cheerOnRest` is set.
   */
  setResult?: (before: S, state: S, mode: "local" | "ai") => SetResult | null;
  /** No table for two: one side's pieces are hidden from the other. */
  computerOnly?: boolean;
  /** A game for one: no other side, no computer, no level. `winner` 0 is a game won and 1 a game lost; the result is told by `reason` alone. */
  solo?: boolean;
  /** A variant played alone in a game that is otherwise for two (bowling by oneself): one player is named, and the result is told by `reason` alone. */
  soloOf?: (variant: string) => boolean;
  /** The table runs in real time: what it reports is never refused for being busy, and nothing is kept for undo. */
  live?: boolean;
  /** A table that runs in real time and can be stopped: a 일시정지 button stands with the tools (and the P key does the same). */
  pausable?: boolean;
  /**
   * Starting positions chosen from pictures: after sitting down, and from 새 게임, a window shows a card for
   * each (`art` is markup, a small picture) instead of a list in the setup panel. `value` is the variant.
   */
  stages?: { value: string; name: string; note: string; art: string }[];
  /**
   * A puzzle laid afresh each time: the panel carries its controls (the stages as buttons, 힌트, 무르기,
   * 처음부터, 다른 퍼즐) instead of the table's corner; no result window comes up, and a solved puzzle
   * offers 다음 스테이지. `hint` is the next move of a way to solve the state, or null when there is none.
   */
  /** `hintText` may depend on the move hinted at, for a puzzle whose hints point at different kinds of things. */
  puzzle?: { hint: (state: S) => Move | null; hintText?: string | ((state: S, move: Move) => string) };
  /**
   * A move given while the table still moves is kept and played the moment it rests, and no pause follows a move.
   * `true` keeps one, the latest (glide cube: the user asked to give pushes ahead); `"all"` keeps every one, played in
   * the order given, one each time the table rests (bulb link: quick taps in a row); a kept move found illegal when
   * its turn comes is refused (with `refusal`'s words) and the rest are dropped. Undo, a restart or the end drops them.
   */
  queueMoves?: boolean | "all";
  /** A puzzle that begins again by itself, a moment after the failure has been seen, when this says the state is one (the user asked for it in glide cube and the laser puzzle). */
  restartOnFail?: (state: S) => boolean;
  /** Why a move of mine is refused, said in the status line until the next move (a piece that may not stand there). */
  refusal?: (state: S, move: Move) => string | null;
  /** The player turns the view by dragging the table; a 시점 전환 button over the table brings it back (`resetView`). */
  turnable?: boolean;
  /** The stage window comes up as soon as one sits down, not only from 새 게임. */
  stagesFirst?: boolean;
  /** The tools stand at the lower left as the arrow keys of a keyboard do; each names its place with `area` (up, left, down, right, or drop beside them). */
  toolsLayout?: "arrows";
  /** What the button over the table that starts anew is called, and the heading of its window, when it is not 새 게임. */
  newGameLabel?: string;
  /** A key that is a whole move (an arrow that slides the tiles), or null for the usual walk over the points. */
  /** `repeat` is true for the copies a key held down sends. */
  /** `held` says whether Shift is down and where the keyboard's cursor stands (a key that lays a rail from there). */
  keyMove?: (key: string, state: S, repeat?: boolean, held?: { shift: boolean; cursor: number | null }) => Move | null;
  /** A key let go that is a move of its own (an arrow that was held to move something along), on a live table. */
  keyUp?: (key: string, state: S) => Move | null;
  /** The names and colours of the two sides, when they depend on the variant (or on the state shown: the empire chosen). */
  sidesOf?: (variant: string, state?: S) => [string, string];
  colorsOf?: (variant: string) => [string, string];
  /** Who moves first against the computer, when it is not simply side 0. */
  firstNote?: string;
  /** What a piece coming to rest sounds like, instead of a tap. */
  contact?: (sound: Sound, state: S) => void;
  /** How the strikes of a shot sound, where a disc, a cushion and a pocket each have their own. */
  knock?: (sound: Sound, kind: "disc" | "cushion" | "pocket", strength: number) => void;
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
  /** What the game was set up as, in words; `options` are those its `create` received. */
  tableNote: (variant: string, options: GameOptions) => string;
  rulesTitle: string;
  rules: string;
  /** Names of the two sides; side 0 moves first. */
  sides: [string, string];
  variants?: { value: string; label: string }[];
  /** What the variants are called in the setup panel. */
  variantLabel?: string;
  /** Numbers and rules set before the game, passed to `create` as its `options` (none for most games). */
  settings?: PointSetting[];
  /** The variants lay different boards: each choice in the settings window shows its board, pieces set out. */
  variantArt?: boolean;
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
  /** Shows the game's 게임 방법. */
  rules(): void;
  dispose(): void;
  setSettings(settings: Settings): void;
}

/** Whether a setting is offered for a variant and a mode (`settings` of a `PointConfig`). */
/** How many moves a `queueMoves: "all"` screen keeps at most while the table moves. */
const QUEUE_LIMIT = 24;
/** How long a failure stands on the table before a `restartOnFail` puzzle begins again. */
const RESTART_AFTER = 1600;
const offered = (setting: PointSetting, variant: string, mode: PointOptions["mode"]) => !setting.fixed?.includes(variant) && (!setting.ai || mode === "ai");
/** A setting's value as it may be used: a whole number within its bounds, a rule on or off, one of its choices; else its own. */
function settled(setting: PointSetting, value: unknown): number | boolean | string {
  if (setting.kind === "number") {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && value !== "" && value !== null ? Math.min(setting.max, Math.max(setting.min, n)) : setting.value;
  }
  if (setting.kind === "flag") return typeof value === "boolean" ? value : setting.value;
  return setting.options.some((o) => o.value === value) ? (value as string) : setting.value;
}
/** What `create` receives: each setting as chosen where it is offered, else at its own value. */
function optionsOf(settings: PointSetting[] | undefined, preferences: PointOptions, mode: PointOptions["mode"]): GameOptions {
  const out: GameOptions = {};
  for (const setting of settings ?? [])
    out[setting.id] = offered(setting, preferences.variant, mode) ? settled(setting, preferences.settings?.[setting.id]) : setting.value;
  return out;
}
/** The setup's field for a setting: − value + for a number, a checkbox for a rule, a list (turned into buttons) for a choice. */
function settingField(setting: PointSetting, value: number | boolean | string) {
  const id = `pg-set-${setting.id}`;
  if (setting.kind === "number")
    return `<div class="pg-number" data-setting="${setting.id}"><label for="${id}">${setting.label}</label><div class="stepper"><button type="button" class="step" data-step="-1" aria-label="${setting.label} 줄이기">−</button><input type="number" id="${id}" min="${setting.min}" max="${setting.max}" step="1" value="${value}" inputmode="numeric"><button type="button" class="step" data-step="1" aria-label="${setting.label} 늘리기">+</button></div><small>${setting.note ?? `${setting.min}~${setting.max}`}</small></div>`;
  if (setting.kind === "flag")
    return `<label class="rule-option" data-setting="${setting.id}"><input type="checkbox" id="${id}" ${value ? "checked" : ""}> ${setting.label}${setting.note ? `<small>${setting.note}</small>` : ""}</label>`;
  return `<label data-setting="${setting.id}">${setting.label}<select id="${id}">${setting.options.map((o) => `<option value="${o.value}" ${o.value === value ? "selected" : ""}>${o.label}</option>`).join("")}</select></label>`;
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
    // The numbers and rules the game now on the table was set up with (none for most games).
    options = optionsOf(config.settings, preferences, config.solo || config.computerOnly ? "ai" : mode),
    state = game.create(variant, options),
    // What the panel describes: the last state whose pieces have come to rest.
    shown = state,
    past: S[] = [],
    spec: BoardSpec | null = config.board?.(variant) ?? null,
    view: PointView<S> | null = null,
    disposed = false,
    generation = 0,
    lockedUntil = 0,
    /** Moves given ahead (`queueMoves`: one with `true`, any number with "all"), played once the table rests. */
    queued: Move[] = [],
    announced = false,
    thinking = false,
    paused = false,
    // A puzzle: the move a hint points at, a line for the panel, and which puzzle of the stage this is.
    hinted: Move | null = null,
    notice = "",
    // Why a move of mine was refused (a game with `refusal`), told while the state it was refused in stands.
    warned: { state: S; text: string } | null = null,
    stageNo = 1,
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
  const sides = () => config.sidesOf?.(variant, shown) ?? config.sides;
  /** Played alone: the game is for one, or this variant of it is. */
  const lone = () => solo || !!config.soloOf?.(variant);
  const who = (player: number) =>
    lone() ? "나" : mode === "local" ? `${sides()[player]} (플레이어 ${player + 1})` : player === 0 ? `나 (${sides()[0]})` : `컴퓨터 · ${LEVELS[level].label} (${sides()[1]})`;
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
    else if (config.stages) return stagePicker(host);
    host.innerHTML = `<section class="featured"><div class="feature-copy"><span class="game-number">${config.number}</span><h2>${config.name} <span>${config.english}</span></h2>${config.intro}<div class="game-meta">${config.meta}</div><div class="mode-select" ${alone ? "hidden" : ""}><label><input type="radio" name="pg-mode" value="local"> 로컬 2인</label><label><input type="radio" name="pg-mode" value="ai"> 컴퓨터 대전</label></div><div class="ai-options">${config.variants ? `<label>${config.variantLabel ?? "종류"}<select id="pg-variant">${config.variants.map((v) => `<option value="${v.value}" ${preferences.variant === v.value ? "selected" : ""}>${v.label}</option>`).join("")}</select></label>` : ""}${(config.settings ?? []).map((s) => settingField(s, settled(s, preferences.settings?.[s.id]))).join("")}<label id="pg-level-field">컴퓨터 난이도<select id="pg-level">${(Object.keys(LEVELS) as Level[]).map((l) => `<option value="${l}" ${preferences.level === l ? "selected" : ""}>${LEVELS[l].label}</option>`).join("")}</select></label></div><small id="pg-options" class="session-note" hidden>${config.firstNote ?? `컴퓨터 대전에서는 내가 ${config.sides[0]}으로 먼저 둡니다.`}</small><button id="pg-start" class="primary">${config.startWord} <span>↗</span></button></div><div class="feature-art ${config.artClass}" role="img" aria-label="${config.artLabel}">${config.art}</div></section>`;
    const radios = document.querySelectorAll<HTMLInputElement>("input[name=pg-mode]");
    /** The game's own settings as the form has them, each shown only where it is offered. */
    const readSettings = () => {
      if (!config.settings) return preferences.settings;
      const out: GameOptions = { ...preferences.settings };
      for (const setting of config.settings) {
        const field = host.querySelector<HTMLElement>(`[data-setting="${setting.id}"]`),
          input = host.querySelector<HTMLInputElement & HTMLSelectElement>(`#pg-set-${setting.id}`);
        if (!field || !input) continue;
        const value = settled(setting, setting.kind === "flag" ? input.checked : input.value);
        // A number half typed (nothing, or "1" on the way to "12") keeps what was set before it.
        if (setting.kind !== "number" || (input.value !== "" && Number(input.value) >= setting.min && Number(input.value) <= setting.max)) out[setting.id] = value;
        if (setting.kind === "number") {
          const now = settled(setting, out[setting.id]) as number;
          field.querySelector<HTMLButtonElement>('[data-step="-1"]')!.disabled = now <= setting.min;
          field.querySelector<HTMLButtonElement>('[data-step="1"]')!.disabled = now >= setting.max;
        }
        field.hidden = !offered(setting, document.getElementById("pg-variant") ? $<HTMLSelectElement>("pg-variant").value : preferences.variant, [...radios].find((r) => r.checked)?.value === "ai" || alone ? "ai" : "local");
      }
      return out;
    };
    const remember = () => {
      preferences = {
        mode: [...radios].find((r) => r.checked)!.value as PointOptions["mode"],
        variant: document.getElementById("pg-variant") ? $<HTMLSelectElement>("pg-variant").value : preferences.variant,
        level: $<HTMLSelectElement>("pg-level").value as Level,
        ...(config.settings ? { settings: readSettings() } : preferences.settings ? { settings: preferences.settings } : {}),
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
    // Each board a variant lays is shown on its choice (the settings window's buttons take `data-icon`).
    if (config.variantArt)
      for (const option of host.querySelectorAll<HTMLOptionElement>("#pg-variant option")) {
        const art = boardPicture(option.value);
        if (art) option.dataset.icon = art;
      }
    $("pg-level").onchange = remember;
    $("pg-options").hidden = $("pg-level-field").hidden = solo || preferences.mode !== "ai";
    // A game's own numbers: − and + step within bounds, a typed number counts once it is whole and in bounds (and is
    // brought within them when the field is left); rules and choices are remembered as they change.
    for (const setting of config.settings ?? []) {
      const input = host.querySelector<HTMLInputElement & HTMLSelectElement>(`#pg-set-${setting.id}`);
      if (!input) continue;
      if (setting.kind === "number") {
        host.querySelectorAll<HTMLButtonElement>(`[data-setting="${setting.id}"] button.step`).forEach(
          (button) =>
            (button.onclick = () => {
              const now = settled(setting, preferences.settings?.[setting.id] ?? setting.value) as number;
              input.value = String(settled(setting, now + Number(button.dataset.step)));
              remember();
            }),
        );
        input.oninput = remember;
        input.onchange = () => {
          input.value = String(settled(setting, input.value === "" ? (preferences.settings?.[setting.id] ?? setting.value) : input.value));
          remember();
        };
      } else input.onchange = remember;
    }
    if (config.settings) preferences = { ...preferences, settings: readSettings() };
    // A game with stages offers its cards here too, so the window a game is entered through chooses the stage as
    // well; the start keeps the one laid. A game that has nothing else to set (`stagesFirst`: the puzzles for one)
    // is entered through its stage window itself (the user asked to have the two windows made one): the cards as
    // that window shows them, and the start where its 계속하기 stood.
    const merged = !!config.stages && !!config.stagesFirst;
    $("pg-start").onclick = () => {
      stageNo = 1;
      start(merged ? false : undefined);
    };
    if (config.stages) {
      $("pg-start").insertAdjacentHTML("beforebegin", stageCards());
      bindStages(host, null);
    }
    if (merged) {
      host.querySelector(".featured")?.classList.add("stage-entry");
      host.querySelector(".featured")?.setAttribute("data-entry-note", "하고 싶은 배치를 고르세요. 카드를 누르면 바로 시작합니다.");
      $("pg-start").dataset.entryAction = "";
    }
  }
  /**
   * A small picture of the board a variant lays, drawn by the board's own `paint` on its own ground, with the pieces
   * where they start: the settings window shows it on the variant's button (the user asked to see the maps).
   */
  function boardPicture(value: string) {
    const spec = config.board?.(value),
      canvas = document.createElement("canvas"),
      ctx = canvas.getContext("2d");
    if (!spec || !ctx) return null;
    const size = 144,
      unit = size / (spec.half * 2),
      px = (x: number, z: number): [number, number] => [size / 2 + x * unit, size / 2 + z * unit];
    canvas.width = canvas.height = size;
    ctx.fillStyle = spec.theme === "yard" ? "#d2b282" : spec.theme === "wood" ? "#c99a66" : "#18263a";
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.12);
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle = spec.theme === "yard" ? "#4a321a" : INK[spec.theme];
    ctx.lineWidth = unit * (spec.theme === "yard" ? 0.16 : 0.06);
    ctx.lineCap = ctx.lineJoin = "round";
    spec.paint(ctx, px, unit);
    const owners = game.owners(game.create(value)),
      colors = spec.colors ?? config.colorsOf?.(value) ?? config.colors ?? ["#16181a", "#efe7d6"];
    spec.points.forEach((p, i) => {
      const owner = owners[i];
      if (owner !== 0 && owner !== 1) return;
      ctx.beginPath();
      ctx.arc(...px(p.x, p.z), Math.max(spec.radius * unit, 4), 0, Math.PI * 2);
      ctx.fillStyle = colors[owner];
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(0, 0, 0, 0.45)";
      ctx.stroke();
    });
    return `<img class="board-map" src="${canvas.toDataURL("image/png")}" alt="">`;
  }
  /** In the new-game window of a game with stages: a card with a picture for each, and a press on one starts it. */
  function stagePicker(host: HTMLElement) {
    const dialog = host.closest("dialog");
    if (dialog) {
      dialog.querySelector("h2")!.textContent = config.newGameLabel ?? "스테이지 선택";
      dialog.querySelector(".setup-note")!.textContent = "하고 싶은 배치를 고르세요. 하던 게임은 끝내고 새로 시작합니다.";
    }
    host.innerHTML = stageCards();
    bindStages(host, dialog);
  }
  /** The stage cards: a picture, a name and a note for each, the stage laid now marked. */
  function stageCards() {
    return `<div class="stage-grid">${config.stages!.map((stage) => `<button class="stage-card${stage.value === preferences.variant ? " current" : ""}" data-stage="${stage.value}"><span class="stage-art" aria-hidden="true">${stage.art}</span><b>${stage.name}</b><small>${stage.note}</small></button>`).join("")}</div>`;
  }
  /** A press on a stage card sits down at that stage, closing the window it is in. */
  function bindStages(host: HTMLElement, dialog: HTMLDialogElement | null) {
    host.querySelectorAll<HTMLButtonElement>(".stage-card").forEach(
      (card) =>
        (card.onclick = () => {
          preferences = { ...preferences, variant: card.dataset.stage! };
          nav.remember({ ...preferences });
          // Drawn into the setup, the cards are carried into the entry window later: they close whichever holds them.
          const holder = dialog ?? card.closest("dialog");
          holder?.close();
          holder?.remove();
          stageNo = 1;
          start(false);
        }),
    );
  }
  function start(pick = !!config.stages && !!config.stagesFirst) {
    mode = alone ? "ai" : preferences.mode;
    variant = preferences.variant;
    level = preferences.level;
    options = optionsOf(config.settings, preferences, mode);
    state = shown = game.create(variant, options);
    spec = config.board?.(variant) ?? null;
    past = [];
    chosen = {};
    cursor = null;
    hinted = null;
    notice = "";
    announced = false;
    lockedUntil = 0;
    queued = [];
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
    // A game with stages asks which, in a window over the table it has just laid.
    if (pick === true) setupDialog(setup);
  }
  const model = (s: S) => ({ owners: game.owners(s), crowned: game.crowned?.(s), moveId: game.ply(s), effect: game.effect(s) });
  function screen() {
    stop();
    paused = false;
    const side = (p: number) =>
      `<li id="pg-side-${p}"${solo && p ? " hidden" : ""}><i class="yut-dot" style="background:${(spec?.colors ?? config.colorsOf?.(variant) ?? config.colors ?? ["#16181a", "#b9b3a4"])[p]}"></i><b>${who(p)}</b><span id="pg-count-${p}"></span></li>`;
    root.innerHTML =
      nav.header() +
      `<main class="game-layout yacht-game point-game${config.shape ? ` board-${config.shape}` : ""}${config.noPanel ? " no-panel" : ""}${solo ? " solo" : ""}${config.toolsLayout ? ` tools-${config.toolsLayout}` : ""}${config.panel ? ` panel-${config.panel}` : ""}"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>${config.name} <small>${config.english.toUpperCase()}</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button>${config.turnable ? `<button id="camera">시점 전환</button>` : ""}<button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>${config.tableLabel}</span><span>${config.tableNote(variant, options)}</span></div><div id="board"></div><div class="pg-tools">${(config.tools ?? []).map((tool, i) => `<button id="pg-tool-${i}" class="pg-tool${tool.onBoard ? " sr-only" : ""}"${tool.area ? ` style="grid-area:${tool.area}"` : ""}${tool.name ? ` aria-label="${tool.name}"` : ""} hidden>${tool.label}</button>`).join("")}</div>${config.pausable ? `<div class="board-pause"><button id="pg-pause" class="board-icon pause-icon" aria-label="일시정지"><i aria-hidden="true"></i></button></div>` : ""}<div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar yd-sidebar pg-sidebar"><div id="turn" role="status" aria-live="polite"></div><ul class="yut-sides">${side(0)}${side(1)}</ul>${config.puzzle ? `<div class="puzzle-panel"><p class="puzzle-stage" id="pz-stage"></p><div class="puzzle-levels" role="group" aria-label="난이도">${(config.stages ?? []).map((stage) => `<button class="puzzle-level" data-stage="${stage.value}" aria-pressed="${stage.value === variant}"><b>${stage.name}</b><small>${stage.note}</small></button>`).join("")}</div><div class="puzzle-actions"><button id="pz-hint">힌트</button><button id="pg-undo">무르기</button><button id="pz-restart">처음부터</button><button id="pz-new">다른 퍼즐</button></div><button id="pz-next" class="primary" hidden>다음 스테이지 →</button></div>` : ""}<div class="yd-controls">${config.action ? `<button id="pg-action" class="primary">${config.action}</button>` : ""}${config.puzzle ? "" : `<button id="pg-undo" ${config.action || config.noUndo ? "hidden" : ""}>무르기</button>`}<p id="pg-note" class="input-help"></p><p class="input-help">${config.help ?? "마우스·터치: 말을 누른 뒤 갈 곳을 누릅니다<br>키보드: 판을 선택하고 방향키·Enter, Escape로 취소"}</p></div><div id="pg-result" class="yd-result" hidden><p id="pg-final"></p><button id="pg-again" class="primary">다시 플레이</button></div></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = () => modal(config.rulesTitle, config.rules);
    // A puzzle keeps its buttons in the panel; any other game has them moved onto the table.
    dress(setup, config.puzzle ? [] : ["#pg-action", "#pg-undo"]);
    if (config.puzzle) {
      document.querySelectorAll<HTMLButtonElement>(".puzzle-level").forEach(
        (button) =>
          (button.onclick = () => {
            preferences = { ...preferences, variant: button.dataset.stage! };
            nav.remember({ ...preferences });
            stageNo = 1;
            start(false);
          }),
      );
      $("pz-hint").onclick = () => {
        if (busy() || over()) return;
        hinted = config.puzzle!.hint(state);
        chosen = {};
        notice = hinted ? "" : "여기서는 풀 수 없습니다. 무르기로 되돌려 보세요.";
        update();
      };
      $("pz-restart").onclick = () => {
        if (busy() || !past.length) return;
        restartPuzzle();
      };
      $("pz-new").onclick = () => start(false);
      $("pz-next").onclick = () => {
        stageNo++;
        start(false);
      };
    }
    $("pg-again").onclick = () => setupDialog(setup);
    $("pg-undo").onclick = undo;
    if (config.action) $("pg-action").onclick = () => pick(game.moves(state)[0]?.to ?? -1);
    // On a table that runs by itself a button is a move at once, whatever else is going on.
    (config.tools ?? []).forEach((tool, i) => {
      const button = $(`pg-tool-${i}`),
        made = (to: number) => commit({ from: -1, to, extra: -1 });
      if (!(config.live && tool.release !== undefined)) {
        button.onclick = () => (config.live ? made(tool.point) : pick(tool.point));
        return;
      }
      // Held: pressed it pushes, let go it stops; a click from the keyboard is a short push.
      const release = tool.release;
      let held = false;
      const up = () => {
        if (!held) return;
        held = false;
        made(release);
      };
      button.onpointerdown = (e) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        button.setPointerCapture(e.pointerId);
        held = true;
        made(tool.point);
      };
      button.onpointerup = button.onpointercancel = button.onlostpointercapture = up;
      button.oncontextmenu = (e) => e.preventDefault();
      button.onclick = (e) => {
        if (e.detail !== 0) return;
        made(tool.point);
        later(() => made(release), 300);
      };
    });
    if (config.pausable) $("pg-pause").onclick = togglePause;
    if (config.turnable) $("camera").onclick = () => view?.resetView?.();
    if (config.newGameLabel) $("restart").textContent = config.newGameLabel;
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
      view.onRoll = (count, land) => sound.dice(count, land);
      if (config.knock) view.onKnock = (kind, strength) => config.knock!(sound, kind, strength);
      view.onSettled = present;
      view.onPick = pick;
      view.onMove = (move) => commit(move);
      const canvas = view.renderer.domElement;
      canvas.tabIndex = 0;
      canvas.setAttribute("aria-label", `${config.name} 판`);
      canvas.addEventListener("keydown", key);
      canvas.addEventListener("keyup", keyUp);
      view.sync(state, false);
      // Keys that are moves must work from the start, without a first click on the table.
      if (config.keyMove || config.live || config.pausable) canvas.focus({ preventScroll: true });
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요.</p></div>';
    }
    present();
  }
  /** A cheer held until the table rests (`cheerOnRest`). */
  let waitingCheer: string | null = null;
  /** A set's result held the same way. */
  let waitingSet: SetResult | null = null;
  const busy = () =>
    !!view?.animating ||
    state !== shown ||
    thinking ||
    performance.now() < lockedUntil ||
    !!document.querySelector("dialog[open]");
  function apply(next: S) {
    hinted = null;
    notice = "";
    warned = null;
    const shout = config.cheer?.(state, next, mode);
    if (shout && config.cheerOnRest && view) waitingCheer = shout;
    else if (shout) cheer(shout);
    const set = game.winner(next) === null ? config.setResult?.(state, next, mode) : null;
    if (set && config.cheerOnRest && view) waitingSet = set;
    else if (set) interlude(set.outcome, set.word, set.detail);
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
    hinted = null;
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
  /** Stops the table's clock, or lets it run again. */
  function togglePause() {
    if (!config.pausable || over()) return;
    paused = !paused;
    view?.setPaused?.(paused);
    update();
    // The keys go on being heard by the table.
    if (!paused) view?.renderer.domElement.focus({ preventScroll: true });
  }
  /** Plays a move of mine; false when it was refused (or could not be played now). `ahead` is a move kept in the queue whose turn has come. */
  function commit(move: Move, ahead = false): boolean {
    if (config.queueMoves && !paused && !over() && ((busy() && state !== shown) || (!ahead && config.queueMoves === "all" && queued.length))) {
      // Still moving: kept and played the moment the table rests (after those given before it, with "all").
      if (config.queueMoves === "all") {
        if (queued.length < QUEUE_LIMIT) queued.push(move);
      } else queued = [move];
      return true;
    }
    if (paused || (!config.live && busy()) || computerTurn() || over()) return false;
    const next = game.play(state, move, cryptoRandom);
    if (!next) {
      // A game that says why a move is refused has it said in the status line.
      const text = config.refusal?.(state, move);
      if (text) {
        warned = { state, text };
        hinted = null;
        update();
      }
      view?.refused?.(move);
      return false;
    }
    sound.unlock();
    if (config.live) {
      apply(next);
      return true;
    }
    // In a game without undo, a choice that is not yet a move (a bet being set, a ball put down by hand) is followed by no pause.
    // Where undo exists everything is kept for it, moves that leave the count alone included (ships being laid).
    if (!config.noUndo || game.ply(next) !== game.ply(state)) {
      past.push(state);
      if (!config.queueMoves) {
        lockedUntil = performance.now() + 200;
        later(update, 220);
      }
    }
    apply(next);
    return true;
  }
  /** Arrow keys walk the points of the board; Enter taps the one under the cursor. */
  function key(e: KeyboardEvent) {
    if (config.pausable && (e.key === "p" || e.key === "P" || e.key === "ㅔ")) {
      e.preventDefault();
      e.stopPropagation();
      togglePause();
      return;
    }
    const direct = config.keyMove?.(e.key, state, e.repeat, { shift: e.shiftKey, cursor });
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
  /** A key let go: a move only on a table that asks for it (an arrow held to steer). */
  function keyUp(e: KeyboardEvent) {
    const made = config.keyUp?.(e.key, state);
    if (!made) return;
    e.preventDefault();
    e.stopPropagation();
    commit(made);
  }
  function undo() {
    queued = [];
    if (busy() || !past.length) return;
    // Against the computer, go back to my own last turn.
    let back = past.pop()!;
    while (mode === "ai" && game.turn(back) !== 0 && past.length) back = past.pop()!;
    generation++;
    state = shown = back;
    chosen = {};
    hinted = null;
    notice = "";
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
  /** Back to the puzzle as it was laid (처음부터, or by itself after a failure where `restartOnFail` says so). */
  function restartPuzzle() {
    queued = [];
    generation++;
    state = shown = past[0];
    past = [];
    chosen = {};
    hinted = null;
    notice = "";
    announced = false;
    if (view) view.sync(state, false);
    else present();
  }
  /** Everything has come to rest: describe the current state. */
  function present() {
    if (disposed) return;
    shown = state;
    if (waitingCheer) {
      cheer(waitingCheer);
      waitingCheer = null;
    }
    if (waitingSet) {
      // Only while the set it tells of still stands (not taken back, the match not over or begun again).
      if (game.winner(state) === null && game.ply(state) > 0) interlude(waitingSet.outcome, waitingSet.word, waitingSet.detail);
      waitingSet = null;
    }
    update();
    if (queued.length) {
      // The next move given ahead; with "all", a refused one drops those after it, and none is played after the end.
      const move = queued.shift()!;
      if (over() || busy() || !commit(move, true)) queued = [];
    }
    if (config.puzzle && config.restartOnFail?.(state) && past.length) {
      const failed = state;
      setTimeout(() => {
        // Only if nothing has happened since (no undo, no new puzzle, no window over the table).
        if (disposed || state !== failed || busy() || document.querySelector("dialog[open]")) return;
        restartPuzzle();
        notice = "실패해서 처음부터 다시 시작했습니다.";
        update();
      }, RESTART_AFTER);
    }
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
    $("board").dataset.paused = String(paused && !done);
    if (config.pausable) {
      $("pg-pause").hidden = done;
      // Two bars while the game runs, an arrowhead while it stands still.
      $("pg-pause").setAttribute("aria-label", paused ? "계속하기" : "일시정지");
      $("pg-pause").classList.toggle("paused", paused);
      $("pg-pause").setAttribute("aria-pressed", String(paused));
    }
    $("turn").textContent = paused && !done
      ? "일시정지 — 오른쪽 위 ▶ 버튼을 누르면 이어집니다."
      : config.puzzle
      ? done
        ? game.winner(s) === 0
          ? `${game.reason(s)} '다음 스테이지'를 누르세요.`
          : `${game.reason(s)} 무르기나 처음부터를 눌러 다시 해 보세요.`
        : hinted
          ? typeof config.puzzle.hintText === "function"
            ? config.puzzle.hintText(s, hinted)
            : (config.puzzle.hintText ?? "힌트 — 금색 고리의 구슬을 화살표 쪽으로 치세요.")
          : warned && warned.state === s
            ? warned.text
            : game.hint(s)
      : solo
      ? done
        ? "게임이 끝났습니다."
        : game.hint(s)
      : done
      ? "대국이 끝났습니다."
      : state !== shown
        ? (config.movingText ?? "말이 움직이는 중…")
        : bot
          ? (config.thinkingText?.(s) ?? `${who(1)}가 생각하는 중…`)
          : next?.field === "extra"
            ? `${who(turn)} 차례 — ${config.extraHint ?? "떼어낼 상대 말을 고르세요."}`
            : next?.field === "to" && chosen.from !== undefined
              ? `${who(turn)} 차례 — 갈 곳을 고르세요.`
              : warned && warned.state === s
                ? `${who(turn)} 차례 — ${warned.text}`
                : `${who(turn)} 차례 — ${game.hint(s)}`;
    const tally = game.tally(s);
    for (const p of [0, 1]) {
      // A game may draw its tally (a fleet) instead of writing it.
      const drawn = config.tallyHtml?.(s, mode);
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
      const kept = !done && !legal && !!tool.keep?.(s);
      button.hidden = done || !(tool.show ? tool.show(s) : legal || kept);
      button.style.visibility = kept ? "hidden" : "";
      button.disabled = waiting || bot || !legal;
      if (tool.text) button.textContent = tool.text(s);
    });
    $("pg-note").textContent = notice;
    if (config.puzzle) {
      const stage = config.stages?.find((x) => x.value === variant);
      $("pz-stage").textContent = `${stage ? `${stage.name} · ` : ""}스테이지 ${stageNo}`;
      $("pz-next").hidden = game.winner(s) !== 0;
      $<HTMLButtonElement>("pz-hint").disabled = waiting || done;
      $<HTMLButtonElement>("pz-restart").disabled = waiting || !past.length;
    }
    // A hint shows the marble to shoot and the one to strike, until something else is chosen.
    const shown0 = hinted && chosen.from === undefined && !done ? hinted : null;
    const marks: Marks = {
      movable:
        next?.field === "from" && config.showMovable !== false
          ? next.points
          : chosen.from !== undefined && next
            ? [chosen.from]
            : [],
      selected: shown0 ? shown0.from : (chosen.from ?? null),
      targets: shown0 ? [] : next?.field === "to" ? next.points : [],
      removable: next?.field === "extra" ? next.points : [],
      cursor: view && document.activeElement === view.renderer.domElement ? cursor : null,
      pending: next?.field === "extra" ? (chosen.to ?? null) : null,
      hint: shown0 ? { from: shown0.from, to: shown0.to } : null,
    };
    view?.setMarks(capturing() ? { movable: [], selected: null, targets: [], removable: [], cursor: null } : marks);

    // Whether the person at the screen won, lost or drew: two at one screen always have a winner to cheer.
    $("pg-result").dataset.outcome = game.winner(s) === "draw" ? "draw" : mode === "ai" && game.winner(s) === 1 ? "lose" : "win";
    // A puzzle tells its end in the panel and the status line; no window comes up.
    $("pg-result").hidden = !done || !!config.puzzle;
    if (done) {
      const winner = game.winner(s);
      $("pg-final").textContent = lone()
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
    if ((config.keyMove || config.pausable) && (e.target === document.body || e.target === document.documentElement) && document.getElementById("pg-undo") && !document.querySelector("dialog[open]")) key(e);
  };
  document.addEventListener("keydown", pageKey);
  const pageKeyUp = (e: KeyboardEvent) => {
    if (config.keyUp && (e.target === document.body || e.target === document.documentElement) && document.getElementById("pg-undo")) keyUp(e);
  };
  document.addEventListener("keyup", pageKeyUp);
  document.addEventListener("close", dialogClosed, true);
  document.addEventListener("cancel", dialogClosed, true);
  document.addEventListener("click", dialogClosed, true);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  setup();
  return {
    /** The game's own 게임 방법, also offered by the window it is entered through. */
    rules: () => modal(config.rulesTitle, config.rules),
    dispose() {
      disposed = true;
      stop();
      sound.dispose();
      document.removeEventListener("keydown", pageKey);
      document.removeEventListener("keyup", pageKeyUp);
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
