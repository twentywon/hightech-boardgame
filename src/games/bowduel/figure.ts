import * as T from "three";
import { compactGroup } from "../badminton/merge";
import { grain, grainUV } from "../../engine/grain";
import { canvas, stream, texture, type Own } from "../goldraid/paint";

/**
 * The archers of 활잡이 결투 and their arrows, modelled in code. An archer is built facing +x with its feet at the
 * origin (the view mirrors it across for the one facing the other way); its parts stand where the rules' figure has
 * them (legs to 0.86 m, the body to 1.46 m, the head round 1.63 m), so that an arrow is seen to stand where it struck.
 * Its own colour is its coat, sash, hat band, plume and fletching; the two are otherwise alike: a lamellar vest laced
 * over a folded coat, a leather shoulder guard and bracer, a wide hat, a quiver of fletched arrows on the back, and a
 * recurve bow of laminated wood whose limbs bend as the string comes back. Its face shows what it is about (calm,
 * set on its aim, struck, beaten), it breathes while it waits, and after the loose its bow arm follows through and
 * the drawing hand flies back past the ear.
 */
export type Mood = "calm" | "focus" | "hurt" | "down";
export interface Archer {
  /** At the feet: the view places and mirrors it. */
  root: T.Group;
  /** Everything above the feet, leaning back when struck and falling when beaten (its pivot at the feet). */
  body: T.Group;
  /** Lays the bow at `angle` degrees above the level, drawn `share` (0 to 1) with an arrow on the string, or at rest. */
  aim(angle: number, share: number, nocked: boolean): void;
  rest(): void;
  /** The follow-through after a loose, from 1 (just loosed) to 0 (settled). */
  kick(amount: number): void;
  /** The face (and how the head is held). */
  mood(kind: Mood): void;
  /** Idle life: breath, the head, the sash and plume in the wind (m/s along the archer's front). */
  pose(time: number, wind: number): void;
  /** A beaten archer sinking to the ground, `p` from 0 to 1 (the knees go, then it falls back). */
  fall(p: number): void;
  /** Where the bow hand is, in the archer's own frame (for the arrow leaving it). */
  readonly holds: { angle: number; share: number; nocked: boolean };
}
/** The arrow's length as drawn (m: a little longer than life, so that it reads across the field). */
export const ARROW_LENGTH = 0.92;
const SHOULDER = new T.Vector3(0.02, 1.4, 0.09),
  BACK_SHOULDER = new T.Vector3(-0.04, 1.4, -0.08),
  ARM = 0.6,
  /** The bow, in the bow hand's frame (its grip at the origin, the string side toward +y): the tips and the string at rest. */
  TIP = { x: 0.66, y: 0.2 },
  /** How far the string comes back (m) for the weakest and the fullest draw; how far the limbs bend at full draw (rad). */
  PULL = { least: 0.08, most: 0.56 },
  FLEX = 0.17;

