/**
 * Small landmark silhouettes of our own drawing for the city spaces: a few strokes each, printed in one colour on
 * the space's colour band like a stamp. They suggest a place (a pagoda, a dome, a windmill, sails by a harbour)
 * without copying any picture. Drawn in a box 100 wide and 60 high, standing on its bottom edge.
 */
type Ctx = CanvasRenderingContext2D;
type Draw = (c: Ctx) => void;
const rect = (c: Ctx, x: number, y: number, w: number, h: number) => c.rect(x, 60 - y - h, w, h);
const poly = (c: Ctx, ...points: number[]) => {
  c.moveTo(points[0], 60 - points[1]);
  for (let i = 2; i < points.length; i += 2) c.lineTo(points[i], 60 - points[i + 1]);
  c.closePath();
};
const disc = (c: Ctx, x: number, y: number, r: number, from = 0, to = Math.PI * 2) => {
  c.moveTo(x + r * Math.cos(from), 60 - y - r * Math.sin(from));
  c.arc(x, 60 - y, r, -from, -to, true);
  c.closePath();
};
/** A few low buildings along the ground, for a skyline behind something. */
const city = (c: Ctx, heights: number[], from = 4, step = 9) => heights.forEach((h, i) => rect(c, from + i * step, 0, step - 2, h));
const SHAPES: Record<string, Draw> = {
  // A tiered pagoda: roofs curving up at their ends.
  pagoda: (c) => {
    rect(c, 46, 0, 8, 54);
    for (let i = 0; i < 4; i++) {
      const y = 10 + i * 11,
        w = 30 - i * 5;
      poly(c, 50 - w, y + 3, 50 - w + 4, y, 50 + w - 4, y, 50 + w, y + 3, 50 + w * 0.55, y + 7, 50 - w * 0.55, y + 7);
      rect(c, 50 - w * 0.5, y - 6, w, 6);
    }
    rect(c, 22, 0, 56, 4);
  },
  // A bell-shaped stupa with a tall pinnacle on a stepped base.
  stupa: (c) => {
    rect(c, 28, 0, 44, 6);
    rect(c, 33, 6, 34, 5);
    disc(c, 50, 11, 15, 0, Math.PI);
    poly(c, 44, 24, 56, 24, 51, 58, 49, 58);
    rect(c, 10, 0, 10, 14);
    rect(c, 80, 0, 10, 14);
    poly(c, 9, 14, 21, 14, 15, 24);
    poly(c, 79, 14, 91, 14, 85, 24);
  },
  // A slender monument topped with a flame.
  obelisk: (c) => {
    rect(c, 34, 0, 32, 6);
    poly(c, 44, 6, 56, 6, 53, 44, 47, 44);
    poly(c, 45, 44, 55, 44, 50, 49);
    c.moveTo(50, 60 - 58);
    c.quadraticCurveTo(57, 60 - 52, 51, 60 - 47);
    c.quadraticCurveTo(44, 60 - 51, 50, 60 - 58);
    city(c, [10, 16, 12], 4, 9);
    city(c, [14, 10, 18], 69, 9);
  },
  // Three towers carrying a long deck.
  towers: (c) => {
    for (const x of [26, 44, 62]) rect(c, x, 0, 11, 44);
    poly(c, 20, 44, 84, 44, 86, 49, 22, 49);
    city(c, [8, 14], 2, 8);
    city(c, [12, 7], 80, 8);
  },
  // A very tall needle of a tower, stepping in as it rises.
  needle: (c) => {
    poly(c, 41, 0, 59, 0, 54, 30, 52, 46, 50.5, 59, 49.5, 59, 48, 46, 46, 30);
    city(c, [10, 18, 12], 4, 10);
    city(c, [16, 9, 13], 66, 10);
  },
  // A domed hall between two minarets.
  mosque: (c) => {
    rect(c, 26, 0, 48, 18);
    disc(c, 50, 18, 18, 0, Math.PI);
    rect(c, 49, 36, 2, 8);
    for (const x of [14, 82]) {
      rect(c, x, 0, 5, 44);
      poly(c, x - 1, 44, x + 6, 44, x + 2.5, 56);
    }
    disc(c, 34, 18, 6, 0, Math.PI);
    disc(c, 66, 18, 6, 0, Math.PI);
  },
  // Pyramids in the sand.
  pyramid: (c) => {
    poly(c, 14, 0, 50, 42, 86, 0);
    poly(c, 62, 0, 82, 22, 100, 0);
    poly(c, 0, 0, 14, 14, 26, 0);
  },
  // A stepped pyramid with a little temple on top.
  steps: (c) => {
    for (let i = 0; i < 5; i++) rect(c, 18 + i * 6, i * 8, 64 - i * 12, 8);
    rect(c, 43, 40, 14, 10);
    poly(c, 41, 50, 59, 50, 50, 55);
    rect(c, 46, 0, 8, 40);
  },
  // A row of tall office blocks.
  skyline: (c) => {
    city(c, [24, 40, 30, 52, 36, 46, 26, 34, 20], 6, 10);
    rect(c, 39, 52, 2, 6);
  },
  // A flat-crowned tree on a plain, a skyline far behind.
  acacia: (c) => {
    city(c, [8, 14, 10, 18, 12], 44, 10);
    rect(c, 22, 0, 4, 26);
    c.moveTo(4, 60 - 30);
    c.quadraticCurveTo(24, 60 - 46, 46, 60 - 30);
    c.quadraticCurveTo(24, 60 - 25, 4, 60 - 30);
  },
  // A mountain with a long flat top over a harbour town.
  mesa: (c) => {
    poly(c, 0, 0, 12, 30, 22, 38, 74, 38, 84, 30, 100, 0);
  },
  // Columns under a pediment.
  temple: (c) => {
    rect(c, 14, 0, 72, 5);
    rect(c, 18, 5, 64, 3);
    for (let i = 0; i < 6; i++) rect(c, 21 + i * 11, 8, 6, 26);
    rect(c, 16, 34, 68, 5);
    poly(c, 14, 39, 86, 39, 50, 52);
  },
  // A great round arena with rows of arches.
  arena: (c) => {
    c.moveTo(12, 60);
    c.lineTo(12, 60 - 30);
    c.quadraticCurveTo(50, 60 - 44, 88, 60 - 38);
    c.lineTo(88, 60);
    c.closePath();
  },
  // A windmill with four sails.
  windmill: (c) => {
    poly(c, 38, 0, 62, 0, 57, 32, 43, 32);
    poly(c, 41, 32, 59, 32, 50, 40);
    c.save();
    c.translate(50, 60 - 34);
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      c.rect(-2, 2, 4, 25);
      c.rect(2, 8, 5, 18);
    }
    c.restore();
    city(c, [6, 9], 2, 9);
    city(c, [8, 6], 80, 9);
  },
  // A big wheel by a tall church spire.
  wheel: (c) => {
    disc(c, 34, 28, 24);
    poly(c, 24, 0, 34, 28, 44, 0);
    rect(c, 70, 0, 12, 30);
    poly(c, 68, 30, 84, 30, 76, 58);
  },
  // Spiky towers of a church.
  spires: (c) => {
    rect(c, 22, 0, 56, 22);
    for (const [x, h] of [
      [24, 44],
      [36, 54],
      [56, 54],
      [68, 44],
    ])
      poly(c, x, 20, x + 8, 20, x + 6, h, x + 4, h + 4, x + 2, h);
  },
  // A lattice tower on four splayed legs.
  lattice: (c) => {
    c.moveTo(30, 60);
    c.quadraticCurveTo(44, 60 - 20, 47.5, 60 - 54);
    c.lineTo(50, 60 - 59);
    c.lineTo(52.5, 60 - 54);
    c.quadraticCurveTo(56, 60 - 20, 70, 60);
    c.lineTo(61, 60);
    c.quadraticCurveTo(50, 60 - 12, 39, 60);
    c.closePath();
    rect(c, 38, 18, 24, 3);
  },
  // A clock tower beside a long hall.
  clock: (c) => {
    rect(c, 14, 0, 46, 16);
    for (let x = 16; x < 58; x += 6) poly(c, x, 16, x + 4, 16, x + 2, 21);
    rect(c, 62, 0, 12, 40);
    rect(c, 60, 40, 16, 6);
    poly(c, 60, 46, 76, 46, 68, 58);
  },
  // A gate of columns carrying a beam.
  gate: (c) => {
    rect(c, 16, 0, 68, 4);
    for (let i = 0; i < 6; i++) rect(c, 20 + i * 11.6, 4, 5, 26);
    rect(c, 16, 30, 68, 8);
    rect(c, 40, 38, 20, 5);
    poly(c, 44, 43, 56, 43, 50, 50);
  },
  // A tall town-hall tower with a slim crown.
  hall: (c) => {
    rect(c, 10, 0, 80, 14);
    rect(c, 56, 0, 14, 44);
    poly(c, 54, 44, 72, 44, 66, 50, 60, 50);
    rect(c, 62, 50, 2, 8);
    for (let x = 14; x < 52; x += 9) rect(c, x, 14, 5, 4);
  },
  // A castle with round towers.
  castle: (c) => {
    rect(c, 22, 0, 56, 26);
    for (let x = 22; x < 78; x += 8) rect(c, x, 26, 5, 4);
    for (const x of [16, 72]) {
      rect(c, x, 0, 12, 34);
      poly(c, x - 1, 34, x + 13, 34, x + 6, 46);
    }
    rect(c, 44, 26, 12, 16);
    poly(c, 43, 42, 57, 42, 50, 52);
  },
  // High peaks with a little terraced ruin before them.
  peaks: (c) => {
    poly(c, 0, 0, 22, 36, 34, 26, 52, 54, 74, 22, 86, 32, 100, 0);
  },
  // A figure with arms open, high on a hill.
  figure: (c) => {
    c.moveTo(0, 60);
    c.quadraticCurveTo(40, 60 - 30, 64, 60 - 34);
    c.quadraticCurveTo(86, 60 - 26, 100, 60);
    c.closePath();
    rect(c, 61, 34, 6, 16);
    rect(c, 50, 47, 28, 3);
    disc(c, 64, 54, 3);
  },
  // A tall obelisk where avenues meet.
  column: (c) => {
    poly(c, 44, 0, 56, 0, 53, 50, 50, 56, 47, 50);
    city(c, [12, 18, 14, 10], 2, 10);
    city(c, [16, 10, 20, 12], 60, 10);
  },
  // A thin tower with a pod near its top.
  pod: (c) => {
    poly(c, 46, 0, 54, 0, 51.5, 40, 48.5, 40);
    rect(c, 43, 38, 14, 6);
    rect(c, 49.4, 44, 1.2, 15);
    city(c, [14, 22, 16, 10], 2, 10);
    city(c, [18, 12, 24, 14], 60, 10);
  },
  // Pointed shell-like sails by the water.
  sails: (c) => {
    rect(c, 10, 0, 80, 6);
    for (const [x, w, h] of [
      [16, 22, 30],
      [34, 22, 40],
      [52, 20, 32],
      [68, 18, 24],
    ]) {
      c.moveTo(x, 60 - 6);
      c.quadraticCurveTo(x + 2, 60 - 6 - h, x + w, 60 - 6 - h);
      c.quadraticCurveTo(x + w * 0.7, 60 - 6 - h * 0.4, x + w * 0.8, 60 - 6);
      c.closePath();
    }
  },
  // A tower on a wooded hill above a gate with a curved tiled roof.
  hill: (c) => {
    c.moveTo(48, 60);
    c.quadraticCurveTo(70, 60 - 30, 100, 60 - 22);
    c.lineTo(100, 60);
    c.closePath();
    poly(c, 76, 24, 80, 24, 79, 50, 77, 50);
    rect(c, 73, 40, 10, 4);
    rect(c, 12, 0, 30, 14);
    poly(c, 4, 18, 8, 14, 46, 14, 50, 18, 40, 24, 14, 24);
    poly(c, 16, 24, 38, 24, 34, 28, 20, 28);
  },
};
/** The silhouette each country's city shows. */
const BY_COUNTRY: Record<string, string> = {
  VN: "pagoda",
  TH: "stupa",
  ID: "obelisk",
  SG: "towers",
  IN: "gate",
  AE: "needle",
  NG: "skyline",
  TR: "mosque",
  EG: "pyramid",
  KE: "acacia",
  ZA: "mesa",
  GR: "temple",
  IT: "arena",
  NL: "windmill",
  AT: "wheel",
  ES: "spires",
  FR: "lattice",
  GB: "clock",
  DE: "gate",
  SE: "hall",
  PL: "castle",
  MX: "steps",
  PE: "peaks",
  US: "skyline",
  BR: "figure",
  AR: "column",
  CA: "pod",
  AU: "sails",
  JP: "pagoda",
  KR: "hill",
};
/** Prints a city's landmark in `color` into the box (x, y, w, h), standing on its bottom edge. */
export function drawLandmark(ctx: Ctx, country: string, x: number, y: number, w: number, h: number, color: string) {
  const draw = SHAPES[BY_COUNTRY[country] ?? "skyline"];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(w / 100, h / 60);
  ctx.fillStyle = color;
  ctx.beginPath();
  draw(ctx);
  ctx.fill("nonzero");
  ctx.restore();
}
