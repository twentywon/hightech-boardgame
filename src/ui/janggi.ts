import { mirrorStatus, shout } from "./banner";
import { dress } from "./chrome";
import { part, steps, notes, table } from "./guide";
import {
  FORMATIONS,
  NAMES,
  at,
  canPass,
  createGame,
  describe,
  inCheck,
  kindOf,
  legalMoves,
  other,
  play,
  points,
  sideOf,
  undo,
  xOf,
  yOf,
  type Formation,
  type Move,
  type Side,
  type State,
} from "../games/janggi/rules";
import { profiles } from "../games/janggi/ai";
import { JanggiAIClient } from "../games/janggi/client";
import { JanggiView } from "../games/janggi/view";
import { TURN_DELAY_MS } from "../engine/camera";
import { difficulties, type ColorChoice, type Difficulty } from "../core/ai";
import { Sound } from "../engine/sound";
import { modal, setupDialog } from "./dialog";
import type { Mode, Settings } from "../core/storage";

export interface JanggiOptions {
  mode: Mode;
  difficulty: Difficulty;
  /** "black" is Cho (moves first), "white" is Han. */
  color: ColorChoice;
  /** My formation against the computer; Cho's (player 1) in a local game. */
  formation: Formation;
  /** Han's (player 2) formation in a local game. */
  rivalFormation: Formation;
}
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: JanggiOptions;
  remember: (options: JanggiOptions) => void;
}
export interface JanggiController {
  dispose(): void;
  setSettings(settings: Settings): void;
}
const SIDE: Record<Side, string> = { cho: "초", han: "한" };
const FORMATION_NAME: Record<Formation, string> = {
  NENE: "마상마상",
  ENEN: "상마상마",
  NEEN: "마상상마",
  ENNE: "상마마상",
};

