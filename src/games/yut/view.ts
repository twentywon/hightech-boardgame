import * as T from "three";
import { afterGPUFrame, aim, wood, realism, block, glossy, hop, travel, fitCanvas } from "../../engine/scene-utils";
import { FOV, SUBJECTS, cameraDistance } from "../../engine/camera";
import { hanokYard } from "../../engine/scenery";
import { FINISHED, PIECES, WAITING } from "./rules";
import {
  STICK,
  TOKEN,
  boardTexture,
  emblemTexture,
  ropeTexture,
  standOff,
  stickBack,
  stickFace,
  stickGeometry,
  strawMaterial,
  tokenGeometry,
} from "./props";
import { zoomable } from "../../engine/zoom";

/** What the yard shows. The view draws stations; it knows no rules. */
export interface YardModel {
  /** Stations of each player's pieces: two to four players. */
  pieces: number[][];
  /** True where a stick lies flat side up. */
  sticks: boolean[];
  /** Changes with every throw, so a redraw is not mistaken for one. */
  throwId: number;
  /** Changes with every move; `walk` is the road the moved pieces took. */
  moveId: number;
  walk: { player: number; from: number; path: number[] } | null;
}
export interface Marks {
  /** Stations (or `WAITING`) holding pieces that may be picked up. */
  movable: number[];
  selected: number | null;
  /** Stations (or `FINISHED`) the selected pieces may go to. */
  targets: number[];
  turn: number;
  /** The sticks may be tapped to throw them. */
  canThrow?: boolean;
}

// Everything is laid out round the origin; the board sits a little toward the house.
const BOARD_Z = 0.25,
  REACH = 2.5,
  STEP = (REACH * 2) / 5,
  THROW_Z = 4.35,
  WAIT_X = 3.0,
  HOME_Z = -3.0,
  PIECE_H = TOKEN.height,
  /** The top of the board, which stands a little proud of the mat. */
  BOARD_TOP = 0.055,
  BOARD_SIZE = REACH * 2 + 1.1,
  /** How high a stick lying still stands, either way up. */
  STICK_REST = STICK.height / 2 + 0.002;
/** Blue, red, green and yellow: one colour a player. */
export const COLORS = ["#2f5fa8", "#c23b2b", "#2f8a4f", "#d9a521"];
/** Where a player's waiting pieces begin, across the yard: the first two beside the throwing strip, the next two between it and them. */
const waitX = (player: number) => (player % 2 ? 1 : -1) * (player < 2 ? WAIT_X : 1.74);
/** Where a station lies on the ground. */
export function stationAt(station: number): { x: number; z: number } {
  const at = (x: number, z: number) => ({ x, z: z + BOARD_Z });
  if (station <= 5) return at(REACH, REACH - station * STEP);
  if (station <= 10) return at(REACH - (station - 5) * STEP, -REACH);
  if (station <= 15) return at(-REACH, -REACH + (station - 10) * STEP);
  if (station <= 19) return at(-REACH + (station - 15) * STEP, REACH);
  if (station === 22) return at(0, 0);
  // The short roads: 20–21 and 23–24 from corner 5 to corner 15, 25–26 and 27–28 from corner 10 to the start.
  const along = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2 / 3, 1 / 3, 0, -1 / 3, -2 / 3, 2 / 3, 1 / 3, -1 / 3, -2 / 3][station] * REACH;
  return station === 20 || station === 21 || station === 23 || station === 24 ? at(along, -along) : at(-along, -along);
}
/** The spot beyond the start where pieces leave the board. */
export const EXIT = { x: REACH + 0.95, z: REACH + BOARD_Z };
/** Where a player's waiting or finished pieces are set down. */
function restAt(player: number, index: number, finished: boolean) {
  const side = player % 2 ? 1 : -1;
  return finished
    ? // Pieces that are home stand in a line beside the board; the third and fourth players' below the first two's.
      { x: side * (REACH + 0.95), z: HOME_Z + (index + (player < 2 ? 0 : PIECES)) * 0.62 }
    : { x: waitX(player) + side * (index % 2) * 0.62, z: THROW_Z - 0.35 + Math.floor(index / 2) * 0.62 };
}
interface Tween {
  object: T.Object3D;
  start: number;
  duration: number;
  /** Points visited in order; one hop between each pair. */
  points: T.Vector3[];
  hop: number;
  contact: boolean;
  /** A motion of its own, told the time since its start (a thrown stick); `points` then holds only where it ends. */
  motion?: (ms: number) => void;
  /** When it strikes the mat, and how hard (0 to 1), for the sound. */
  strikes?: { at: number; strength: number }[];
  heard?: number;
}
const X = new T.Vector3(1, 0, 0),
  Y = new T.Vector3(0, 1, 0);

