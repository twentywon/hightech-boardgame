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
 * What the windows leave out when they are shown (the user asked, step by step): sections on controls and closing
 * remarks, the side panel's buttons (오른쪽 판) and pausing in every game; for some games everything but the basic
 * rules; for others the sections and rows named below. Whatever a text still has of these is dropped here, so that
 * the game's own text need not change.
 */
const DROPPED = ["조작", "조작과 버튼", "그 밖에", "오른쪽 판"],
  PAUSE = /일시\s?정지/,
  BASIC_ONLY = new Set(["minesweeper", "queens-on-the-board", "lights-on", "tower-of-hanoi", "water-pouring", "marble-shot", "peg-solitaire", "2048", "falling-blocks", "table-soccer"]),
  SECTIONS: Record<string, string[]> = {
    "turning-maze": ["판의 것들"],
    "fruit-merge": ["떨어뜨리기"],
    "meat-grill": ["키보드", "고기와 불", "익은 정도와 점수"],
    "river-crossing": ["힌트와 되돌리기"],
    "brick-breaker": ["막대와 공", "시작 단계", "점수"],
  },
  ROWS: Record<string, string[]> = { "meat-grill": ["고르기"] };
export function shownGuide(html: string, game = typeof document === "undefined" ? "" : (document.documentElement.dataset.game ?? "")) {
  const title = (section: string) => /^<h3>(.*?)<\/h3>/.exec(section)?.[1] ?? "",
    sections = SECTIONS[game] ?? [],
    rows = ROWS[game] ?? [];
  return html
    .split(/(?=<h3>)/)
    .filter((section) => {
      const name = title(section);
      if (!name) return true;
      if (BASIC_ONLY.has(game)) return name === "기본 규칙";
      return !DROPPED.includes(name) && !sections.includes(name) && !PAUSE.test(name);
    })
    .map((section) =>
      section
        // Rows and points about pausing, and the rows named for this game.
        .replace(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/gs, (row, term: string, text: string) => (PAUSE.test(term) || PAUSE.test(text) || rows.includes(term) ? "" : row))
        .replace(/<li>(.*?)<\/li>/gs, (item, text: string) => (PAUSE.test(text) ? "" : item))
        .replace(/<dl class="piece-moves"><\/dl>|<ul><\/ul>|<ol><\/ol>/g, ""),
    )
    .filter((section) => section.replace(/^<h3>.*?<\/h3>/, "").trim() !== "")
    .join("");
}
