import {
  type AIOptions,
  type Difficulty,
  type ColorChoice,
  difficulties,
  difficultyLabels,
} from "../core/ai";
import { type Settings, type Mode } from "../core/storage";
import {
  createGame,
  createEngine,
  play,
  action,
  claimDraw,
  undo,
  claimReasons,
  other,
  type State,
  type Move,
  type Square,
  type Color,
  type Action,
  type Promotion,
  type PieceSymbol,
} from "../games/chess/rules";
import { ChessAIClient } from "../games/chess/client";
import { ChessView } from "../games/chess/view";
import { Sound } from "../engine/sound";
import { modal } from "./dialog";
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: AIOptions;
  remember: (options: AIOptions) => void;
}
export interface ChessController {
  dispose(): void;
  setSettings(settings: Settings): void;
}
const names: Record<PieceSymbol, string> = {
  p: "폰",
  n: "나이트",
  b: "비숍",
  r: "룩",
  q: "퀸",
  k: "킹",
};
const glyphs: Record<Color, Record<PieceSymbol, string>> = {
  w: { k: "♔", q: "♕", r: "♖", b: "♗", n: "♘", p: "♙" },
  b: { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" },
};
export function mountChess(
  root: HTMLElement,
  nav: Navigation,
): ChessController {
  const ai = new ChessAIClient(),
    sound = new Sound();
  let preferences = { ...nav.preferences },
    settings = nav.settings,
    state = createGame(),
    mode: Mode = "local",
    nextMode: Mode = "local",
    difficulty: Difficulty = "normal",
    human: Color = "w";
  let view: ChessView | null = null,
    selected: Square | null = null,
    target: Square | null = null,
    cursor: Square | null = null,
    facing: Color = "w",
    top = false;
  let disposed = false,
    hidden = false,
    generation = 0,
    aiError = "",
    computing = false,
    promoting = false,
    lastSearchMs: number | null = null;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let ownDialog: HTMLDialogElement | null = null;
  const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const later = (fn: () => void, ms: number) => {
    const t = setTimeout(() => {
      timers.delete(t);
      if (!disposed && !hidden) fn();
    }, ms);
    timers.add(t);
  };
  // Reuse one read-only engine snapshot per position. Pointer/keyboard updates
  // must not replay the whole game or regenerate SAN for every status label.
  let cached:
    | {
        state: State;
        game: ReturnType<typeof createEngine>;
        moves: Move[];
        legal: Move[];
        captured: Record<Color, PieceSymbol[]>;
        claims: Map<string, string[]>;
      }
    | undefined;
  function snapshot() {
    if (!cached || cached.state !== state) {
      const game = createEngine(state),
        moves = game.history({ verbose: true });
      const captured: Record<Color, PieceSymbol[]> = { w: [], b: [] };
      for (const m of moves) if (m.captured) captured[m.color].push(m.captured);
      cached = {
        state,
        game,
        moves,
        captured,
        legal: state.outcome ? [] : game.moves({ verbose: true }),
        claims: new Map(),
      };
    }
    return cached;
  }
  const engine = () => snapshot().game,
    aiTurn = () => mode === "ai" && engine().turn() !== human;
  const availableMoves = (square?: Square) =>
    square
      ? snapshot().legal.filter((m) => m.from === square)
      : snapshot().legal;
  function claims(intended?: Action) {
    const cache = snapshot().claims;
    const key = intended
      ? intended.from + intended.to + (intended.promotion ?? "")
      : "current";
    if (!cache.has(key)) cache.set(key, claimReasons(state, intended));
    return cache.get(key)!;
  }
  // Hints use their own Worker so they never cancel the opponent's search.
  const hintAI = new ChessAIClient();
  let hinting = false;
  function cancelHint() {
    hintAI.cancel();
    hinting = false;
  }
  function pause() {
    generation++;
    ai.cancel();
    cancelHint();
    timers.forEach(clearTimeout);
    timers.clear();
    computing = false;
  }
  function stop() {
    pause();
    view?.dispose();
    view = null;
    selected = target = cursor = null;
    promoting = false;
    aiError = "";
    ownDialog?.remove();
    ownDialog = null;
  }
  function optionsForm(prefix: string) {
    return `<div class="ai-options"><label>AI 난이도<select id="${prefix}-difficulty">${difficulties.map((d) => `<option value="${d}" ${preferences.difficulty === d ? "selected" : ""}>${difficultyLabels[d]}</option>`).join("")}</select></label><label>플레이어 색상<select id="${prefix}-color">${[
      ["white", "백"],
      ["black", "흑"],
      ["random", "무작위"],
    ]
      .map(
        ([v, label]) =>
          `<option value="${v}" ${preferences.color === v ? "selected" : ""}>${label}</option>`,
      )
      .join(
        "",
      )}</select></label><small>선택한 설정은 다음 새 대국부터 적용됩니다.</small></div>`;
  }
  function remember(prefix: string) {
    preferences = {
      difficulty: $<HTMLSelectElement>(`${prefix}-difficulty`)
        .value as Difficulty,
      color: $<HTMLSelectElement>(`${prefix}-color`).value as ColorChoice,
    };
    nav.remember({ ...preferences });
  }
  function setup() {
    nav.setupHost.innerHTML = `<section class="featured"><div class="feature-copy"><div class="pill">지금 플레이 가능</div><span class="game-number">NO. 03 — THINK AHEAD</span><h2>체스 <span>Chess</span></h2><p>한 수 앞에서, 더 먼 가능성으로.<br>여섯 가지 기물로 나만의 전략을 펼쳐보세요.</p><div class="game-meta">2인 · 8×8 보드 · 백 선공</div><div class="mode-select"><label><input type="radio" name="chess-mode" value="local" checked> 로컬 2인</label><label><input type="radio" name="chess-mode" value="ai"> 컴퓨터 대전</label></div><div id="chess-options" hidden>${optionsForm("chess")}</div><button id="chess-start" class="primary">테이블에 앉기 <span>↗</span></button><small class="session-note">현재 대국은 이 페이지를 여는 동안만 유지됩니다.</small></div><div class="feature-art chess-art" role="img" aria-label="체스판 미리보기"><div class="chess-mini">${Array.from({ length: 64 }, (_, i) => `<i>${i === 27 ? "♞︎" : i === 35 ? "♔︎" : i === 44 ? "♟︎" : ""}</i>`).join("")}</div><span>EVERY MOVE OPENS A WORLD</span></div></section>`;
    document
      .querySelectorAll<HTMLInputElement>("input[name=chess-mode]")
      .forEach(
        (input) =>
          (input.onchange = () => {
            $("chess-options").hidden =
              document.querySelector<HTMLInputElement>(
                "input[name=chess-mode]:checked",
              )!.value !== "ai";
          }),
      );
    $("chess-difficulty").onchange = () => remember("chess");
    $("chess-color").onchange = () => remember("chess");
    $("chess-start").onclick = () => {
      nextMode = document.querySelector<HTMLInputElement>(
        "input[name=chess-mode]:checked",
      )!.value as Mode;
      start();
    };
  }
  function start() {
    stop();
    mode = nextMode;
    difficulty = preferences.difficulty;
    human =
      preferences.color === "white"
        ? "w"
        : preferences.color === "black"
          ? "b"
          : Math.random() < 0.5
            ? "w"
            : "b";
    facing = mode === "ai" ? human : "w";
    top = false;
    state = createGame();
    lastSearchMs = null;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  function dialog(
    title: string,
    body: string,
    actions?: { text: string; action: () => void }[],
  ) {
    modal(title, body, actions);
    ownDialog = document.querySelector("dialog");
    return ownDialog!;
  }
  let renderedHistory: State | null = null;
  let resultPending = false;
  function screen() {
    renderedHistory = null;
    resultPending = false;
    root.innerHTML =
      nav.header() +
      `<main class="game-layout chess-game"><div class="game-top"><div><button id="back" class="text-button">← 컬렉션</button><h1>체스 <small>CHESS</small></h1></div><div class="game-actions"><button id="chess-config">대국 설정</button><button id="rules">게임 방법</button><button id="camera" aria-pressed="false">시점 전환</button><button id="chess-flip">보드 방향 전환</button><button id="restart">다시 시작</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE CHESS TABLE</span><span>8 × 8 · 백 선공</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar"><div class="eyebrow">THINK AHEAD</div><h2>한 수 앞에서,<br>더 먼 가능성으로.</h2><div id="turn" role="status" aria-live="polite"></div>${(["w", "b"] as const).map((c) => `<div class="player"><i class="chess-glyph">${glyphs[c].k}</i><span>${c === "w" ? "백" : "흑"}<small>${mode === "local" ? `플레이어 ${c === "w" ? 1 : 2}` : human === c ? "나" : `컴퓨터 · ${difficultyLabels[difficulty]}`}</small></span></div>`).join("")}<div id="chess-captured" class="chess-captured"></div><div class="chess-confirm-slot"><button id="confirm" class="primary" disabled>기물을 선택하세요</button></div><button id="chess-clear" class="text-button">선택 취소</button><div class="assist"><button id="undo">무르기</button><button id="hint">힌트</button></div><button id="chess-claim" disabled>무승부 청구</button><p id="chess-claim-info" class="input-help"></p><p class="input-help">마우스: 기물 선택 후 도착 칸 클릭<br>터치: 기물·도착 칸 선택 후 이동 확정<br>키보드: 방향키·Enter, Escape 취소<br>예정 수 청구: 기물 선택 후 방향키로 도착 칸 미리보기</p><h3 class="history-title">이동 기록</h3><ol id="chess-history" class="chess-history" aria-label="SAN 이동 기록"></ol></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    $("chess-config").onclick = configure;
    $("restart").onclick = () =>
      dialog(
        "새 체스 대국을 시작할까요?",
        "현재 대국을 끝내고 선택한 설정으로 새로 시작합니다.",
        [
          { text: "계속하기", action: () => {} },
          { text: "새 게임", action: start },
        ],
      );
    $("camera").onclick = () => {
      top = !top;
      clearSelection();
      view?.setCamera(facing, top);
      $("camera").setAttribute("aria-pressed", String(top));
      update();
    };
    $("chess-flip").onclick = () => {
      facing = other(facing);
      clearSelection();
      view?.setCamera(facing, top);
      update();
    };
    $("confirm").onclick = confirm;
    $("chess-clear").onclick = clearSelection;
    $("chess-claim").onclick = claim;
    $("undo").onclick = takeBack;
    $("hint").onclick = showHint;
    try {
      view = new ChessView($("board"), settings.quality, facing);
      view.onSelect = select;
      view.onCancel = clearSelection;
      view.onContact = () => sound.tap();
      view.onSettled = update;
      view.render(engine());
      const canvas = view.renderer.domElement;
      canvas.addEventListener("keydown", (e) => {
        if (!canPlay()) return;
        if (e.key === "Escape") {
          e.preventDefault();
          clearSelection();
          return;
        }
        cursor ??= selected ?? (facing === "w" ? "e2" : "e7");
        const dirs: Record<string, [number, number]> = {
          ArrowUp: [0, 1],
          ArrowDown: [0, -1],
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
        };
        if (dirs[e.key]) {
          e.preventDefault();
          const [df, dr] = dirs[e.key],
            sign = facing === "w" ? 1 : -1;
          const file = Math.max(
              0,
              Math.min(7, cursor.charCodeAt(0) - 97 + df * sign),
            ),
            rank = Math.max(1, Math.min(8, Number(cursor[1]) + dr * sign));
          cursor = `${"abcdefgh"[file]}${rank}` as Square;
          if (selected)
            target = availableMoves(selected).some((m) => m.to === cursor)
              ? cursor
              : null;
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
      !promoting &&
      !document.querySelector("dialog[open]") &&
      !hidden
    );
  }
  function clearSelection() {
    selected = target = cursor = null;
    update();
  }
  function candidateMoves() {
    return selected && target
      ? availableMoves(selected).filter((m) => m.to === target)
      : [];
  }
  function select(square: Square | null, commit: boolean) {
    if (!canPlay()) return;
    if (!square) {
      clearSelection();
      return;
    }
    const game = engine(),
      piece = game.get(square);
    if (piece?.color === game.turn()) {
      selected = square;
      target = null;
      cursor = square;
      update();
      return;
    }
    if (selected && availableMoves(selected).some((m) => m.to === square)) {
      target = square;
      cursor = square;
      update();
      if (commit) confirm();
    } else {
      target = null;
      cursor = square;
      update();
    }
  }
  function confirm() {
    if (!canPlay()) return;
    const choices = candidateMoves();
    if (!choices.length) return;
    if (choices.length === 1) {
      submit(action(choices[0]));
      return;
    }
    promoting = true;
    const current = generation;
    const d = dialog(
      "프로모션 기물을 선택하세요",
      "폰을 어떤 기물로 바꿀까요?",
      (["q", "r", "b", "n"] as Promotion[]).map((p) => ({
        text: `${glyphs[engine().turn()][p]} ${names[p]}`,
        action: () => {
          promoting = false;
          if (current === generation)
            submit({ ...action(choices[0]), promotion: p });
        },
      })),
    );
    d.addEventListener(
      "cancel",
      () => {
        promoting = false;
        target = null;
        update();
      },
      { once: true },
    );
    update();
  }
  function submit(m: Action) {
    if (!canPlay()) return;
    const next = play(state, m);
    if (next) {
      sound.unlock();
      accept(next);
    }
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
    if (
      !count ||
      !view ||
      view.animating ||
      promoting ||
      hidden ||
      document.querySelector("dialog[open]")
    )
      return;
    const previous = undo(state, count);
    if (!previous) return;
    // Drop searches and pending replies for the abandoned position.
    pause();
    state = previous;
    selected = target = cursor = null;
    aiError = "";
    view.render(engine());
    update();
    schedule();
  }
  async function showHint() {
    if (!canPlay() || hinting) return;
    const position = state,
      current = generation;
    hinting = true;
    update();
    try {
      const r = await hintAI.compute(
        position,
        "hard",
        3 + position.moves.length * 104729,
      );
      if (disposed || current !== generation || state !== position || !view)
        return;
      hinting = false;
      const move = r.move;
      if (
        move &&
        availableMoves(move.from).some((m) => m.to === move.to)
      ) {
        // Propose the move as an ordinary selection; the person confirms it.
        selected = move.from;
        target = cursor = move.to;
      }
      update();
    } catch (e) {
      if (disposed || current !== generation || state !== position) return;
      hinting = false;
      update();
    }
  }
  function accept(next: State) {
    state = next;
    selected = target = cursor = null;
    aiError = "";
    cancelHint();
    const game = engine(),
      last = snapshot().moves.at(-1);
    view?.render(game, last);
    update();
    if (state.outcome) {
      resultPending = true;
      later(result, 600);
    } else schedule();
  }
  function claim() {
    if (!canPlay()) return;
    const intended = claims().length
      ? undefined
      : candidateMoves()
          .map(action)
          .find((m) => claims(m).length);
    const next = claimDraw(state, intended);
    if (next) {
      state = next;
      clearSelection();
      resultPending = true;
      later(result, 100);
    }
  }
  function update() {
    if (disposed || !document.getElementById("chess-history")) return;
    const game = engine(),
      moves = snapshot().moves,
      last = moves.at(-1),
      check = game.isCheck();
    $("board").dataset.animating = String(!!view?.animating);
    $("board").dataset.facing = facing;
    $("board").dataset.top = String(top);
    $("turn").textContent = state.outcome
      ? `${state.outcome.winner ? `${state.outcome.winner === "w" ? "백" : "흑"} 승리` : "무승부"} · ${state.outcome.reason}`
      : aiError ||
        (aiTurn()
          ? "컴퓨터가 생각 중..."
          : `${game.turn() === "w" ? "백" : "흑"}의 차례${check ? " · 체크" : ""}`);
    $("turn").dataset.phase = aiTurn()
      ? computing
        ? "search"
        : view?.ready
          ? "waiting"
          : "preparing"
      : "human";
    $("turn").dataset.human = human;
    $("turn").dataset.difficulty = difficulty;
    if (lastSearchMs !== null)
      $("turn").dataset.searchMs = String(lastSearchMs);
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
    $("move-count").textContent = `${state.moves.length}수`;
    $<HTMLButtonElement>("confirm").disabled =
      !canPlay() || !candidateMoves().length;
    $("confirm").textContent = target
      ? `${selected?.toUpperCase()} → ${target.toUpperCase()} 이동 확정`
      : selected
        ? "도착 칸을 선택하세요"
        : "기물을 선택하세요";
    $<HTMLButtonElement>("undo").disabled = !undoCount();
    $<HTMLButtonElement>("hint").disabled =
      hinting || !!state.outcome || aiTurn() || !view;
    $("hint").textContent = hinting ? "힌트 계산 중…" : "힌트";
    const currentClaim = claims(),
      planned = currentClaim.length
        ? []
        : candidateMoves().flatMap((m) => claims(action(m)));
    $<HTMLButtonElement>("chess-claim").disabled =
      !canPlay() || (!currentClaim.length && !planned.length);
    $("chess-claim-info").textContent = currentClaim.length
      ? `${currentClaim.join(" · ")} — 현재 위치로 청구 가능`
      : planned.length
        ? `${[...new Set(planned)].join(" · ")} — 선택한 예정 수를 선언하여 청구`
        : "3회 반복·50수는 청구, 5회 반복·75수는 자동 무승부입니다.";
    if (renderedHistory !== state) {
      renderedHistory = state;
      const captured = snapshot().captured;
      $("chess-captured").innerHTML = (["w", "b"] as Color[])
        .map(
          (c) =>
            `<div><small>${c === "w" ? "백" : "흑"}이 잡은 기물</small><span>${captured[c].map((p) => glyphs[other(c)][p]).join(" ") || "—"}</span></div>`,
        )
        .join("");
      $("chess-history").innerHTML = Array.from(
        { length: Math.ceil(moves.length / 2) },
        (_, i) =>
          `<li><span>${i + 1}.</span><span>${moves[i * 2].san}</span><span>${moves[i * 2 + 1]?.san ?? ""}</span></li>`,
      ).join("");
    }
    const king = check
      ? game
          .board()
          .flat()
          .find((p) => p?.type === "k" && p.color === game.turn())?.square
      : undefined;
    view?.highlights(
      selected,
      target,
      selected ? availableMoves(selected).map((m) => m.to) : [],
      last,
      king,
      cursor,
    );
  }
  function schedule() {
    if (!view || !aiTurn() || state.outcome || hidden || aiError) return;
    const current = generation,
      snapshot = state;
    later(async () => {
      if (current !== generation || state !== snapshot) return;
      if (
        !view?.ready ||
        view.animating ||
        document.querySelector("dialog[open]")
      ) {
        schedule();
        return;
      }
      computing = true;
      update();
      try {
        const r = await ai.compute(
          snapshot,
          difficulty,
          7 + snapshot.moves.length * 7919,
        );
        if (current !== generation || state !== snapshot || !view || !aiTurn())
          return;
        computing = false;
        lastSearchMs = r.stats.elapsedMs;
        const apply = () => {
          if (current !== generation || state !== snapshot || !view || hidden)
            return;
          if (view.animating || document.querySelector("dialog[open]")) {
            later(apply, 100);
            return;
          }
          const next = r.claim
            ? claimDraw(state, r.move ?? undefined)
            : r.move
              ? play(state, r.move)
              : null;
          if (!next) {
            aiError = "컴퓨터가 유효한 수를 반환하지 못했습니다.";
            update();
            return;
          }
          if (r.claim) {
            state = next;
            update();
            resultPending = true;
            later(result, 100);
          } else accept(next);
        };
        apply();
      } catch (e) {
        if (current !== generation || (e as Error).name === "AbortError")
          return;
        computing = false;
        aiError = (e as Error).message;
        update();
      }
    }, 200);
  }
  function configure() {
    pause();
    promoting = false;
    const d = dialog(
      "다음 체스 대국 설정",
      `<p>현재 대국의 난이도와 배정 색상은 유지됩니다. 다시 시작할 때 아래 설정을 적용합니다.</p><label class="setting">플레이 모드<select id="chess-next-mode"><option value="local" ${nextMode === "local" ? "selected" : ""}>로컬 2인</option><option value="ai" ${nextMode === "ai" ? "selected" : ""}>컴퓨터 대전</option></select></label>${optionsForm("chess-next")}`,
      [
        {
          text: "설정 적용",
          action: () => {},
        },
      ],
    );
    // modal removes the dialog before its action; capture form values while it exists.
    d.querySelector("button")!.onclick = () => {
      remember("chess-next");
      nextMode = $<HTMLSelectElement>("chess-next-mode").value as Mode;
      d.close();
      d.remove();
    };
    let resumed = false;
    const resume = () => {
      if (resumed) return;
      resumed = true;
      later(() => {
        update();
        if (state.outcome) result();
        else schedule();
      }, 0);
    };
    d.addEventListener("close", resume, { once: true });
    d.addEventListener("cancel", resume, { once: true });
    update();
  }
  function result() {
    if (!resultPending || !state.outcome) return;
    if (view?.animating || document.querySelector("dialog[open]")) {
      later(result, 100);
      return;
    }
    resultPending = false;
    dialog(
      state.outcome.winner
        ? `${state.outcome.winner === "w" ? "백" : "흑"}이 승리했습니다!`
        : "무승부입니다",
      `<p>${state.outcome.reason}<br>${state.moves.length}수의 대국을 마쳤습니다.</p>`,
      [
        { text: "게임판 보기", action: () => {} },
        { text: "다시 플레이", action: start },
      ],
    );
  }
  function rules() {
    dialog(
      "킹을 지키고, 체크메이트하세요",
      `<ol><li>백이 먼저 시작합니다. 자기 기물을 선택하고 합법적인 도착 칸으로 이동하세요.</li><li>자기 킹이 공격받는 체크를 반드시 해소해야 합니다. 킹을 잡는 대신 체크메이트로 승리합니다.</li><li>캐슬링은 킹·룩의 이동 이력과 공격받는 칸을 검사합니다. 앙파상은 직전 두 칸 전진한 폰에만 가능합니다.</li><li>마지막 줄에 도착한 폰은 퀸·룩·비숍·나이트로 프로모션합니다.</li><li>스테일메이트와 지원하는 기물 부족은 무승부입니다. 3회 반복·50수는 청구 버튼, 5회 반복·75수는 자동 종료입니다.</li></ol><p>도착 칸을 선택하면 그 예정 수로 가능한 무승부 청구도 안내합니다. 새로고침하면 대국과 체스 설정이 초기화됩니다.</p><p><b>무르기</b>는 직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다. <b>힌트</b>는 추천 수를 기물과 도착 칸 선택으로 보여 주며, 이동은 직접 확정합니다. 대국이 끝난 뒤에는 무를 수 없습니다.</p>`,
    );
  }
  const hide = (e: PageTransitionEvent) => {
      hidden = true;
      pause();
      if (!e.persisted) {
        view?.dispose();
        view = null;
        ownDialog?.remove();
      }
    },
    show = (e: PageTransitionEvent) => {
      if (e.persisted) {
        hidden = false;
        update();
        if (state.outcome) later(result, 100);
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
