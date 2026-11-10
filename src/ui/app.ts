import { mountReversi, type ReversiController } from "./reversi";
import { modal } from "./dialog";
import { games } from "../core/catalog";
import {
  load,
  save,
  getSettings,
  setSettings,
  type Mode,
  getAIOptions,
  setAIOptions,
} from "../core/storage";
import {
  createGame,
  play,
  type Point,
  type Player,
} from "../games/gomoku/rules";
import { AIClient } from "../games/gomoku/ai/client";
import {
  profiles,
  difficulties,
  type Difficulty,
  type ColorChoice,
} from "../games/gomoku/ai/difficulty";
import { BoardView } from "../engine/board-view";
import { Sound } from "../engine/sound";
const app = document.querySelector<HTMLDivElement>("#app")!;
let state = createGame(),
  mode: Mode = "local",
  settings = getSettings(),
  view: BoardView | null = null,
  candidate: Point | null = null,
  timer: ReturnType<typeof setTimeout> | null = null,
  resultTimer: ReturnType<typeof setTimeout> | null = null,
  lockedUntil = 0;
let reversi: ReversiController | null = null;
const ai = new AIClient();
let aiOptions = getAIOptions(),
  difficulty: Difficulty = aiOptions.difficulty,
  human: Player = 1;
let sessionGeneration = 0;
let aiError = "";
const isAITurn = () => mode === "ai" && state.turn !== human;
const persist = () => save({ state, mode, difficulty, human });
function newMatch() {
  // Keep the current selection even when browser storage is unavailable.
  difficulty = aiOptions.difficulty;
  human =
    aiOptions.color === "white"
      ? 2
      : aiOptions.color === "random"
        ? Math.random() < 0.5
          ? 1
          : 2
        : 1;
  state = createGame();
  lockedUntil = 0;
  persist();
}
function difficultyOptions(selected: Difficulty) {
  return difficulties
    .map(
      (d) =>
        `<option value="${d}" ${d === selected ? "selected" : ""}>${profiles[d].label}</option>`,
    )
    .join("");
}
function aiForm() {
  return `<div id="ai-options" class="ai-options" hidden><label>AI 난이도<select id="ai-difficulty">${difficultyOptions(aiOptions.difficulty)}</select></label><label>플레이어 색상<select id="ai-color"><option value="black" ${aiOptions.color === "black" ? "selected" : ""}>흑돌</option><option value="white" ${aiOptions.color === "white" ? "selected" : ""}>백돌</option><option value="random" ${aiOptions.color === "random" ? "selected" : ""}>무작위</option></select></label><small>선택한 설정은 새 대국부터 적용됩니다.</small></div>`;
}
const sound = new Sound();
sound.enabled = settings.sound;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
function header() {
  return `<header><button class="brand" id="home" aria-label="World Table Games 홈"><span class="brand-mark">W<span>✦</span></span><span>WORLD TABLE GAMES<small>PLAY A LITTLE. CONNECT A LOT.</small></span></button><button class="icon-button" id="settings" aria-label="설정">⚙</button></header>`;
}
function bindHeader() {
  $("home").onclick = menu;
  $("settings").onclick = showSettings;
}
function clear() {
  reversi?.dispose();
  reversi = null;
  sessionGeneration++;
  ai.cancel();
  if (timer) clearTimeout(timer);
  if (resultTimer) clearTimeout(resultTimer);
  timer = resultTimer = null;
  view?.dispose();
  view = null;
  candidate = null;
  aiError = "";
}
function menu() {
  clear();
  app.innerHTML =
    header() +
    `<main class="library"><div class="eyebrow">THE WORLD, AT YOUR TABLE</div><h1>함께 앉으면,<br>즐거움이 시작됩니다.</h1><p class="intro">오래도록 사랑받은 게임들, 새로운 테이블 위에서.<br>잠깐의 여유를 위한 당신만의 게임 컬렉션.</p><div class="collection-heading"><h2>게임 컬렉션 <span>02 / 05</span></h2><div class="filters" role="group" aria-label="게임 카테고리">${["전체", "보드게임", "카드게임", "주사위게임"].map((x, i) => `<button class="filter ${i === 0 ? "active" : ""}" data-category="${x}" aria-pressed="${i === 0}">${x}</button>`).join("")}</div></div><div class="collection"><section class="featured" data-category="보드게임"><div class="feature-copy"><div class="pill">지금 플레이 가능</div><span class="game-number">NO. 01 — STRATEGY</span><h2>오목 <span>Gomoku</span></h2><p>다섯 개의 돌, 무한한 가능성.<br>단순한 규칙 속 깊은 한 수를 만나보세요.</p><div class="game-meta">2인 · 약 10분 · 전략 보드게임</div><div class="mode-select"><label><input type="radio" name="mode" value="local" checked> 로컬 2인</label><label><input type="radio" name="mode" value="ai"> 컴퓨터 대전</label></div>${aiForm()}<button class="primary" id="start">테이블에 앉기 <span>↗</span></button>${load() ? '<button class="text-button" id="resume">저장한 게임 이어하기 →</button>' : ""}</div><div class="feature-art" aria-label="나무 오목판 미리보기"><div class="mini-board"><div class="mini-grid">${[35, 36, 37, 48, 49, 61, 62, 73].map((n, i) => `<i style="--r:${Math.floor(n / 11)};--c:${n % 11}" class="${i % 2 ? "white" : "black"}"></i>`).join("")}</div></div><span>한 수에 담긴 작은 여행</span></div></section><div class="upcoming">${games
      .slice(1)
      .map(
        (g, i) =>
          `<article class="soon-card" data-category="${g.category}"><div class="game-icon icon-${i}">${g.icon}</div><div><small>NO. 0${i + 2} / ${g.en}</small><h3>${g.name}</h3><span>${g.category}</span></div>${g.available ? '<button id="reversi-menu" class="available-button">리버시 플레이</button>' : "<button disabled>개발 예정</button>"}</article>`,
      )
      .join(
        "",
      )}</div></div><footer><span>✦ &nbsp; EVERY GAME TELLS A STORY.</span><span>설치 없이, 함께 즐기는 세계의 게임</span></footer></main>`;
  bindHeader();
  $("reversi-menu").onclick = () => {
    clear();
    reversi = mountReversi(app, { header, bindHeader, back: menu, settings });
  };
  const rememberAI = () => {
    aiOptions = {
      difficulty: $<HTMLSelectElement>("ai-difficulty").value as Difficulty,
      color: $<HTMLSelectElement>("ai-color").value as ColorChoice,
    };
    setAIOptions(aiOptions);
  };
  $("ai-difficulty").onchange = rememberAI;
  $("ai-color").onchange = rememberAI;
  document.querySelectorAll<HTMLInputElement>("input[name=mode]").forEach(
    (input) =>
      (input.onchange = () => {
        $("ai-options").hidden =
          document.querySelector<HTMLInputElement>("input[name=mode]:checked")!
            .value !== "ai";
      }),
  );
  $("start").onclick = () => {
    mode = document.querySelector<HTMLInputElement>("input[name=mode]:checked")!
      .value as Mode;
    newMatch();
    game();
  };
  if (document.getElementById("resume"))
    $("resume").onclick = () => {
      const session = load();
      if (session) {
        state = session.state;
        mode = session.mode;
        difficulty = session.difficulty ?? "normal";
        human = session.human ?? 1;
        game();
      }
    };
  document.querySelectorAll<HTMLButtonElement>(".filter").forEach(
    (b) =>
      (b.onclick = () => {
        document.querySelectorAll(".filter").forEach((x) => {
          x.classList.toggle("active", x === b);
          x.setAttribute("aria-pressed", String(x === b));
        });
        document
          .querySelectorAll<HTMLElement>(".collection [data-category]")
          .forEach(
            (x) =>
              (x.hidden =
                b.dataset.category !== "전체" &&
                x.dataset.category !== b.dataset.category),
          );
      }),
  );
}
function game() {
  clear();
  app.innerHTML =
    header() +
    `<main class="game-layout"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>오목 <small>GOMOKU</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="camera" aria-pressed="${settings.top}">시점 전환</button><button id="restart">다시 시작</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE GOMOKU TABLE</span><span>15 × 15 · 자유룰</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar"><div class="eyebrow">AT THE TABLE</div><h2>좋은 한 수를<br>생각해 보세요.</h2><div id="turn" role="status" aria-live="polite"></div><div class="player"><i class="stone black"></i><span>흑돌<small>${mode === "ai" ? (human === 1 ? "나" : `컴퓨터 · ${profiles[difficulty].label}`) : "플레이어 1"}</small></span><b>선공</b></div><div class="player"><i class="stone white"></i><span>백돌<small>${mode === "ai" ? (human === 2 ? "나" : `컴퓨터 · ${profiles[difficulty].label}`) : "플레이어 2"}</small></span></div><p class="hint">가로, 세로, 대각선으로<br>다섯 개의 돌을 먼저 연결하세요.</p><button id="confirm" class="primary" disabled>위치를 선택하세요</button><p class="input-help">마우스: 교차점을 클릭하여 착수<br>터치: 위치 선택 후 버튼으로 확정<br>키보드: 방향키로 선택, Enter로 착수</p><span id="save-status" class="save-status"></span></aside></div></main>`;
  bindHeader();
  $("back").onclick = menu;
  $("rules").onclick = showRules;
  $("restart").onclick = () =>
    modal("새로운 게임을 시작할까요?", "현재 게임은 새 게임으로 교체됩니다.", [
      { text: "계속하기", action: () => {} },
      { text: "새 게임", action: restart },
    ]);
  $("camera").onclick = () => {
    settings.top = !settings.top;
    setSettings(settings);
    view?.setCamera(settings.top);
    $("camera").setAttribute("aria-pressed", String(settings.top));
    candidate = null;
    update();
  };
  $("confirm").onclick = () => {
    if (candidate) place(candidate);
  };
  try {
    view = new BoardView($("board"), settings.quality);
    view.onContact = () => sound.tap();
    view.onSelect = (p, confirm) => {
      if (!p || !canPlay() || state.board[p.row][p.col]) {
        view?.preview(null, state.turn);
        candidate = null;
        update();
        return;
      }
      candidate = p;
      view?.preview(p, state.turn);
      update();
      if (confirm) place(p);
    };
    view.renderState(state, false);
    if (settings.top) view.setCamera(true);
    const canvas = view.renderer.domElement;
    canvas.tabIndex = 0;
    canvas.addEventListener("keydown", (e) => {
      if (!canPlay()) return;
      const p = candidate ?? { row: 7, col: 7 };
      const directions: Record<string, [number, number]> = {
        ArrowUp: [-1, 0],
        ArrowDown: [1, 0],
        ArrowLeft: [0, -1],
        ArrowRight: [0, 1],
      };
      if (directions[e.key]) {
        e.preventDefault();
        const [r, c] = directions[e.key];
        candidate = {
          row: Math.max(0, Math.min(14, p.row + r)),
          col: Math.max(0, Math.min(14, p.col + c)),
        };
        view?.preview(candidate, state.turn);
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
      '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 최신 브라우저에서 하드웨어 가속을 켜고 다시 시도해 주세요.</p></div>';
  }
  update();
  scheduleAI();
  if (state.winner) showResult();
}
function canPlay() {
  return (
    view !== null &&
    !view.moving &&
    state.winner === null &&
    performance.now() >= lockedUntil &&
    !isAITurn() &&
    !document.querySelector("dialog[open]")
  );
}
function place(p: Point) {
  if (!canPlay()) return;
  sound.unlock();
  const next = play(state, p);
  if (next) accept(next);
}
function accept(next: typeof state) {
  state = next;
  aiError = "";
  candidate = null;
  lockedUntil = performance.now() + 320;
  const saved = persist();
  view?.renderState(state);
  update();
  $("save-status").textContent = saved
    ? "✓ 이 기기에 자동 저장됨"
    : "저장을 사용할 수 없습니다";
  if (state.winner) resultTimer = setTimeout(showResult, 850);
  else scheduleAI();
}
function scheduleAI() {
  if (!isAITurn() || state.winner || !view) return;
  const generation = sessionGeneration,
    snapshot = state;
  timer = setTimeout(async () => {
    if (generation !== sessionGeneration) return;
    if (document.querySelector("dialog[open]") || !view?.ready || view.moving) {
      scheduleAI();
      return;
    }
    try {
      const result = await ai.compute(
        snapshot,
        difficulty,
        1 + snapshot.moves.length * 7919,
      );
      if (
        generation !== sessionGeneration ||
        state !== snapshot ||
        !view ||
        !isAITurn()
      )
        return;
      const submit = () => {
        if (generation !== sessionGeneration || state !== snapshot || !view)
          return;
        if (document.querySelector("dialog[open]") || view.moving) {
          timer = setTimeout(submit, 100);
          return;
        }
        const next = result.move && play(state, result.move);
        if (next) accept(next);
        else showAIError("컴퓨터가 유효한 수를 반환하지 못했습니다.");
      };
      submit();
    } catch (error) {
      if (
        generation !== sessionGeneration ||
        (error as Error).name === "AbortError"
      )
        return;
      showAIError((error as Error).message);
    }
  }, 350);
}
function showAIError(message: string) {
  aiError = message;
  update();
}
window.addEventListener("pagehide", () => {
  sessionGeneration++;
  ai.cancel();
  if (timer) clearTimeout(timer);
  if (resultTimer) clearTimeout(resultTimer);
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && view) scheduleAI();
});

function update() {
  if (!document.getElementById("turn")) return;
  $("turn").innerHTML =
    `<i class="stone ${state.turn === 1 ? "black" : "white"}"></i><span>${state.winner ? (state.winner === "draw" ? "무승부" : `${state.winner === 1 ? "흑" : "백"}돌 승리`) : isAITurn() ? "컴퓨터가 생각 중…" : `${state.turn === 1 ? "흑" : "백"}돌의 차례입니다`}</span>`;
  if (aiError && !state.winner) {
    $("turn").textContent = aiError;
    const retry = document.createElement("button");
    retry.textContent = "AI 다시 시도";
    retry.onclick = () => {
      aiError = "";
      update();
      scheduleAI();
    };
    $("turn").append(retry);
  }
  $("move-count").textContent = `${state.moves.length}수`;
  $<HTMLButtonElement>("confirm").disabled =
    !candidate ||
    !!state.winner ||
    isAITurn() ||
    !!(candidate && state.board[candidate.row][candidate.col]);
  $("confirm").textContent = candidate
    ? `${String.fromCharCode(65 + candidate.col)}${candidate.row + 1}에 착수 확정`
    : "위치를 선택하세요";
}
function restart() {
  newMatch();
  game();
}
function showResult() {
  if (!state.winner || !view) return;
  if (view.animating || document.querySelector("dialog[open]")) {
    resultTimer = setTimeout(showResult, 100);
    return;
  }
  modal(
    state.winner === "draw"
      ? "멋진 승부, 무승부!"
      : `${state.winner === 1 ? "흑돌" : "백돌"}이 승리했습니다!`,
    `<p>${state.moves.length}수의 이야기가 완성되었습니다.<br>테이블에서 한 판 더 만나볼까요?</p>`,
    [
      { text: "게임판 보기", action: () => {} },
      { text: "다시 플레이", action: restart },
    ],
  );
}
function showRules() {
  modal(
    "다섯 개를 연결하세요",
    `<ol><li>흑돌이 먼저 시작합니다. 빈 교차점에 번갈아 돌을 놓으세요.</li><li>가로·세로·대각선으로 5개 이상 연결하면 승리합니다.</li><li>금수 없는 자유룰입니다. 모든 자리가 차면 무승부입니다.</li></ol><p><b>처음이라면</b> 중앙에서 시작해 보세요. 내 돌을 연결하면서 상대의 열린 네 개를 막는 것이 중요합니다.</p><p>PC는 클릭, 모바일은 터치·드래그로 위치를 고른 다음 <b>착수 확정</b>을 누르세요. 시점 전환 중에는 착수할 수 없습니다.</p>`,
  );
}
function showSettings() {
  modal(
    "나만의 테이블",
    `<label class="setting">착수 효과음<input id="sound-setting" type="checkbox" ${settings.sound ? "checked" : ""}></label><label class="setting">렌더링 품질<select id="quality-setting"><option value="high" ${settings.quality === "high" ? "selected" : ""}>높음 (최대 2×)</option><option value="low" ${settings.quality === "low" ? "selected" : ""}>절전 (1×)</option></select></label>`,
    [{ text: "설정 저장", action: () => {} }],
  );
  const d = document.querySelector("dialog")!;
  d.querySelector("button")!.onclick = () => {
    settings.sound = $<HTMLInputElement>("sound-setting").checked;
    settings.quality = $<HTMLSelectElement>("quality-setting").value as
      "high" | "low";
    sound.enabled = settings.sound;
    setSettings(settings);
    view?.setQuality(settings.quality);
    reversi?.setSettings(settings);
    d.close();
    d.remove();
  };
}
menu();
