import * as T from "three";
import { glossy } from "../../engine/scene-utils";

/** How the turtle moves its limbs: lying still, sliding, falling into the mist, or happy over the well. */
export type Mood = "rest" | "slide" | "fall" | "happy";
/**
 * A cute turtle lying on its back, modelled in code: a green domed shell with painted scutes resting on the tile, its
 * pale belly plate (plastron) up, a head that looks up at the player (toward +z), four stubby legs and a tail sticking
 * out. `root` has the tile's top at y = 0. `move` paddles the limbs for a mood at a time in seconds.
 */
export interface Turtle {
  root: T.Group;
  move(t: number, mood: Mood): void;
}
/** How tall the turtle stands on its tile, belly plate included. */
export const TURTLE_TOP = 0.28;
const SHELL_X = 0.32,
  SHELL_Z = 0.37,
  SHELL_H = 0.22,
  SKIN = "#8fcf63",
  canvasOf = (w: number, h = w) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return { c, ctx: c.getContext("2d")! };
  };
/** The shell's scutes on a sphere's lower half (the rim along the canvas's top, the apex along its foot). */
function scutes() {
  const W = 512,
    H = 512,
    { c, ctx } = canvasOf(W, H);
  ctx.fillStyle = "#2f6e2c";
  ctx.fillRect(0, 0, W, H);
  // Rings of scutes from the rim (canvas y = 0) to the apex (y = H): marginal, costal, then the middle one.
  const rings: [number, number, number, string, string][] = [
    [0, 0.15, 24, "#9cc84c", "#c9e27a"],
    [0.16, 0.56, 10, "#4f9e3c", "#7cc55a"],
    [0.57, 0.86, 6, "#4a9838", "#79c156"],
  ];
  rings.forEach(([y0, y1, n, base, light], ring) => {
    const top = y0 * H + 3,
      bottom = y1 * H - 3,
      step = W / n,
      shift = ring % 2 ? step / 2 : 0;
    for (let i = -1; i <= n; i++) {
      const x = i * step + shift + 3,
        w = step - 6,
        g = ctx.createRadialGradient(x + w / 2, (top + bottom) / 2, 2, x + w / 2, (top + bottom) / 2, Math.max(w, bottom - top) * 0.7);
      g.addColorStop(0, light);
      g.addColorStop(1, base);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x, top, w, bottom - top, Math.min(w, bottom - top) * 0.32);
      ctx.fill();
      // A growth ring inside each scute.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.18)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x + w * 0.2, top + (bottom - top) * 0.22, w * 0.6, (bottom - top) * 0.56, Math.min(w, bottom - top) * 0.2);
      ctx.stroke();
    }
  });
  // The middle scute round the apex.
  const g = ctx.createLinearGradient(0, 0.87 * H, 0, H);
  g.addColorStop(0, "#4a9838");
  g.addColorStop(1, "#7cc55a");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0.87 * H, W, 0.13 * H);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The belly plate: cream with a seam down the middle and five across, warmer toward its edge. */
