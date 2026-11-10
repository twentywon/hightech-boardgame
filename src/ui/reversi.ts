import {
  createGame,
  play,
  counts,
  legalMoves,
  point,
  indexOf,
  type State,
  type Player,
  type Point,
} from "../games/reversi/rules";
import { load, save, getOptions, setOptions } from "../games/reversi/storage";
import {
  difficulties,
  difficultyLabels,
  type Difficulty,
  type ColorChoice,
} from "../core/ai";
import { ReversiAIClient } from "../games/reversi/client";
import { BoardView } from "../engine/board-view";
import { Sound } from "../engine/sound";
import { modal } from "./dialog";
import { setSettings, type Settings, type Mode } from "../core/storage";
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
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
  let preferences = getOptions(),
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
    hintKey = "";
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
  const persist = () => save({ state, mode, difficulty, human });
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
  }
  function setup() {
    stop();
    root.innerHTML =
      nav.header() +
      `<main class="library reversi-setup"><button class="text-button" id="rv-back">← 컬렉션</button><div class="eyebrow">NO. 02 — TURN THE TABLE</div><h1>한 번의 뒤집기,<br>새로운 가능성.</h1><p class="intro">리버시 · Reversi<br>상대 돌을 사이에 두고, 테이블의 흐름을 바꿔보세요.</p><section class="featured"><div class="feature-copy"><div class="pill">지금 플레이 가능</div><h2>리버시 <span>Reversi</span></h2><p>코너를 지키고, 다음 수를 열어두세요.<br>마지막 순간까지 승부는 바뀔 수 있습니다.</p><div class="game-meta">2인 · 8×8 보드 · 전략</div><div class="mode-select"><label><input type="radio" name="rv-mode" value="local" checked> 로컬 2인</label><label><input type="radio" name="rv-mode" value="ai"> 컴퓨터 대전</label></div><div id="rv-options" class="ai-options" hidden><label>AI 난이도<select id="rv-difficulty">${difficulties.map((d) => `<option value="${d}" ${preferences.difficulty === d ? "selected" : ""}>${difficultyLabels[d]}</option>`).join("")}</select></label><label>플레이어 색상<select id="rv-color">${[
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
        )}</select></label><small>선택한 설정은 다음 새 대국부터 적용됩니다.</small></div><button id="rv-start" class="primary">리버시 시작 <span>↗</span></button>${load() ? '<button id="rv-resume" class="text-button">리버시 이어하기 →</button>' : ""}</div><div class="feature-art reversi-art"><div class="reversi-mini"><i class="white"></i><i class="black"></i><i class="black"></i><i class="white"></i></div><span>THE ART OF REVERSAL</span></div></section></main>`;
    nav.bindHeader();
    $("rv-back").onclick = nav.back;
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
      setOptions(preferences);
    };
    $("rv-difficulty").onchange = remember;
    $("rv-color").onchange = remember;
    $("rv-start").onclick = () => {
      mode = document.querySelector<HTMLInputElement>(
        "input[name=rv-mode]:checked",
      )!.value as Mode;
      start();
    };
    if (document.getElementById("rv-resume"))
      $("rv-resume").onclick = () => {
        const s = load();
        if (s) {
          ({ state, mode, difficulty, human } = s);
          screen();
        }
      };
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
    persist();
    sound.unlock();
    screen();
  }
  function screen() {
    stop();
    root.innerHTML =
      nav.header() +
      `<main class="game-layout"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>리버시 <small>REVERSI</small></h1></div><div class="game-actions"><button id="rv-config">대국 설정</button><button id="rules">게임 방법</button><button id="camera" aria-pressed="${settings.top}">시점 전환</button><button id="restart">다시 시작</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE REVERSI TABLE</span><span>8 × 8 · 흑 선공</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar"><div class="eyebrow">TURN THE TABLE</div><h2>마지막 한 수까지,<br>가능성은 열려있습니다.</h2><div id="turn" role="status" aria-live="polite"></div><div id="pass-notice" role="status" aria-live="polite" hidden></div><div class="player"><i class="stone black"></i><span>흑돌<small>${mode === "local" ? "플레이어 1" : human === 1 ? "나" : `컴퓨터 · ${difficultyLabels[difficulty]}`}</small></span><b id="black-count">2</b></div><div class="player"><i class="stone white"></i><span>백돌<small>${mode === "local" ? "플레이어 2" : human === 2 ? "나" : `컴퓨터 · ${difficultyLabels[difficulty]}`}</small></span><b id="white-count">2</b></div><label class="hint-toggle"><input id="hints" type="checkbox" ${showHints ? "checked" : ""}> 합법 수 안내</label><p class="hint">상대 돌을 사이에 두고 뒤집으세요.<br>마지막에 더 많은 돌을 가진 쪽이 승리합니다.</p><button id="confirm" class="primary" disabled>위치를 선택하세요</button><p class="input-help">마우스: 클릭하여 착수<br>터치: 선택·드래그 후 확정<br>키보드: 방향키로 선택, Enter로 착수</p><span id="save-status" class="save-status"></span></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rv-config").onclick = setup;
    $("rules").onclick = rules;
    $("restart").onclick = () =>
      modal(
        "새 리버시 대국을 시작할까요?",
        "선택한 다음 대국 설정으로 새로 시작합니다.",
        [
          { text: "계속하기", action: () => {} },
          { text: "새 게임", action: start },
        ],
      );
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
    try {
      view = new BoardView($("board"), settings.quality, "reversi");
      view.onContact = () => sound.tap();
      view.onSettled = update;
      view.renderReversi(state, false);
      if (settings.top) view.setCamera(true);
      view.onSelect = (p, confirm) => {
        if (
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
    if (state.winner) later(result, 500);
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
  function accept(next: State) {
    state = next;
    candidate = null;
    aiError = "";
    const saved = persist();
    view?.renderReversi(state);
    update();
    $("save-status").textContent = saved
      ? "✓ 이 기기에 자동 저장됨"
      : "저장을 사용할 수 없습니다";
    if (state.winner) later(result, 900);
    else schedule();
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
      `<ol><li>흑돌이 먼저 시작합니다. 상대 돌을 자기 돌 사이에 가둘 수 있는 빈 칸에 놓으세요.</li><li>가로·세로·대각선 8방향의 해당 돌이 모두 뒤집힙니다.</li><li>둘 곳이 없으면 자동 패스합니다. 양쪽 모두 둘 수 없으면 빈 칸이 남아도 종료합니다.</li><li>마지막에 실제 돌 개수가 많으면 승리, 같으면 무승부입니다.</li></ol><p>처음이라면 코너를 지키고 상대가 둘 수 있는 칸을 줄여보세요. 많이 뒤집는 수가 언제나 좋은 수는 아닙니다.</p>`,
    );
  }
  function result() {
    if (!state.winner) return;
    if (view?.animating) {
      later(result, 100);
      return;
    }
    const c = counts(state.board);
    modal(
      state.winner === "draw"
        ? "멋진 승부, 무승부!"
        : `${state.winner === 1 ? "흑돌" : "백돌"}이 승리했습니다!`,
      `<p>흑 ${c.black} : 백 ${c.white}<br>빈 칸 ${c.empty}개 · 실제 돌 개수로 판정했습니다.</p>`,
      [
        { text: "게임판 보기", action: () => {} },
        { text: "다시 플레이", action: start },
      ],
    );
  }
  const hide = () => {
    generation++;
    ai.cancel();
    timers.forEach(clearTimeout);
    timers.clear();
  };
  const show = (e: PageTransitionEvent) => {
    if (e.persisted && view) schedule();
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
