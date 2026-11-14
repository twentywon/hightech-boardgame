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
  // What the player presses to play goes onto the table, in the order given.
  const box = document.createElement("div");
  box.className = "board-controls";
  for (const selector of controls) side.querySelectorAll<HTMLElement>(selector).forEach((el) => box.append(el));
  // Buttons a screen already laid over its table join them, so that all stand in one corner.
  board.querySelectorAll<HTMLElement>(":scope > .pg-tools, :scope > .bg-acting, :scope > .tour-end").forEach((el) => box.append(el));
  board.append(box);
  // Leaving and the settings are two round buttons in the table's upper left corner; the page's own bar
  // and the game's name are not shown at a table (both stay for readers and the keyboard).
  const nav = document.createElement("div");
  nav.className = "board-nav";
  const back = main.querySelector<HTMLButtonElement>("#back");
  if (back) {
    back.textContent = "←";
    back.setAttribute("aria-label", "← 컬렉션");
    back.className = "board-icon";
    nav.append(back);
  }
  const settings = document.querySelector<HTMLButtonElement>("#app > header #settings");
  if (settings) {
    settings.className = "board-icon";
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
  const result = side.querySelector<HTMLElement>(".yd-result");
  if (result)
    new MutationObserver(() => {
      if (result.hidden) delete result.dataset.told;
      else if (!result.dataset.told) {
        result.dataset.told = "1";
        announce(
          () => (result.isConnected && !result.hidden ? (result.querySelector("p")?.textContent ?? "") : ""),
          setup,
          () => (result.dataset.outcome as Outcome | undefined) ?? "win",
        );
      }
    }).observe(result, { attributes: true, attributeFilter: ["hidden"] });
  // 새 게임 stays with the other screen buttons over the table and opens the game's own setup in a dialog.
  const restart = main.querySelector<HTMLButtonElement>("#restart");
  if (restart) restart.onclick = () => setupDialog(setup);
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
  if (!RESULT_WINDOWS) return;
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
