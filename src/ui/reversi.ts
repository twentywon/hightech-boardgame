import {
  createGame,
  play,
  counts,
  legalMoves,
  point,
  indexOf,
  undo,
  type State,
  type Player,
  type Point,
} from "../games/reversi/rules";
import {
  difficulties,
  difficultyLabels,
  type Difficulty,
  type ColorChoice,
  type AIOptions,
} from "../core/ai";
import { ReversiAIClient } from "../games/reversi/client";
import { BoardView } from "../engine/board-view";
import { Sound } from "../engine/sound";
import { modal, setupDialog } from "./dialog";
import { setSettings, type Settings, type Mode } from "../core/storage";
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: AIOptions;
  remember: (options: AIOptions) => void;
}
export interface ReversiController {
  dispose(): void;
  setSettings(settings: Settings): void;
}
export function mountReversi(
  root: HTMLElement,
  nav: Navigation,
): ReversiController {
  const ai = new ReversiAIClient(),
    sound = new Sound();
  sound.enabled = nav.settings.sound;
  let preferences = nav.preferences,
    state = createGame(),
    mode: Mode = "local",
    difficulty: Difficulty = preferences.difficulty,
    human: Player = 1;
  let settings = nav.settings,
    view: BoardView | null = null,
    candidate: Point | null = null,
    showHints = true,
    generation = 0,
    disposed = false,
    aiError = "",
    hintKey = "",
    resultPending = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) fn();
    }, ms);
    timers.add(timer);
  };
  const aiTurn = () => mode === "ai" && state.turn !== human;
  function stop() {
    generation++;
    ai.cancel();
    timers.forEach(clearTimeout);
    timers.clear();
    view?.dispose();
    view = null;
    candidate = null;
    hintKey = "";
    aiError = "";
    resultPending = false;
  }
  function setup(host = nav.setupHost) {
    if (host === nav.setupHost) stop();
    host.innerHTML =
      `<section class="featured"><div class="feature-copy"><div class="pill">지금 플레이 가능</div><h2>리버시 <span>Reversi</span></h2><p>코너를 지키고, 다음 수를 열어두세요.<br>마지막 순간까지 승부는 바뀔 수 있습니다.</p><div class="game-meta">2인 · 8×8 보드 · 전략</div><div class="mode-select"><label><input type="radio" name="rv-mode" value="local" checked> 로컬 2인</label><label><input type="radio" name="rv-mode" value="ai"> 컴퓨터 대전</label></div><div id="rv-options" class="ai-options" hidden><label>AI 난이도<select id="rv-difficulty">${difficulties.map((d) => `<option value="${d}" ${preferences.difficulty === d ? "selected" : ""}>${difficultyLabels[d]}</option>`).join("")}</select></label><label>플레이어 색상<select id="rv-color">${[
        ["black", "흑돌"],
        ["white", "백돌"],
        ["random", "무작위"],
      ]
        .map(
          ([v, label]) =>
            `<option value="${v}" ${preferences.color === v ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><small>선택한 설정은 다음 새 대국부터 적용됩니다.</small></div><button id="rv-start" class="primary">테이블에 앉기 <span>↗</span></button></div><div class="feature-art reversi-art" role="img" aria-label="리버시판 미리보기"><div class="reversi-mini">${Array.from({ length: 64 }, (_, i) => `<i>${i === 27 || i === 36 ? '<b class="white"></b>' : i === 28 || i === 35 ? '<b class="black"></b>' : ""}</i>`).join("")}</div><span>THE ART OF REVERSAL</span></div></section>`;
    document.querySelectorAll<HTMLInputElement>("input[name=rv-mode]").forEach(
      (input) =>
        (input.onchange = () => {
          $("rv-options").hidden =
            document.querySelector<HTMLInputElement>(
              "input[name=rv-mode]:checked",
            )!.value !== "ai";
        }),
    );
    const remember = () => {
      preferences = {
        difficulty: $<HTMLSelectElement>("rv-difficulty").value as Difficulty,
        color: $<HTMLSelectElement>("rv-color").value as ColorChoice,
      };
      nav.remember(preferences);
    };
    $("rv-difficulty").onchange = remember;
    $("rv-color").onchange = remember;
    $("rv-start").onclick = () => {
      mode = document.querySelector<HTMLInputElement>(
        "input[name=rv-mode]:checked",
      )!.value as Mode;
      start();
    };
    // From the table, the panel opens on the mode being played.
    document.querySelectorAll<HTMLInputElement>("input[name=rv-mode]").forEach((input) => {
      input.checked = input.value === mode;
    });
    $("rv-options").hidden = mode !== "ai";
  }
  function start() {
    difficulty = preferences.difficulty;
    human =
      preferences.color === "black"
        ? 1
        : preferences.color === "white"
          ? 2
          : Math.random() < 0.5
            ? 1
            : 2;
    state = createGame();
    sound.unlock();
    screen();
  }
  function screen() {
    stop();
    root.innerHTML =
      nav.header() +
      `<main class="game-layout"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>리버시 <small>REVERSI</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="camera" aria-pressed="${settings.top}">시점 전환</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE REVERSI TABLE</span><span>8 × 8 · 흑 선공</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar"><div class="eyebrow">TURN THE TABLE</div><h2>마지막 한 수까지,<br>가능성은 열려있습니다.</h2><div id="turn" role="status" aria-live="polite"></div><div id="pass-notice" role="status" aria-live="polite" hidden></div><div class="player"><i class="stone black"></i><span>흑돌<small>${mode === "local" ? "플레이어 1" : human === 1 ? "나" : `컴퓨터 · ${difficultyLabels[difficulty]}`}</small></span><b id="black-count">2</b></div><div class="player"><i class="stone white"></i><span>백돌<small>${mode === "local" ? "플레이어 2" : human === 2 ? "나" : `컴퓨터 · ${difficultyLabels[difficulty]}`}</small></span><b id="white-count">2</b></div><label class="hint-toggle"><input id="hints" type="checkbox" ${showHints ? "checked" : ""}> 합법 수 안내</label><p class="hint">상대 돌을 사이에 두고 뒤집으세요.<br>마지막에 더 많은 돌을 가진 쪽이 승리합니다.</p><button id="confirm" class="primary" disabled>위치를 선택하세요</button><div class="assist"><button id="undo">무르기</button></div><p class="input-help">마우스: 클릭하여 착수<br>터치: 칸을 누르면 바로 착수<br>키보드: 방향키로 선택, Enter로 착수</p></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    $("restart").onclick = () => setupDialog(setup);
    $("camera").onclick = () => {
      settings.top = !settings.top;
      view?.setCamera(settings.top);
      candidate = null;
      nav.settings.top = settings.top;
      setSettings(settings);
      $("camera").setAttribute("aria-pressed", String(settings.top));
      update();
    };
    $("hints").onchange = () => {
      showHints = $<HTMLInputElement>("hints").checked;
      update();
    };
    $("confirm").onclick = () => {
      if (candidate) place(candidate);
    };
    $("undo").onclick = takeBack;
    try {
      view = new BoardView($("board"), settings.quality, "reversi");
      view.onContact = () => sound.tap();
      view.onSettled = update;
      view.renderReversi(state, false);
      if (settings.top) view.setCamera(true);
      view.onSelect = (p, confirm) => {
        if (
          !p ||
          !canPlay() ||
          !legalMoves(state.board, state.turn).some(
            (m) => m.index === indexOf(p),
          )
        ) {
          candidate = null;
          view?.preview(null, state.turn);
          update();
          return;
        }
        candidate = p;
        view?.preview(p, state.turn);
        update();
        if (confirm) place(p);
      };
      const canvas = view.renderer.domElement;
      canvas.tabIndex = 0;
      canvas.addEventListener("keydown", (e) => {
        if (!canPlay()) return;
        const p =
          candidate ?? point(legalMoves(state.board, state.turn)[0].index);
        const dirs: Record<string, [number, number]> = {
          ArrowUp: [-1, 0],
          ArrowDown: [1, 0],
          ArrowLeft: [0, -1],
          ArrowRight: [0, 1],
        };
        if (dirs[e.key]) {
          e.preventDefault();
          const [r, c] = dirs[e.key];
          candidate = {
            row: Math.max(0, Math.min(7, p.row + r)),
            col: Math.max(0, Math.min(7, p.col + c)),
          };
          view?.preview(isLegal(candidate) ? candidate : null, state.turn);
          update();
        } else if (e.key === "Enter") {
          e.preventDefault();
          place(p);
        }
      });
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요.</p></div>';
    }
    sound.enabled = settings.sound;
    update();
    schedule();
    if (state.winner) {
      resultPending = true;
      later(result, 500);
    }
  }
  const isLegal = (p: Point) =>
    legalMoves(state.board, state.turn).some((m) => m.index === indexOf(p));
  function canPlay() {
    return (
      !!view &&
      !view.animating &&
      !state.winner &&
      !aiTurn() &&
      !document.querySelector("dialog[open]")
    );
  }
  function place(p: Point) {
    if (!canPlay()) return;
    const next = play(state, p);
    if (next) {
      sound.unlock();
      accept(next);
    }
  }
  /**
   * State one press of 무르기 returns to. Against the computer that is the
   * person's own previous turn, which may be several moves back after passes.
   */
  function undoTarget(): State | null {
    if (state.winner || !state.moves.length) return null;
    if (mode === "local") return undo(state);
    for (let count = 1; count <= state.moves.length; count++) {
      const previous = undo(state, count);
      if (
        previous &&
        previous.turn === human &&
        state.moves.slice(-count).some((m) => m.player === human)
      )
        return previous;
    }
    return null;
  }
  function takeBack() {
    if (!view || view.animating || document.querySelector("dialog[open]"))
      return;
    const previous = undoTarget();
    if (!previous) return;
    // Drop searches and pending replies for the abandoned position.
    generation++;
    ai.cancel();
    timers.forEach(clearTimeout);
    timers.clear();
    state = previous;
    candidate = null;
    aiError = "";
    view.renderReversi(state, false);
    update();
    schedule();
  }
  function accept(next: State) {
    state = next;
    candidate = null;
    aiError = "";
    view?.renderReversi(state);
    update();
    if (state.winner) {
      resultPending = true;
      later(result, 900);
    } else schedule();
  }
  function update() {
    if (disposed || !document.getElementById("black-count")) return;
    const c = counts(state.board);
    $("black-count").textContent = String(c.black);
    $("white-count").textContent = String(c.white);
    $("move-count").textContent = `${state.moves.length}수`;
    $("turn").textContent = state.winner
      ? state.winner === "draw"
        ? "무승부"
        : `${state.winner === 1 ? "흑" : "백"}돌 승리`
      : aiError ||
        (aiTurn()
          ? "컴퓨터가 생각 중…"
          : `${state.turn === 1 ? "흑" : "백"}돌의 차례입니다`);
    if (aiError) {
      const b = document.createElement("button");
      b.textContent = "AI 다시 시도";
      b.onclick = () => {
        aiError = "";
        update();
        schedule();
      };
      $("turn").append(b);
    }
    $("pass-notice").hidden = !state.lastPassed || !!state.winner;
    $("pass-notice").textContent = state.lastPassed
      ? `${state.lastPassed === 1 ? "흑" : "백"}돌은 둘 곳이 없어 자동 패스했습니다.`
      : "";
    $<HTMLButtonElement>("confirm").disabled =
      !candidate || !canPlay() || !isLegal(candidate);
    $("confirm").textContent =
      candidate && isLegal(candidate)
        ? `${String.fromCharCode(65 + candidate.col)}${candidate.row + 1}에 착수 확정`
        : "위치를 선택하세요";
    // Enabled again by onSettled once the discs stop flipping.
    $<HTMLButtonElement>("undo").disabled = !undoTarget() || !!view?.animating;
    const legal =
      showHints && !state.winner
        ? legalMoves(state.board, state.turn).map((m) => point(m.index))
        : [];
    const key = legal.map(indexOf).join(",");
    if (key !== hintKey) {
      view?.setHints(legal);
      hintKey = key;
    }
  }
  function schedule() {
    if (!view || !aiTurn() || state.winner) return;
    const current = generation,
      snapshot = state;
    later(async () => {
      if (current !== generation) return;
      if (
        !view?.ready ||
        view.animating ||
        document.querySelector("dialog[open]")
      ) {
        schedule();
        return;
      }
      try {
        const r = await ai.compute(
          snapshot,
          difficulty,
          snapshot.moves.length * 7919 + 7,
        );
        if (
          disposed ||
          current !== generation ||
          state !== snapshot ||
          !aiTurn()
        )
          return;
        const submit = () => {
          if (current !== generation || state !== snapshot) return;
          if (view?.animating || document.querySelector("dialog[open]")) {
            later(submit, 100);
            return;
          }
          const next = r.move && play(state, r.move);
          if (next) accept(next);
          else {
            aiError = "컴퓨터가 유효한 수를 반환하지 못했습니다.";
            update();
          }
        };
        submit();
      } catch (e) {
        if (current === generation && (e as Error).name !== "AbortError") {
          aiError = (e as Error).message;
          update();
        }
      }
    }, 200);
  }
  function rules() {
    modal(
      "사이에 두고, 뒤집으세요",
      `<ol><li>흑돌이 먼저 시작합니다. 상대 돌을 자기 돌 사이에 가둘 수 있는 빈 칸에 놓으세요.</li><li>가로·세로·대각선 8방향의 해당 돌이 모두 뒤집힙니다.</li><li>둘 곳이 없으면 자동 패스합니다. 양쪽 모두 둘 수 없으면 빈 칸이 남아도 종료합니다.</li><li>마지막에 실제 돌 개수가 많으면 승리, 같으면 무승부입니다.</li></ol><p>처음이라면 코너를 지키고 상대가 둘 수 있는 칸을 줄여보세요. 많이 뒤집는 수가 언제나 좋은 수는 아닙니다.</p><p><b>무르기</b>는 직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다. 대국이 끝난 뒤에는 무를 수 없습니다.</p>`,
    );
  }
  function result() {
    if (!resultPending || !state.winner) return;
    if (view?.animating || document.querySelector("dialog[open]")) {
      later(result, 100);
      return;
    }
    resultPending = false;
    const c = counts(state.board);
    modal(
      state.winner === "draw"
        ? "멋진 승부, 무승부!"
        : `${state.winner === 1 ? "흑돌" : "백돌"}이 승리했습니다!`,
      `<p>흑 ${c.black} : 백 ${c.white}<br>빈 칸 ${c.empty}개 · 실제 돌 개수로 판정했습니다.</p>`,
      [
        { text: "게임판 보기", action: () => {} },
        { text: "새 게임", action: () => setupDialog(setup) },
      ],
    );
  }
  const hide = (e: PageTransitionEvent) => {
    generation++;
    ai.cancel();
    timers.forEach(clearTimeout);
    timers.clear();
    if (!e.persisted) {
      view?.dispose();
      view = null;
      sound.dispose();
    }
  };
  const show = (e: PageTransitionEvent) => {
    if (e.persisted && view) {
      if (resultPending) later(result, 100);
      else schedule();
    }
  };
  window.addEventListener("pagehide", hide);
  window.addEventListener("pageshow", show);
  setup();
  return {
    dispose() {
      disposed = true;
      stop();
      sound.dispose();
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
