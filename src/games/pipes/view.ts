import * as T from "three";
import { block, stuff } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { DIRS, E, N, S, SET, W, houses, inlets, leaks, opposite, turnsBetween, unput, type State } from "./rules";

export const PIPES_COLORS: [string, string] = ["#4f9fe0", "#b87333"];
/** A stone's pitch, the side of a slab, how high the slabs' tops stand (the pipes lie on them), a pipe's radius and its middle's height above a slab. */
const CELL = 0.9,
  SLAB = 0.83,
  TOP = 0.12,
  PIPE = 0.062,
  PIPE_Y = PIPE + 0.016,
  ARM = CELL / 2;
/** The height of the slabs' tops, where the pipes lie (browser tests aim there). */
export const TILE_TOP = TOP;
/** The centre of a stone. */
export function cellAt(size: number, index: number) {
  return { x: ((index % size) - (size - 1) / 2) * CELL, z: (Math.floor(index / size) - (size - 1) / 2) * CELL };
}
/** What the camera frames for a garden of `size` (browser tests aim with it too): the paving and its brick edging, the tank's height. */
export function pipesSubject(size: number, aspect: number): TableSubject {
  const half = (size * CELL) / 2 + 0.5;
  return { half: aspect < 1 ? half : half + 0.25, halfZ: half + 0.12, height: 0.78, lookY: 0.05, tilt: 1.2 };
}
/** Which way each end points on the ground, and the turn about the upright that takes a model's +z there. */
const WAY: Record<number, [number, number]> = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };
const ANGLE: Record<number, number> = { [N]: Math.PI, [E]: Math.PI / 2, [S]: 0, [W]: -Math.PI / 2 };
/** House walls and roofs, by turns as the stone's number falls. */
const WALLS = ["#f3e6cf", "#f6d6b4", "#dce8ef", "#f1d2cc", "#e1ebd3", "#f7efda"],
  ROOFS = ["#b4492f", "#8c3a2b", "#3f5f78", "#56683a", "#9a5b2c"];
