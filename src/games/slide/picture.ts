/**
 * The two pictures the picture stages are cut from, painted in code on a square canvas (our own scenes, nothing
 * copied): a hanok village under the full moon, and a pavilion by a lake in spring. Each place of the tray then
 * carries a faint number in its upper left corner, so that a piece can also be told by its number.
 */
/** A tiny fixed sequence, so that a picture comes out the same every time. */
function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
/** A ridge line across the picture: a sum of waves, from a seed. */
function ridge(random: () => number, base: number, height: number, waves = 4) {
  const parts = Array.from({ length: waves }, (_, k) => ({ f: (k + 1) * (0.6 + random() * 0.9), p: random() * Math.PI * 2, a: height / (k + 1.2) }));
  return (x: number) => base - parts.reduce((sum, w) => sum + w.a * (0.5 + 0.5 * Math.sin((x / 1024) * Math.PI * 2 * w.f + w.p)), 0);
}
function fillRidge(ctx: CanvasRenderingContext2D, line: (x: number) => number, fill: string | CanvasGradient, bottom = 1024) {
  ctx.beginPath();
  ctx.moveTo(0, bottom);
  for (let x = 0; x <= 1024; x += 8) ctx.lineTo(x, line(x));
  ctx.lineTo(1024, bottom);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
/** A band of mist lying at `y`, `deep` tall. */
function mist(ctx: CanvasRenderingContext2D, y: number, deep: number, color: string, alpha: number) {
  const g = ctx.createLinearGradient(0, y - deep, 0, y + deep);
  g.addColorStop(0, `rgba(${color},0)`);
  g.addColorStop(0.5, `rgba(${color},${alpha})`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, y - deep, 1024, deep * 2);
}
/**
 * A hanok roof seen from the front: the tiled slopes curving up to the eaves at both ends, the ridge on top with its
 * raised ends, rows of roof tiles as lines, and the round tile ends along the eaves. `w` wide from `x`, its eaves at `y`.
 */
function roof(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, tile: string, edge: string) {
  const lift = h * 0.38;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.04, y - lift);
  ctx.quadraticCurveTo(x + w * 0.18, y + h * 0.08, x + w * 0.5, y + h * 0.06);
  ctx.quadraticCurveTo(x + w * 0.82, y + h * 0.08, x + w * 1.04, y - lift);
  ctx.lineTo(x + w * 0.86, y - h * 0.86);
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.8, x + w * 0.14, y - h * 0.86);
  ctx.closePath();
  ctx.fillStyle = tile;
  ctx.fill();
  // The rows of tiles running down the slope.
  ctx.save();
  ctx.clip();
  ctx.strokeStyle = "rgba(0,0,0,0.28)";
  ctx.lineWidth = 3;
  for (let k = 0; k <= 26; k++) {
    const t = k / 26,
      top = x + w * (0.14 + 0.72 * t),
      foot = x + w * (-0.04 + 1.08 * t);
    ctx.beginPath();
    ctx.moveTo(top, y - h * 0.86);
    ctx.lineTo(foot, y + h * 0.1);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.07)";
  for (let k = 0; k <= 26; k++) {
    const t = (k + 0.5) / 26,
      top = x + w * (0.14 + 0.72 * t),
      foot = x + w * (-0.04 + 1.08 * t);
    ctx.beginPath();
    ctx.moveTo(top, y - h * 0.86);
    ctx.lineTo(foot, y + h * 0.1);
    ctx.stroke();
  }
  ctx.restore();
  // The ridge, with its ends turned up.
  ctx.fillStyle = edge;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.1, y - h * 0.84);
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.78, x + w * 0.9, y - h * 0.84);
  ctx.lineTo(x + w * 0.94, y - h * 1.02);
  ctx.quadraticCurveTo(x + w * 0.5, y - h * 0.9, x + w * 0.06, y - h * 1.02);
  ctx.closePath();
  ctx.fill();
  // The eaves: a pale line of tile ends.
  ctx.strokeStyle = "rgba(230,230,240,0.55)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x - w * 0.04, y - lift);
  ctx.quadraticCurveTo(x + w * 0.18, y + h * 0.08, x + w * 0.5, y + h * 0.06);
  ctx.quadraticCurveTo(x + w * 0.82, y + h * 0.08, x + w * 1.04, y - lift);
  ctx.stroke();
}
/** A hanok's front under its roof: posts, white walls framed in wood, and lattice doors, lit from inside when `lit`. */
function house(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lit: boolean, bays = 4) {
  // The stone base.
  ctx.fillStyle = "#8d8a86";
  ctx.fillRect(x - w * 0.04, y + h, w * 1.08, h * 0.16);
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  for (let k = 0; k < 7; k++) ctx.fillRect(x - w * 0.04 + (k * w * 1.08) / 7, y + h, 2, h * 0.16);
  // Walls and doors.
  ctx.fillStyle = "#e9e2d0";
  ctx.fillRect(x, y, w, h);
  const bay = w / bays;
  for (let b = 0; b < bays; b++) {
    const bx = x + b * bay;
    const door = ctx.createLinearGradient(0, y, 0, y + h);
    door.addColorStop(0, lit ? "#ffd27a" : "#efe6d2");
    door.addColorStop(1, lit ? "#f1a548" : "#d9ceb4");
    ctx.fillStyle = door;
    ctx.fillRect(bx + bay * 0.14, y + h * 0.12, bay * 0.72, h * 0.8);
    // The lattice.
    ctx.strokeStyle = "#6b3b22";
    ctx.lineWidth = 2;
    for (let k = 1; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(bx + bay * (0.14 + (0.72 * k) / 4), y + h * 0.12);
      ctx.lineTo(bx + bay * (0.14 + (0.72 * k) / 4), y + h * 0.92);
      ctx.stroke();
    }
    for (let k = 1; k < 6; k++) {
      ctx.beginPath();
      ctx.moveTo(bx + bay * 0.14, y + h * (0.12 + (0.8 * k) / 6));
      ctx.lineTo(bx + bay * 0.86, y + h * (0.12 + (0.8 * k) / 6));
      ctx.stroke();
    }
    ctx.strokeStyle = "#5a2f1a";
    ctx.lineWidth = 5;
    ctx.strokeRect(bx + bay * 0.14, y + h * 0.12, bay * 0.72, h * 0.8);
  }
  // Posts and the beam under the eaves.
  ctx.fillStyle = "#6e3420";
  for (let b = 0; b <= bays; b++) ctx.fillRect(x + b * bay - 7, y - 4, 14, h + 6);
  ctx.fillRect(x - 8, y - 14, w + 16, 16);
  // The painted bracket band (dancheong) under the beam.
  const colors = ["#2f7d6a", "#c8402e", "#2a5d9c", "#e8c45a"];
  for (let k = 0; k < Math.floor(w / 18); k++) {
    ctx.fillStyle = colors[k % colors.length];
    ctx.fillRect(x - 8 + k * 18, y - 22, 16, 8);
  }
}
/** A blue-and-red silk lantern hanging from `x`, `y`, glowing. */
function lantern(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const glow = ctx.createRadialGradient(x, y + s * 1.2, 0, x, y + s * 1.2, s * 3.2);
  glow.addColorStop(0, "rgba(255,200,120,0.55)");
  glow.addColorStop(1, "rgba(255,200,120,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(x - s * 3.2, y - s * 2, s * 6.4, s * 6.4);
  ctx.strokeStyle = "#2b1a10";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 1.4);
  ctx.lineTo(x, y);
  ctx.stroke();
  ctx.fillStyle = "#2f4f9c";
  ctx.fillRect(x - s * 0.6, y, s * 1.2, s * 0.9);
  ctx.fillStyle = "#c8302a";
  ctx.fillRect(x - s * 0.6, y + s * 0.9, s * 1.2, s * 1.1);
  ctx.fillStyle = "rgba(255,230,160,0.65)";
  ctx.fillRect(x - s * 0.36, y + s * 0.2, s * 0.72, s * 1.6);
  ctx.fillStyle = "#e8c45a";
  ctx.fillRect(x - s * 0.66, y - s * 0.12, s * 1.32, s * 0.16);
  ctx.fillRect(x - s * 0.66, y + s * 2, s * 1.32, s * 0.16);
  ctx.strokeStyle = "#c8302a";
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(x + k * s * 0.2, y + s * 2.14);
    ctx.lineTo(x + k * s * 0.24, y + s * 2.9);
    ctx.stroke();
  }
}
/** A hanok village under the full moon: stars, the moon, ridges in mist, two houses with lit doors, a stone wall and a persimmon tree. */
function moonlitVillage(ctx: CanvasRenderingContext2D) {
  const random = sequence(4041);
  const sky = ctx.createLinearGradient(0, 0, 0, 620);
  sky.addColorStop(0, "#141b46");
  sky.addColorStop(0.45, "#3b3a7a");
  sky.addColorStop(0.78, "#9a6a9a");
  sky.addColorStop(1, "#f0a978");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 1024);
  for (let k = 0; k < 160; k++) {
    const x = random() * 1024,
      y = random() * 420,
      r = random() < 0.1 ? 2.4 : 1 + random();
    ctx.fillStyle = `rgba(255,250,230,${0.35 + random() * 0.6})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // The moon, with its halo and faint seas.
  const halo = ctx.createRadialGradient(735, 225, 60, 735, 225, 250);
  halo.addColorStop(0, "rgba(255,240,200,0.55)");
  halo.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(480, 0, 520, 500);
  const face = ctx.createRadialGradient(715, 205, 10, 735, 225, 100);
  face.addColorStop(0, "#fffbe8");
  face.addColorStop(1, "#f3e2a8");
  ctx.fillStyle = face;
  ctx.beginPath();
  ctx.arc(735, 225, 96, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(190,170,120,0.25)";
  for (const [dx, dy, r] of [[-30, -20, 22], [18, 26, 30], [36, -34, 14], [-22, 42, 12]]) {
    ctx.beginPath();
    ctx.arc(735 + dx, 225 + dy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  // A few thin clouds across the moon.
  ctx.fillStyle = "rgba(60,50,110,0.35)";
  for (const [x, y, w] of [[600, 270, 260], [470, 150, 200], [120, 210, 240]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, 9, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // Ridges, far to near, with mist between.
  fillRidge(ctx, ridge(random, 560, 190, 4), "#6b5f99");
  mist(ctx, 545, 40, "240,190,200", 0.35);
  fillRidge(ctx, ridge(random, 630, 170, 5), "#4b4680");
  mist(ctx, 620, 36, "220,180,210", 0.3);
  fillRidge(ctx, ridge(random, 700, 120, 5), "#2e2f5e");
  // Pines on the near ridge, as dark strokes.
  ctx.fillStyle = "#1d2246";
  for (let k = 0; k < 26; k++) {
    const x = random() * 1024,
      y = 640 + random() * 50,
      h = 30 + random() * 40;
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x - h * 0.3, y);
    ctx.lineTo(x + h * 0.3, y);
    ctx.closePath();
    ctx.fill();
  }
  // The ground of the village, a path running into it.
  const ground = ctx.createLinearGradient(0, 700, 0, 1024);
  ground.addColorStop(0, "#2b2c4a");
  ground.addColorStop(1, "#1a1a2c");
  ctx.fillStyle = ground;
  ctx.fillRect(0, 700, 1024, 324);
  ctx.fillStyle = "rgba(240,200,150,0.18)";
  ctx.beginPath();
  ctx.moveTo(560, 1024);
  ctx.quadraticCurveTo(600, 850, 700, 760);
  ctx.lineTo(760, 760);
  ctx.quadraticCurveTo(700, 860, 760, 1024);
  ctx.fill();
  // A second house behind at the right, then the main one at the left.
  house(ctx, 690, 690, 250, 78, true, 3);
  roof(ctx, 660, 688, 310, 120, "#3b3f55", "#2a2d3e");
  house(ctx, 110, 705, 470, 140, true, 4);
  roof(ctx, 60, 700, 570, 210, "#424760", "#2b2e40");
  // Light falling from the doors onto the yard.
  ctx.fillStyle = "rgba(255,190,110,0.16)";
  ctx.beginPath();
  ctx.moveTo(110, 870);
  ctx.lineTo(580, 870);
  ctx.lineTo(640, 960);
  ctx.lineTo(60, 960);
  ctx.fill();
  lantern(ctx, 150, 705, 15);
  lantern(ctx, 540, 705, 15);
  // The stone wall along the front, capped with tiles.
  ctx.fillStyle = "#5d5a66";
  ctx.fillRect(0, 935, 1024, 89);
  for (let row = 0; row < 3; row++)
    for (let k = 0; k < 22; k++) {
      const x = k * 48 + (row % 2) * 24 + random() * 8,
        y = 950 + row * 26,
        tone = 110 + random() * 50;
      ctx.fillStyle = `rgb(${tone},${tone - 4},${tone + 8})`;
      ctx.beginPath();
      ctx.ellipse(x, y, 22 + random() * 4, 11 + random() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  ctx.fillStyle = "#3a3d52";
  ctx.beginPath();
  ctx.moveTo(-10, 945);
  ctx.quadraticCurveTo(512, 920, 1034, 945);
  ctx.lineTo(1034, 925);
  ctx.quadraticCurveTo(512, 902, -10, 925);
  ctx.fill();
  // The persimmon tree at the right: dark boughs hung with orange fruit.
  ctx.strokeStyle = "#20161a";
  ctx.lineCap = "round";
  const bough = (x: number, y: number, angle: number, length: number, width: number, depth: number) => {
    const ex = x + Math.cos(angle) * length,
      ey = y + Math.sin(angle) * length;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo((x + ex) / 2 + (random() - 0.5) * 30, (y + ey) / 2, ex, ey);
    ctx.stroke();
    if (depth > 0) for (const turn of [-0.5, 0.4]) bough(ex, ey, angle + turn + (random() - 0.5) * 0.3, length * 0.7, width * 0.65, depth - 1);
    else {
      ctx.fillStyle = "#f07a1e";
      ctx.beginPath();
      ctx.arc(ex, ey + 8, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,220,150,0.6)";
      ctx.beginPath();
      ctx.arc(ex - 3, ey + 4, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  bough(900, 1000, -1.75, 190, 30, 4);
  bough(960, 940, -2.4, 140, 18, 3);
  // A cat on the wall, watching the moon.
  ctx.fillStyle = "#15131c";
  ctx.beginPath();
  ctx.ellipse(380, 915, 34, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(408, 892, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(398, 882);
  ctx.lineTo(401, 866);
  ctx.lineTo(408, 879);
  ctx.moveTo(410, 879);
  ctx.lineTo(418, 866);
  ctx.lineTo(420, 884);
  ctx.fill();
  ctx.strokeStyle = "#15131c";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(348, 918);
  ctx.quadraticCurveTo(318, 930, 326, 960);
  ctx.stroke();
}
/** A cherry tree in bloom: a dark trunk and clouds of pink blossom. */
function blossom(ctx: CanvasRenderingContext2D, random: () => number, x: number, y: number, s: number) {
  ctx.strokeStyle = "#4a2e2a";
  ctx.lineCap = "round";
  const limb = (bx: number, by: number, angle: number, length: number, width: number, depth: number) => {
    const ex = bx + Math.cos(angle) * length,
      ey = by + Math.sin(angle) * length;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    if (depth > 0) for (const turn of [-0.45, 0.45]) limb(ex, ey, angle + turn + (random() - 0.5) * 0.4, length * 0.72, width * 0.62, depth - 1);
    else
      for (let k = 0; k < 9; k++) {
        const px = ex + (random() - 0.5) * s * 0.5,
          py = ey + (random() - 0.5) * s * 0.4,
          r = s * (0.07 + random() * 0.08);
        ctx.fillStyle = ["#f7c6d6", "#f2a9c2", "#fde3ec", "#e98fb0"][Math.floor(random() * 4)];
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
      }
  };
  limb(x, y, -Math.PI / 2 + (random() - 0.5) * 0.2, s * 0.9, s * 0.16, 4);
}
/** A pavilion by a lake in spring: clouds, green ridges, the lake with their reflection, the pavilion, blossom, a boat and reeds. */
function springPavilion(ctx: CanvasRenderingContext2D) {
  const random = sequence(2718);
  const sky = ctx.createLinearGradient(0, 0, 0, 520);
  sky.addColorStop(0, "#5aa7e8");
  sky.addColorStop(1, "#cfe8f6");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 1024, 1024);
  // Clouds.
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  for (const [x, y, s] of [[180, 110, 1.2], [620, 70, 0.9], [860, 190, 1.1], [420, 220, 0.7]]) {
    for (let k = 0; k < 6; k++) {
      ctx.beginPath();
      ctx.ellipse(x + (k - 2.5) * 34 * s, y + Math.sin(k * 1.7) * 10 * s, 46 * s, 28 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Birds.
  ctx.strokeStyle = "#33465a";
  ctx.lineWidth = 3;
  for (const [x, y, s] of [[300, 300, 1], [340, 280, 0.8], [372, 312, 0.7], [700, 260, 0.9]]) {
    ctx.beginPath();
    ctx.moveTo(x - 14 * s, y - 6 * s);
    ctx.quadraticCurveTo(x - 6 * s, y - 10 * s, x, y);
    ctx.quadraticCurveTo(x + 6 * s, y - 10 * s, x + 14 * s, y - 6 * s);
    ctx.stroke();
  }
  // Ridges.
  const far = ridge(random, 470, 160, 4),
    mid = ridge(random, 540, 120, 5);
  fillRidge(ctx, far, "#8fb4c8", 600);
  fillRidge(ctx, mid, "#5f9a72", 600);
  mist(ctx, 520, 30, "235,245,250", 0.4);
  // The near shore: a green bank across, trees on it.
  const bank = ridge(random, 610, 40, 3);
  fillRidge(ctx, bank, "#4f8f4a", 640);
  for (let k = 0; k < 30; k++) {
    const x = random() * 1024,
      y = bank(x) + 6;
    ctx.fillStyle = random() < 0.25 ? "#f2b6c9" : ["#3d7a3d", "#5a9a48", "#2f6a3a"][Math.floor(random() * 3)];
    ctx.beginPath();
    ctx.arc(x, y - 14, 14 + random() * 12, 0, Math.PI * 2);
    ctx.fill();
  }
  // The lake: the sky and the ridges mirrored, then ripples.
  const water = ctx.createLinearGradient(0, 630, 0, 1024);
  water.addColorStop(0, "#9fcbe0");
  water.addColorStop(1, "#3f7fa8");
  ctx.fillStyle = water;
  ctx.fillRect(0, 630, 1024, 394);
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.beginPath();
  ctx.moveTo(0, 630);
  for (let x = 0; x <= 1024; x += 8) ctx.lineTo(x, 630 + (630 - mid(x)) * 0.8);
  ctx.lineTo(1024, 630);
  ctx.fillStyle = "#3f7a58";
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = "rgba(255,255,255,0.45)";
  ctx.lineWidth = 2.5;
  for (let k = 0; k < 70; k++) {
    const x = random() * 1024,
      y = 650 + random() * 370,
      w = 20 + random() * 60;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  }
  // The pavilion on its stilts over the water at the left: red posts, a roof painted in green and red, the deck.
  const px = 120,
    py = 690,
    pw = 330;
  ctx.fillStyle = "rgba(60,40,30,0.3)";
  ctx.fillRect(px + 10, py + 190, pw - 20, 60);
  ctx.fillStyle = "#7a3a22";
  for (let k = 0; k <= 4; k++) ctx.fillRect(px + 20 + (k * (pw - 40)) / 4 - 7, py + 40, 14, 180);
  ctx.fillStyle = "#b8442c";
  for (let k = 0; k <= 4; k++) ctx.fillRect(px + 20 + (k * (pw - 40)) / 4 - 6, py + 40, 12, 120);
  ctx.fillStyle = "#8a5a36";
  ctx.fillRect(px, py + 150, pw, 18);
  ctx.fillStyle = "#6e4426";
  for (let k = 0; k < 12; k++) ctx.fillRect(px + 8 + k * 27, py + 128, 6, 24);
  ctx.fillRect(px, py + 124, pw, 7);
  ctx.fillStyle = "#2f7d6a";
  ctx.fillRect(px + 6, py + 26, pw - 12, 16);
  const colors = ["#c8402e", "#2a5d9c", "#e8c45a", "#2f7d6a"];
  for (let k = 0; k < 18; k++) {
    ctx.fillStyle = colors[k % 4];
    ctx.fillRect(px + 8 + k * 18, py + 30, 14, 8);
  }
  roof(ctx, px - 30, py + 30, pw + 60, 150, "#3e4d5c", "#2c3742");
  // A finial on top.
  ctx.fillStyle = "#c9a23a";
  ctx.beginPath();
  ctx.arc(px + pw / 2, py - 128, 9, 0, Math.PI * 2);
  ctx.fill();
  // Its reflection, broken by the ripples.
  ctx.fillStyle = "rgba(120,40,30,0.35)";
  for (let k = 0; k <= 4; k++) ctx.fillRect(px + 20 + (k * (pw - 40)) / 4 - 6, py + 225, 12, 70);
  ctx.fillStyle = "rgba(50,60,80,0.3)";
  ctx.fillRect(px - 10, py + 290, pw + 20, 30);
  // Stepping stones from the pavilion to the near bank.
  ctx.fillStyle = "#b8b2a6";
  for (const [x, y, w] of [[470, 910, 60], [540, 950, 70], [440, 980, 64]]) {
    ctx.beginPath();
    ctx.ellipse(x, y, w / 2, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // A small boat on the lake at the right.
  ctx.fillStyle = "#7a4a26";
  ctx.beginPath();
  ctx.moveTo(640, 800);
  ctx.quadraticCurveTo(720, 840, 820, 800);
  ctx.lineTo(800, 820);
  ctx.quadraticCurveTo(720, 846, 660, 820);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#3a2a1a";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(700, 812);
  ctx.lineTo(760, 760);
  ctx.stroke();
  ctx.fillStyle = "#f2e6c8";
  ctx.beginPath();
  ctx.arc(726, 796, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e8d6a0";
  ctx.beginPath();
  ctx.moveTo(706, 790);
  ctx.lineTo(746, 790);
  ctx.lineTo(726, 774);
  ctx.fill();
  // Cherry trees in bloom, near and far, and petals in the air.
  blossom(ctx, random, 880, 1000, 300);
  blossom(ctx, random, 60, 1020, 200);
  for (let k = 0; k < 90; k++) {
    ctx.fillStyle = `rgba(250,${190 + random() * 40},${210 + random() * 30},${0.6 + random() * 0.4})`;
    ctx.beginPath();
    ctx.ellipse(random() * 1024, random() * 1024, 4, 2.5, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  // Reeds along the near edge.
  ctx.strokeStyle = "#5c7a3a";
  ctx.lineWidth = 3;
  for (let k = 0; k < 40; k++) {
    const x = 560 + random() * 260,
      h = 50 + random() * 80;
    ctx.beginPath();
    ctx.moveTo(x, 1024);
    ctx.quadraticCurveTo(x + 6, 1024 - h * 0.6, x + (random() - 0.3) * 30, 1024 - h);
    ctx.stroke();
  }
}
/** The names of the pictures, for the stage cards and the panel. */
export const PICTURE_NAMES = ["", "달밤의 한옥 마을", "봄날의 정자"];
/**
 * The picture `which` (1 or 2) as a canvas `px` square, with each place of a tray of `size` numbered faintly in its
 * upper left corner (`inset` is how far inside the place the visible top of a tile begins, as a share of a place).
 */
export function paintPicture(which: number, size: number, inset = 0.06, px = 1024) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = px;
  const ctx = canvas.getContext("2d")!;
  ctx.save();
  ctx.scale(px / 1024, px / 1024);
  if (which === 2) springPavilion(ctx);
  else moonlitVillage(ctx);
  ctx.restore();
  const cell = px / size,
    font = Math.round(cell * 0.15);
  ctx.font = `700 ${font}px "Inter", "Noto Sans KR", Arial, sans-serif`;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  for (let i = 0; i < size * size; i++) {
    const x = (i % size) * cell + cell * inset + font * 0.35,
      y = Math.floor(i / size) * cell + cell * inset + font * 0.25;
    ctx.lineWidth = font * 0.18;
    ctx.strokeStyle = "rgba(20,20,30,0.38)";
    ctx.strokeText(String(i + 1), x, y);
    ctx.fillStyle = "rgba(255,255,255,0.62)";
    ctx.fillText(String(i + 1), x, y);
  }
  return canvas;
}
