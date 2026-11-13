import { mirrorStatus } from "./banner";
import { dress, resultArt } from "./chrome";
import { mountChess, type ChessController } from "./chess";
import { mountBlackjack, type BlackjackController } from "./blackjack";
import { mountYacht, type YachtController, type YachtOptions } from "./yacht";
import { mountYut, type YutController, type YutOptions } from "./yut";
import { mountPointGame, type PointController, type PointOptions } from "./point-game";
import { hexaConfig } from "../games/hexa/config";
import { morrisConfig } from "../games/morris/config";
import { gonuConfig } from "../games/gonu/config";
import { checkersConfig } from "../games/checkers/config";
import { dotsConfig } from "../games/dots/config";
import { hexConfig } from "../games/hex/config";
import { mancalaConfig } from "../games/mancala/config";
import { snakesConfig } from "../games/snakes/config";
import { seaBattleConfig } from "../games/seabattle/config";
import { fourRowConfig } from "../games/fourrow/config";
import { twistConfig } from "../games/twist/config";
import { hareConfig } from "../games/hare/config";
import { hitBlowConfig } from "../games/hitblow/config";
import { wallRaceConfig } from "../games/wallrace/config";
import { dominoConfig } from "../games/domino/config";
import { alkkagiConfig } from "../games/alkkagi/config";
import { carromConfig } from "../games/carrom/config";
import { tileRummyConfig } from "../games/tilerummy/config";
import { starHopConfig } from "../games/starhop/config";
import { ludoConfig } from "../games/ludo/config";
import { poolConfig } from "../games/pool/config";
import { indianConfig } from "../games/indian/config";
import { foosballConfig } from "../games/foosball/config";
import { blocksConfig } from "../games/blocks/config";
import { mergeConfig } from "../games/merge/config";
import { bricksConfig } from "../games/bricks/config";
import { pegConfig } from "../games/peg/config";
import type { PointConfig } from "./point-game";
import { thumb } from "./thumbs";
import { mountSpider, type SpiderController, type SpiderOptions } from "./spider";
import { mountTour, type TourController, type TourOptions } from "./tour";
import {
  mountBettingGame,
  type BettingController,
  type BettingOptions,
} from "./betting-game";
import { seotdaConfig } from "../games/seotda/skin";
import { pokerConfig } from "../games/poker/skin";
import { mountJanggi, type JanggiController, type JanggiOptions } from "./janggi";
import { mountReversi, type ReversiController } from "./reversi";
import { getOptions as getReversiOptions, setOptions as setReversiOptions } from "../games/reversi/storage";
import { modal, setupDialog } from "./dialog";
import { games } from "../core/catalog";
import {
  getSettings,
  setSettings,
  type Mode,
  getAIOptions,
  setAIOptions,
  getStats,
  addResult,
  type Record as Tally,
} from "../core/storage";
import {
  createGame,
  play,
  undo,
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
let resultPending = false;
let reversi: ReversiController | null = null;
let chess: ChessController | null = null;
let blackjack: BlackjackController | null = null;
let yacht: YachtController | null = null;
let betting: BettingController | null = null;
let janggi: JanggiController | null = null;
let janggiOptions: JanggiOptions = {
  mode: "local",
  difficulty: "normal",
  color: "black",
  formation: "NENE",
  rivalFormation: "NENE",
};
// Kept for this page only, per betting game.
const bettingOptions: Record<string, BettingOptions> = {
  seotda: { opponents: 2, variant: "two" },
  "seven-poker": { opponents: 3 },
};
// Kept for this page only, like the chess preferences.
let yachtOptions: YachtOptions = { mode: "solo" };
let yut: YutController | null = null;
let yutOptions: YutOptions = { mode: "ai", players: 2, names: [] };
let points: PointController | null = null;
let spider: SpiderController | null = null;
let spiderOptions: SpiderOptions = { suits: "1" };
let tour: TourController | null = null;
let tourOptions: TourOptions = { opponents: 1, humans: 1, names: [] };
/** The games that share the point-board screen, and what was last chosen for each. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pointGames: Record<string, { config: PointConfig<any>; options: PointOptions }> = {
  "hexa-germ-war": { config: hexaConfig, options: { mode: "ai", variant: "classic", level: "normal" } },
  "nine-men's-morris": { config: morrisConfig, options: { mode: "ai", variant: "", level: "normal" } },
  gonu: { config: gonuConfig, options: { mode: "ai", variant: "well", level: "normal" } },
  checkers: { config: checkersConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "dots-and-boxes": { config: dotsConfig, options: { mode: "ai", variant: "5", level: "normal" } },
  hex: { config: hexConfig, options: { mode: "ai", variant: "9", level: "normal" } },
  mancala: { config: mancalaConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "snakes-and-ladders": { config: snakesConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "battleship": { config: seaBattleConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "four-in-a-row": { config: fourRowConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "twist-five": { config: twistConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "hare-and-hounds": { config: hareConfig, options: { mode: "ai", variant: "hounds", level: "normal" } },
  "number-baseball": { config: hitBlowConfig, options: { mode: "ai", variant: "3", level: "normal" } },
  "wall-race": { config: wallRaceConfig, options: { mode: "ai", variant: "", level: "normal" } },
  dominoes: { config: dominoConfig, options: { mode: "ai", variant: "", level: "normal" } },
  alkkagi: { config: alkkagiConfig, options: { mode: "ai", variant: "go-5", level: "normal" } },
  carrom: { config: carromConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "tile-rummy": { config: tileRummyConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "chinese-checkers": { config: starHopConfig, options: { mode: "ai", variant: "", level: "normal" } },
  ludo: { config: ludoConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "pocket-ball": { config: poolConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "indian-poker": { config: indianConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "table-soccer": { config: foosballConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "falling-blocks": { config: blocksConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "2048": { config: mergeConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "brick-breaker": { config: bricksConfig, options: { mode: "ai", variant: "", level: "normal" } },
  "peg-solitaire": { config: pegConfig, options: { mode: "ai", variant: "full", level: "normal" } },
};
let chessOptions = { difficulty: "normal", color: "white" } as import("../core/ai").AIOptions;
const ai = new AIClient();
/** Whether a stone may make two open threes at once (삼삼); kept for this page only. */
let allowDoubleThree = true;
/** Why the last point chosen was refused, shown until the next choice. */
let refusal = "";
const tally = (t: Tally) => `${t.win}승 ${t.loss}패 ${t.draw}무`;
let reversiOptions = getReversiOptions();
let aiOptions = getAIOptions(),
  difficulty: Difficulty = aiOptions.difficulty,
  human: Player = 1;
let sessionGeneration = 0;
let aiError = "";
const isAITurn = () => mode === "ai" && state.turn !== human;
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
  state = createGame(!allowDoubleThree);
  lockedUntil = 0;
  refusal = "";
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
  return `<div id="ai-options" class="ai-options" ${mode === "ai" ? "" : "hidden"}><label>AI 난이도<select id="ai-difficulty">${difficultyOptions(aiOptions.difficulty)}</select></label><label>플레이어 색상<select id="ai-color"><option value="black" ${aiOptions.color === "black" ? "selected" : ""}>흑돌</option><option value="white" ${aiOptions.color === "white" ? "selected" : ""}>백돌</option><option value="random" ${aiOptions.color === "random" ? "selected" : ""}>무작위</option></select></label><small>선택한 설정은 새 대국부터 적용됩니다.</small><small id="ai-stats" class="stats"></small></div>`;
}
const sound = new Sound();
sound.enabled = settings.sound;
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
function header() {
  return `<header><button class="brand" id="home" aria-label="World Table Games 홈"><span class="brand-mark" aria-hidden="true"><i></i><i></i></span><span class="brand-name">World Table Games<small>세계의 게임, 한 테이블에서</small></span></button><button class="icon-button" id="settings" aria-label="설정"><span aria-hidden="true">⚙</span></button></header>`;
}
function bindHeader() {
  $("home").onclick = () => menu();
  $("settings").onclick = showSettings;
}
function clear() {
  janggi?.dispose();
  janggi = null;
  betting?.dispose();
  betting = null;
  yacht?.dispose();
  yacht = null;
  yut?.dispose();
  yut = null;
  points?.dispose();
  points = null;
  spider?.dispose();
  spider = null;
  tour?.dispose();
  tour = null;
  blackjack?.dispose();
  blackjack = null;
  chess?.dispose();
  chess = null;
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
  resultPending = false;
}
type GameSelection =
  | "gomoku"
  | "reversi"
  | "chess"
  | "blackjack"
  | "yacht-dice"
  | "seotda"
  | "seven-poker"
  | "janggi"
  | "yut-nori"
  | "hexa-germ-war"
  | "nine-men's-morris"
  | "gonu"
  | "checkers"
  | "dots-and-boxes"
  | "hex"
  | "mancala"
  | "snakes-and-ladders"
  | "spider"
  | "world-tour"
  | "battleship"
  | "four-in-a-row"
  | "twist-five"
  | "hare-and-hounds"
  | "number-baseball"
  | "wall-race"
  | "dominoes"
  | "alkkagi"
  | "carrom"
  | "tile-rummy"
  | "chinese-checkers"
  | "ludo"
  | "pocket-ball"
  | "indian-poker"
  | "table-soccer"
  | "falling-blocks"
  | "2048"
  | "brick-breaker"
  | "peg-solitaire"
  | null;
