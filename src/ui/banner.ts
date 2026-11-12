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
