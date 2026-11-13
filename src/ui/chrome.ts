import { setupDialog } from "./dialog";
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
    line.textContent = mode;
    side.prepend(line);
  }
  // 새 게임 stays with the other screen buttons over the table and opens the game's own setup in a dialog.
  const restart = main.querySelector<HTMLButtonElement>("#restart");
  if (restart) restart.onclick = () => setupDialog(setup);
}
