import { dress } from "./chrome";
import { notes, part, steps, table } from "./guide";
import { cheer, mirrorStatus } from "./banner";
import { modal, setupDialog } from "./dialog";
import { games } from "../core/catalog";
import { cryptoRandom, type Random } from "../core/random";
import { Sound } from "../engine/sound";
import type { Settings } from "../core/storage";
import { SIZES, type Size } from "../games/conquest/map";
import {
  CARD_NAMES,
  MODES,
  MUST_TRADE,
  ROUND_CHOICES,
  armiesOf,
  createGame,
  mustTrade,
  play,
  reachable,
  setValue,
  setsIn,
  targets,
  territoriesOf,
  type Action,
  type Card,
  type Mode,
  type State,
} from "../games/conquest/rules";
import { LEVELS, decide, type Level } from "../games/conquest/ai";
import { ConquestView, PLAYER_COLORS, type Selection } from "../games/conquest/view";

export interface ConquestOptions {
  /** People at the table (one to six, taking turns on this screen), computers after them, and the names given. */
  humans: number;
  opponents: number;
  names: string[];
  size: Size;
  mode: Mode;
  rounds: number;
  level: Level;
}
export const CONQUEST_DEFAULTS: ConquestOptions = { humans: 1, opponents: 2, names: [], size: "small", mode: "conquest", rounds: ROUND_CHOICES[1], level: "normal" };
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: ConquestOptions;
  remember: (options: ConquestOptions) => void;
}
export interface ConquestController {
  /** Shows the game's 게임 방법. */
  rules(): void;
  dispose(): void;
  setSettings(settings: Settings): void;
}
const SEATS = 6;
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
/** The pictures of the four kinds of card, drawn in code. */
const CARD_ART = [
  // 보병: a helmet over a shield.
  `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M20 6 31 10v9c0 8-5 13-11 15C14 32 9 27 9 19v-9z" fill="currentColor" opacity=".18" stroke="currentColor" stroke-width="2"/><path d="M12 19a8 8 0 0 1 16 0z" fill="currentColor"/><path d="M10 19h20" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>`,
  // 기병: a horseshoe.
  `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M11 32V18a9 9 0 0 1 18 0v14" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/><g fill="#fff"><circle cx="11" cy="22" r="1.4"/><circle cx="12.4" cy="15" r="1.4"/><circle cx="29" cy="22" r="1.4"/><circle cx="27.6" cy="15" r="1.4"/></g></svg>`,
  // 포병: a cannon on its wheel.
  `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M7 21 30 12l2.5 6L10 27z" fill="currentColor"/><circle cx="15" cy="28" r="6" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="15" cy="28" r="1.6" fill="currentColor"/><circle cx="34" cy="10" r="2.4" fill="currentColor"/></svg>`,
  // 와일드: a star.
  `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="m20 5 4.3 9.6 10.4 1-7.8 7 2.3 10.2L20 27.5l-9.2 5.3 2.3-10.2-7.8-7 10.4-1z" fill="currentColor"/></svg>`,
];
/** Mounts 대륙 쟁탈전. `random` draws the world, the dice and the cards. */
export function mountConquest(root: HTMLElement, nav: Navigation, random: Random = cryptoRandom): ConquestController {
  const sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    preferences: ConquestOptions = { ...CONQUEST_DEFAULTS, ...nav.preferences },
    humans = 1,
    level: Level = "normal",
    names: string[] = [],
    safe: string[] = [],
    state: State | null = null,
    shown: State | null = null,
    view: ConquestView | null = null,
    disposed = false,
    generation = 0,
    thinking = false,
    announced = false,
    lockedUntil = 0,
    // What I have picked out: a territory, and where it goes; how many the stepper says; the keyboard's place.
    selected = -1,
    target = -1,
    count = 1,
    cursor = -1,
    // Whether the keyboard has been used since the last tap: only then is its place shown.
    keyed = false,
    // The turn and phase the selection belongs to; a new one clears it.
    context = "",
    // The computer's step being shown before it is made.
    showing: Selection | null = null,
    handFor = "",
    told = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
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
  const human = (seat: number) => seat < humans;
  const people = () => Math.max(1, Math.min(SEATS, preferences.humans));
  const computersFor = (h: number, wanted: number) => Math.max(h === 1 ? 1 : 0, Math.min(SEATS - h, wanted));
  function setup(host = nav.setupHost) {
    if (host === nav.setupHost) stop();
    setupForm(host);
  }
  function setupForm(host: HTMLElement) {
    const h = people(),
      computers = computersFor(h, preferences.opponents),
      number = String(games.findIndex((g) => g.en === "CONTINENT CONQUEST") + 1).padStart(2, "0"),
      option = (value: string | number, label: string, chosen: boolean) => `<option value="${value}" ${chosen ? "selected" : ""}>${label}</option>`;
    host.innerHTML = `<section class="featured"><div class="feature-copy"><span class="game-number">NO. ${number} — WORLD CONQUEST</span><h2>대륙 쟁탈전 <span>Continent Conquest</span></h2><p>판마다 새로 그려지는 세계에서 병력을 늘리고 주사위로 싸워 대륙을 차지하세요.<br>보드게임 ‘리스크’와 같은 방식의 세계 정복 게임입니다.</p><div class="game-meta">2–6명 (사람 1–6명, 나머지는 컴퓨터) · 판마다 새 지도</div><div class="ai-options"><label>사람 수<select id="cq-humans">${[1, 2, 3, 4, 5, 6].map((n) => option(n, `${n}명`, n === h)).join("")}</select></label><label>컴퓨터 수<select id="cq-opponents">${Array.from({ length: SEATS - h - (h === 1 ? 1 : 0) + 1 }, (_, k) => k + (h === 1 ? 1 : 0)).map((n) => option(n, n ? `컴퓨터 ${n}명` : "없음", n === computers)).join("")}</select></label><label>지도 크기<select id="cq-size">${(Object.keys(SIZES) as Size[]).map((s) => option(s, `${SIZES[s].label} (영토 약 ${SIZES[s].territories})`, s === preferences.size)).join("")}</select></label><label>승리 조건<select id="cq-mode">${(Object.keys(MODES) as Mode[]).map((m) => option(m, MODES[m], m === preferences.mode)).join("")}</select></label>${preferences.mode === "turns" ? `<label>라운드 수<select id="cq-rounds">${ROUND_CHOICES.map((r) => option(r, `${r}라운드`, r === preferences.rounds)).join("")}</select></label>` : ""}${computers ? `<label>컴퓨터 난이도<select id="cq-difficulty">${(Object.keys(LEVELS) as Level[]).map((l) => option(l, LEVELS[l].label, l === preferences.level)).join("")}</select></label>` : ""}</div><div class="tour-names" role="group" aria-label="플레이어 이름">${Array.from({ length: h }, (_, i) => `<label>${h === 1 ? "내 이름" : `플레이어 ${i + 1} 이름`}<input class="cq-name" data-seat="${i}" maxlength="8" autocomplete="off" placeholder="${h === 1 ? "나" : `플레이어 ${i + 1}`}" value="${escape(preferences.names[i] ?? "")}"></label>`).join("")}</div><button id="cq-start" class="primary">작전 시작 <span>↗</span></button></div><div class="feature-art cq-art" role="img" aria-label="대륙 쟁탈전 지도 미리보기"><div class="cq-mini"><i></i><i></i><i></i><i></i></div><span>REINFORCE, ATTACK, MOVE</span></div></section>`;
    const field = <E extends HTMLElement>(id: string) => host.querySelector<E>(`#${id}`);
    const read = () => {
      const typed = [...host.querySelectorAll<HTMLInputElement>(".cq-name")].map((input) => input.value);
      preferences = {
        humans: Number(field<HTMLSelectElement>("cq-humans")?.value ?? preferences.humans),
        opponents: Number(field<HTMLSelectElement>("cq-opponents")?.value ?? preferences.opponents),
        names: [...typed, ...preferences.names.slice(typed.length)],
        size: (field<HTMLSelectElement>("cq-size")?.value ?? preferences.size) as Size,
        mode: (field<HTMLSelectElement>("cq-mode")?.value ?? preferences.mode) as Mode,
        rounds: Number(field<HTMLSelectElement>("cq-rounds")?.value ?? preferences.rounds),
        level: (field<HTMLSelectElement>("cq-difficulty")?.value ?? preferences.level) as Level,
      };
      nav.remember({ ...preferences, names: [...preferences.names] });
    };
    // A change that changes the form (people, computers, the kind of game) draws it again.
    const redraw = () => {
      read();
      const begin = field<HTMLButtonElement>("cq-start")?.textContent;
      setupForm(host);
      const button = field<HTMLButtonElement>("cq-start");
      if (button && begin) button.textContent = begin;
    };
    for (const id of ["cq-humans", "cq-opponents", "cq-mode"]) {
      const select = field<HTMLSelectElement>(id);
      if (select) select.onchange = redraw;
    }
    for (const id of ["cq-size", "cq-rounds", "cq-difficulty"]) {
      const select = field<HTMLSelectElement>(id);
      if (select) select.onchange = read;
    }
    host.querySelectorAll<HTMLInputElement>(".cq-name").forEach((input) => (input.oninput = read));
    field<HTMLButtonElement>("cq-start")!.onclick = () => {
      read();
      start();
    };
  }
  function start() {
    humans = people();
    const computers = computersFor(humans, preferences.opponents);
    level = computers ? preferences.level : "normal";
    names = [
      ...Array.from({ length: humans }, (_, i) => preferences.names[i]?.trim() || (humans === 1 ? "나" : `플레이어 ${i + 1}`)),
      ...Array.from({ length: computers }, (_, i) => `컴퓨터 ${i + 1}`),
    ];
    // A name is what its owner typed: written as text it goes in as it is, into markup only escaped.
    safe = names.map(escape);
    state = shown = createGame({ players: humans + computers, size: preferences.size, mode: preferences.mode, rounds: preferences.rounds, people: humans }, random);
    announced = false;
    lockedUntil = 0;
    selected = target = cursor = -1;
    context = handFor = "";
    showing = null;
    told = 0;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  function screen() {
    stop();
    const s = state!;
    root.innerHTML =
      nav.header() +
      `<main class="game-layout cq-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>대륙 쟁탈전 <small>CONTINENT CONQUEST</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="cq-fit">전체 보기</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE WAR ROOM</span><span>${SIZES[s.map.size].label} 지도 · 영토 ${s.map.territories.length} · ${MODES[s.mode]}${s.mode === "turns" ? ` ${s.rounds}라운드` : ""}</span></div><div id="board"></div><button id="cq-hand" class="cq-hand" aria-haspopup="dialog"><span class="cq-hand-art" aria-hidden="true"><i></i><i></i><i></i></span><span>카드</span><b id="cq-hand-count">0</b></button><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">1라운드</span></div></section><aside class="game-sidebar cq-sidebar"><div id="turn" role="status" aria-live="polite"></div><ul class="cq-players" id="cq-players">${s.seats.map((_, i) => `<li id="cq-player-${i}"><i class="cq-dot" style="background:${PLAYER_COLORS[i]}"></i><b>${safe[i]}</b><span id="cq-stat-${i}"></span></li>`).join("")}</ul><div class="cq-controls" id="cq-controls"><div class="cq-acts"><button id="cq-place" class="primary">배치</button><button id="cq-roll">한 번 굴리기</button><button id="cq-blitz" class="primary">끝까지 공격</button><button id="cq-move" class="primary">옮기기</button></div><div class="cq-stepper" id="cq-stepper"><span id="cq-step-label">병력</span><button id="cq-less" aria-label="하나 줄이기">−</button><output id="cq-count" aria-live="polite">1</output><button id="cq-more" aria-label="하나 늘리기">+</button></div><div class="cq-phases" id="cq-phases"><ol aria-label="단계">${(
        [
          ["reinforce", "증원"],
          ["attack", "공격"],
          ["fortify", "이동"],
        ] as const
      )
        .map(([phase, word]) => `<li data-phase="${phase}">${word}</li>`)
        .join("")}</ol><button id="cq-next">다음 단계</button></div></div><div id="cq-result" class="yd-result" hidden><p id="cq-final"></p><button id="cq-again" class="primary">새 게임</button></div></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    dress(setup, ["#cq-controls"]);
    $("cq-again").onclick = () => setupDialog(setup);
    $("cq-fit").onclick = () => view?.fit();
    $("cq-hand").onclick = () => hand(true);
    $("cq-place").onclick = () => {
      if (state?.phase === "reinforce" && selected >= 0) act({ type: "place", territory: selected, count });
    };
    $("cq-roll").onclick = () => attack(false);
    $("cq-blitz").onclick = () => attack(true);
    $("cq-move").onclick = move;
    $("cq-next").onclick = () => act({ type: "next" });
    $("cq-less").onclick = () => stepCount(-1);
    $("cq-more").onclick = () => stepCount(1);
    try {
      view = new ConquestView($("board"), settings.quality, s.map);
      view.onContact = () => sound.knock(4);
      view.onRoll = (n, land) => sound.dice(n, land);
      view.onSettled = present;
      view.onTap = (t) => {
        keyed = false;
        tap(t);
      };
      view.sync(s, false);
      const canvas = view.renderer.domElement;
      canvas.tabIndex = 0;
      canvas.setAttribute("aria-label", "세계 지도. 방향키로 영토를 고르고 Enter로 누릅니다. +와 −로 확대합니다.");
      canvas.dataset.neighbours = JSON.stringify(s.map.territories.map((t) => t.neighbours));
      canvas.addEventListener("keydown", keys);
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML = '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요.</p></div>';
    }
    present();
  }
  function keys(e: KeyboardEvent) {
    if (!view || !state) return;
    const arrows: Record<string, [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrows[e.key]) {
      e.preventDefault();
      keyed = true;
      cursor = view.toward(cursor, ...arrows[e.key]);
      update();
    } else if ((e.key === "Enter" || e.key === " ") && cursor >= 0 && keyed) {
      e.preventDefault();
      tap(cursor);
    } else if (e.key === "+" || e.key === "=") view.zoomBy(1.4);
    else if (e.key === "-" || e.key === "_") view.zoomBy(1 / 1.4);
    else if (e.key === "0") view.fit();
  }
  const busy = () => !!view?.animating || state !== shown || thinking || performance.now() < lockedUntil || !!document.querySelector("dialog[open]");
  const mine = () => !!state && state.phase !== "over" && human(state.turn);
  /** A change of mine, through the rules; input waits until the table has come to rest. */
  function act(action: Action) {
    if (!state || busy() || !mine()) return false;
    const next = play(state, action, random);
    if (!next) return false;
    sound.unlock();
    lockedUntil = performance.now() + 200;
    later(update, 220);
    apply(next);
    return true;
  }
  function apply(next: State) {
    if (next.last?.kind === "trade") sound.card();
    state = next;
    if (view) view.sync(next);
    else present();
    update();
  }
  function attack(blitz: boolean) {
    if (!state || state.phase !== "attack" || selected < 0 || target < 0) return;
    act({ type: "attack", from: selected, to: target, blitz });
  }
  function move() {
    if (!state) return;
    if (state.phase === "occupy") act({ type: "occupy", count });
    else if (state.phase === "fortify" && selected >= 0 && target >= 0) act({ type: "fortify", from: selected, to: target, count });
  }
  /** How many the stepper may say now, or null while it has nothing to count. */
  function bounds(): [number, number] | null {
    const s = state;
    if (!s || !mine()) return null;
    if (s.phase === "reinforce" && s.reserve > 0) return [1, s.reserve];
    if (s.phase === "occupy" && s.pending) return [0, s.pending.max];
    if (s.phase === "fortify" && selected >= 0 && target >= 0) return [1, s.armies[selected] - 1];
    return null;
  }
  function stepCount(by: number) {
    const range = bounds();
    if (!range) return;
    count = Math.max(range[0], Math.min(range[1], count + by));
    update();
  }
  /** A tap on the map (or Enter on the keyboard's territory). */
  function tap(t: number) {
    const s = state;
    if (!s || t < 0 || busy() || !mine()) return;
    cursor = t;
    told = s.ply;
    const own = s.owner[t] === s.turn;
    if (s.phase === "reinforce") {
      if (mustTrade(s)) return hand(true);
      if (!own) return;
      // A second tap on the territory picked places what the stepper says.
      if (t === selected) act({ type: "place", territory: t, count });
      else selected = t;
    } else if (s.phase === "attack") {
      if (own) {
        if (t === selected) selected = -1;
        else if (targets(s, t).length) selected = t;
        target = -1;
      } else if (selected >= 0 && targets(s, selected).includes(t)) {
        // A tap on a neighbour attacks it: one roll.
        target = t;
        act({ type: "attack", from: selected, to: t });
      }
    } else if (s.phase === "occupy" && s.pending) {
      if (t === s.pending.to || t === s.pending.from) act({ type: "occupy", count });
    } else if (s.phase === "fortify") {
      if (!own) return;
      if (selected >= 0 && t === target) act({ type: "fortify", from: selected, to: target, count });
      else if (selected >= 0 && t !== selected && reachable(s, selected).includes(t)) {
        target = t;
        count = s.armies[selected] - 1;
      } else if (t === selected) selected = target = -1;
      else if (s.armies[t] > 1 && reachable(s, t).length) {
        selected = t;
        target = -1;
      }
    }
    update();
  }
  /** Keeps what I picked out in step with the game: a new turn or phase begins afresh. */
  function settle() {
    const s = state!,
      key = `${s.turn}:${s.phase}:${s.round}`;
    if (key !== context) {
      const was = context;
      context = key;
      target = -1;
      if (s.phase === "reinforce") count = s.reserve;
      if (s.phase === "occupy" && s.pending) {
        count = s.pending.max;
        selected = s.pending.from;
      } else if (s.phase === "attack" && was.endsWith(":occupy:" + s.round) && s.last?.kind === "occupy") {
        // After a conquest the front moves on: the territory just taken if it can press on, else the one it came from.
        const { from, to } = s.last;
        selected = targets(s, to).length ? to : targets(s, from).length ? from : -1;
      } else if (!(s.phase === "attack" && was.startsWith(`${s.turn}:reinforce`) && selected >= 0 && targets(s, selected).length)) selected = -1;
    }
    if (s.phase === "reinforce") count = Math.max(1, Math.min(count, s.reserve));
    if (selected >= 0 && s.owner[selected] !== s.turn) selected = -1;
    if (s.phase === "attack") {
      // A conquest that left nothing to follow in: the territory taken carries the attack on, if it can.
      const last = s.last;
      if (selected >= 0 && !targets(s, selected).length && last?.kind === "battle" && last.conquered && last.from === selected && targets(s, last.to).length) selected = last.to;
      if (selected >= 0 && !targets(s, selected).length) selected = -1;
      if (selected < 0 || (target >= 0 && !targets(s, selected).includes(target))) target = -1;
    }
    if (s.phase === "fortify" && selected >= 0 && target >= 0) count = Math.max(1, Math.min(count, s.armies[selected] - 1));
  }
  /** The computer plays one visible step at a time; an attack is shown by its arrow first. */
  function computer() {
    const s = state;
    if (!s || thinking || human(s.turn) || s.phase === "over" || s !== shown) return;
    thinking = true;
    const current = generation;
    update();
    later(() => {
      if (current !== generation || !state || state !== s) return (thinking = false), undefined;
      const action = decide(s, level, random);
      const make = () => {
        thinking = false;
        showing = null;
        if (current !== generation || state !== s) return;
        const next = play(s, action, random);
        if (next) apply(next);
      };
      if (action.type === "attack" || action.type === "fortify") {
        showing = { selected: action.from, targets: [action.to], kind: action.type === "attack" ? "attack" : "move", open: [], cursor: -1, arrow: [action.from, action.to] };
        update();
        later(make, 520);
      } else make();
    }, s.phase === "reinforce" ? 420 : 300);
  }
  /** What the step just shown sounded like and called out. */
  function effects(before: State, now: State) {
    const last = now.last;
    if (last?.kind === "battle" && last.conquered) {
      if (human(last.player) && humans === 1) cheer("점령!");
      if (last.eliminated) later(() => cheer(`${names[last.defender]} 탈락!`), 700);
    }
    if (last?.kind === "turn" && last.drew && human(last.previous)) sound.card();
    if (now.phase === "over" && before.phase !== "over") sound[humans === 1 && !now.winners.includes(0) ? "lose" : "win"]();
  }
  function present() {
    if (disposed || !state) return;
    if (shown && shown !== state) effects(shown, state);
    shown = state;
    update();
    if (state.phase === "over" && !announced) announced = true;
    computer();
    // A hand of five or more at the start of my reinforcing is opened for me.
    const s = state;
    const key = `${s.ply}`;
    if (mine() && mustTrade(s) && handFor !== key && !busy()) {
      handFor = key;
      later(() => hand(false), 250);
    }
  }
  /** The cards of the player to move (a person's), with the sets they make, to be traded while reinforcing. */
  function hand(asked: boolean) {
    const s = state;
    if (!s || document.querySelector("dialog[open]")) return;
    const seat = mine() ? s.turn : humans === 1 ? 0 : -1;
    if (seat < 0) return;
    const cards = s.seats[seat].cards,
      sets = s.turn === seat && s.phase === "reinforce" && mine() ? setsIn(cards) : [],
      forced = s.turn === seat && mustTrade(s),
      value = setValue(s.trades),
      face = (card: Card) => `<li class="cq-card kind-${card.kind}"><span class="cq-card-art">${CARD_ART[card.kind]}</span><b>${CARD_NAMES[card.kind]}</b></li>`,
      seen = new Set<string>(),
      // Sets that differ only in which card of a kind they take are offered once.
      offers = sets.filter((ids) => {
        const kinds = ids.map((id) => cards.find((c) => c.id === id)!.kind).sort().join("");
        if (seen.has(kinds)) return false;
        seen.add(kinds);
        return true;
      });
    if (!asked && !forced) return;
    modal(
      `${humans > 1 ? `${safe[seat]}의 ` : "내 "}카드`,
      `${cards.length ? `<ul class="cq-cards">${cards.map(face).join("")}</ul>` : "<p>카드가 없습니다. 영토를 하나라도 차지한 차례가 끝나면 한 장을 받습니다.</p>"}<p class="cq-hand-note">${forced ? `<b>카드가 ${MUST_TRADE}장 이상입니다. 병력을 놓기 전에 세트를 바꿔야 합니다.</b> ` : ""}다음 세트는 병력 <b>+${value}</b>입니다.${s.phase === "reinforce" && mine() ? "" : " 세트는 증원 단계에 바꿀 수 있습니다."}</p>${offers.length ? `<div class="cq-trades">${offers.map((ids) => `<button class="primary" data-trade="${ids.join(",")}">${ids.map((id) => CARD_NAMES[cards.find((c) => c.id === id)!.kind]).join(" · ")} 바꾸기 (+${value})</button>`).join("")}</div>` : ""}`,
      [{ text: "닫기", action: () => later(update, 0) }],
    );
    document.querySelectorAll<HTMLButtonElement>("dialog [data-trade]").forEach((button) => {
      button.onclick = () => {
        const dialog = button.closest("dialog")!;
        dialog.close();
        dialog.remove();
        const traded = act({ type: "trade", cards: button.dataset.trade!.split(",").map(Number) });
        // Still five or more: the hand comes back.
        if (traded && state && mustTrade(state)) later(() => hand(false), 300);
      };
    });
  }
  /** The line that tells what happened in the last step, if it is worth telling. */
  function news(s: State) {
    const last = s.last,
      map = s.map;
    if (!last) return "";
    const who = names[last.player];
    if (last.kind === "battle") {
      const roll = last.rolls[last.rolls.length - 1],
        lostA = last.rolls.reduce((n, r) => n + r.lostA, 0),
        lostD = last.rolls.reduce((n, r) => n + r.lostD, 0),
        dice = `${roll.attack.join("·")} 대 ${roll.defend.join("·")}`;
      return `${who} ${map.territories[last.from].name} → ${map.territories[last.to].name}: ${dice}, 공격 −${lostA} · 방어 −${lostD}.${last.conquered ? " 점령!" : ""}${last.eliminated ? ` ${names[last.defender]} 탈락${last.taken ? `, 카드 ${last.taken}장을 가져옵니다` : ""}.` : ""}`;
    }
    if (last.kind === "place") return human(last.player) ? "" : `${who} ${map.territories[last.territory].name} +${last.count}.`;
    if (last.kind === "trade") return `${who} 카드 세트 교환: 병력 +${last.value}.`;
    if (last.kind === "fortify") return `${who} ${map.territories[last.from].name} → ${map.territories[last.to].name}: ${last.count} 이동.`;
    if (last.kind === "occupy") return last.count && !human(last.player) ? `${who} ${map.territories[last.to].name}(으)로 ${last.count} 더.` : "";
    return "";
  }
  function update() {
    if (disposed || !state || !document.getElementById("cq-controls")) return;
    const cursorAt = cursor;
    settle();
    mirrorStatus();
    const s = state,
      over = s.phase === "over",
      me = mine(),
      waiting = busy(),
      whose = humans > 1 ? `${names[s.turn]} 차례 — ` : "",
      t = (id: number) => s.map.territories[id].name;
    $("board").dataset.animating = String(!!view?.animating || state !== shown || thinking || performance.now() < lockedUntil);
    $("board").dataset.phase = s.phase;
    $("board").dataset.turn = String(s.turn);
    $("board").dataset.human = String(me);
    $("board").dataset.selected = String(selected);
    $("board").dataset.target = String(target);
    $("move-count").textContent = `${s.round}${s.mode === "turns" ? ` / ${s.rounds}` : ""}라운드`;
    let line: string;
    if (over) line = "";
    else if (!me) line = `${names[s.turn]} 차례 — ${s.phase === "reinforce" ? "증원" : s.phase === "attack" || s.phase === "occupy" ? "공격" : "이동"} 중…`;
    else if (s.phase === "reinforce")
      line = mustTrade(s)
        ? `${whose}카드가 ${MUST_TRADE}장 이상입니다. 카드를 열어 세트를 바꾸세요.`
        : selected >= 0
          ? `${whose}증원 — ${t(selected)}: 수를 고르고 배치 (남은 병력 ${s.reserve}).`
          : `${whose}증원 — 병력 ${s.reserve}을 놓을 내 영토를 누르세요.`;
    else if (s.phase === "attack")
      line =
        selected < 0
          ? `${whose}공격 — 병력이 2 이상인 내 영토를 누르세요. 끝내려면 다음 단계.`
          : target < 0
            ? `${whose}공격 — 빨간 이웃을 누르면 주사위를 굴립니다.`
            : `${whose}${t(target)}을(를) 다시 누르면 또 굴립니다.`;
    else if (s.phase === "occupy") line = `${whose}${t(s.pending!.to)}(으)로 더 옮길 병력을 고르세요.`;
    else
      line =
        selected < 0
          ? `${whose}이동 — 병력을 옮길 내 영토를 누르세요. 안 옮기면 턴 종료.`
          : target < 0
            ? `${whose}이동 — 파란 영토를 눌러 옮길 곳을 고르세요.`
            : `${whose}${t(selected)} → ${t(target)}: 수를 고르고 옮기기.`;
    // What has just happened is told first, while it is fresh.
    const said = news(s);
    // What has just happened is told until I next touch the map.
    if (said && s.ply !== told && !over) line = `${said} ${me ? line : ""}`.trim();
    $("turn").textContent = line;
    // The players: territories, armies and cards, short.
    s.seats.forEach((seat, i) => {
      $(`cq-stat-${i}`).textContent = seat.alive ? `영토 ${territoriesOf(s, i)} · 병력 ${armiesOf(s, i)} · 카드 ${seat.cards.length}${s.mode === "capitals" && seat.capital >= 0 && s.owner[seat.capital] !== i ? " · 수도 잃음" : ""}` : "탈락";
      $(`cq-player-${i}`).classList.toggle("active", !over && s.turn === i);
      $(`cq-player-${i}`).classList.toggle("out", !seat.alive);
    });
    // The phase bar and its buttons.
    const phase = s.phase === "occupy" ? "attack" : s.phase;
    document.querySelectorAll<HTMLElement>("#cq-phases li").forEach((li) => li.classList.toggle("now", !over && li.dataset.phase === phase));
    const next = $<HTMLButtonElement>("cq-next");
    next.textContent = s.phase === "fortify" ? "턴 종료" : "다음 단계";
    next.disabled = waiting || !me || s.phase === "occupy" || (s.phase === "reinforce" && s.reserve > 0);
    $("cq-phases").hidden = over;
    const range = bounds();
    if (range) count = Math.max(range[0], Math.min(range[1], count));
    $("cq-stepper").hidden = !range || (s.phase === "reinforce" && selected < 0);
    $("cq-step-label").textContent = s.phase === "occupy" ? "더 옮길 병력" : s.phase === "fortify" ? "옮길 병력" : "놓을 병력";
    $("cq-count").textContent = String(count);
    $<HTMLButtonElement>("cq-less").disabled = !range || count <= range[0];
    $<HTMLButtonElement>("cq-more").disabled = !range || count >= range[1];
    const place = $<HTMLButtonElement>("cq-place");
    place.hidden = !(me && s.phase === "reinforce" && selected >= 0);
    place.disabled = waiting || selected < 0 || mustTrade(s);
    place.textContent = `배치 ${count}`;
    for (const id of ["cq-roll", "cq-blitz"]) {
      const button = $<HTMLButtonElement>(id);
      button.hidden = !(me && s.phase === "attack");
      button.disabled = waiting || selected < 0 || target < 0;
    }
    const go = $<HTMLButtonElement>("cq-move");
    go.hidden = !(me && (s.phase === "occupy" || (s.phase === "fortify" && target >= 0)));
    go.disabled = waiting;
    go.textContent = s.phase === "occupy" ? `옮기기 (+${count})` : `옮기기 ${count}`;
    // The cards in hand, in the corner: the player to move's, or mine while a computer plays.
    const seat = me ? s.turn : humans === 1 ? 0 : -1,
      handButton = $<HTMLButtonElement>("cq-hand");
    handButton.hidden = seat < 0 || over;
    if (seat >= 0) {
      const n = s.seats[seat].cards.length;
      $("cq-hand-count").textContent = String(n);
      handButton.setAttribute("aria-label", `${humans > 1 ? `${names[seat]}의 ` : "내 "}카드 ${n}장 보기`);
      handButton.classList.toggle("ready", me && s.phase === "reinforce" && setsIn(s.seats[seat].cards).length > 0);
    }
    // What is picked out on the map.
    if (view) {
      const cursor = keyed ? cursorAt : -1;
      let selection: Selection;
      if (showing) selection = showing;
      else if (!me || over) selection = { selected: -1, targets: [], kind: "attack", open: [], cursor: -1, arrow: null };
      else if (s.phase === "reinforce") selection = { selected, targets: [], kind: "move", open: s.owner.flatMap((o, i) => (o === s.turn ? [i] : [])), cursor, arrow: null };
      else if (s.phase === "attack")
        selection = { selected, targets: selected >= 0 ? targets(s, selected) : [], kind: "attack", open: s.owner.flatMap((o, i) => (o === s.turn && targets(s, i).length ? [i] : [])), cursor, arrow: selected >= 0 && target >= 0 ? [selected, target] : null };
      else if (s.phase === "occupy") selection = { selected: s.pending!.from, targets: [s.pending!.to], kind: "move", open: [s.pending!.to], cursor, arrow: [s.pending!.from, s.pending!.to] };
      else
        selection = {
          selected,
          targets: selected >= 0 ? reachable(s, selected) : [],
          kind: "move",
          open: s.owner.flatMap((o, i) => (o === s.turn && s.armies[i] > 1 && reachable(s, i).length ? [i] : [])),
          cursor,
          arrow: selected >= 0 && target >= 0 ? [selected, target] : null,
        };
      view.select(selection);
    }
    // The end.
    const result = $("cq-result");
    result.dataset.outcome = humans === 1 && !s.winners.includes(0) ? "lose" : "win";
    if (over) $("cq-final").textContent = verdict(s);
    result.hidden = !over;
  }
  /** The result, its first sentence the outcome. */
  function verdict(s: State) {
    const winners = s.winners.map((p) => names[p]).join(", "),
      won = humans === 1 ? (s.winners.includes(0) ? "승리!" : "패배.") : `${winners} 승리!`,
      by = humans === 1 && !s.winners.includes(0) ? `${winners}이(가) ` : "";
    switch (s.end) {
      case "conquest":
        return `${won} ${by}온 세계를 차지했습니다.`;
      case "capitals":
        return `${won} ${by}모든 수도를 차지했습니다.`;
      case "turns":
        return `${won} ${s.rounds}라운드가 끝났습니다. ${s.winners.map((p) => `${names[p]} 영토 ${territoriesOf(s, p)}`).join(", ")}.`;
      case "people":
        return `패배. ${humans === 1 ? "내 영토를 모두 잃었습니다" : "사람이 모두 탈락했습니다"}. 가장 강한 쪽은 ${winners}입니다.`;
      default:
        return `${won} ${by}마지막까지 남았습니다.`;
    }
  }
  function rules() {
    modal(
      "병력을 늘리고, 싸우고, 대륙을 차지하세요",
      part(
        "기본 규칙",
        steps(
          "판마다 새 세계가 그려집니다. 영토는 무작위로 나뉘고, 처음 병력도 저절로 놓입니다.",
          "<b>증원</b>: 받은 병력을 내 영토에 모두 놓습니다. 영토를 누르고 배치를 누르거나, 고른 영토를 한 번 더 누릅니다.",
          "<b>공격</b>: 병력이 2 이상인 내 영토를 누르고, 빨갛게 빛나는 이웃을 누르면 주사위를 굴립니다. 원하는 만큼 공격합니다.",
          "<b>이동</b>: 한 번, 이어진 내 영토를 따라 병력을 옮기면 차례가 끝납니다. 옮기지 않으려면 턴 종료.",
          "영토를 하나라도 차지한 차례가 끝나면 카드 한 장을 받습니다.",
          "승리 조건(정복·수도 점령·턴 제한)을 먼저 채우면 이깁니다.",
        ),
      ) +
        part(
          "증원",
          table(
            ["영토", "가진 영토 수를 3으로 나눈 만큼(버림), 적어도 3."],
            ["대륙 보너스", "대륙 하나를 모두 가지면 바다에 적힌 +만큼 더 받습니다. 영토가 많은 대륙일수록, 다른 대륙과 닿는 영토가 많을수록 큽니다."],
            ["카드 세트", `바꿀 때마다 4, 6, 8, 10, 12, 15, 그 뒤로 5씩 늘어납니다. 누가 바꾸든 다음 세트는 더 큽니다.`],
          ),
        ) +
        part(
          "전투",
          table(
            ["주사위", "공격은 빨간 주사위 3개까지(병력보다 하나 적게), 방어는 흰 주사위 2개까지(병력만큼)."],
            ["비교", "큰 눈끼리 짝지어 비교하고, 진 쪽이 병력을 하나씩 잃습니다. 같은 눈이면 방어가 이깁니다."],
            ["한 번 굴리기", "한 번만 굴립니다. 빨간 이웃을 다시 눌러도 됩니다."],
            ["끝까지 공격", "그 영토를 차지하거나 내 병력이 1만 남을 때까지 이어서 굴립니다."],
            ["점령", "마지막에 굴린 주사위 수만큼 병력이 들어가고, 원하면 더 옮깁니다."],
          ),
        ) +
        part(
          "카드",
          table(
            ["종류", "보병, 기병, 포병, 그리고 무엇이든 되는 와일드 2장."],
            ["세트", "같은 종류 3장, 서로 다른 3장, 또는 와일드가 낀 3장."],
            [`${MUST_TRADE}장 이상`, "병력을 놓기 전에 반드시 세트를 바꿉니다. 오른쪽 위의 카드를 누르면 손패가 열립니다."],
            ["탈락시키면", `그 플레이어의 카드를 모두 가져옵니다. ${MUST_TRADE}장이 넘으면 바로 바꿔 놓고 공격을 잇습니다.`],
          ),
        ) +
        part(
          "승리 조건",
          table(
            ["정복", "모든 영토를 차지하면 이깁니다."],
            ["수도 점령", "각자 수도가 하나씩 있고 탑이 서 있습니다. 모든 수도를 차지하면 이깁니다. 수도를 잃어도 탈락하지 않습니다."],
            ["턴 제한", "정한 라운드가 끝나면 영토가 가장 많은 사람이 이깁니다. 같으면 병력이 많은 쪽입니다."],
          ),
        ) +
        part(
          "지도",
          table(
            ["바닷길", "흰 점선은 바다 건너 이웃한 두 영토를 잇습니다."],
            ["색 테두리", "영토 가장자리의 색이 그 영토를 가진 사람입니다. 블록 위의 숫자는 병력입니다."],
            ["확대", "두 손가락으로 벌리거나 휠을 돌려 확대하고, 끌어서 옮깁니다. 전체 보기로 돌아옵니다."],
          ),
        ) +
        part("처음이라면", notes("작은 대륙부터 모두 차지해 보너스를 받으세요.", "상대보다 병력이 넉넉할 때 공격하세요. 3개 대 2개로 굴릴 때 가장 유리합니다.", "차례마다 영토를 하나는 차지해 카드를 모으세요.", "남의 대륙은 영토 하나만 빼앗아도 보너스가 끊깁니다.")),
    );
  }
  const dialogClosed = () => later(update, 0);
  document.addEventListener("close", dialogClosed, true);
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
  const showAgain = (e: PageTransitionEvent) => {
    if (e.persisted && document.getElementById("cq-controls") && state) {
      lockedUntil = 0;
      view?.sync(state, false);
      present();
    }
  };
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", showAgain);
  setup();
  return {
    rules,
    dispose() {
      disposed = true;
      stop();
      sound.dispose();
      document.removeEventListener("close", dialogClosed, true);
      window.removeEventListener("pagehide", hide);
      window.removeEventListener("pageshow", showAgain);
    },
    setSettings(next) {
      settings = next;
      sound.enabled = next.sound;
      view?.setQuality(next.quality);
    },
  };
}
