/**
 * Building blocks of the "게임 방법" windows, so that every game explains
 * itself in the same order: basic rules, terms in tables, advice, controls,
 * buttons.
 */
export const part = (title: string, body: string) => `<h3>${title}</h3>${body}`;
/** Numbered steps, for what happens in order. */
export const steps = (...items: string[]) => `<ol>${items.map((item) => `<li>${item}</li>`).join("")}</ol>`;
/** Loose points, for advice and remarks. */
export const notes = (...items: string[]) => `<ul>${items.map((item) => `<li>${item}</li>`).join("")}</ul>`;
/** A two-column table: a term and what it means. */
export const table = (...rows: [string, string][]) =>
  `<dl class="piece-moves">${rows.map(([term, text]) => `<dt>${term}</dt><dd>${text}</dd>`).join("")}</dl>`;
/**
 * The windows no longer carry sections on controls or closing remarks (the
 * user asked for them to go): whatever a text still has under these titles
 * is left out when it is shown.
 */
const DROPPED = ["조작", "조작과 버튼", "그 밖에"];
export function shownGuide(html: string) {
  return html
    .split(/(?=<h3>)/)
    .filter((section) => !DROPPED.some((title) => section.startsWith(`<h3>${title}</h3>`)))
    .join("");
}