/** A yut board on a straw mat in the yard of a Korean house. */
export class YutView {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 90);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private owned: { dispose(): void }[] = [];
  private pieces: T.Group[][] = COLORS.map(() => []);
  private sticks: T.Group[] = [];
  private stickYaw = [0.2, -0.3, 0.1, -0.15];
  /** Where each stick came to rest after the last throw. */
  private stickAt = [-0.93, -0.31, 0.31, 0.93].map((x) => ({ x, z: THROW_Z }));
  private rings = new T.Group();
  private ringGeometry: T.RingGeometry;
  private ringMaterials: T.MeshBasicMaterial[];
  private tweens: Tween[] = [];
  private model: YardModel | null = null;
  private marks: Marks = { movable: [], selected: null, targets: [], turn: 0 };
  private ray = new T.Raycaster();
  private ground = new T.Plane(new T.Vector3(0, 1, 0), 0);
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  /** A stick or a piece touched the ground. */
  onContact: (stick: boolean, strength?: number) => void = () => {};
  /** Every animation has finished. */
  onSettled: () => void = () => {};
  /** The sticks were tapped while they may be thrown. */
  onThrow: () => void = () => {};
  /** A station, a waiting place (`WAITING`) or the exit (`FINISHED`) was tapped. */
  onPick: (station: number) => void = () => {};
  get animating() {
    return this.tweens.length > 0;
  }
  get ready() {
    return this.readyFlag;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  private standard(options: T.MeshStandardMaterialParameters) {
    return this.own(new T.MeshStandardMaterial({ roughness: 0.85, ...options }));
  }
  private add(geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = true) {
    const mesh = new T.Mesh(this.own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
  ) {
    this.renderer = zoomable(new T.WebGLRenderer({ antialias: true, alpha: false }));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#b89a6c");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    // Every action is also a button beside the yard; the canvas is a shortcut.
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    // Afternoon sun over the roof.
    this.scene.add(new T.HemisphereLight("#fff3da", "#6b5335", 1.7));
    const sun = new T.DirectionalLight("#ffe9c4", 2.1);
    sun.position.set(-5, 10, -3);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -9;
    sun.shadow.camera.right = 9;
    sun.shadow.camera.top = 9;
    sun.shadow.camera.bottom = -9;
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    realism(this.renderer, this.scene);
    this.buildYard();
    this.ringGeometry = this.own(new T.RingGeometry(0.33, 0.43, 40));
    this.ringMaterials = ["#f4d06a", "#ffffff", "#7fe0a2", "#e3261c"].map((color) =>
      this.own(new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, depthWrite: false })),
    );
    this.scene.add(this.rings);
    // Pieces: turned wood lacquered in each player's colour, a brass ring set in the groove round the waist and an
    // emblem of mother-of-pearl inlaid in the top (cloud, plum blossom, bamboo, moon), so that they differ by shape too.
    const body = this.own(tokenGeometry()),
      band = this.own(new T.TorusGeometry(0.251, 0.0075, 6, 40)),
      inlay = this.own(new T.CircleGeometry(0.15, 40)),
      brass = this.own(glossy({ color: "#c8a04c", roughness: 0.3, metalness: 0.85 }, 0.6));
    band.rotateX(Math.PI / 2);
    band.translate(0, 0.062 - PIECE_H / 2, 0);
    body.translate(0, -PIECE_H / 2, 0);
    inlay.rotateX(-Math.PI / 2);
    inlay.translate(0, PIECE_H / 2 + 0.0015, 0);
    COLORS.forEach((color, player) => {
      const lacquer = this.own(glossy({ color, roughness: 0.38 }, 0.8)),
        pearl = this.own(
          new T.MeshStandardMaterial({
            map: this.own(emblemTexture(player)),
            transparent: true,
            alphaTest: 0.4,
            roughness: 0.25,
            metalness: 0.15,
            emissive: "#2a2626",
            polygonOffset: true,
            polygonOffsetFactor: -2,
          }),
        );
      for (let i = 0; i < PIECES; i++) {
        const piece = new T.Group(),
          wood = new T.Mesh(body, lacquer),
          ring = new T.Mesh(band, brass),
          top = new T.Mesh(inlay, pearl);
        wood.castShadow = wood.receiveShadow = true;
        piece.add(wood, ring, top);
        const rest = restAt(player, i, false);
        piece.position.set(rest.x, PIECE_H / 2, rest.z);
        this.pieces[player].push(piece);
        this.scene.add(piece);
      }
    });
    // Sticks: lengths of birch split in two, the rounded back burnt with crosses, the flat face sanded pale; the first
    // carries the red spot of 빽도.
    const stick = this.own(stickGeometry());
    for (let i = 0; i < 4; i++) {
      const back = this.own(glossy({ map: this.own(stickBack(11 + i)), roughness: 0.55 }, 0.25)),
        face = this.standard({ map: this.own(stickFace(i === 0, 31 + i)), roughness: 0.7 }),
        group = new T.Group(),
        mesh = new T.Mesh(stick, [back, face]);
      mesh.castShadow = mesh.receiveShadow = true;
      group.add(mesh);
      this.sticks.push(group);
      this.scene.add(group);
    }
    this.placeSticks([false, false, false, false], true);
    const canvas = this.renderer.domElement;
    let down: { pointer: number; x: number; y: number } | null = null;
    canvas.addEventListener("pointerdown", (e) => {
      down = e.pointerType === "mouse" && e.button !== 0 ? null : { pointer: e.pointerId, x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener("pointerup", (e) => {
      const tap = down;
      down = null;
      if (this.disposed || this.animating || tap?.pointer !== e.pointerId) return;
      if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 12) return;
      const station = this.stationUnder(e);
      if (station !== null) this.onPick(station);
      else if (this.marks.canThrow && this.overSticks()) this.onThrow();
    });
    canvas.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse" || this.animating) return;
      const station = this.stationUnder(e),
        live = station !== null && (this.marks.movable.includes(station) || this.marks.targets.includes(station));
      canvas.style.cursor = live || (station === null && this.marks.canThrow && this.overSticks()) ? "pointer" : "";
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const moved = this.step(performance.now());
      if (!this.dirty && !moved) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      if (!this.readyFlag && !this.cancelReady)
        this.cancelReady = afterGPUFrame(this.renderer, () => {
          this.readyFlag = true;
          this.renderer.domElement.dataset.ready = "true";
        });
    };
    this.raf = requestAnimationFrame(loop);
  }
  /** The yard: earth, the straw mat (멍석) with its rope rim, the painted board on it, and the house behind. */
  private buildYard() {
    hanokYard(this.scene, (resource) => this.own(resource));
    const MAT_W = 8.6,
      MAT_D = 10.2,
      MAT_Z = 0.55;
    const straw = strawMaterial(MAT_W / 4.2, MAT_D / 4.2, (r) => this.own(r));
    this.own(straw);
    const mat = this.add(block(MAT_W, 0.05, MAT_D, 0.02), straw, 0, -0.026, MAT_Z, false);
    mat.receiveShadow = true;
    // A rope of twisted straw bound round the mat's edge.
    const rope = this.standard({ map: this.own(ropeTexture()), roughness: 1 }),
      rim = new T.CurvePath<T.Vector3>(),
      x = MAT_W / 2 - 0.05,
      z0 = MAT_Z - MAT_D / 2 + 0.05,
      z1 = MAT_Z + MAT_D / 2 - 0.05,
      y = 0.0,
      corner = 0.25;
    const pts: [number, number][] = [
      [-x + corner, z0],
      [x - corner, z0],
      [x, z0 + corner],
      [x, z1 - corner],
      [x - corner, z1],
      [-x + corner, z1],
      [-x, z1 - corner],
      [-x, z0 + corner],
    ];
    for (let k = 0; k < pts.length; k++) {
      const [ax, az] = pts[k],
        [bx, bz] = pts[(k + 1) % pts.length];
      if (k % 2 === 0) rim.add(new T.LineCurve3(new T.Vector3(ax, y, az), new T.Vector3(bx, y, bz)));
      // The corners are rounded: a curve drawn toward the corner of the mat.
      else rim.add(new T.QuadraticBezierCurve3(new T.Vector3(ax, y, az), new T.Vector3(k === 1 || k === 3 ? x : -x, y, k === 1 || k === 7 ? z0 : z1), new T.Vector3(bx, y, bz)));
    }
    const ropeMap = rope.map!;
    ropeMap.repeat.set(160, 1);
    const tube = this.add(new T.TubeGeometry(rim, 400, 0.06, 8, true), rope, 0, 0, 0, false);
    tube.receiveShadow = true;
    // The board: a slab of pale wood, its face painted, its edges rounded and darker.
    const scale = 2048 / BOARD_SIZE,
      face = this.own(
        new T.MeshStandardMaterial({
          map: this.own(
            boardTexture({
              size: 2048,
              scale,
              at: (station) => {
                const p = stationAt(station);
                return [1024 + p.x * scale, 1024 + (p.z - BOARD_Z) * scale] as const;
              },
            }),
          ),
          roughness: 0.72,
        }),
      ),
      edge = this.standard({ map: this.own(wood(false, 0.7)), color: "#a8784a", roughness: 0.6 }),
      slab = this.add(block(BOARD_SIZE, BOARD_TOP, BOARD_SIZE, 0.035), [edge, edge, face, edge, edge, edge], 0, BOARD_TOP / 2 - 0.001, BOARD_Z);
    slab.castShadow = true;
    this.buildProps(rope.map!);
  }
  /**
   * Beside the mat: a low round table (소반) with two brass bowls of 식혜 at the right, and a straw basket of
   * chestnuts at the left, both clear of the mat and of every place a piece or a stick may lie.
   */
  private buildProps(straw: T.Texture) {
    const lacquer = this.own(glossy({ map: this.own(wood(false, 0.8)), color: "#b0623a", roughness: 0.42 }, 0.5)),
      brass = this.own(glossy({ color: "#c79a45", roughness: 0.28, metalness: 0.9 }, 0.4)),
      drink = this.standard({ color: "#efe3c6", roughness: 0.2 }),
      table = new T.Group();
    const top = new T.Mesh(this.own(new T.CylinderGeometry(0.78, 0.74, 0.07, 40)), lacquer);
    top.position.y = 0.5;
    const rim = new T.Mesh(this.own(new T.TorusGeometry(0.77, 0.025, 8, 48)), lacquer);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.535;
    const skirt = new T.Mesh(this.own(new T.CylinderGeometry(0.66, 0.66, 0.1, 40, 1, true)), lacquer);
    skirt.position.y = 0.42;
    table.add(top, rim, skirt);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4,
        leg = new T.Mesh(this.own(block(0.07, 0.46, 0.16, 0.02)), lacquer);
      leg.position.set(Math.cos(a) * 0.6, 0.23, Math.sin(a) * 0.6);
      leg.rotation.y = -a;
      // A dog's leg (구족반): splayed a little at the foot.
      leg.rotation.z = 0.12 * Math.sign(Math.cos(a));
      table.add(leg);
    }
    const ring = new T.Mesh(this.own(new T.TorusGeometry(0.6, 0.02, 6, 40)), lacquer);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    table.add(ring);
    const bowl = this.own(
      new T.LatheGeometry(
        [
          [0, 0],
          [0.09, 0],
          [0.1, 0.02],
          [0.13, 0.03],
          [0.2, 0.08],
          [0.22, 0.16],
          [0.215, 0.165],
          [0.19, 0.09],
          [0.12, 0.05],
          [0, 0.05],
        ].map(([r, y]) => new T.Vector2(r, y)),
        32,
      ),
    );
    for (const [x, z] of [
      [-0.26, 0.12],
      [0.24, -0.16],
    ]) {
      const b = new T.Mesh(bowl, brass),
        d = new T.Mesh(this.own(new T.CircleGeometry(0.2, 28)), drink);
      b.position.set(x, 0.535, z);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.535 + 0.13, z);
      b.castShadow = true;
      table.add(b, d);
    }
    // A wooden spoon laid across.
    const spoon = new T.Mesh(this.own(block(0.5, 0.02, 0.05, 0.01)), lacquer);
    spoon.position.set(0.1, 0.545, 0.32);
    spoon.rotation.y = 0.5;
    table.add(spoon);
    table.traverse((o) => {
      if (o instanceof T.Mesh) o.castShadow = o.receiveShadow = true;
    });
    table.position.set(5.75, -0.02, 0.9);
    this.scene.add(table);
    // The basket: woven straw, shallow, heaped with chestnuts.
    const weave = straw.clone();
    this.own(weave);
    weave.needsUpdate = true;
    weave.repeat.set(12, 2);
    const basketMaterial = this.standard({ map: weave, color: "#e2c48a", roughness: 1, side: T.DoubleSide }),
      basket = new T.Mesh(
        this.own(
          new T.LatheGeometry(
            [
              [0, 0.02],
              [0.4, 0.02],
              [0.62, 0.12],
              [0.74, 0.3],
              [0.78, 0.34],
              [0.74, 0.33],
            ].map(([r, y]) => new T.Vector2(r, y)),
            36,
          ),
        ),
        basketMaterial,
      );
    basket.castShadow = basket.receiveShadow = true;
    basket.position.set(-5.7, -0.02, 1.7);
    this.scene.add(basket);
    const shell = this.own(glossy({ color: "#5a2e18", roughness: 0.35 }, 0.6)),
      nut = this.own(new T.SphereGeometry(0.075, 12, 9)),
      count = 34,
      nuts = new T.InstancedMesh(nut, shell, count),
      m = new T.Matrix4(),
      q = new T.Quaternion(),
      rand = (() => {
        let seed = 41;
        return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
      })();
    for (let k = 0; k < count; k++) {
      const a = rand() * Math.PI * 2,
        r = Math.sqrt(rand()) * 0.55,
        heap = 0.3 - r * 0.25;
      q.setFromEuler(new T.Euler(rand() * 3, rand() * 3, rand() * 3));
      m.compose(new T.Vector3(-5.7 + Math.cos(a) * r, heap + rand() * 0.04, 1.7 + Math.sin(a) * r), q, new T.Vector3(1, 0.85, 1.1));
      nuts.setMatrixAt(k, m);
    }
    nuts.castShadow = true;
    this.scene.add(nuts);
  }
  /** True when the last aimed ray meets the strip where the sticks lie. */
  private overSticks() {
    const hit = new T.Vector3();
    return (
      !!this.ray.ray.intersectPlane(this.ground, hit) &&
      Math.abs(hit.x) < 2.1 &&
      Math.abs(hit.z - THROW_Z) < 1.0
    );
  }
  private stationUnder(e: PointerEvent): number | null {
    aim(this.ray, e, this.renderer.domElement, this.camera);
    const hit = new T.Vector3();
    if (!this.ray.ray.intersectPlane(this.ground, hit)) return null;
    let best: number | null = null,
      nearest = 0.5;
    for (let s = 0; s < 29; s++) {
      const p = stationAt(s),
        d = Math.hypot(p.x - hit.x, p.z - hit.z);
      if (d < nearest) {
        nearest = d;
        best = s;
      }
    }
    if (best !== null) return best;
    if (Math.hypot(EXIT.x - hit.x, EXIT.z - hit.z) < 0.55) return FINISHED;
    // The waiting places lie beside the throwing strip, one on each side.
    const turn = this.marks.turn,
      middle = waitX(turn) + (turn % 2 ? 0.31 : -0.31);
    return Math.abs(hit.z - THROW_Z) < 0.95 && Math.abs(hit.x - middle) < (turn < 2 ? 0.75 : 0.62) ? WAITING : null;
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    fitCanvas(this.renderer, w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const subject = SUBJECTS.yut,
      distance = cameraDistance(this.camera.aspect, false, subject);
    this.camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Where each piece of `model` rests: stacked on its station, waiting, or home. */
  private places(model: YardModel) {
    return model.pieces.map((stations, player) => {
      let waiting = 0,
        home = 0;
      return stations.map((station, i) => {
        if (station === WAITING || station === FINISHED) {
          const rest = restAt(player, station === WAITING ? waiting++ : home++, station === FINISHED);
          return new T.Vector3(rest.x, PIECE_H / 2, rest.z);
        }
        const p = stationAt(station),
          below = stations.slice(0, i).filter((s) => s === station).length;
        return new T.Vector3(p.x, BOARD_TOP + PIECE_H / 2 + below * (PIECE_H + 0.006), p.z);
      });
    });
  }
  private stickTurn(i: number, flat: boolean) {
    return new T.Quaternion()
      .setFromAxisAngle(Y, this.stickYaw[i])
      .multiply(new T.Quaternion().setFromAxisAngle(X, flat ? Math.PI : 0));
  }
  private stickSpot(i: number) {
    return new T.Vector3(this.stickAt[i].x, STICK_REST, this.stickAt[i].z);
  }
  /**
   * Scatters the four sticks for a throw: each turned its own way, none lying on another, all within the throwing
   * strip and clear of the waiting pieces (nearer with three or four players).
   */
  private scatter(players: number) {
    const half = STICK.length / 2 + 0.03,
      wide = STICK.width + 0.03,
      reach = players > 2 ? 1.42 : 2.0,
      corners = (x: number, z: number, yaw: number) => {
        // Lying along x when unturned; a turn of `yaw` about the upright.
        const c = Math.cos(yaw),
          s = Math.sin(yaw);
        return [
          [half, wide],
          [half, -wide],
          [-half, -wide],
          [-half, wide],
        ].map(([a, b]) => [x + a * c + b * s, z - a * s + b * c] as const);
      },
      apart = (p: readonly (readonly [number, number])[], q: readonly (readonly [number, number])[]) => {
        // Two rectangles are apart when some side of one has the other wholly beyond it.
        for (const shape of [p, q])
          for (let k = 0; k < 4; k++) {
            const [ax, az] = shape[k],
              [bx, bz] = shape[(k + 1) % 4],
              nx = bz - az,
              nz = ax - bx,
              side = (pt: readonly [number, number]) => (pt[0] - ax) * nx + (pt[1] - az) * nz,
              own = side(shape[(k + 2) % 4]) > 0,
              other = shape === p ? q : p;
            if (other.every((pt) => side(pt) > 0 !== own)) return true;
          }
        return false;
      };
    for (let attempt = 0; attempt < 60; attempt++) {
      const placed: { x: number; z: number; yaw: number; shape: ReturnType<typeof corners> }[] = [];
      for (let i = 0; i < 4 && placed.length === i; i++)
        for (let k = 0; k < 80; k++) {
          const yaw = (Math.random() - 0.5) * Math.PI,
            x = (Math.random() - 0.5) * 2 * reach,
            z = THROW_Z + (Math.random() - 0.5) * 1.1,
            shape = corners(x, z, yaw);
          if (shape.some(([px, pz]) => Math.abs(px) > reach || pz < THROW_Z - 0.92 || pz > THROW_Z + 0.98)) continue;
          if (placed.some((other) => !apart(other.shape, shape))) continue;
          placed.push({ x, z, yaw, shape });
          break;
        }
      if (placed.length < 4) continue;
      // Left to right, so that each stick's flight crosses the others' as little as may be.
      placed.sort((a, b) => a.x - b.x);
      placed.forEach((p, i) => {
        this.stickAt[i] = { x: p.x, z: p.z };
        this.stickYaw[i] = p.yaw;
      });
      return;
    }
    // Rarely nothing fits: a row, each turned a little.
    for (let i = 0; i < 4; i++) {
      this.stickAt[i] = { x: (i - 1.5) * 0.46, z: THROW_Z + (i % 2 ? 0.2 : -0.2) };
      this.stickYaw[i] = Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    }
  }
  /**
   * A stick's throw, worked out as a thrown thing moves: tossed up from the near side, it falls under gravity, strikes
   * the mat and bounces twice, lower each time (its spin about its length and its turn slowing at every strike), then
   * skids to a stop and rocks on its rounded back until it lies still exactly as `to`, with its flat face up if `flat`.
   * Its height at every moment keeps its lowest edge on or above the mat, whichever way it is turned.
   */
  private toss(stick: T.Group, i: number, to: T.Vector3, flat: boolean, start: number): Tween {
    const r = Math.random,
      G = 30,
      yawEnd = this.stickYaw[i],
      rollEnd = flat ? Math.PI : 0,
      // Where it strikes: short of its place toward the thrower, then nearer, then nearly there.
      hits = [
        new T.Vector3(to.x + (r() - 0.5) * 0.7, 0, to.z + 0.6 + r() * 0.35),
        new T.Vector3(to.x + (r() - 0.5) * 0.3, 0, to.z + 0.22 + r() * 0.1),
        new T.Vector3(to.x + (r() - 0.5) * 0.08, 0, to.z + 0.06),
      ],
      from = new T.Vector3((i - 1.5) * 0.28 + (r() - 0.5) * 0.2, 0.75, THROW_Z + 2.3),
      apex = 1.7 + r() * 0.5;
    // The flights: up and down to the first strike, then two bounces whose height the strike leaves them.
    const up = Math.sqrt((2 * (apex - from.y)) / G),
      down = Math.sqrt((2 * apex) / G),
      v1 = G * down,
      v2 = v1 * (0.3 + r() * 0.06),
      v3 = v2 * 0.3,
      flights = [up + down, (2 * v2) / G, (2 * v3) / G],
      skid = 0.34,
      strikes = [flights[0], flights[0] + flights[1], flights[0] + flights[1] + flights[2]],
      duration = strikes[2] + skid;
    // Spin about its length: fast in the air, slower after each strike, nothing left when it settles.
    const turns = 2 + Math.floor(r() * 2) + (r() < 0.5 ? 0.5 : 0),
      sense = r() < 0.5 ? 1 : -1,
      share = [1, 0.4, 0.15],
      weight = flights.reduce((n, t, k) => n + t * share[k], 0),
      omega = (turns * Math.PI * 2) / weight,
      yawSwing = (r() - 0.5) * 2.6,
      pitch = (r() - 0.5) * 0.9,
      rock = (0.18 + r() * 0.12) * (r() < 0.5 ? 1 : -1);
    // How much spin is still to come at time `t`, about the length and about the upright.
    const left = (t: number) => {
      let rest = 0;
      for (let k = 2; k >= 0; k--) {
        const t0 = k ? strikes[k - 1] : 0,
          t1 = strikes[k];
        if (t >= t1) break;
        rest += (t1 - Math.max(t, t0)) * omega * share[k];
      }
      return rest;
    };
    const total = left(0),
      qYaw = new T.Quaternion(),
      qPitch = new T.Quaternion(),
      qRoll = new T.Quaternion(),
      Z = new T.Vector3(0, 0, 1);
    const pose = (t: number) => {
      t = Math.min(duration, Math.max(0, t));
      const spinLeft = left(t);
      let roll = rollEnd + sense * spinLeft,
        yaw = yawEnd + yawSwing * (0.25 + (spinLeft / total) * 0.75),
        tilt = 0;
      const p = new T.Vector3();
      if (t < strikes[2]) {
        const k = t < strikes[0] ? 0 : t < strikes[1] ? 1 : 2,
          t0 = k ? strikes[k - 1] : 0,
          tau = t - t0,
          T0 = flights[k],
          a = k ? hits[k - 1] : from,
          b = hits[k];
        // Across the ground it goes evenly; up and down as gravity says.
        p.lerpVectors(a, b, tau / T0);
        const y0 = k ? 0 : from.y,
          vy = (0 - y0 + (G * T0 * T0) / 2) / T0;
        p.y = y0 + vy * tau - (G * tau * tau) / 2;
        // The stick also tips end over end a little in the air, less after each strike.
        tilt = pitch * [1, 0.35, 0.08][k] * Math.sin((Math.PI * tau) / T0);
      } else {
        // The skid: slowing evenly to its place, rocking on its back with less swing each time.
        const tau = t - strikes[2],
          q = tau / skid,
          slow = q * (2 - q);
        p.lerpVectors(hits[2], to, slow);
        p.y = 0;
        roll += rock * Math.exp(-tau / 0.09) * Math.sin(tau * 38) * (1 - q);
        yaw += yawSwing * 0.25 * (1 - slow);
      }
      // Never through the mat: the lowest edge, as it is turned and tipped, stays on it.
      const ground = standOff(roll) * Math.cos(tilt) + (STICK.length / 2) * Math.abs(Math.sin(tilt)) + 0.002;
      p.y = Math.max(p.y + ground, ground);
      stick.position.copy(p);
      qYaw.setFromAxisAngle(Y, yaw);
      qPitch.setFromAxisAngle(Z, tilt);
      qRoll.setFromAxisAngle(X, roll);
      stick.quaternion.copy(qYaw).multiply(qPitch).multiply(qRoll);
    };
    pose(0);
    return {
      object: stick,
      start,
      duration: duration * 1000,
      points: [to],
      hop: 0,
      contact: false,
      motion: (ms) => pose(ms / 1000),
      strikes: strikes.map((t, k) => ({ at: t * 1000, strength: [1, 0.6, 0.3][k] })),
      heard: 0,
    };
  }
  private placeSticks(flats: boolean[], tidy = false) {
    this.sticks.forEach((stick, i) => {
      if (tidy) this.stickYaw[i] = Math.PI / 2 + (i - 1.5) * 0.05;
      stick.position.copy(tidy ? new T.Vector3((i - 1.5) * 0.42, STICK_REST, THROW_Z) : this.stickSpot(i));
      stick.quaternion.copy(this.stickTurn(i, flats[i]));
    });
  }
  /**
   * Shows `model`. A new throw tosses the sticks; a new move walks the moved
   * pieces along their road, and every other piece slides to its place.
   */
  sync(model: YardModel, animate = true) {
    if (this.disposed) return;
    const before = this.model,
      thrown = !!before && model.throwId !== before.throwId,
      walked = !!before && model.moveId !== before.moveId && !!model.walk,
      quick = !animate || this.reducedMotion,
      now = performance.now();
    this.model = model;
    this.dirty = true;
    this.finish();
    if (thrown || (!before && model.throwId > 0)) {
      this.scatter(model.pieces.length);
      this.sticks.forEach((stick, i) => {
        const to = this.stickSpot(i),
          toTurn = this.stickTurn(i, model.sticks[i]);
        if (quick || !thrown) {
          stick.position.copy(to);
          stick.quaternion.copy(toTurn);
        } else this.tweens.push(this.toss(stick, i, to, model.sticks[i], now + i * 40));
      });
    } else if (model.throwId === 0 && (!before || before.throwId !== 0)) this.placeSticks(model.sticks, true);
    // Only the players at the table have pieces out.
    this.pieces.forEach((list, player) => list.forEach((mesh) => (mesh.visible = player < model.pieces.length)));
    const places = this.places(model);
    let delay = 0;
    places.forEach((spots, player) =>
      spots.forEach((to, i) => {
        const mesh = this.pieces[player][i];
        if (quick) {
          mesh.position.copy(to);
          return;
        }
        if (mesh.position.distanceToSquared(to) < 1e-6) return;
        const walk = walked && model.walk!.player === player && model.pieces[player][i] === model.walk!.path.at(-1) && before!.pieces[player][i] === model.walk!.from ? model.walk! : null;
        if (walk) {
          const points = [mesh.position.clone()];
          walk.path.forEach((station, k) => {
            if (k === walk.path.length - 1) points.push(to);
            else {
              const p = stationAt(station);
              points.push(new T.Vector3(p.x, PIECE_H / 2 + BOARD_TOP, p.z));
            }
          });
          this.tweens.push({ object: mesh, start: now, duration: 190 * walk.path.length, points, hop: 0.4, contact: true });
          delay = Math.max(delay, 190 * walk.path.length - 120);
        } else
          this.tweens.push({ object: mesh, start: -1, duration: 420, points: [mesh.position.clone(), to], hop: 0.9, contact: false });
      }),
    );
    // Pieces sent back or restacked leave as the walking piece arrives.
    for (const t of this.tweens) if (t.start === -1) t.start = now + delay;
    this.drawMarks();
    if (!this.tweens.length) this.onSettled();
  }
  setMarks(marks: Marks) {
    this.marks = marks;
    this.drawMarks();
  }
  private drawMarks() {
    if (this.disposed) return;
    this.dirty = true;
    this.rings.clear();
    if (!this.model || this.animating) return;
    const ring = (x: number, z: number, y: number, kind: number, scale = 1) => {
      const mesh = new T.Mesh(this.ringGeometry, this.ringMaterials[kind]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(x, y, z);
      mesh.scale.setScalar(scale);
      mesh.renderOrder = 2;
      this.rings.add(mesh);
    };
    const spot = (station: number) =>
      station === FINISHED
        ? EXIT
        : station === WAITING
          ? { x: waitX(this.marks.turn) + (this.marks.turn % 2 ? 0.31 : -0.31), z: THROW_Z - 0.04 }
          : stationAt(station);
    // Stations lie on the board, which stands a little above the mat.
    const lift = (station: number) => (station === FINISHED || station === WAITING ? 0 : BOARD_TOP);
    for (const station of this.marks.movable) {
      const p = spot(station),
        chosen = station === this.marks.selected;
      ring(p.x, p.z, lift(station) + 0.012, chosen ? 1 : 2, station === WAITING ? 2.1 : 1);
    }
    if (this.marks.canThrow) {
      const mesh = new T.Mesh(this.ringGeometry, this.ringMaterials[0]);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(0, 0.006, THROW_Z);
      mesh.scale.set(5.2, 2.5, 1);
      this.rings.add(mesh);
    }
    for (const station of this.marks.targets) {
      const p = spot(station);
      // Red: gold was lost against the board.
      ring(p.x, p.z, lift(station) + 0.014, 3, station === FINISHED ? 1.25 : 1);
    }
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const ms = now - t.start;
      if (ms < 0) return true;
      if (t.motion) {
        t.motion(Math.min(ms, t.duration));
        const strikes = t.strikes ?? [];
        let heard = t.heard ?? 0;
        for (; heard < strikes.length && ms >= strikes[heard].at; heard++) this.onContact(true, strikes[heard].strength);
        t.heard = heard;
        return ms < t.duration;
      }
      const p = Math.min(1, ms / t.duration),
        legs = t.points.length - 1,
        leg = Math.min(legs - 1, Math.floor(p * legs)),
        local = p * legs - leg;
      // Each step is a hop that comes down and bounces once where it lands.
      t.object.position.lerpVectors(t.points[leg], t.points[leg + 1], travel(local));
      t.object.position.y += hop(local) * t.hop;
      if (p < 1) return true;
      t.object.position.copy(t.points[legs]);
      if (t.contact) this.onContact(false);
      return false;
    });
    if (!this.tweens.length) {
      this.drawMarks();
      this.onSettled();
    }
    return true;
  }
  /** Jumps every running animation to its end. */
  private finish() {
    for (const t of this.tweens) {
      if (t.motion) t.motion(t.duration);
      else t.object.position.copy(t.points[t.points.length - 1]);
    }
    this.tweens = [];
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    for (const resource of this.owned) resource.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