function plastron() {
  const S = 256,
    { c, ctx } = canvasOf(S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 10, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, "#fbf0c4");
  g.addColorStop(0.7, "#f1dc9a");
  g.addColorStop(1, "#d9b873");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = "rgba(150, 112, 52, 0.7)";
  ctx.lineCap = "round";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(S / 2, S * 0.06);
  ctx.lineTo(S / 2, S * 0.94);
  for (const y of [0.24, 0.38, 0.52, 0.66, 0.8]) {
    const bend = (y - 0.52) * 18;
    ctx.moveTo(S * 0.12, S * y + bend);
    ctx.quadraticCurveTo(S / 4, S * y - 4, S / 2, S * y);
    ctx.quadraticCurveTo((S * 3) / 4, S * y - 4, S * 0.88, S * y + bend);
  }
  ctx.stroke();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** Builds the turtle; every geometry, material and texture goes through `own` to be disposed with the view. */
export function turtle(own: <R extends { dispose(): void }>(r: R) => R): Turtle {
  const root = new T.Group(),
    shellPaint = own(glossy({ map: own(scutes()), roughness: 0.38, metalness: 0.02 }, 0.6)),
    rimPaint = own(new T.MeshStandardMaterial({ color: "#8cbf45", roughness: 0.5 })),
    bellyMap = own(plastron()),
    bellyPaint = own(new T.MeshStandardMaterial({ map: bellyMap, roughness: 0.62 })),
    skin = own(new T.MeshStandardMaterial({ color: SKIN, roughness: 0.55 })),
    sole = own(new T.MeshStandardMaterial({ color: "#c7e59a", roughness: 0.6 })),
    ink = own(new T.MeshStandardMaterial({ color: "#1d1b22", roughness: 0.18 })),
    shine = own(new T.MeshBasicMaterial({ color: "#ffffff" })),
    blush = own(new T.MeshBasicMaterial({ color: "#ff9aa6", transparent: true, opacity: 0.8 })),
    mesh = (geometry: T.BufferGeometry, material: T.Material, shadow = true) => {
      const m = new T.Mesh(own(geometry), material);
      m.castShadow = shadow;
      m.receiveShadow = true;
      return m;
    };
  // The shell: the lower half of a flattened sphere, its apex on the tile, and a rounded rim round its edge.
  const shell = mesh(new T.SphereGeometry(1, 40, 18, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), shellPaint);
  shell.scale.set(SHELL_X, SHELL_H, SHELL_Z);
  shell.position.y = SHELL_H + 0.006;
  const rim = mesh(new T.TorusGeometry(1, 0.085, 10, 48).rotateX(Math.PI / 2), rimPaint);
  rim.scale.set(SHELL_X + 0.005, 0.3, SHELL_Z + 0.005);
  rim.position.y = SHELL_H + 0.006;
  // The belly plate: a bevelled oval a little inside the rim, its seams painted.
  const oval = new T.Shape().absellipse(0, 0, SHELL_X - 0.045, SHELL_Z - 0.05, 0, Math.PI * 2, false, 0),
    belly = mesh(new T.ExtrudeGeometry(oval, { depth: 0.02, bevelEnabled: true, bevelSize: 0.022, bevelThickness: 0.022, bevelSegments: 3, curveSegments: 40 }).rotateX(-Math.PI / 2), bellyPaint);
  // The oval's own coordinates are its picture's: (x, y) over (-0.35..0.35, -0.4..0.4).
  bellyMap.repeat.set(1 / 0.7, 1 / 0.8);
  bellyMap.offset.set(0.5, 0.5);
  belly.position.y = SHELL_H + 0.01;
  root.add(shell, rim, belly);
  // The head on a short neck, craning up to look at the player, with big eyes, pink cheeks and a smile.
  const head = new T.Group();
  head.position.set(0, SHELL_H + 0.01, SHELL_Z - 0.08);
  const neck = mesh(new T.CapsuleGeometry(0.062, 0.1, 4, 12).rotateX(Math.PI / 2 - 0.5).translate(0, 0.035, 0.07), skin),
    skull = mesh(new T.SphereGeometry(0.118, 24, 18), skin),
    at = new T.Vector3(0, 0.08, 0.14);
  skull.scale.set(1, 0.92, 1.05);
  skull.position.copy(at);
  head.add(neck, skull);
  for (const side of [-1, 1]) {
    const toward = new T.Vector3(side * 0.42, 0.42, 0.8).normalize(),
      eye = mesh(new T.SphereGeometry(0.028, 14, 10), ink, false),
      glint = new T.Mesh(own(new T.SphereGeometry(0.009, 8, 6)), shine),
      cheek = new T.Mesh(own(new T.CircleGeometry(0.022, 16)), blush);
    eye.position.copy(at).addScaledVector(toward, 0.108);
    glint.position.copy(eye.position).add(new T.Vector3(side * 0.006, 0.014, 0.016));
    const side2 = new T.Vector3(side * 0.7, 0.12, 0.7).normalize();
    cheek.position.copy(at).addScaledVector(side2, 0.117);
    cheek.lookAt(cheek.position.clone().add(side2));
    head.add(eye, glint, cheek);
  }
  const smile = new T.Mesh(own(new T.TorusGeometry(0.026, 0.0075, 6, 14, Math.PI)), ink),
    front = new T.Vector3(0, 0.05, 1).normalize();
  smile.position.copy(at).addScaledVector(front, 0.116);
  smile.lookAt(smile.position.clone().add(front));
  smile.rotateZ(Math.PI);
  head.add(smile);
  root.add(head);
  // Four stubby legs out of the rim, up into the air, each on a pivot that paddles; a little tail behind.
  const legs: { swing: T.Group; phase: number }[] = [],
    up = new T.Vector3(0, 1, 0),
    limb = own(new T.CapsuleGeometry(0.058, 0.07, 4, 12)),
    foot = own(new T.SphereGeometry(0.066, 14, 10)),
    toe = own(new T.SphereGeometry(0.018, 8, 6));
  [
    [1, 1, 0],
    [-1, 1, Math.PI],
    [1, -1, Math.PI * 0.6],
    [-1, -1, Math.PI * 1.6],
  ].forEach(([sx, sz, phase]) => {
    const pivot = new T.Group(),
      swing = new T.Group(),
      out = new T.Vector3(sx * 1, 0.95, sz * (sz > 0 ? 0.55 : 0.75)).normalize();
    pivot.position.set(sx * (SHELL_X - 0.08), SHELL_H + 0.01, sz * (SHELL_Z - 0.13));
    pivot.quaternion.setFromUnitVectors(up, out);
    const leg = new T.Mesh(limb, skin),
      paw = new T.Mesh(foot, sole);
    leg.position.y = 0.075;
    paw.position.y = 0.14;
    paw.scale.set(1, 0.7, 1.05);
    leg.castShadow = paw.castShadow = true;
    swing.add(leg, paw);
    for (const k of [-1, 0, 1]) {
      const nail = new T.Mesh(toe, shine);
      nail.position.set(k * 0.03, 0.182, 0.03 - Math.abs(k) * 0.008);
      swing.add(nail);
    }
    pivot.add(swing);
    root.add(pivot);
    legs.push({ swing, phase });
  });
  const tail = new T.Group(),
    tip = mesh(new T.ConeGeometry(0.036, 0.11, 12).rotateX(-Math.PI / 2 + 0.5).translate(0, 0.03, -0.05), skin);
  tail.position.set(0, SHELL_H + 0.005, -SHELL_Z + 0.02);
  tail.add(tip);
  root.add(tail);
  // How far and how fast each mood paddles: a slow paddle at rest, quicker while sliding, flailing while falling.
  const PACE: Record<Mood, [number, number]> = { rest: [0.22, 1.7], slide: [0.55, 4.2], fall: [0.95, 7.5], happy: [0.7, 5.5] };
  return {
    root,
    move(t, mood) {
      const [reach, rate] = PACE[mood],
        w = t * rate * Math.PI * 2;
      for (const { swing, phase } of legs) {
        swing.rotation.x = Math.sin(w + phase) * reach;
        swing.rotation.z = Math.cos(w * 0.9 + phase) * reach * 0.55;
      }
      tail.rotation.y = Math.sin(w * 1.3) * reach * 1.2;
      head.rotation.x = -Math.abs(Math.sin(w * 0.5)) * reach * 0.25 + (mood === "fall" ? -0.35 : 0);
      head.rotation.y = Math.sin(w * 0.37) * reach * (mood === "happy" || mood === "fall" ? 0.7 : 0.35);
    },
  };
}
