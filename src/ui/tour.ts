import { mirrorStatus } from "./banner";
import { modal } from "./dialog";
import { PLAYER_COLORS, TourView } from "../games/tour/view";
import {
  LEVELS,
  ROUNDS,
  SALARY,
  SPACES,
  START_MONEY,
  STORM_TURNS,
  TAX,
  buildCost,
  createGame,
  decide,
  draw,
  feeOf,
  follow,
  LUCK,
  roll,
  wants,
  worth,
  type State,
} from "../games/tour/rules";
import { cryptoRandom, type Random } from "../core/random";
import { Sound } from "../engine/sound";
import type { Settings } from "../core/storage";

export interface TourOptions {
  opponents: number;
}
interface Navigation {
  header: () => string;
  bindHeader: () => void;
  back: () => void;
  settings: Settings;
  setupHost: HTMLElement;
  preferences: TourOptions;
  remember: (options: TourOptions) => void;
}
export interface TourController {
  dispose(): void;
  setSettings(settings: Settings): void;
}
const NAMES = ["나", "컴퓨터 1", "컴퓨터 2", "컴퓨터 3"];
const won = (n: number) => n.toLocaleString("ko-KR");
/** Mounts the world tour. `random` rolls the dice and draws the cards. */
export function mountTour(root: HTMLElement, nav: Navigation, random: Random = cryptoRandom): TourController {
  const sound = new Sound();
  sound.enabled = nav.settings.sound;
  let settings = nav.settings,
    preferences = { ...nav.preferences },
    state = createGame(preferences.opponents + 1),
    // What the panel describes: the last state whose pieces have come to rest.
    shown = state,
    view: TourView | null = null,
    disposed = false,
    generation = 0,
    thinking = false,
    announced = false,
    lockedUntil = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
  const later = (fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (!disposed) fn();
    }, ms);
    timers.add(timer);
  };
  function stop() {
    generation++;
    thinking = false;
    timers.forEach(clearTimeout);
    timers.clear();
    view?.dispose();
    view = null;
  }
  function setup() {
    stop();
    nav.setupHost.innerHTML = `<section class="featured"><div class="feature-copy"><div class="pill">지금 플레이 가능</div><span class="game-number">NO. 19 — AROUND THE WORLD</span><h2>세계 일주 <span>World Tour</span></h2><p>주사위를 굴려 세계의 도시를 돌며 땅을 사고 건물을 올립니다.<br>내 도시에 묵는 여행자에게서 숙박료를 받으세요.</p><ul class="rule-list"><li>빈 도시에 서면 살 수 있습니다</li><li>내 도시에 다시 서면 집 → 빌딩 → 랜드마크</li><li>돈이 떨어지면 탈락, 마지막까지 남으면 승리</li></ul><div class="game-meta">나 + 컴퓨터 1–3명 · ${SPACES.length}칸 · 시작 자금 ${won(START_MONEY)}</div><div class="ai-options"><label>상대 수<select id="tour-opponents">${[1, 2, 3].map((n) => `<option value="${n}" ${preferences.opponents === n ? "selected" : ""}>컴퓨터 ${n}명</option>`).join("")}</select></label></div><button id="tour-start" class="primary">여행 떠나기 <span>↗</span></button><small class="session-note">가상의 돈으로만 진행하며, 이 페이지를 여는 동안만 유지됩니다.</small></div><div class="feature-art tour-art" role="img" aria-label="세계 일주 판 미리보기"><div class="pg-mini tour"><i></i><i></i><i></i></div><span>BUY, BUILD, COLLECT</span></div></section>`;
    $("tour-opponents").onchange = () => {
      preferences = { opponents: Number($<HTMLSelectElement>("tour-opponents").value) };
      nav.remember({ ...preferences });
    };
    $("tour-start").onclick = start;
  }
  function start() {
    state = shown = createGame(preferences.opponents + 1);
    announced = false;
    lockedUntil = 0;
    sound.enabled = settings.sound;
    sound.unlock();
    screen();
  }
  function screen() {
    stop();
    root.innerHTML =
      nav.header() +
      `<main class="game-layout yacht-game tour-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>세계 일주 <small>WORLD TOUR</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="restart">새 여행</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE WORLD BOARD</span><span>${SPACES.length}칸 · ${ROUNDS}바퀴</span></div><div id="board"></div><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">1 / ${ROUNDS} 바퀴</span></div></section><aside class="game-sidebar yd-sidebar tour-sidebar"><div id="turn" role="status" aria-live="polite"></div><ul class="yut-sides" id="tour-players">${state.players.map((_, i) => `<li id="tour-player-${i}"><i class="yut-dot" style="background:${PLAYER_COLORS[i]}"></i><b>${NAMES[i]}</b><span id="tour-money-${i}"></span></li>`).join("")}</ul><div class="yd-controls"><button id="tour-roll" class="primary">주사위 굴리기</button><button id="tour-key" class="primary" hidden>황금열쇠 뽑기</button><div class="bj-row" id="tour-offer" hidden><button id="tour-yes" class="primary"></button><button id="tour-no">지나치기</button></div><p id="tour-note" class="input-help"></p></div><div id="tour-result" class="yd-result" hidden><p id="tour-final"></p><button id="tour-again" class="primary">새 여행</button></div></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    $("restart").onclick = () =>
      modal("새 여행을 시작할까요?", "지금까지의 돈과 도시를 모두 버리고 처음부터 다시 시작합니다.", [
        { text: "계속하기", action: () => {} },
        { text: "새 여행", action: start },
      ]);
    $("tour-again").onclick = start;
    $("tour-roll").onclick = () => act((s) => roll(s, random));
    // If the card was closed without its button, it is carried out from here.
    $("tour-key").onclick = () => (state.phase === "card" ? act((s) => follow(s)) : drawKey());
    $("tour-yes").onclick = () => act((s) => decide(s, true));
    $("tour-no").onclick = () => act((s) => decide(s, false));
    try {
      view = new TourView($("board"), settings.quality, state.players.length);
      view.onContact = () => sound.tap();
      view.onSettled = present;
      view.onTap = () => {
        if (state.phase === "roll") $("tour-roll").click();
      };
      view.onDeck = () => {
        if (state.phase === "key") drawKey();
        else if (state.phase === "roll") $("tour-roll").click();
      };
      view.sync(state, false);
    } catch {
      view?.dispose();
      view = null;
      $("board").innerHTML =
        '<div class="webgl-error"><h2>3D 화면을 시작할 수 없습니다</h2><p>WebGL을 지원하는 브라우저에서 하드웨어 가속을 확인해 주세요. 오른쪽 버튼으로는 계속 플레이할 수 있습니다.</p></div>';
    }
    present();
  }
  const busy = () =>
    !!view?.animating || state !== shown || thinking || performance.now() < lockedUntil || !!document.querySelector("dialog[open]");
  function apply(next: State) {
    if (next.rollId !== state.rollId && next.path.length) sound.dice(2);
    state = next;
    if (view) view.sync(state);
    else present();
    update();
  }
  /** A step of mine; input stays locked until the board has come to rest. */
  function act(change: (s: State) => State | null) {
    if (busy() || state.turn !== 0 || state.phase === "over") return;
    const next = change(state);
    if (!next) return;
    sound.unlock();
    lockedUntil = performance.now() + 220;
    later(update, 240);
    apply(next);
  }
  /** I draw the golden key: the card is shown, and takes effect when it has been read. */
  function drawKey() {
    if (busy() || state.turn !== 0 || state.phase !== "key") return;
    const drawn = draw(state, random);
    if (!drawn) return;
    sound.unlock();
    sound.card();
    state = shown = drawn;
    update();
    modal("황금열쇠", `<p class="key-card">${LUCK[drawn.card].text}</p>`, [
      {
        text: "확인",
        action: () => {
          const next = follow(state);
          if (next) apply(next);
        },
      },
    ]);
  }
  /** The computers roll and decide one visible step at a time. */
  function computer() {
    if (thinking || state.turn === 0 || state.phase === "over" || state !== shown) return;
    thinking = true;
    const current = generation;
    update();
    later(() => {
      thinking = false;
      if (current !== generation || state.turn === 0 || state.phase === "over") return;
      const next =
        state.phase === "roll"
          ? roll(state, random)
          : state.phase === "key"
            ? draw(state, random)
            : state.phase === "card"
              ? follow(state)
              : decide(state, wants(state));
      if (next) apply(next);
    }, 700);
  }
  function present() {
    if (disposed) return;
    shown = state;
    update();
    if (state.phase === "over" && !announced) {
      announced = true;
      if (state.winners.includes(0)) sound.win();
      else sound.lose();
    }
    computer();
  }
  function update() {
    if (disposed || !document.getElementById("tour-roll")) return;
    mirrorStatus();
    const s = shown,
      waiting = busy(),
      mine = s.turn === 0 && s.phase !== "over",
      me = s.players[s.turn],
      space = SPACES[me.at],
      over = s.phase === "over";
    $("board").dataset.animating = String(!!view?.animating || state !== shown || thinking);
    $("board").dataset.phase = s.phase;
    $("move-count").textContent = `${Math.min(s.round, ROUNDS)} / ${ROUNDS} 바퀴`;
    const offer =
      s.phase === "buy"
        ? `${space.name}을(를) ${won(space.price)}에 살 수 있습니다.`
        : s.phase === "build"
          ? `${space.name}에 ${LEVELS[s.levels[me.at] + 1]}을(를) ${won(buildCost(space, s.levels[me.at] + 1))}에 지을 수 있습니다.`
          : "";
    $("turn").textContent = over
      ? "여행이 끝났습니다."
      : state !== shown
        ? "말이 움직이는 중…"
        : mine
          ? s.phase === "key"
            ? "황금열쇠 더미를 눌러 카드를 뽑으세요."
            : s.phase === "card"
              ? `황금열쇠 — ${LUCK[s.card]?.text ?? ""}`
              : s.phase === "roll"
            ? me.wait > 0
              ? "무인도에 있습니다. 주사위를 눌러 차례를 넘기세요."
              : "내 차례 — 주사위를 굴리세요."
            : `내 차례 — ${offer}`
          : `${NAMES[s.turn]} 차례…`;
    s.players.forEach((player, i) => {
      const cities = s.owners.filter((owner) => owner === i).length;
      $(`tour-money-${i}`).textContent = player.out
        ? "파산"
        : `${won(player.money)} · 도시 ${cities} · ${SPACES[player.at].name}${player.wait ? ` (쉼 ${player.wait})` : ""}`;
      $(`tour-player-${i}`).classList.toggle("active", !over && s.turn === i);
    });
    $<HTMLButtonElement>("tour-roll").hidden = s.phase !== "roll" && !over;
    $<HTMLButtonElement>("tour-roll").disabled = waiting || !mine || s.phase !== "roll";
    $("tour-key").hidden = !(mine && (s.phase === "key" || s.phase === "card"));
    $("tour-key").textContent = s.phase === "card" ? "카드대로 하기" : "황금열쇠 뽑기";
    $<HTMLButtonElement>("tour-key").disabled = waiting;
    $("tour-offer").hidden = !(mine && (s.phase === "buy" || s.phase === "build"));
    $("tour-yes").textContent = s.phase === "buy" ? `사기 (${won(space.price)})` : s.phase === "build" ? `짓기 (${won(buildCost(space, s.levels[me.at] + 1))})` : "";
    $<HTMLButtonElement>("tour-yes").disabled = $<HTMLButtonElement>("tour-no").disabled = waiting;
    $("tour-note").textContent = s.note ? `${NAMES[s.actor]}: ${s.note}` : "";
    $("tour-result").hidden = !over;
    if (over)
      $("tour-final").textContent = `${s.winners.map((i) => NAMES[i]).join(", ")} 승리 — ${s.players.map((_, i) => `${NAMES[i]} ${won(worth(s, i))}`).join(" · ")}`;
  }
  function rules() {
    const example = SPACES.find((space) => space.name === "파리")!;
    modal(
      "도시를 사고, 건물을 올리고, 숙박료를 받으세요",
      `<ol><li>차례가 오면 주사위 두 개를 굴려 나온 만큼 시계 방향으로 갑니다. <b>같은 눈 두 개</b>가 나오면 한 번 더 굴립니다. 같은 눈이 세 번 이어지면 무인도로 갑니다.</li><li><b>주인 없는 도시</b>에 서면 표시된 값에 살 수 있습니다.</li><li><b>내 도시</b>에 다시 서면 건물을 한 단계 올릴 수 있습니다.</li><li><b>남의 도시</b>에 서면 주인에게 숙박료를 냅니다. 건물이 높을수록 비쌉니다.</li><li>낼 돈이 모자라면 가진 도시를 값싼 것부터 반값에 팔아 메웁니다. 그래도 모자라면 <b>파산</b>해 탈락합니다.</li><li>혼자 남으면 이깁니다. ${ROUNDS}바퀴가 끝나면 <b>가진 돈 + 도시와 건물에 쓴 돈의 절반</b>이 가장 많은 사람이 이깁니다.</li></ol><h3>건물 (예: ${example.name}, 땅값 ${won(example.price)})</h3><dl class="piece-moves">${[0, 1, 2, 3].map((level) => `<dt>${LEVELS[level]}</dt><dd>${level ? `짓는 값 ${won(buildCost(example, level))} · ` : "깃발만 꽂힌 땅 · "}숙박료 ${won(feeOf(example, level))}</dd>`).join("")}</dl><h3>특별한 칸</h3><dl class="piece-moves"><dt>출발</dt><dd>지나가거나 설 때마다 월급 ${won(SALARY)}을 받습니다.</dd><dt>황금열쇠</dt><dd>판 위의 황금열쇠 더미를 눌러 카드 한 장을 뽑고, 내용을 확인한 뒤 따릅니다. 돈을 받거나 내고, 다른 칸으로 가기도 합니다.</dd><dt>세금</dt><dd>${won(TAX)}을 냅니다.</dd><dt>무인도</dt><dd>${STORM_TURNS}번 쉽니다.</dd><dt>축제</dt><dd>아무 일도 없이 쉬어 갑니다.</dd><dt>공항</dt><dd>비행기로 출발 칸에 가서 월급을 받습니다.</dd></dl><p>판이나 <b>주사위 굴리기</b> 버튼을 눌러 굴립니다. 컴퓨터는 숙박료로 낼 돈을 남겨 두고 사고 짓습니다. 저장과 무르기는 없습니다.</p>`,
    );
  }
  const dialogClosed = () => later(update, 0);
  document.addEventListener("close", dialogClosed, true);
  document.addEventListener("cancel", dialogClosed, true);
  document.addEventListener("click", dialogClosed, true);
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
  const show = (e: PageTransitionEvent) => {
    if (e.persisted && document.getElementById("tour-roll")) {
      lockedUntil = 0;
      if (view) view.sync(state, false);
      present();
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
