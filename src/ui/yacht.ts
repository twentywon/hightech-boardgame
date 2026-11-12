import { dress } from "./chrome";
import { part, steps, notes, table } from "./guide";
import { mirrorStatus } from "./banner";
import {
  BONUS,
  BONUS_AT,
  CATEGORIES,
  DICE,
  UPPER,
  createGame,
  hasRolled,
  roll,
  score,
  scoreFor,
  toggleHold,
  totals,
  winner,
  type Category,
  type State,
} from "../games/yacht/rules";
import { advise } from "../games/yacht/ai";
import { YachtView } from "../games/yacht/view";
import { cryptoRandom, type Random } from "../core/random";
import { Sound } from "../engine/sound";
import { modal, setupDialog } from "./dialog";
import type { Settings } from "../core/storage";

export type YachtMode = "solo" | "local" | "ai";
export interface YachtOptions {
  mode: YachtMode;
}
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: YachtOptions;
  remember: (options: YachtOptions) => void;
}
export interface YachtController {
  dispose(): void;
  setSettings(settings: Settings): void;
}
const NAMES: Record<Category, [string, string]> = {
  ones: ["에이스", "1의 눈 합계"],
  twos: ["듀스", "2의 눈 합계"],
  threes: ["트레이", "3의 눈 합계"],
  fours: ["포", "4의 눈 합계"],
  fives: ["파이브", "5의 눈 합계"],
  sixes: ["식스", "6의 눈 합계"],
  choice: ["초이스", "모든 눈의 합"],
  fourKind: ["포카드", "같은 눈 4개 · 눈의 합"],
  fullHouse: ["풀하우스", "3개 + 2개 · 눈의 합"],
  smallStraight: ["스몰 스트레이트", "연속 4개 · 15점"],
  largeStraight: ["라지 스트레이트", "연속 5개 · 30점"],
  yacht: ["요트", "같은 눈 5개 · 50점"],
};
const PIPS = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

/**
 * Mounts yacht dice. `random` throws the dice; the collection passes the
 * default, so the interface has no way to set a face.
 */
