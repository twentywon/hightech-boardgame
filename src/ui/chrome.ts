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
  // 새 게임 stays with the other screen buttons over the table and opens the game's own setup in a dialog.
  const restart = main.querySelector<HTMLButtonElement>("#restart");
  if (restart) restart.onclick = () => setupDialog(setup);
}
