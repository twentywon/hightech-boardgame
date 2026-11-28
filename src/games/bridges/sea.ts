/**
 * The pictures the sea of 하시 is painted from, on plain canvases (nothing of Three.js here): a tile of open ocean,
 * a tile of the light's net (caustics), the lace of surf round an island, the sky's sheen on the far water, and the
 * lagoon of a puzzle, painted from where its islands lie. Everything is drawn once a view or once a puzzle, so the
 * sea costs nothing while it is shown; only where a graphics card draws does anything move over it (in the view).
 */
/** A fixed sequence, so that a sea is painted the same each time. */
export const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** The colours of the water, from the open ocean to the pale shallows on the sand. */
export const SEA = {
  ocean: "#0f4673",
  drop: "#1b6c9c",
  reef: "#6ec9c0",
  flat: "#45b9c8",
  lagoon: "#2290bd",
};
function canvas(width: number, height = width) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c;
}
/** Draws `shape` blurred by `blur` pixels: the shape itself is drawn off the canvas and only its shadow lands. */
function soft(pen: CanvasRenderingContext2D, color: string, blur: number, shape: () => void, stroke = false) {
  const away = pen.canvas.width * 3;
  pen.save();
  pen.shadowColor = color;
  pen.shadowBlur = blur;
  pen.shadowOffsetX = away;
  pen.translate(-away, 0);
  pen.fillStyle = pen.strokeStyle = "#000";
  shape();
  if (stroke) pen.stroke();
  else pen.fill();
  pen.restore();
}
/**
 * The light's net on a shallow floor, as a tile that repeats: the bright seams between wavering cells (the edges of
 * a Voronoi pattern over jittered points, the plane bent by a few whole waves so that the seams curl), light on black.
 */