function gomokuSetup() {
  return `<section class="featured"><div class="feature-copy"><span class="game-number">NO. 01 — STRATEGY</span><h2>오목 <span>Gomoku</span></h2><p>다섯 개의 돌, 무한한 가능성.<br>단순한 규칙 속 깊은 한 수를 만나보세요.</p><div class="game-meta">2인 · 약 10분 · 전략 보드게임</div><div class="mode-select"><label><input type="radio" name="mode" value="local" ${mode === "local" ? "checked" : ""}> 로컬 2인</label><label><input type="radio" name="mode" value="ai" ${mode === "ai" ? "checked" : ""}> 컴퓨터 대전</label></div>${aiForm()}<label class="rule-option"><input type="checkbox" id="allow-33" ${allowDoubleThree ? "checked" : ""}> 삼삼(3-3) 허용<small>끄면 열린 삼을 한 번에 두 개 만드는 수를 둘 수 없습니다.</small></label><button class="primary" id="start">테이블에 앉기 <span>↗</span></button></div><div class="feature-art" role="img" aria-label="나무 오목판 미리보기"><div class="mini-board"><div class="mini-grid">${[35, 36, 37, 48, 49, 61, 62, 73].map((n, i) => `<i style="--r:${Math.floor(n / 11)};--c:${n % 11}" class="${i % 2 ? "white" : "black"}"></i>`).join("")}</div></div><span>한 수에 담긴 작은 여행</span></div></section>`;
}
/** Wires the gomoku setup panel, in the collection or in the new-game dialog. */
function bindGomokuSetup() {
  const rememberAI = () => {
    aiOptions = {
      difficulty: $<HTMLSelectElement>("ai-difficulty").value as Difficulty,
      color: $<HTMLSelectElement>("ai-color").value as ColorChoice,
    };
    setAIOptions(aiOptions);
  };
  const showStats = () => {
    const d = $<HTMLSelectElement>("ai-difficulty").value as Difficulty;
    $("ai-stats").textContent = `${profiles[d].label} 전적 · ${tally(getStats()[d])}`;
  };
  showStats();
  $("ai-difficulty").onchange = () => {
    rememberAI();
    showStats();
  };
  $("ai-color").onchange = rememberAI;
  document.querySelectorAll<HTMLInputElement>("input[name=mode]").forEach((input) =>
    (input.onchange = () => {
      $("ai-options").hidden = document.querySelector<HTMLInputElement>("input[name=mode]:checked")!.value !== "ai";
    }),
  );
  $("start").onclick = () => {
    mode = document.querySelector<HTMLInputElement>("input[name=mode]:checked")!.value as Mode;
    allowDoubleThree = $<HTMLInputElement>("allow-33").checked;
    newMatch();
    game();
  };
}
/** The new-game dialog: the same panel as in the collection. */
function askNewGame() {
  setupDialog((host) => {
    host.innerHTML = gomokuSetup();
    bindGomokuSetup();
  });
}
/** Where the game rail was scrolled to, kept across redraws of the collection. */
let railScroll = 0;
function menu(selected: GameSelection = null, category = "전체") {
  clear();
  app.innerHTML = header() +
    `<main class="library"><section class="hero"><div class="hero-copy"><div class="eyebrow">The world, at your table</div><h1>함께 앉으면,<br>즐거움이 <em>시작</em>됩니다.</h1><p class="intro">오래도록 사랑받은 게임들, 새로운 테이블 위에서.<br>잠깐의 여유를 위한 당신만의 게임 컬렉션.</p></div></section><div class="collection-heading"><h2>게임 컬렉션 <span>${String(games.filter(g => g.available).length).padStart(2,"0")} / ${String(games.length).padStart(2,"0")}</span></h2><div class="filters" role="group" aria-label="게임 카테고리">${["전체", "보드게임", "카드게임", "주사위게임", "퍼즐게임"].map((x) => `<button class="filter ${x === category ? "active" : ""}" data-category="${x}" aria-label="${x}" aria-pressed="${x === category}">${x}<span aria-hidden="true">${x === "전체" ? games.length : games.filter((g) => g.category === x).length}</span></button>`).join("")}</div></div><div class="rail-wrap"><button class="rail-arrow prev" aria-label="이전 게임 보기">‹</button><div class="collection game-list" id="game-rail">${games.map((g, i) => {
      const id = g.en.toLowerCase().replaceAll(" ", "-"), expanded = selected === id;
      return `<article class="game-entry ${expanded ? "expanded" : ""}" data-game="${id}" data-category="${g.category}" ${category !== "전체" && category !== g.category ? "hidden" : ""}><button class="game-card" id="select-game-${i}" ${g.available ? `aria-label="${g.name} 살펴보기" aria-expanded="${expanded}" ${expanded ? 'aria-controls="game-detail"' : ""}` : `disabled aria-label="${g.name} 개발 예정"`}><span class="card-index" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span><span class="game-icon icon-${i}${thumb(id) ? " shot" : ""}" aria-hidden="true">${thumb(id) ? `<img src="${thumb(id)}" alt="" loading="lazy">` : g.icon}</span><span class="card-copy"><span class="card-title">${g.name}</span><small>${g.en}</small></span><span class="card-category">${g.available ? g.category : "개발 예정"}</span></button></article>`;
    }).join("")}</div><button class="rail-arrow next" aria-label="다음 게임 보기">›</button></div>${(() => {
      const chosen = games.find((g) => g.en.toLowerCase().replaceAll(" ", "-") === selected);
      return chosen
        ? `<div class="game-stage" data-category="${chosen.category}" ${category !== "전체" && category !== chosen.category ? "hidden" : ""}><div id="game-detail" class="game-detail" role="region" aria-label="${chosen.name} 대국 설정">${selected === "gomoku" ? gomokuSetup() : ""}</div></div>`
        : `<p class="rail-hint">게임을 누르면 설명과 시작 버튼이 아래에 펼쳐집니다. 좌우로 넘겨 다른 게임을 살펴보세요.</p>`;
    })()}<footer><span>World Table Games</span><span>설치 없이, 함께 즐기는 세계의 게임</span></footer></main>`;
  bindHeader();
  const rail = $("game-rail"),
    calm = matchMedia("(prefers-reduced-motion: reduce)").matches,
    tiles = () => [...rail.querySelectorAll<HTMLButtonElement>(".game-entry:not([hidden]) .game-card")];
  /** Brings a tile to the middle of the rail. */
  const centre = (tile: HTMLElement, smooth = true) =>
    rail.scrollTo({
      left: tile.offsetLeft - (rail.clientWidth - tile.offsetWidth) / 2,
      behavior: smooth && !calm ? "smooth" : "auto",
    });
  /** Points the setup panel's notch at the chosen tile and dims arrows at the ends. */
  const [prev, next] = [...document.querySelectorAll<HTMLButtonElement>(".rail-arrow")];
  const trim = () => {
    // The observer may still fire once after the collection has been left.
    if (!rail.isConnected) return;
    const stage = document.querySelector<HTMLElement>(".game-stage"),
      chosen = rail.querySelector<HTMLElement>(".game-entry.expanded");
    if (stage && chosen) {
      const x = chosen.getBoundingClientRect().left + chosen.offsetWidth / 2 - stage.getBoundingClientRect().left;
      stage.style.setProperty("--notch", `${Math.max(28, Math.min(stage.clientWidth - 28, x))}px`);
    }
    prev.disabled = rail.scrollLeft < 2;
    next.disabled = rail.scrollLeft + rail.clientWidth > rail.scrollWidth - 2;
  };
  // The rail stays where it was across a redraw, then glides to the chosen game.
  rail.scrollLeft = railScroll;
  const chosenTile = rail.querySelector<HTMLElement>(".game-entry.expanded");
  if (chosenTile) centre(chosenTile);
  rail.onscroll = () => {
    railScroll = rail.scrollLeft;
    trim();
  };
  new ResizeObserver(trim).observe(rail);
  trim();
  document.querySelectorAll<HTMLButtonElement>(".rail-arrow").forEach((arrow) => {
    arrow.onclick = () =>
      rail.scrollBy({
        left: (arrow.classList.contains("next") ? 1 : -1) * Math.max(180, rail.clientWidth * 0.7),
        behavior: calm ? "auto" : "smooth",
      });
  });
  rail.onkeydown = (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const all = tiles(),
      next = all[all.indexOf(document.activeElement as HTMLButtonElement) + (e.key === "ArrowRight" ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    next.focus({ preventScroll: true });
    centre(next.parentElement!);
  };
  document.querySelectorAll<HTMLButtonElement>(".game-card:not(:disabled)").forEach((button) => {
    button.onclick = () => {
      const id = button.closest<HTMLElement>(".game-entry")!.dataset.game as Exclude<GameSelection, null>;
      menu(selected === id ? null : id, category);
      document.getElementById(button.id)?.focus({ preventScroll: true });
    };
  });
  if (selected === "reversi") {
    reversi = mountReversi(app, {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"),
      preferences: reversiOptions,
      remember: (options) => { reversiOptions = options; setReversiOptions(options); },
    });
  }
  if (selected === "chess") {
    chess = mountChess(app, {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"), preferences: chessOptions,
      remember: (options) => { chessOptions = options; },
    });
  }
  if (selected === "seotda" || selected === "seven-poker") {
    const nav = {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"), preferences: bettingOptions[selected],
      remember: (options: BettingOptions) => { bettingOptions[selected] = options; },
    };
    betting = selected === "seotda"
      ? mountBettingGame(app, nav, seotdaConfig)
      : mountBettingGame(app, nav, pokerConfig);
  }
  if (selected === "janggi") {
    janggi = mountJanggi(app, {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"), preferences: janggiOptions,
      remember: (options) => { janggiOptions = options; },
    });
  }
  if (selected === "spider") {
    spider = mountSpider(app, {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"), preferences: spiderOptions,
      remember: (options) => { spiderOptions = options; },
    });
  }
  if (selected === "world-tour") {
    tour = mountTour(app, {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"), preferences: tourOptions,
      remember: (options) => { tourOptions = options; },
    });
  }
  if (selected && pointGames[selected]) {
    const entry = pointGames[selected];
    points = mountPointGame(app, {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"), preferences: entry.options,
      remember: (options: PointOptions) => { entry.options = options; },
    }, entry.config);
  }
  if (selected === "yut-nori") {
    yut = mountYut(app, {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"), preferences: yutOptions,
      remember: (options) => { yutOptions = options; },
    });
  }
  if (selected === "yacht-dice") {
    yacht = mountYacht(app, {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"), preferences: yachtOptions,
      remember: (options) => { yachtOptions = options; },
    });
  }
  if (selected === "blackjack") {
    blackjack = mountBlackjack(app, {
      header, bindHeader, back: () => menu(), settings,
      setupHost: $("game-detail"),
    });
  }
  if (selected === "gomoku") bindGomokuSetup();
  // The setup panel shows the game's own table in place of drawn art.
  const art = document.querySelector<HTMLElement>(".game-stage .feature-art"),
    shot = selected && thumb(selected);
  if (art && shot) {
    art.classList.add("shot");
    art.innerHTML = `<img src="${shot}" alt="">`;
  }
  document.querySelectorAll<HTMLButtonElement>(".filter").forEach((button) =>
    (button.onclick = () => {
      category = button.dataset.category!;
      document.querySelectorAll(".filter").forEach((x) => {
        x.classList.toggle("active", x === button);
        x.setAttribute("aria-pressed", String(x === button));
      });
      document.querySelectorAll<HTMLElement>(".game-entry, .game-stage").forEach((entry) =>
        (entry.hidden = category !== "전체" && entry.dataset.category !== category),
      );
      rail.scrollLeft = 0;
      trim();
    }),
  );
}
function game() {
  clear();
  app.innerHTML =
    header() +
    `<main class="game-layout"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>오목 <small>GOMOKU</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="camera" aria-pressed="${settings.top}">시점 전환</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE GOMOKU TABLE</span><span>15 × 15 · ${state.noDoubleThree ? "삼삼 금지" : "삼삼 허용"}</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar"><div id="turn" role="status" aria-live="polite"></div><div class="player"><i class="stone black"></i><span>흑돌<small>${mode === "ai" ? (human === 1 ? "나" : `컴퓨터 · ${profiles[difficulty].label}`) : "플레이어 1"}</small></span><b>선공</b></div><div class="player"><i class="stone white"></i><span>백돌<small>${mode === "ai" ? (human === 2 ? "나" : `컴퓨터 · ${profiles[difficulty].label}`) : "플레이어 2"}</small></span></div><p class="hint">가로, 세로, 대각선으로<br>다섯 개의 돌을 먼저 연결하세요.</p><div class="assist"><button id="undo">무르기</button></div><p class="input-help">마우스: 교차점을 클릭하여 착수<br>터치: 교차점을 누르면 바로 착수<br>키보드: 방향키로 선택, Enter로 착수</p></aside></div></main>`;
  bindHeader();
  $("back").onclick = () => menu();
  $("rules").onclick = showRules;
  dress(
    (host) => {
      host.innerHTML = gomokuSetup();
      bindGomokuSetup();
    },
    [".assist"],
  );
  $("camera").onclick = () => {
    settings.top = !settings.top;
    setSettings(settings);
    view?.setCamera(settings.top);
    $("camera").setAttribute("aria-pressed", String(settings.top));
    candidate = null;
    update();
  };
  $("undo").onclick = takeBack;
  try {
    view = new BoardView($("board"), settings.quality);
    view.onContact = () => sound.tap();
    view.onSelect = (p, confirm) => {
      refusal = "";
      if (!p || !canPlay() || state.board[p.row][p.col] || barred(p)) {
        if (p && canPlay() && barred(p)) refusal = "삼삼 금지 자리입니다. 다른 곳에 두세요.";
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
    view.setLabels(settings.labels);
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
  if (state.winner) {
    resultPending = true;
    showResult();
  }
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
/** A point the double-three rule refuses to the player to move. */
const barred = (p: Point) =>
  !!state.noDoubleThree && !state.board[p.row][p.col] && play(state, p) === null;
function place(p: Point) {
  if (!canPlay()) return;
  sound.unlock();
  const next = play(state, p);
  if (next) accept(next);
  else if (barred(p)) {
    refusal = "삼삼 금지 자리입니다. 다른 곳에 두세요.";
    candidate = null;
    view?.preview(null, state.turn);
    update();
  }
}
function accept(next: typeof state) {
  state = next;
  aiError = "";
  refusal = "";
  candidate = null;
  if (state.winner && mode === "ai")
    addResult(
      difficulty,
      state.winner === "draw" ? "draw" : state.winner === human ? "win" : "loss",
    );
  lockedUntil = performance.now() + 320;
  view?.renderState(state);
  update();
  if (state.winner) {
    resultPending = true;
    resultTimer = setTimeout(showResult, 850);
  } else scheduleAI();
}
/** How many moves one press of 무르기 takes back; 0 when it is unavailable. */
function undoCount() {
  if (state.winner || !state.moves.length) return 0;
  if (mode === "local") return 1;
  // Against the computer, return to the person's own previous turn.
  if (isAITurn()) return state.moves.at(-1)!.player === human ? 1 : 0;
  return state.moves.length >= 2 ? 2 : 0;
}
function takeBack() {
  const count = undoCount();
  // A take-back may come while the table is still turning to the next player.
  if (!count || !view || document.querySelector("dialog[open]")) return;
  const previous = undo(state, count);
  if (!previous) return;
  // Drop any search for the abandoned position before replacing the state.
  ai.cancel();
  if (timer) clearTimeout(timer);
  timer = null;
  state = previous;
  aiError = "";
  candidate = null;
  lockedUntil = performance.now() + 200;
  refusal = "";
  view.renderState(state, false);
  update();
  scheduleAI();
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
window.addEventListener("pagehide", (event) => {
  sessionGeneration++;
  ai.cancel();
  if (timer) clearTimeout(timer);
  if (resultTimer) clearTimeout(resultTimer);
  timer = resultTimer = null;
  if (!event.persisted) {
    view?.dispose();
    view = null;
    sound.dispose();
  }
});
window.addEventListener("pageshow", (event) => {
  if (event.persisted && view) {
    if (resultPending) showResult();
    else scheduleAI();
  }
});

function update() {
    // The status is read on the table itself: the panel's copy is not shown.
    mirrorStatus();
  if (!document.getElementById("turn")) return;
  $("turn").innerHTML =
    `<i class="stone ${state.turn === 1 ? "black" : "white"}"></i><span>${state.winner ? (state.winner === "draw" ? "무승부" : `${state.winner === 1 ? "흑" : "백"}돌 승리`) : isAITurn() ? "컴퓨터가 생각 중…" : refusal || `${state.turn === 1 ? "흑" : "백"}돌의 차례입니다`}</span>`;
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
  // Where the next stone would go, now that no button names it.
  if (view) view.renderer.domElement.dataset.candidate = candidate ? `${String.fromCharCode(65 + candidate.col)}${candidate.row + 1}` : "";
  $<HTMLButtonElement>("undo").disabled = !undoCount();
}
function showResult() {
  resultTimer = null;
  if (!resultPending || !state.winner || !view) return;
  if (view.animating || document.querySelector("dialog[open]")) {
    resultTimer = setTimeout(showResult, 100);
    return;
  }
  resultPending = false;
  if (mode === "ai" && state.winner !== "draw" && state.winner !== human)
    sound.lose();
  else sound.win();
  modal(
    state.winner === "draw"
      ? "멋진 승부, 무승부!"
      : `${state.winner === 1 ? "흑돌" : "백돌"}이 승리했습니다!`,
    `${resultArt(state.winner === "draw" ? "draw" : mode === "ai" && state.winner !== human ? "lose" : "win")}<p>${state.moves.length}수의 이야기가 완성되었습니다.<br>테이블에서 한 판 더 만나볼까요?</p>${mode === "ai" ? `<p class="stats">${profiles[difficulty].label} 전적 · ${tally(getStats()[difficulty])}</p>` : ""}`,
    [
      { text: "게임판 보기", action: () => {} },
      { text: "새 게임", action: askNewGame },
    ],
  );
}
function showRules() {
  modal(
    "다섯 개를 연결하세요",
    `<h3>기본 규칙</h3><ol><li>15×15 판의 <b>선이 만나는 점</b>에 돌을 놓습니다.</li><li><b>흑돌이 먼저</b> 두고, 한 번에 하나씩 번갈아 둡니다.</li><li>한 번 놓은 돌은 옮기거나 들어낼 수 없습니다.</li><li>가로·세로·대각선 중 한 방향으로 <b>자기 돌 5개 이상</b>을 먼저 이으면 이깁니다. 6개 이상(장목)도 승리로 칩니다.</li><li>225곳이 모두 찰 때까지 승부가 나지 않으면 무승부입니다.</li></ol><h3>알아 둘 모양</h3><dl class="piece-moves"><dt>열린 삼</dt><dd>양쪽이 비어 있는 세 돌. 한 수 더 두면 열린 사가 됩니다. 상대는 지금 막아야 합니다.</dd><dt>닫힌 삼</dt><dd>한쪽이 막힌 세 돌. 당장 위협은 아닙니다.</dd><dt>열린 사</dt><dd>양쪽이 비어 있는 네 돌. 양쪽을 다 막을 수 없어 사실상 승리입니다.</dd><dt>닫힌 사</dt><dd>한쪽이 막힌 네 돌. 상대가 남은 한쪽을 바로 막아야 합니다.</dd><dt>띈 삼·띈 사</dt><dd>사이에 한 칸이 빈 삼·사. 붙어 있는 모양과 같은 위협입니다.</dd></dl><h3>삼삼(3-3) 규칙</h3><dl class="piece-moves"><dt>삼삼이란</dt><dd>돌 하나로 열린 삼을 <b>한 번에 두 개</b> 만드는 수입니다.</dd><dt>설정</dt><dd>새 게임 창의 "삼삼(3-3) 허용"에서 고릅니다. 기본은 허용입니다.</dd><dt>금지로 두면</dt><dd>흑·백 모두 삼삼 자리에 둘 수 없습니다.<br>그 수로 다섯이 완성되면 둘 수 있습니다.<br>한쪽이 막힌 삼은 세지 않습니다.<br>금지 자리를 누르면 "삼삼 금지 자리입니다"라고 안내하고 돌은 놓이지 않습니다.<br>컴퓨터도 그 자리에 두지 않습니다.</dd><dt>사삼·사사</dt><dd>사와 삼을 함께 만드는 수(사삼)와 사사는 제한하지 않습니다.</dd></dl><h3>처음이라면</h3><ul><li>첫 수는 가운데(H8) 근처에 두는 것이 좋습니다.</li><li>상대의 <b>열린 삼</b>과 <b>사</b>는 보이는 즉시 막습니다.</li><li>내 돌은 한 줄로만 늘리지 말고, 두 방향으로 동시에 이어지게 둡니다.</li><li>사와 삼을 한 번에 만드는 수(사삼)는 막기 어려운 결정타입니다.</li></ul><h3>조작</h3><dl class="piece-moves"><dt>마우스</dt><dd>교차점을 클릭하면 바로 착수</dd><dt>터치</dt><dd>교차점을 누르면 바로 착수</dd><dt>키보드</dt><dd>방향키로 자리 이동, Enter로 착수</dd></dl><p>돌이 놓이는 동안과 시점이 바뀌는 동안에는 착수할 수 없습니다.</p><h3>버튼</h3><dl class="piece-moves"><dt>무르기</dt><dd>직전 수를 되돌립니다. 컴퓨터 대전에서는 컴퓨터의 응수까지 되돌려 내 차례로 돌아갑니다. 대국이 끝난 뒤에는 쓸 수 없습니다.</dd><dt>새 게임</dt><dd>설정 창이 뜹니다. 대전 방식·난이도·색상·삼삼 허용을 고르고 새로 시작합니다. "계속하기"를 누르면 하던 대국으로 돌아갑니다.</dd><dt>시점 전환</dt><dd>비스듬한 시점과 위에서 내려다보는 시점을 바꿉니다.</dd><dt>설정(⚙)</dt><dd>효과음, 렌더링 품질, 좌표(A–O, 1–15) 표시를 바꿉니다.</dd></dl><h3>컴퓨터 대전</h3><ul><li>난이도는 입문·쉬움·보통·어려움·전문가 다섯 단계입니다.</li><li>색상은 흑돌(선공)·백돌·무작위 중에서 고릅니다.</li><li>난이도별 승·패·무 전적이 이 기기에 기록됩니다.</li><li>대국 자체는 저장되지 않습니다. 새로고침하거나 컬렉션으로 나가면 끝납니다.</li></ul>`,
  );
}
function showSettings() {
  modal(
    "나만의 테이블",
    `<label class="setting">착수 효과음<input id="sound-setting" type="checkbox" ${settings.sound ? "checked" : ""}></label><label class="setting">렌더링 품질<select id="quality-setting"><option value="high" ${settings.quality === "high" ? "selected" : ""}>높음 (최대 2×)</option><option value="low" ${settings.quality === "low" ? "selected" : ""}>절전 (1×)</option></select></label><label class="setting">오목판 좌표 표시<input id="labels-setting" type="checkbox" ${settings.labels ? "checked" : ""}></label>`,
    [{ text: "설정 저장", action: () => {} }],
  );
  const d = document.querySelector("dialog")!;
  d.querySelector("button")!.onclick = () => {
    settings.sound = $<HTMLInputElement>("sound-setting").checked;
    settings.quality = $<HTMLSelectElement>("quality-setting").value as
      "high" | "low";
    settings.labels = $<HTMLInputElement>("labels-setting").checked;
    sound.enabled = settings.sound;
    setSettings(settings);
    view?.setLabels(settings.labels);
    view?.setQuality(settings.quality);
    reversi?.setSettings(settings);
    chess?.setSettings(settings);
    blackjack?.setSettings(settings);
    yacht?.setSettings(settings);
    yut?.setSettings(settings);
    points?.setSettings(settings);
    spider?.setSettings(settings);
    tour?.setSettings(settings);
    betting?.setSettings(settings);
    janggi?.setSettings(settings);
    d.close();
    d.remove();
  };
}
menu();
