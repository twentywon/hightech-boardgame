import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { capable, travel } from "../../engine/scene-utils";
import type { BoardSpec, Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { CELL, hexaBoard } from "./board";
import { blobGeometry, germMaterial, innerGeometry, GERM_H, type GermUniforms } from "./germ";
import { NEAR, blockedIn, type State } from "./rules";
import { glowTexture, sequence, skyTexture, worlds } from "./space";

/** What the last thing heard on the table was, for the config's `contact` to sound it (the view calls `onContact` then). */
export const germCue: { kind: "clone" | "jump" | "convert" | "land"; land: number; count: number } = { kind: "clone", land: 0, count: 0 };
/** The two species: body, the glow at its edge, and the nucleus seen through it. */
const SPECIES = [
  { body: "#3f8cff", rim: "#9fd0ff", inner: "#173d8f" },
  { body: "#ff5a4a", rim: "#ffc0a0", inner: "#8a1d18" },
] as const;
const DIM = ["#5d7396", "#97655f"];
/** The dish: the gel's edge, the glass wall round it, and the metal base under all. */
const GEL_R = 4.62,
  WALL_IN = 4.62,
  WALL_OUT = 4.74,
  BASE_R = 4.86,
  WALL_H = 0.36,
  /** The walls between the wells: how far a well reaches from its middle (to a corner) and how high the walls stand. */
  WELL_R = 0.47,
  LATTICE_H = 0.1;
type Path = T.Shape | T.Path;
/** A hexagon with rounded corners: `start` is the angle of its first corner, 0 for a corner on +x. */
function hexagon<P extends Path>(path: P, cx: number, cy: number, r: number, round: number, start: number) {
  const corner = (i: number) => {
    const a = start + (Math.PI / 3) * i;
    return new T.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  };
  for (let i = 0; i < 6; i++) {
    const at = corner(i),
      before = corner(i + 5),
      after = corner(i + 1),
      inBefore = at.clone().lerp(before, round / r),
      inAfter = at.clone().lerp(after, round / r);
    if (i === 0) path.moveTo(inBefore.x, inBefore.y);
    else path.lineTo(inBefore.x, inBefore.y);
    path.quadraticCurveTo(at.x, at.y, inAfter.x, inAfter.y);
  }
  path.closePath();
  return path;
}
/** The dish's own hexagon has its corners toward and away from me (along z), as the field of cells has. */
const dishShape = (r: number, round: number) => hexagon(new T.Shape(), 0, 0, r, round, Math.PI / 2);
/** Laid flat: the shape's x along x, its y along -z, its depth upward. */
const flat = (geometry: T.BufferGeometry) => geometry.rotateX(-Math.PI / 2);

interface Germ {
  /** Where the germ stands; moved, scaled and turned by animations. */
  group: T.Group;
  /** Its breathing, kept apart from what animations do. */
  pulse: T.Group;
  body: T.Mesh;
  inner: T.Mesh;
}
/**
 * Hexa germ war's table (the user asked for it grander): a hexagonal culture dish of glass and metal floating in
 * space, each cell a shallow well in the gel; germs are soft living blobs with a nucleus, wobbling and breathing at
 * rest where a graphics card draws. A copy grows out of its parent into the next well, a jump flies in an arc and
 * splashes down, and the germs won over take the colour one after another, spreading through each from the side of
 * the newcomer. Walled-off cells are crystal plugs set in metal collars.
 */
export class HexaView extends TableView<State> {
  private board: BoardSpec;
  private uniforms = { value: 0 };
  private bodies: T.Material[];
  private insides: T.Material[];
  private dimBodies: T.Material[];
  private dimInsides: T.Material[];
  private germs: Germ[] = [];
  /** Materials made for one move (a colour spreading), thrown away when the table is laid out again. */
  private passing: T.Material[] = [];
  private neck: T.Mesh;
  private droplets: T.Mesh[] = [];
  private ripple: T.Mesh;
  private rippleMaterial: T.MeshBasicMaterial;
  private marksMesh: Record<"movable" | "near" | "nearFill" | "far" | "flip", T.InstancedMesh>;
  private markMaterials: T.MeshBasicMaterial[] = [];
  private selected: T.Mesh;
  private cursor: T.Mesh;
  private last: T.Mesh;
  private lastMaterials: T.MeshBasicMaterial[];
  private turning: T.Object3D[] = [];
  private hovered = -1;
  /** The germs a move under the mouse or the keyboard would win: they tremble. */
  private flipping = new Set<number>();
  private live: boolean;
  /**
   * Where a graphics card draws. Drawn by the processor alone (as in the browser tests) the dish is lit the plain way
   * (no shadows, no light from behind, no glows), so that a frame costs about what the old board did.
   */
  private rich: boolean;
  constructor(host: HTMLElement, quality: "high" | "low", variant: string) {
    super(host, quality, "#04060f");
    this.board = hexaBoard(variant);
    this.rich = capable();
    this.live = this.rich && !this.reducedMotion;
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.scene.background = skyTexture(keep);
    this.turning = worlds(this.scene, keep, this.rich);
    // Light from the far sun at the upper left, a cool fill from space, and a blue edge light from behind.
    const sun = this.daylight("#cfe2ff", "#1a1830", "#fff1dc", 6.5, 2.5);
    sun.position.set(-5, 10, 4);
    if (this.rich) {
      const back = new T.DirectionalLight("#7fb0ff", 0.7);
      back.position.set(4, 3, -8);
      this.scene.add(back);
    } else this.renderer.shadowMap.enabled = false;
    this.dish(variant);
    // The germs: shared shapes and paints, one germ made ready for every cell.
    const clock = this.uniforms,
      body = keep(blobGeometry()),
      inner = keep(innerGeometry((parts) => mergeGeometries(parts)!));
    this.bodies = SPECIES.map((s) => keep(germMaterial(s.body, s.rim, clock)));
    this.insides = SPECIES.map((s) => this.surface({ color: s.inner, roughness: 0.5, emissive: s.inner, emissiveIntensity: 0.3 }));
    this.dimBodies = DIM.map((c) => keep(germMaterial(c, "#c8d0dc", clock, true)));
    this.dimInsides = DIM.map((c) => this.surface({ color: new T.Color(c).multiplyScalar(0.5), roughness: 0.6 }));
    for (const p of this.board.points) {
      const group = new T.Group(),
        pulse = new T.Group(),
        b = new T.Mesh(body, this.bodies[0]),
        i = new T.Mesh(inner, this.insides[0]);
      b.castShadow = true;
      b.renderOrder = 1;
      pulse.add(i, b);
      group.add(pulse);
      group.position.set(p.x, 0, p.z);
      group.visible = false;
      this.germs.push({ group, pulse, body: b, inner: i });
      this.scene.add(group);
    }
    // The thread of jelly a copy stays joined by as it grows out, and the drops a landing jump throws.
    this.neck = new T.Mesh(keep(new T.CylinderGeometry(1, 1, 1, 14, 1, true)), this.bodies[0]);
    this.neck.visible = false;
    this.scene.add(this.neck);
    const drop = keep(new T.SphereGeometry(0.05, 10, 8));
    for (let k = 0; k < 7; k++) {
      const d = new T.Mesh(drop, this.bodies[0]);
      d.visible = false;
      this.droplets.push(d);
      this.scene.add(d);
    }
    // A ring that runs out over the gel where a germ comes down.
    this.rippleMaterial = keep(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    this.ripple = new T.Mesh(keep(flat(new T.RingGeometry(0.34, 0.42, 6, 1))), this.rippleMaterial);
    this.ripple.position.y = 0.012;
    this.ripple.visible = false;
    this.scene.add(this.ripple);
    // Marks: what can move, where it can go (a copy filled in gold, a jump an orange outline), the germs a move would win.
    const hexRing = (inner: number, outer: number) => keep(flat(new T.RingGeometry(inner, outer, 6, 1))),
      paint = (color: string, opacity: number) => {
        const m = keep(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
        m.userData.base = opacity;
        this.markMaterials.push(m);
        return m;
      },
      many = (geometry: T.BufferGeometry, material: T.Material, y: number) => {
        const mesh = new T.InstancedMesh(geometry, material, this.board.points.length);
        mesh.count = 0;
        mesh.position.y = y;
        mesh.renderOrder = 3;
        mesh.frustumCulled = false;
        this.scene.add(mesh);
        return mesh;
      };
    this.marksMesh = {
      movable: many(hexRing(0.36, 0.44), paint("#2fd27a", 0.95), 0.008),
      nearFill: many(keep(flat(new T.CircleGeometry(0.42, 6))), paint("#ffd84a", 0.42), 0.006),
      near: many(hexRing(0.34, 0.44), paint("#f3a712", 0.98), 0.01),
      far: many(hexRing(0.37, 0.44), paint("#ff7a2e", 0.95), 0.01),
      flip: many(hexRing(0.37, 0.45), paint("#ffffff", 0.95), 0.014),
    };
    const single = (geometry: T.BufferGeometry, material: T.Material, y: number) => {
      const mesh = new T.Mesh(geometry, material);
      mesh.position.y = y;
      mesh.renderOrder = 4;
      mesh.visible = false;
      this.scene.add(mesh);
      return mesh;
    };
    this.selected = single(hexRing(0.33, 0.45), paint("#00b4ff", 1), 0.012);
    // The keyboard's place stands over the walls, a little larger than a well.
    this.cursor = single(hexRing(0.47, 0.54), paint("#9fd4ff", 1), LATTICE_H + 0.02);
    // Where the last move came down, in its side's colour, until the next.
    this.lastMaterials = SPECIES.map((s) => keep(new T.MeshBasicMaterial({ color: s.rim, transparent: true, opacity: 0.55, depthWrite: false })));
    this.last = single(hexRing(0.4, 0.46), this.lastMaterials[0], 0.009);
    this.begin();
    this.ticking = requestAnimationFrame(this.tick);
  }
  private ticking = 0;
  /** The dish, its gel and wells, the crystal plugs of the walled-off cells, and the glow it floats on. */
  private dish(variant: string) {
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r),
      blocked = blockedIn(variant),
      points = this.board.points;
    // The metal base, a little wider than the glass, with a lit band round its side.
    const steel = this.surface({ color: "#aeb8c2", metalness: 0.75, roughness: 0.32 }),
      dark = this.surface({ color: "#59636e", metalness: 0.8, roughness: 0.4 }),
      // A ring: the gel covers its middle, which would only be drawn over.
      outline = dishShape(BASE_R, 0.62);
    outline.holes.push(dishShape(GEL_R - 0.3, 0.4));
    const base = new T.ExtrudeGeometry(outline, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 2, curveSegments: 5 });
    this.add(flat(base), [this.surface({ map: this.rimTexture(), metalness: 0.7, roughness: 0.34 }), dark], 0, -0.39, 0).castShadow = false;
    const ring = dishShape(BASE_R + 0.06, 0.66);
    ring.holes.push(dishShape(BASE_R - 0.1, 0.56));
    const band = new T.ExtrudeGeometry(ring, { depth: 0.045, bevelEnabled: false, curveSegments: 6 });
    const strip = this.add(flat(band), this.own(new T.MeshBasicMaterial({ color: "#56e0ff" })), 0, -0.2, 0);
    strip.castShadow = strip.receiveShadow = false;
    // The gel on the floor of the dish, each well painted a little hollow.
    const gel = this.add(flat(new T.ShapeGeometry(dishShape(GEL_R, 0.5), 6)), this.rich
        ? this.standard({ map: this.gelTexture(blocked), roughness: 0.28, emissive: "#0a1614", emissiveIntensity: 1 })
        : this.own(new T.MeshBasicMaterial({ map: this.gelTexture(blocked), color: "#f4faf8" })), 0, 0.001, 0);
    gel.castShadow = false;
    // The walls between the wells: one plate of frosted glass with a hole for every open cell.
    const plate = dishShape(GEL_R, 0.5);
    points.forEach((p, i) => {
      if (!blocked[i]) plate.holes.push(hexagon(new T.Path(), p.x, -p.z, WELL_R, 0.07, 0));
    });
    const lattice = this.add(
      flat(new T.ExtrudeGeometry(plate, { depth: LATTICE_H - 0.03, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 1, curveSegments: 2 })),
      this.surface({ color: "#a9bcc8", roughness: 0.26, metalness: 0.45, emissive: "#0e1c26", emissiveIntensity: 0.5 }),
      0,
      0.015,
      0,
    );
    lattice.castShadow = false;
    // Drawn before the gel, so that the gel under the walls is not drawn only to be covered.
    lattice.renderOrder = -1;
    // The glass wall round the gel, and the metal lip on top of it.
    const wall = dishShape(WALL_OUT, 0.58);
    wall.holes.push(dishShape(WALL_IN, 0.5));
    const glass = this.add(
      flat(new T.ExtrudeGeometry(wall, { depth: WALL_H, bevelEnabled: false, curveSegments: 6 })),
      this.rich
        ? this.own(new T.MeshStandardMaterial({ color: "#bfe8ff", roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.32, emissive: "#3a7a9a", emissiveIntensity: 0.25, depthWrite: false }))
        : this.own(new T.MeshBasicMaterial({ color: "#9fd2ec", transparent: true, opacity: 0.3, depthWrite: false })),
      0,
      0,
      0,
    );
    glass.castShadow = false;
    glass.renderOrder = 2;
    const lip = dishShape(WALL_OUT + 0.03, 0.6);
    lip.holes.push(dishShape(WALL_IN - 0.02, 0.48));
    this.add(flat(new T.ExtrudeGeometry(lip, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 2, curveSegments: 6 })), steel, 0, WALL_H, 0);
    // Crystal plugs in metal collars where a map walls a cell off.
    const shut = points.flatMap((p, i) => (blocked[i] ? [p] : []));
    if (shut.length) {
      const collar = new T.CylinderGeometry(WELL_R * 0.98, WELL_R * 1.02, LATTICE_H + 0.03, 6).rotateY(Math.PI / 6).translate(0, (LATTICE_H + 0.03) / 2, 0),
        prisms: T.BufferGeometry[] = [];
      for (const [x, z, r, h, lean, turn] of [
        [0, 0, 0.13, 0.36, 0, 0],
        [0.13, 0.06, 0.08, 0.24, 0.35, 0.4],
        [-0.12, 0.08, 0.085, 0.26, -0.32, 1.1],
        [0.02, -0.14, 0.07, 0.2, 0.3, 2.2],
        [-0.08, -0.1, 0.06, 0.16, -0.4, 0.7],
      ]) {
        const prism = new T.CylinderGeometry(r, r, h, 6).translate(0, h / 2, 0),
          tip = new T.ConeGeometry(r, r * 1.6, 6).translate(0, h + r * 0.8, 0),
          crystal = mergeGeometries([prism.toNonIndexed(), tip.toNonIndexed()])!;
        prism.dispose();
        tip.dispose();
        crystal.rotateY(turn).rotateZ(lean * 0.6).rotateX(lean * 0.4).translate(x, LATTICE_H, z);
        prisms.push(crystal);
      }
      const cluster = mergeGeometries(prisms)!.scale(1.45, 1.3, 1.45);
      for (const p of prisms) p.dispose();
      cluster.computeVertexNormals();
      const collars = new T.InstancedMesh(keep(collar), this.surface({ color: "#8a96a2", metalness: 0.7, roughness: 0.35 }), shut.length),
        crystals = new T.InstancedMesh(
          keep(cluster),
          this.standard({ color: "#b49cff", roughness: 0.08, metalness: 0.1, emissive: "#5a34d0", emissiveIntensity: 0.55, flatShading: true, transparent: true, opacity: 0.9 }),
          shut.length,
        ),
        place = new T.Object3D(),
        next = sequence(3);
      shut.forEach((p, k) => {
        place.position.set(p.x, 0, p.z);
        place.rotation.set(0, 0, 0);
        place.updateMatrix();
        collars.setMatrixAt(k, place.matrix);
        place.rotation.y = next() * Math.PI * 2;
        place.scale.setScalar(0.9 + next() * 0.2);
        place.updateMatrix();
        crystals.setMatrixAt(k, place.matrix);
        place.scale.setScalar(1);
      });
      collars.castShadow = crystals.castShadow = true;
      collars.receiveShadow = true;
      this.scene.add(collars, crystals);
    }
    // The dish floats: a soft light spreads under it.
    if (!this.rich) return;
    const under = new T.Mesh(
      keep(flat(new T.PlaneGeometry(14, 14))),
      keep(
        new T.MeshBasicMaterial({
          map: glowTexture(keep, [
            [0, "rgba(90,220,255,0.55)"],
            [0.45, "rgba(60,150,255,0.28)"],
            [1, "rgba(0,0,0,0)"],
          ]),
          transparent: true,
          depthWrite: false,
          blending: T.AdditiveBlending,
        }),
      ),
    );
    under.position.y = -0.9;
    this.scene.add(under);
  }
  /** A metal or frosted surface of the dish: lit fully where a graphics card draws, the cheap way elsewhere (metal there would look dark with nothing to reflect). */
  private surface(options: T.MeshStandardMaterialParameters) {
    if (this.rich) return this.standard(options);
    const { metalness = 0, roughness: _r, ...rest } = options;
    return this.own(new T.MeshLambertMaterial({ ...(rest as T.MeshLambertMaterialParameters), color: new T.Color(options.color ?? "#ffffff").multiplyScalar(1 - metalness * 0.25) }));
  }
  /** The top of the metal base: brushed round, with fine marks along its edge. In shape space, ±6 units across. */
  private rimTexture() {
    const size = 1024,
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const c = canvas.getContext("2d")!,
      u = size / 12,
      next = sequence(17);
    c.fillStyle = "#b9c3cc";
    c.fillRect(0, 0, size, size);
    for (let r = 0; r < size * 0.7; r += 1.5) {
      c.strokeStyle = `rgba(${next() < 0.5 ? "255,255,255" : "40,50,60"},${0.03 + next() * 0.05})`;
      c.beginPath();
      c.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      c.stroke();
    }
    c.strokeStyle = "rgba(30,40,50,0.55)";
    c.lineWidth = 2;
    for (let k = 0; k < 120; k++) {
      const a = (k / 120) * Math.PI * 2,
        r0 = (BASE_R - 0.02) * u * (k % 5 ? 0.985 : 0.965),
        r1 = (BASE_R - 0.02) * u;
      c.beginPath();
      c.moveTo(size / 2 + Math.cos(a) * r0, size / 2 + Math.sin(a) * r0);
      c.lineTo(size / 2 + Math.cos(a) * r1, size / 2 + Math.sin(a) * r1);
      c.stroke();
    }
    const t = this.own(new T.CanvasTexture(canvas));
    t.colorSpace = T.SRGBColorSpace;
    t.repeat.set(1 / 12, 1 / 12);
    t.offset.set(0.5, 0.5);
    t.anisotropy = 4;
    return t;
  }
  /** The gel: pale and clear, each well a little hollow (light in its middle), with tiny bubbles. */
  private gelTexture(blocked: boolean[]) {
    const size = 1024,
      span = GEL_R * 2 + 0.2,
      canvas = document.createElement("canvas");
    canvas.width = canvas.height = size;
    const c = canvas.getContext("2d")!,
      u = size / span,
      px = (x: number, z: number) => [size / 2 + x * u, size / 2 + z * u] as const,
      next = sequence(29);
    c.fillStyle = "#8fb0aa";
    c.fillRect(0, 0, size, size);
    this.board.points.forEach((p, i) => {
      if (blocked[i]) return;
      const [x, y] = px(p.x, p.z),
        r = WELL_R * u,
        g = c.createRadialGradient(x - r * 0.15, y - r * 0.2, 0, x, y, r);
      g.addColorStop(0, "#d9ece4");
      g.addColorStop(0.6, "#bcd8cf");
      g.addColorStop(1, "#86aaa3");
      c.fillStyle = g;
      c.beginPath();
      for (let k = 0; k < 6; k++) c.lineTo(x + Math.cos((Math.PI / 3) * k) * r, y + Math.sin((Math.PI / 3) * k) * r);
      c.fill();
    });
    for (let i = 0; i < 900; i++) {
      const [x, y] = [next() * size, next() * size],
        r = 0.6 + next() * 2.2;
      c.fillStyle = `rgba(255,255,255,${0.15 + next() * 0.35})`;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = "rgba(60,100,96,0.18)";
      c.lineWidth = 0.6;
      c.stroke();
    }
    const t = this.own(new T.CanvasTexture(canvas));
    t.colorSpace = T.SRGBColorSpace;
    t.repeat.set(1 / span, 1 / span);
    t.offset.set(0.5, 0.5);
    t.anisotropy = 4;
    return t;
  }
  protected subject() {
    return this.board.subject;
  }
  protected spots(): Spot[] {
    return this.board.points.map((p, point) => ({ x: p.x, y: 0.1, z: p.z, r: CELL * 0.86, point }));
  }
  private home(point: number) {
    const p = this.board.points[point];
    return new T.Vector3(p.x, 0, p.z);
  }
  /** Lays germ `g` at rest, in the side's colour (dimmed for a side that has lost). */
  private rest(g: Germ, point: number, owner: 0 | 1, dim = false) {
    g.group.visible = true;
    g.group.position.copy(this.home(point));
    g.group.scale.setScalar(1);
    g.group.rotation.set(0, 0, 0);
    g.body.material = (dim ? this.dimBodies : this.bodies)[owner];
    g.inner.material = (dim ? this.dimInsides : this.insides)[owner];
  }
  protected place(state: State) {
    for (const m of this.passing) m.dispose();
    this.passing = [];
    const w = state.winner,
      loser = w === 0 ? 1 : w === 1 ? 0 : null;
    state.cells.forEach((owner, i) => {
      const g = this.germs[i];
      if (owner === null) g.group.visible = false;
      else this.rest(g, i, owner, owner === loser);
    });
    this.neck.visible = this.ripple.visible = false;
    for (const d of this.droplets) d.visible = false;
    this.mark(this.marks);
  }
  /** Calls `fn` once, `delay` milliseconds from now. */
  private at(delay: number, fn: () => void) {
    let done = false;
    this.tween(delay, 1, (p) => {
      if (p >= 1 && !done) {
        done = true;
        fn();
      }
    });
  }
  private cue(kind: typeof germCue.kind, land = 0, count = 0) {
    germCue.kind = kind;
    germCue.land = land;
    germCue.count = count;
    this.onContact();
  }
  /** A ring running out over the gel where a germ came down. */
  private splash(point: number, color: string, delay: number) {
    this.tween(delay, 520, (p) => {
      this.ripple.visible = p < 1;
      this.ripple.position.set(this.home(point).x, 0.012, this.home(point).z);
      this.ripple.scale.setScalar(1 + p * 0.9);
      this.rippleMaterial.color.set(color);
      this.rippleMaterial.opacity = 0.75 * (1 - p);
    });
  }
  protected animate(before: State, state: State) {
    const effect = state.effect;
    if (!effect || state.ply !== before.ply + 1 || (effect.kind !== "clone" && effect.kind !== "jump")) return false;
    const side = state.cells[effect.to] ?? 0,
      from = this.home(effect.from),
      to = this.home(effect.to),
      dir = to.clone().sub(from).normalize(),
      mover = this.germs[effect.to],
      paint = SPECIES[side];
    // The table shows `before`; the germ that arrives is the one of the cell it arrives in.
    this.rest(mover, effect.to, side);
    let arrive: number;
    if (effect.kind === "clone") {
      arrive = 600;
      const parent = this.germs[effect.from],
        start = from.clone().addScaledVector(dir, 0.16),
        swell = (q: number) => Math.sin(Math.PI * Math.min(1, q / 0.75)),
        neck = this.neck;
      neck.material = this.bodies[side];
      mover.group.scale.setScalar(0.001);
      this.tween(0, arrive, (p) => {
        // The parent swells and leans toward the empty well, then lets the copy go.
        const s = swell(p);
        parent.group.position.copy(from).addScaledVector(dir, 0.07 * s);
        parent.group.scale.set(1 + 0.12 * s, 1 - 0.08 * s, 1 + 0.12 * s);
        const q = Math.max(0, Math.min(1, (p - 0.12) / 0.62)),
          e = q * q * (3 - 2 * q),
          grow = q < 1 ? 0.3 + 0.75 * e : 1 + 0.12 * Math.sin(Math.PI * Math.min(1, (p - 0.74) / 0.26)) * (1 - p);
        mover.group.position.lerpVectors(start, to, e);
        mover.group.scale.set(grow, q < 1 ? grow : 2 - grow, grow);
        // The thread of jelly between them thins and snaps.
        const joined = q > 0 && q < 0.62;
        neck.visible = joined && p < 1;
        if (joined) {
          const a = parent.group.position.clone().setY(GERM_H * 0.3),
            b = mover.group.position.clone().setY(GERM_H * 0.3 * grow),
            thick = 0.11 * Math.pow(1 - q / 0.62, 0.6) + 0.015;
          neck.position.lerpVectors(a, b, 0.5);
          neck.scale.set(thick, Math.max(0.01, a.distanceTo(b)), thick);
          neck.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        }
      });
      this.at(arrive * 0.5, () => this.cue("clone"));
      this.splash(effect.to, paint.rim, arrive * 0.72);
    } else {
      arrive = 780;
      this.germs[effect.from].group.visible = false;
      const crouch = 0.16,
        land = 0.86,
        axis = new T.Vector3(dir.z, 0, -dir.x);
      mover.group.position.copy(from);
      this.tween(0, arrive, (p) => {
        const g = mover.group;
        if (p < crouch) {
          // Wound up: a squat.
          const k = Math.sin((Math.PI / 2) * (p / crouch));
          g.position.copy(from);
          g.scale.set(1 + 0.18 * k, 1 - 0.3 * k, 1 + 0.18 * k);
        } else if (p < land) {
          // In flight: up in an arc, stretched, tumbling forward a little.
          const q = (p - crouch) / (land - crouch);
          g.position.lerpVectors(from, to, travel(q * 0.84));
          g.position.y = Math.sin(Math.PI * q) * 1.55;
          const stretch = Math.sin(Math.PI * q);
          g.scale.set(1 - 0.12 * stretch, 1 + 0.28 * stretch, 1 - 0.12 * stretch);
          g.quaternion.setFromAxisAngle(axis, Math.sin(Math.PI * q) * 0.55);
        } else {
          // Down with a splat, and a wobble as it settles.
          const q = (p - land) / (1 - land),
            k = Math.sin(Math.PI * q) * (1 - q * 0.4);
          g.position.copy(to);
          g.quaternion.identity();
          g.scale.set(1 + 0.24 * k, 1 - 0.34 * k, 1 + 0.24 * k);
        }
      });
      this.at(arrive * crouch, () => this.cue("jump", (arrive * (land - crouch)) / 1000));
      this.splash(effect.to, paint.rim, arrive * land);
      // Drops of jelly thrown out round the landing.
      this.droplets.forEach((d, k) => {
        const a = (k / this.droplets.length) * Math.PI * 2 + 0.4,
          out = new T.Vector3(Math.cos(a), 0, Math.sin(a));
        d.material = this.bodies[side];
        this.tween(arrive * land, 420, (p) => {
          d.visible = p < 1;
          d.position.copy(to).addScaledVector(out, 0.22 + p * 0.38);
          d.position.y = 0.08 + Math.sin(Math.PI * p) * 0.32;
          d.scale.setScalar(1.2 * (1 - p) + 0.01);
        });
      });
    }
    // The germs won over take the colour one after another, round the newcomer, each from the side facing it.
    const converted = effect.converted
        .map((point) => ({ point, angle: Math.atan2(this.home(point).z - to.z, this.home(point).x - to.x) }))
        .sort((a, b) => a.angle - b.angle)
        .map((x) => x.point),
      start = arrive + 60,
      gap = 130;
    if (converted.length) this.at(start, () => this.cue("convert", 0, converted.length));
    converted.forEach((point, k) => {
      const g = this.germs[point],
        before0 = before.cells[point] ?? 0,
        spreading = germMaterial(SPECIES[before0].body, SPECIES[before0].rim, this.uniforms),
        u = spreading.userData.germ as GermUniforms;
      this.passing.push(spreading);
      u.uOther.value.set(paint.body);
      u.uOtherRim.value.set(paint.rim);
      u.uDir.value.copy(to).sub(this.home(point)).normalize();
      this.tween(start + k * gap, 520, (p) => {
        if (p > 0 && g.body.material !== spreading && p < 1) g.body.material = spreading;
        u.uSpread.value = -0.1 + 1.25 * p;
        if (p >= 0.5) g.inner.material = this.insides[side];
        const gulp = Math.sin(Math.PI * p) * (1 - 0.3 * p);
        g.group.scale.set(1 + 0.16 * gulp, 1 + 0.1 * gulp, 1 + 0.16 * gulp);
        g.group.rotation.y = Math.sin(p * Math.PI * 3) * 0.12 * (1 - p);
        if (p >= 1) {
          g.body.material = this.bodies[side];
          g.group.scale.setScalar(1);
          g.group.rotation.y = 0;
        }
      });
    });
    let end = converted.length ? start + (converted.length - 1) * gap + 520 : arrive;
    // A side left without a move: the empty wells fill with the other's germs, sprouting outward from the last move.
    const filled = state.cells.flatMap((owner, i) => (owner !== null && before.cells[i] === null && i !== effect.to ? [i] : [])).sort((a, b) => this.home(a).distanceTo(to) - this.home(b).distanceTo(to));
    filled.forEach((point, k) => {
      const g = this.germs[point],
        owner = state.cells[point]!;
      this.tween(end + 120 + k * 28, 380, (p) => {
        if (p > 0 && !g.group.visible) this.rest(g, point, owner);
        const s = p < 0.7 ? (p / 0.7) * 1.12 : 1.12 - 0.12 * ((p - 0.7) / 0.3);
        g.group.scale.setScalar(Math.max(0.001, s));
      });
    });
    if (filled.length) {
      this.at(end + 120, () => this.cue("clone"));
      end += 120 + filled.length * 28 + 380;
    }
    // The winners hop for joy, a wave running out from the middle of the dish.
    const w = state.winner;
    if ((w === 0 || w === 1) && before.winner === null)
      state.cells.forEach((owner, point) => {
        if (owner !== w) return;
        const g = this.germs[point],
          home = this.home(point);
        this.tween(end + 150 + home.length() * 70, 460, (p) => {
          g.group.position.y = Math.sin(Math.PI * p) * 0.32;
          const k = p > 0.8 ? Math.sin((Math.PI * (p - 0.8)) / 0.2) : 0;
          g.group.scale.set(1 + 0.15 * k, 1 - 0.2 * k, 1 + 0.15 * k);
        });
      });
    return true;
  }
  protected hover(point: number) {
    this.hovered = point;
    this.mark(this.marks);
  }
  /** Lays the marks out (none while the table moves). */
  protected mark(marks: Marks) {
    const s = this.state,
      busy = this.animating || !s;
    const fill = (mesh: T.InstancedMesh, points: number[]) => {
      const m = new T.Matrix4();
      mesh.count = busy ? 0 : points.length;
      points.forEach((point, k) => {
        const p = this.board.points[point];
        mesh.setMatrixAt(k, m.makeTranslation(p.x, 0, p.z));
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    const chosen = marks.selected,
      near = chosen !== null && chosen >= 0 ? new Set(NEAR[chosen]) : new Set<number>(),
      nearTargets = marks.targets.filter((t) => near.has(t)),
      farTargets = marks.targets.filter((t) => !near.has(t));
    fill(this.marksMesh.movable, marks.movable.filter((p) => p !== chosen));
    fill(this.marksMesh.near, nearTargets);
    fill(this.marksMesh.nearFill, nearTargets);
    fill(this.marksMesh.far, farTargets);
    // A target under the mouse (or the keyboard) shows which germs the move would win.
    const aim = marks.targets.includes(this.hovered) ? this.hovered : marks.cursor !== null && marks.targets.includes(marks.cursor) ? marks.cursor : -1,
      foe = s ? (s.turn === 0 ? 1 : 0) : 1;
    const won = aim >= 0 && s ? NEAR[aim].filter((n) => s.cells[n] === foe) : [];
    this.flipping = new Set(busy ? [] : won);
    fill(this.marksMesh.flip, won);
    if (s) (this.marksMesh.flip.material as T.MeshBasicMaterial).color.set(SPECIES[s.turn].body);
    const put = (mesh: T.Mesh, point: number | null | undefined) => {
      mesh.visible = !busy && point !== null && point !== undefined && point >= 0 && point < this.board.points.length;
      if (mesh.visible) {
        const p = this.board.points[point!];
        mesh.position.set(p.x, mesh.position.y, p.z);
      }
    };
    put(this.selected, chosen);
    put(this.cursor, marks.cursor);
    const effect = s?.effect;
    put(this.last, effect && s.winner === null ? effect.to : null);
    if (effect && s) this.last.material = this.lastMaterials[s.cells[effect.to] ?? 0];
    // The germ picked up stands a little taller.
    this.germs.forEach((g, i) => g.pulse.position.setY(!busy && i === chosen ? 0.05 : 0));
    this.redraw();
  }
  /**
   * The table's own clock: where a graphics card draws (and motion is not reduced), the germs breathe and their
   * skins wobble, the marks glow softly and the worlds turn. Drawn by the processor alone (as in the browser tests),
   * the table is drawn only when something moves, as before.
   */
  private tick = (now: number) => {
    if (this.disposed) return;
    this.ticking = requestAnimationFrame(this.tick);
    const t = now / 1000;
    if (!this.live) {
      if (this.animating) this.uniforms.value = t;
      return;
    }
    this.uniforms.value = t;
    const s = this.state,
      turn = s?.winner === null ? s.turn : -1;
    this.germs.forEach((g, i) => {
      if (!g.group.visible) return;
      const mine = s?.cells[i] === turn,
        amount = mine ? 0.05 : 0.028,
        a = t * (mine ? 2.6 : 1.9) + i * 1.37,
        breathe = Math.sin(a);
      g.pulse.scale.set(1 + amount * breathe, 1 - amount * 0.8 * breathe, 1 + amount * Math.sin(a + 0.9));
      // The germs a hovered move would win tremble.
      const shiver = this.flipping.has(i);
      g.pulse.rotation.y = shiver ? Math.sin(t * 38 + i) * 0.08 : Math.sin(t * 0.4 + i) * 0.15;
      g.inner.rotation.y = t * 0.3 + i;
    });
    for (const m of this.markMaterials) m.opacity = m.userData.base * (0.78 + 0.22 * Math.sin(t * 4));
    this.turning[0]?.rotateY(0.0006);
    this.turning[1]?.rotateY(0.0012);
    this.redraw();
  };
  dispose() {
    cancelAnimationFrame(this.ticking);
    for (const m of this.passing) m.dispose();
    this.passing = [];
    super.dispose();
  }
}
