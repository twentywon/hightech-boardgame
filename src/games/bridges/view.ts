import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { capable, fall, stuff } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { blocked, edgeBetween, islandState, setOf, type State } from "./rules";

export const BRIDGES_COLORS: [string, string] = ["#a8743f", "#2f8fb8"];
/** The width of a cell of the sea. */
export const CELL = 0.9;
/** The height of the island tops (the faces of the number plates): browser tests aim their taps there. */
export const ISLAND_TOP = 0.19;
/** Where a bridge leaves its island, from the island's middle; the height of its deck there; the spacing of its planks. */
const END = 0.27,
  DECK = 0.1,
  PITCH = 0.075,
  /** A single bridge's width, and each of a double's with the distance of its middle from the line between the islands. */
  WIDE = 0.3,
  NARROW = 0.19,
  LANE = 0.125,
  /** The sea round the islands, past the outermost cells. */
  MARGIN = 0.55;
/** The middle of a cell. */
export function cellAt(size: number, index: number) {
  return { x: ((index % size) - (size - 1) / 2) * CELL, z: (Math.floor(index / size) - (size - 1) / 2) * CELL };
}
/** What the camera frames for a sea of `size` cells a side (browser tests aim with it too). */
export function bridgesSubject(size: number, aspect: number): TableSubject {
  const half = (size * CELL) / 2 + MARGIN;
  return { half: aspect < 1 ? half : half + 0.2, halfZ: half + 0.15, height: 0.45, lookY: 0.08, tilt: 1.12 };
}
/** A fixed sequence, so the islands' shapes and the things on them are the same each time a puzzle is shown. */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
type Tone = "open" | "done" | "over" | "win";
const FACE: Record<Tone, [string, string]> = {
  open: ["#f7f0dc", "#26313a"],
  done: ["#3f9a58", "#ffffff"],
  over: ["#c8372d", "#ffffff"],
  win: ["#4cc46c", "#ffffff"],
};
interface Built {
  count: number;
  group: T.Group;
  mesh: T.InstancedMesh;
}
/**
 * A lagoon seen from above: turquoise shallows over a deeper sea, with faint dots where islands may stand; round
 * sandy islands with a grassy top, some with a palm or a few rocks, modelled in code; each island's number on a
 * round wooden plate (light, green when its bridges are all there, red when there are too many); bridges of
 * planks on two beams with posts and rails, arched a little, two narrower ones side by side for a double.
 */
