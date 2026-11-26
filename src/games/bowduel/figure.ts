import * as T from "three";
import type { Own } from "../goldraid/paint";

/**
 * The archers of 활잡이 결투 and their arrows, modelled in code. An archer is built facing +x with its feet at the
 * origin (the view mirrors it across for the one facing the other way); its parts stand where the rules' figure has
 * them (legs to 0.86 m, the body to 1.46 m, the head round 1.63 m), so that an arrow is seen to stand where it struck.
 * Its own colour is its tunic, hat band and plume; the two are otherwise alike: a wide hat, a quiver of arrows on the
 * back, a recurve bow of laminated wood with a wrapped grip.
 */
export interface Archer {
  /** At the feet: the view places and mirrors it. */
  root: T.Group;
  /** Everything above the feet, leaning back when struck and falling when beaten (its pivot at the feet). */
  body: T.Group;
  /** Lays the bow at `angle` degrees above the level, drawn `share` (0 to 1) with an arrow on the string, or at rest. */
  aim(angle: number, share: number, nocked: boolean): void;
  rest(): void;
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
  /** How far the string comes back (m) for the weakest and the fullest draw. */
  PULL = { least: 0.08, most: 0.56 };

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
}
/** The materials the two archers share; their own colour is laid on per archer. */
export function paints(own: Own, rich: boolean): Paints {
  const make = (color: string, roughness = 0.8, metalness = 0) => own(rich ? new T.MeshStandardMaterial({ color, roughness, metalness }) : new T.MeshLambertMaterial({ color }));
  return {
    skin: make("#e3b48c", 0.7),
    hair: make("#2a1f18", 0.6),
    cloth: make("#f1e6cf", 0.85),
    trousers: make("#3d3428", 0.9),
    leather: make("#5b3a1f", 0.6),
    brass: make("#c9a046", 0.35, 0.7),
    wood: make("#8a5a2b", 0.45),
    felt: make("#1d1a18", 0.9),
    string: own(new T.LineBasicMaterial({ color: "#f4efe4" })),
    steel: make("#b9c0c8", 0.3, 0.85),
    shaft: make("#c9a272", 0.6),
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
/** An arrow pointing along +x with its point at the origin: a steel point, a wooden shaft, a nock and three vanes. */
export function arrowModel(own: Own, p: Paints, vane: T.Material) {
  const g = new T.Group(),
    L = ARROW_LENGTH;
  mesh(shape(own, "a-point", () => new T.ConeGeometry(0.016, 0.07, 8).rotateZ(-Math.PI / 2).translate(-0.035, 0, 0)), p.steel, g);
  mesh(shape(own, "a-shaft", () => new T.CylinderGeometry(0.0075, 0.0075, L - 0.07, 6).rotateZ(Math.PI / 2).translate(-0.07 - (L - 0.07) / 2, 0, 0)), p.shaft, g);
  mesh(shape(own, "a-nock", () => new T.CylinderGeometry(0.009, 0.009, 0.025, 6).rotateZ(Math.PI / 2).translate(-L, 0, 0)), vane, g);
  const fin = shape(own, "a-vane", () => {
    const s = new T.Shape();
    s.moveTo(0, 0);
    s.quadraticCurveTo(-0.06, 0.012, -0.13, 0.045);
    s.lineTo(-0.15, 0.045);
    s.lineTo(-0.15, 0);
    s.closePath();
    return new T.ShapeGeometry(s, 4).translate(-L + 0.17, 0, 0);
  });
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
/** An archer in `colour` (its tunic, band and plume). */
export function buildArcher(own: Own, p: Paints, colour: string, rich: boolean): Archer {
  const root = new T.Group(),
    body = new T.Group(),
    tone = own(rich ? new T.MeshStandardMaterial({ color: colour, roughness: 0.75 }) : new T.MeshLambertMaterial({ color: colour })),
    dark = own(rich ? new T.MeshStandardMaterial({ color: new T.Color(colour).multiplyScalar(0.55), roughness: 0.8 }) : new T.MeshLambertMaterial({ color: new T.Color(colour).multiplyScalar(0.55) })),
    seg = rich ? 16 : 10;
  root.add(body);
  // Legs in trousers, wrapped below the knee, and boots.
  const leg = shape(own, `leg${seg}`, () => new T.CapsuleGeometry(0.072, 0.56, 4, seg)),
    wrap = shape(own, `wrap${seg}`, () => new T.CylinderGeometry(0.08, 0.07, 0.22, seg)),
    boot = shape(own, `boot${seg}`, () => new T.CapsuleGeometry(0.06, 0.16, 4, seg).rotateZ(Math.PI / 2));
  for (const [x, z, tilt] of [
    [0.09, 0.08, -0.12],
    [-0.08, -0.08, 0.1],
  ]) {
    const hip = new T.Group();
    hip.position.set(x * 0.4, 0.86, z);
    hip.rotation.z = tilt;
    body.add(hip);
    mesh(leg, p.trousers, hip, 0, -0.38, 0);
    mesh(wrap, p.cloth, hip, 0, -0.62, 0);
    mesh(boot, p.leather, hip, 0.05, -0.8, 0);
  }
  // The tunic: a coat flaring over the hips, belted, with a pale collar and a hem band.
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
          [0.25, 0.76],
          [0.25, 0.74],
          [0.001, 0.74],
        ].map(([r, y]) => new T.Vector2(r, y)),
        seg * 2,
      ),
  );
  const torso = mesh(coat, tone, body);
  torso.scale.set(1, 1, 0.78);
  const belt = mesh(shape(own, `belt${seg}`, () => new T.TorusGeometry(0.185, 0.026, 6, seg * 2).rotateX(Math.PI / 2)), p.leather, body, 0, 1.03, 0);
  belt.scale.set(1, 1, 0.8);
  mesh(shape(own, "buckle", () => new T.BoxGeometry(0.02, 0.06, 0.07)), p.brass, body, 0.19, 1.03, 0);
  const hem = mesh(shape(own, `hem${seg}`, () => new T.TorusGeometry(0.245, 0.016, 5, seg * 2).rotateX(Math.PI / 2)), dark, body, 0, 0.76, 0);
  hem.scale.set(1, 1, 0.78);
  const collar = mesh(shape(own, `collar${seg}`, () => new T.TorusGeometry(0.075, 0.022, 5, seg).rotateX(Math.PI / 2)), p.cloth, body, 0.01, 1.49, 0);
  collar.rotation.z = -0.15;
  // The quiver across the back, a few arrows' vanes showing.
  const quiver = new T.Group();
  quiver.position.set(-0.17, 1.18, -0.05);
  quiver.rotation.z = 0.42;
  body.add(quiver);
  mesh(shape(own, `quiver${seg}`, () => new T.CylinderGeometry(0.06, 0.05, 0.56, seg)), p.leather, quiver);
  mesh(shape(own, `qband${seg}`, () => new T.CylinderGeometry(0.064, 0.064, 0.04, seg)), dark, quiver, 0, 0.24, 0);
  const feather = shape(own, "qvane", () => new T.PlaneGeometry(0.03, 0.12).translate(0, 0.06, 0));
  for (let k = 0; k < 4; k++) {
    const f = mesh(feather, k % 2 ? p.cloth : tone, quiver, -0.03 + k * 0.02, 0.28, (k % 2 ? 1 : -1) * 0.012);
    f.rotation.z = -0.25 + k * 0.16;
    (f.material as T.Material).side = T.DoubleSide;
  }
  // The head: face, ear, eye, brow, a short beard line, hair tied back; a wide felt hat with a band and a plume.
  const head = new T.Group();
  head.position.set(0, 1.63, 0);
  body.add(head);
  mesh(shape(own, `neck${seg}`, () => new T.CylinderGeometry(0.05, 0.055, 0.1, seg)), p.skin, body, 0.01, 1.52, 0);
  mesh(shape(own, `head${seg}`, () => new T.SphereGeometry(0.125, seg + 4, seg)), p.skin, head).scale.set(1, 1.08, 0.95);
  mesh(shape(own, `hair${seg}`, () => new T.SphereGeometry(0.13, seg + 4, seg, Math.PI * 0.55, Math.PI * 1.1, 0, Math.PI * 0.62)), p.hair, head, -0.008, 0.01, 0);
  mesh(shape(own, `knot${seg}`, () => new T.SphereGeometry(0.045, seg, 8)), p.hair, head, -0.13, 0.04, 0);
  const nose = mesh(shape(own, "nose", () => new T.ConeGeometry(0.022, 0.06, 6).rotateZ(-Math.PI / 2)), p.skin, head, 0.135, -0.01, 0.03);
  nose.scale.set(1, 1, 0.8);
  for (const z of [0.075, -0.075]) {
    mesh(shape(own, "eye", () => new T.SphereGeometry(0.014, 8, 6)), p.felt, head, 0.105, 0.025, z);
    const brow = mesh(shape(own, "brow", () => new T.BoxGeometry(0.05, 0.011, 0.016)), p.hair, head, 0.1, 0.058, z);
    brow.rotation.z = -0.18;
  }
  mesh(shape(own, "ear", () => new T.SphereGeometry(0.03, 8, 6)), p.skin, head, -0.01, 0, 0.115).scale.set(0.7, 1, 0.5);
  mesh(shape(own, "mouth", () => new T.BoxGeometry(0.035, 0.008, 0.06)), p.hair, head, 0.112, -0.062, 0.025);
  const brim = mesh(shape(own, `brim${seg}`, () => new T.CylinderGeometry(0.3, 0.31, 0.016, seg * 2)), p.felt, head, 0, 0.1, 0);
  brim.rotation.z = 0.08;
  mesh(shape(own, `crown${seg}`, () => new T.CylinderGeometry(0.105, 0.125, 0.15, seg)), p.felt, head, -0.01, 0.18, 0);
  mesh(shape(own, `band${seg}`, () => new T.CylinderGeometry(0.128, 0.128, 0.035, seg)), tone, head, -0.01, 0.125, 0);
  const plume = shape(own, "plume", () => {
    const s = new T.Shape();
    s.moveTo(0, 0);
    s.bezierCurveTo(-0.05, 0.08, -0.12, 0.2, -0.26, 0.3);
    s.bezierCurveTo(-0.16, 0.16, -0.06, 0.08, 0.02, 0.01);
    s.closePath();
    return new T.ShapeGeometry(s, 8);
  });
  const plumeMat = own(new T.MeshLambertMaterial({ color: colour, side: T.DoubleSide }));
  mesh(plume, plumeMat, head, -0.06, 0.16, 0.06);
  // The bow arm from the near shoulder, the bow in its hand; the draw arm from the far shoulder to the string.
  const sleeve = shape(own, `sleeve${seg}`, () => new T.CapsuleGeometry(0.055, ARM - 0.11, 4, seg).translate(0, -ARM / 2, 0)),
    fist = shape(own, `fist${seg}`, () => new T.SphereGeometry(0.048, seg, 8));
  const bowArm = new T.Group();
  bowArm.position.copy(SHOULDER);
  body.add(bowArm);
  mesh(sleeve, tone, bowArm);
  mesh(fist, p.skin, bowArm, 0, -ARM, 0);
  const bow = new T.Group();
  bow.position.set(0, -ARM, 0);
  bowArm.add(bow);
  const limb = shape(own, `bow${seg}`, () => {
    const curve = new T.CatmullRomCurve3(
      [
        [-TIP.x, TIP.y - 0.06],
        [-TIP.x + 0.05, TIP.y + 0.02],
        [-0.44, 0.08],
        [-0.2, -0.03],
        [0, -0.04],
        [0.2, -0.03],
        [0.44, 0.08],
        [TIP.x - 0.05, TIP.y + 0.02],
        [TIP.x, TIP.y - 0.06],
      ].map(([x, y]) => new T.Vector3(x, y, 0)),
    );
    return new T.TubeGeometry(curve, rich ? 48 : 24, 0.016, 6, false);
  });
  mesh(limb, p.wood, bow);
  mesh(shape(own, `grip${seg}`, () => new T.CylinderGeometry(0.024, 0.024, 0.14, seg).rotateZ(Math.PI / 2)), tone, bow, 0, -0.04, 0);
  // The string: tip, nock point, tip (moved as the bow is drawn).
  const strung = new Float32Array([-TIP.x, TIP.y - 0.06, 0, 0, TIP.y - 0.06, 0, TIP.x, TIP.y - 0.06, 0]),
    stringGeometry = own(new T.BufferGeometry());
  stringGeometry.setAttribute("position", new T.BufferAttribute(strung, 3));
  const string = new T.Line(stringGeometry, p.string);
  bow.add(string);
  // The arrow on the string, its point ahead of the grip.
  const nocked = arrowModel(own, p, tone);
  bow.add(nocked);
  const drawArm = new T.Group();
  drawArm.position.copy(BACK_SHOULDER);
  body.add(drawArm);
  const drawSleeve = mesh(sleeve, tone, drawArm);
  const drawFist = mesh(fist, p.skin, drawArm, 0, -ARM, 0);
  const holds = { angle: -60, share: 0, nocked: false },
    nock = new T.Vector3(),
    reach = new T.Vector3();
  const lay = () => {
    const a = (holds.angle * Math.PI) / 180;
    bowArm.rotation.z = a + Math.PI / 2;
    const pull = PULL.least + (PULL.most - PULL.least) * holds.share,
      y = TIP.y - 0.06 + (holds.nocked ? pull : 0);
    strung[4] = y;
    stringGeometry.attributes.position.needsUpdate = true;
    nocked.visible = holds.nocked;
    // The arrow points away from the string (−y here), its point ahead of the grip by its length less the pull.
    nocked.position.set(0, y - ARROW_LENGTH, 0);
    nocked.rotation.z = -Math.PI / 2;
    // The draw hand at the nock (or hanging at the side when the bow is down).
    body.updateMatrixWorld(true);
    if (holds.nocked) {
      nock.set(0, y, 0);
      bow.localToWorld(nock);
      body.worldToLocal(nock);
    } else nock.set(BACK_SHOULDER.x + 0.12, BACK_SHOULDER.y - ARM * 0.95, BACK_SHOULDER.z);
    reach.copy(nock).sub(BACK_SHOULDER);
    const length = Math.max(0.15, reach.length()),
      way = Math.atan2(reach.y, reach.x);
    drawArm.rotation.z = way + Math.PI / 2;
    const s = Math.min(1.25, length / ARM);
    drawSleeve.scale.set(1, s, 1);
    drawFist.position.y = -ARM * s;
  };
  lay();
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
      lay();
    },
  };
}
