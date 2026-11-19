import { fbm, hash, type WorldMap } from "./map";
import { FONT, PAINT_H, PAINT_W, overlayOf, rgb, roundRect, type Overlay, type Plate } from "./paint";

/**
 * The map of the real world painted for the table, once a game, in a clean modern relief style of our own: a soft
 * blue sea, lighter over the shallows by the coasts with a pale rim along them; land in a muted tint of its
 * continent, shaded by its mountain ranges (traced from real geography) and by hills of noise; real coastlines in a
 * fine dark line; thin borders between regions and darker, wider ones between continents; the crossings by sea
 * dashed; every region's name on a small plate placed where it covers least, and every continent's name and bonus
 * in the sea beside it. Also what the view needs to lay each player's colour along the borders (`overlay`) and where
 * the names were written (`plates`).
 */
/** Muted land tints of our own, one a continent: sage, mint, stone, wheat, lavender, clay. */
export const WORLD_TINTS = ["#b4c891", "#93c3ae", "#d7c8b2", "#e3c58b", "#c5b3d2", "#e2ad98"];
const INERT = "#d3cdbf";
/** The sea, from the shallows by the coasts to the open ocean. */
const SHALLOW = rgb("#9dcfdc"),
  MIDDLE = rgb("#78b2cf"),
  DEEP = rgb("#5891bb");