export class BridgesView extends TableView<State> {
  private size = 0;
  private built = "";
  private board = new T.Group();
  private spans = new T.Group();
  private bridges = new Map<number, Built>();
  private plates = new Map<number, { group: T.Group; face: T.Mesh }>();
  private numbers = new Map<string, T.Material>();
  private parts: Record<string, T.BufferGeometry> = {};
  private paint: Record<string, T.Material> = {};
  private waves: T.Texture[] = [];
  private clock = 0;
  private chosen: T.Mesh;
  private aims: T.Mesh[];
  private cursor: T.Mesh;
  private hints: T.Mesh[];
  private strip: T.Mesh;
  private preview: T.Mesh;
  /** The island a drag began on, where it was pressed, and the island it would end on now. */
  private drag: { from: number; x: number; z: number; to: number | null } | null = null;
  /** The island a move made by a drag began on, while the screen plays it: its bridge runs out from there. */
  private launch: number | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#1b5c86");
    this.daylight("#eaf6ff", "#2c6f8e", "#fff3d8", 8, 2.2);
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -ISLAND_TOP);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    const g = (name: string, geometry: T.BufferGeometry) => (this.parts[name] = this.own(geometry));
    // Three island shapes: a beach that shelves into the water, its edge wandering a little, and a grassy cap.
    const sand: [number, number][] = [[0.47, -0.12], [0.455, -0.03], [0.43, 0.02], [0.4, 0.055], [0.36, 0.085], [0.32, 0.102], [0.25, 0.112], [0.12, 0.117], [0, 0.118]],
      grass: [number, number][] = [[0.28, 0.096], [0.286, 0.112], [0.272, 0.128], [0.236, 0.142], [0.17, 0.152], [0.08, 0.157], [0, 0.158]];
    for (let v = 0; v < 3; v++) {
      g(`sand${v}`, this.wander(sand, v * 2.1 + 0.4, 0.045));
      g(`grass${v}`, this.wander(grass, v * 1.3 + 2.2, 0.07));
    }
    const plate = new T.CylinderGeometry(0.2, 0.205, 0.04, 36);
    plate.translate(0, 0.168, 0);
    g("plate", plate);
    const face = new T.CircleGeometry(0.182, 36);
    face.rotateX(-Math.PI / 2);
    face.translate(0, ISLAND_TOP + 0.0005, 0);
    g("face", face);
    const foam = new T.PlaneGeometry(1.06, 1.06);
    foam.rotateX(-Math.PI / 2);
    foam.translate(0, 0.004, 0);
    g("foam", foam);
    g("unit", new T.BoxGeometry(1, 1, 1));
    g("rock", new T.DodecahedronGeometry(0.05, 0));
    this.palms();
    const p = (name: string, material: T.Material) => (this.paint[name] = material);
    p("sand", this.standard({ map: this.sandTexture(), roughness: 0.95 }));
    p("grass", this.standard({ ...stuff("grass", "#5c9c43", 1, keep), roughness: 0.95 }));
    p("rim", this.standard({ color: "#8a5a32", roughness: 0.6 }));
    p("timber", this.standard({ map: this.grainTexture(), roughness: 0.78 }));
    p("bark", this.standard({ color: "#7a5532", roughness: 0.9 }));
    p("frond", this.standard({ color: "#3f8f3a", roughness: 0.75, side: T.DoubleSide }));
    p("rock", this.standard({ color: "#8d8a84", roughness: 0.85, flatShading: true }));
    p("foam", this.own(new T.MeshBasicMaterial({ map: this.foamTexture(), transparent: true, depthWrite: false })));
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.chosen = ringMesh(own, 0.48, 0.56, "#ff8a3c");
    this.aims = [0, 1, 2, 3].map(() => ringMesh(own, 0.49, 0.55, "#ffd24a"));
    this.cursor = ringMesh(own, 0.57, 0.62, "#ffffff");
    this.hints = [0, 1].map(() => ringMesh(own, 0.47, 0.57, "#ffb21f"));
    this.preview = ringMesh(own, 0.48, 0.57, "#fff2b0");
    this.strip = new T.Mesh(own(new T.PlaneGeometry(1, 0.07)), own(new T.MeshBasicMaterial({ color: "#ffb21f", transparent: true, opacity: 0.75, depthWrite: false })));
    this.strip.rotation.x = -Math.PI / 2;
    this.strip.renderOrder = 5;
    this.strip.visible = false;
    this.scene.add(this.board, this.spans, this.chosen, ...this.aims, this.cursor, ...this.hints, this.preview, this.strip);
    this.begin();
    // Where a graphics card draws, the small waves of the sea drift.
    if (capable() && !this.reducedMotion) this.clock = requestAnimationFrame(this.idle);
  }
  /** A turned profile whose edge wanders a little round its middle, so that no two islands are quite round alike. */
  private wander(profile: [number, number][], phase: number, amount: number) {
    const geometry = new T.LatheGeometry(
        profile.map(([r, y]) => new T.Vector2(r, y)),
        40,
      ),
      at = geometry.getAttribute("position");
    for (let i = 0; i < at.count; i++) {
      const x = at.getX(i),
        z = at.getZ(i),
        turn = Math.atan2(x, z),
        // Whole waves round the circle, so the seam where the lathe closes stays shut.
        k = 1 + amount * (0.6 * Math.sin(3 * turn + phase) + 0.4 * Math.sin(5 * turn + phase * 1.7));
      at.setXYZ(i, x * k, at.getY(i), z * k);
    }
    return geometry;
  }
  /** Two palms, each one piece of trunk and nuts and one of fronds: a curved, ringed trunk leaning out and a crown of drooping leaves. */
  private palms() {
    for (let v = 0; v < 2; v++) {
      const lean = 0.07 + v * 0.03,
        tall = 0.3 + v * 0.05,
        curve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(lean * 0.3, tall * 0.4, 0), new T.Vector3(lean * 0.75, tall * 0.75, 0), new T.Vector3(lean, tall, 0)]),
        trunk = new T.TubeGeometry(curve, 10, 0.018, 7, false),
        top = curve.getPoint(1),
        wood: T.BufferGeometry[] = [trunk];
      // Rings round the trunk, where old leaves fell.
      for (let i = 1; i < 6; i++) {
        const ring = new T.TorusGeometry(0.019, 0.004, 4, 10),
          at = curve.getPoint(i / 6),
          tangent = curve.getTangent(i / 6);
        ring.lookAt(tangent);
        ring.translate(at.x, at.y, at.z);
        wood.push(ring);
      }
      for (let i = 0; i < 3; i++) {
        const nut = new T.SphereGeometry(0.02, 8, 6),
          turn = i * 2.1 + v;
        nut.translate(top.x + Math.cos(turn) * 0.022, top.y - 0.018, top.z + Math.sin(turn) * 0.022);
        wood.push(nut);
      }
      const leaves: T.BufferGeometry[] = [];
      for (let i = 0; i < 7; i++) {
        // A leaf: a long narrow blade, broad near its stalk, bent down along its length.
        const blade = new T.PlaneGeometry(0.22, 0.06, 8, 1),
          at = blade.getAttribute("position");
        for (let j = 0; j < at.count; j++) {
          const x = at.getX(j) + 0.11,
            narrow = Math.sin(Math.PI * Math.min(1, x / 0.22 + 0.08)) * (1 - x / 0.3);
          at.setXYZ(j, x, at.getY(j) * narrow, -(x * x) * 2.6);
        }
        blade.rotateX(-Math.PI / 2);
        blade.rotateZ(0.25);
        blade.rotateY((i / 7) * Math.PI * 2 + v * 0.4);
        blade.translate(top.x, top.y, top.z);
        leaves.push(blade);
      }
      // Pieces are merged only when they agree in form: all are made into plain lists of triangles first.
      this.parts[`trunk${v}`] = this.own(mergeGeometries(wood.map((piece) => (piece.index ? piece.toNonIndexed() : piece)))!);
      this.parts[`crown${v}`] = this.own(mergeGeometries(leaves.map((piece) => (piece.index ? piece.toNonIndexed() : piece)))!);
      for (const piece of [...wood, ...leaves]) piece.dispose();
    }
  }
  /** A canvas to paint, and the texture made of it. */
  private painted(width: number, height: number, paint: (pen: CanvasRenderingContext2D) => void) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    paint(canvas.getContext("2d")!);
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.anisotropy = 4;
    return texture;
  }
  /** Sand: warm grains of several shades, wet and darker along the bottom, where the beach meets the water. */
  private sandTexture() {
    const random = sequence(17);
    return this.painted(256, 256, (pen) => {
      pen.fillStyle = "#e7cf98";
      pen.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 2600; i++) {
        pen.fillStyle = ["rgba(160,120,70,0.35)", "rgba(255,245,215,0.5)", "rgba(190,150,95,0.3)"][i % 3];
        pen.fillRect(random() * 256, random() * 256, 1 + random() * 1.5, 1 + random() * 1.5);
      }
      const wet = pen.createLinearGradient(0, 256, 0, 150);
      wet.addColorStop(0, "rgba(120,90,55,0.55)");
      wet.addColorStop(0.45, "rgba(150,115,70,0.25)");
      wet.addColorStop(1, "rgba(150,115,70,0)");
      pen.fillStyle = wet;
      pen.fillRect(0, 150, 256, 106);
    });
  }
  /** The grain of the planks: streaks along their length (the texture's width), so every piece of a bridge shows it so. */
  private grainTexture() {
    const random = sequence(29);
    return this.painted(128, 32, (pen) => {
      pen.fillStyle = "#ffffff";
      pen.fillRect(0, 0, 128, 32);
      for (let i = 0; i < 22; i++) {
        pen.strokeStyle = `rgba(70,40,20,${0.08 + random() * 0.16})`;
        pen.lineWidth = 0.6 + random() * 1.2;
        const y = random() * 32;
        pen.beginPath();
        pen.moveTo(0, y);
        for (let x = 0; x <= 128; x += 16) pen.lineTo(x, y + Math.sin(x / 19 + i) * 1.2);
        pen.stroke();
      }
    });
  }
  /** The foam round an island, a soft white ring where the beach meets the water, fading outward. */
  private foamTexture() {
    return this.painted(128, 128, (pen) => {
      const ring = pen.createRadialGradient(64, 64, 0, 64, 64, 64);
      ring.addColorStop(0.7, "rgba(255,255,255,0)");
      ring.addColorStop(0.8, "rgba(255,255,255,0.55)");
      ring.addColorStop(0.88, "rgba(235,250,255,0.18)");
      ring.addColorStop(1, "rgba(255,255,255,0)");
      pen.fillStyle = ring;
      pen.fillRect(0, 0, 128, 128);
    });
  }
  /**
   * Small waves, as a normal map that tiles: a sum of crossing swells and ripples whose slopes are written as
   * colours (the river crossing's water is made the same way).
   */
  private waveMap() {
    const size = 256,
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const pen = canvas.getContext("2d")!,
      image = pen.createImageData(size, size),
      waves = [
        [2, 1, 1, 0.2],
        [-1, 3, 0.8, 1.4],
        [4, -3, 0.45, 2.6],
        [-6, -2, 0.3, 0.8],
        [7, 5, 0.2, 4],
        [-9, 8, 0.12, 5.1],
      ];
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        let dx = 0,
          dy = 0;
        for (const [kx, ky, amp, phase] of waves) {
          const slope = Math.cos(((kx * x + ky * y) / size) * Math.PI * 2 + phase) * amp;
          dx += slope * kx * 0.05;
          dy += slope * ky * 0.05;
        }
        const length = Math.hypot(dx, dy, 1),
          i = (y * size + x) * 4;
        image.data[i] = Math.round((-dx / length) * 127.5 + 127.5);
        image.data[i + 1] = Math.round((-dy / length) * 127.5 + 127.5);
        image.data[i + 2] = Math.round((1 / length) * 127.5 + 127.5);
        image.data[i + 3] = 255;
      }
    pen.putImageData(image, 0, 0);
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    return texture;
  }
  /**
   * The sea of a puzzle: the deep blue all round, painted with the shadows of swells, and in the middle a lagoon of
   * turquoise shallows the size of the grid, with light dancing over it, a faint dot in every cell and foam on the
   * reef at its edge. Where a graphics card draws, small waves ruffle it all.
   */
  private water(size: number) {
    const span = size * CELL,
      across = span + 12,
      px = 1024,
      unit = px / across,
      random = sequence(size * 131 + 7),
      map = this.painted(px, px, (pen) => {
        pen.fillStyle = "#1b5c86";
        pen.fillRect(0, 0, px, px);
        pen.lineCap = "round";
        for (let i = 0; i < 260; i++) {
          const x = random() * px,
            y = random() * px,
            length = 10 + random() * 30;
          pen.strokeStyle = i % 3 ? `rgba(255,255,255,${0.04 + random() * 0.05})` : `rgba(8,40,70,${0.12 + random() * 0.1})`;
          pen.lineWidth = 1 + random() * 1.5;
          pen.beginPath();
          pen.moveTo(x, y);
          pen.quadraticCurveTo(x + length / 2, y - 3 - random() * 3, x + length, y);
          pen.stroke();
        }
        const mid = px / 2,
          half = (span / 2 + MARGIN * 0.8) * unit,
          lagoon = (inset: number) => {
            pen.beginPath();
            pen.roundRect(mid - half - inset, mid - half - inset, (half + inset) * 2, (half + inset) * 2, CELL * unit * 0.9 + inset);
          };
        // The reef: a darker teal band, then the shallows, pale in the middle.
        lagoon(0.35 * unit);
        pen.fillStyle = "#24788f";
        pen.fill();
        lagoon(0);
        const shallow = pen.createRadialGradient(mid, mid, half * 0.2, mid, mid, half * 1.45);
        shallow.addColorStop(0, "#5fd0d3");
        shallow.addColorStop(0.65, "#45b8cc");
        shallow.addColorStop(1, "#2f97ba");
        pen.fillStyle = shallow;
        pen.fill();
        pen.save();
        lagoon(0);
        pen.clip();
        // The light's net on the sand under the shallows.
        for (let i = 0; i < 70; i++) {
          const y0 = mid - half + random() * half * 2,
            tilt = (random() - 0.5) * 0.6;
          pen.strokeStyle = `rgba(230,255,255,${0.07 + random() * 0.07})`;
          pen.lineWidth = 1 + random() * 1.4;
          pen.beginPath();
          for (let x = mid - half; x <= mid + half; x += 8) pen.lineTo(x, y0 + (x - mid) * tilt + Math.sin(x / 11 + i) * 4 + Math.sin(x / 27 + i * 2) * 6);
          pen.stroke();
        }
        // A faint dot in every cell, so that a line of cells can be followed by eye.
        pen.fillStyle = "rgba(255,255,255,0.28)";
        for (let r = 0; r < size; r++)
          for (let c = 0; c < size; c++) {
            const x = mid + (c - (size - 1) / 2) * CELL * unit,
              y = mid + (r - (size - 1) / 2) * CELL * unit;
            pen.beginPath();
            pen.arc(x, y, CELL * unit * 0.045, 0, Math.PI * 2);
            pen.fill();
          }
        pen.restore();
        // Foam on the reef: a wavering white line round the lagoon, broken here and there.
        pen.strokeStyle = "rgba(255,255,255,0.6)";
        for (let i = 0; i < 3; i++) {
          pen.lineWidth = 3 - i;
          pen.setLineDash([40 + random() * 60, 8 + random() * 20]);
          lagoon((0.12 + i * 0.1) * unit);
          pen.stroke();
        }
        pen.setLineDash([]);
      });
    map.wrapS = map.wrapT = T.ClampToEdgeWrapping;
    const surface: T.MeshStandardMaterialParameters = { map, roughness: 0.3, metalness: 0.02 };
    this.waves = [];
    if (capable()) {
      const ripple = this.waveMap();
      ripple.repeat.set(across / 2.2, across / 2.2);
      this.waves.push(ripple);
      Object.assign(surface, { normalMap: ripple, normalScale: new T.Vector2(0.35, 0.35), roughness: 0.18 });
    }
    const sea = new T.Mesh(this.own(new T.PlaneGeometry(across, across)), this.standard(surface));
    sea.rotation.x = -Math.PI / 2;
    sea.receiveShadow = true;
    this.board.add(sea);
  }
  private mesh(part: string, paint: string | T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(this.parts[part], typeof paint === "string" ? this.paint[paint] : paint);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** The plate's face for a number in a state: a round painted disc. */
  private face(need: number, tone: Tone) {
    const key = `${need}|${tone}`;
    let material = this.numbers.get(key);
    if (!material) {
      const [fill, ink] = FACE[tone],
        texture = this.painted(128, 128, (pen) => {
          pen.fillStyle = fill;
          pen.fillRect(0, 0, 128, 128);
          pen.strokeStyle = tone === "open" ? "rgba(120,80,40,0.45)" : "rgba(255,255,255,0.5)";
          pen.lineWidth = 5;
          pen.beginPath();
          pen.arc(64, 64, 56, 0, Math.PI * 2);
          pen.stroke();
          pen.fillStyle = ink;
          pen.font = '800 82px Inter, "Noto Sans KR", Arial, sans-serif';
          pen.textAlign = "center";
          pen.textBaseline = "middle";
          pen.fillText(String(need), 64, 70);
        });
      texture.wrapS = texture.wrapT = T.ClampToEdgeWrapping;
      material = this.standard(tone === "win" ? { map: texture, roughness: 0.45, emissive: "#2f9f50", emissiveIntensity: 0.55, emissiveMap: texture } : { map: texture, roughness: 0.5 });
      this.numbers.set(key, material);
    }
    return material;
  }
  /** Lays the sea and the islands when the puzzle changes. */
  private lay(state: State) {
    const key = `${state.size}:${state.islands.map((island) => `${island.cell}/${island.need}`).join(",")}`;
    if (key === this.built) return;
    const resized = state.size !== this.size;
    this.built = key;
    this.size = state.size;
    for (const edge of [...this.bridges.keys()]) this.unbuild(edge);
    this.board.clear();
    this.plates.clear();
    this.water(state.size);
    for (const island of state.islands) {
      const random = sequence(island.cell * 7919 + state.size),
        p = cellAt(state.size, island.cell),
        group = new T.Group(),
        shape = Math.floor(random() * 3) % 3;
      group.position.set(p.x, 0, p.z);
      this.mesh(`sand${shape}`, "sand", group).rotation.y = random() * Math.PI * 2;
      this.mesh(`grass${(shape + 1) % 3}`, "grass", group).rotation.y = random() * Math.PI * 2;
      const foam = this.mesh("foam", "foam", group);
      foam.castShadow = foam.receiveShadow = false;
      foam.rotation.y = random() * Math.PI * 2;
      const plate = new T.Group();
      this.mesh("plate", "rim", plate);
      const face = this.mesh("face", this.face(island.need, "open"), plate);
      group.add(plate);
      this.plates.set(island.cell, { group: plate, face });
      // Things on an island stand on a diagonal, clear of the bridges (which leave along the four ways) and of the plate.
      const kind = random();
      if (kind < 0.42) {
        // A palm keeps to a far corner, where it hides nothing of its plate, and leans outward, away from it.
        const side = random() < 0.5 ? -1 : 1,
          r = 0.23,
          kindOf = Math.floor(random() * 2) % 2,
          palm = new T.Group();
        palm.position.set(side * r * Math.SQRT1_2, 0.11, -r * Math.SQRT1_2);
        // The trunk leans along its own x: turned so that x points out from the island's middle.
        palm.rotation.y = Math.atan2(1, side);
        this.mesh(`trunk${kindOf}`, "bark", palm);
        this.mesh(`crown${kindOf}`, "frond", palm);
        group.add(palm);
      } else if (kind < 0.72) {
        const corner = Math.PI / 4 + (Math.floor(random() * 4) * Math.PI) / 2,
          count = 2 + (Math.floor(random() * 2) % 2);
        for (let i = 0; i < count; i++) {
          const r = 0.34 + random() * 0.04,
            turn = corner + (random() - 0.5) * 0.2,
            rock = this.mesh("rock", "rock", group, Math.sin(turn) * r, 0.065, Math.cos(turn) * r);
          rock.scale.set(0.7 + random() * 0.7, 0.5 + random() * 0.5, 0.7 + random() * 0.7);
          rock.rotation.set(random() * 3, random() * 3, random() * 3);
        }
      }
      this.board.add(group);
    }
    if (resized) this.resize();
  }
  /** Takes a bridge away: its pieces go, while the shapes and paint they share stay for others. */
  private unbuild(edge: number) {
    const built = this.bridges.get(edge);
    if (!built) return;
    this.spans.remove(built.group);
    built.mesh.dispose();
    this.bridges.delete(edge);
  }
  /**
   * The bridges of an edge, `from` the island at one end: planks laid across two beams, a post at each joint on
   * either side and a rail along their tops, all following a gentle arch; two narrower ones side by side for a
   * double. Every piece is one box, stretched, turned and tinted.
   */
  private build(state: State, edge: number, count: number, from: number) {
    const e = state.edges[edge],
      start = cellAt(state.size, from),
      end = cellAt(state.size, from === e.a ? e.b : e.a),
      dx = end.x - start.x,
      dz = end.z - start.z,
      length = Math.hypot(dx, dz),
      span = length - 2 * END,
      rise = Math.min(0.08, 0.02 + span * 0.01),
      lanes = count === 2 ? [-LANE, LANE] : [0],
      width = count === 2 ? NARROW : WIDE,
      planks = Math.max(4, Math.round(span / PITCH)),
      joints = Math.max(2, Math.round(span / 0.34)),
      total = lanes.length * (planks + joints * 4 + (joints + 1) * 2),
      mesh = new T.InstancedMesh(this.parts.unit, this.paint.timber, total),
      matrix = new T.Matrix4(),
      turn = new T.Quaternion(),
      euler = new T.Euler(),
      color = new T.Color(),
      random = sequence(edge * 977 + count),
      height = (t: number) => DECK + rise * Math.sin(Math.PI * t),
      slope = (t: number) => Math.atan((rise * Math.PI * Math.cos(Math.PI * t)) / span);
    let k = 0;
    const put = (x: number, y: number, z: number, size: [number, number, number], tilt: number, yaw: number, tint: string) => {
      // The yaw first, then the tilt along the arch.
      turn.setFromEuler(euler.set(0, yaw, tilt, "ZYX"));
      matrix.compose(new T.Vector3(x, y, z), turn, new T.Vector3(...size));
      mesh.setMatrixAt(k, matrix);
      mesh.setColorAt(k, color.set(tint));
      k++;
    };
    const tones = ["#b07a43", "#a06c3a", "#bc8a50", "#94623a"];
    for (const lane of lanes) {
      for (let i = 0; i < planks; i++) {
        const t = (i + 0.5) / planks;
        put(span * t, height(t), lane, [width, 0.02, (span / planks) * 0.8], slope(t), Math.PI / 2, tones[Math.floor(random() * tones.length) % tones.length]);
      }
      for (let j = 0; j < joints; j++) {
        const t0 = j / joints,
          t1 = (j + 1) / joints,
          x0 = span * t0,
          x1 = span * t1,
          y0 = height(t0),
          y1 = height(t1),
          piece = Math.hypot(x1 - x0, y1 - y0) + 0.01,
          tilt = Math.atan2(y1 - y0, x1 - x0);
        for (const side of [-1, 1]) {
          // A beam under the planks, and a rail along the posts.
          put((x0 + x1) / 2, (y0 + y1) / 2 - 0.025, lane + side * (width / 2 - 0.035), [piece, 0.03, 0.026], tilt, 0, "#6e4626");
          put((x0 + x1) / 2, (y0 + y1) / 2 + 0.085, lane + side * (width / 2 - 0.012), [piece, 0.016, 0.018], tilt, 0, "#8a5a32");
        }
      }
      for (let j = 0; j <= joints; j++) {
        const t = j / joints;
        for (const side of [-1, 1]) put(span * t, height(t) + 0.045, lane + side * (width / 2 - 0.012), [0.1, 0.02, 0.02], Math.PI / 2, 0, "#7a4f2b");
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = mesh.receiveShadow = true;
    const group = new T.Group();
    group.add(mesh);
    group.position.set(start.x + (dx / length) * END, 0, start.z + (dz / length) * END);
    group.rotation.y = -Math.atan2(dz, dx);
    this.spans.add(group);
    const made = { count, group, mesh };
    this.bridges.set(edge, made);
    return made;
  }
  protected subject(aspect: number): TableSubject {
    return bridgesSubject(this.size || 7, aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    return state.islands.map((island) => ({ ...cellAt(state.size, island.cell), y: ISLAND_TOP, r: CELL * 0.5, point: island.cell }));
  }
  protected place(state: State) {
    this.lay(state);
    state.edges.forEach((e, i) => {
      const count = state.bridges[i];
      if (this.bridges.get(i)?.count !== count) {
        this.unbuild(i);
        if (count) this.build(state, i, count, e.a);
      }
      const shown = this.bridges.get(i);
      if (shown) {
        shown.group.scale.set(1, 1, 1);
        shown.group.position.y = 0;
      }
    });
    for (const island of state.islands) {
      const plate = this.plates.get(island.cell);
      if (!plate) continue;
      plate.face.material = this.face(island.need, state.winner === 0 ? "win" : islandState(state, island.cell));
      plate.group.scale.set(1, 1, 1);
      plate.group.position.y = 0;
    }
  }
  protected animate(before: State, state: State) {
    const edge = state.last,
      grew = edge !== null && state.ply === before.ply + 1 && state.bridges[edge] > before.bridges[edge],
      won = state.winner === 0 && before.winner === null;
    if (!grew && !won) return false;
    let made: Built | null = null;
    if (grew) {
      // A first bridge runs out from the island it was laid from (the one picked first, or the drag's start).
      const e = state.edges[edge!],
        from = [this.launch, this.marks.selected].find((cell) => cell === e.a || cell === e.b) ?? e.a;
      this.unbuild(edge!);
      made = this.build(state, edge!, state.bridges[edge!], from);
    }
    this.place(state);
    let delay = 0;
    if (made) {
      const bridge = made,
        first = before.bridges[edge!] === 0;
      // A second comes down beside where the first lay, the pair together.
      if (first) bridge.group.scale.set(0.02, 1, 1);
      else bridge.group.position.y = 0.3;
      delay = first ? 260 : 300;
      this.tween(0, delay, (p) => {
        if (first) bridge.group.scale.x = Math.max(0.02, 1 - (1 - p) ** 3);
        else bridge.group.position.y = 0.3 * fall(p);
        if (p === 1) this.onContact();
      });
    }
    if (won) {
      // Solved: every plate glows green, and they bob up one after another, outward from the bridge laid last.
      const e = edge !== null ? state.edges[edge] : null,
        centre = e ? cellAt(state.size, e.a) : { x: 0, z: 0 },
        order = state.islands.flatMap((island) => {
          const p = cellAt(state.size, island.cell),
            plate = this.plates.get(island.cell);
          return plate ? [{ plate: plate.group, wait: Math.min(0.6, Math.hypot(p.x - centre.x, p.z - centre.z) * 0.06) }] : [];
        });
      this.tween(delay, 1200, (p) => {
        for (const { plate, wait } of order) {
          const q = Math.max(0, Math.min(1, (p - wait) / 0.4)),
            bump = Math.sin(Math.PI * q);
          plate.scale.setScalar(1 + bump * 0.22);
          plate.position.y = bump * 0.07;
        }
      });
    }
    return true;
  }
  /**
   * The island a drag from `from` would end on, released at `at`: the island under it if it is a neighbour, else
   * the neighbour on that line when the release is nearer it than its start; only where the bridges between them
   * may change (a first bridge is not laid over another).
   */
  private aimFrom(from: number, at: { x: number; z: number }) {
    const state = this.state;
    if (!state) return null;
    const found = this.nearest(state, from, at),
      edge = found === null ? -1 : edgeBetween(state, from, found);
    return edge >= 0 && (state.bridges[edge] > 0 || !blocked(state, edge)) ? found : null;
  }
  private nearest(state: State, from: number, at: { x: number; z: number }) {
    const n = state.size,
      origin = cellAt(n, from);
    let under: number | null = null,
      nearest = CELL * 0.55;
    for (const island of state.islands) {
      const p = cellAt(n, island.cell),
        d = Math.hypot(p.x - at.x, p.z - at.z);
      if (d < nearest) {
        nearest = d;
        under = island.cell;
      }
    }
    if (under !== null) return under !== from && edgeBetween(state, from, under) >= 0 ? under : null;
    const dx = at.x - origin.x,
      dz = at.z - origin.z,
      across = Math.abs(dx) >= Math.abs(dz);
    for (const e of state.edges) {
      if (e.a !== from && e.b !== from) continue;
      const other = e.a === from ? e.b : e.a,
        p = cellAt(n, other),
        ox = p.x - origin.x,
        oz = p.z - origin.z;
      if ((Math.abs(ox) > Math.abs(oz)) !== across) continue;
      const distance = Math.hypot(ox, oz),
        along = (dx * ox + dz * oz) / distance,
        aside = Math.abs(dx * oz - dz * ox) / distance;
      if (along > distance / 2 && along <= distance + CELL * 0.6 && aside <= CELL * 0.6) return other;
    }
    return null;
  }
  protected dragStart(point: number, at: { x: number; y: number; z: number }) {
    const state = this.state;
    if (!state || state.winner !== null || point < 0 || !state.islands.some((island) => island.cell === point)) return false;
    this.drag = { from: point, x: at.x, z: at.z, to: null };
    return true;
  }
  protected dragMove(at: { x: number; y: number; z: number }) {
    const drag = this.drag;
    if (!drag) return;
    const moved = Math.hypot(at.x - drag.x, at.z - drag.z) >= CELL * 0.3;
    drag.to = moved ? this.aimFrom(drag.from, at) : null;
    this.mark(this.marks);
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const drag = this.drag;
    this.drag = null;
    this.mark(this.marks);
    if (!drag || !at || !this.state) return;
    // Let go about where it was pressed, it is a tap: the screen's own choosing of one island and then another.
    if (Math.hypot(at.x - drag.x, at.z - drag.z) < CELL * 0.3) return this.onPick(drag.from);
    const to = this.aimFrom(drag.from, at);
    if (to === null) return;
    // Kept while the screen plays the move, so that the bridge runs out from where the drag began.
    this.launch = drag.from;
    this.onMove({ from: drag.from, to, extra: -1 });
    this.launch = null;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const n = state.size,
      cells = n * n,
      ring = (mesh: T.Mesh, point: number | null | undefined) => {
        mesh.visible = point !== null && point !== undefined && point >= 0 && point < cells;
        if (mesh.visible) {
          const p = cellAt(n, point!);
          mesh.position.set(p.x, 0.012, p.z);
        }
      };
    const drag = this.drag;
    ring(this.chosen, drag ? drag.from : marks.selected);
    this.aims.forEach((mesh, i) => ring(mesh, drag ? null : marks.targets[i]));
    ring(this.preview, drag?.to ?? null);
    ring(this.cursor, marks.cursor);
    // A hint: gold rings on the two islands of its edge and a gold line on the water between them.
    const hinted = marks.hint ? setOf(marks.hint) : null,
      e = hinted && hinted.edge < state.edges.length && !drag ? state.edges[hinted.edge] : null;
    ring(this.hints[0], e ? e.a : null);
    ring(this.hints[1], e ? e.b : null);
    this.strip.visible = !!e;
    if (e) {
      const a = cellAt(n, e.a),
        b = cellAt(n, e.b),
        length = Math.hypot(b.x - a.x, b.z - a.z) - 1.1;
      this.strip.position.set((a.x + b.x) / 2, 0.012, (a.z + b.z) / 2);
      this.strip.scale.set(Math.max(0.05, length), 1, 1);
      this.strip.rotation.z = e.across ? 0 : Math.PI / 2;
    }
    this.redraw();
  }
  /** The drift of the small waves, while the table waits. */
  private idle = (now: number) => {
    if (this.disposed) return;
    this.clock = requestAnimationFrame(this.idle);
    if (!this.waves.length) return;
    const t = now / 1000;
    for (const wave of this.waves) wave.offset.set((t * 0.012) % 1, (t * 0.008) % 1);
    this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.clock);
    for (const edge of [...this.bridges.keys()]) this.unbuild(edge);
    super.dispose();
  }
}
