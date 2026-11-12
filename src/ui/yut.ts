import { dress } from "./chrome";
import { part, steps, notes, table } from "./guide";
import { capturing, mirrorStatus } from "./banner";
import {
  FINISHED,
  PIECES,
  RESULT_NAMES,
  WAITING,
  createGame,
  move,
  moves,
  throwSticks,
  type Move,
  type State,
} from "../games/yut/rules";
import { choose } from "../games/yut/ai";
import { YutView, type YardModel } from "../games/yut/view";
import { cryptoRandom, type Random } from "../core/random";
import { Sound } from "../engine/sound";
import { modal, setupDialog } from "./dialog";
import type { Settings } from "../core/storage";

export type YutMode = "local" | "ai";
export interface YutOptions {
  mode: YutMode;
}
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: YutOptions;
  remember: (options: YutOptions) => void;
}
export interface YutController {
  dispose(): void;
  setSettings(settings: Settings): void;
}
const SIDES = ["청", "홍"];
/** A station in words, for the buttons and the status line. */
function place(station: number) {
  if (station === WAITING) return "대기";
  if (station === FINISHED) return "나기";
  if (station === 0) return "출발점";
  if (station === 22) return "중앙";
  if (station <= 19) return station % 5 === 0 ? `모서리 ${station / 5}` : `바깥 ${station}`;
  return station <= 24 ? `첫 지름길 ${station - (station > 22 ? 18 : 19)}` : `둘째 지름길 ${station - (station > 26 ? 22 : 24)}`;
}

/**
 * Mounts yut nori. `random` throws the sticks; the collection passes the
 * default, so the interface has no way to set a throw.
 */