/** Points looked at round a point of land for its coast and borders: x, y, weight. */
const RING = [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1, 1, 1, 0.6, -1, 1, 0.6, 1, -1, 0.6, -1, -1, 0.6, 2, 0, 0.42, -2, 0, 0.42, 0, 2, 0.42, 0, -2, 0.42];
/** Even–odd scanline fill of rings (grid units) at `ppc` pixels a cell: every pixel whose middle is inside gets `value`. */
export function fillRings(ids: Int16Array, W: number, H: number, ppc: number, rings: Float32Array[], value: number) {
  const rows: number[][] = [];
  let lo = H,
    hi = -1;
  for (const ring of rings)
    for (let i = 0, n = ring.length, j = n - 2; i < n; j = i, i += 2) {
      const x1 = ring[j] * ppc,
        y1 = ring[j + 1] * ppc,
        x2 = ring[i] * ppc,
        y2 = ring[i + 1] * ppc;
      if (y1 === y2) continue;
      const a = Math.max(0, Math.ceil(Math.min(y1, y2) - 0.5)),
        b = Math.min(H - 1, Math.ceil(Math.max(y1, y2) - 0.5) - 1);
      for (let y = a; y <= b; y++) (rows[y] ??= []).push(x1 + ((y + 0.5 - y1) * (x2 - x1)) / (y2 - y1));
      if (a < lo) lo = a;
      if (b > hi) hi = b;
    }
  for (let y = lo; y <= hi; y++) {
    const xs = rows[y];
    if (!xs) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.max(0, Math.ceil(xs[k] - 0.5)),
        b = Math.min(W - 1, Math.ceil(xs[k + 1] - 0.5) - 1);
      if (b >= a) ids.fill(value, y * W + a, y * W + b + 1);
    }
  }
}
/** Chamfer distances (in points of the grid) from every point to the nearest point where `target` is true. */
function chamfer(target: Uint8Array, w: number, h: number) {
  const d = new Float32Array(w * h);
  for (let k = 0; k < d.length; k++) d[k] = target[k] ? 0 : 1e6;
  const D = 1,
    E = Math.SQRT2;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const k = y * w + x;
      let v = d[k];
      if (x > 0) v = Math.min(v, d[k - 1] + D);
      if (y > 0) {
        v = Math.min(v, d[k - w] + D);
        if (x > 0) v = Math.min(v, d[k - w - 1] + E);
        if (x < w - 1) v = Math.min(v, d[k - w + 1] + E);
      }
      d[k] = v;
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const k = y * w + x;
      let v = d[k];
      if (x < w - 1) v = Math.min(v, d[k + 1] + D);
      if (y < h - 1) {
        v = Math.min(v, d[k + w] + D);
        if (x < w - 1) v = Math.min(v, d[k + w + 1] + E);
        if (x > 0) v = Math.min(v, d[k + w - 1] + E);
      }
      d[k] = v;
    }
  return d;
}
/** A field of a coarse grid (`step` pixels a point) read between its points. */
function sampler(field: Float32Array, w: number, h: number, step: number) {
  return (px: number, py: number) => {
    const x = Math.max(0, Math.min(w - 1.001, px / step - 0.5)),
      y = Math.max(0, Math.min(h - 1.001, py / step - 0.5)),
      i = Math.floor(x),
      j = Math.floor(y),
      fx = x - i,
      fy = y - j,
      k = j * w + i;
    return (field[k] * (1 - fx) + field[k + 1] * fx) * (1 - fy) + (field[k + w] * (1 - fx) + field[k + w + 1] * fx) * fy;
  };
}
export function paintWorld(map: WorldMap): { canvas: HTMLCanvasElement; overlay: Overlay; plates: Plate[] } {
  const W = PAINT_W,
    H = PAINT_H,
    ppc = W / map.cols,
    shapes = map.shapes!,
    n = map.territories.length;
  // Which region every point shows (-2: land of no region).
  const ids = new Int16Array(W * H).fill(-1);
  for (const ring of map.inert ?? []) fillRings(ids, W, H, ppc, [ring], -2);
  shapes.forEach((rings, t) => fillRings(ids, W, H, ppc, rings, t));
  // How much of each point is land, drawn smooth by the canvas, for coastlines without steps.
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  for (const rings of [...shapes, ...(map.inert ?? []).map((r) => [r])]) {
    ctx.beginPath();
    for (const ring of rings) {
      ctx.moveTo(ring[0] * ppc, ring[1] * ppc);
      for (let i = 2; i < ring.length; i += 2) ctx.lineTo(ring[i] * ppc, ring[i + 1] * ppc);
      ctx.closePath();
    }
    ctx.fill("evenodd");
  }
  const cover = ctx.getImageData(0, 0, W, H).data;
  ctx.clearRect(0, 0, W, H);
  // Coarser fields, a point every STEP pixels: how far from the coast on either side, and the relief.
  const STEP = 2,
    CW = W / STEP,
    CH = H / STEP,
    land = new Uint8Array(CW * CH),
    sea = new Uint8Array(CW * CH);
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const on = ids[(y * STEP + STEP / 2) * W + x * STEP + STEP / 2] !== -1;
      land[y * CW + x] = on ? 1 : 0;
      sea[y * CW + x] = on ? 0 : 1;
    }
  const toLand = chamfer(land, CW, CH),
    toSea = chamfer(sea, CW, CH),
    relief = new Float32Array(CW * CH),
    cells = STEP / ppc;
  // Mountain ranges: a crest falling away to either side, the highest of those near a point.
  for (const ridge of map.ridges ?? []) {
    const pts = ridge.points,
      wide = (ridge.width * ppc) / STEP;
    for (let i = 0; i < pts.length; i += 2) {
      const ax = (pts[i] * ppc) / STEP,
        ay = (pts[i + 1] * ppc) / STEP,
        bx = i + 2 < pts.length ? (pts[i + 2] * ppc) / STEP : ax,
        by = i + 2 < pts.length ? (pts[i + 3] * ppc) / STEP : ay;
      if (i + 2 >= pts.length && pts.length > 2) break;
      const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - wide * 2.6)),
        x1 = Math.min(CW - 1, Math.ceil(Math.max(ax, bx) + wide * 2.6)),
        y0 = Math.max(0, Math.floor(Math.min(ay, by) - wide * 2.6)),
        y1 = Math.min(CH - 1, Math.ceil(Math.max(ay, by) + wide * 2.6)),
        dx = bx - ax,
        dy = by - ay,
        len2 = dx * dx + dy * dy;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++) {
          const t = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0,
            d = Math.hypot(x - ax - dx * t, y - ay - dy * t) / wide,
            // A crest that wanders a little along its length.
            h = ridge.height * Math.exp(-d * d) * (0.75 + 0.5 * fbm(x * cells, y * cells, map.seed + 41, 1.3)),
            k = y * CW + x;
          if (h > relief[k]) relief[k] = h;
        }
    }
  }
  for (let k = 0; k < relief.length; k++) {
    if (!land[k]) continue;
    const x = (k % CW) * cells,
      y = Math.floor(k / CW) * cells,
      inland = Math.min(1, toSea[k] / 12);
    // Hills everywhere, lower by the coasts.
    relief[k] = relief[k] * (0.55 + 0.45 * Math.min(1, toSea[k] / 6)) + fbm(x, y, map.seed + 5, 0.9) * 0.07 * inland + fbm(x, y, map.seed + 9, 0.3) * 0.025;
  }
  // The relief lit from the upper left.
  const shine = new Float32Array(CW * CH);
  for (let y = 0; y < CH; y++)
    for (let x = 0; x < CW; x++) {
      const at = (i: number, j: number) => relief[Math.max(0, Math.min(CH - 1, j)) * CW + Math.max(0, Math.min(CW - 1, i))],
        gx = (at(x + 1, y) - at(x - 1, y)) / 2,
        gy = (at(x, y + 1) - at(x, y - 1)) / 2;
      shine[y * CW + x] = Math.max(0.8, Math.min(1.13, 1 + (-gx - gy) * 1.25 * STEP + (at(x, y) - 0.25) * 0.06));
    }
  const lightAt = sampler(shine, CW, CH, STEP),
    heightAt = sampler(relief, CW, CH, STEP),
    shoreAt = sampler(toLand, CW, CH, STEP),
    inlandAt = sampler(toSea, CW, CH, STEP);
  const tints = WORLD_TINTS.map(rgb),
    inertTint = rgb(INERT),
    snow = rgb("#f3efe6"),
    coastInk = rgb("#34525f"),
    borderInk = rgb("#5d5346"),
    continentInk = rgb("#3a3128"),
    image = ctx.createImageData(W, H),
    data = image.data,
    regionShade = Array.from({ length: n }, (_, t) => 1 + (((t * 7) % 5) - 2) * 0.026),
    continentOf = map.territories.map((t) => t.continent),
    offsets = Array.from({ length: RING.length / 3 }, (_, m) => RING[m * 3 + 1] * W + RING[m * 3]);
  // The land colour of a point of region `t` (-2 for land of no region).
  const landColour = (t: number, px: number, py: number, out: number[]) => {
    const tint = t >= 0 ? tints[continentOf[t] % tints.length] : inertTint,
      shade = t >= 0 ? regionShade[t] : 1,
      light = lightAt(px, py),
      h = heightAt(px, py),
      grain = (hash(px >> 1, py >> 1, map.seed) - 0.5) * 6,
      high = Math.max(0, Math.min(1, (h - 0.6) * 2.2));
    for (let c = 0; c < 3; c++) out[c] = (tint[c] * shade * (1 - high * 0.45) + snow[c] * high * 0.45) * light + grain;
  };
  const colour = [0, 0, 0];
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const p = py * W + px,
        q = p * 4;
      let t = ids[p],
        c = cover[q + 3] / 255;
      // The canvas leaves faint seams where two countries of a region meet: only a point by the sea is part sea.
      if (t !== -1 && c < 1 && px > 0 && py > 0 && px < W - 1 && py < H - 1 && ids[p - 1] !== -1 && ids[p + 1] !== -1 && ids[p - W] !== -1 && ids[p + W] !== -1 && ids[p - W - 1] !== -1 && ids[p - W + 1] !== -1 && ids[p + W - 1] !== -1 && ids[p + W + 1] !== -1) c = 1;
      // The sea: shallow by the coasts, deep in the open, with a faint swell and a pale rim along the shore.
      const d = shoreAt(px, py),
        k = Math.min(1, d / 9),
        e = Math.min(1, Math.max(0, (d - 9) / 26)),
        swell = (fbm(px / ppc, py / ppc, map.seed + 3, 2.2) - 0.5) * 6,
        rim = Math.max(0, 1 - d / 2.4) * 0.16;
      let r = SHALLOW[0] + (MIDDLE[0] - SHALLOW[0]) * k + (DEEP[0] - MIDDLE[0]) * e + swell,
        g = SHALLOW[1] + (MIDDLE[1] - SHALLOW[1]) * k + (DEEP[1] - MIDDLE[1]) * e + swell,
        b = SHALLOW[2] + (MIDDLE[2] - SHALLOW[2]) * k + (DEEP[2] - MIDDLE[2]) * e + swell;
      r += (246 - r) * rim;
      g += (251 - g) * rim;
      b += (250 - b) * rim;
      if (t === -1 && c > 0) {
        // An edge point whose middle is at sea takes the land of a neighbour.
        for (const o of [-1, 1, -W, W]) {
          const m = ids[p + o];
          if (m !== undefined && m !== -1) {
            t = m;
            break;
          }
        }
      }
      if (t !== -1 && c > 0) {
        landColour(t, px, py, colour);
        let lr = colour[0],
          lg = colour[1],
          lb = colour[2];
        // Coastlines in a fine dark line, borders between regions finer still, between continents darker and wider.
        let coast = 0,
          border = 0,
          divide = 0;
        const inside = px >= 2 && py >= 2 && px < W - 2 && py < H - 2;
        for (let m = 0; m < offsets.length; m++) {
          const o = inside ? ids[p + offsets[m]] : ids[Math.max(0, Math.min(H - 1, py + RING[m * 3 + 1])) * W + Math.max(0, Math.min(W - 1, px + RING[m * 3]))],
            w = RING[m * 3 + 2];
          if (o === -1) coast = Math.max(coast, w);
          else if (o !== t && o >= 0 && t >= 0) {
            if (continentOf[o] !== continentOf[t]) divide = Math.max(divide, w);
            else border = Math.max(border, w * w);
          }
        }
        const ink = (tone: number[], a: number) => {
          lr += (tone[0] - lr) * a;
          lg += (tone[1] - lg) * a;
          lb += (tone[2] - lb) * a;
        };
        if (border) ink(borderInk, border * 0.5);
        if (divide) ink(continentInk, divide * 0.72);
        if (coast) ink(coastInk, coast * coast * 0.6);
        // Low land by the sea is a little paler.
        const low = Math.max(0, 1 - inlandAt(px, py) / 1.5) * 0.08;
        lr += (250 - lr) * low;
        lg += (246 - lg) * low;
        lb += (236 - lb) * low;
        r = r * (1 - c) + lr * c;
        g = g * (1 - c) + lg * c;
        b = b * (1 - c) + lb * c;
      }
      data[q] = r;
      data[q + 1] = g;
      data[q + 2] = b;
      data[q + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  // Crossings by sea: dashed, with a dark edge, ending in small rings; those across the map's sides run off its edges.
  ctx.lineCap = "round";
  const dash = (path: () => void) => {
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(20, 52, 74, 0.42)";
    ctx.lineWidth = 8.5;
    path();
    ctx.stroke();
    ctx.setLineDash([13, 10]);
    ctx.strokeStyle = "rgba(255, 252, 242, 0.96)";
    ctx.lineWidth = 4;
    path();
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const ringAt = (x: number, y: number) => {
    ctx.fillStyle = "rgba(255, 252, 242, 0.96)";
    ctx.beginPath();
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 52, 74, 0.6)";
    ctx.lineWidth = 2;
    ctx.stroke();
  };
  for (const link of map.links) {
    const ax = link.from.x * ppc,
      ay = link.from.y * ppc,
      bx = link.to.x * ppc,
      by = link.to.y * ppc;
    if (link.wrap) {
      // Each coast runs out to its own side of the map.
      for (const [x, y, edge] of [
        [ax, ay, ax < W / 2 ? 0 : W],
        [bx, by, bx < W / 2 ? 0 : W],
      ]) {
        dash(() => {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(edge, y - 6);
        });
        ringAt(x, y);
        // An arrowhead at the edge: the crossing goes on from the other side.
        const s = edge === 0 ? -1 : 1;
        ctx.fillStyle = "rgba(255, 252, 242, 0.96)";
        ctx.strokeStyle = "rgba(20, 52, 74, 0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(edge - s * 2, y - 6);
        ctx.lineTo(edge - s * 18, y - 16);
        ctx.lineTo(edge - s * 18, y + 4);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      continue;
    }
    const bend = 0.1,
      mx = (ax + bx) / 2 - (by - ay) * bend,
      my = (ay + by) / 2 + (bx - ax) * bend;
    dash(() => {
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(mx, my, bx, by);
    });
    ringAt(ax, ay);
    ringAt(bx, by);
  }
  // Continents' names and bonuses in the sea beside them.
  ctx.textBaseline = "middle";
  for (const continent of map.continents) {
    const x = continent.label.x * ppc,
      y = continent.label.y * ppc;
    ctx.font = `800 40px ${FONT}`;
    const name = continent.name,
      bonus = ` +${continent.bonus}`,
      wName = ctx.measureText(name).width,
      wBonus = ctx.measureText(bonus).width,
      left = x - (wName + wBonus) / 2;
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(22, 58, 84, 0.8)";
    ctx.textAlign = "left";
    ctx.strokeText(name, left, y);
    ctx.strokeText(bonus, left + wName, y);
    ctx.fillStyle = "#fbf7ec";
    ctx.fillText(name, left, y);
    ctx.fillStyle = "#ffd365";
    ctx.fillText(bonus, left + wName, y);
  }
  // Every region's name on a small plate: under where its armies stand if there is room, else beside, wherever it
  // covers the fewest other names and armies. Smaller regions are placed first, and get smaller names.
  const plates: Plate[] = [],
    taken: { x0: number; y0: number; x1: number; y1: number }[] = [],
    // Where the armies stand (and their number above them), kept clear of names.
    stands = map.territories.map((t) => ({ x0: (t.x - 0.7) * ppc, y0: (t.y - 1.1) * ppc, x1: (t.x + 0.7) * ppc, y1: (t.y + 0.4) * ppc })),
    overlap = (a: { x0: number; y0: number; x1: number; y1: number }, b: { x0: number; y0: number; x1: number; y1: number }) =>
      Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const order = map.territories.map((t) => t.id).sort((a, b) => map.territories[a].cells - map.territories[b].cells || a - b);
  ctx.textAlign = "center";
  for (const id of order) {
    const t = map.territories[id],
      size = Math.round(Math.max(17, Math.min(25, 14 + Math.sqrt(t.cells) * 1.8)));
    ctx.font = `700 ${size}px ${FONT}`;
    const w = ctx.measureText(t.name).width + size * 0.8,
      h = size * 1.38,
      x = t.x * ppc,
      y = t.y * ppc;
    let best = { x, y: y + 0.5 * ppc + h / 2 },
      lowest = Infinity;
    for (const [dx, dy] of [
      [0, 0.5 * ppc + h / 2],
      [0, 0.5 * ppc + h * 1.2],
      [w / 2 + 0.6 * ppc, 0.1 * ppc],
      [-w / 2 - 0.6 * ppc, 0.1 * ppc],
      [w / 2 + 0.3 * ppc, 0.5 * ppc + h / 2],
      [-w / 2 - 0.3 * ppc, 0.5 * ppc + h / 2],
      [0, -1.1 * ppc - h / 2],
      [w / 2 + 0.6 * ppc, -0.5 * ppc],
      [-w / 2 - 0.6 * ppc, -0.5 * ppc],
    ]) {
      const box = { x0: x + dx - w / 2, y0: y + dy - h / 2, x1: x + dx + w / 2, y1: y + dy + h / 2 };
      if (box.x0 < 4 || box.y0 < 4 || box.x1 > W - 4 || box.y1 > H - 4) continue;
      let cost = Math.hypot(dx, dy * 1.4) * 0.02;
      for (const o of taken) cost += overlap(box, o) * 0.05;
      stands.forEach((s, k) => k !== id && (cost += overlap(box, s) * 0.03));
      // Over its own land is best; over the sea is fair; over another region's land is worst.
      let own = 0,
        other = 0;
      for (let sy = 0; sy < 3; sy++)
        for (let sx = 0; sx < 5; sx++) {
          const px = Math.round(box.x0 + ((sx + 0.5) * w) / 5),
            py = Math.round(box.y0 + ((sy + 0.5) * h) / 3),
            v = ids[py * W + px];
          if (v === id) own++;
          else if (v >= 0) other++;
        }
      cost += other * 0.9 - own * 0.25;
      if (cost < lowest) {
        lowest = cost;
        best = { x: x + dx, y: y + dy };
      }
    }
    const box = { x0: best.x - w / 2, y0: best.y - h / 2, x1: best.x + w / 2, y1: best.y + h / 2 };
    taken.push(box);
    plates.push({ territory: id, x0: box.x0 / ppc, y0: box.y0 / ppc, x1: box.x1 / ppc, y1: box.y1 / ppc });
    ctx.fillStyle = "rgba(30, 36, 40, 0.28)";
    roundRect(ctx, box.x0 + 1.5, box.y0 + 2.5, w, h, h * 0.34);
    ctx.fill();
    ctx.fillStyle = "rgba(252, 249, 240, 0.94)";
    roundRect(ctx, box.x0, box.y0, w, h, h * 0.34);
    ctx.fill();
    ctx.strokeStyle = "rgba(70, 76, 80, 0.75)";
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = "#26292b";
    ctx.fillText(t.name, best.x, best.y + 1);
  }
  return { canvas, overlay: overlayOf(ids, W, H, 6), plates };
}
