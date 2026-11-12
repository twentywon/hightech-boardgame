import { mirrorStatus } from "./banner";
import { modal, setupDialog } from "./dialog";
import { SpiderView } from "../games/spider/view";
import { createGame, deal, dealError, hint, move, movable, stuck, suitsOf, targets, type State } from "../games/spider/rules";
import { cryptoRandom, type Random } from "../core/random";
import { Sound } from "../engine/sound";
import type { Settings } from "../core/storage";

export interface SpiderOptions {
  suits: string;
}
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: SpiderOptions;
  remember: (options: SpiderOptions) => void;
}
export interface SpiderController {
  dispose(): void;
  setSettings(settings: Settings): void;
}
/** Mounts spider solitaire. `random` shuffles; the collection passes the default. */
export function mountSpider(root: HTMLElement, nav: Navigation, random: Random = cryptoRandom): SpiderController {
  const sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    preferences = { ...nav.preferences },
    state = createGame(preferences.suits, random),
    past: State[] = [],
    view: SpiderView | null = null,
    disposed = false,
    note = "",
    announced = false;
  const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
  function stop() {
    view?.dispose();
    view = null;
  }
  function setup(host = nav.setupHost) {
    if (host === nav.setupHost) stop();
    host.innerHTML = `<section class="featured"><div class="feature-copy"><div class="pill">지금 플레이 가능</div><span class="game-number">NO. 18 — EIGHT RUNS</span><h2>스파이더 <span>Spider Solitaire</span></h2><p>혼자서 카드 104장을 풀어 가는 놀이.<br>K부터 A까지 같은 무늬로 이으면 한 줄이 완성됩니다.</p><ul class="rule-list"><li>한 장 낮은 카드를 아래로 이어 붙입니다</li><li>같은 무늬로 이어진 묶음은 함께 옮깁니다</li><li>여덟 줄을 모두 완성하면 성공</li></ul><div class="game-meta">1인 · 카드 104장 · 열 줄</div><div class="ai-options"><label>무늬 수<select id="sp-suits">${[["1", "한 가지 (쉬움)"], ["2", "두 가지 (보통)"], ["4", "네 가지 (어려움)"]].map(([value, label]) => `<option value="${value}" ${preferences.suits === value ? "selected" : ""}>${label}</option>`).join("")}</select></label></div><button id="sp-start" class="primary">테이블에 앉기 <span>↗</span></button><small class="session-note">판은 이 페이지를 여는 동안만 유지됩니다.</small></div><div class="feature-art spider-art" role="img" aria-label="스파이더 카드놀이 미리보기"><div class="pk-mini"><i class="bj-mini-card back"></i><i class="bj-mini-card">K<b>♠</b></i><i class="bj-mini-card">Q<b>♠</b></i><i class="bj-mini-card">J<b>♠</b></i><i class="bj-mini-card">10<b>♠</b></i></div><span>KING DOWN TO ACE</span></div></section>`;
    $("sp-suits").onchange = () => {
      preferences = { suits: $<HTMLSelectElement>("sp-suits").value };
      nav.remember({ ...preferences });
    };
    $("sp-start").onclick = start;
  }
  function start() {
    state = createGame(preferences.suits, random);
    past = [];
    note = "";
    announced = false;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  function screen() {
    stop();
    root.innerHTML =
      nav.header() +
      `<main class="game-layout yacht-game spider-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>스파이더 <small>SPIDER SOLITAIRE</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE SPIDER TABLE</span><span>무늬 ${suitsOf(preferences.suits)}가지</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">0수</span></div></section><aside class="game-sidebar yd-sidebar sp-sidebar"><div id="turn" role="status" aria-live="polite"></div><dl class="bj-money"><div><dt>완성한 줄</dt><dd id="sp-done"></dd></div><div><dt>남은 더미</dt><dd id="sp-stock"></dd></div></dl><div class="yd-controls"><button id="sp-deal" class="primary">새 카드 돌리기</button><div class="bj-row"><button id="sp-undo">무르기</button><button id="sp-hint">힌트</button></div><p class="input-help">옮길 카드를 끌어서 원하는 줄에 놓으세요. 같은 무늬로 이어진 묶음은 맨 위 카드를 끌면 함께 움직입니다. 오른쪽 아래 더미를 눌러도 새 카드를 돌립니다.</p></div><div id="sp-result" class="yd-result" hidden><p id="sp-final"></p><button id="sp-again" class="primary">새 판</button></div></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    $("restart").onclick = () => setupDialog(setup);
    $("sp-again").onclick = () => setupDialog(setup);
    $("sp-deal").onclick = dealRow;
    $("sp-undo").onclick = undo;
    $("sp-hint").onclick = showHint;
    try {
      view = new SpiderView($("board"), settings.quality);
      view.onContact = () => {};
      view.onSettled = update;
      view.onDrop = drop;
      view.canDrag = (column, index) => !busy() && !state.won && movable(state, column, index);
      view.onStock = dealRow;
      view.sync(state, false);
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요.</p></div>';
    }
    update();
  }
  const busy = () => !!view?.animating || !!document.querySelector("dialog[open]");
  function apply(next: State, animate = true) {
    state = next;
    sound.card();
    if (view) view.sync(state, animate);
    update();
  }
  /** A dragged run is let go over a column: it moves there, or slides back. */
  function drop(column: number, index: number, to: number) {
    const next = to === column ? null : move(state, column, index, to);
    if (!next) {
      // Back where it came from.
      if (to !== column) note = targets(state, column, index).length ? "그 줄에는 놓을 수 없습니다. 숫자가 하나 높은 카드 위나 빈 줄에 놓으세요." : "이 카드를 놓을 줄이 없습니다.";
      if (view) view.sync(state);
      update();
      return;
    }
    past.push(state);
    note = next.done.length > state.done.length ? "한 줄을 완성했습니다!" : "";
    sound.unlock();
    apply(next);
  }
  function dealRow() {
    if (busy()) return;
    const next = deal(state);
    if (!next) {
      note = dealError(state) ?? "";
      update();
      return;
    }
    past.push(state);
    note = "";
    sound.unlock();
    apply(next);
  }
  /** Points out a move worth trying, or says that a new row is the only way on. */
  function showHint() {
    if (busy() || state.won) return;
    const found = hint(state);
    if (found) {
      view?.showHint(found.from, found.index, found.to);
      note = `${found.from + 1}번째 줄의 카드를 ${found.to + 1}번째 줄로 옮겨 보세요.`;
    } else note = dealError(state) ? "옮길 만한 카드가 없습니다. 무르거나 새 판을 시작하세요." : "옮길 만한 카드가 없습니다. 새 카드를 돌려 보세요.";
    update();
  }
  function undo() {
    if (busy() || !past.length) return;
    state = past.pop()!;
    note = "";
    announced = false;
    if (view) view.sync(state, false);
    update();
  }
  function update() {
    if (disposed || !document.getElementById("sp-deal")) return;
    mirrorStatus();
    const waiting = busy();
    $("board").dataset.animating = String(!!view?.animating);
    $("move-count").textContent = `${state.moves}수`;
    $("sp-done").textContent = `${state.done.length} / 8`;
    $("sp-stock").textContent = `${state.stock.length / 10}번`;
    $("turn").textContent = state.won
      ? "여덟 줄을 모두 완성했습니다!"
      : note || (stuck(state) ? "더 옮길 수 있는 카드가 없습니다. 무르거나 새 판을 시작하세요." : "옮길 카드를 끌어서 놓으세요.");
    $<HTMLButtonElement>("sp-deal").disabled = waiting || state.won || !state.stock.length;
    $<HTMLButtonElement>("sp-undo").disabled = waiting || !past.length || state.won;
    $<HTMLButtonElement>("sp-hint").disabled = waiting || state.won;
    $("sp-result").hidden = !state.won;
    if (state.won) {
      $("sp-final").textContent = `${state.moves}수 만에 풀었습니다.`;
      if (!announced) {
        announced = true;
        sound.win();
      }
    }
  }
  function rules() {
    modal(
      "K부터 A까지, 같은 무늬로 여덟 줄",
      `<ol><li>카드 104장 가운데 54장이 열 줄에 깔리고, 줄마다 맨 아래 한 장만 펴져 있습니다. 나머지 50장은 오른쪽 아래 더미에 있습니다.</li><li>펴진 카드는 <b>숫자가 하나 높은 카드 위</b>로 옮길 수 있습니다. 무늬는 달라도 됩니다. 빈 줄에는 아무 카드나 놓을 수 있습니다.</li><li><b>같은 무늬로 차례대로 이어진 묶음</b>은 한꺼번에 옮길 수 있습니다. 무늬가 섞인 묶음은 맨 아래 것부터 따로 옮겨야 합니다.</li><li>엎어진 카드 위가 비면 그 카드가 펴집니다.</li><li>한 줄에 같은 무늬로 <b>K부터 A까지</b> 13장이 이어지면 그 묶음은 판에서 나갑니다. 여덟 묶음을 모두 내보내면 성공입니다.</li><li>더 둘 곳이 없으면 더미에서 <b>줄마다 한 장씩</b> 새 카드를 돌립니다(다섯 번). 빈 줄이 있을 때는 돌릴 수 없습니다.</li></ol><h3>무늬 수</h3><dl class="piece-moves"><dt>한 가지</dt><dd>모든 카드가 스페이드입니다. 어떤 묶음이든 함께 움직여 가장 쉽습니다.</dd><dt>두 가지</dt><dd>스페이드와 하트. 무늬가 섞이면 묶음이 끊깁니다.</dd><dt>네 가지</dt><dd>네 무늬를 모두 씁니다. 가장 어렵습니다.</dd></dl><p>카드를 <b>끌어서</b> 원하는 줄에 놓습니다. 놓을 수 없는 곳에 놓으면 제자리로 돌아갑니다. <b>힌트</b>는 옮겨 볼 만한 카드와 놓을 줄을 노란 테두리로 보여 줍니다. <b>무르기</b>는 몇 번이든 되돌립니다. 모든 판이 풀리는 것은 아닙니다. 저장은 없습니다.</p>`,
    );
  }
  const dialogClosed = () => setTimeout(() => !disposed && update(), 0);
  document.addEventListener("close", dialogClosed, true);
  document.addEventListener("cancel", dialogClosed, true);
  document.addEventListener("click", dialogClosed, true);
  const hide = (e: PageTransitionEvent) => {
    if (!e.persisted) {
      view?.dispose();
      view = null;
      sound.dispose();
    }
  };
  window.addEventListener("pagehide", hide);
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
    },
    setSettings(next) {
      settings = next;
      sound.enabled = next.sound;
      view?.setQuality(next.quality);
    },
  };
}
