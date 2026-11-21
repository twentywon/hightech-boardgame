import * as T from "three";
import { block, glossy } from "../../engine/scene-utils";
import { BEAM, FOOT, REACH, TALL } from "./layout";
import type { Kind } from "./rules";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The height of the beam over a piece's foot. */
export const AXIS = BEAM - FOOT;
/** How far a target-mirror's block reaches from its middle (its two outer faces stand there). */
const HALF = 0.33;
/** A piece as it stands on its mount, and the parts the view changes. */
export interface Figure {
  group: T.Group;
  /** What turns with the piece's `dir` (the clamp and the marks round its foot do not). */
  turn: T.Group;
  /** The invisible box a press is judged by. */
  proxy: T.Mesh;
  /** A target's frosted disc, a checkpoint's ring, a laser's lens and lamp and switch, where it has them. */
  disc?: T.Mesh;
  /** A target-mirror's painted top. */
  top?: T.Mesh;
  ring?: T.Mesh;
  /** A checkpoint's lamp. */
  bulb?: T.Mesh;
  lens?: T.Mesh;
  lamp?: T.Mesh;
  lever?: T.Object3D;
}
/** How a piece is marked: fixed in place (a clamp), its turn fixed (a red collar) or free on a fixed piece (white arrows). */
export interface Look {
  given: boolean;
  locked: boolean;
}
const canvasOf = (w: number, h = w) => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, pen: canvas.getContext("2d")! };
};
/** The target's face: frosted white glass ruled with red rings and a cross, brighter toward its middle. */
function targetTexture() {
  const { canvas, pen } = canvasOf(256);
  const g = pen.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(1, "#d9dde2");
  pen.fillStyle = g;
  pen.fillRect(0, 0, 256, 256);
  for (const [r, w] of [
    [112, 10],
    [80, 9],
    [48, 8],
  ] as [number, number][]) {
    pen.strokeStyle = "#d8322a";
    pen.lineWidth = w;
    pen.beginPath();
    pen.arc(128, 128, r, 0, Math.PI * 2);
    pen.stroke();
  }
  pen.fillStyle = "#d8322a";
  pen.beginPath();
  pen.arc(128, 128, 18, 0, Math.PI * 2);
  pen.fill();
  pen.strokeStyle = "rgba(60, 20, 20, 0.55)";
  pen.lineWidth = 3;
  pen.beginPath();
  pen.moveTo(128, 6);
  pen.lineTo(128, 250);
  pen.moveTo(6, 128);
  pen.lineTo(250, 128);
  pen.stroke();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/**
 * The target-mirror block's top seen from above (north up): the dark triangle behind the mirror, a silver line along
 * the mirror and the target's red rings against its north face, so that its way round reads from above; `lit` paints
 * the rings glowing.
 */
function topTexture(lit: boolean) {
  const { canvas, pen } = canvasOf(256);
  pen.fillStyle = "#30343b";
  pen.beginPath();
  pen.moveTo(0, 0);
  pen.lineTo(256, 0);
  pen.lineTo(256, 256);
  pen.closePath();
  pen.fill();
  pen.save();
  pen.clip();
  for (const [r, color] of [
    [92, lit ? "#ffe2a8" : "#f2f2f2"],
    [72, lit ? "#ff7a30" : "#d8322a"],
    [52, lit ? "#ffe2a8" : "#f2f2f2"],
    [32, lit ? "#ff7a30" : "#d8322a"],
  ] as [number, string][]) {
    pen.fillStyle = color;
    pen.beginPath();
    pen.arc(128, 0, r, 0, Math.PI);
    pen.fill();
  }
  pen.restore();
  pen.strokeStyle = "#eef4fa";
  pen.lineWidth = 16;
  pen.beginPath();
  pen.moveTo(0, 0);
  pen.lineTo(256, 256);
  pen.stroke();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** The yellow label on the laser's sides: a warning triangle with its sunburst, and the word. */
function labelTexture() {
  const { canvas, pen } = canvasOf(256, 96);
  pen.fillStyle = "#f5c518";
  pen.fillRect(0, 0, 256, 96);
  pen.strokeStyle = "#111";
  pen.lineWidth = 5;
  pen.strokeRect(5, 5, 246, 86);
  // The triangle with a burst in it.
  pen.lineJoin = "round";
  pen.beginPath();
  pen.moveTo(50, 16);
  pen.lineTo(84, 78);
  pen.lineTo(16, 78);
  pen.closePath();
  pen.stroke();
  pen.fillStyle = "#111";
  pen.beginPath();
  pen.arc(50, 56, 6, 0, Math.PI * 2);
  pen.fill();
  pen.lineWidth = 3;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    pen.beginPath();
    pen.moveTo(50 + Math.cos(a) * 9, 56 + Math.sin(a) * 9);
    pen.lineTo(50 + Math.cos(a) * 15, 56 + Math.sin(a) * 15);
    pen.stroke();
  }
  pen.beginPath();
  pen.moveTo(56, 56);
  pen.lineTo(82, 56);
  pen.stroke();
  pen.font = "900 40px Inter, Arial, sans-serif";
  pen.textBaseline = "middle";
  pen.fillText("LASER", 98, 50);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** Two white arrows running round a ring: the turn of this fixed piece is free. */
function turnTexture() {
  const { canvas, pen } = canvasOf(256);
  pen.strokeStyle = "rgba(255, 255, 255, 0.92)";
  pen.fillStyle = "rgba(255, 255, 255, 0.92)";
  pen.lineWidth = 16;
  pen.lineCap = "round";
  for (const start of [0.15, Math.PI + 0.15]) {
    const end = start + Math.PI - 0.7;
    pen.beginPath();
    pen.arc(128, 128, 104, start, end);
    pen.stroke();
    const x = 128 + Math.cos(end) * 104,
      y = 128 + Math.sin(end) * 104,
      tx = -Math.sin(end),
      ty = Math.cos(end);
    pen.beginPath();
    pen.moveTo(x + tx * 30, y + ty * 30);
    pen.lineTo(x + Math.cos(end) * 22 - tx * 4, y + Math.sin(end) * 22 - ty * 4);
    pen.lineTo(x - Math.cos(end) * 22 - tx * 4, y - Math.sin(end) * 22 - ty * 4);
    pen.closePath();
    pen.fill();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/**
 * The pieces of the bench, modelled in code and facing north (`dir` 0): a laser module on a post, its lens toward
 * the front and a toggle switch with a lamp on top; a target-mirror (a black block filling the half behind a mirror
 * on the diagonal, its frosted target on the north face); a double mirror in a brass frame; a glass cube splitter
 * with its half-silvered diagonal; a checkpoint (a plate with a round aperture across the beam, a green ring in it);
 * and a rubber stopper. Shapes and paints are made once and shared.
 */
export class Optics {
  readonly paint: Record<string, T.Material> = {};
  private shapes: Record<string, T.BufferGeometry> = {};
  constructor(private own: Own) {
    const g = (geometry: T.BufferGeometry) => own(geometry),
      m = (key: string, material: T.Material) => (this.paint[key] = own(material));
    m("black", new T.MeshStandardMaterial({ color: "#23262c", roughness: 0.42, metalness: 0.35 }));
    m("steel", new T.MeshStandardMaterial({ color: "#c9cfd6", roughness: 0.28, metalness: 0.55 }));
    m("brass", own(glossy({ color: "#d6a84c", roughness: 0.3, metalness: 0.6 })));
    // A front-surface mirror that reads as one under any light: pale, bright, a little blue.
    m("mirror", new T.MeshStandardMaterial({ color: "#eaf1f8", roughness: 0.06, metalness: 0.8, emissive: "#4b5a6a", emissiveIntensity: 0.55 }));
    m("glass", new T.MeshStandardMaterial({ color: "#c4ecff", roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, depthWrite: false }));
    m("coat", new T.MeshStandardMaterial({ color: "#ffd889", roughness: 0.2, metalness: 0.5, emissive: "#6a4a10", emissiveIntensity: 0.5, transparent: true, opacity: 0.62, side: T.DoubleSide, depthWrite: false }));
    m("rubber", new T.MeshStandardMaterial({ color: "#8a3426", roughness: 0.92 }));
    m("hole", new T.MeshStandardMaterial({ color: "#16100e", roughness: 1 }));
    m("housing", own(glossy({ color: "#24456e", roughness: 0.38, metalness: 0.35 })));
    m("label", new T.MeshStandardMaterial({ map: own(labelTexture()), roughness: 0.6 }));
    m("lensOff", new T.MeshStandardMaterial({ color: "#5a1410", roughness: 0.1, metalness: 0.2 }));
    m("lensOn", new T.MeshBasicMaterial({ color: "#ff5040" }));
    m("lampOff", new T.MeshStandardMaterial({ color: "#5c1712", roughness: 0.3 }));
    m("lampOn", new T.MeshBasicMaterial({ color: "#ff3424" }));
    const face = own(targetTexture());
    m("discOff", new T.MeshStandardMaterial({ map: face, roughness: 0.75, emissive: "#ffffff", emissiveMap: face, emissiveIntensity: 0.08 }));
    m("discOn", new T.MeshStandardMaterial({ map: face, roughness: 0.75, emissive: "#ff7a50", emissiveMap: face, emissiveIntensity: 1.5 }));
    m("topOff", new T.MeshStandardMaterial({ map: own(topTexture(false)), roughness: 0.45, metalness: 0.2 }));
    m("topOn", new T.MeshBasicMaterial({ map: own(topTexture(true)), toneMapped: false }));
    m("back", new T.MeshStandardMaterial({ color: "#3a3f47", roughness: 0.5, metalness: 0.3 }));
    m("ringOff", new T.MeshStandardMaterial({ color: "#2e5a3c", roughness: 0.4 }));
    m("ringOn", new T.MeshBasicMaterial({ color: "#58ff8c" }));
    m("collar", new T.MeshStandardMaterial({ color: "#c8352a", roughness: 0.4, metalness: 0.3 }));
    m("turnRing", new T.MeshBasicMaterial({ map: own(turnTexture()), transparent: true, depthWrite: false }));
    m("proxy", new T.MeshBasicMaterial({ visible: false }));
    // The stand every optic has: a base on its mount, a post holder, a steel post.
    this.shapes.base = g(new T.CylinderGeometry(0.2, 0.22, 0.05, 32).translate(0, 0.025, 0));
    this.shapes.holder = g(new T.CylinderGeometry(0.065, 0.065, 0.13, 20).translate(0, 0.115, 0));
    this.shapes.post = g(new T.CylinderGeometry(0.032, 0.032, 1, 14));
    this.shapes.screw = g(new T.CylinderGeometry(0.032, 0.032, 0.025, 12));
    this.shapes.clamp = g(block(0.7, 0.026, 0.2, 0.01).translate(0, 0.013, 0));
    this.shapes.collar = g(new T.CylinderGeometry(0.078, 0.078, 0.032, 24));
    this.shapes.turnRing = g(new T.RingGeometry(0.25, 0.32, 48).rotateX(-Math.PI / 2));
    this.shapes.proxy = g(new T.BoxGeometry(2 * REACH, 1, 2 * REACH).translate(0, 0.5, 0));
    // The laser module.
    this.shapes.housing = g(block(0.3, 0.24, 0.58, 0.04));
    this.shapes.bezel = g(new T.CylinderGeometry(0.075, 0.08, 0.06, 28).rotateX(Math.PI / 2));
    this.shapes.lens = g(new T.CircleGeometry(0.048, 28).rotateY(Math.PI));
    this.shapes.fin = g(block(0.3, 0.2, 0.018, 0.006));
    this.shapes.label = g(new T.PlaneGeometry(0.42, 0.15));
    this.shapes.switchPlate = g(block(0.13, 0.022, 0.11, 0.008));
    this.shapes.lever = g(new T.CylinderGeometry(0.012, 0.014, 0.085, 10).translate(0, 0.0425, 0));
    this.shapes.knob = g(new T.SphereGeometry(0.02, 12, 8));
    this.shapes.lamp = g(new T.SphereGeometry(0.022, 14, 10));
    this.shapes.cable = g(
      new T.TubeGeometry(
        new T.CatmullRomCurve3([new T.Vector3(0, AXIS - 0.04, 0.3), new T.Vector3(0, AXIS - 0.1, 0.42), new T.Vector3(0.05, 0.08, 0.5), new T.Vector3(0.12, 0.012, 0.62)]),
        20,
        0.018,
        8,
      ),
    );
    // The target-mirror: a black block behind a mirror on the diagonal.
    const prism = new T.Shape();
    prism.moveTo(-HALF, HALF);
    prism.lineTo(HALF, HALF);
    prism.lineTo(HALF, -HALF);
    prism.closePath();
    this.shapes.prism = g(new T.ExtrudeGeometry(prism, { depth: 0.28, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, AXIS - 0.15, 0));
    // Its top, painted, laid just over the block: corners north-west, north-east and south-east.
    const lid = new T.BufferGeometry();
    lid.setAttribute("position", new T.Float32BufferAttribute([-HALF, 0, -HALF, HALF, 0, HALF, HALF, 0, -HALF], 3));
    lid.setAttribute("uv", new T.Float32BufferAttribute([0, 1, 1, 0, 1, 1], 2));
    lid.setAttribute("normal", new T.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
    this.shapes.lid = g(lid.translate(0, AXIS + 0.132, 0));
    this.shapes.pane = g(new T.BoxGeometry(2 * HALF * Math.SQRT2 - 0.06, 0.38, 0.016));
    this.shapes.rail = g(new T.BoxGeometry(2 * HALF * Math.SQRT2 - 0.02, 0.026, 0.034));
    this.shapes.disc = g(new T.CircleGeometry(0.135, 36).rotateY(Math.PI));
    this.shapes.rim = g(new T.TorusGeometry(0.138, 0.013, 8, 36));
    // The double mirror's frame.
    this.shapes.wide = g(new T.BoxGeometry(0.86, 0.34, 0.026));
    this.shapes.frameBar = g(new T.BoxGeometry(0.9, 0.03, 0.05));
    this.shapes.frameSide = g(new T.BoxGeometry(0.03, 0.4, 0.05));
    // The splitter: a glass cube on a small table, its diagonal coated.
    this.shapes.cube = g(new T.BoxGeometry(0.36, 0.36, 0.36));
    this.shapes.coat = g(new T.PlaneGeometry(0.36 * Math.SQRT2 - 0.01, 0.35).rotateY(-Math.PI / 4));
    this.shapes.table = g(block(0.42, 0.03, 0.42, 0.01));
    this.shapes.cap = g(block(0.16, 0.028, 0.16, 0.008));
    // The checkpoint: a plate with a round aperture across the beam.
    const plate = new T.Shape();
    plate.moveTo(-0.24, -0.22);
    plate.lineTo(0.24, -0.22);
    plate.lineTo(0.24, 0.22);
    plate.lineTo(-0.24, 0.22);
    plate.closePath();
    const hole = new T.Path();
    hole.absarc(0, 0, 0.1, 0, Math.PI * 2, true);
    plate.holes.push(hole);
    this.shapes.aperture = g(new T.ExtrudeGeometry(plate, { depth: 0.08, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2, curveSegments: 28 }).translate(0, AXIS, -0.04));
    this.shapes.bulb = g(new T.SphereGeometry(0.034, 16, 10));
    this.shapes.socket = g(new T.CylinderGeometry(0.04, 0.045, 0.025, 16));
    this.shapes.apertureRim = g(new T.TorusGeometry(0.106, 0.016, 10, 36));
    this.shapes.glow = g(new T.TorusGeometry(0.086, 0.008, 8, 36));
    // The rubber stopper, wider at its top, with a hole in it.
    this.shapes.stopper = g(
      new T.LatheGeometry(
        [
          [0, 0],
          [0.15, 0],
          [0.2, 0.165],
          [0.19, 0.18],
          [0.06, 0.182],
          [0.05, 0.16],
          [0, 0.16],
        ].map(([r, y]) => new T.Vector2(r, y)),
        36,
      ),
    );
  }
  private mesh(shape: string, paint: string, parent: T.Object3D, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(this.shapes[shape], this.paint[paint]);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** A steel post from the holder up to `top`. */
  private post(parent: T.Object3D, top: number) {
    const post = this.mesh("post", "steel", parent, 0, (0.17 + top) / 2);
    post.scale.y = top - 0.17;
    return post;
  }
  /** A piece of a kind as it stands on its mount, marked as `look` says. */
  figure(kind: Kind, look: Look): Figure {
    const group = new T.Group(),
      turn = new T.Group(),
      out: Figure = { group, turn, proxy: new T.Mesh(this.shapes.proxy, this.paint.proxy) };
    group.add(turn);
    out.proxy.scale.y = TALL[kind] + 0.05;
    group.add(out.proxy);
    if (kind !== "blocker") {
      this.mesh("base", "black", turn);
      this.mesh("holder", "black", turn);
    }
    switch (kind) {
      case "laser": {
        this.post(turn, AXIS - 0.12);
        this.mesh("housing", "housing", turn, 0, AXIS, 0.01);
        this.mesh("bezel", "black", turn, 0, AXIS, -0.29);
        out.lens = this.mesh("lens", "lensOff", turn, 0, AXIS, -0.321);
        for (let k = 0; k < 4; k++) this.mesh("fin", "black", turn, 0, AXIS, 0.31 + k * 0.035);
        for (const side of [-1, 1]) {
          const label = this.mesh("label", "label", turn, side * 0.151, AXIS + 0.01, 0.02);
          label.rotation.y = (side * Math.PI) / 2;
          label.castShadow = false;
        }
        this.mesh("switchPlate", "black", turn, 0.02, AXIS + 0.131, 0.1);
        const lever = new T.Group();
        lever.position.set(0.02, AXIS + 0.142, 0.1);
        this.mesh("lever", "steel", lever);
        this.mesh("knob", "black", lever, 0, 0.085, 0);
        lever.rotation.x = 0.55;
        turn.add(lever);
        out.lever = lever;
        out.lamp = this.mesh("lamp", "lampOff", turn, -0.08, AXIS + 0.13, 0.1);
        this.mesh("cable", "black", turn);
        break;
      }
      case "target": {
        this.post(turn, AXIS - 0.16);
        this.mesh("prism", "black", turn);
        out.top = this.mesh("lid", "topOff", turn);
        out.top.castShadow = false;
        // The mirror on the diagonal from the north-west corner to the south-east one, just before the block and taller
        // than it: silvered toward the south-west, dark behind.
        const paint = this.paint,
          pane = new T.Mesh(this.shapes.pane, [paint.back, paint.back, paint.back, paint.back, paint.mirror, paint.back]);
        pane.position.set(-0.012, AXIS, 0.012);
        pane.rotation.y = -Math.PI / 4;
        pane.castShadow = pane.receiveShadow = true;
        turn.add(pane);
        for (const y of [AXIS - 0.2, AXIS + 0.2]) this.mesh("rail", "brass", turn, -0.006, y, 0.006).rotation.y = -Math.PI / 4;
        out.disc = this.mesh("disc", "discOff", turn, 0, AXIS, -HALF - 0.004);
        this.mesh("rim", "black", turn, 0, AXIS, -HALF - 0.004);
        break;
      }
      case "mirror": {
        this.post(turn, AXIS - 0.2);
        const frame = new T.Group();
        frame.position.y = AXIS;
        frame.rotation.y = -Math.PI / 4;
        this.mesh("wide", "mirror", frame);
        for (const y of [-0.185, 0.185]) this.mesh("frameBar", "brass", frame, 0, y, 0);
        for (const x of [-0.445, 0.445]) this.mesh("frameSide", "brass", frame, x, 0, 0);
        turn.add(frame);
        break;
      }
      case "splitter": {
        this.post(turn, AXIS - 0.2);
        this.mesh("table", "black", turn, 0, AXIS - 0.2, 0);
        const cube = this.mesh("cube", "glass", turn, 0, AXIS - 0.005, 0);
        cube.castShadow = false;
        cube.renderOrder = 2;
        const coat = this.mesh("coat", "coat", turn, 0, AXIS - 0.005, 0);
        coat.castShadow = false;
        coat.renderOrder = 1;
        this.mesh("cap", "black", turn, 0, AXIS + 0.19, 0);
        break;
      }
      case "checkpoint": {
        this.post(turn, AXIS - 0.2);
        this.mesh("aperture", "black", turn);
        for (const z of [-0.05, 0.05]) this.mesh("apertureRim", "brass", turn, 0, AXIS, z);
        out.ring = this.mesh("glow", "ringOff", turn, 0, AXIS, 0);
        // A green lamp on the plate's top edge, lit as the beam passes: seen from every side.
        this.mesh("socket", "black", turn, 0, AXIS + 0.24, 0);
        out.bulb = this.mesh("bulb", "ringOff", turn, 0, AXIS + 0.265, 0);
        break;
      }
      case "blocker": {
        this.mesh("stopper", "rubber", turn);
        break;
      }
    }
    // Fixed in place: a clamp bolted over the mount; its turn fixed: a red collar on the post; free: white arrows round it.
    if (look.given && kind !== "blocker") {
      this.mesh("clamp", "black", group, 0, -0.002, 0);
      for (const x of [-0.29, 0.29]) this.mesh("screw", "steel", group, x, 0.036, 0);
    }
    if (look.locked && kind !== "laser" && kind !== "blocker") this.mesh("collar", "collar", turn, 0, 0.165, 0);
    if (look.given && !look.locked && kind !== "laser" && kind !== "blocker") {
      const ring = this.mesh("turnRing", "turnRing", group, 0, 0.034, 0);
      ring.castShadow = ring.receiveShadow = false;
    }
    return out;
  }
  /** The same piece as a see-through shape in one paint (the hint's ghost of where it goes). */
  ghost(kind: Kind, paint: T.Material) {
    const figure = this.figure(kind, { given: false, locked: false });
    figure.group.traverse((thing) => {
      if (thing instanceof T.Mesh && thing !== figure.proxy) {
        thing.material = paint;
        thing.castShadow = false;
        thing.receiveShadow = false;
      }
    });
    figure.proxy.removeFromParent();
    return figure;
  }
}
