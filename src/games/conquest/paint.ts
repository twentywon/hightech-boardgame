import { fbm, hash, warped, type WorldMap } from "./map";

/**
 * The map painted for the table, once a game: a sea that deepens away from the coasts, with waves; land in the tint
 * of its continent with relief, a sandy shore, dark coastlines and finer borders between territories; the crossings
 * by sea dashed; every territory's name on a small plate and every continent's name and bonus in the sea beside it.
 * Also what the view needs to lay each player's colour along the borders of the territories held: the territory of
 * every point of a smaller picture and how near it is to a border.
 */
export const PAINT_W = 2048,
  PAINT_H = 1280,
  OVERLAY_W = 1024,
  OVERLAY_H = 640;
/** Muted land colours, one a continent, that leave the players' colours to stand out. */
export const TINTS = ["#a8b886", "#d5bf8c", "#c99f7e", "#b3b077", "#93ae8d", "#c7aa9b"];
const FONT = '"Inter", "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
/** Points looked at round a point of sea for foam, and round a point of land for its coast and borders: x, y, weight. */
const FOAM = [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1, 3, 0, 0.55, -3, 0, 0.55, 0, 3, 0.55, 0, -3, 0.55, 6, 0, 0.25, -6, 0, 0.25, 0, 6, 0.25, 0, -6, 0.25],
  INK = [1, 0, 1, -1, 0, 1, 0, 1, 1, 0, -1, 1, 2, 0, 0.55, -2, 0, 0.55, 0, 2, 0.55, 0, -2, 0.55, 3, 0, 0.2, -3, 0, 0.2, 0, 3, 0.2, 0, -3, 0.2];
