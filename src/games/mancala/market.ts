import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { capable, stuff, weave, wood } from "../../engine/scene-utils";

type Own = <R extends { dispose(): void }>(resource: R) => R;
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function picture(c: HTMLCanvasElement, own: Own, repeat = false) {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = capable() ? 4 : 1;
  if (repeat) t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** A small seeded sequence, so the market is laid out the same every time. */
/**
 * A surface of the scenery: physically lit where a graphics card draws; where the processor draws alone, the cheaper
 * Lambert light (the market cost half as much again as the old one under software drawing).
 */
export function matte(o: T.MeshStandardMaterialParameters, rich = capable()): T.Material {
  if (rich) return new T.MeshStandardMaterial({ roughness: 0.85, ...o });
  const { roughness: _r, metalness: _m, roughnessMap: _rm, metalnessMap: _mm, envMapIntensity: _e, ...rest } = o;
  return new T.MeshLambertMaterial(rest as T.MeshLambertMaterialParameters);
}
function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
/** A knotted carpet of our own: a madder field with an indigo medallion, a flowered border and guard stripes. */
function carpet(own: Own) {
  const W = 1024,
    H = 640,
    { c, ctx } = canvas(W, H),
    rnd = seeded(7);
  const field = "#8c2a22",
    indigo = "#1f3b5c",
    ivory = "#ecdcb8",
    saffron = "#d99a2b",
    leaf = "#4c6b3c";
  ctx.fillStyle = indigo;
  ctx.fillRect(0, 0, W, H);
  // The border: a band of rosettes and leaves between two guard stripes.
  const band = 70;
  ctx.fillStyle = ivory;
  ctx.fillRect(10, 10, W - 20, H - 20);
  ctx.fillStyle = indigo;
  ctx.fillRect(18, 18, W - 36, H - 36);
  const rosette = (x: number, y: number, r: number, petals: string, heart: string) => {
    ctx.fillStyle = petals;
    for (let k = 0; k < 8; k++) {
      const a = (k * Math.PI) / 4;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.2, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = heart;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
    ctx.fill();
  };
  for (let x = 54; x < W - 30; x += 64) {
    rosette(x, 18 + band / 2 - 8, 20, saffron, field);
    rosette(x, H - 18 - band / 2 + 8, 20, saffron, field);
  }
  for (let y = 112; y < H - 90; y += 64) {
    rosette(18 + band / 2 - 8, y, 20, saffron, field);
    rosette(W - 18 - band / 2 + 8, y, 20, saffron, field);
  }
  ctx.fillStyle = ivory;
  ctx.fillRect(18 + band, 18 + band, W - 36 - 2 * band, H - 36 - 2 * band);
  ctx.fillStyle = field;
  const fx = 26 + band,
    fy = 26 + band,
    fw = W - 52 - 2 * band,
    fh = H - 52 - 2 * band;
  ctx.fillRect(fx, fy, fw, fh);
  // An all-over pattern of small flowers and leaves in the field.
  for (let y = fy + 22; y < fy + fh - 10; y += 40)
    for (let x = fx + 22 + ((y / 40) % 2) * 20; x < fx + fw - 10; x += 40) {
      ctx.fillStyle = rnd() < 0.5 ? "rgba(236,220,184,0.55)" : "rgba(217,154,43,0.6)";
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(76,107,60,0.65)";
      ctx.beginPath();
      ctx.ellipse(x + 8, y + 5, 6, 2.5, 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  // Corner spandrels.
  for (const [sx, sy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const x = sx ? fx + fw : fx,
      y = sy ? fy + fh : fy;
    ctx.fillStyle = indigo;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (sx ? -170 : 170), y);
    ctx.quadraticCurveTo(x + (sx ? -60 : 60), y + (sy ? -60 : 60), x, y + (sy ? -120 : 120));
    ctx.closePath();
    ctx.fill();
    rosette(x + (sx ? -46 : 46), y + (sy ? -36 : 36), 16, ivory, saffron);
  }
  // The medallion: a lobed lozenge in indigo, ivory and saffron.
  const cx = W / 2,
    cy = H / 2;
  const lozenge = (rx: number, ry: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let k = 0; k <= 64; k++) {
      const a = (k / 64) * Math.PI * 2,
        lobe = 1 + 0.08 * Math.cos(a * 12),
        // A diamond with rounded sides.
        d = 1 / (Math.abs(Math.cos(a)) ** 1.4 + Math.abs(Math.sin(a)) ** 1.4) ** (1 / 1.4);
      ctx.lineTo(cx + Math.cos(a) * rx * d * lobe, cy + Math.sin(a) * ry * d * lobe);
    }
    ctx.fill();
  };
  lozenge(330, 200, ivory);
  lozenge(312, 186, indigo);
  lozenge(240, 136, saffron);
  lozenge(222, 122, field);
  lozenge(120, 72, ivory);
  rosette(cx, cy, 52, indigo, saffron);
  for (const side of [-1, 1]) {
    rosette(cx + side * 170, cy, 26, ivory, indigo);
    ctx.fillStyle = leaf;
    ctx.beginPath();
    ctx.ellipse(cx + side * 100, cy - 40, 22, 8, side * 0.5, 0, Math.PI * 2);
    ctx.ellipse(cx + side * 100, cy + 40, 22, 8, -side * 0.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // Wear: the pile is a little uneven.
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = rnd() < 0.5 ? "rgba(0,0,0,0.06)" : "rgba(255,240,210,0.05)";
    ctx.fillRect(rnd() * W, rnd() * H, 2, 2);
  }
  return picture(c, own);
}
/** Stripes for an awning, a cushion or a bolster. */
function stripes(colors: string[], own: Own, width = 256) {
  const { c, ctx } = canvas(width, 32);
  const w = width / colors.length;
  colors.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(i * w, 0, w + 1, 32);
  });
  return picture(c, own, true);
}
/** The weave of a basket: rows of cane. */
function wicker(own: Own) {
  const { c, ctx } = canvas(128, 128);
  ctx.fillStyle = "#a8783e";
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 8)
    for (let x = 0; x < 128; x += 16) {
      const off = (y / 8) % 2 ? 8 : 0;
      const g = ctx.createLinearGradient(0, y, 0, y + 8);
      g.addColorStop(0, "#c99a58");
      g.addColorStop(1, "#7d5228");
      ctx.fillStyle = g;
      ctx.fillRect(x + off, y + 1, 14, 6);
    }
  const t = picture(c, own, true);
  t.repeat.set(6, 3);
  return t;
}
/** A clay pot's glaze: terracotta with white painted bands and dots. */
function potPaint(own: Own) {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#b8643a";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#f0e2c4";
  for (const y of [70, 92, 150]) ctx.fillRect(0, y, 256, 5);
  for (let x = 8; x < 256; x += 21) {
    ctx.beginPath();
    ctx.arc(x, 120, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#3a1f14";
  for (let x = 0; x < 256; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 150);
    ctx.lineTo(x + 16, 176);
    ctx.lineTo(x + 32, 150);
    ctx.fill();
  }
  return picture(c, own, true);
}
export interface Market {
  /** Flames of the oil lamps, which flicker where the table keeps its own clock. */
  flames: T.Mesh[];
  /** The lamps' light. */
  glow: T.PointLight | null;
}
/**
 * A market of our own round the rug the board lies on: sand underfoot, a knotted carpet with fringes, a bolster on
 * the far side, a spice seller's baskets under a striped awning at the back, painted water pots at the right and a
 * brass tray with dates, a water pot and two oil lamps at the left. All painted in code.
 */
export function market(scene: T.Scene, own: Own, rich: boolean): Market {
  const standard = (o: T.MeshStandardMaterialParameters) => own(matte(o, rich));
  const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, cast = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  /** Copies of one geometry laid as one mesh (one draw instead of many). */
  const merged = (parts: T.BufferGeometry[], material: T.Material, cast = true) => {
    const mesh = new T.Mesh(own(mergeGeometries(parts)!), material);
    parts.forEach((p) => p.dispose());
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const rnd = seeded(3);
  // The sand of the market square.
  // (Cut out under the carpet, so that what the carpet covers is never drawn twice.)
  const sand = standard({ ...stuff("earth", "#dcbd82", 10 / 90, own), roughness: 1 }),
    square = new T.Shape([new T.Vector2(-45, -45), new T.Vector2(45, -45), new T.Vector2(45, 45), new T.Vector2(-45, 45)]);
  square.holes.push(new T.Path([new T.Vector2(-6.6, -4.3), new T.Vector2(-6.6, 3.7), new T.Vector2(6.6, 3.7), new T.Vector2(6.6, -4.3)]));
  add(new T.ShapeGeometry(square), sand, 0, -0.03, 0, false).rotation.x = -Math.PI / 2;
  // The carpet, and its fringes at the two ends.
  // (Cut out under the board, so that what the board covers is never drawn twice.)
  const rugShape = new T.Shape([new T.Vector2(-6.8, -4.2), new T.Vector2(6.8, -4.2), new T.Vector2(6.8, 4.2), new T.Vector2(-6.8, 4.2)]);
  rugShape.holes.push(new T.Path([new T.Vector2(-5.6, -1.4), new T.Vector2(-5.6, 2.0), new T.Vector2(5.6, 2.0), new T.Vector2(5.6, -1.4)]));
  const rug = new T.ShapeGeometry(rugShape),
    uv = rug.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) + 6.8) / 13.6, (uv.getY(i) + 4.2) / 8.4);
  add(rug, standard({ map: carpet(own), roughness: 1, ...weave(10, 6, own, 0.6) }), 0, 0.02, 0.3, false).rotation.x = -Math.PI / 2;
  const thread = new T.BoxGeometry(0.035, 0.012, 0.32),
    threads: T.BufferGeometry[] = [];
  for (const side of [-1, 1])
    for (let z = -3.8; z <= 4.4; z += 0.12) {
      const t = thread.clone();
      t.rotateY((rnd() - 0.5) * 0.35);
      t.rotateZ(Math.PI / 2);
      t.rotateY(Math.PI / 2);
      t.translate(side * (6.8 + 0.15), 0.006, z + (rnd() - 0.5) * 0.03);
      threads.push(t);
    }
  thread.dispose();
  // The small things (fringes, the scoop, the halos, the marigolds) only where a graphics card draws: under software
  // drawing every extra mesh costs a few milliseconds a frame.
  if (rich) merged(threads, standard({ color: "#efe3c8", roughness: 1 }), false);
  else threads.forEach((t) => t.dispose());
  // A bolster for the player across the board.
  const bolsterCloth = stripes(["#7a1f2b", "#d9a441", "#7a1f2b", "#1f4f6b", "#e9dcc0", "#1f4f6b"], own);
  bolsterCloth.repeat.set(4, 1);
  const bolster = add(new T.CapsuleGeometry(0.42, 4.2, 6, 20), standard({ map: bolsterCloth, roughness: 0.95, ...weave(3, 3, own, 0.5) }), 0.4, 0.42, -3.25);
  bolster.rotation.z = Math.PI / 2;
  const tassel = standard({ color: "#d9a441", roughness: 0.9 });
  for (const side of [-1, 1]) add(new T.ConeGeometry(0.12, 0.32, 10), tassel, 0.4 + side * 2.66, 0.42, -3.25).rotation.z = side * Math.PI / 2;
  // The spice seller's stall at the back: baskets of spice under a striped awning.
  const basketWeave = standard({ map: wicker(own), roughness: 0.95, side: T.DoubleSide }),
    spices = ["#b83a1e", "#e2a52b", "#6b7a2a", "#7a3b1d", "#d86a1f"].map((color) => standard({ color, roughness: 1 })),
    basket = new T.LatheGeometry([new T.Vector2(0.55, 0), new T.Vector2(0.78, 0.1), new T.Vector2(0.86, 0.62), new T.Vector2(0.92, 0.66), new T.Vector2(0.86, 0.7), new T.Vector2(0.8, 0.56)], 22);
  const heap = (r: number) => {
    // A heap of ground spice: a low cone with a rounded, slightly lumpy top.
    const g = new T.LatheGeometry(
      [1, 0.86, 0.7, 0.5, 0.3, 0.12, 0].map((k) => new T.Vector2(r * k, 0.62 * (1 - k ** 1.6) * r)),
      20,
    );
    return g;
  };
  const stalls: [number, number, number][] = [
    [-5.4, -5.3, 1],
    [-3.5, -5.9, 0.95],
    [-1.6, -5.4, 1.05],
    [0.4, -6.0, 0.9],
    [2.3, -5.5, 1],
  ];
  const baskets: T.BufferGeometry[] = [];
  stalls.forEach(([x, z, s], i) => {
    baskets.push(basket.clone().scale(s, s, s).translate(x, 0, z));
    const h = add(heap(0.84 * s), spices[i], x, 0.6 * s, z, false);
    h.scale.y = 1.2;
  });
  basket.dispose();
  merged(baskets, basketWeave);
  // A brass scoop left in the turmeric.
  const brass = standard({ color: "#c9a14a", roughness: 0.28, metalness: 0.85, side: T.DoubleSide });
  if (rich) add(new T.CylinderGeometry(0.03, 0.03, 0.9, 8), brass, -3.2, 1.05, -5.7).rotation.set(0.6, 0, -0.7);
  // The awning: striped cloth with a scalloped hem, on two poles.
  const { c: hem, ctx: hc } = canvas(512, 128);
  for (let i = 0; i < 16; i++) {
    hc.fillStyle = i % 2 ? "#f0e4c6" : "#b0402c";
    hc.fillRect(i * 32, 0, 32, 96);
  }
  hc.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 16; i++) {
    hc.beginPath();
    hc.arc(i * 32 + 16, 128, 30, 0, Math.PI * 2);
    hc.fill();
  }
  const awning = picture(hem, own, true);
  awning.repeat.set(2, 1);
  const cloth = add(new T.PlaneGeometry(19, 3, 1, 1), standard({ map: awning, roughness: 1, side: T.DoubleSide, alphaTest: 0.5 }), 0, 3.4, -7.2, false);
  cloth.rotation.x = 0.55;
  const pole = standard({ map: own(wood(true)), roughness: 0.8 });
  merged(
    [-9, 9].map((x) => new T.CylinderGeometry(0.12, 0.14, 5, 10).translate(x, 2.5, -6.6)),
    pole,
  );
  // Painted water pots at the right, on a ring of straw.
  const potProfile = [
      [0.0, 0],
      [0.3, 0.02],
      [0.55, 0.25],
      [0.66, 0.62],
      [0.6, 0.98],
      [0.38, 1.2],
      [0.24, 1.3],
      [0.3, 1.42],
      [0.27, 1.46],
    ].map(([r, y]) => new T.Vector2(r, y)),
    pot = new T.LatheGeometry(potProfile, 24),
    clay = standard({ map: potPaint(own), roughness: 0.75, side: T.DoubleSide });
  const pots: T.BufferGeometry[] = [];
  for (const [x, z, s] of [
    [7.5, -4.6, 1.25],
    [8.6, -3.2, 1.0],
    [7.7, -2.6, 0.75],
    [8.9, -5.4, 1.1],
  ])
    pots.push(pot.clone().scale(s, s, s).translate(x, 0, z));
  pot.dispose();
  merged(pots, clay);
  // At the left: a brass tray of dates, a brass water pot and two oil lamps.
  const tray = add(new T.LatheGeometry([new T.Vector2(0, 0), new T.Vector2(0.95, 0), new T.Vector2(1.05, 0.08), new T.Vector2(1.08, 0.1)], 36), brass, -7.6, 0.03, -2.0, false);
  tray.receiveShadow = true;
  const date = new T.SphereGeometry(0.13, 10, 8),
    dates: T.BufferGeometry[] = [];
  for (let i = 0; i < 13; i++) {
    const a = i * 2.4,
      r = 0.2 + 0.55 * Math.sqrt(i / 13);
    dates.push(date.clone().scale(1, 0.7, 1.55).rotateY(a).translate(-7.6 + Math.cos(a) * r, 0.14 + (i < 3 ? 0.08 : 0), -2.0 + Math.sin(a) * r));
  }
  date.dispose();
  merged(dates, standard({ color: "#4e2614", roughness: 0.45 }), rich);
  const lota = new T.LatheGeometry(
    [
      [0, 0],
      [0.22, 0],
      [0.38, 0.15],
      [0.42, 0.36],
      [0.32, 0.58],
      [0.17, 0.68],
      [0.15, 0.78],
      [0.24, 0.86],
      [0.22, 0.88],
    ].map(([r, y]) => new T.Vector2(r, y)),
    24,
  );
  add(lota, brass, -8.3, 0, -0.3);
  // Oil lamps of clay, each with a flame.
  const flames: T.Mesh[] = [],
    lamp = new T.LatheGeometry([new T.Vector2(0, 0), new T.Vector2(0.12, 0), new T.Vector2(0.22, 0.08), new T.Vector2(0.24, 0.12), new T.Vector2(0.2, 0.11)], 18),
    lampClay = standard({ color: "#a65532", roughness: 0.8, side: T.DoubleSide }),
    fire = own(new T.MeshBasicMaterial({ color: "#ffc35a", transparent: true, opacity: 0.92 })),
    flame = own(new T.SphereGeometry(0.08, 12, 8).scale(1, 2.4, 1).translate(0, 0.17, 0));
  // A soft halo round each flame, always facing the eye.
  const { c: haloPaint, ctx: hx } = canvas(64, 64),
    hg = hx.createRadialGradient(32, 32, 0, 32, 32, 32);
  hg.addColorStop(0, "rgba(255,200,110,0.9)");
  hg.addColorStop(0.35, "rgba(255,160,60,0.35)");
  hg.addColorStop(1, "rgba(255,140,40,0)");
  hx.fillStyle = hg;
  hx.fillRect(0, 0, 64, 64);
  const halo = own(new T.SpriteMaterial({ map: picture(haloPaint, own), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
  const lamps: [number, number][] = [
    [-6.55, -0.75],
    [-6.6, 0.55],
  ];
  merged(
    lamps.map(([x, z]) => lamp.clone().scale(1.5, 1.5, 1.5).translate(x, 0.02, z)),
    lampClay,
    rich,
  );
  lamp.dispose();
  for (const [x, z] of lamps) {
    const f = new T.Mesh(flame, fire);
    f.position.set(x + 0.2, 0.18, z);
    scene.add(f);
    flames.push(f);
    const h = new T.Sprite(halo);
    h.position.set(x + 0.2, 0.42, z);
    h.scale.setScalar(0.9);
    if (rich) scene.add(h);
  }
  if (rich) {
    // A heap of marigolds in a brass bowl beside the lamps.
    add(new T.LatheGeometry([new T.Vector2(0, 0), new T.Vector2(0.3, 0), new T.Vector2(0.46, 0.18), new T.Vector2(0.48, 0.22)], 24), brass, -8.0, 0.02, 0.95);
    const bloom = new T.IcosahedronGeometry(0.085, 1),
      blooms: T.BufferGeometry[] = [];
    for (let i = 0; i < 22; i++) {
      const a = i * 2.4,
        r = 0.36 * Math.sqrt(i / 22);
      blooms.push(bloom.clone().translate(-8.0 + Math.cos(a) * r, 0.24 + (0.36 - r) * 0.35, 0.95 + Math.sin(a) * r));
    }
    bloom.dispose();
    merged(blooms, standard({ color: "#f08a1c", roughness: 0.9 }), rich);
  }
  let glow: T.PointLight | null = null;
  if (rich) {
    glow = new T.PointLight("#ffb050", 1.2, 4, 2);
    glow.position.set(-6.4, 0.6, -0.1);
    scene.add(glow);
  }
  return { flames, glow };
}