/** Flower colours for the beds either side. */
const BLOOMS = ["#f06292", "#ffd54f", "#ffffff", "#ba68c8", "#ef5350", "#ff9f43", "#7fa7ff"];
/** A fixed sequence for laying out the garden, so that it is the same each time (browser tests replay it). */
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** A canvas painted once, as a texture. */
function painted(width: number, height: number, paint: (pen: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  paint(canvas.getContext("2d")!);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
/**
 * A back garden seen from above: square paving stones on a gravel bed inside a brick edging, a lawn with flower beds
 * either side, a picket fence behind, stepping stones, a watering can and a hose reel. On every slab lies a length of
 * copper pipe with brass joints; a water tank on legs stands on one near the middle and a little house with a gabled
 * roof at every dead end. Pipes the tank's water reaches are blue and glow, and water pools where an open end
 * meets nothing; once all is joined the water runs along the pipes and the houses' windows light up.
 */
export class PipesView extends TableView<State> {
  private size = 0;
  /** What is laid for a garden's size: the bed, the slabs, the edging and the planting round them. */
  private board = new T.Group();
  private pieces = new T.Group();
  private puddles = new T.Group();
  private cells: { key: string; group: T.Group }[] = [];
  /** What `board` holds that belongs to one size of garden, freed when another is laid. */
  private laid: { dispose(): void }[] = [];
  private parts: Record<string, T.BufferGeometry> = {};
  private paint: Record<string, T.MeshStandardMaterial> = {};
  private slabs: T.MeshStandardMaterial[] = [];
  private walls: T.MeshStandardMaterial[];
  private roofs: T.MeshStandardMaterial[];
  private flow: T.CanvasTexture;
  private cursor: T.Mesh;
  private hintRing: T.Mesh;
  private arrows: T.Mesh[] = [];
  private clock = 0;
  private flowing = false;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#6f9a4a");
    this.daylight("#eaf4ff", "#4e6a34", "#fff2d6", 8, 2.1);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.add(new T.BoxGeometry(40, 0.4, 30), this.standard({ ...stuff("grass", "#6f9a4a", 8, keep), roughness: 1 }), 0, -0.2, 0).castShadow = false;
    const g = (name: string, geometry: T.BufferGeometry) => (this.parts[name] = this.own(geometry));
    // A length of pipe from a stone's centre to its edge, along +z: one with its picture running outward, one inward,
    // so that running water (a scrolling picture) goes the way the water does.
    g("arm", new T.CylinderGeometry(PIPE, PIPE, ARM, 18, 1, true).rotateX(Math.PI / 2).translate(0, 0, ARM / 2));
    g("armIn", new T.CylinderGeometry(PIPE, PIPE, ARM, 18, 1, true).rotateX(-Math.PI / 2).translate(0, 0, ARM / 2));
    // A brass flange where two pipes meet, and a strap halfway along.
    g("flange", new T.CylinderGeometry(PIPE * 1.42, PIPE * 1.42, 0.034, 20).rotateX(Math.PI / 2).translate(0, 0, ARM - 0.019));
    g("strap", new T.TorusGeometry(PIPE + 0.005, 0.009, 6, 20).translate(0, 0, ARM * 0.52));
    g("hub", new T.SphereGeometry(PIPE * 1.5, 20, 14));
    // The tank: a pad, four legs, a pipe down the middle, a riveted drum and a roof.
    g("pad", new T.CylinderGeometry(0.33, 0.34, 0.025, 28));
    g("leg", new T.CylinderGeometry(0.02, 0.024, 0.4, 8));
    g("riser", new T.CylinderGeometry(PIPE * 0.8, PIPE * 0.8, 0.36, 14));
    g("drum", new T.CylinderGeometry(0.27, 0.27, 0.26, 32));
    g("band", new T.TorusGeometry(0.272, 0.012, 6, 40).rotateX(Math.PI / 2));
    g("cap", new T.ConeGeometry(0.29, 0.13, 32));
    g("finial", new T.SphereGeometry(0.03, 10, 8));
    // A house: walls and gables in one extrusion (ridge east to west), two roof panels, a chimney, a door and windows.
    const D = 0.15,
      WIDE = 0.2,
      WALL = 0.2,
      PEAK = 0.13;
    const profile = new T.Shape([new T.Vector2(-D, 0), new T.Vector2(D, 0), new T.Vector2(D, WALL), new T.Vector2(0, WALL + PEAK), new T.Vector2(-D, WALL)]);
    g("house", new T.ExtrudeGeometry(profile, { depth: WIDE * 2, bevelEnabled: false }).rotateY(Math.PI / 2).translate(-WIDE, 0, 0));
    const slope = Math.atan2(PEAK, D),
      eave = D + 0.05,
      length = eave / Math.cos(slope) + 0.01;
    g("roof", block(WIDE * 2 + 0.08, 0.026, length, 0.008));
    g("ridge", new T.CylinderGeometry(0.017, 0.017, WIDE * 2 + 0.08, 8).rotateZ(Math.PI / 2).translate(0, WALL + PEAK + 0.03, 0));
    this.houseRoof = { slope, z: eave / 2, y: WALL + PEAK - (eave / 2) * Math.tan(slope) };
    g("chimney", block(0.055, 0.12, 0.055, 0.008));
    g("door", new T.PlaneGeometry(0.075, 0.13));
    g("window", new T.PlaneGeometry(0.07, 0.065));
    // A pool of water where an open end meets nothing.
    g("puddle", new T.CircleGeometry(0.1, 22).rotateX(-Math.PI / 2));
    // An arrow lying flat, pointing +z: the hint's way for an end.
    const head = new T.Shape([new T.Vector2(-0.07, 0), new T.Vector2(0.07, 0), new T.Vector2(0, 0.1)]);
    g("arrow", new T.ShapeGeometry(head).rotateX(Math.PI / 2));
    // The garden round the paving.
    g("slab", block(SLAB, 0.09, SLAB, 0.018));
    g("brick", block(0.215, 0.1, 0.1, 0.012));
    g("bloom", new T.IcosahedronGeometry(0.036, 0));
    g("leaf", new T.IcosahedronGeometry(0.07, 0).scale(1, 0.55, 1));
    g("shrub", new T.IcosahedronGeometry(0.28, 1).scale(1, 0.78, 1));
    g("picket", block(0.07, 0.36, 0.025, 0.01));
    g("tip", new T.ConeGeometry(0.05, 0.06, 4).rotateY(Math.PI / 4).scale(1, 1, 0.36));
    g("stepping", new T.CylinderGeometry(0.2, 0.21, 0.04, 9));
    // Water running: soft bright bands along a pipe, scrolled while the garden is watered.
    this.flow = this.own(
      painted(4, 64, (pen) => {
        for (let y = 0; y < 64; y++) {
          const v = Math.round(55 + 200 * Math.max(0, Math.sin((y / 64) * Math.PI * 2)) ** 3);
          pen.fillStyle = `rgb(${v},${v},${v})`;
          pen.fillRect(0, y, 4, 1);
        }
      }),
    );
    this.flow.wrapS = this.flow.wrapT = T.RepeatWrapping;
    this.flow.repeat.set(1, 2);
    // The tank's paint: riveted panels and a white drop.
    const skin = this.own(
      painted(512, 80, (pen) => {
        pen.fillStyle = "#4a8cc4";
        pen.fillRect(0, 0, 512, 80);
        pen.strokeStyle = "rgba(18, 48, 80, 0.45)";
        pen.lineWidth = 3;
        pen.fillStyle = "rgba(235, 244, 252, 0.75)";
        for (let x = 0; x < 512; x += 64) {
          pen.beginPath();
          pen.moveTo(x, 0);
          pen.lineTo(x, 80);
          pen.stroke();
          for (const y of [8, 72])
            for (const dx of [20, 44]) {
              pen.beginPath();
              pen.arc(x + dx, y, 2.6, 0, Math.PI * 2);
              pen.fill();
            }
        }
        for (const cx of [96, 352]) {
          const cy = 46;
          pen.fillStyle = "#f4f9fd";
          pen.beginPath();
          pen.moveTo(cx, cy - 30);
          pen.bezierCurveTo(cx + 6, cy - 16, cx + 18, cy - 6, cx + 18, cy + 8);
          pen.arc(cx, cy + 8, 18, 0, Math.PI);
          pen.bezierCurveTo(cx - 18, cy - 6, cx - 6, cy - 16, cx, cy - 30);
          pen.fill();
        }
      }),
    );
    const p = (name: string, options: T.MeshStandardMaterialParameters) => (this.paint[name] = this.standard(options));
    p("dry", { color: "#b8733a", metalness: 0.55, roughness: 0.34 });
    p("wet", { color: "#8ec3ee", metalness: 0.45, roughness: 0.3, emissive: "#1c6fd4", emissiveIntensity: 0.4 });
    p("flow", { color: "#93c9f2", metalness: 0.4, roughness: 0.28, emissive: "#46b4ff", emissiveMap: this.flow, emissiveIntensity: 1.1 });
    p("brass", { color: "#c9a44a", metalness: 0.65, roughness: 0.3 });
    p("steel", { color: "#5b636d", metalness: 0.5, roughness: 0.45 });
    p("tank", { map: skin, metalness: 0.25, roughness: 0.45 });
    p("tin", { color: "#dfe4e8", metalness: 0.45, roughness: 0.38 });
    p("concrete", { ...stuff("stone", "#c3beb4", 1, keep), roughness: 0.95 });
    p("door", { color: "#5a3a24", roughness: 0.7 });
    p("chimney", { color: "#8d4b36", roughness: 0.9 });
    // Windows: dark glass, a faint light once water has come, and full light when every house has it.
    p("dark", { color: "#2c3a4c", roughness: 0.15, metalness: 0.2 });
    p("glow", { color: "#8a7a52", emissive: "#ffcf73", emissiveIntensity: 0.3, roughness: 0.3 });
    p("lit", { color: "#fff2c4", emissive: "#ffcc66", emissiveIntensity: 1.15, roughness: 0.3 });
    p("puddle", { color: "#6fb2e8", transparent: true, opacity: 0.72, roughness: 0.06, metalness: 0.1, emissive: "#1d5f9e", emissiveIntensity: 0.25, depthWrite: false });
    p("gravel", { ...stuff("gravel", "#9b958a", 2, keep), roughness: 1 });
    p("earth", { ...stuff("earth", "#5e4430", 1, keep), roughness: 1 });
    p("white", { color: "#f4f1ea", roughness: 0.7 });
    p("plain", { color: "#ffffff", roughness: 0.8 });
    p("can", { color: "#3f8f5a", metalness: 0.35, roughness: 0.4 });
    p("hose", { color: "#2f9a4e", roughness: 0.55 });
    // Paving in four shades, each showing another part of its photograph.
    this.slabs = ["#c9c2b6", "#b9b7b1", "#cfc1aa", "#bfb9ad"].map((base, i) => {
      const options = stuff("stone", base, 0.5, keep);
      options.map?.offset.set((i * 0.37) % 1, (i * 0.61) % 1);
      return this.standard({ ...options, roughness: 0.92 });
    });
    this.walls = WALLS.map((color) => this.standard({ color, roughness: 0.85 }));
    this.roofs = ROOFS.map((color) => this.standard({ color, roughness: 0.75 }));
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.38, 0.43, "#ffffff");
    this.hintRing = ringMesh(own, 0.37, 0.44, "#ffb21f");
    const gold = this.own(new T.MeshBasicMaterial({ color: "#ffb21f", side: T.DoubleSide, depthTest: false, transparent: true }));
    for (let k = 0; k < 4; k++) {
      const arrow = new T.Mesh(this.parts.arrow, gold);
      arrow.renderOrder = 6;
      arrow.visible = false;
      this.arrows.push(arrow);
    }
    this.scene.add(this.board, this.pieces, this.puddles, this.cursor, this.hintRing, ...this.arrows);
    this.begin();
  }
  /** Where a house's roof panels lie: their slope, and the middle of the south one. */
  private houseRoof = { slope: 0, z: 0, y: 0 };
  private mesh(part: string, material: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) {
    const m = new T.Mesh(this.parts[part], material);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  /** An instanced shape for the garden of one size, freed when another is laid. */
  private many(part: string, material: T.Material, items: { x: number; y: number; z: number; turn?: number; scale?: number; color?: string }[], shadow = true) {
    const mesh = new T.InstancedMesh(this.parts[part], material, items.length),
      place = new T.Object3D();
    items.forEach((item, i) => {
      place.position.set(item.x, item.y, item.z);
      place.rotation.set(0, item.turn ?? 0, 0);
      place.scale.setScalar(item.scale ?? 1);
      place.updateMatrix();
      mesh.setMatrixAt(i, place.matrix);
      if (item.color) mesh.setColorAt(i, new T.Color(item.color));
    });
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.laid.push(mesh);
    this.board.add(mesh);
    return mesh;
  }
  /** Lays the garden for a size: the gravel bed, the slabs, the brick edging and everything round it. */
  private lay(size: number) {
    if (size === this.size) return;
    for (const resource of this.laid) resource.dispose();
    this.laid = [];
    this.board.clear();
    this.pieces.clear();
    this.cells = [];
    this.size = size;
    const span = size * CELL,
      half = span / 2,
      rand = sequence(size * 7919 + 17),
      fit = <R extends { dispose(): void }>(r: R) => (this.laid.push(r), r);
    // The gravel bed and the slabs on it.
    const bed = new T.Mesh(fit(block(span + 0.08, 0.06, span + 0.08, 0.02)), this.paint.gravel);
    bed.position.y = 0.03;
    bed.receiveShadow = true;
    this.board.add(bed);
    const shades: { x: number; y: number; z: number; turn: number }[][] = this.slabs.map(() => []);
    for (let i = 0; i < size * size; i++) {
      const p = cellAt(size, i),
        r = rand();
      shades[Math.floor(r * 4) % 4].push({ x: p.x, y: TOP - 0.045, z: p.z, turn: (Math.floor(rand() * 4) * Math.PI) / 2 });
    }
    shades.forEach((items, k) => {
      if (items.length) this.many("slab", this.slabs[k], items, false);
    });
    // Bricks set on edge round the bed, their tops level with the slabs: the rows along the back and the front run
    // corner to corner, the side rows between them.
    const bricks: { x: number; y: number; z: number; turn: number; color: string }[] = [],
      out = half + 0.09,
      tone = () => ["#a4553a", "#9a4a33", "#b0603f", "#8f4630"][Math.floor(rand() * 4)],
      row = (from: number, to: number, at: (along: number) => { x: number; z: number; turn: number }) => {
        const count = Math.floor((to - from) / 0.225),
          step = (to - from) / count;
        for (let k = 0; k < count; k++) bricks.push({ ...at(from + step * (k + 0.5)), y: TOP - 0.05, color: tone() });
      };
    for (const side of [-1, 1]) {
      row(-out - 0.05, out + 0.05, (x) => ({ x, z: side * out, turn: 0 }));
      row(-out + 0.05, out - 0.05, (z) => ({ x: side * out, z, turn: Math.PI / 2 }));
    }
    this.many("brick", this.paint.plain, bricks);
    // Flower beds either side: dark earth, clumps of leaves, and blooms over them.
    const bedX = half + 0.7,
      bedLong = span + 0.9,
      earth = fit(block(0.78, 0.07, bedLong, 0.03)),
      leaves: { x: number; y: number; z: number; turn: number; scale: number; color: string }[] = [],
      blooms: { x: number; y: number; z: number; turn: number; scale: number; color: string }[] = [];
    for (const side of [-1, 1]) {
      const strip = new T.Mesh(earth, this.paint.earth);
      strip.position.set(side * bedX, 0.035, 0);
      strip.receiveShadow = true;
      this.board.add(strip);
      for (let z = -bedLong / 2 + 0.1; z < bedLong / 2 - 0.08; z += 0.13)
        for (let k = 0; k < 3; k++) {
          const x = side * bedX + (k - 1) * 0.22 + (rand() - 0.5) * 0.08,
            zz = z + (rand() - 0.5) * 0.08;
          leaves.push({ x, y: 0.09, z: zz, turn: rand() * 6, scale: 0.8 + rand() * 0.5, color: rand() < 0.5 ? "#3f7a34" : "#4f8c3c" });
          const color = BLOOMS[Math.floor(rand() * BLOOMS.length)];
          for (let b = 0; b < 3; b++)
            blooms.push({ x: x + (rand() - 0.5) * 0.12, y: 0.13 + rand() * 0.07, z: zz + (rand() - 0.5) * 0.12, turn: rand() * 6, scale: 0.7 + rand() * 0.6, color });
        }
    }
    this.many("leaf", this.paint.plain, leaves);
    this.many("bloom", this.paint.plain, blooms, false);
    // Round shrubs at the ends of the flower beds, in front of the fence at the back and further out at the front, so
    // that they hide no stone.
    const shrubs: { x: number; y: number; z: number; turn: number; scale: number; color: string }[] = [];
    for (const [sx, sz, away, deep] of [[-1, -1, 0.55, 0.62], [1, -1, 0.55, 0.62], [-1, 1, 1.35, 1.3], [1, 1, 1.35, 1.3]] as const)
      for (let k = 0; k < 3; k++)
        shrubs.push({
          x: sx * (half + away + k * 0.22 + rand() * 0.08),
          y: 0.15,
          z: sz * (half + deep + rand() * 0.08),
          turn: rand() * 6,
          scale: 0.72 + rand() * 0.3,
          color: ["#2f6136", "#3b7040", "#2a5530"][k],
        });
    this.many("shrub", this.paint.plain, shrubs);
    // A white picket fence along the back, with two rails behind it.
    const fenceZ = -(half + 1.02),
      reach = half + 2.6,
      pickets: { x: number; y: number; z: number }[] = [],
      tips: { x: number; y: number; z: number }[] = [];
    for (let x = -reach; x <= reach; x += 0.17) {
      pickets.push({ x, y: 0.18, z: fenceZ });
      tips.push({ x, y: 0.39, z: fenceZ });
    }
    this.many("picket", this.paint.white, pickets);
    this.many("tip", this.paint.white, tips);
    const rail = fit(block(reach * 2 + 0.2, 0.045, 0.022, 0.008));
    for (const y of [0.1, 0.28]) {
      const m = new T.Mesh(rail, this.paint.white);
      m.position.set(0, y, fenceZ - 0.024);
      m.castShadow = m.receiveShadow = true;
      this.board.add(m);
    }
    // Stepping stones across the lawn toward the paving.
    this.many(
      "stepping",
      this.paint.concrete,
      [0, 1, 2, 3].map((k) => ({ x: Math.sin(k * 1.3) * 0.35 + 0.2, y: 0.02, z: half + 0.55 + k * 0.5, turn: rand() * 3, scale: 0.85 + rand() * 0.3 })),
      false,
    );
    this.can(-(half + 0.45), half + 0.72);
    this.reel(half + 0.55, half + 0.75, rand);
    this.resize();
  }
  /** A watering can on the lawn. */
  private can(x: number, z: number) {
    const can = new T.Group(),
      fit = <G extends T.BufferGeometry>(geometry: G) => (this.laid.push(geometry), geometry);
    const part = (geometry: T.BufferGeometry, material: T.Material, px: number, py: number, pz: number) => {
      const m = new T.Mesh(fit(geometry), material);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      can.add(m);
      return m;
    };
    part(new T.CylinderGeometry(0.1, 0.11, 0.18, 22), this.paint.can, 0, 0.09, 0);
    part(new T.CylinderGeometry(0.1, 0.1, 0.012, 22), this.paint.tin, 0, 0.184, 0);
    part(new T.CylinderGeometry(0.014, 0.02, 0.26, 10), this.paint.can, 0.15, 0.15, 0).rotation.z = -0.95;
    part(new T.ConeGeometry(0.035, 0.05, 12), this.paint.tin, 0.26, 0.23, 0).rotation.z = -0.95 + Math.PI;
    part(new T.TorusGeometry(0.085, 0.013, 8, 18, Math.PI), this.paint.can, -0.01, 0.19, 0);
    can.position.set(x, 0, z);
    can.rotation.y = 0.6;
    this.board.add(can);
  }
  /** A hose reel, its hose wound round the drum and its end lying out on the grass. */
  private reel(x: number, z: number, rand: () => number) {
    const reel = new T.Group(),
      fit = <G extends T.BufferGeometry>(geometry: G) => (this.laid.push(geometry), geometry);
    const part = (geometry: T.BufferGeometry, material: T.Material, px: number, py: number, pz: number) => {
      const m = new T.Mesh(fit(geometry), material);
      m.position.set(px, py, pz);
      m.castShadow = m.receiveShadow = true;
      reel.add(m);
      return m;
    };
    for (const side of [-1, 1]) {
      part(new T.CylinderGeometry(0.15, 0.15, 0.018, 24), this.paint.can, side * 0.09, 0.17, 0).rotation.z = Math.PI / 2;
      // Two legs a side, splayed at the foot and meeting under the axle.
      for (const lean of [-1, 1]) part(new T.CylinderGeometry(0.014, 0.016, 0.2, 8), this.paint.steel, side * 0.11, 0.08, lean * 0.05).rotation.x = -lean * 0.35;
    }
    for (let k = 0; k < 5; k++) part(new T.TorusGeometry(0.105, 0.019, 8, 26), this.paint.hose, -0.064 + k * 0.032, 0.17, 0).rotation.y = Math.PI / 2;
    // The free end, coiling a little on the lawn.
    const points = [new T.Vector3(0, 0.07, 0.08)];
    for (let k = 1; k <= 6; k++) points.push(new T.Vector3(-0.12 * k + (rand() - 0.5) * 0.08, 0.02, 0.12 + Math.sin(k * 1.1) * 0.18));
    part(new T.TubeGeometry(new T.CatmullRomCurve3(points), 40, 0.018, 8), this.paint.hose, 0, 0, 0);
    reel.position.set(x, 0, z);
    reel.rotation.y = -0.4;
    this.board.add(reel);
  }
  /** The water tank: a concrete pad, four legs, a pipe down to the joint, a riveted drum and a roof. */
  private tank(group: T.Group) {
    this.mesh("pad", this.paint.concrete, group, 0, 0.012, 0);
    for (const [x, z] of [[0.17, 0.17], [-0.17, 0.17], [0.17, -0.17], [-0.17, -0.17]]) this.mesh("leg", this.paint.steel, group, x, 0.2, z);
    this.mesh("riser", this.paint.brass, group, 0, PIPE_Y + 0.18, 0);
    this.mesh("drum", this.paint.tank, group, 0, 0.4 + 0.13, 0);
    for (const y of [0.405, 0.655]) this.mesh("band", this.paint.tin, group, 0, y, 0);
    this.mesh("cap", this.paint.tin, group, 0, 0.66 + 0.065, 0);
    this.mesh("finial", this.paint.tin, group, 0, 0.8, 0);
  }
  /** A house whose back wall the pipe comes into through end `bit`; its windows dark, faintly lit or lit. */
  private house(group: T.Group, cell: number, bit: number, light: "dark" | "glow" | "lit") {
    const home = new T.Group(),
      wall = this.walls[(cell * 7 + 3) % this.walls.length],
      roof = this.roofs[(cell * 5 + 1) % this.roofs.length],
      glass = this.paint[light],
      { slope, z, y } = this.houseRoof;
    this.mesh("house", wall, home, 0, 0, 0.02);
    for (const side of [1, -1]) {
      const panel = this.mesh("roof", roof, home, 0, y + Math.cos(slope) * 0.013, 0.02 + side * (z + Math.sin(slope) * 0.013));
      panel.rotation.x = side * slope;
    }
    this.mesh("ridge", roof, home, 0, 0, 0.02);
    this.mesh("chimney", this.paint.chimney, home, 0.09, 0.33, -0.03);
    const flat = (part: string, material: T.Material, x: number, py: number, pz: number, turn: number) => {
      const m = this.mesh(part, material, home, x, py, pz);
      m.rotation.y = turn;
      m.castShadow = false;
    };
    flat("door", this.paint.door, -0.07, 0.065, 0.172, 0);
    flat("window", glass, 0.08, 0.12, 0.172, 0);
    flat("window", glass, 0.08, 0.12, -0.132, Math.PI);
    flat("window", glass, 0.202, 0.12, 0.02, Math.PI / 2);
    flat("window", glass, -0.202, 0.12, 0.02, -Math.PI / 2);
    // Its front faces away from the pipe.
    home.rotation.y = ANGLE[opposite(bit)];
    group.add(home);
  }
  /** One stone's piece: pipes to its open ends with their fittings, and its joint, house or tank. */
  private piece(cell: number, mask: number, kind: "pipe" | "house" | "tank", water: "dry" | "wet" | "flow", inlet: number, light: "dark" | "glow" | "lit") {
    const group = new T.Group(),
      pipe = this.paint[water];
    for (const bit of DIRS) {
      if (!(mask & bit)) continue;
      // While the water runs the pipe it comes in by carries its picture inward.
      this.mesh(water === "flow" && bit === inlet ? "armIn" : "arm", pipe, group, 0, PIPE_Y, 0).rotation.y = ANGLE[bit];
      this.mesh("flange", this.paint.brass, group, 0, PIPE_Y, 0).rotation.y = ANGLE[bit];
      this.mesh("strap", this.paint.brass, group, 0, PIPE_Y, 0).rotation.y = ANGLE[bit];
    }
    if (kind === "house") this.house(group, cell, mask, light);
    else this.mesh("hub", this.paint.brass, group, 0, PIPE_Y, 0);
    if (kind === "tank") this.tank(group);
    return group;
  }
  protected subject(aspect: number): TableSubject {
    return pipesSubject(this.size || 6, aspect);
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    return state.tiles.map((_, i) => ({ ...cellAt(state.size, i), y: TOP + 0.1, r: CELL * 0.55, point: i }));
  }
  protected place(state: State) {
    this.lay(state.size);
    const { inlet, wet } = inlets(state),
      done = state.winner === 0,
      home = houses(state);
    state.tiles.forEach((mask, i) => {
      const kind = i === state.source ? "tank" : home[i] ? "house" : "pipe",
        water = !wet[i] ? "dry" : done ? "flow" : "wet",
        light = !wet[i] ? "dark" : done ? "lit" : "glow",
        key = `${mask}|${kind}|${water}|${water === "flow" ? inlet[i] : 0}`;
      let entry = this.cells[i];
      if (!entry || entry.key !== key) {
        if (entry) this.pieces.remove(entry.group);
        entry = this.cells[i] = { key, group: this.piece(i, mask, kind, water, inlet[i], light) };
        this.pieces.add(entry.group);
      }
      const p = cellAt(state.size, i);
      entry.group.position.set(p.x, TOP, p.z);
      entry.group.rotation.y = 0;
    });
    // Water pools on the stone below an open end that meets nothing.
    this.puddles.clear();
    for (const { cell, bit } of leaks(state)) {
      if (!wet[cell]) continue;
      const p = cellAt(state.size, cell),
        [dx, dz] = WAY[bit],
        pool = new T.Mesh(this.parts.puddle, this.paint.puddle);
      pool.position.set(p.x + dx * 0.31, TOP + 0.003, p.z + dz * 0.31);
      pool.rotation.y = ANGLE[bit];
      pool.scale.set(0.85, 1, 1.25);
      pool.receiveShadow = true;
      pool.renderOrder = 2;
      this.puddles.add(pool);
    }
    this.water(done);
  }
  /** Starts or stops the running of the water, which needs a frame now and then only while every house has it. */
  private water(running: boolean) {
    this.flowing = running && !this.reducedMotion;
    if (this.flowing && !this.clock) this.clock = requestAnimationFrame(this.idle);
  }
  private idle = (now: number) => {
    this.clock = 0;
    if (this.disposed || !this.flowing) return;
    this.clock = requestAnimationFrame(this.idle);
    const t = now / 1000;
    this.flow.offset.y = -((t * 0.55) % 1);
    this.paint.lit.emissiveIntensity = 1.1 + 0.22 * Math.sin(t * 2.3);
    this.redraw();
  };
  protected animate(before: State, state: State) {
    const cell = state.last;
    if (cell === null || state.ply !== before.ply + 1 || state.size !== before.size) return false;
    const turns = turnsBetween(before.tiles[cell], state.tiles[cell]),
      piece = this.cells[cell]?.group;
    if (turns <= 0 || !piece) return false;
    // A quick quarter turn clockwise, lifted a little off the slab, settling with a small swing past.
    const angle = (-turns * Math.PI) / 2;
    this.tween(0, turns === 1 ? 190 : 260, (p) => {
      const q = p - 1,
        swing = 1 + 2.2 * q ** 3 + 1.2 * q ** 2;
      piece.rotation.y = angle * swing;
      piece.position.y = TOP + 0.04 * Math.sin(Math.PI * p);
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const n = state.tiles.length,
      ring = (mesh: T.Mesh, point: number | null | undefined) => {
        mesh.visible = point !== null && point !== undefined && point >= 0 && point < n;
        if (mesh.visible) {
          const p = cellAt(state.size, point!);
          mesh.position.set(p.x, TOP + 0.006, p.z);
        }
      };
    ring(this.cursor, marks.cursor);
    const hinted = marks.hint && marks.hint.to >= SET ? unput(marks.hint.to) : null,
      shown = hinted && hinted.cell < n ? hinted : null;
    ring(this.hintRing, shown?.cell);
    // Gold arrows on the hinted stone point the ways its pipe should open.
    this.arrows.forEach((arrow, k) => {
      const bit = DIRS[k];
      arrow.visible = !!shown && !!(shown.mask & bit);
      if (!arrow.visible) return;
      const p = cellAt(state.size, shown!.cell),
        [dx, dz] = WAY[bit];
      arrow.position.set(p.x + dx * 0.27, TOP + 0.2, p.z + dz * 0.27);
      arrow.rotation.y = ANGLE[bit];
    });
  }
  dispose() {
    cancelAnimationFrame(this.clock);
    this.flowing = false;
    for (const resource of this.laid) resource.dispose();
    this.laid = [];
    super.dispose();
  }
}