export function mountJanggi(root: HTMLElement, nav: Navigation): JanggiController {
  const ai = new JanggiAIClient(),
    // Hints use their own Worker so they never cancel the opponent's search.
    hintAI = new JanggiAIClient(),
    sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    preferences = { ...nav.preferences },
    state = createGame(),
    mode: Mode = "local",
    difficulty: Difficulty = "normal",
    human: Side = "cho",
    facing: Side = "cho",
    top = false,
    view: JanggiView | null = null,
    selected: number | null = null,
    target: number | null = null,
    cursor: number | null = null,
    disposed = false,
    generation = 0,
    aiError = "",
    computing = false,
    hinting = false,
    announced = false;
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
  const aiTurn = () => mode === "ai" && state.turn !== human && !state.outcome;
  const who = (side: Side) =>
    mode === "local"
      ? `플레이어 ${side === "cho" ? 1 : 2}`
      : side === human
        ? "나"
        : `컴퓨터 · ${profiles[difficulty].label}`;
  function pause() {
    generation++;
    ai.cancel();
    hintAI.cancel();
    hinting = computing = false;
    timers.forEach(clearTimeout);
    timers.clear();
  }
  function stop() {
    pause();
    view?.dispose();
    view = null;
    selected = target = cursor = null;
    aiError = "";
  }
  function setup(host = nav.setupHost) {
    if (host === nav.setupHost) stop();
    const option = (value: string, label: string, current: string) =>
      `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
    host.innerHTML = `<section class="featured"><div class="feature-copy"><h2>장기 <span>Janggi</span></h2><p>초와 한, 아홉 줄 열 칸의 전장.<br>궁을 지키고 상대의 궁을 외통으로 몰아넣으세요.</p><div class="game-meta">2인 · 9×10 · 기물 32개</div><div class="mode-select"><label><input type="radio" name="jg-mode" value="local"> 로컬 2인</label><label><input type="radio" name="jg-mode" value="ai"> 컴퓨터 대전</label></div><div class="ai-options"><label><span id="jg-formation-label">상차림</span><select id="jg-formation" aria-labelledby="jg-formation-label">${FORMATIONS.map((f) => option(f, FORMATION_NAME[f], preferences.formation)).join("")}</select></label><label id="jg-rival">한(2P) 상차림<select id="jg-formation-2">${FORMATIONS.map((f) => option(f, FORMATION_NAME[f], preferences.rivalFormation)).join("")}</select></label><label id="jg-level">AI 난이도<select id="jg-difficulty">${difficulties.map((d) => option(d, profiles[d].label, preferences.difficulty)).join("")}</select></label><label id="jg-side">내 진영<select id="jg-color">${option("black", "초 (선공)", preferences.color)}${option("white", "한 (후공)", preferences.color)}${option("random", "무작위", preferences.color)}</select></label><small>상차림은 궁 양옆의 마와 상 순서이며 각자 자기 쪽에서 본 왼쪽부터입니다. 선택한 설정은 새 대국부터 적용됩니다.</small></div><button id="jg-start" class="primary">테이블에 앉기 <span>↗</span></button></div><div class="feature-art janggi-art" role="img" aria-label="장기판 미리보기"><div class="jg-mini">${["車", "馬", "象", "士", "", "士", "象", "馬", "車"].map((g) => `<i>${g ? `<b class="han">${g}</b>` : ""}</i>`).join("")}${Array.from({ length: 9 }, (_, i) => `<i>${i === 4 ? '<b class="han big">漢</b>' : ""}</i>`).join("")}${Array.from({ length: 9 }, (_, i) => `<i>${i === 4 ? '<b class="cho big">楚</b>' : ""}</i>`).join("")}${["車", "象", "馬", "士", "", "士", "象", "馬", "車"].map((g) => `<i>${g ? `<b class="cho">${g}</b>` : ""}</i>`).join("")}</div><span>CHO AND HAN, ACROSS THE BOARD</span></div></section>`;
    const radios = document.querySelectorAll<HTMLInputElement>("input[name=jg-mode]");
    const remember = () => {
      preferences = {
        mode: [...radios].find((r) => r.checked)!.value as Mode,
        difficulty: $<HTMLSelectElement>("jg-difficulty").value as Difficulty,
        color: $<HTMLSelectElement>("jg-color").value as ColorChoice,
        formation: $<HTMLSelectElement>("jg-formation").value as Formation,
        rivalFormation: $<HTMLSelectElement>("jg-formation-2").value as Formation,
      };
      arrange();
      nav.remember({ ...preferences });
    };
    // Two local players each pick a formation; against the computer only mine is asked.
    const arrange = () => {
      const local = preferences.mode !== "ai";
      $("jg-level").hidden = $("jg-side").hidden = local;
      $("jg-rival").hidden = !local;
      $("jg-formation-label").textContent = local ? "초(1P) 상차림" : "내 상차림";
    };
    radios.forEach((r) => {
      r.checked = r.value === preferences.mode;
      r.onchange = remember;
    });
    arrange();
    for (const id of ["jg-difficulty", "jg-color", "jg-formation", "jg-formation-2"])
      $(id).onchange = remember;
    $("jg-start").onclick = start;
  }
  function start() {
    stop();
    mode = preferences.mode;
    difficulty = preferences.difficulty;
    human =
      preferences.color === "white"
        ? "han"
        : preferences.color === "random" && Math.random() < 0.5
          ? "han"
          : "cho";
    facing = mode === "ai" ? human : "cho";
    top = false;
    // Two local players each chose a formation; the computer picks its own.
    const rival =
      mode === "ai"
        ? FORMATIONS[Math.floor(Math.random() * FORMATIONS.length)]
        : preferences.rivalFormation;
    state =
      mode === "ai" && human === "han"
        ? createGame(rival, preferences.formation)
        : createGame(preferences.formation, rival);
    announced = false;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  function screen() {
    root.innerHTML =
      nav.header() +
      `<main class="game-layout janggi-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>장기 <small>JANGGI</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="camera" aria-pressed="false">시점 전환</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE JANGGI TABLE</span><span>9 × 10 · 초 선공</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar jg-sidebar"><div id="turn" role="status" aria-live="polite"></div>${(["cho", "han"] as const).map((side) => `<div class="player"><i class="jg-glyph ${side}">${side === "cho" ? "楚" : "漢"}</i><span>${SIDE[side]}<small>${who(side)}</small></span><b id="jg-points-${side}"></b></div>`).join("")}<button id="confirm" class="primary sr-only" disabled>기물을 선택하세요</button><div class="assist"><button id="jg-pass">한수쉼</button><button id="jg-clear">선택 취소</button></div><div class="assist"><button id="undo">무르기</button><button id="hint">힌트</button></div><div id="jg-result" class="yd-result" hidden><p id="jg-final"></p><button id="jg-again" class="primary">다시 플레이</button></div><p class="input-help">마우스: 기물을 누른 뒤 도착점을 클릭<br>터치: 기물을 누른 뒤 도착점을 누르면 이동<br>키보드: 방향키·Enter, Escape 취소</p></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    dress(setup, [".assist"]);
    $("camera").onclick = () => {
      top = !top;
      clearSelection();
      view?.setCamera(facing, top);
      $("camera").setAttribute("aria-pressed", String(top));
      update();
    };
    $("confirm").onclick = confirm;
    $("jg-clear").onclick = clearSelection;
    $("jg-pass").onclick = () => submit(null);
    $("undo").onclick = takeBack;
    $("hint").onclick = showHint;
    $("jg-again").onclick = () => setupDialog(setup);
    try {
      view = new JanggiView($("board"), settings.quality, facing);
      view.onSelect = select;
      view.onContact = () => sound.tap();
      view.onSettled = update;
      view.render(state.board, null, false);
      view.renderer.domElement.addEventListener("keydown", (e) => {
        if (!canPlay()) return;
        if (e.key === "Escape") {
          e.preventDefault();
          clearSelection();
          return;
        }
        // The cursor starts on the centre soldier of the side to move.
        cursor ??= selected ?? (state.turn === "cho" ? at(4, 6) : at(4, 3));
        const steps: Record<string, [number, number]> = {
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
        };
        if (steps[e.key]) {
          e.preventDefault();
          const [dx, dy] = steps[e.key],
            sign = facing === "cho" ? 1 : -1;
          cursor = at(
            Math.max(0, Math.min(8, xOf(cursor) + dx * sign)),
            Math.max(0, Math.min(9, yOf(cursor) + dy * sign)),
          );
          if (selected !== null)
            target = legalMoves(state, selected).some((m) => m.to === cursor) ? cursor : null;
          update();
        } else if (e.key === "Enter") {
          e.preventDefault();
          select(cursor, true);
        }
      });
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요.</p></div>';
    }
    update();
    schedule();
  }
  function canPlay() {
    return (
      !!view &&
      !view.animating &&
      !state.outcome &&
      !aiTurn() &&
      !document.querySelector("dialog[open]")
    );
  }
  function clearSelection() {
    selected = target = cursor = null;
    update();
  }
  function select(index: number | null, commit: boolean) {
    if (!canPlay()) return;
    if (index === null) {
      clearSelection();
      return;
    }
    if (sideOf(state.board[index]) === state.turn) {
      selected = index;
      target = null;
      cursor = index;
      update();
      return;
    }
    if (selected !== null && legalMoves(state, selected).some((m) => m.to === index)) {
      target = cursor = index;
      update();
      if (commit) confirm();
    } else {
      target = null;
      cursor = index;
      update();
    }
  }
  function confirm() {
    if (selected !== null && target !== null) submit({ from: selected, to: target });
  }
  /** A move, or a pass for null, by the person to move. */
  function submit(move: Move | null) {
    if (!canPlay()) return;
    const next = play(state, move);
    if (!next) return;
    sound.unlock();
    accept(next);
  }
  function accept(next: State) {
    const last = next.moves.at(-1) ?? null;
    state = next;
    selected = target = cursor = null;
    aiError = "";
    hintAI.cancel();
    hinting = false;
    view?.render(state.board, last);
    faceMover(TURN_DELAY_MS);
    update();
    schedule();
  }
  /** Two players at one screen: the board turns to whoever is to move. */
  function faceMover(delay = 0) {
    if (mode !== "local" || state.outcome || !view || state.turn === facing) return;
    facing = state.turn;
    view.setCamera(facing, top, delay);
  }
  /** How many moves one press of 무르기 takes back; 0 when it is unavailable. */
  function undoCount() {
    if (state.outcome || !state.moves.length) return 0;
    if (mode === "local" || aiTurn()) return 1;
    // Against the computer, return to the person's own previous turn.
    return state.moves.length >= 2 ? 2 : 0;
  }
  function takeBack() {
    const count = undoCount();
    if (!count || !view || view.animating || document.querySelector("dialog[open]")) return;
    const previous = undo(state, count);
    if (!previous) return;
    // Drop searches and pending replies for the abandoned position.
    pause();
    state = previous;
    selected = target = cursor = null;
    aiError = "";
    view.render(state.board, null, false);
    faceMover();
    update();
    schedule();
  }
  const canHint = () =>
    !!view && !state.outcome && !aiTurn() && !document.querySelector("dialog[open]");
  async function showHint() {
    if (!canHint() || hinting) return;
    const position = state,
      current = generation;
    hinting = true;
    update();
    try {
      const r = await hintAI.compute(position, "hard", 3 + position.moves.length * 104729);
      if (disposed || current !== generation || state !== position || !view) return;
      hinting = false;
      if (r.move && legalMoves(state, r.move.from).some((m) => m.to === r.move!.to)) {
        // Propose the move as an ordinary selection; the person confirms it.
        selected = r.move.from;
        target = cursor = r.move.to;
      }
      update();
    } catch {
      if (disposed || current !== generation || state !== position) return;
      hinting = false;
      update();
    }
  }
  function schedule() {
    if (!view || !aiTurn() || aiError) return;
    const current = generation,
      position = state;
    later(async () => {
      if (current !== generation || state !== position) return;
      if (!view?.ready || view.animating || document.querySelector("dialog[open]")) {
        schedule();
        return;
      }
      computing = true;
      update();
      try {
        const r = await ai.compute(position, difficulty, 7 + position.moves.length * 7919);
        if (current !== generation || state !== position || !view || !aiTurn()) return;
        computing = false;
        const apply = () => {
          if (current !== generation || state !== position || !view) return;
          if (view.animating || document.querySelector("dialog[open]")) {
            later(apply, 100);
            return;
          }
          const next = play(state, r.pass ? null : r.move);
          if (next) accept(next);
          else {
            aiError = "컴퓨터가 유효한 수를 반환하지 못했습니다.";
            update();
          }
        };
        apply();
      } catch (e) {
        if (current !== generation || (e as Error).name === "AbortError") return;
        computing = false;
        aiError = (e as Error).message;
        update();
      }
    }, 250);
  }
  function update() {
    // The status is read on the table itself: the panel's copy is not shown.
    mirrorStatus();
    if (disposed || !document.getElementById("jg-result")) return;
    const check = !state.outcome && inCheck(state),
      last = state.moves.at(-1) ?? null,
      score = points(state.board);
    // 장군 is told once, large, when the position comes up.
    if (check && $("board").dataset.checked !== String(state.moves.length)) {
      $("board").dataset.checked = String(state.moves.length);
      shout("장군");
    }
    $("board").dataset.animating = String(!!view?.animating);
    $("board").dataset.facing = facing;
    $("board").dataset.top = String(top);
    const turn = $("turn");
    turn.dataset.side = state.turn;
    turn.dataset.phase = aiTurn() ? (computing ? "search" : "waiting") : "human";
    turn.textContent = state.outcome
      ? `${state.outcome.winner ? `${SIDE[state.outcome.winner]} 승리` : "무승부"} · ${state.outcome.reason}`
      : aiError ||
        (aiTurn()
          ? "컴퓨터가 생각 중…"
          : `${SIDE[state.turn]}의 차례${check ? " · 장군" : ""}${state.bikjang ? " · 빅장" : ""}`);
    if (aiError && !state.outcome) {
      const retry = document.createElement("button");
      retry.textContent = "AI 다시 시도";
      retry.onclick = () => {
        aiError = "";
        update();
        schedule();
      };
      turn.append(retry);
    }
    $("move-count").textContent = `${state.moves.length}수`;
    $("jg-points-cho").textContent = `${score.cho}점`;
    $("jg-points-han").textContent = `${score.han}점`;
    const playable = canPlay(),
      ready = selected !== null && target !== null;
    $<HTMLButtonElement>("confirm").disabled = !playable || !ready;
    $("confirm").textContent = ready
      ? `${NAMES[state.turn][kindOf(state.board[selected!])]} ${describe(state.board, { from: selected!, to: target! }, state.turn).split(" ")[1]} 이동 확정`
      : selected !== null
        ? "도착점을 선택하세요"
        : "기물을 선택하세요";
    $<HTMLButtonElement>("jg-pass").disabled = !playable || !canPass(state);
    $<HTMLButtonElement>("jg-clear").disabled = selected === null && cursor === null;
    $<HTMLButtonElement>("undo").disabled = !undoCount() || !!view?.animating;
    $<HTMLButtonElement>("hint").disabled = hinting || !!state.outcome || aiTurn() || !view;
    $("hint").textContent = hinting ? "힌트 계산 중…" : "힌트";
    // History: one line per pair of moves, replayed for the piece names.
    $("jg-result").dataset.outcome = !state.outcome?.winner ? "draw" : mode === "ai" && state.outcome.winner === other(human) ? "lose" : "win";
    $("jg-result").hidden = !state.outcome;
    if (state.outcome) {
      $("jg-final").textContent = state.outcome.winner
        ? `${SIDE[state.outcome.winner]}(${who(state.outcome.winner)}) 승리 — ${state.outcome.reason}`
        : `무승부 — ${state.outcome.reason}`;
      if (!announced && !view?.animating) {
        announced = true;
        if (mode === "ai" && state.outcome.winner === other(human)) sound.lose();
        else sound.win();
      }
    }
    const king = check ? state.board.indexOf(state.turn === "cho" ? "K" : "k") : null;
    view?.highlights({
      selected,
      target,
      legal: selected !== null ? legalMoves(state, selected).map((m) => m.to) : [],
      last,
      check: king,
      cursor,
    });
  }
  function rules() {
    modal(
      "궁을 외통으로",
      part("기본 규칙", steps("가로 9줄, 세로 10줄의 판에서 기물은 <b>선이 만나는 점</b> 위를 움직입니다.", "<b>초가 먼저</b> 두고 번갈아 한 수씩 둡니다.", "상대 기물이 있는 점으로 가면 그 기물을 잡습니다.", "상대 궁을 피할 수 없게 공격하는 <b>외통</b>을 만들면 이깁니다.")) +
        part("기물별 이동", `<dl class="piece-moves"><dt>궁 楚·漢</dt><dd>궁성 안에서 선을 따라 한 칸. 궁성 밖으로 나갈 수 없습니다.</dd><dt>사 士</dt><dd>궁과 같이 궁성 안에서 선을 따라 한 칸.</dd><dt>차 車</dt><dd>가로·세로 직선으로 원하는 만큼. 기물을 넘을 수 없습니다. 궁성 안에서는 대각선도 따라갑니다.</dd><dt>포 包</dt><dd>직선 위의 기물 하나를 반드시 넘어 그 뒤로 원하는 만큼. 포는 넘을 수 없고 포를 잡을 수도 없습니다. 궁성 대각선에서도 가운데 기물을 넘어 갑니다.</dd><dt>마 馬</dt><dd>직선 한 칸 뒤 대각선 한 칸. 지나는 첫 칸에 기물이 있으면 못 갑니다.</dd><dt>상 象</dt><dd>직선 한 칸 뒤 같은 대각선으로 두 칸. 지나는 두 칸 중 하나라도 막히면 못 갑니다.</dd><dt>졸 卒·병 兵</dt><dd>앞이나 옆으로 한 칸. 뒤로는 못 갑니다. 상대 궁성 안에서는 대각선 앞으로도 갑니다.</dd></dl>`) +
        part("장군과 한수쉼", table(["장군", "궁이 다음 수에 잡힐 위치에 놓인 상태입니다. 반드시 바로 풀어야 합니다: 궁을 피하거나, 공격하는 기물을 잡거나, 길을 막습니다."], ["외통", "장군을 풀 방법이 하나도 없으면 집니다."], ["한수쉼", "장군이 아닐 때는 두지 않고 차례를 넘길 수 있습니다."])) +
        part("무승부와 점수 판정", table(["빅장", "두 궁이 사이에 기물 없이 마주 보게 되었을 때, 상대가 다음 수에 풀지 않으면 무승부입니다."], ["반복", "같은 국면이 세 번 나오면 무승부입니다."], ["점수 판정", "양쪽이 연달아 쉬거나 200수에 이르면 남은 기물 점수로 승패를 정합니다. 차 13 · 포 7 · 마 5 · 상 3 · 사 3 · 졸·병 2, 한에 1.5 덤."])) +
        part("상차림", notes("대국 전에 궁 양옆의 마와 상 순서를 고릅니다: 마상마상·상마상마·마상상마·상마마상.", "컴퓨터 대전에서는 내 것만, 로컬 2인에서는 초와 한이 각자 고릅니다.")) +
        part("조작", table(["마우스", "기물을 누른 뒤 도착점을 클릭"], ["터치", "기물을 누른 뒤 도착점을 누르면 바로 이동"], ["키보드", "방향키로 이동, Enter로 선택·확정, Escape로 취소"])) +
        part("버튼", table(["무르기", "직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다."], ["힌트", "추천 수를 기물과 도착점 선택으로 보여 줍니다. 이동은 직접 확정합니다."], ["한수쉼", "두지 않고 차례를 넘깁니다."], ["새 게임", "설정 창이 뜹니다. 대전 방식·난이도·진영·상차림을 고르고 새로 시작합니다."], ["시점 전환", "비스듬한 시점과 위에서 내려다보는 시점을 바꿉니다."])) +
        part("그 밖에", notes("로컬 2인에서는 둘 차례인 쪽으로 판이 돌아갑니다.", "대국은 저장되지 않습니다. 새로고침하면 처음으로 돌아갑니다.")),
    );
  }
  const hide = (e: PageTransitionEvent) => {
    pause();
    if (!e.persisted) {
      view?.dispose();
      view = null;
      sound.dispose();
    }
  };
  const show = (e: PageTransitionEvent) => {
    if (e.persisted && document.getElementById("jg-result")) {
      update();
      schedule();
    }
  };
  const dialogClosed = () => later(() => {
    update();
    schedule();
  }, 0);
  document.addEventListener("close", dialogClosed, true);
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  setup();
  return {
    dispose() {
      disposed = true;
      stop();
      sound.dispose();
      document.removeEventListener("close", dialogClosed, true);
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
