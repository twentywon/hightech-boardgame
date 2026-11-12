/**
 * How every table screen is laid out, whatever the game: the buttons that
 * act on the game lie over the table, in its lower right corner, and the panel beside it holds
 * what there is to know (whose turn, the score), headed by the screen's own
 * buttons (rules, camera) and ended by the new-game form, open at all times.
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
  // The buttons that stood over the table go into the panel. 새 게임 is no button any more: its form stands below.
  const bar = document.createElement("div");
  bar.className = "side-actions";
  main.querySelectorAll<HTMLButtonElement>(".game-actions button").forEach((button) => (button.id === "restart" ? button.remove() : bar.append(button)));
  main.querySelector(".game-actions")?.remove();
  const section = document.createElement("section");
  section.className = "side-setup";
  section.setAttribute("aria-label", "새 게임");
  section.innerHTML = `<h3>새 게임</h3><p class="setup-note">고르고 시작하면 지금 하던 게임은 끝납니다.</p><div class="setup-host"></div>`;
  // The screen's own buttons head the panel; the new-game form ends it.
  side.prepend(bar);
  side.append(section);
  setup(section.querySelector<HTMLElement>(".setup-host")!);
  section.querySelectorAll<HTMLButtonElement>(".setup-host button.primary").forEach((button) => (button.textContent = "새 게임 시작"));
  // The collection may have been scrolled; a table always starts at its top.
  scrollTo(0, 0);
}
/** Brings the new-game form into view, for a button elsewhere that offers another game. */
export function revealSetup() {
  const section = document.querySelector<HTMLElement>(".side-setup");
  if (!section) return;
  section.scrollIntoView({ block: "nearest", behavior: "smooth" });
  section.classList.remove("flash");
  // Restart the highlight even when it is asked for twice.
  void section.offsetWidth;
  section.classList.add("flash");
  section.querySelector<HTMLButtonElement>("button.primary")?.focus({ preventScroll: true });
}