export function causticTile(size = 256) {
  const c = canvas(size),
    pen = c.getContext("2d")!,
    image = pen.createImageData(size, size),
    random = sequence(4219),
    n = 6,
    points: [number, number][] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) points.push([(i + 0.15 + random() * 0.7) / n, (j + 0.15 + random() * 0.7) / n]);
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      // The plane is bent by whole waves across the tile, so that the tile still joins at its edges.
      const u = x / size + 0.035 * Math.sin(tau * (2 * (y / size)) + 0.7) + 0.02 * Math.sin(tau * (3 * (x / size + y / size))),
        v = y / size + 0.035 * Math.sin(tau * (2 * (x / size)) + 1.9) + 0.02 * Math.sin(tau * (3 * (x / size - y / size)));
      const fu = u - Math.floor(u),
        fv = v - Math.floor(v),
        ci = Math.floor(fu * n),
        cj = Math.floor(fv * n);
      let f1 = 9,
        f2 = 9;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          // A neighbour across an edge of the tile is its own cell's point, one tile over.
          const i = ci + di,
            j = cj + dj,
            p = points[(((j % n) + n) % n) * n + (((i % n) + n) % n)],
            d = Math.hypot(p[0] + Math.floor(i / n) - fu, p[1] + Math.floor(j / n) - fv);
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      const seam = Math.max(0, 1 - ((f2 - f1) * n) / 0.13),
        light = Math.min(1, seam * seam * 1.1 + seam ** 6 * 0.5),
        k = (y * size + x) * 4;
      image.data[k] = Math.round(210 * light);
      image.data[k + 1] = Math.round(250 * light);
      image.data[k + 2] = Math.round(255 * light);
      image.data[k + 3] = 255;
    }
  pen.putImageData(image, 0, 0);
  return c;
}
/** The open ocean round the lagoon, as a tile that repeats: deep blue, the shade of long swells and a few white crests. */
export function oceanTile(size = 512) {
  const c = canvas(size),
    pen = c.getContext("2d")!,
    random = sequence(911);
  pen.fillStyle = SEA.ocean;
  pen.fillRect(0, 0, size, size);
  /** Draws a thing at its place and again across each edge, so that the tile joins. */
  const wrapped = (draw: (dx: number, dy: number) => void) => {
    for (const dx of [-size, 0, size]) for (const dy of [-size, 0, size]) draw(dx, dy);
  };
  for (let i = 0; i < 26; i++) {
    const x = random() * size,
      y = random() * size,
      r = 40 + random() * 90,
      light = i % 2 === 0;
    wrapped((dx, dy) => {
      const g = pen.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      g.addColorStop(0, light ? "rgba(40,110,160,0.22)" : "rgba(5,30,60,0.24)");
      g.addColorStop(1, light ? "rgba(40,110,160,0)" : "rgba(5,30,60,0)");
      pen.fillStyle = g;
      pen.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }
  pen.lineCap = "round";
  for (let i = 0; i < 240; i++) {
    const x = random() * size,
      y = random() * size,
      length = 10 + random() * 30,
      lift = 2 + random() * 4,
      white = i % 3 !== 0,
      alpha = white ? 0.05 + random() * 0.09 : 0.12 + random() * 0.12,
      width = 1 + random() * 1.8;
    wrapped((dx, dy) => {
      pen.strokeStyle = white ? `rgba(230,245,255,${alpha})` : `rgba(4,28,56,${alpha})`;
      pen.lineWidth = width;
      pen.beginPath();
      pen.moveTo(x + dx, y + dy);
      pen.quadraticCurveTo(x + dx + length / 2, y + dy - lift, x + dx + length, y + dy);
      pen.stroke();
    });
  }
  return c;
}
/** The surf round a beach: a broken white lace of a few wavering rings, thickest at the sand and fading outward. */
export function laceTile(size = 256) {
  const c = canvas(size),
    pen = c.getContext("2d")!,
    random = sequence(57),
    mid = size / 2,
    unit = size / 1.06;
  pen.lineCap = "round";
  const rings: [number, number, number][] = [
    [0.445, 0.024, 0.85],
    [0.47, 0.016, 0.55],
    [0.5, 0.011, 0.38],
    [0.53, 0.008, 0.22],
  ];
  for (const [r, width, alpha] of rings) {
    let turn = random() * Math.PI * 2;
    while (turn < Math.PI * 2 + 0.2) {
      const arc = 0.35 + random() * 0.9,
        phase = random() * 6;
      pen.strokeStyle = `rgba(255,255,255,${alpha * (0.6 + random() * 0.4)})`;
      pen.lineWidth = width * unit * (0.7 + random() * 0.6);
      pen.beginPath();
      for (let a = turn; a <= turn + arc; a += 0.04) {
        const wave = r + 0.008 * Math.sin(a * 9 + phase) + 0.005 * Math.sin(a * 17 + phase * 2);
        pen.lineTo(mid + Math.cos(a) * wave * unit, mid + Math.sin(a) * wave * unit);
      }
      pen.stroke();
      turn += arc + 0.05 + random() * 0.25;
    }
  }
  return c;
}
/** The sky seen in the far water: a light that grows toward the top of the picture (the far side), black below. */
export function sheenTile() {
  const c = canvas(4, 256),
    pen = c.getContext("2d")!,
    g = pen.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, "rgb(92,118,132)");
  g.addColorStop(0.3, "rgb(52,72,86)");
  g.addColorStop(0.62, "rgb(10,16,20)");
  g.addColorStop(1, "rgb(0,0,0)");
  pen.fillStyle = g;
  pen.fillRect(0, 0, 4, 256);
  return c;
}
interface Plan {
  /** Pixels a side, and the side of the square painted, in table units. */
  px: number;
  extent: number;
  /** The reef's half side and the rounding of its corners. */
  half: number;
  round: number;
  /** Where the islands stand, and the middles of all the cells (for the faint dots). */
  islands: { x: number; z: number }[];
  cells: { x: number; z: number }[];
  dot: number;
  seed: number;
  caustics: HTMLCanvasElement;
  /** How wide a tile of the caustics is, in table units. */
  causticSize: number;
}
/**
 * The lagoon of a puzzle, painted from where its islands lie: deep ocean outside, the reef's drop-off and its crest
 * with surf breaking on it, the reef flats inside, and the lagoon, deeper blue between the islands and bright
 * turquoise over the sand round each of them, with the light's net, a few coral heads and pale sand there, surf at
 * every beach and a faint dot in every cell. It fades out at its edge into the ocean laid under it. `shallow` is the
 * depth as a grey picture (white where it is shallowest), for the caustics that move over it.
 */
export function lagoonPictures(plan: Plan) {
  const { px, extent, half, round, seed } = plan,
    unit = px / extent,
    at = (v: number) => (v + extent / 2) * unit,
    random = sequence(seed),
    phases = [random() * 6, random() * 6, random() * 6, random() * 6],
    wobble = (t: number) =>
      0.07 * Math.sin(Math.PI * 2 * 5 * t + phases[0]) + 0.045 * Math.sin(Math.PI * 2 * 11 * t + phases[1]) + 0.025 * Math.sin(Math.PI * 2 * 23 * t + phases[2]),
    /** Traces the reef's line `offset` outside its middle, wandering as the reef does. */
    reef = (pen: CanvasRenderingContext2D, offset: number, wander = 1) => {
      pen.beginPath();
      const steps = 520;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps,
          [x, z, nx, nz] = edgePoint(t, half, round),
          d = offset + wobble(t) * wander;
        if (i) pen.lineTo(at(x + nx * d), at(z + nz * d));
        else pen.moveTo(at(x + nx * d), at(z + nz * d));
      }
      pen.closePath();
    },
    color = canvas(px),
    pen = color.getContext("2d")!,
    depth = canvas(px),
    mask = depth.getContext("2d")!;
  // The ocean, the drop-off lightening toward the reef, and the reef's crest.
  pen.fillStyle = SEA.ocean;
  pen.fillRect(0, 0, px, px);
  soft(pen, "rgba(27,108,156,0.85)", 0.55 * unit, () => reef(pen, 0.85));
  soft(pen, SEA.drop, 0.3 * unit, () => reef(pen, 0.42));
  soft(pen, "#3f9fbe", 0.12 * unit, () => reef(pen, 0.2));
  pen.save();
  reef(pen, 0.16);
  pen.clip();
  pen.fillStyle = SEA.reef;
  pen.fillRect(0, 0, px, px);
  // Coral on the crest: olive, brown and pale sand in blots.
  for (let i = 0; i < 900; i++) {
    const t = random(),
      [x, z, nx, nz] = edgePoint(t, half, round),
      d = -0.12 + random() * 0.3 + wobble(t),
      r = (0.02 + random() * 0.06) * unit;
    pen.fillStyle = ["rgba(120,110,70,0.28)", "rgba(70,120,100,0.26)", "rgba(240,240,215,0.32)", "rgba(40,120,140,0.25)"][i % 4];
    pen.beginPath();
    pen.ellipse(at(x + nx * d), at(z + nz * d), r, r * (0.5 + random() * 0.5), random() * 3, 0, Math.PI * 2);
    pen.fill();
  }
  pen.restore();
  // The lagoon inside the reef: the flats along it, deepening inward.
  pen.save();
  reef(pen, -0.1);
  pen.clip();
  pen.fillStyle = SEA.lagoon;
  pen.fillRect(0, 0, px, px);
  soft(pen, SEA.flat, 0.45 * unit, () => {
    reef(pen, -0.28);
    pen.lineWidth = 0.5 * unit;
  }, true);
  const middle = pen.createRadialGradient(at(0), at(0), 0, at(0), at(0), half * unit * 1.05);
  middle.addColorStop(0, "rgba(14,74,130,0.32)");
  middle.addColorStop(0.7, "rgba(14,74,130,0.12)");
  middle.addColorStop(1, "rgba(14,74,130,0)");
  pen.fillStyle = middle;
  pen.fillRect(0, 0, px, px);
  // The shallows round each island: turquoise over sand, paler toward the beach.
  for (const island of plan.islands) {
    const x = at(island.x),
      y = at(island.z),
      g = pen.createRadialGradient(x, y, 0.38 * unit, x, y, 1.4 * unit);
    g.addColorStop(0, "#a2e2d4");
    g.addColorStop(0.11, "#6cd0cc");
    g.addColorStop(0.3, "rgba(58,182,202,0.9)");
    g.addColorStop(0.56, "rgba(62,184,206,0.5)");
    g.addColorStop(1, "rgba(50,160,200,0)");
    pen.fillStyle = g;
    pen.fillRect(x - 1.4 * unit, y - 1.4 * unit, 2.8 * unit, 2.8 * unit);
  }
  // On the sand under the shallows: ripples, a few coral heads and dark weed, and pale patches.
  for (const island of plan.islands) {
    for (let i = 0; i < 26; i++) {
      const turn = random() * Math.PI * 2,
        r = 0.56 + random() * 0.55,
        x = at(island.x + Math.cos(turn) * r),
        y = at(island.z + Math.sin(turn) * r),
        size = (0.018 + random() * 0.045) * unit * (1.2 - (r - 0.56));
      pen.fillStyle = i % 3 === 0 ? `rgba(240,255,245,${0.18 + random() * 0.12})` : i % 3 === 1 ? `rgba(20,90,105,${0.2 + random() * 0.15})` : `rgba(90,120,80,${0.16 + random() * 0.12})`;
      pen.beginPath();
      pen.ellipse(x, y, size, size * (0.55 + random() * 0.45), random() * 3, 0, Math.PI * 2);
      pen.fill();
    }
    pen.strokeStyle = "rgba(255,255,240,0.12)";
    pen.lineWidth = Math.max(1, 0.012 * unit);
    for (let k = 0; k < 4; k++) {
      const r = 0.6 + k * 0.11,
        start = random() * Math.PI * 2;
      pen.beginPath();
      for (let a = start; a < start + 1.3; a += 0.08) pen.lineTo(at(island.x + Math.cos(a) * (r + 0.015 * Math.sin(a * 7))), at(island.z + Math.sin(a) * (r + 0.015 * Math.sin(a * 7))));
      pen.stroke();
    }
  }
  pen.restore();
  // The depth, as grey: shallow over the reef, its flats and round the islands; a little everywhere in the lagoon.
  mask.fillStyle = "#000";
  mask.fillRect(0, 0, px, px);
  mask.save();
  reef(mask, 0.16);
  mask.clip();
  mask.fillStyle = "rgb(14,14,14)";
  mask.fillRect(0, 0, px, px);
  soft(mask, "rgb(165,165,165)", 0.4 * unit, () => {
    reef(mask, -0.18);
    mask.lineWidth = 0.55 * unit;
  }, true);
  for (const island of plan.islands) {
    const x = at(island.x),
      y = at(island.z),
      g = mask.createRadialGradient(x, y, 0.45 * unit, x, y, 1.3 * unit);
    g.addColorStop(0, "rgba(255,255,255,0.72)");
    g.addColorStop(0.45, "rgba(255,255,255,0.38)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    mask.fillStyle = g;
    mask.fillRect(x - 1.3 * unit, y - 1.3 * unit, 2.6 * unit, 2.6 * unit);
  }
  mask.restore();
  // The light's net, strongest where the water is shallow.
  const net = canvas(px),
    weave = net.getContext("2d")!,
    pattern = weave.createPattern(plan.caustics, "repeat")!,
    scale = (plan.causticSize * unit) / plan.caustics.width;
  pattern.setTransform(new DOMMatrix().scale(scale));
  weave.fillStyle = pattern;
  weave.fillRect(0, 0, px, px);
  weave.globalCompositeOperation = "multiply";
  weave.drawImage(depth, 0, 0);
  pen.globalCompositeOperation = "lighter";
  pen.globalAlpha = 0.27;
  pen.drawImage(net, 0, 0);
  pen.globalAlpha = 1;
  pen.globalCompositeOperation = "source-over";
  // A faint dot in every cell, so that a line of cells can be followed by eye.
  pen.fillStyle = "rgba(255,255,255,0.3)";
  for (const cell of plan.cells) {
    pen.beginPath();
    pen.arc(at(cell.x), at(cell.z), plan.dot * unit, 0, Math.PI * 2);
    pen.fill();
  }
  // Surf at every beach: broken, wavering rings of foam.
  pen.lineCap = "round";
  for (const island of plan.islands) {
    for (const [r, width, alpha] of [
      [0.455, 0.03, 0.75],
      [0.5, 0.018, 0.45],
      [0.55, 0.012, 0.25],
    ] as const) {
      let turn = random() * Math.PI * 2;
      const end = turn + Math.PI * 2;
      while (turn < end) {
        const arc = Math.min(end - turn, 0.5 + random() * 1.2),
          phase = random() * 6;
        pen.strokeStyle = `rgba(255,255,255,${alpha * (0.6 + random() * 0.4)})`;
        pen.lineWidth = Math.max(1, width * unit * (0.7 + random() * 0.6));
        pen.beginPath();
        for (let a = turn; a <= turn + arc; a += 0.05) {
          const wave = r + 0.012 * Math.sin(a * 7 + phase) + 0.006 * Math.sin(a * 15 + phase);
          pen.lineTo(at(island.x + Math.cos(a) * wave), at(island.z + Math.sin(a) * wave));
        }
        pen.stroke();
        turn += arc + 0.06 + random() * 0.3;
      }
    }
  }
  // Surf breaking on the reef: on its outer side, broken and wavering, and a fainter line where it meets the lagoon.
  for (const [offset, width, alpha, wander] of [
    [0.19, 0.045, 0.8, 1],
    [0.26, 0.03, 0.5, 1.15],
    [0.34, 0.02, 0.3, 1.3],
    [-0.08, 0.018, 0.35, 0.9],
  ] as const) {
    let t = random();
    const end = t + 1;
    while (t < end) {
      const run = Math.min(end - t, 0.02 + random() * 0.07);
      pen.strokeStyle = `rgba(255,255,255,${alpha * (0.55 + random() * 0.45)})`;
      pen.lineWidth = Math.max(1, width * unit * (0.7 + random() * 0.6));
      pen.beginPath();
      for (let s = t; s <= t + run; s += 0.002) {
        const [x, z, nx, nz] = edgePoint(s, half, round),
          d = offset + wobble(s) * wander + 0.02 * Math.sin(s * 900);
        pen.lineTo(at(x + nx * d), at(z + nz * d));
      }
      pen.stroke();
      t += run + 0.004 + random() * 0.02;
    }
  }
  // Glints of the sun on the open water and the lagoon.
  for (let i = 0; i < 80; i++) {
    const x = random() * px,
      y = random() * px,
      w = (0.005 + random() * 0.008) * unit,
      long = w * (2 + random() * 3);
    pen.fillStyle = `rgba(255,255,255,${0.2 + random() * 0.3})`;
    pen.beginPath();
    pen.ellipse(x, y, long, w, (random() - 0.5) * 0.5, 0, Math.PI * 2);
    pen.fill();
  }
  // The edge fades into the ocean laid under it.
  const fade = canvas(px),
    edge = fade.getContext("2d")!;
  soft(edge, "#fff", 0.6 * unit, () => reef(edge, 1.15, 0));
  pen.globalCompositeOperation = "destination-in";
  pen.drawImage(fade, 0, 0);
  pen.globalCompositeOperation = "source-over";
  return { color, shallow: depth };
}
/**
 * A point of a square with rounded corners (half side `half`, corners rounded by `round`) at `t` of the way round,
 * clockwise from the far side, with its outward normal.
 */
export function edgePoint(t: number, half: number, round: number): [number, number, number, number] {
  const straight = 2 * (half - round),
    arc = (Math.PI * round) / 2,
    side = straight + arc;
  let d = (((t % 1) + 1) % 1) * side * 4;
  const k = Math.min(3, Math.floor(d / side));
  d -= k * side;
  const normals = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ],
    [nx, nz] = normals[k],
    // Along the side: from its start toward the next corner (the direction is the normal turned a quarter clockwise).
    dx = -nz,
    dz = nx,
    inner = half - round;
  if (d <= straight) return [nx * half + dx * (d - inner), nz * half + dz * (d - inner), nx, nz];
  const a = Math.atan2(nz, nx) + (d - straight) / round,
    cx = (nx + dx) * inner,
    cz = (nz + dz) * inner;
  return [cx + Math.cos(a) * round, cz + Math.sin(a) * round, Math.cos(a), Math.sin(a)];
}