export function mountYacht(
  root: HTMLElement,
  nav: Navigation,
  random: Random = cryptoRandom,
): YachtController {
  const sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    preferences = { ...nav.preferences },
    mode: YachtMode = preferences.mode,
    state = createGame(1),
    // What the panel describes: the last state whose dice have come to rest.
    shown = state,
    view: YachtView | null = null,
    disposed = false,
    generation = 0,
    lockedUntil = 0,
    announced = false,
    // One pending computer step at most.
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
  const computerTurn = (s: State = state) => mode === "ai" && s.turn === 1 && !s.over;
  const who = (player: number) =>
    mode === "solo"
      ? "나"
      : mode === "local"
        ? `플레이어 ${player + 1}`
        : player === 0
          ? "나"
          : "컴퓨터";
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
    host.innerHTML = `<section class="featured"><div class="feature-copy"><span class="game-number">NO. 05 — FIVE DICE</span><h2>요트 다이스 <span>Yacht Dice</span></h2><p>주사위 다섯 개, 세 번의 기회.<br>남길 눈을 골라 열두 칸의 족보를 채우세요.</p><div class="game-meta">1–2인 · 12라운드 · 주사위 5개</div><div class="mode-select"><label><input type="radio" name="yd-mode" value="solo"> 혼자 하기</label><label><input type="radio" name="yd-mode" value="local"> 로컬 2인</label><label><input type="radio" name="yd-mode" value="ai"> 컴퓨터 대전</label></div><small id="yd-options" class="session-note" hidden>컴퓨터 대전에서는 내가 먼저 굴립니다.</small><button id="yd-start" class="primary">테이블에 앉기 <span>↗</span></button></div><div class="feature-art yacht-art" role="img" aria-label="요트 다이스 테이블 미리보기"><div class="yd-mini">${[5, 5, 5, 2, 2].map((n, i) => `<i class="yd-mini-die d${i}">${PIPS[n]}</i>`).join("")}</div><span>FIVE DICE, THREE ROLLS</span></div></section>`;
    const radios = document.querySelectorAll<HTMLInputElement>("input[name=yd-mode]");
    const remember = () => {
      preferences = { mode: [...radios].find((r) => r.checked)!.value as YachtMode };
      $("yd-options").hidden = preferences.mode !== "ai";
      nav.remember({ ...preferences });
    };
    radios.forEach((r) => {
      r.checked = r.value === preferences.mode;
      r.onchange = remember;
    });
    $("yd-options").hidden = preferences.mode !== "ai";
    $("yd-start").onclick = start;
  }
  function start() {
    mode = preferences.mode;
    state = shown = createGame(mode === "solo" ? 1 : 2);
    announced = false;
    lockedUntil = 0;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  function screen() {
    stop();
    const columns = state.cards.map((_, p) => `<th scope="col">${who(p)}</th>`).join("");
    const cells = (id: string) => state.cards.map((_, p) => `<td id="yd-${id}-${p}"></td>`).join("");
    const row = (c: Category) =>
      `<tr data-category="${c}"><th scope="row">${NAMES[c][0]}<small>${NAMES[c][1]}</small></th>${cells(c)}</tr>`;
    root.innerHTML =
      nav.header() +
      `<main class="game-layout yacht-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>요트 다이스 <small>YACHT DICE</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE DICE TRAY</span><span>주사위 5개 · 3번 굴리기</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">1 / 12 라운드</span></div></section><aside class="game-sidebar yd-sidebar"><div id="turn" role="status" aria-live="polite"></div><div class="yd-controls"><div class="yd-dice sr-only" role="group" aria-label="주사위 — 눌러서 보관하거나 되돌리기">${Array.from({ length: DICE }, (_, i) => `<button id="yd-die-${i}" class="yd-die" aria-pressed="false"></button>`).join("")}</div><button id="yd-roll" class="primary">굴리기</button><p id="yd-note" class="input-help"></p></div><div id="yd-result" class="yd-result" hidden><p id="yd-final"></p><button id="yd-again" class="primary">다시 플레이</button></div><table class="yd-sheet"><caption>점수표 — 내 차례에 열린 칸의 점수를 눌러 기록합니다</caption><thead><tr><th scope="col">족보</th>${columns}</tr></thead><tbody>${UPPER.map(row).join("")}<tr class="sum"><th scope="row">상단 합계<small>${BONUS_AT} 이상이면 보너스</small></th>${cells("upper")}</tr><tr class="sum"><th scope="row">보너스<small>+${BONUS}</small></th>${cells("bonus")}</tr>${CATEGORIES.slice(6).map(row).join("")}<tr class="total"><th scope="row">총점</th>${cells("total")}</tr></tbody></table></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    dress(setup, ["#yd-roll"]);
    $("yd-roll").onclick = () => act((s) => roll(s, random));
    $("yd-again").onclick = () => setupDialog(setup);
    for (let i = 0; i < DICE; i++) $(`yd-die-${i}`).onclick = () => hold(i);
    root.querySelector<HTMLElement>(".yd-sheet")!.onclick = (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>(".yd-pick");
      if (button) act((s) => score(s, button.dataset.category as Category));
    };
    try {
      view = new YachtView($("board"), settings.quality);
      // The roll has one recorded sound of its own; landings add nothing.
      view.onContact = () => {};
      view.onSettled = present;
      // Before the first roll of a turn there is nothing to set aside: a tap on the dice throws them.
      view.onPick = (index) => (!hasRolled(state) && !state.over ? $("yd-roll").click() : hold(index));
      view.sync(state, false);
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요. 오른쪽 버튼과 점수표로는 계속 플레이할 수 있습니다.</p></div>';
    }
    present();
  }
  const busy = () =>
    !!view?.animating ||
    state !== shown ||
    performance.now() < lockedUntil ||
    !!document.querySelector("dialog[open]");
  function apply(next: State, animate = true) {
    if (next.rollId !== state.rollId) sound.dice(next.rolled.filter(Boolean).length);
    state = next;
    if (view) view.sync(state, animate);
    else present();
    update();
  }
  /** Setting a die aside is instant and may be repeated; the rules validate it. */
  function hold(index: number) {
    if (busy() || computerTurn()) return;
    const next = toggleHold(state, index);
    if (next) apply(next);
  }
  /**
   * A roll or a score. Input stays locked until the dice have come to rest,
   * so a double click cannot roll or write twice.
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
  /** The computer plays its turn one visible step at a time. */
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
      let next: State | null;
      if (!hasRolled(state)) next = roll(state, random);
      else {
        const advice = advise(state, "normal", 1 + state.rollId);
        if (advice.category) next = score(state, advice.category);
        else {
          const wanted = advice.hold!,
            differs = wanted.findIndex((keep, i) => keep !== state.held[i]);
          // Set dice aside one at a time so the choice can be followed.
          next = differs >= 0 ? toggleHold(state, differs) : roll(state, random);
        }
      }
      // An unusable step would stall the turn: fall back to any legal one.
      next ??= roll(state, random) ??
        score(state, CATEGORIES.find((c) => state.cards[1][c] === null)!);
      if (next) apply(next);
      computer();
    }, hasRolled(state) && state === shown ? 520 : 320);
  }
  /** The dice have come to rest: describe the current state. */
  function present() {
    if (disposed) return;
    const focused = document.activeElement as HTMLElement | null,
      hadFocus = !!focused && !!focused.closest?.(".yd-sidebar");
    shown = state;
    update();
    if (state.over && !announced) {
      announced = true;
      if (mode === "ai" && winner(state) === 1) sound.lose();
      else sound.win();
    }
    if (hadFocus && focused && (focused.offsetParent === null || (focused as HTMLButtonElement).disabled || !focused.isConnected))
      (state.over ? $("yd-again") : $("yd-roll"))?.focus({ preventScroll: true });
    computer();
  }
  function update() {
    if (disposed || !document.getElementById("yd-roll")) return;
    mirrorStatus();
    const s = shown,
      waiting = busy(),
      bot = computerTurn(s),
      rolledOnce = hasRolled(s);
    $("board").dataset.animating = String(!!view?.animating || state !== shown);
    $("move-count").textContent = `${s.round} / ${CATEGORIES.length} 라운드`;
    const turn = $("turn");
    turn.dataset.player = String(s.turn);
    const name = s.cards.length > 1 ? `${who(s.turn)} 차례 — ` : "";
    turn.textContent = s.over
      ? "게임이 끝났습니다."
      : state !== shown
        ? `${name}주사위가 구르는 중…`
        : bot
          ? `${who(1)}가 ${rolledOnce ? "고르는 중" : "굴리는 중"}…`
          : !rolledOnce
            ? `${name}주사위를 굴리세요.`
            : s.rollsLeft > 0
              ? `${name}남길 주사위를 고르고 다시 굴리거나, 점수표에 기록하세요.`
              : `${name}굴림을 모두 썼습니다. 점수표에 기록하세요.`;
    for (let i = 0; i < DICE; i++) {
      const button = $<HTMLButtonElement>(`yd-die-${i}`),
        face = s.dice[i];
      button.textContent = face ? `${PIPS[face]} ${face}` : "–";
      button.setAttribute("aria-pressed", String(s.held[i]));
      button.setAttribute(
        "aria-label",
        face ? `주사위 ${i + 1}: ${face}${s.held[i] ? ", 보관 중" : ""}` : `주사위 ${i + 1}: 아직 굴리지 않음`,
      );
      button.disabled = waiting || bot || s.over || !rolledOnce || s.rollsLeft === 0;
    }
    const rollButton = $<HTMLButtonElement>("yd-roll");
    rollButton.textContent = s.over ? "굴리기" : `굴리기 (${s.rollsLeft}번 남음)`;
    rollButton.disabled =
      waiting || bot || s.over || s.rollsLeft === 0 || (rolledOnce && s.held.every(Boolean));
    $("yd-note").textContent =
      (s.over || bot || waiting
        ? ""
        : rolledOnce && s.rollsLeft > 0 && s.held.every(Boolean)
          ? "모두 보관했습니다. 다시 굴리려면 주사위를 하나 이상 되돌리세요."
          : rolledOnce && s.rollsLeft > 0
            ? "주사위를 눌러 보관하면 다음 굴림에서 그대로 남습니다."
            : "");
    // Score sheet.
    s.cards.forEach((card, p) => {
      const mine = p === s.turn && !s.over && !bot && rolledOnce;
      for (const c of CATEGORIES) {
        const cell = $(`yd-${c}-${p}`),
          value = card[c];
        if (value !== null) cell.textContent = String(value);
        else if (mine) {
          const points = scoreFor(s.dice, c);
          cell.innerHTML = `<button class="yd-pick" data-category="${c}" aria-label="${NAMES[c][0]}에 ${points}점 기록" ${waiting ? "disabled" : ""}>${points}</button>`;
        } else cell.textContent = "·";
        cell.classList.toggle("filled", value !== null);
      }
      const t = totals(card);
      $(`yd-upper-${p}`).textContent = `${t.upper} / ${BONUS_AT}`;
      $(`yd-bonus-${p}`).textContent = t.bonus ? `+${t.bonus}` : UPPER.every((c) => card[c] !== null) ? "0" : "·";
      $(`yd-total-${p}`).textContent = String(t.total);
    });
    root
      .querySelectorAll<HTMLElement>(".yd-sheet td, .yd-sheet thead th")
      .forEach((cell) => cell.classList.remove("current"));
    if (!s.over && s.cards.length > 1)
      root
        .querySelectorAll<HTMLElement>(`.yd-sheet tr > :nth-child(${s.turn + 2})`)
        .forEach((cell) => cell.classList.add("current"));
    // Result, in the page rather than a dialog.
    $("yd-result").hidden = !s.over;
    if (s.over) {
      const [a, b] = s.cards.map((card) => totals(card).total),
        won = winner(s);
      $("yd-final").textContent =
        s.cards.length === 1
          ? `총점 ${a}점으로 열두 칸을 모두 채웠습니다.`
          : won === "draw"
            ? `${a} : ${b} — 비겼습니다.`
            : mode === "ai"
              ? `${a} : ${b} — ${won === 0 ? "이겼습니다!" : "컴퓨터가 이겼습니다."}`
              : `${a} : ${b} — ${who(won as number)} 승리!`;
    }
  }
  function rules() {
    modal(
      "다섯 개의 주사위로 열두 칸을",
      part("기본 규칙", steps("차례가 오면 주사위 다섯 개를 굴립니다. 한 차례에 <b>세 번</b>까지 굴릴 수 있습니다.", "남기고 싶은 주사위는 <b>보관</b>해 두면 다음 굴림에서 그대로 남습니다.", "언제든 점수표의 빈칸 하나를 골라 지금 눈으로 기록하면 차례가 끝납니다.", "맞는 족보가 없어도 한 칸은 반드시 채워야 하며, 이때는 0점입니다.", "열두 칸을 모두 채우면 끝나고 총점이 높은 쪽이 이깁니다.")) +
        `<h3>상단 — 같은 눈 모으기</h3><dl class="piece-moves"><dt>에이스 – 식스</dt><dd>해당 눈(1–6)만 더한 점수. 예: 5가 세 개면 파이브에 15점.</dd><dt>보너스</dt><dd>상단 여섯 칸의 합계가 ${BONUS_AT}점 이상이면 +${BONUS}점. 눈마다 세 개씩 모으면 꼭 ${BONUS_AT}점입니다.</dd></dl><h3>하단 — 족보</h3><dl class="piece-moves"><dt>초이스</dt><dd>조건 없음. 다섯 눈의 합.</dd><dt>포카드</dt><dd>같은 눈 네 개 이상. 다섯 눈의 합.</dd><dt>풀하우스</dt><dd>같은 눈 세 개 + 다른 같은 눈 두 개. 다섯 눈의 합. 다섯 개가 모두 같으면 풀하우스가 아닙니다.</dd><dt>스몰 스트레이트</dt><dd>이어지는 눈 네 개(예: 2-3-4-5). 15점.</dd><dt>라지 스트레이트</dt><dd>이어지는 눈 다섯 개(1-2-3-4-5 또는 2-3-4-5-6). 30점.</dd><dt>요트</dt><dd>같은 눈 다섯 개. 50점.</dd></dl>` +
        part("처음이라면", notes("상단은 눈마다 세 개씩 모으면 보너스를 받습니다. 초반에는 상단을 먼저 챙깁니다.", "요트와 라지 스트레이트는 나오기 어렵습니다. 끝까지 비워 두었다가 0점으로 버리는 칸으로 쓰기도 합니다.", "초이스는 어디에도 맞지 않는 눈을 받아 주는 칸입니다.")) +
        part("조작", table(["주사위", "판 위의 주사위나 아래 버튼을 눌러 보관하고, 다시 눌러 되돌립니다."], ["굴리기", "보관하지 않은 주사위만 다시 굴립니다."], ["점수표", "빈칸을 누르면 지금 눈으로 얻을 점수가 기록됩니다."], ["새 게임", "설정 창이 뜹니다. 혼자 하기·로컬 2인·컴퓨터 대전을 고릅니다."])) +
        part("그 밖에", notes("무르기와 저장은 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
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
    if (e.persisted && document.getElementById("yd-roll")) {
      lockedUntil = 0;
      if (view) view.sync(state, false);
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
