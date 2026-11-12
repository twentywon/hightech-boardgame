import { part, steps, notes, table } from "./guide";
import { mirrorStatus } from "./banner";
import { modal, setupDialog } from "./dialog";
import { PLAYER_COLORS, TourView } from "../games/tour/view";
import { drawFlag } from "../games/tour/flags";
import {
  LEVELS,
  ROUNDS,
  SALARY,
  SPACES,
  START_MONEY,
  FUND_FEE,
  SHIP_TOLL,
  TRAVEL_FEE,
  destination,
  invested,
  sell,
  travel,
  buildCost,
  createGame,
  decide,
  draw,
  endTurn,
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
const flagImages = new Map<string, string>();
/** A country's flag as an image for the page, drawn once. */
function flagImage(country: string) {
  let url = flagImages.get(country);
  if (!url) {
    const canvas = document.createElement("canvas");
    canvas.width = 96;
    canvas.height = 64;
    drawFlag(canvas.getContext("2d")!, country, 0, 0, 96, 64);
    url = canvas.toDataURL();
    flagImages.set(country, url);
  }
  return url;
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
    // A golden key is turning over; the state whose choice has already been put to me.
    revealing = false,
    asked: State | null = null,
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
  function setup(host = nav.setupHost) {
    if (host === nav.setupHost) stop();
    host.innerHTML = `<section class="featured"><div class="feature-copy"><div class="pill">지금 플레이 가능</div><span class="game-number">NO. 19 — AROUND THE WORLD</span><h2>세계 일주 <span>World Tour</span></h2><p>주사위를 굴려 세계의 도시를 돌며 땅을 사고 건물을 올립니다.<br>내 도시에 묵는 여행자에게서 숙박료를 받으세요.</p><ul class="rule-list"><li>빈 도시에 서면 살 수 있습니다</li><li>내 도시에 다시 서면 집 → 빌딩 → 랜드마크</li><li>돈이 떨어지면 탈락, 마지막까지 남으면 승리</li></ul><div class="game-meta">나 + 컴퓨터 1–3명 · ${SPACES.length}칸 · 시작 자금 ${won(START_MONEY)}</div><div class="ai-options"><label>상대 수<select id="tour-opponents">${[1, 2, 3].map((n) => `<option value="${n}" ${preferences.opponents === n ? "selected" : ""}>컴퓨터 ${n}명</option>`).join("")}</select></label></div><button id="tour-start" class="primary">여행 떠나기 <span>↗</span></button><small class="session-note">가상의 돈으로만 진행하며, 이 페이지를 여는 동안만 유지됩니다.</small></div><div class="feature-art tour-art" role="img" aria-label="세계 일주 판 미리보기"><div class="pg-mini tour"><i></i><i></i><i></i></div><span>BUY, BUILD, COLLECT</span></div></section>`;
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
      `<main class="game-layout yacht-game tour-game"><div class="game-top"><div><button class="text-button" id="back">← 컬렉션</button><h1>세계 일주 <small>WORLD TOUR</small></h1></div><div class="game-actions"><button id="rules">게임 방법</button><button id="restart">새 게임</button></div></div><div class="table-layout"><section class="board-area"><div class="board-label"><span>THE WORLD BOARD</span><span>${SPACES.length}칸 · ${ROUNDS}바퀴</span></div><div id="board"></div><div id="tour-toast" class="tour-toast" aria-hidden="true" hidden>더블!</div><button id="tour-end" class="tour-end primary" hidden>턴 종료</button><div class="board-bottom"><span>✦ WORLD TABLE GAMES</span><span id="move-count">1 / ${ROUNDS} 바퀴</span></div></section><aside class="game-sidebar yd-sidebar tour-sidebar"><div id="turn" role="status" aria-live="polite"></div><ul class="yut-sides" id="tour-players">${state.players.map((_, i) => `<li id="tour-player-${i}"><button class="tour-deeds" data-player="${i}" aria-label="${NAMES[i]}의 땅 증서 보기"><i class="yut-dot" style="background:${PLAYER_COLORS[i]}"></i><b>${NAMES[i]}</b><span id="tour-money-${i}"></span></button></li>`).join("")}</ul><div class="yd-controls"><button id="tour-roll" class="primary">주사위 굴리기</button><button id="tour-key" class="primary" hidden>황금열쇠 뽑기</button><div class="bj-row" id="tour-offer" hidden><button id="tour-yes" class="primary"></button><button id="tour-no">지나치기</button></div><p id="tour-note" class="input-help"></p></div><div id="tour-result" class="yd-result" hidden><p id="tour-final"></p><button id="tour-again" class="primary">새 여행</button></div></aside></div></main>`;
    nav.bindHeader();
    $("back").onclick = nav.back;
    $("rules").onclick = rules;
    $("restart").onclick = () => setupDialog(setup);
    $("tour-again").onclick = () => setupDialog(setup);
    $("tour-players").onclick = (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>(".tour-deeds");
      if (button) deeds(Number(button.dataset.player));
    };
    $("tour-roll").onclick = () => act((s) => roll(s, random));
    // If the card was closed without its button, it is carried out from here.
    $("tour-key").onclick = () => {
      if (state.phase === "card") act((s) => follow(s));
      else if (state.phase === "travel") {
        asked = null;
        ask();
      } else drawKey();
    };
    $("tour-end").onclick = () => act((s) => endTurn(s));
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
    !!view?.animating || state !== shown || thinking || revealing || performance.now() < lockedUntil || !!document.querySelector("dialog[open]");
  function apply(next: State) {
    // Every throw of the dice is heard, whoever throws and wherever it leads.
    if (next.dice !== state.dice) {
      sound.dice(3);
      // A double is announced on the board and heard, whoever rolled it.
      if (next.dice[0] === next.dice[1]) {
        sound.double();
        const toast = document.getElementById("tour-toast");
        if (toast) {
          toast.textContent = `${NAMES[next.actor]} 더블! (${next.dice[0]}·${next.dice[1]})`;
          toast.hidden = false;
          later(() => (toast.hidden = true), 1800);
        }
      }
    }
    view?.hideCard();
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
    revealing = true;
    update();
    const open = () => {
      revealing = false;
      modal("황금열쇠", `<p class="key-card">${LUCK[drawn.card].text}</p>`, [{ text: "확인", action: () => act((s) => follow(s)) }]);
    };
    // The card turns over on the board before its text is shown.
    if (view) view.revealCard(open);
    else open();
  }
  /** The title deeds a traveller holds; in my own turn mine can be sold back to the bank. */
  function deeds(player: number) {
    if (document.querySelector("dialog[open]") || state !== shown) return;
    const owned = state.owners.flatMap((owner, i) => (owner === player ? [i] : [])),
      selling = player === 0 && state.turn === 0 && state.phase !== "over" && !busy(),
      rows = owned
        .map((i) => {
          const space = SPACES[i],
            back = Math.round(invested(state, i) / 2),
            fee = space.kind === "ship" ? SHIP_TOLL : feeOf(space, state.levels[i]);
          return `<li>${space.kind === "ship" ? '<i class="deed-flag ship" aria-hidden="true">🚀</i>' : `<img class="deed-flag" src="${flagImage(space.country)}" alt="">`}<span><b>${space.name}</b> ${space.kind === "ship" ? "우주선" : LEVELS[state.levels[i]]}<small>${space.kind === "ship" ? "통행료" : "숙박료"} ${won(fee)} · 들인 돈 ${won(invested(state, i))}</small></span>${selling ? `<button data-sell="${i}">팔기 (+${won(back)})</button>` : ""}</li>`;
        })
        .join("");
    modal(
      `${NAMES[player]}의 땅 증서`,
      `<p>가진 돈 ${won(state.players[player].money)} · 증서 ${owned.length}장</p>${owned.length ? `<ul class="deed-list">${rows}</ul>` : "<p>가진 땅이 없습니다.</p>"}${player === 0 ? `<p class="credit">${selling ? "팔면 들인 돈의 절반을 은행에서 돌려받습니다." : "내 차례에, 턴 종료를 누르기 전까지 팔 수 있습니다."}</p>` : ""}`,
      [{ text: "닫기", action: () => later(ask, 0) }],
    );
    document.querySelectorAll<HTMLButtonElement>("dialog [data-sell]").forEach((button) => {
      button.onclick = () => {
        const dialog = button.closest("dialog")!;
        dialog.close();
        dialog.remove();
        const next = sell(state, 0, Number(button.dataset.sell));
        if (!next) return;
        sound.unlock();
        sound.cash();
        // The offer on the table, if any, is put again once the deeds are closed.
        asked = null;
        state = shown = next;
        if (view) view.sync(state, false);
        update();
        deeds(0);
      };
    });
  }
  /** The choices of my turn come up as dialogs: buy, build, or where to travel. */
  function ask() {
    if (state.turn !== 0 || state !== shown || asked === state || document.querySelector("dialog[open]")) return;
    const me = state.players[0],
      space = SPACES[me.at];
    if (state.phase === "buy" || state.phase === "build") {
      asked = state;
      const building = state.phase === "build",
        level = state.levels[me.at] + 1,
        cost = building ? buildCost(space, level) : space.price,
        short = me.money < cost,
        holdings = state.owners.some((owner, i) => owner === 0 && !(building && i === me.at)),
        detail =
          space.kind === "ship"
            ? `<p>다른 여행자가 이 칸에 서면 통행료 ${won(SHIP_TOLL)}, 우주여행을 떠날 때마다 ${won(TRAVEL_FEE)}을 받습니다.</p>`
            : `<dl class="piece-moves">${[0, 1, 2, 3].map((l) => `<dt>${LEVELS[l]}${l === (building ? level : 0) ? " ◀" : ""}</dt><dd>숙박료 ${won(feeOf(space, l))}</dd>`).join("")}</dl>`;
      modal(
        building ? `${space.name}에 ${LEVELS[level]}을(를) 지을까요?` : `${space.name}을(를) 살까요?`,
        `<p><b>${building ? "짓는 값" : "값"} ${won(cost)}</b> · 가진 돈 ${won(me.money)}</p>${short ? `<p class="tour-short">돈이 ${won(cost - me.money)} 모자랍니다. ${holdings ? "가진 땅을 팔아 마련할 수 있습니다." : "팔 땅도 없어 지나쳐야 합니다."}</p>` : ""}${detail}`,
        short
          ? [
              { text: "지나치기", action: () => act((s) => decide(s, false)) },
              ...(holdings
                ? [
                    {
                      text: "땅 팔아 마련하기",
                      action: () => {
                        // The offer is put again when the deeds are closed.
                        asked = null;
                        deeds(0);
                      },
                    },
                  ]
                : []),
            ]
          : [
              { text: "지나치기", action: () => act((s) => decide(s, false)) },
              { text: building ? `짓기 (${won(cost)})` : `사기 (${won(cost)})`, action: () => act((s) => decide(s, true)) },
            ],
      );
    } else if (state.phase === "travel") {
      asked = state;
      let to = (me.at + 1) % SPACES.length;
      const ship = SPACES.findIndex((s) => s.kind === "ship"),
        owner = state.owners[ship],
        fee = owner > 0 ? `${NAMES[owner]}의 ${SPACES[ship].name}를 타므로 ${won(TRAVEL_FEE)}을 냅니다.` : "지금은 요금이 없습니다.",
        // Listed in the order they lie ahead.
        ahead = SPACES.map((_, k) => (me.at + 1 + k) % SPACES.length).slice(0, -1);
      modal(
        "우주여행 — 어디로 갈까요?",
        `<p>앞으로 어느 칸이든 갈 수 있습니다. 출발을 지나면 월급을 받습니다. ${fee}</p><label class="setting">도착할 칸<select id="tour-dest">${ahead.map((i) => `<option value="${i}">${SPACES[i].name}${SPACES[i].kind === "city" || SPACES[i].kind === "ship" ? (state.owners[i] === -1 ? ` · ${won(SPACES[i].price)}` : ` · ${NAMES[state.owners[i]]}`) : ""}${i < me.at ? " (월급)" : ""}</option>`).join("")}</select></label>`,
        [{ text: "떠나기", action: () => act((s) => travel(s, to)) }],
      );
      const select = document.getElementById("tour-dest") as HTMLSelectElement | null;
      if (select) select.onchange = () => (to = Number(select.value));
    }
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
      if (state.phase === "key") {
        // The computer's card turns over too; it is carried out on the next step.
        const drawn = draw(state, random);
        if (!drawn) return;
        sound.card();
        state = shown = drawn;
        thinking = true;
        update();
        // The card is shown to everyone; it closes by itself after a moment, and then it is carried out.
        const read = () => {
          thinking = false;
          modal(`${NAMES[drawn.turn]}의 황금열쇠`, `<p class="key-card">${LUCK[drawn.card].text}</p>`, [{ text: "확인", action: () => later(computer, 200) }]);
          const shownCard = document.querySelector("dialog");
          later(() => {
            if (shownCard?.isConnected) shownCard.querySelector<HTMLButtonElement>("button")?.click();
          }, 2600);
        };
        if (view) view.revealCard(read);
        else read();
        return;
      }
      const next =
        state.phase === "roll"
          ? roll(state, random)
          : state.phase === "travel"
            ? travel(state, destination(state))
            : state.phase === "card"
              ? follow(state)
              : state.phase === "end"
                ? endTurn(state)
                : decide(state, wants(state));
      if (next) apply(next);
    }, state.phase === "end" ? 350 : 700);
  }
  /** What the step just shown sounded like: money paid, and the special spaces reached. */
  function effects(before: State, now: State) {
    const mover = now.actor,
      there = SPACES[now.players[mover].at].kind,
      arrived = before.players[mover].at !== now.players[mover].at || before.rollId !== now.rollId;
    if (now.players.some((p, i) => p.money < before.players[i].money)) sound.cash();
    if (!arrived) return;
    if (now.phase === "key" && before.phase !== "key") sound.sparkle();
    else if (there === "storm" && now.players[mover].wait > 0 && before.players[mover].wait === 0) sound.waves();
    else if (now.phase === "travel" && before.phase !== "travel") sound.space();
  }
  function present() {
    if (disposed) return;
    if (shown !== state) effects(shown, state);
    shown = state;
    update();
    if (state.phase === "over" && !announced) {
      announced = true;
      if (state.winners.includes(0)) sound.win();
      else sound.lose();
    }
    computer();
    ask();
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
              : s.phase === "travel"
                ? "우주여행 — 갈 곳을 고르세요."
                : s.phase === "roll"
                  ? me.wait > 0
                    ? "무인도에 있습니다. 주사위를 굴려 더블이 나오면 탈출합니다."
                    : s.doubles > 0
                      ? "더블! 한 번 더 굴리세요."
                      : "내 차례 — 주사위를 굴리세요."
                  : s.phase === "end"
                    ? "할 일을 마쳤으면 턴 종료를 누르세요. 그 전에 땅을 팔 수 있습니다."
                    : `내 차례 — ${offer}`
          : s.phase === "roll" && s.doubles > 0
            ? `${NAMES[s.turn]} 더블! 한 번 더 굴립니다…`
            : `${NAMES[s.turn]} 차례…`;
    s.players.forEach((player, i) => {
      const cities = s.owners.filter((owner) => owner === i).length;
      $(`tour-money-${i}`).textContent = player.out
        ? "파산"
        : `${won(player.money)} · 도시 ${cities} · ${SPACES[player.at].name}${player.wait ? ` (쉼 ${player.wait})` : ""}${player.tickets ? ` · 탈출권 ${player.tickets}` : ""}${player.waivers ? ` · 우대권 ${player.waivers}` : ""}`;
      $(`tour-player-${i}`).classList.toggle("active", !over && s.turn === i);
    });
    $<HTMLButtonElement>("tour-roll").hidden = s.phase !== "roll" && !over;
    $<HTMLButtonElement>("tour-roll").disabled = waiting || !mine || s.phase !== "roll";
    $("tour-end").hidden = !(mine && s.phase === "end");
    $<HTMLButtonElement>("tour-end").disabled = waiting;
    $("tour-key").hidden = !(mine && (s.phase === "key" || s.phase === "card" || s.phase === "travel"));
    $("tour-key").textContent = s.phase === "card" ? "카드대로 하기" : s.phase === "travel" ? "갈 곳 고르기" : "황금열쇠 뽑기";
    $<HTMLButtonElement>("tour-key").disabled = waiting;
    $("tour-offer").hidden = !(mine && (s.phase === "buy" || s.phase === "build"));
    $("tour-yes").textContent = s.phase === "buy" ? `사기 (${won(space.price)})` : s.phase === "build" ? `짓기 (${won(buildCost(space, s.levels[me.at] + 1))})` : "";
    $<HTMLButtonElement>("tour-no").disabled = waiting;
    $<HTMLButtonElement>("tour-yes").disabled =
      waiting || me.money < (s.phase === "buy" ? space.price : s.phase === "build" ? buildCost(space, s.levels[me.at] + 1) : 0);
    $("tour-note").textContent = s.note ? `${NAMES[s.actor]}: ${s.note}` : "";
    $("tour-result").hidden = !over;
    if (over)
      $("tour-final").textContent = `${s.winners.map((i) => NAMES[i]).join(", ")} 승리 — ${s.players.map((_, i) => `${NAMES[i]} ${won(worth(s, i))}`).join(" · ")}`;
  }
  function rules() {
    const example = SPACES.find((space) => space.name === "파리")!;
    modal(
      "도시를 사고, 건물을 올리고, 숙박료를 받으세요",
      part("기본 규칙", steps("차례가 오면 주사위 두 개를 굴려 나온 만큼 시계 방향으로 갑니다.", "<b>주인 없는 도시</b>에 서면 표시된 값에 살 수 있습니다.", "<b>내 도시</b>에 다시 서면 건물을 한 단계 올릴 수 있습니다.", "<b>남의 도시</b>에 서면 주인에게 숙박료를 냅니다.", "할 일을 마치면 <b>턴 종료</b>를 눌러 차례를 넘깁니다.", `혼자 남으면 이깁니다. ${ROUNDS}바퀴가 끝나면 <b>가진 돈 + 도시와 건물에 들인 돈의 절반</b>이 가장 많은 사람이 이깁니다.`)) +
        part("주사위", table(["더블", "같은 눈 두 개가 나오면 알림과 효과음이 나오고 한 번 더 굴립니다."], ["세 번 연속 더블", "무인도로 갑니다."], ["무인도에서", "한 차례 쉽니다. 그 차례에 굴려 더블이 나오면 바로 탈출해 그만큼 갑니다."])) +
        part("돈", table(["시작 자금", `${won(START_MONEY)}`], ["월급", `출발 칸을 지나거나 설 때마다 ${won(SALARY)}`], ["숙박료", "그 도시에 <b>들인 돈(땅값 + 건물값)의 1.5배</b>. 일의 자리는 버립니다."], ["팔기", "내 차례에, 턴 종료를 누르기 전까지 내 땅을 들인 돈의 절반에 은행에 팔 수 있습니다."], ["돈이 모자랄 때", "살 돈이 모자라도 구매 창이 뜹니다. <b>땅 팔아 마련하기</b>로 다른 땅을 팔고 살 수 있습니다."], ["파산", "낼 돈이 모자라면 가진 도시를 값싼 것부터 반값에 팔아 메웁니다. 그래도 모자라면 탈락합니다."])) +
        `<h3>건물 (예: ${example.name}, 땅값 ${won(example.price)})</h3><dl class="piece-moves">${[0, 1, 2, 3].map((level) => `<dt>${LEVELS[level]}</dt><dd>${level ? `짓는 값 ${won(buildCost(example, level))} · ` : "깃발만 꽂힌 땅 · "}숙박료 ${won(feeOf(example, level))}</dd>`).join("")}</dl>` +
        part("특별한 칸", `<dl class="piece-moves"><dt>출발</dt><dd>지나가거나 설 때마다 월급 ${won(SALARY)}을 받습니다.</dd><dt>황금열쇠</dt><dd>판 위의 황금열쇠 더미를 눌러 카드 한 장을 뽑고, 내용을 확인한 뒤 따릅니다.</dd><dt>무인도</dt><dd>한 차례 쉽니다. 다만 그 차례에 주사위를 굴려 같은 눈이 나오면 바로 탈출해 그만큼 갑니다.</dd><dt>우주여행</dt><dd>그 자리에서 앞으로 어느 칸이든 골라 갑니다. 출발을 지나면 월급을 받습니다. 콜롬비아호에 주인이 있으면 그 사람에게 ${won(TRAVEL_FEE)}을 냅니다.</dd><dt>콜롬비아호</dt><dd>${won(SPACES.find((space) => space.kind === "ship")!.price)}에 살 수 있는 우주선입니다. 건물은 지을 수 없고, 남이 이 칸에 서면 통행료 ${won(SHIP_TOLL)}, 남이 우주여행을 떠날 때마다 ${won(TRAVEL_FEE)}을 받습니다.</dd><dt>인류평화기금</dt><dd>이 칸에 서면 ${won(FUND_FEE)}을 기금으로 냅니다.</dd><dt>기금 수령</dt><dd>이 칸에 서면 그동안 모인 인류평화기금을 모두 받습니다.</dd></dl>`) +
        part("황금열쇠", table(["상금·벌금", "돈을 받거나 냅니다."], ["이동", "출발·무인도·우주여행·서울·파리로 가거나, 몇 칸 앞뒤로 갑니다. 세계 일주 초대권은 한 바퀴 돌아 제자리로 오고 월급을 받습니다."], ["가진 땅", "건물 수리비(건물 한 단계마다), 재산세(땅 하나마다), 가장 비싼 땅의 반값 매각."], ["다른 여행자", "생일에는 모두에게서 받고, 한턱낼 때는 모두에게 줍니다."], ["기금", "인류평화기금에 기부하거나, 모인 기금을 모두 받습니다."], ["무인도 탈출권", "갖고 있다가 무인도에 갇힐 때 저절로 써서 바로 떠납니다."], ["우대권", "갖고 있다가 다음에 낼 숙박료나 통행료 한 번을 내지 않습니다."])) +
        part("조작과 버튼", table(["주사위 굴리기", "버튼이나 판을 누릅니다."], ["황금열쇠", "판 위의 카드 더미를 누릅니다."], ["사기·짓기·우주여행", "창이 떠서 묻습니다."], ["턴 종료", "판 안 오른쪽 아래의 버튼입니다."], ["땅 증서", "옆 패널의 여행자를 누르면 그 사람이 가진 땅이 국기와 함께 나옵니다. 내 차례에는 내 땅을 팔 수 있습니다."], ["새 게임", "설정 창이 뜹니다. 상대 수를 고르고 새로 시작합니다."])) +
        part("그 밖에", notes(`황금열쇠 카드는 모두 ${LUCK.length}가지입니다.`, "컴퓨터는 숙박료로 낼 돈을 남겨 두고 사고 짓습니다.", "저장과 무르기는 없습니다. 새로고침하면 처음으로 돌아갑니다.")),
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
