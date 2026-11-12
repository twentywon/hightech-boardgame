/**
 * Repeats the status line inside the game screen, on the player's side of
 * the table, so the game can be followed without looking at the side panel.
 * The panel's live region remains the accessible source; this copy is hidden
 * from assistive technology.
 */
/** True while the collection's thumbnails are being captured: tables are shown without selection marks. */
export const capturing = () => document.documentElement.dataset.capture === "1";
export function mirrorStatus() {
  queueMicrotask(() => {
    const host = document.querySelector(".board-area"),
      text = document.getElementById("turn")?.textContent ?? "";
    if (!host) return;
    let hint = host.querySelector<HTMLElement>(".board-hint");
    if (!hint) {
      hint = document.createElement("div");
      hint.className = "board-hint";
      hint.setAttribute("aria-hidden", "true");
      host.append(hint);
    }
    if (hint.textContent !== text) hint.textContent = text;
    hint.hidden = !text;
  });
}

/**
 * A short, showy line in the middle of the table for something worth a
 * cheer (a piece taken). It is decoration: the status line says the same.
 */
export function cheer(text: string) {
  const board = document.querySelector<HTMLElement>(".board-area");
  if (!board || capturing()) return;
  board.querySelector(".board-cheer")?.remove();
  const el = document.createElement("div");
  el.className = "board-cheer";
  el.setAttribute("aria-hidden", "true");
  el.innerHTML = `<span>${text}</span>${Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg"></i>`).join("")}`;
  board.append(el);
  setTimeout(() => el.remove(), 1900);
}
