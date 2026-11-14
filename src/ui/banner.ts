import stamp from "../assets/bankrupt.webp?inline";
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
  // The same heavy white letters as a check (the user asked for one look).
  shout(text);
}

/** A word across the middle of the table, white and heavy, for a moment: check in chess, 장군 in janggi. */
export function shout(text: string) {
  const board = document.querySelector<HTMLElement>(".board-area");
  if (!board || capturing()) return;
  board.querySelector(".board-shout")?.remove();
  const el = document.createElement("div");
  el.className = "board-shout";
  el.setAttribute("aria-hidden", "true");
  el.textContent = text;
  board.append(el);
  setTimeout(() => el.remove(), 1500);
}

/**
 * The 파산 stamp (the user's own picture) for a player who has run out of
 * money. Without a target it comes down large in the middle of the table and
 * fades after a few seconds; with one (a player's row in the panel) it stays
 * there, small, as that player's mark.
 */
export function bankrupt(target?: HTMLElement) {
  if (capturing()) return;
  const host = target ?? document.querySelector<HTMLElement>(".board-area");
  if (!host || host.querySelector(".bankrupt-stamp")) return;
  const el = document.createElement("img");
  el.className = `bankrupt-stamp${target ? " small" : ""}`;
  el.src = stamp;
  el.alt = "";
  el.setAttribute("aria-hidden", "true");
  host.append(el);
  if (!target) setTimeout(() => el.remove(), 3600);
}