export interface Paints {
  skin: T.Material;
  hair: T.Material;
  cloth: T.Material;
  trousers: T.Material;
  leather: T.Material;
  brass: T.Material;
  wood: T.Material;
  felt: T.Material;
  string: T.LineBasicMaterial;
  steel: T.Material;
  shaft: T.Material;
  white: T.Material;
  lamellar: T.Material;
  horn: T.Material;
}
const pictures = new WeakMap<Own, Record<string, T.Texture>>();
/** The pictures laid on cloth, leather and the vest, painted once for a view. */
function picturesOf(own: Own) {
  let p = pictures.get(own);
  if (p) return p;
  // Cloth: soft vertical folds and a fine weave (grey, so that it shades whatever colour it is laid on).
  const folds = canvas(128, 256, (ctx) => {
    const r = stream(41);
    ctx.fillStyle = "#e8e8e8";
    ctx.fillRect(0, 0, 128, 256);
    for (let k = 0; k < 22; k++) {
      const x = r() * 128,
        w = 3 + r() * 9,
        g = ctx.createLinearGradient(x - w, 0, x + w, 0),
        dark = 0.12 + r() * 0.2;
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(0.5, `rgba(40,30,25,${dark})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x - w, 0, w * 2, 256);
      ctx.fillStyle = `rgba(255,255,255,${dark * 0.6})`;
      ctx.fillRect(x + w * 0.6, 0, 1.5, 256);
    }
    for (let y = 0; y < 256; y += 2) {
      ctx.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.03})`;
      ctx.fillRect(0, y, 128, 1);
    }
  });
  // Lamellar: rows of small lacquered plates laced together, a brass rivet at each top.
  const plates = canvas(128, 128, (ctx) => {
    const r = stream(42);
    ctx.fillStyle = "#1c120c";
    ctx.fillRect(0, 0, 128, 128);
    for (let row = 0; row < 8; row++)
      for (let col = 0; col < 8; col++) {
        const x = col * 16 + (row % 2) * 8,
          y = row * 16,
          shade = 60 + r() * 25;
        const g = ctx.createLinearGradient(x, y, x, y + 15);
        g.addColorStop(0, `hsl(22, 38%, ${shade * 0.55}%)`);
        g.addColorStop(1, `hsl(20, 42%, ${shade * 0.32}%)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect((x % 128) + 1, y + 1, 14, 14, [5, 5, 2, 2]);
        ctx.fill();
        ctx.fillStyle = "#d8b45a";
        ctx.beginPath();
        ctx.arc((x % 128) + 8, y + 4, 1.4, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.strokeStyle = "rgba(200,60,40,0.55)";
    ctx.lineWidth = 1;
    for (let row = 0; row < 8; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * 16 + 11);
      ctx.lineTo(128, row * 16 + 11);
      ctx.stroke();
    }
  });
  // Leather: mottled, a stitched edge.
  const hide = canvas(128, 128, (ctx) => {
    const r = stream(43);
    ctx.fillStyle = "#cfcfcf";
    ctx.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 500; k++) {
      ctx.fillStyle = `rgba(${r() < 0.5 ? "255,255,255" : "0,0,0"},${0.05 + r() * 0.08})`;
      ctx.beginPath();
      ctx.arc(r() * 128, r() * 128, 1 + r() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "rgba(255,240,210,0.6)";
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(5, 5, 118, 118);
  });
  p = {
    folds: texture(own, folds, { repeat: [2, 1] }),
    plates: texture(own, plates, { repeat: [3, 2] }),
    hide: texture(own, hide, { repeat: [1, 1] }),
  };
  pictures.set(own, p);
  return p;
}
/** The materials the two archers share; their own colour is laid on per archer. */
export function paints(own: Own, rich: boolean): Paints {
  const pics = picturesOf(own),
    make = (color: string, roughness = 0.8, metalness = 0, map?: T.Texture) =>
      own(rich ? new T.MeshStandardMaterial({ color, roughness, metalness, map }) : new T.MeshLambertMaterial({ color, map }));
  const woody = (tone: string, roughness: number, kind: "light" | "dark") => {
    const w = grain(own, tone, { kind, rich });
    return own(rich ? new T.MeshStandardMaterial({ ...w, roughness }) : new T.MeshLambertMaterial({ color: w.color, map: w.map }));
  };
  return {
    skin: make("#e0ae86", 0.62),
    hair: make("#221913", 0.55),
    cloth: make("#f3ead6", 0.85, 0, pics.folds),
    trousers: make("#3a3128", 0.9, 0, pics.folds),
    leather: make("#6a4424", 0.55, 0, pics.hide),
    brass: make("#d0a64a", 0.32, 0.75),
    // The bow and the arrows' shafts are real wood: its photograph graded to their colours, with relief on a graphics card.
    wood: woody("#8a5a2c", 0.42, "dark"),
    felt: make("#17130f", 0.9),
    string: own(new T.LineBasicMaterial({ color: "#f6f0e2" })),
    steel: make("#c3cad2", 0.28, 0.85),
    shaft: woody("#cfa56f", 0.6, "light"),
    white: make("#f7f3ea", 0.4),
    lamellar: make("#ffffff", 0.45, 0.15, pics.plates),
    horn: make("#2a221c", 0.35),
  };
}
const caches = new WeakMap<Own, Map<string, T.BufferGeometry>>();
/** A shape made once for every archer and arrow of a view (its `own` frees it with the view). */
function shape(own: Own, key: string, make: () => T.BufferGeometry) {
  let cache = caches.get(own);
  if (!cache) caches.set(own, (cache = new Map()));
  let g = cache.get(key);
  if (!g) cache.set(key, (g = own(make())));
  return g;
}
function mesh(g: T.BufferGeometry, m: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) {
  const it = new T.Mesh(g, m);
  it.position.set(x, y, z);
  it.castShadow = true;
  it.receiveShadow = true;
  parent.add(it);
  return it;
}
/** A vane's outline: a long low curve, cut square at its back. */
const vaneShape = (length: number, high: number) => {
  const s = new T.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(-length * 0.45, high * 0.3, -length * 0.86, high);
  s.lineTo(-length, high);
  s.lineTo(-length, 0);
  s.closePath();
  return s;
};
/** An arrow pointing along +x with its point at the origin: a steel point, a wooden shaft with a painted band, a nock and three vanes. */
export function arrowModel(own: Own, p: Paints, vane: T.Material) {
  const g = new T.Group(),
    L = ARROW_LENGTH;
  mesh(shape(own, "a-point", () => new T.ConeGeometry(0.017, 0.075, 4).rotateZ(-Math.PI / 2).translate(-0.0375, 0, 0)), p.steel, g);
  mesh(shape(own, "a-ferrule", () => new T.CylinderGeometry(0.0095, 0.0095, 0.03, 6).rotateZ(Math.PI / 2).translate(-0.088, 0, 0)), p.steel, g);
  mesh(shape(own, "a-shaft", () => grainUV(new T.CylinderGeometry(0.0075, 0.0075, L - 0.07, 6).rotateZ(Math.PI / 2).translate(-0.07 - (L - 0.07) / 2, 0, 0), 0.45)), p.shaft, g);
  mesh(shape(own, "a-crest", () => new T.CylinderGeometry(0.0082, 0.0082, 0.045, 6).rotateZ(Math.PI / 2).translate(-L + 0.215, 0, 0)), vane, g);
  mesh(shape(own, "a-nock", () => new T.CylinderGeometry(0.009, 0.009, 0.025, 6).rotateZ(Math.PI / 2).translate(-L, 0, 0)), vane, g);
  const fin = shape(own, "a-vane", () => new T.ShapeGeometry(vaneShape(0.15, 0.045), 4).translate(-L + 0.17, 0, 0));
  for (let k = 0; k < 3; k++) {
    const holder = new T.Group();
    holder.rotation.x = (k * Math.PI * 2) / 3 + 0.4;
    const v = new T.Mesh(fin, vane);
    v.castShadow = true;
    holder.add(v);
    g.add(holder);
  }
  return g;
}
/** An archer in `colour` (its coat, sash, band, plume and fletching). */
export function buildArcher(own: Own, p: Paints, colour: string, rich: boolean): Archer {
  const pics = picturesOf(own),
    root = new T.Group(),
    body = new T.Group(),
    material = (c: T.ColorRepresentation, map?: T.Texture, side: T.Side = T.FrontSide) =>
      own(rich ? new T.MeshStandardMaterial({ color: c, roughness: 0.78, map, side }) : new T.MeshLambertMaterial({ color: c, map, side })),
    tone = material(colour, pics.folds),
    dark = material(new T.Color(colour).multiplyScalar(0.55), pics.folds),
    fletch = material(new T.Color(colour).lerp(new T.Color("#ffffff"), 0.15), undefined, T.DoubleSide),
    seg = rich ? 18 : 10;
  root.add(body);
  // ── Legs: trousers bloused into wrapped leggings, boots with a turned-up toe. ──
  const thigh = shape(own, `thigh${seg}`, () => new T.CapsuleGeometry(0.078, 0.34, 4, seg)),
    shin = shape(own, `shin${seg}`, () => new T.CapsuleGeometry(0.066, 0.26, 4, seg)),
    wrap = shape(own, `wrap${seg}`, () => new T.CylinderGeometry(0.075, 0.066, 0.24, seg)),
    strap = shape(own, `strap${seg}`, () => new T.TorusGeometry(0.073, 0.008, 4, seg).rotateX(Math.PI / 2)),
    boot = shape(own, `boot${seg}`, () => new T.CapsuleGeometry(0.06, 0.17, 4, seg).rotateZ(Math.PI / 2)),
    toe = shape(own, "toe", () => new T.ConeGeometry(0.045, 0.08, 8).rotateZ(-Math.PI / 2 - 0.5));
  const hips: T.Group[] = [],
    knees: T.Group[] = [];
  for (const [x, z, tilt] of [
    [0.09, 0.06, -0.12],
    [-0.08, -0.06, 0.1],
  ]) {
    const hip = new T.Group();
    hip.position.set(x * 0.4, 0.86, z);
    hip.rotation.z = tilt;
    body.add(hip);
    hips.push(hip);
    mesh(thigh, p.trousers, hip, 0, -0.22, 0);
    const knee = new T.Group();
    knee.position.set(0, -0.42, 0);
    hip.add(knee);
    knees.push(knee);
    mesh(shin, p.trousers, knee, 0, -0.14, 0);
    mesh(wrap, p.cloth, knee, 0, -0.2, 0);
    for (const y of [-0.12, -0.2, -0.28]) mesh(strap, p.leather, knee, 0, y, 0);
    mesh(boot, p.leather, knee, 0.05, -0.38, 0);
    mesh(toe, p.leather, knee, 0.17, -0.37, 0);
    compactGroup(knee, own);
  }
  // ── The coat: flaring over the hips, slit at the side, a hem band; a lamellar vest laced over it; a sash. ──
  const coat = shape(
    own,
    `coat${seg}`,
    () =>
      new T.LatheGeometry(
        [
          [0.001, 1.5],
          [0.07, 1.5],
          [0.13, 1.46],
          [0.19, 1.38],
          [0.2, 1.22],
          [0.18, 1.04],
          [0.2, 0.94],
          [0.26, 0.74],
          [0.265, 0.6],
          [0.001, 0.6],
        ]
          // (Listed from the top down; a lathe wants them from the bottom up for its faces to look outward.)
          .reverse()
          .map(([r, y]) => new T.Vector2(r, y)),
        seg * 2,
      ),
  );
  const torso = mesh(coat, tone, body);
  torso.scale.set(1, 1, 0.78);
  const hem = mesh(shape(own, `hem${seg}`, () => new T.TorusGeometry(0.262, 0.018, 5, seg * 2).rotateX(Math.PI / 2)), dark, body, 0, 0.615, 0);
  hem.scale.set(1, 1, 0.78);
  const vest = mesh(
    shape(
      own,
      `vest${seg}`,
      () =>
        new T.LatheGeometry(
          [
            [0.2, 1.08],
            [0.215, 1.2],
            [0.21, 1.33],
            [0.17, 1.42],
            [0.12, 1.47],
          ].map(([r, y]) => new T.Vector2(r, y)),
          seg * 2,
        ),
    ),
    p.lamellar,
    body,
  );
  vest.scale.set(1, 1, 0.8);
  const vestEdge = mesh(shape(own, `vedge${seg}`, () => new T.TorusGeometry(0.205, 0.012, 4, seg * 2).rotateX(Math.PI / 2)), p.brass, body, 0, 1.08, 0);
  vestEdge.scale.set(1, 1, 0.8);
  const belt = mesh(shape(own, `belt${seg}`, () => new T.TorusGeometry(0.2, 0.03, 6, seg * 2).rotateX(Math.PI / 2)), p.leather, body, 0, 1.03, 0);
  belt.scale.set(1, 1, 0.8);
  const sashBand = mesh(shape(own, `sash${seg}`, () => new T.TorusGeometry(0.2, 0.02, 5, seg * 2).rotateX(Math.PI / 2)), tone, body, 0, 0.985, 0);
  sashBand.scale.set(1, 1, 0.8);
  mesh(shape(own, "buckle", () => new T.BoxGeometry(0.025, 0.07, 0.08)), p.brass, body, 0.2, 1.03, 0);
  for (const z of [-0.05, 0.05]) mesh(shape(own, "stud", () => new T.SphereGeometry(0.012, 6, 4)), p.brass, body, 0.198, 1.03, z);
  const collar = mesh(shape(own, `collar${seg}`, () => new T.TorusGeometry(0.075, 0.024, 5, seg).rotateX(Math.PI / 2)), p.cloth, body, 0.01, 1.49, 0);
  collar.rotation.z = -0.15;
  // The guard on the bow shoulder.
  const guard = mesh(shape(own, `guard${seg}`, () => new T.SphereGeometry(0.1, seg, 8, 0, Math.PI * 2, 0, Math.PI * 0.5)), p.lamellar, body, 0.02, 1.4, 0.1);
  guard.scale.set(1, 0.7, 1);
  guard.rotation.x = 0.5;
  // The sash's tails hanging at the back (they sway in the wind).
  const tails = new T.Group();
  tails.position.set(-0.19, 0.98, 0.02);
  body.add(tails);
  const tailG = shape(own, "tail", () => new T.PlaneGeometry(0.07, 0.36, 1, 6).translate(0, -0.18, 0)),
    tailMat = material(colour, pics.folds, T.DoubleSide);
  const tailParts = [0.03, -0.04].map((z, k) => {
    const t = mesh(tailG, tailMat, tails, 0, 0, z);
    t.rotation.y = Math.PI / 2;
    t.scale.y = k ? 0.85 : 1;
    return t;
  });
  // ── The quiver across the back: a leather tube with brass bands, the arrows' nocks and fletching standing out. ──
  const quiver = new T.Group();
  quiver.position.set(-0.17, 1.18, -0.05);
  quiver.rotation.z = 0.42;
  body.add(quiver);
  mesh(shape(own, `quiver${seg}`, () => new T.CylinderGeometry(0.065, 0.052, 0.58, seg)), p.leather, quiver);
  for (const y of [0.25, -0.05, -0.26]) mesh(shape(own, `qband${seg}`, () => new T.CylinderGeometry(0.068, 0.068, 0.03, seg)), p.brass, quiver, 0, y, 0);
  mesh(shape(own, `qrim${seg}`, () => new T.TorusGeometry(0.066, 0.01, 4, seg).rotateX(Math.PI / 2)), dark, quiver, 0, 0.29, 0);
  const qshaft = shape(own, "qshaft", () => grainUV(new T.CylinderGeometry(0.0075, 0.0075, 0.3, 5), 0.45)),
    qnock = shape(own, "qnock", () => new T.CylinderGeometry(0.009, 0.009, 0.02, 5)),
    qvane = shape(own, "qvane", () => new T.ShapeGeometry(vaneShape(0.13, 0.04), 3).rotateZ(-Math.PI / 2).translate(0, -0.13, 0));
  const r = stream(colour.length * 7 + 3);
  for (let k = 0; k < 6; k++) {
    const a = (k / 6) * Math.PI * 2,
      x = Math.cos(a) * 0.032,
      z = Math.sin(a) * 0.032,
      top = 0.38 + r() * 0.05;
    mesh(qshaft, p.shaft, quiver, x, top - 0.15, z);
    mesh(qnock, k % 2 ? p.white : fletch, quiver, x, top + 0.01, z);
    for (let v = 0; v < 3; v++) {
      const f = mesh(qvane, k % 2 ? p.white : fletch, quiver, x, top, z);
      f.rotation.y = (v * Math.PI * 2) / 3 + k;
      f.castShadow = false;
    }
  }
  compactGroup(quiver, own);
  // ── The head: a face that shows a mood, a moustache and a short beard, hair tied in a knot, a wide hat. ──
  const head = new T.Group();
  head.position.set(0, 1.63, 0);
  body.add(head);
  mesh(shape(own, `neck${seg}`, () => new T.CylinderGeometry(0.05, 0.056, 0.1, seg)), p.skin, body, 0.01, 1.52, 0);
  mesh(shape(own, `head${seg}`, () => new T.SphereGeometry(0.125, seg + 4, seg)), p.skin, head).scale.set(1, 1.08, 0.95);
  mesh(shape(own, `jaw${seg}`, () => new T.SphereGeometry(0.09, seg, 8)), p.skin, head, 0.035, -0.06, 0).scale.set(1, 0.75, 1.1);
  // Hair over the back of the head (x < 0: three's sphere puts −cos φ on x) and a cap of it over the crown.
  mesh(shape(own, `hair${seg}`, () => new T.SphereGeometry(0.13, seg + 4, seg, -Math.PI * 0.55, Math.PI * 1.1, 0, Math.PI * 0.62)), p.hair, head, -0.008, 0.01, 0);
  mesh(shape(own, `crownhair${seg}`, () => new T.SphereGeometry(0.131, seg + 4, 6, 0, Math.PI * 2, 0, Math.PI * 0.3)), p.hair, head, -0.008, 0.012, 0);
  mesh(shape(own, `knot${seg}`, () => new T.SphereGeometry(0.045, seg, 8)), p.hair, head, -0.13, 0.05, 0);
  const nose = mesh(shape(own, "nose", () => new T.ConeGeometry(0.022, 0.065, 6).rotateZ(-Math.PI / 2)), p.skin, head, 0.135, -0.012, 0.03);
  nose.scale.set(1, 1, 0.8);
  mesh(shape(own, "ear", () => new T.SphereGeometry(0.03, 8, 6)), p.skin, head, -0.01, 0, 0.115).scale.set(0.7, 1, 0.5);
  // Moustache (two drooping strands) and a short pointed beard.
  const strand = shape(own, "strand", () => new T.CapsuleGeometry(0.009, 0.05, 3, 6).rotateZ(Math.PI / 2 - 0.5));
  for (const z of [0.045, 0.005]) mesh(strand, p.hair, head, 0.122, -0.045, z);
  mesh(shape(own, "beard", () => new T.ConeGeometry(0.03, 0.07, 6).rotateZ(Math.PI)), p.hair, head, 0.1, -0.125, 0.02).rotation.z = 0.3;
  const brim = mesh(shape(own, `brim${seg}`, () => new T.CylinderGeometry(0.3, 0.31, 0.016, seg * 2)), p.felt, head, 0, 0.1, 0);
  brim.rotation.z = 0.08;
  mesh(shape(own, `crown${seg}`, () => new T.CylinderGeometry(0.105, 0.125, 0.15, seg)), p.felt, head, -0.01, 0.18, 0);
  mesh(shape(own, `band${seg}`, () => new T.CylinderGeometry(0.128, 0.128, 0.035, seg)), tone, head, -0.01, 0.125, 0);
  // Beads hanging from the brim to the chin strap (an archer's hat has them).
  const bead = shape(own, "bead", () => new T.SphereGeometry(0.011, 6, 4));
  for (let k = 0; k < 6; k++) mesh(bead, p.horn, head, 0.03 - k * 0.006, 0.08 - k * 0.032, 0.12 - k * 0.004);
  compactGroup(head, own);
  // The face (not baked: it moves): eyes with whites and dark eyes, brows, the mouth.
  const face = new T.Group();
  head.add(face);
  const eyes: T.Group[] = [],
    brows: T.Mesh[] = [];
  for (const z of [0.075, -0.075]) {
    const eye = new T.Group();
    eye.position.set(0.106, 0.025, z);
    face.add(eye);
    mesh(shape(own, "eyewhite", () => new T.SphereGeometry(0.02, 10, 8)), p.white, eye).scale.set(0.5, 0.8, 1);
    mesh(shape(own, "iris", () => new T.SphereGeometry(0.0115, 8, 6)), p.felt, eye, 0.008, 0, z > 0 ? 0.002 : -0.002);
    eyes.push(eye);
    const brow = mesh(shape(own, "brow", () => new T.BoxGeometry(0.055, 0.013, 0.018)), p.hair, face, 0.105, 0.06, z);
    brows.push(brow);
  }
  const mouth = mesh(shape(own, "mouth", () => new T.CapsuleGeometry(0.008, 0.03, 3, 6).rotateX(Math.PI / 2)), p.horn, face, 0.113, -0.07, 0.022);
  const plumeHolder = new T.Group();
  plumeHolder.position.set(-0.06, 0.16, 0.06);
  head.add(plumeHolder);
  const plume = shape(own, "plume", () => {
    const s = new T.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(-0.05, 0.08, -0.12, 0.2, -0.28, 0.32);
    s.bezierCurveTo(-0.16, 0.16, -0.06, 0.08, 0.02, 0.01);
    s.closePath();
    return new T.ShapeGeometry(s, 10);
  });
  const plumeMat = own(new T.MeshLambertMaterial({ color: colour, side: T.DoubleSide }));
  mesh(plume, plumeMat, plumeHolder);
  mesh(plume, plumeMat, plumeHolder, 0, 0.01, -0.012).rotation.z = 0.12;
  // ── The bow arm from the near shoulder (a bracer on the forearm), the bow in its hand; the draw arm from the far
  // shoulder to the string, a horn thumb ring on its hand. ──
  const sleeve = shape(own, `sleeve${seg}`, () => new T.CapsuleGeometry(0.055, ARM - 0.11, 4, seg).translate(0, -ARM / 2, 0)),
    cuff = shape(own, `cuff${seg}`, () => new T.CylinderGeometry(0.058, 0.064, 0.2, seg)),
    fist = shape(own, `fist${seg}`, () => new T.SphereGeometry(0.048, seg, 8));
  const bowArm = new T.Group();
  bowArm.position.copy(SHOULDER);
  body.add(bowArm);
  mesh(sleeve, tone, bowArm);
  mesh(cuff, p.leather, bowArm, 0, -ARM + 0.15, 0);
  mesh(fist, p.skin, bowArm, 0, -ARM, 0);
  compactGroup(bowArm, own);
  const bow = new T.Group();
  bow.position.set(0, -ARM, 0);
  bowArm.add(bow);
  // The bow's two limbs, each bending about the grip as the string comes back; horn tips and a wrapped grip.
  const points = [
    [-TIP.x, TIP.y - 0.06],
    [-TIP.x + 0.05, TIP.y + 0.02],
    [-0.44, 0.08],
    [-0.2, -0.03],
    [0, -0.04],
    [0.2, -0.03],
    [0.44, 0.08],
    [TIP.x - 0.05, TIP.y + 0.02],
    [TIP.x, TIP.y - 0.06],
  ];
  const limbG = (half: number) =>
    shape(own, `limb${half}${seg}`, () => {
      const pts = (half > 0 ? points.slice(4) : points.slice(0, 5)).map(([x, y]) => new T.Vector3(x, y, 0));
      const tube = new T.TubeGeometry(new T.CatmullRomCurve3(pts), rich ? 28 : 14, 0.017, 6, false),
        pos = tube.attributes.position as T.BufferAttribute;
      // Thinner toward the tips, as a bow's limbs are.
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i),
          k = 1 - Math.min(1, Math.abs(x) / TIP.x) * 0.45;
        pos.setZ(i, pos.getZ(i) * (0.7 + 0.6 * k));
      }
      return tube;
    });
  const limbs = [1, -1].map((half) => {
    const pivot = new T.Group();
    bow.add(pivot);
    mesh(limbG(half), p.wood, pivot);
    mesh(shape(own, "tip", () => new T.ConeGeometry(0.014, 0.08, 6)), p.horn, pivot, half * (TIP.x - 0.01), TIP.y - 0.04, 0).rotation.z = half * -0.9;
    return pivot;
  });
  mesh(shape(own, `grip${seg}`, () => new T.CylinderGeometry(0.025, 0.025, 0.15, seg).rotateZ(Math.PI / 2)), p.leather, bow, 0, -0.04, 0);
  for (const x of [-0.07, 0.07]) mesh(shape(own, `gband${seg}`, () => new T.CylinderGeometry(0.027, 0.027, 0.012, seg).rotateZ(Math.PI / 2)), tone, bow, x, -0.04, 0);
  // The string: tip, nock point, tip (moved as the bow is drawn).
  const strung = new Float32Array([-TIP.x, TIP.y - 0.06, 0, 0, TIP.y - 0.06, 0, TIP.x, TIP.y - 0.06, 0]),
    stringGeometry = own(new T.BufferGeometry());
  stringGeometry.setAttribute("position", new T.BufferAttribute(strung, 3));
  const string = new T.Line(stringGeometry, p.string);
  bow.add(string);
  // The arrow on the string, its point ahead of the grip.
  const nocked = arrowModel(own, p, fletch);
  bow.add(nocked);
  const drawArm = new T.Group();
  drawArm.position.copy(BACK_SHOULDER);
  body.add(drawArm);
  const drawSleeve = mesh(sleeve, tone, drawArm);
  const drawFist = mesh(fist, p.skin, drawArm, 0, -ARM, 0);
  const ring = mesh(shape(own, "ring", () => new T.TorusGeometry(0.03, 0.01, 5, 10)), p.horn, drawFist, 0.02, 0.01, 0.02);
  ring.rotation.y = Math.PI / 2;
  // Small parts cast no shadow (a shadow pass per part costs more than it shows).
  body.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    o.geometry.computeBoundingSphere();
    const scale = Math.max(o.scale.x, o.scale.y, o.scale.z);
    if ((o.geometry.boundingSphere?.radius ?? 1) * scale < 0.05) o.castShadow = false;
  });
  const holds = { angle: -60, share: 0, nocked: false },
    nock = new T.Vector3(),
    reach = new T.Vector3(),
    tip = new T.Vector2();
  let kicked = 0;
  const lay = () => {
    const a = (holds.angle * Math.PI) / 180;
    // The bow arm follows through a little after the loose (down and forward).
    bowArm.rotation.z = a + Math.PI / 2 - kicked * 0.16;
    const pull = PULL.least + (PULL.most - PULL.least) * holds.share,
      y = TIP.y - 0.06 + (holds.nocked ? pull : 0),
      flex = holds.nocked ? FLEX * holds.share : -kicked * 0.05;
    limbs[0].rotation.z = flex;
    limbs[1].rotation.z = -flex;
    // The string's ends go with the tips.
    for (const [i, side] of [
      [0, -1],
      [6, 1],
    ] as const) {
      tip.set(side * TIP.x, TIP.y - 0.06).rotateAround(new T.Vector2(0, 0), side * flex);
      strung[i] = tip.x;
      strung[i + 1] = tip.y;
    }
    strung[4] = y;
    stringGeometry.attributes.position.needsUpdate = true;
    nocked.visible = holds.nocked;
    // The arrow points away from the string (−y here), its point ahead of the grip by its length less the pull.
    nocked.position.set(0, y - ARROW_LENGTH, 0);
    nocked.rotation.z = -Math.PI / 2;
    // The draw hand at the nock (or, loosed, flying back past the ear and then down to the side).
    body.updateMatrixWorld(true);
    if (holds.nocked) {
      nock.set(0, y, 0);
      bow.localToWorld(nock);
      body.worldToLocal(nock);
    } else {
      nock.set(BACK_SHOULDER.x + 0.12, BACK_SHOULDER.y - ARM * 0.95, BACK_SHOULDER.z);
      if (kicked > 0) nock.lerp(new T.Vector3(BACK_SHOULDER.x - 0.34, BACK_SHOULDER.y + 0.12, BACK_SHOULDER.z - 0.05), kicked);
    }
    reach.copy(nock).sub(BACK_SHOULDER);
    const length = Math.max(0.15, reach.length()),
      way = Math.atan2(reach.y, reach.x);
    drawArm.rotation.z = way + Math.PI / 2;
    const s = Math.min(1.25, length / ARM);
    drawSleeve.scale.set(1, s, 1);
    drawFist.position.y = -ARM * s;
  };
  lay();
  // The face's moods: brows, how open the eyes are, the mouth.
  const moods: Record<Mood, { brow: number; lift: number; open: number; mouth: [number, number] }> = {
    calm: { brow: -0.15, lift: 0, open: 0.8, mouth: [1, 1] },
    focus: { brow: -0.45, lift: -0.008, open: 0.42, mouth: [0.8, 0.7] },
    hurt: { brow: 0.35, lift: 0.01, open: 0.18, mouth: [2.6, 1.4] },
    down: { brow: 0.1, lift: 0, open: 0.08, mouth: [1.6, 1.1] },
  };
  let mood: Mood = "calm";
  const setMood = (kind: Mood) => {
    mood = kind;
    const m = moods[kind];
    brows.forEach((b, k) => {
      b.rotation.x = 0;
      b.rotation.z = -0.18;
      // Each brow slants toward the nose (z toward the middle) by `brow`.
      b.rotation.y = (k ? -1 : 1) * m.brow * 0.6;
      b.position.y = 0.06 + m.lift;
    });
    for (const e of eyes) e.scale.y = m.open / 0.8;
    mouth.scale.set(1, m.mouth[0], m.mouth[1]);
  };
  setMood("calm");
  return {
    root,
    body,
    holds,
    aim(angle, share, on) {
      holds.angle = angle;
      holds.share = Math.max(0, Math.min(1, share));
      holds.nocked = on;
      lay();
    },
    rest() {
      holds.angle = -62;
      holds.share = 0;
      holds.nocked = false;
      kicked = 0;
      lay();
    },
    kick(amount) {
      kicked = Math.max(0, Math.min(1, amount));
      lay();
    },
    mood(kind) {
      if (kind !== mood) setMood(kind);
    },
    pose(time, wind) {
      const breath = Math.sin(time * 1.9 + colour.length);
      if (mood !== "down" && Math.abs(body.rotation.z) < 0.02) {
        torso.scale.set(1 + breath * 0.008, 1, 0.78 + breath * 0.012);
        vest.scale.set(1 + breath * 0.008, 1, 0.8 + breath * 0.012);
        head.rotation.z = Math.sin(time * 0.7 + colour.length) * 0.03 + (holds.nocked ? 0.05 : 0);
      }
      const gust = Math.sin(time * 2.3) * 0.5 + Math.sin(time * 3.7 + 1) * 0.3;
      tails.rotation.z = Math.max(-0.2, Math.min(0.9, -wind * 0.09 + gust * 0.08 + 0.05));
      tailParts.forEach((t, k) => (t.rotation.x = Math.sin(time * 3 + k) * 0.12));
      plumeHolder.rotation.z = Math.sin(time * 2.6) * 0.05 - wind * 0.025;
      // Blinks now and then (not with the eyes already shut or narrowed).
      if (mood === "calm") {
        const blink = (time * 0.31 + colour.length * 0.1) % 1 < 0.035;
        for (const e of eyes) e.scale.y = blink ? 0.12 : 1;
      }
    },
    fall(p) {
      // The knees give first, then the body goes back and settles.
      const knee = Math.min(1, p * 2.2),
        back = p < 0.35 ? 0 : (p - 0.35) / 0.65,
        e = back < 0.75 ? (back / 0.75) ** 2 : 1 + Math.sin(((back - 0.75) / 0.25) * Math.PI) * 0.04;
      hips.forEach((h, k) => (h.rotation.z = [-0.12, 0.1][k] - knee * 0.35));
      knees.forEach((k) => (k.rotation.z = knee * 0.7));
      body.rotation.z = 1.45 * e;
      body.position.y = 0.12 * e - knee * 0.08 * (1 - e);
      head.rotation.z = -0.25 * e;
      if (p >= 1) setMood("down");
    },
  };
}