const rgb = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
export interface Overlay {
  width: number;
  height: number;
  /** The territory at every point, -1 for sea. */
  ids: Int16Array;
  /** 255 at a territory's edge, falling to 0 a few points inside it. */
  band: Uint8Array;
}
/** Steps to the nearest cell of the other kind (land for sea cells, sea for land cells). */
function distances(map: WorldMap) {
  const { cols, rows, cell } = map,
    out = new Float32Array(cols * rows).fill(-1),
    queue: number[] = [];
  for (let k = 0; k < cell.length; k++) {
    const i = k % cols,
      j = (k - i) / cols,
      land = cell[k] >= 0;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = i + di,
        y = j + dj;
      if (x >= 0 && y >= 0 && x < cols && y < rows && cell[y * cols + x] >= 0 !== land) {
        out[k] = 0.5;
        queue.push(k);
        break;
      }
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q],
      i = k % cols,
      j = (k - i) / cols,
      land = cell[k] >= 0;
    for (const [di, dj] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const x = i + di,
        y = j + dj;
      if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
      const n = y * cols + x;
      if (out[n] < 0 && cell[n] >= 0 === land) {
        out[n] = out[k] + 1;
        queue.push(n);
      }
    }
  }
  for (let k = 0; k < out.length; k++) if (out[k] < 0) out[k] = 12;
  return out;
}
/** A field of the grid read between its cell centres. */
function sample(field: Float32Array, cols: number, rows: number, u: number, v: number) {
  const x = Math.max(0, Math.min(cols - 1.001, u - 0.5)),
    y = Math.max(0, Math.min(rows - 1.001, v - 0.5)),
    i = Math.floor(x),
    j = Math.floor(y),
    fx = x - i,
    fy = y - j,
    a = field[j * cols + i],
    b = field[j * cols + i + 1],
    c = field[(j + 1) * cols + i],
    d = field[(j + 1) * cols + i + 1];
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
export function paintMap(map: WorldMap) {
  const { cols, rows, seed } = map,
    W = PAINT_W,
    H = PAINT_H,
    ppc = W / cols,
    // The warp and the relief are worked out on a lattice four to a cell and read between its points.
    lattice = 4,
    LW = cols * lattice + 1,
    LH = rows * lattice + 1,
    warpU = new Float32Array(LW * LH),
    warpV = new Float32Array(LW * LH),
    relief = new Float32Array(LW * LH),
    sway = new Float32Array(LW * LH),
    gap = distances(map);
  for (let j = 0; j < LH; j++)
    for (let i = 0; i < LW; i++) {
      const x = i / lattice,
        y = j / lattice,
        w = warped(seed, x, y);
      warpU[j * LW + i] = w.u - x;
      warpV[j * LW + i] = w.v - y;
      // Higher inland, with hills and ridges.
      relief[j * LW + i] = fbm(x, y, seed + 5, 3.2) * Math.min(1, sample(gap, cols, rows, x, y) * 0.45);
      sway[j * LW + i] = fbm(x, y, seed + 9, 2);
    }
  // The relief lit from the upper left, worked out on the lattice.
  const shine = new Float32Array(LW * LH);
  for (let j = 0; j < LH; j++)
    for (let i = 0; i < LW; i++) {
      const at = (x: number, y: number) => relief[Math.max(0, Math.min(LH - 1, y)) * LW + Math.max(0, Math.min(LW - 1, x))],
        dx = (at(i + 1, j) - at(i - 1, j)) / 2,
        dy = (at(i, j + 1) - at(i, j - 1)) / 2;
      shine[j * LW + i] = 1 + (-dx - dy) * 2.4 * (0.24 * lattice) + (at(i, j) - 0.45) * 0.22;
    }
  const lerp = (field: Float32Array, x: number, y: number) => {
    const u = Math.max(0, Math.min(LW - 1.001, x * lattice)),
      v = Math.max(0, Math.min(LH - 1.001, y * lattice)),
      i = Math.floor(u),
      j = Math.floor(v),
      fx = u - i,
      fy = v - j,
      k = j * LW + i;
    return (field[k] * (1 - fx) + field[k + 1] * fx) * (1 - fy) + (field[k + LW] * (1 - fx) + field[k + LW + 1] * fx) * fy;
  };
  // Which territory every point shows.
  const ids = new Int16Array(W * H),
    us = new Float32Array(W * H),
    vs = new Float32Array(W * H);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const x = (px + 0.5) / ppc,
        y = (py + 0.5) / ppc,
        u = x + lerp(warpU, x, y),
        v = y + lerp(warpV, x, y),
        i = Math.floor(u),
        j = Math.floor(v),
        p = py * W + px;
      us[p] = u;
      vs[p] = v;
      ids[p] = i < 0 || j < 0 || i >= cols || j >= rows ? -1 : map.cell[j * cols + i];
    }
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!,
    image = ctx.createImageData(W, H),
    data = image.data,
    tints = map.continents.map((_, c) => rgb(TINTS[c % TINTS.length])),
    shallow = rgb("#78b9c2"),
    mid = rgb("#3a7f9c"),
    deep = rgb("#1f4d70"),
    sand = rgb("#dccb98"),
    coastInk = rgb("#3b3024"),
    borderInk = rgb("#5a4632");
  const at = (px: number, py: number) => (px < 0 || py < 0 || px >= W || py >= H ? -1 : ids[py * W + px]),
    // Points round a point as offsets in the picture, for those far enough from its edges.
    foamAt = Array.from({ length: FOAM.length / 3 }, (_, n) => FOAM[n * 3 + 1] * W + FOAM[n * 3]),
    inkAt = Array.from({ length: INK.length / 3 }, (_, n) => INK[n * 3 + 1] * W + INK[n * 3]);
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const p = py * W + px,
        t = ids[p],
        u = us[p],
        v = vs[p];
      let r: number, g: number, b: number;
      if (t < 0) {
        // The sea: shallow by the coasts, deep in the open, with a faint swell.
        const d = sample(gap, cols, rows, u, v),
          k = Math.min(1, d / 2.2),
          e = Math.min(1, Math.max(0, (d - 2.2) / 4)),
          swell = (lerp(sway, px / ppc, py / ppc) - 0.5) * 18;
        r = shallow[0] + (mid[0] - shallow[0]) * k + (deep[0] - mid[0]) * e + swell;
        g = shallow[1] + (mid[1] - shallow[1]) * k + (deep[1] - mid[1]) * e + swell;
        b = shallow[2] + (mid[2] - shallow[2]) * k + (deep[2] - mid[2]) * e + swell;
        // Foam where the water meets the land.
        let near = 0;
        const inside = px >= 6 && py >= 6 && px < W - 6 && py < H - 6;
        for (let n = 0; n < FOAM.length; n += 3)
          if ((inside ? ids[p + foamAt[n / 3]] : at(px + FOAM[n], py + FOAM[n + 1])) >= 0) near = Math.max(near, FOAM[n + 2]);
        r += (236 - r) * near * 0.55;
        g += (244 - g) * near * 0.55;
        b += (240 - b) * near * 0.55;
      } else {
        const c = map.territories[t].continent,
          tint = tints[c],
          // Neighbouring territories differ a little in shade.
          shade = 1 + (((t * 7) % 5) - 2) * 0.028,
          light = lerp(shine, px / ppc, py / ppc),
          grain = (hash(px >> 1, py >> 1, seed) - 0.5) * 10,
          shore = Math.max(0, 1 - sample(gap, cols, rows, u, v) / 0.9);
        r = (tint[0] * shade + (sand[0] - tint[0]) * shore * 0.55) * light + grain;
        g = (tint[1] * shade + (sand[1] - tint[1]) * shore * 0.55) * light + grain;
        b = (tint[2] * shade + (sand[2] - tint[2]) * shore * 0.55) * light + grain;
        // Coastlines in dark ink, the borders between territories finer.
        let coast = 0,
          border = 0;
        for (let m = 0; m < INK.length; m += 3) {
          const n = px >= 3 && py >= 3 && px < W - 3 && py < H - 3 ? ids[p + inkAt[m / 3]] : at(px + INK[m], py + INK[m + 1]),
            w = INK[m + 2];
          if (n < 0) coast = Math.max(coast, w);
          else if (n !== t) border = Math.max(border, w * 0.8);
        }
        const ink = Math.max(coast * 0.85, border * 0.62),
          tone = coast * 0.85 >= border * 0.62 ? coastInk : borderInk;
        r += (tone[0] - r) * ink;
        g += (tone[1] - g) * ink;
        b += (tone[2] - b) * ink;
      }
      const q = p * 4;
      data[q] = r;
      data[q + 1] = g;
      data[q + 2] = b;
      data[q + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  // Waves in the open sea.
  ctx.lineCap = "round";
  const step = 54;
  for (let gy = 0; gy < H / step; gy++)
    for (let gx = 0; gx < W / step; gx++) {
      const x = (gx + 0.2 + hash(gx, gy, seed + 3) * 0.6) * step,
        y = (gy + 0.2 + hash(gx, gy, seed + 4) * 0.6) * step,
        u = x / ppc,
        v = y / ppc;
      if (at(Math.floor(x), Math.floor(y)) >= 0 || sample(gap, cols, rows, u, v) < 1.4) continue;
      const w = 9 + hash(gx, gy, seed + 6) * 7;
      ctx.strokeStyle = `rgba(225, 240, 246, ${0.16 + hash(gx, gy, seed + 8) * 0.14})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(x - w * 0.5, y, w * 0.5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.arc(x + w * 0.5, y, w * 0.5, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  // A compass rose in the open sea, where there is room for one.
  rose(ctx, map, ppc, gap);
  // Crossings by sea: dashed, with a dark edge, ending in small rings on either coast.
  for (const link of map.links) {
    const ax = link.from.x * ppc,
      ay = link.from.y * ppc,
      bx = link.to.x * ppc,
      by = link.to.y * ppc,
      mx = (ax + bx) / 2 - (by - ay) * 0.08,
      my = (ay + by) / 2 + (bx - ax) * 0.08;
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(14, 34, 52, 0.45)";
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    ctx.setLineDash([18, 13]);
    ctx.strokeStyle = "rgba(255, 250, 236, 0.95)";
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.quadraticCurveTo(mx, my, bx, by);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const [x, y] of [
      [ax, ay],
      [bx, by],
    ]) {
      ctx.fillStyle = "rgba(255, 250, 236, 0.95)";
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(14, 34, 52, 0.6)";
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }
  // Continents' names and bonuses in the sea beside them.
  const big = Math.round(Math.max(30, Math.min(44, ppc * 0.95)));
  for (const continent of map.continents) {
    const x = continent.label.x * ppc,
      y = continent.label.y * ppc;
    ctx.font = `800 ${big}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const name = continent.name,
      bonus = ` +${continent.bonus}`,
      wName = ctx.measureText(name).width,
      wBonus = ctx.measureText(bonus).width,
      left = x - (wName + wBonus) / 2;
    ctx.lineJoin = "round";
    ctx.lineWidth = 7;
    ctx.strokeStyle = "rgba(16, 38, 58, 0.85)";
    ctx.textAlign = "left";
    ctx.strokeText(name, left, y);
    ctx.strokeText(bonus, left + wName, y);
    ctx.fillStyle = "#f4ecd6";
    ctx.fillText(name, left, y);
    ctx.fillStyle = "#f2c14e";
    ctx.fillText(bonus, left + wName, y);
  }
  // Every territory's name on a small cream plate, under where its armies stand.
  const small = Math.round(Math.max(18, Math.min(30, ppc * 0.58)));
  ctx.font = `700 ${small}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const t of map.territories) {
    const x = t.x * ppc,
      y = t.y * ppc + plateDrop(map) * ppc,
      w = ctx.measureText(t.name).width + small * 0.9,
      h = small * 1.45;
    ctx.fillStyle = "rgba(40, 30, 20, 0.35)";
    roundRect(ctx, x - w / 2 + 2, y - h / 2 + 3, w, h, h * 0.32);
    ctx.fill();
    ctx.fillStyle = "#f6eed9";
    roundRect(ctx, x - w / 2, y - h / 2, w, h, h * 0.32);
    ctx.fill();
    ctx.strokeStyle = "#7d6446";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#2c2318";
    ctx.fillText(t.name, x, y + 1);
  }
  // The smaller picture of territories and their edges, for the players' colours.
  const ow = OVERLAY_W,
    oh = OVERLAY_H,
    oids = new Int16Array(ow * oh),
    depth = new Int8Array(ow * oh).fill(-1),
    queue: number[] = [];
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) oids[y * ow + x] = ids[Math.floor(((y + 0.5) * H) / oh) * W + Math.floor(((x + 0.5) * W) / ow)];
  for (let y = 0; y < oh; y++)
    for (let x = 0; x < ow; x++) {
      const k = y * ow + x,
        t = oids[k];
      if (t < 0) continue;
      if ((x > 0 && oids[k - 1] !== t) || (x < ow - 1 && oids[k + 1] !== t) || (y > 0 && oids[k - ow] !== t) || (y < oh - 1 && oids[k + ow] !== t)) {
        depth[k] = 0;
        queue.push(k);
      }
    }
  const REACH = 9;
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q],
      x = k % ow,
      y = (k - x) / ow;
    if (depth[k] >= REACH) continue;
    for (const n of [x > 0 ? k - 1 : -1, x < ow - 1 ? k + 1 : -1, y > 0 ? k - ow : -1, y < oh - 1 ? k + ow : -1])
      if (n >= 0 && depth[n] < 0 && oids[n] === oids[k]) {
        depth[n] = depth[k] + 1;
        queue.push(n);
      }
  }
  const band = new Uint8Array(ow * oh);
  for (let k = 0; k < band.length; k++) if (oids[k] >= 0 && depth[k] >= 0) band[k] = Math.round(255 * (1 - depth[k] / REACH) ** 1.6);
  const overlay: Overlay = { width: ow, height: oh, ids: oids, band };
  return { canvas, overlay };
}
/** How far below where its armies stand a territory's name is written, in cells. */
export const plateDrop = (map: WorldMap) => Math.max(0.75, Math.min(1.05, 26 / map.cols));
/** An old chart's compass rose, in the corner of the sea with the most room. */
function rose(ctx: CanvasRenderingContext2D, map: WorldMap, ppc: number, gap: Float32Array) {
  const { cols, rows } = map;
  let best = { x: 0, y: 0, room: 0 };
  for (const [x, y] of [
    [3.2, rows - 3.2],
    [cols - 3.2, rows - 3.2],
    [3.2, 3.2],
    [cols - 3.2, 3.2],
  ]) {
    const room = sample(gap, cols, rows, x, y);
    if (map.cell[Math.floor(y) * cols + Math.floor(x)] < 0 && room > best.room) best = { x, y, room };
  }
  if (best.room < 2.6) return;
  const cx = best.x * ppc,
    cy = best.y * ppc,
    r = Math.min(2.2, best.room - 0.6) * ppc;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(244, 236, 214, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  for (let k = 0; k < 8; k++) {
    const long = k % 2 === 0,
      a = (k * Math.PI) / 4 - Math.PI / 2,
      l = long ? r : r * 0.55,
      w = long ? r * 0.13 : r * 0.09;
    for (const side of [1, -1]) {
      ctx.fillStyle = side > 0 ? "rgba(244, 236, 214, 0.75)" : "rgba(160, 128, 74, 0.75)";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * l, Math.sin(a) * l);
      ctx.lineTo(Math.cos(a + (side * Math.PI) / 2) * w, Math.sin(a + (side * Math.PI) / 2) * w);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.fillStyle = "rgba(244, 236, 214, 0.9)";
  ctx.font = `800 ${Math.round(r * 0.3)}px ${FONT}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("N", 0, -r * 1.18);
  ctx.restore();
}
