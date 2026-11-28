import { CELLS, layout } from "./rules";

/**
 * A small picture of a starting set-up for the setup window's choices: the hexagon of cells as dots, the two sides'
 * marbles in their colours (amber and lapis), on a pale stone plate. Plain SVG, nothing fetched.
 */
export function layoutPicture(variant: string) {
  const cells = layout(variant),
    gap = 3.5,
    row = gap * 0.866,
    cx = 19,
    cy = 15.5,
    dots = CELLS.map((c, i) => {
      const x = cx + (c.q + c.r / 2) * gap,
        y = cy + c.r * row,
        owner = cells[i];
      return owner === null
        ? `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r=".7" fill="#a8977a"/>`
        : `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.45" fill="${owner === 0 ? "#e08a1e" : "#2a4fa8"}" stroke="${owner === 0 ? "#8a4a0c" : "#152a60"}" stroke-width=".45"/>`;
    }).join(""),
    corners = Array.from({ length: 6 }, (_, k) => {
      const a = (k * Math.PI) / 3;
      return `${(cx + Math.cos(a) * 16.8).toFixed(2)},${(cy - Math.sin(a) * 16.8).toFixed(2)}`;
    }).join(" ");
  return `<svg viewBox="0 0 38 31" width="38" height="31" xmlns="http://www.w3.org/2000/svg" focusable="false"><polygon points="${corners}" fill="#e8dcc4" stroke="#9c8a6c" stroke-width="1" stroke-linejoin="round"/>${dots}</svg>`;
}
