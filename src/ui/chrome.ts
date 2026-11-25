import { capturing, mirrorStatus } from "./banner";
import { modal, setupDialog } from "./dialog";
import winArt from "../assets/result/win.svg?raw";
import loseArt from "../assets/result/lose.svg?raw";
import drawArt from "../assets/result/draw.svg?raw";
/**
 * How every table screen is laid out, whatever the game: the buttons that
 * act on the game lie over the table, in a corner of it, and the panel beside
 * it holds only what there is to know (whose turn, the score). The screen's
 * own buttons (rules, camera, new game) stay in the bar over the table.
 */
export function dress(setup: (host: HTMLElement) => void, controls: string[] = []) {
  const main = document.querySelector<HTMLElement>("main.game-layout"),
    board = main?.querySelector<HTMLElement>(".board-area"),
    side = main?.querySelector<HTMLElement>("aside.game-sidebar");
  if (!main || !board || !side) return;
  // For these games the panel beside the table is gone: what it says is written over the table itself.
  const game = document.documentElement.dataset.game ?? "";
  if (HUD.has(game)) {
    main.classList.add("hud");
    if (INK.has(game)) main.classList.add("hud-ink");
  }
  // What the player presses to play goes onto the table, in the order given.
  const box = document.createElement("div");
  box.className = "board-controls";
  for (const selector of controls) side.querySelectorAll<HTMLElement>(selector).forEach((el) => box.append(el));
  // Buttons a screen already laid over its table join them, so that all stand in one corner.
  board.querySelectorAll<HTMLElement>(":scope > .pg-tools, :scope > .bg-acting, :scope > .tour-end").forEach((el) => box.append(el));
  board.append(box);
  // Leaving is a 나가기 button at the left of the bar over the table, the line of 게임 방법 (the user asked; the
  // arrow in the table's corner is gone), and the settings a round button in the table's upper left corner; the
  // page's own bar and the game's name are not shown at a table (both stay for readers and the keyboard).
  const nav = document.createElement("div");
  nav.className = "board-nav";
  const back = main.querySelector<HTMLButtonElement>("#back");
  if (back) {
    back.textContent = "나가기";
    back.removeAttribute("aria-label");
    back.className = "";
    const exit = document.createElement("div");
    // Not ".game-actions": screens look that one up to add their own buttons (the Wi-Fi room) beside 새 게임.
    exit.className = "game-exit";
    exit.append(back);
    const top = main.querySelector<HTMLElement>(".game-top");
    (top?.querySelector<HTMLElement>(":scope > div:first-child") ?? top)?.prepend(exit);
  }
  const settings = document.querySelector<HTMLButtonElement>("#app > header #settings");
  if (settings) {
    settings.className = "board-icon";
    settings.innerHTML = GEAR_ICON;
    nav.append(settings);
  }
  board.append(nav);
  main.querySelector(".game-top h1")?.classList.add("sr-only");
  // No English title and no small print over the table: what the game was set up as is told in the panel.
  const label = board.querySelector(".board-label"),
    mode = label?.querySelector("span:last-child")?.textContent?.trim();
  label?.remove();
  if (mode) {
    const line = document.createElement("p");
    line.className = "side-mode";
    // Not shown: the user asked for the panel to open with what is going on, not with a line about the rules.
    line.hidden = true;
    line.textContent = mode;
    side.prepend(line);
  }
  // When the game is over its result comes up in a window, with a way to another game. The panel's own
  // result block (shown at that moment) is what is read.
  const result = side.querySelector<HTMLElement>(".yd-result"),
    // A puzzle tells its result in its own panel and offers the next stage there (the user asked): no finale.
    puzzle = !!side.querySelector(".puzzle-panel");
  if (result && !puzzle)
    new MutationObserver(() => {
      if (result.hidden) {
        delete result.dataset.told;
        board.querySelector(".board-finale")?.remove();
      }
      else if (!result.dataset.told) {
        result.dataset.told = "1";
        announce(
          () => (result.isConnected && !result.hidden ? (result.querySelector("p")?.textContent ?? "") : ""),
          setup,
          () => (result.dataset.outcome as Outcome | undefined) ?? "win",
        );
      }
    }).observe(result, { attributes: true, attributeFilter: ["hidden"] });
  // With no window at the end, the result is told where the turn was: the status line takes the result block's sentence
  // (and keeps it, whatever the screen writes there afterwards) for as long as the block is shown.
  const turn = side.querySelector<HTMLElement>("#turn");
  if (result && turn && !RESULT_WINDOWS) {
    const tell = () => {
      const line = result.hidden ? "" : (result.querySelector("p")?.textContent ?? "");
      if (line && turn.textContent !== line) {
        turn.textContent = line;
        mirrorStatus();
      }
    };
    new MutationObserver(tell).observe(result, { attributes: true, attributeFilter: ["hidden"], childList: true, subtree: true, characterData: true });
    new MutationObserver(tell).observe(turn, { childList: true, characterData: true, subtree: true });
  }
  // 새 게임 stays with the other screen buttons over the table and opens the game's own setup in a dialog.
  const restart = main.querySelector<HTMLButtonElement>("#restart");
  if (restart) restart.onclick = () => setupDialog(setup);
}