export function mountYut(
  root: HTMLElement,
  nav: Navigation,
  random: Random = cryptoRandom,
): YutController {
  const sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    preferences = { ...nav.preferences },
    mode: YutMode = preferences.mode,
    state = createGame(),
    // What the panel describes: the last state whose pieces have come to rest.
    shown = state,
    view: YutView | null = null,
    disposed = false,
    generation = 0,
    lockedUntil = 0,
    announced = false,
    // Station whose pieces the person picked up on the board.
    selected: number | null = null,
    thinking = false;
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
  const computerTurn = (s: State = state) => mode === "ai" && s.turn === 1 && s.winner === null;
  const who = (player: number) =>
    mode === "local" ? `${SIDES[player]} (플레이어 ${player + 1})` : player === 0 ? "나 (청)" : "컴퓨터 (홍)";
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
    host.innerHTML = `<section class="featured"><div class="feature-copy"><div class="pill">지금 플레이 가능</div><span class="game-number">NO. 09 — FOUR STICKS</span><h2>윷놀이 <span>Yut Nori</span></h2><p>마당에 멍석을 깔고 윷가락 네 개를 던집니다.<br>말 네 개를 먼저 모두 내면 이깁니다.</p><ul class="rule-list"><li>도·개·걸·윷·모만큼 말을 옮깁니다</li><li>윷·모가 나오거나 상대 말을 잡으면 한 번 더</li><li>모서리와 중앙에서 멈추면 지름길로 갑니다</li></ul><div class="game-meta">2인 · 말 4개 · 윷가락 4개</div><div class="mode-select"><label><input type="radio" name="yut-mode" value="local"> 로컬 2인</label><label><input type="radio" name="yut-mode" value="ai"> 컴퓨터 대전</label></div><small id="yut-options" class="session-note" hidden>컴퓨터 대전에서는 내가 청으로 먼저 던집니다.</small><button id="yut-start" class="primary">마당에 앉기 <span>↗</span></button><small class="session-note">대국은 이 페이지를 여는 동안만 유지됩니다.</small></div><div class="feature-art yut-art" role="img" aria-label="윷놀이 마당 미리보기"><div class="yut-mini">${[0, 1, 2, 3].map((i) => `<i class="yut-mini-stick s${i}"></i>`).join("")}</div><span>FOUR STICKS, ONE YARD</span></div></section>`;
    const radios = document.querySelectorAll<HTMLInputElement>("input[name=yut-mode]");
    const remember = () => {
      preferences = { mode: [...radios].find((r) => r.checked)!.value as YutMode };
      $("yut-options").hidden = preferences.mode !== "ai";
      nav.remember({ ...preferences });
    };
    radios.forEach((r) => {
      r.checked = r.value === preferences.mode;
      r.onchange = remember;
    });
    $("yut-options").hidden = preferences.mode !== "ai";
    $("yut-start").onclick = start;
  }
  function start() {
    mode = preferences.mode;
    state = shown = createGame();
    announced = false;
    selected = null;
    lockedUntil = 0;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  const model = (s: State): YardModel => ({
    pieces: s.pieces,
    sticks: s.sticks,
    throwId: s.throwId,
    moveId: s.moveId,
    walk: s.last && { player: s.last.player, from: s.last.move.from, path: s.last.move.path },
  });
  function screen() {
    stop();
    const side = (p: number) =>
      `<li id="yut-side-${p}"><i class="yut-dot p${p}"></i><b>${who(p)}</b><span id="yut-count-${p}"></span></li>`;
    root.innerHTML =
      nav.header() +
      `<main class="game-layout yacht-game yut-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>윷놀이 <small>YUT NORI</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE YARD</span><span>말 4개 · 윷가락 4개</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar yd-sidebar yut-sidebar"><div id="turn" role="status" aria-live="polite"></div><ul class="yut-sides">${side(0)}${side(1)}</ul><div class="yd-controls"><button id="yut-throw" class="primary sr-only">윷 던지기</button><div id="yut-pending" class="yut-pending" aria-label="쓸 수 있는 윷패"></div><div id="yut-moves" class="yut-moves" role="group" aria-label="옮길 수 있는 말"></div><p id="yut-note" class="input-help"></p></div><div id="yut-result" class="yd-result" hidden><p id="yut-final"></p><button id="yut-again" class="primary">다시 플레이</button></div></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    dress(setup, ["#yut-moves"]);
    $("yut-throw").onclick = () => act((s) => throwSticks(s, random));
    $("yut-again").onclick = () => setupDialog(setup);
    $("yut-moves").onclick = (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>("button[data-piece]");
      if (button) play(Number(button.dataset.piece), Number(button.dataset.result));
    };
    try {
      view = new YutView($("board"), settings.quality);
      view.onContact = (stick) => {
        if (!stick) sound.tap();
      };
      view.onSettled = present;
      view.onPick = pick;
      view.onThrow = () => act((s) => throwSticks(s, random));
      view.sync(model(state), false);
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요. 오른쪽 버튼으로는 계속 플레이할 수 있습니다.</p></div>';
    }
    present();
  }
  const busy = () =>
    !!view?.animating ||
    state !== shown ||
    performance.now() < lockedUntil ||
    !!document.querySelector("dialog[open]");
  function apply(next: State) {
    if (next.throwId !== state.throwId) sound.dice(4);
    state = next;
    selected = null;
    if (view) view.sync(model(state));
    else present();
    update();
  }
  /**
   * A throw or a move. Input stays locked until the sticks and pieces have
   * come to rest, so a double click cannot throw or move twice.
   */
  function act(change: (s: State) => State | null) {
    if (busy() || computerTurn()) return;
    const next = change(state);
    if (!next) return;
    sound.unlock();
    lockedUntil = performance.now() + 220;
    later(update, 240);
    apply(next);
  }
  const play = (piece: number, result: number) => act((s) => move(s, piece, result as Move["result"]));
  /** The moves that begin at `station`; several results may finish, the smallest is offered. */
  function from(station: number) {
    const seen = new Map<number, Move>();
    for (const m of moves(state))
      if (m.from === station) {
        const known = seen.get(m.to);
        if (!known || Math.abs(m.result) < Math.abs(known.result)) seen.set(m.to, m);
      }
    return [...seen.values()];
  }
  /** A tap in the yard: pick up pieces first, then tap where they should go. */
  function pick(station: number) {
    if (busy() || computerTurn() || state.winner !== null) return;
    if (selected !== null) {
      const chosen = from(selected).find((m) => m.to === station);
      if (chosen) {
        play(chosen.piece, chosen.result);
        return;
      }
    }
    selected = from(station).length && station !== selected ? station : null;
    update();
  }
  /** The computer plays one visible step at a time. */
  function computer() {
    if (thinking || !computerTurn()) return;
    thinking = true;
    const current = generation;
    later(() => {
      thinking = false;
      if (current !== generation || !computerTurn()) return;
      if (busy()) {
        computer();
        return;
      }
      const chosen = state.throwsLeft > 0 ? null : (choose(state) ?? moves(state)[0]),
        next = chosen ? move(state, chosen.piece, chosen.result) : throwSticks(state, random);
      if (next) apply(next);
      computer();
    }, 620);
  }
  /** Everything has come to rest: describe the current state. */
  function present() {
    if (disposed) return;
    const focused = document.activeElement as HTMLElement | null,
      hadFocus = !!focused && !!focused.closest?.(".yut-sidebar");
    shown = state;
    update();
    if (state.winner !== null && !announced) {
      announced = true;
      if (mode === "ai" && state.winner === 1) sound.lose();
      else sound.win();
    }
    if (hadFocus && focused && (focused.offsetParent === null || (focused as HTMLButtonElement).disabled || !focused.isConnected))
      (state.winner !== null
        ? $("yut-again")
        : state.throwsLeft > 0
          ? $("yut-throw")
          : $("yut-moves").querySelector<HTMLElement>("button")
      )?.focus({ preventScroll: true });
    computer();
  }
  function update() {
    if (disposed || !document.getElementById("yut-throw")) return;
    mirrorStatus();
    const s = shown,
      waiting = busy(),
      bot = computerTurn(s),
      over = s.winner !== null,
      legal = over || bot ? [] : moves(s),
      name = who(s.turn);
    $("board").dataset.animating = String(!!view?.animating || state !== shown);
    $("board").dataset.turn = String(s.turn);
    $("move-count").textContent = `${s.moveId}수`;
    const turn = $("turn");
    turn.dataset.player = String(s.turn);
    const thrown = s.thrown ? `${RESULT_NAMES[s.thrown]}!` : "";
    turn.textContent = over
      ? "판이 끝났습니다."
      : state !== shown
        ? "윷과 말이 움직이는 중…"
        : s.forfeited.length
          ? `${s.forfeited.map((r) => RESULT_NAMES[r]).join("·")}는 쓸 말이 없어 넘어갑니다. ${name} 차례 — 윷가락을 눌러 던지세요.`
          : bot
            ? `${name}가 ${s.throwsLeft > 0 ? "윷을 던지는 중" : "말을 고르는 중"}…`
            : s.throwsLeft > 0
              ? `${name} 차례 — ${s.pending.length ? `${thrown} 윷가락을 눌러 한 번 더 던지세요.` : s.last?.captured && s.last.player === s.turn ? "말을 잡았습니다. 윷가락을 눌러 한 번 더 던지세요." : "윷가락을 눌러 던지세요."}`
              : `${name} 차례 — ${thrown} 옮길 말을 고르세요.`;
    s.pieces.forEach((stations, p) => {
      const count = (station: number) => stations.filter((x) => x === station).length;
      $(`yut-count-${p}`).textContent =
        `대기 ${count(WAITING)} · 말판 ${PIECES - count(WAITING) - count(FINISHED)} · 난 말 ${count(FINISHED)}`;
      $(`yut-side-${p}`).classList.toggle("active", !over && s.turn === p);
    });
    const throwButton = $<HTMLButtonElement>("yut-throw");
    throwButton.disabled = waiting || bot || over || s.throwsLeft === 0;
    throwButton.textContent = s.pending.length && s.throwsLeft > 0 ? "한 번 더 던지기" : "윷 던지기";
    $("yut-pending").innerHTML = s.pending.length
      ? s.pending.map((r) => `<span class="yut-chip">${RESULT_NAMES[r]}</span>`).join("")
      : "";
    const stack = (m: Move) =>
      m.from === WAITING ? "새 말" : `${place(m.from)}의 말${s.pieces[s.turn].filter((x) => x === m.from).length > 1 ? `(${s.pieces[s.turn].filter((x) => x === m.from).length}개)` : ""}`;
    const effect = (m: Move) =>
      m.to === FINISHED
        ? "나기"
        : s.pieces[1 - s.turn].includes(m.to)
          ? `${place(m.to)} · 잡기`
          : s.pieces[s.turn].includes(m.to)
            ? `${place(m.to)} · 업기`
            : place(m.to);
    const list = legal
      .map(
        (m) =>
          `<button data-piece="${m.piece}" data-result="${m.result}" data-from="${m.from}" data-to="${m.to}" class="${m.from === selected ? "chosen" : ""}" ${waiting ? "disabled" : ""}><b>${RESULT_NAMES[m.result]}</b> ${stack(m)} → ${effect(m)}</button>`,
      )
      .join("");
    // Rewritten only when it changes, so focus and a click in progress survive.
    if ($("yut-moves").dataset.key !== list) {
      $("yut-moves").dataset.key = list;
      $("yut-moves").innerHTML = list;
    }
    $("yut-note").textContent =
      over || bot || waiting || !legal.length
        ? ""
        : selected === null
          ? "마당에서 말을 누른 뒤 금색 고리를 누르거나, 위 버튼으로 옮기세요."
          : "금색 고리가 갈 수 있는 자리입니다.";
    view?.setMarks(
      capturing() ? { turn: s.turn, movable: [], selected: null, targets: [] } : {
      turn: s.turn,
      canThrow: !waiting && !bot && !over && s.throwsLeft > 0,
      movable: waiting ? [] : [...new Set(legal.map((m) => m.from))],
      selected: waiting ? null : selected,
      targets: waiting || selected === null ? [] : from(selected).map((m) => m.to),
    },
    );

    $("yut-result").hidden = !over;
    if (over)
      $("yut-final").textContent =
        mode === "ai" ? (s.winner === 0 ? "말 네 개를 모두 냈습니다. 이겼습니다!" : "컴퓨터가 먼저 말을 모두 냈습니다.") : `${who(s.winner!)} 승리!`;
  }
  function rules() {
    modal(
      "말 네 개를 먼저 내면 이깁니다",
      part("기본 규칙", steps("각자 말 네 개를 가집니다. 차례가 오면 윷가락 네 개를 던집니다.", "나온 패만큼 말 하나를 출발점에서 <b>반시계 방향</b>으로 옮깁니다.", "<b>윷</b>이나 <b>모</b>가 나오면 한 번 더 던집니다. 던지기를 모두 마친 뒤 나온 패를 원하는 순서로, 원하는 말에 나누어 씁니다.", "말 네 개를 먼저 모두 내면 이깁니다.")) +
        part("패", table(["도", "평평한 면 하나. 1칸"], ["개", "평평한 면 둘. 2칸"], ["걸", "평평한 면 셋. 3칸"], ["윷", "평평한 면 넷. 4칸, 한 번 더 던집니다."], ["모", "모두 엎어짐. 5칸, 한 번 더 던집니다."], ["빽도", "붉은 점이 있는 윷가락 하나만 평평한 면. 말판 위의 말 하나를 <b>한 칸 뒤로</b> 옮깁니다. 말판에 말이 없으면 쓰지 못하고 차례가 넘어갑니다."])) +
        part("말 움직이기", table(["지름길", "<b>모서리나 중앙에 멈춘 말</b>은 다음에 지름길로 갑니다. 지나가기만 하면 가던 길로 계속 갑니다."], ["업기", "내 말이 있는 자리에 가면 업어서 함께 움직입니다."], ["잡기", "상대 말이 있는 자리에 가면 그 말을 대기로 돌려보내고 <b>한 번 더</b> 던집니다."], ["나기", "한 바퀴를 돌아 출발점을 <b>지나가면</b> 말이 납니다. 출발점에 딱 멈춘 말은 다음 패로 납니다."])) +
        part("처음이라면", notes("업은 말은 빨리 가지만 잡히면 함께 돌아갑니다.", "상대 말 바로 앞(1–3칸)에 서면 잡히기 쉽습니다.", "모서리에 멈추면 지름길을 탈 수 있습니다.")) +
        part("조작", table(["던지기", "마당의 윷가락을 누르거나 <b>윷 던지기</b> 버튼을 누릅니다."], ["말 옮기기", "마당에서 말을 누르면 갈 수 있는 자리에 금색 고리가 뜹니다. 고리를 누르면 옮깁니다. 오른쪽 버튼으로도 똑같이 옮길 수 있습니다."], ["새 게임", "설정 창이 뜹니다. 로컬 2인과 컴퓨터 대전을 고릅니다."])) +
        part("그 밖에", notes("윷가락은 네 개 모두 반반의 확률로 뒤집힙니다.", "무르기와 저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
    );
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
  // from the state it holds, and the computer picks its turn back up.
  const show = (e: PageTransitionEvent) => {
    if (e.persisted && document.getElementById("yut-throw")) {
      lockedUntil = 0;
      if (view) view.sync(model(state), false);
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
