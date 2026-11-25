import * as T from "three";
import { GATE, PLATFORMS } from "./sim";

/**
 * 금화 쟁탈전's valley, our own, built in code: a morning sky with a low sun, far mountains and nearer wooded hills, a
 * meadow with a dirt road across it seen from the side (its cut bank of soil toward the eye), timber ledges on posts,
 * and at each end a little castle in its side's colour: a wall with battlements and windows, the gate the gold is
 * brought to (a ring on the road marks where), a round tower with a pointed roof and a flag, and on the tower a tall
 * slit that fills with gold as the treasury does.
 *
 * The scenery is Lambert (cheap where the processor draws); the bandits, the loot and the cart are the view's.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
export const SIDE_COLORS: [string, string] = ["#d8352c", "#2b6fe3"];
/** What of a castle the view moves: the gold in its tower's slit (scaled up as the treasury fills), its windows (lit one by one), its flag. */
export interface Castle {
  gauge: T.Mesh;
  windows: T.MeshBasicMaterial[];
  flag: T.Mesh;
  ring: T.Mesh;
}
export interface Valley {
  castles: [Castle, Castle];
  clouds: T.Mesh[];
}
/** How tall the gold stands in a tower's slit when the castle is full. */
export const GAUGE_TALL = 3.1;
const lambert = (own: Own, options: T.MeshLambertMaterialParameters) => own(new T.MeshLambertMaterial(options));
const basic = (own: Own, options: T.MeshBasicMaterialParameters) => own(new T.MeshBasicMaterial(options));
function put(own: Own, parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0, shadow: "cast" | "receive" | "both" | "" = "") {
  const m = new T.Mesh(own(geometry), material);
  m.position.set(x, y, z);
  m.castShadow = shadow === "cast" || shadow === "both";
  m.receiveShadow = shadow === "receive" || shadow === "both";
  parent.add(m);
  return m;
}
/** A small seeded stream, so that the valley is the same every time (thumbnails, tests). */
function stream(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function painted(own: Own, width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d")!);
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
/** The sky: blue overhead to a warm glow at the hills. */
function sky(own: Own, scene: T.Scene) {
  scene.background = painted(own, 8, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#5fb0ea");
    g.addColorStop(0.55, "#a9d8f2");
    g.addColorStop(0.8, "#fbe9c0");
    g.addColorStop(1, "#f6d79a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 256);
  });
}
/** A ridge line as a filled shape: waves of several lengths over `span`, about `high` tall above `low`. */
function ridge(own: Own, seed: number, span: number, low: number, high: number, colour: string, jag = 1) {
  const random = stream(seed),
    waves = [1, 2, 3, 5, 8, 13].map((k) => ({ k, a: (0.3 + random() * 0.7) / Math.pow(k, jag), p: random() * Math.PI * 2 })),
    shape = new T.Shape(),
    steps = 120;
  shape.moveTo(-span / 2, low - 30);
  for (let i = 0; i <= steps; i++) {
    const x = -span / 2 + (span * i) / steps,
      u = (i / steps) * Math.PI * 2;
    let y = 0;
    for (const w of waves) y += w.a * Math.sin(w.k * u + w.p);
    shape.lineTo(x, low + high * (0.6 + 0.4 * y));
  }
  shape.lineTo(span / 2, low - 30);
  shape.closePath();
  return new T.Mesh(own(new T.ShapeGeometry(shape)), basic(own, { color: colour }));
}
function backdrop(own: Own, scene: T.Scene): T.Mesh[] {
  // The sun and its glow, low over the far mountains.
  const sun = put(own, scene, new T.CircleGeometry(2.6, 40), basic(own, { color: "#fff3c4" }), 6.5, 9.5, -46);
  sun.renderOrder = -5;
  put(own, scene, new T.CircleGeometry(6, 40), basic(own, { color: "#ffe9a8", transparent: true, opacity: 0.35, depthWrite: false }), 6.5, 9.5, -46.5).renderOrder = -6;
  const far = ridge(own, 5, 150, 2.5, 9, "#8fb4d6", 1.1);
  far.position.z = -44;
  const mid = ridge(own, 12, 120, 1.2, 6, "#79a878", 1.2);
  mid.position.z = -32;
  const near = ridge(own, 31, 90, 0.2, 3.6, "#5e9a54", 1.4);
  near.position.z = -20;
  scene.add(far, mid, near);
  // Clouds: a few soft heaps that drift.
  const clouds: T.Mesh[] = [],
    random = stream(77),
    white = basic(own, { color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false }),
    puff = own(new T.CircleGeometry(1, 24));
  for (let k = 0; k < 6; k++) {
    const cloud = new T.Mesh(puff, white);
    cloud.scale.set(2.2 + random() * 2, 0.7 + random() * 0.5, 1);
    cloud.position.set(-26 + random() * 52, 9 + random() * 6, -40 + random() * 4);
    for (let p = 0; p < 3; p++) {
      const more = new T.Mesh(puff, white);
      more.scale.set(0.5 + random() * 0.25, 0.75 + random() * 0.5, 1);
      more.position.set(-0.7 + p * 0.7, 0.35 + random() * 0.3, 0.01);
      cloud.add(more);
    }
    scene.add(cloud);
    clouds.push(cloud);
  }
  return clouds;
}
/** The meadow, the road across it and the cut bank toward the eye; trees and bushes behind the road. */
function ground(own: Own, scene: T.Scene) {
  const grass = lambert(own, {
      map: painted(
        own,
        256,
        256,
        (ctx) => {
          ctx.fillStyle = "#6aa84a";
          ctx.fillRect(0, 0, 256, 256);
          const random = stream(3);
          for (let k = 0; k < 900; k++) {
            ctx.fillStyle = random() < 0.5 ? "#5d9a40" : "#7bb858";
            ctx.fillRect(random() * 256, random() * 256, 2, 5 + random() * 5);
          }
        },
        [28, 6],
      ),
    }),
    dirt = lambert(own, {
      map: painted(
        own,
        256,
        64,
        (ctx) => {
          ctx.fillStyle = "#c9a36a";
          ctx.fillRect(0, 0, 256, 64);
          const random = stream(9);
          for (let k = 0; k < 260; k++) {
            ctx.fillStyle = random() < 0.5 ? "#b88f58" : "#d8b47c";
            ctx.beginPath();
            ctx.ellipse(random() * 256, random() * 64, 2 + random() * 5, 1 + random() * 2, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        },
        [20, 1],
      ),
    }),
    soil = lambert(own, {
      map: painted(
        own,
        256,
        256,
        (ctx) => {
          const g = ctx.createLinearGradient(0, 0, 0, 256);
          g.addColorStop(0, "#7a5632");
          g.addColorStop(0.08, "#8a6238");
          g.addColorStop(1, "#4a3220");
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, 256, 256);
          const random = stream(21);
          for (let k = 0; k < 160; k++) {
            ctx.fillStyle = random() < 0.5 ? "#5e4228" : "#9a7446";
            ctx.beginPath();
            ctx.ellipse(random() * 256, 12 + random() * 244, 3 + random() * 7, 2 + random() * 3, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          // The turf's edge along the top.
          ctx.fillStyle = "#5d9a40";
          ctx.fillRect(0, 0, 256, 7);
        },
        [24, 1],
      ),
    });
  const top = put(own, scene, new T.PlaneGeometry(120, 26), grass, 0, 0, -10.6, "receive");
  top.rotation.x = -Math.PI / 2;
  const road = put(own, scene, new T.PlaneGeometry(120, 2.3), dirt, 0, 0.012, 0.25, "receive");
  road.rotation.x = -Math.PI / 2;
  put(own, scene, new T.PlaneGeometry(120, 5), soil, 0, -2.5, 2.4);
  // Deeper down the earth is plain (a tall screen sees far under the road).
  put(own, scene, new T.PlaneGeometry(120, 60), basic(own, { color: "#4a3220" }), 0, -34.9, 2.4);
  // Trees and bushes behind the road.
  const random = stream(40),
    trunk = own(new T.CylinderGeometry(0.1, 0.14, 1, 7)),
    crown = own(new T.ConeGeometry(1, 1, 9)),
    round = own(new T.SphereGeometry(1, 12, 9)),
    bark = lambert(own, { color: "#6a4a30" }),
    greens = ["#3f7f3c", "#4b8f44", "#357238"].map((color) => lambert(own, { color }));
  for (let k = 0; k < 22; k++) {
    const x = -15 + random() * 30,
      z = -3.4 - random() * 9,
      size = 1.4 + random() * 1.5,
      green = greens[Math.floor(random() * 3)];
    // Not behind the castles' towers.
    if (Math.abs(x) > 8.2 && z > -5.5) continue;
    const t = new T.Mesh(trunk, bark);
    t.scale.set(size, size * 0.7, size);
    t.position.set(x, size * 0.35, z);
    scene.add(t);
    if (random() < 0.55)
      for (let layer = 0; layer < 3; layer++) {
        const c = new T.Mesh(crown, green);
        c.scale.set(size * (0.62 - layer * 0.14), size * 0.8, size * (0.62 - layer * 0.14));
        c.position.set(x, size * (0.85 + layer * 0.42), z);
        c.castShadow = true;
        scene.add(c);
      }
    else {
      const c = new T.Mesh(round, green);
      c.scale.set(size * 0.62, size * 0.56, size * 0.62);
      c.position.set(x, size * 1.02, z);
      c.castShadow = true;
      scene.add(c);
    }
  }
  for (let k = 0; k < 16; k++) {
    const b = new T.Mesh(round, greens[k % 3]);
    b.scale.set(0.35 + random() * 0.3, 0.22 + random() * 0.14, 0.3);
    b.position.set(-13 + random() * 26, 0.12, -1.5 - random() * 1.4);
    scene.add(b);
  }
  // Tufts and stones along the bank's edge.
  const stone = lambert(own, { color: "#a9a59a" });
  for (let k = 0; k < 10; k++) {
    const s = new T.Mesh(round, stone);
    s.scale.set(0.12 + random() * 0.12, 0.08 + random() * 0.06, 0.12);
    s.position.set(-12 + random() * 24, 0.05, 1.6 + random() * 0.6);
    scene.add(s);
  }
}
/** The timber ledges: a plank deck on posts, with braces, each with a little lantern. */
function ledges(own: Own, scene: T.Scene) {
  const planks = lambert(own, {
      map: painted(own, 256, 64, (ctx) => {
        ctx.fillStyle = "#b07a48";
        ctx.fillRect(0, 0, 256, 64);
        ctx.strokeStyle = "#7c5230";
        ctx.lineWidth = 2;
        for (let x = 0; x <= 256; x += 32) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, 64);
          ctx.stroke();
        }
        ctx.fillStyle = "#c48e58";
        ctx.fillRect(0, 0, 256, 6);
      }),
    }),
    post = lambert(own, { color: "#7c5230" }),
    dark = lambert(own, { color: "#5e3e24" }),
    lamp = basic(own, { color: "#ffd66a" });
  for (const p of PLATFORMS) {
    const width = p.x1 - p.x0,
      mid = (p.x0 + p.x1) / 2,
      high = p.y > 2;
    put(own, scene, new T.BoxGeometry(width + 0.16, 0.16, 1.5), planks, mid, p.y - 0.08, -0.5, "both");
    put(own, scene, new T.BoxGeometry(width + 0.2, 0.08, 0.1), dark, mid, p.y - 0.2, 0.23);
    // The ledges stand a little behind the line the bandits run on, so that nobody is ever hidden by one.
    // Posts: at the ends of a low ledge; a high one hangs on two tall poles behind, out of the runners' way.
    for (const x of [p.x0 + 0.12, p.x1 - 0.12]) {
      const z = high ? -1.17 : 0.1,
        tall = p.y - 0.16;
      put(own, scene, new T.CylinderGeometry(0.07, 0.08, tall, 7), post, x, tall / 2, z, "cast");
      if (!high) put(own, scene, new T.CylinderGeometry(0.07, 0.08, tall, 7), post, x, tall / 2, -1.13, "cast");
    }
    // A lantern under its middle.
    put(own, scene, new T.CylinderGeometry(0.01, 0.01, 0.22, 4), dark, mid, p.y - 0.3, 0.15);
    put(own, scene, new T.SphereGeometry(0.07, 8, 6), lamp, mid, p.y - 0.45, 0.15);
  }
}
/** A castle for `side`, mirrored for the right one: built with +x outward from the field, the gate at the field's end. */
function castle(own: Own, scene: T.Scene, side: 0 | 1): Castle {
  const sign = side === 0 ? -1 : 1,
    colour = SIDE_COLORS[side],
    group = new T.Group(),
    CENTRE = 10.7,
    gate = GATE - CENTRE,
    stone = lambert(own, {
      map: painted(own, 256, 256, (ctx) => {
        ctx.fillStyle = "#b9b4a6";
        ctx.fillRect(0, 0, 256, 256);
        ctx.strokeStyle = "#8e897c";
        ctx.lineWidth = 2;
        for (let row = 0; row < 8; row++) {
          ctx.beginPath();
          ctx.moveTo(0, row * 32);
          ctx.lineTo(256, row * 32);
          ctx.stroke();
          for (let x = row % 2 ? 0 : 32; x < 256; x += 64) {
            ctx.beginPath();
            ctx.moveTo(x, row * 32);
            ctx.lineTo(x, row * 32 + 32);
            ctx.stroke();
          }
        }
        const random = stream(side + 50);
        for (let k = 0; k < 60; k++) {
          ctx.fillStyle = random() < 0.5 ? "#c8c3b4" : "#a9a496";
          ctx.fillRect(random() * 256, random() * 256, 18, 10);
        }
      }),
    }),
    shade = lambert(own, { color: "#8f8a7e" }),
    darkness = basic(own, { color: "#221a14" }),
    paint = lambert(own, { color: colour }),
    timber = lambert(own, { color: "#6a4a30" });
  group.position.x = sign * CENTRE;
  group.scale.x = sign;
  scene.add(group);
  // The wall and its battlements.
  put(own, group, new T.BoxGeometry(4.6, 3.1, 1.6), stone, 0.5, 1.55, -1.95, "both");
  for (let k = 0; k < 7; k++) put(own, group, new T.BoxGeometry(0.36, 0.38, 1.6), stone, -1.55 + k * 0.69, 3.29, -1.95, "cast");
  // The gate: a dark arch in a frame of lighter stone, its portcullis drawn up, a banner over it.
  put(own, group, new T.BoxGeometry(1.7, 2.15, 0.12), shade, gate, 1.07, -1.12);
  put(own, group, new T.BoxGeometry(1.25, 1.35, 0.06), darkness, gate, 0.68, -1.04);
  const arch = put(own, group, new T.CircleGeometry(0.625, 24, 0, Math.PI), darkness, gate, 1.35, -1.01);
  arch.renderOrder = 1;
  for (let k = 0; k < 5; k++) put(own, group, new T.BoxGeometry(0.035, 0.5, 0.03), timber, gate - 0.5 + k * 0.25, 1.62, -0.99);
  put(own, group, new T.BoxGeometry(1.25, 0.05, 0.03), timber, gate, 1.4, -0.99);
  put(own, group, new T.PlaneGeometry(0.62, 0.8), paint, gate, 2.62, -1.05);
  put(own, group, new T.CircleGeometry(0.16, 16), basic(own, { color: "#ffd24a" }), gate, 2.68, -1.04);
  // Windows along the wall: lit one by one as the treasury fills.
  const windows: T.MeshBasicMaterial[] = [];
  for (let k = 0; k < 3; k++) {
    const glass = basic(own, { color: "#3a3028" });
    put(own, group, new T.PlaneGeometry(0.3, 0.52), glass, 0.15 + k * 0.72, 2.2, -1.14);
    put(own, group, new T.CircleGeometry(0.15, 12, 0, Math.PI), glass, 0.15 + k * 0.72, 2.46, -1.14);
    windows.push(glass);
  }
  // The turret over the gate (the fire pots come from here) and the great tower with its roof and flag.
  put(own, group, new T.CylinderGeometry(0.5, 0.55, 4.1, 14), stone, gate - 0.95, 2.05, -1.9, "both");
  put(own, group, new T.ConeGeometry(0.72, 0.95, 14), paint, gate - 0.95, 4.57, -1.9, "cast");
  put(own, group, new T.CylinderGeometry(1.05, 1.15, 5.6, 20), stone, 1.75, 2.8, -2.15, "both");
  put(own, group, new T.CylinderGeometry(1.22, 1.22, 0.3, 20), shade, 1.75, 5.55, -2.15, "cast");
  put(own, group, new T.ConeGeometry(1.36, 1.7, 20), paint, 1.75, 6.55, -2.15, "cast");
  put(own, group, new T.CylinderGeometry(0.025, 0.025, 1.1, 5), timber, 1.75, 7.9, -2.15);
  const flag = put(own, group, new T.PlaneGeometry(0.78, 0.44, 6, 1), own(new T.MeshLambertMaterial({ color: colour, side: T.DoubleSide })), 1.36, 8.2, -2.15);
  // The treasury's slit down the tower: a dark frame, and the gold that rises in it.
  put(own, group, new T.BoxGeometry(0.66, GAUGE_TALL + 0.3, 0.06), basic(own, { color: "#2a2018" }), 1.75, 2.75, -1.08);
  const gauge = put(own, group, new T.BoxGeometry(0.46, 1, 0.05), basic(own, { color: "#ffcf3a" }), 1.75, 1.2, -1.03);
  gauge.scale.y = 0.001;
  // Marks at the quarters.
  for (let k = 1; k < 4; k++) put(own, group, new T.BoxGeometry(0.66, 0.03, 0.02), shade, 1.75, 1.2 + (GAUGE_TALL * k) / 4, -1.0);
  // The ring on the road before the gate: where the gold is brought.
  const ring = new T.Mesh(own(new T.RingGeometry(0.72, 0.92, 36)), basic(own, { color: colour, transparent: true, opacity: 0.75, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(sign * GATE, 0.03, 0.45);
  scene.add(ring);
  return { gauge, windows, flag, ring };
}
/** Builds the whole valley into `scene` and hands back what moves. */
export function buildValley(scene: T.Scene, own: Own): Valley {
  sky(own, scene);
  const clouds = backdrop(own, scene);
  ground(own, scene);
  ledges(own, scene);
  return { castles: [castle(own, scene, 0), castle(own, scene, 1)], clouds };
}
