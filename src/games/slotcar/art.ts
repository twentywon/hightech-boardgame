import { buildTrack, laneAt } from "./track";

/**
 * A course seen from above for the setup's choice buttons: its line drawn in the button's ink, the pass over the
 * bridge drawn last with a pale edge so that the crossing reads as one track over the other. Free of the page.
 */
export function coursePicture(value: string) {
  const track = buildTrack(value, 4),
    b = track.bounds,
    W = 52,
    H = 26,
    pad = 3,
    k = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxY - b.minY)),
    ox = (W - (b.maxX - b.minX) * k) / 2,
    oy = (H - (b.maxY - b.minY) * k) / 2,
    low: string[] = [],
    high: string[] = [];
  let last: "low" | "high" | null = null;
  for (const seg of track.segments)
    for (let i = 0; i <= 8; i++) {
      const p = laneAt(seg, i / 8, 0),
        x = (ox + (p.x - b.minX) * k).toFixed(1),
        y = (H - oy - (p.y - b.minY) * k).toFixed(1),
        kind = p.h > 0.5 ? "high" : "low",
        list = kind === "high" ? high : low;
      list.push(`${last === kind ? "L" : "M"}${x} ${y}`);
      last = kind;
    }
  const line = (d: string[], stroke: string, width: number) => `<path d="${d.join(" ")}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" focusable="false">${line(low, "currentColor", 2.4)}${line(high, "#ffffffd0", 5)}${line(high, "currentColor", 2.4)}</svg>`;
}