/**
 * Games whose panel is not shown beside the table: its words (players, scores, chips, counts) stand over the
 * table's lower left as plain lettering, as in chess and janggi (the user asked). `INK` games have a light
 * table and take dark letters.
 */
const HUD = new Set(["gomoku", "reversi", "chess", "blackjack", "seotda", "seven-poker", "texas-holdem", "janggi", "yut-nori", "hexa-germ-war", "dots-and-boxes", "mancala", "spider", "klondike", "freecell", "world-tour", "battleship", "indian-poker", "table-soccer", "air-hockey", "table-tennis", "badminton", "falling-blocks", "brick-breaker", "minesweeper", "fruit-merge", "meat-grill", "go", "darts", "nim", "tactical-battle", "carom-billiards", "laser-chess", "continent-conquest", "hex-conquest", "hula"]),
  INK = new Set(["minesweeper", "fruit-merge", "falling-blocks", "mancala"]);
/** The settings button in the table's corner is a bare white sign with a faint shadow, drawn thick (the user asked). */
const GEAR_ICON = `<svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

/**
 * The end of a game, told in the middle of the table (the user asked): 승리, 패배 or 무승부 in large letters, and
 * after a moment 다시 하기 (the game's own new-game window) and 다른 게임 (back to the collection) under it.
 * It stays until one is pressed or the game is begun again; the table itself can still be looked at round it.
 */
/** Games that end when their clock runs out: their end says so instead of a win or a loss. Basketball's run is
 *  lost when a stage's clock runs out first and won when every stage is made. */
const TIMED: Record<string, Partial<Record<Outcome, string>>> = {
  "meat-grill": { win: "시간 종료", lose: "시간 종료", draw: "시간 종료" },
  "whack-a-mole": { win: "시간 종료", lose: "시간 종료", draw: "시간 종료" },
  fishing: { win: "시간 종료", lose: "시간 종료", draw: "시간 종료" },
  // 핀볼 is a score: its end is the last ball drained.
  pinball: { win: "게임 종료", lose: "게임 종료", draw: "게임 종료" },
  // 스노보드 is a timed run: its end is the clock running out.
  snowboard: { win: "시간 종료", lose: "시간 종료", draw: "시간 종료" },
  basketball: { win: "성공", lose: "시간 종료" },
  // 사격 is a score: its end is the end of the round (pellets, clays, or the hunt's clock or cartridges).
  shooting: { win: "사격 종료", lose: "사격 종료", draw: "사격 종료" },
  // 슬롯 카: first home is 우승; any other place against the computer is the race's end, not a defeat.
  "slot-car": { win: "우승", lose: "레이스 종료" },
};
export function finale(outcome: Outcome, setup?: (host: HTMLElement) => void) {
  const board = document.querySelector<HTMLElement>(".board-area");
  if (!board || capturing()) return;
  board.querySelector(".board-finale")?.remove();
  // The match's own end is told alone: a set's word still standing goes.
  board.querySelectorAll(".board-interlude").forEach((el) => el.remove());
  const box = document.createElement("div"),
    word = document.createElement("b"),
    ways = document.createElement("div"),
    again = document.createElement("button"),
    other = document.createElement("button");
  box.className = `board-finale ${outcome}`;
  word.className = "finale-word";
  word.setAttribute("aria-hidden", "true");
  // A game whose clock simply runs out is neither won nor lost.
  word.textContent = TIMED[document.documentElement.dataset.game ?? ""]?.[outcome] ?? ART[outcome].word;
  ways.className = "finale-ways";
  ways.hidden = true;
  again.id = "finale-again";
  again.className = "primary";
  again.textContent = "다시 하기";
  other.id = "finale-other";
  other.textContent = "다른 게임";
  again.onclick = () => {
    box.remove();
    if (setup) setupDialog(setup);
    else document.querySelector<HTMLButtonElement>("#restart")?.click();
  };
  other.onclick = () => {
    box.remove();
    document.querySelector<HTMLButtonElement>("#back")?.click();
  };
  ways.append(again, other);
  box.append(word, ways);
  board.append(box);
  setTimeout(() => {
    if (box.isConnected) ways.hidden = false;
  }, 1300);
  // A new game begun on the same table (or a move taken back) changes the count: the finale goes.
  const count = document.querySelector("#move-count");
  if (count) {
    const watch = new MutationObserver(() => {
      watch.disconnect();
      box.remove();
    });
    watch.observe(count, { childList: true, characterData: true, subtree: true });
  }
}

/**
 * How a set (a game, an end) of a match ended, for the person at the screen: `word` large (`2세트 승리`), coloured as
 * the finale colours `outcome`, and `detail` small under it (`28 : 27 · 세트점 4 : 0`).
 */
export interface SetResult {
  outcome: Outcome;
  word: string;
  detail?: string;
}
/** How long a set's word stands, fade included (ms). */
export const INTERLUDE_MS = 2400;
/**
 * A set of a match is over (the user asked): its word stands in the middle of the table for about two seconds and
 * fades, with no buttons and taking no input. It is decoration (aria-hidden: the panel says the same in words), off
 * while `capturing()`, and never stands over the match's own `finale`. A word called out a moment before (an arrow's
 * value) is let finish first; one called out while it stands takes its place.
 */
export function interlude(outcome: Outcome, word: string, detail = "") {
  const at = () => {
    const board = document.querySelector<HTMLElement>(".board-area");
    return board?.isConnected && !capturing() && !board.querySelector(".board-finale") ? board : null;
  };
  const show = () => {
    const board = at();
    if (!board) return;
    // The word before it is fading by now.
    board.querySelectorAll(".board-interlude, .board-shout").forEach((el) => el.remove());
    const box = document.createElement("div"),
      big = document.createElement("b"),
      small = document.createElement("span");
    box.className = `board-interlude ${outcome}`;
    box.dataset.outcome = outcome;
    box.setAttribute("aria-hidden", "true");
    big.className = "interlude-word";
    big.textContent = word;
    small.className = "interlude-detail";
    small.textContent = detail;
    small.hidden = !detail;
    box.append(big, small);
    board.append(box);
    const watch = new MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes].some((n) => n instanceof HTMLElement && n.classList.contains("board-shout")))) box.remove();
    });
    watch.observe(board, { childList: true });
    setTimeout(() => {
      watch.disconnect();
      box.remove();
    }, INTERLUDE_MS);
  };
  if (!at()) return;
  if (at()!.querySelector(".board-shout")) setTimeout(show, 1150);
  else show();
}

export type Outcome = "win" | "lose" | "draw";
const ART: Record<Outcome, { picture: string; word: string }> = {
  win: { picture: winArt, word: "승리" },
  lose: { picture: loseArt, word: "패배" },
  draw: { picture: drawArt, word: "무승부" },
};
/**
 * The picture that heads a result window: a trophy in a burst of light and
 * confetti for a win, a crying face under falling rain for a loss, a
 * handshake for a draw. The pictures are Twemoji (CC BY 4.0, see
 * `public/emoji-license.txt`), inlined.
 */
export function resultArt(outcome: Outcome) {
  const { picture, word } = ART[outcome],
    bits = Array.from({ length: outcome === "draw" ? 0 : 18 }, (_, i) => `<i style="--i:${i};--x:${(i * 37) % 100}"></i>`).join("");
  return `<div class="result-art ${outcome}" aria-hidden="true"><span class="result-glow"></span>${bits}<span class="result-picture">${picture}</span><b class="result-word">${word}</b></div>`;
}
/**
 * Says how a game ended in a window, once the table has come to rest and no
 * other window is open. `text` is asked for at that moment and may answer
 * with nothing when the result no longer stands (a move taken back);
 * `outcome` says, for the person at the screen, whether to cheer or to mourn.
 */
/** False while the user wants no window at the end of a game: the result stays in the status line and the panel. */
export const RESULT_WINDOWS = false;
export function announce(text: () => string, setup?: (host: HTMLElement) => void, outcome: () => Outcome = () => "win") {
  if (!RESULT_WINDOWS) {
    // No window: the result's word comes up in the middle of the table, and then the ways on under it.
    const wait = () => {
      const board = document.querySelector<HTMLElement>(".board-area");
      if (!board?.isConnected) return;
      if (document.querySelector("dialog[open]") || document.querySelector("#board[data-animating='true']")) {
        setTimeout(wait, 300);
        return;
      }
      if (text()) finale(outcome(), setup);
    };
    setTimeout(wait, 700);
    return;
  }
  const show = () => {
    if (document.querySelector("dialog[open]")) {
      setTimeout(show, 400);
      return;
    }
    const line = text();
    if (!line) return;
    // Brief and large: the first sentence is the result, the rest stands small under it.
    const cut = /^(.*?[.!?])\s+(.+)$/s.exec(line),
      body = document.createElement("p"),
      head = document.createElement("b"),
      rest = document.createElement("span");
    body.className = "result-text";
    head.textContent = cut ? cut[1] : line;
    rest.textContent = cut ? cut[2] : "";
    body.append(head, ...(cut ? [rest] : []));
    modal("게임 결과", resultArt(outcome()) + body.outerHTML, [
      { text: "확인", action: () => {} },
      ...(setup ? [{ text: "새 게임", action: () => setupDialog(setup) }] : []),
    ]);
  };
  setTimeout(show, 900);
}
