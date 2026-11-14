import { mirrorStatus, shout } from "./banner";
import { dress, resultArt } from "./chrome";
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
import { TURN_DELAY_MS } from "../engine/camera";
import { ChessView } from "../games/chess/view";
import { Sound } from "../engine/sound";
import { modal, setupDialog } from "./dialog";
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
  function pause() {
    generation++;
    ai.cancel();
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
  function setup(host = nav.setupHost) {
    host.innerHTML = `<section class="featured"><div class="feature-copy"><span class="game-number">NO. 03 — THINK AHEAD</span><h2>체스 <span>Chess</span></h2><p>한 수 앞에서, 더 먼 가능성으로.<br>여섯 가지 기물로 나만의 전략을 펼쳐보세요.</p><div class="game-meta">2인 · 8×8 보드 · 백 선공</div><div class="mode-select"><label><input type="radio" name="chess-mode" value="local" checked> 로컬 2인</label><label><input type="radio" name="chess-mode" value="ai"> 컴퓨터 대전</label></div><div id="chess-options" hidden>${optionsForm("chess")}</div><button id="chess-start" class="primary">테이블에 앉기 <span>↗</span></button></div><div class="feature-art chess-art" role="img" aria-label="체스판 미리보기"><div class="chess-mini">${Array.from({ length: 64 }, (_, i) => `<i>${i === 27 ? "♞︎" : i === 35 ? "♔︎" : i === 44 ? "♟︎" : ""}</i>`).join("")}</div><span>EVERY MOVE OPENS A WORLD</span></div></section>`;
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
    // From the table, the panel opens on the mode being played.
    document.querySelectorAll<HTMLInputElement>("input[name=chess-mode]").forEach((input) => {
      input.checked = input.value === nextMode;
    });
    $("chess-options").hidden = nextMode !== "ai";
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
      `<main class="game-layout chess-game"><div class="game-top"><div><button id="back" class="text-button">← 컬렉션</button><h1>체스 <small>CHESS</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="camera" aria-pressed="false">시점 전환</button><button id="chess-flip">보드 방향 전환</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE CHESS TABLE</span><span>8 × 8 · 백 선공</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar"><div id="turn" role="status" aria-live="polite"></div>${(["w", "b"] as const).map((c) => `<div class="player"><i class="chess-glyph">${glyphs[c].k}</i><span>${c === "w" ? "백" : "흑"}<small>${mode === "local" ? `플레이어 ${c === "w" ? 1 : 2}` : human === c ? "나" : `컴퓨터 · ${difficultyLabels[difficulty]}`}</small></span></div>`).join("")}<div id="chess-captured" class="chess-captured"></div><div class="chess-confirm-slot sr-only"><button id="confirm" class="primary" disabled>기물을 선택하세요</button></div><div class="assist"><button id="undo">무르기</button></div><button id="chess-claim" disabled>무승부 청구</button><p id="chess-claim-info" class="input-help"></p><p class="input-help">마우스: 기물 선택 후 도착 칸 클릭<br>터치: 기물을 누른 뒤 도착 칸을 누르면 이동<br>키보드: 방향키·Enter, Escape 취소<br>예정 수 청구: 기물 선택 후 방향키로 도착 칸 미리보기</p></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    dress(setup, [".assist", "#chess-claim"]);
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
    $("chess-claim").onclick = claim;
    $("undo").onclick = takeBack;
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
  /** Whether the press under way began on the piece already chosen; undefined when no press came first (the keyboard). */
  let armed: boolean | undefined;
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
      // The piece already picked up, pressed again, is put back. A press reports the square twice
      // (down, then up): only a press that began on the piece already chosen lets go of it.
      if (!commit) armed = square === selected;
      else {
        const again = square === selected && armed !== false;
        armed = undefined;
        if (again) {
          clearSelection();
          return;
        }
      }
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
    faceMover();
    update();
    schedule();
  }
  /** Two players at one screen: the table turns to whoever is to move. */
  function faceMover(delay = 0) {
    if (mode !== "local" || state.outcome || !view) return;
    const mover = engine().turn();
    if (mover === facing) return;
    facing = mover;
    view.setCamera(facing, top, delay);
  }
  function accept(next: State) {
    state = next;
    selected = target = cursor = null;
    aiError = "";
    const game = engine(),
      last = snapshot().moves.at(-1);
    view?.render(game, last);
    faceMover(TURN_DELAY_MS);
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
    // The status is read on the table itself: the panel's copy is not shown.
    mirrorStatus();
    if (disposed || !document.getElementById("chess-captured")) return;
    const game = engine(),
      moves = snapshot().moves,
      last = moves.at(-1),
      check = game.isCheck();
    // A check is told once, large, when the position comes up.
    if (check && !state.outcome && $("board").dataset.checked !== String(moves.length)) {
      $("board").dataset.checked = String(moves.length);
      shout("체크");
    }
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
    // Enabled again by onSettled once the pieces stop moving.
    $<HTMLButtonElement>("undo").disabled = !undoCount() || !!view?.animating;
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
      `${resultArt(!state.outcome.winner ? "draw" : mode === "ai" && state.outcome.winner !== human ? "lose" : "win")}<p>${state.outcome.reason}<br>${state.moves.length}수의 대국을 마쳤습니다.</p>`,
      [
        { text: "게임판 보기", action: () => {} },
        { text: "새 게임", action: () => setupDialog(setup) },
      ],
    );
  }
  function rules() {
    dialog(
      "킹을 지키고, 체크메이트하세요",
      `<h3>기본 규칙</h3><ol><li>백이 먼저 두고, 한 번에 기물 하나씩 번갈아 움직입니다. 자기 기물이 있는 칸으로는 갈 수 없고, 상대 기물이 있는 칸으로 가면 그 기물을 잡습니다.</li><li>상대 킹을 피할 수 없게 공격하는 <b>체크메이트</b>를 만들면 이깁니다. 킹은 실제로 잡지 않습니다.</li></ol><h3>기물별 이동</h3><dl class="piece-moves"><dt>킹 ♔</dt><dd>가로·세로·대각선 어느 방향으로든 한 칸. 공격받는 칸으로는 갈 수 없습니다.</dd><dt>퀸 ♕</dt><dd>가로·세로·대각선으로 원하는 만큼. 다른 기물을 넘을 수 없습니다.</dd><dt>룩 ♖</dt><dd>가로·세로로 원하는 만큼. 다른 기물을 넘을 수 없습니다.</dd><dt>비숍 ♗</dt><dd>대각선으로 원하는 만큼. 처음 선 칸의 색을 벗어나지 못합니다.</dd><dt>나이트 ♘</dt><dd>한 방향으로 두 칸 간 뒤 옆으로 한 칸(L자). 다른 기물을 뛰어넘는 유일한 기물입니다.</dd><dt>폰 ♙</dt><dd>앞으로 한 칸, 처음 움직일 때만 두 칸까지. 앞이 막히면 못 갑니다. 잡을 때만 대각선 앞 한 칸으로 갑니다. 뒤로는 못 갑니다.</dd></dl><h3>체크와 체크메이트</h3><dl class="piece-moves"><dt>체크</dt><dd>킹이 다음 수에 잡힐 위치에 놓인 상태입니다. 반드시 바로 벗어나야 합니다. 방법은 세 가지입니다: 킹을 안전한 칸으로 옮기기, 공격하는 기물을 잡기, 공격 길 사이에 기물을 놓아 막기(나이트의 공격은 막을 수 없습니다).</dd><dt>체크메이트</dt><dd>체크를 벗어날 방법이 하나도 없으면 체크메이트로 집니다.</dd><dt>금지된 수</dt><dd>자기 킹이 체크에 놓이게 되는 수는 둘 수 없습니다. 그래서 킹 앞을 지키는 기물은 움직이지 못할 수 있습니다(핀).</dd></dl><h3>특수 규칙</h3><dl class="piece-moves"><dt>캐슬링</dt><dd>킹과 룩을 한 수에 함께 움직여 킹을 안전하게 숨기는 수입니다. 킹을 룩 쪽으로 두 칸 옮기면 룩이 킹을 넘어 바로 옆 칸에 놓입니다. 킹 쪽(짧은 캐슬링)과 퀸 쪽(긴 캐슬링) 둘 다 가능합니다.<br><b>조건</b> ① 그 킹과 그 룩이 한 번도 움직인 적이 없을 것 ② 킹과 룩 사이에 기물이 없을 것 ③ 킹이 지금 체크가 아닐 것 ④ 킹이 지나가는 칸과 도착하는 칸이 공격받지 않을 것. 룩만 공격받거나 룩이 지나는 칸이 공격받는 것은 괜찮습니다.<br><b>두는 법</b> 킹을 고른 뒤 두 칸 옆의 도착 칸을 누릅니다.</dd><dt>앙파상</dt><dd>상대 폰이 처음 자리에서 두 칸 전진해 내 폰 바로 옆에 섰을 때, 그 폰이 한 칸만 온 것처럼 대각선 뒤 칸으로 가면서 잡는 수입니다. 잡힌 폰은 내 폰이 도착한 칸이 아니라 옆 칸에서 사라집니다.<br><b>조건</b> 상대가 두 칸 전진한 <b>바로 다음 수</b>에만 가능합니다. 한 수라도 지나면 권리가 없어집니다. 폰만 폰을 이렇게 잡을 수 있습니다.</dd><dt>프로모션(승급)</dt><dd>폰이 맨 끝 줄에 도착하면 반드시 퀸·룩·비숍·나이트 중 하나로 바꿉니다. 이미 가진 기물과 상관없이 고를 수 있어 퀸이 둘 이상이 될 수도 있습니다. 대부분 퀸을 고르지만, 나이트가 체크를 만들거나 스테일메이트를 피할 때는 다른 기물이 더 좋습니다.</dd></dl><h3>무승부</h3><dl class="piece-moves"><dt>스테일메이트</dt><dd>둘 차례인 쪽이 체크는 아닌데 둘 수 있는 수가 하나도 없으면 무승부입니다. 이기고 있을 때 상대의 수를 모두 막지 않도록 조심하세요.</dd><dt>기물 부족</dt><dd>어느 쪽도 체크메이트를 만들 수 없는 기물만 남으면 무승부입니다. 예: 킹 대 킹, 킹과 비숍 대 킹, 킹과 나이트 대 킹.</dd><dt>3회 반복</dt><dd>같은 사람의 차례에 같은 배치가 세 번 나오면 <b>무승부 청구</b> 버튼으로 무승부를 청구할 수 있습니다. 다섯 번 나오면 자동으로 무승부입니다.</dd><dt>50수 규칙</dt><dd>양쪽 합쳐 50수씩(100번의 이동) 동안 폰이 움직이지 않고 잡힌 기물도 없으면 무승부를 청구할 수 있습니다. 75수가 되면 자동으로 무승부입니다.</dd></dl><h3>기물의 가치(참고)</h3><p>폰 1 · 나이트 3 · 비숍 3 · 룩 5 · 퀸 9. 맞바꿀 때 어림하는 값이며 규칙은 아닙니다.</p><h3>조작</h3><dl class="piece-moves"><dt>마우스</dt><dd>기물을 누른 뒤 도착 칸을 클릭</dd><dt>터치</dt><dd>기물을 누른 뒤 도착 칸을 누르면 바로 이동</dd><dt>키보드</dt><dd>방향키로 이동, Enter로 선택·확정, Escape로 취소</dd><dt>프로모션</dt><dd>폰이 끝줄에 닿으면 바꿀 기물을 고르는 창이 뜹니다.</dd></dl><h3>버튼</h3><dl class="piece-moves"><dt>무르기</dt><dd>직전 수를 되돌립니다. 컴퓨터 대전에서는 내 차례로 돌아갑니다. 대국이 끝난 뒤에는 쓸 수 없습니다.</dd><dt>무승부 청구</dt><dd>3회 반복이나 50수 규칙이 성립할 때 켜집니다. 도착 칸을 선택하면 그 예정 수로 가능한 청구도 안내합니다.</dd><dt>선택 취소</dt><dd>고른 기물을 내려놓습니다.</dd><dt>새 게임</dt><dd>설정 창이 뜹니다. 대전 방식·난이도·색상을 고르고 새로 시작합니다.</dd><dt>시점 전환</dt><dd>비스듬한 시점과 위에서 내려다보는 시점을 바꿉니다.</dd><dt>보드 방향 전환</dt><dd>판을 반대편에서 보도록 돌립니다.</dd></dl><h3>그 밖에</h3><ul><li>로컬 2인에서는 둘 차례인 쪽으로 판이 돌아갑니다.</li><li>대국은 저장되지 않습니다. 새로고침하면 대국과 체스 설정이 초기화됩니다.</li></ul>`,
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
