import { revealSetup } from "./chrome";
import { shownGuide } from "./guide";
export function modal(
  title: string,
  body: string,
  actions: { text: string; action: () => void }[] = [
    { text: "확인", action: () => {} },
  ],
) {
  document.querySelector("dialog")?.remove();
  const d = document.createElement("dialog");
  d.innerHTML = `<div class="eyebrow">WORLD TABLE GAMES</div><h2>${title}</h2><div class="dialog-body">${shownGuide(body)}</div><div class="dialog-actions">${actions.map((a, i) => `<button ${i === actions.length - 1 ? 'class="primary"' : ""}>${a.text}</button>`).join("")}</div>`;
  document.body.append(d);
  // Only the action row: a body may carry buttons of its own.
  d.querySelectorAll<HTMLButtonElement>(".dialog-actions button").forEach(
    (b, i) =>
      (b.onclick = () => {
        d.close();
        d.remove();
        actions[i].action();
      }),
  );
  d.addEventListener("cancel", () => d.remove());
  d.showModal();
}
/**
 * Offers a game's own setup panel in a dialog, for starting anew from the
 * table. `fill` draws the panel into the host; its start button closes the
 * dialog once it has read the choices.
 */
export function setupDialog(_fill?: (host: HTMLElement) => void) {
  // The form is no window any more: it stands open in the panel beside the table (`dress`).
  revealSetup();
}
