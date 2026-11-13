import * as T from "three";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { GO, type Actor, type State } from "./rules";

export const RIVER_COLORS: [string, string] = ["#3f8fd0", "#b9b3a4"];
/** Where the boat lies at either bank, and the colours of the couples. */
const BOAT_X = 1.5,
  BOAT_Z = 0,
  FAMILY = ["#c8452f", "#2f62c0", "#3f9a55", "#e0a92a"];
/** Where the k-th of those waiting on a bank stands: two rows back from the water. */
const stand = (side: number, k: number) => ({ x: (side ? 1 : -1) * (4.0 + (k % 2) * 2.2), z: -3.0 + Math.floor(k / 2) * 1.4 + (k % 2) * 0.45 });
/**
 * A river between two green banks, a rowing boat, and the company that has
 * to cross: people and animals modelled plainly. A tap on someone puts them
 * in the boat or takes them out; a tap on the boat sends it across.
 */
export class RiverView extends TableView<State> {
  private figures: T.Group[] = [];
  private built = "";
  private boat = new T.Group();
  private chosen: T.Mesh[] = [];
  private cursor: T.Mesh;
  private arrow = new T.Group();
  private own_ = <R extends { dispose(): void }>(r: R) => this.own(r);
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#bfe3f2");
    this.daylight("#ffffff", "#7fa66a", "#fff4d6", 12, 2.2);
    const grass = this.standard({ color: "#7fb45a", roughness: 1 }),
      sand = this.standard({ color: "#d9c58f", roughness: 1 });
    for (const side of [-1, 1]) {
      this.add(new T.BoxGeometry(14, 0.6, 22), grass, side * 9.4, -0.3, 0).castShadow = false;
      this.add(new T.BoxGeometry(0.9, 0.5, 22), sand, side * 2.75, -0.32, 0).castShadow = false;
      // Trees and reeds along the banks, clear of where the company stands.
      for (const [x, z, s] of [[8.2, -7.5, 1.3], [6.2, -8.6, 1], [9.3, 6.2, 1.1], [7.4, 7.6, 0.8]] as const) {
        this.add(new T.CylinderGeometry(0.18 * s, 0.24 * s, 1.4 * s, 10), this.standard({ color: "#7a5230" }), side * x, 0.7 * s, z);
        this.add(new T.ConeGeometry(1.1 * s, 2.4 * s, 14), this.standard({ color: "#3f8a4a", roughness: 0.9 }), side * x, 2.5 * s, z);
        this.add(new T.ConeGeometry(0.8 * s, 1.8 * s, 14), this.standard({ color: "#4fa05a", roughness: 0.9 }), side * x, 3.6 * s, z);
      }
      for (let i = 0; i < 9; i++) this.add(new T.CylinderGeometry(0.03, 0.05, 0.9 + (i % 3) * 0.3, 6), this.standard({ color: "#6f9a4a" }), side * (2.5 + (i % 2) * 0.2), 0.3, -6.5 + i * 0.28 + (i > 4 ? 10.5 : 0)).castShadow = false;
    }
    // The water: deep in the middle, with pale streaks of current.
    this.add(new T.BoxGeometry(5.6, 0.3, 22), this.standard({ color: "#3f8fd0", roughness: 0.25 }), 0, -0.42, 0).castShadow = false;
    const streak = this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35 }));
    for (let i = 0; i < 14; i++) {
      const line = new T.Mesh(this.own(new T.PlaneGeometry(0.06, 1.2 + (i % 3) * 0.6)), streak);
      line.rotation.x = -Math.PI / 2;
      line.position.set(-2.1 + ((i * 37) % 43) / 10, -0.26, -8 + i * 1.25);
      this.scene.add(line);
    }
    // The boat: a hull with pointed ends, two thwarts and a pair of oars.
    const plank = this.standard({ color: "#9a6a3c", roughness: 0.7 }),
      inside = this.standard({ color: "#c79a62", roughness: 0.8 }),
      hull = new T.Mesh(this.own(new T.SphereGeometry(1, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2)), plank),
      deck = new T.Mesh(this.own(new T.CircleGeometry(0.96, 24)), inside);
    hull.scale.set(1.15, 0.55, 2.0);
    deck.rotation.x = -Math.PI / 2;
    deck.scale.set(1.15, 2.0, 1);
    deck.position.y = -0.04;
    hull.castShadow = true;
    this.boat.add(hull, deck);
    for (const z of [-0.6, 0.6]) {
      const thwart = new T.Mesh(this.own(new T.BoxGeometry(2.3, 0.08, 0.3)), plank);
      thwart.position.set(0, 0.02, z);
      this.boat.add(thwart);
    }
    for (const side of [-1, 1]) {
      const oar = new T.Mesh(this.own(new T.CylinderGeometry(0.035, 0.035, 2.2, 8)), this.standard({ color: "#e8d9b5" }));
      oar.rotation.z = side * 1.1;
      oar.position.set(side * 1.7, -0.05, 0);
      this.boat.add(oar);
    }
    this.boat.position.set(-BOAT_X, -0.12, BOAT_Z);
    this.scene.add(this.boat);
    for (let i = 0; i < 4; i++) this.chosen.push(ringMesh(this.own_, 0.5, 0.62, "#ffd24a"));
    this.cursor = ringMesh(this.own_, 0.5, 0.62, "#3f8cff");
    const gold = this.own(new T.MeshBasicMaterial({ color: "#f0a020", depthTest: false, transparent: true, opacity: 0.96, side: T.DoubleSide })),
      tip = new T.Mesh(this.own(new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0), new T.Vector2(-0.42, 0.56), new T.Vector2(0.42, 0.56)]))), gold),
      shaft = new T.Mesh(this.own(new T.PlaneGeometry(0.26, 0.8)), gold);
    shaft.position.y = 0.94;
    shaft.renderOrder = tip.renderOrder = 9;
    this.arrow.add(shaft, tip);
    this.arrow.visible = false;
    this.scene.add(...this.chosen, this.cursor, this.arrow);
    this.begin();
  }
  /** A ball, a box, a cone or a rod of a colour, added to a figure. */
  private part(to: T.Group, shape: "ball" | "box" | "cone" | "rod", color: string, size: [number, number, number], at: [number, number, number], turn: [number, number, number] = [0, 0, 0]) {
    const geometry = shape === "ball" ? new T.SphereGeometry(0.5, 18, 14) : shape === "box" ? new T.BoxGeometry(1, 1, 1) : shape === "cone" ? new T.ConeGeometry(0.5, 1, 16) : new T.CylinderGeometry(0.5, 0.5, 1, 14),
      mesh = new T.Mesh(this.own(geometry), this.standard({ color, roughness: 0.75 }));
    mesh.scale.set(...size);
    mesh.position.set(...at);
    mesh.rotation.set(...turn);
    mesh.castShadow = true;
    to.add(mesh);
    return mesh;
  }
  /** A person: legs, a coat (a skirt for a wife), a head, and a hat or hair. */
  private person(g: T.Group, coat: string, kind: "farmer" | "husband" | "wife") {
    const skin = "#f2c9a0";
    if (kind === "wife") this.part(g, "cone", coat, [0.95, 1.0, 0.95], [0, 0.5, 0]);
    else {
      for (const x of [-0.14, 0.14]) this.part(g, "rod", "#3b4a5a", [0.2, 0.6, 0.2], [x, 0.3, 0]);
      this.part(g, "rod", coat, [0.62, 0.7, 0.5], [0, 0.9, 0]);
    }
    if (kind === "wife") this.part(g, "rod", coat, [0.5, 0.45, 0.42], [0, 1.1, 0]);
    for (const x of [-0.4, 0.4]) this.part(g, "rod", coat, [0.16, 0.55, 0.16], [x, 0.98, 0], [0, 0, x > 0 ? -0.25 : 0.25]);
    this.part(g, "ball", skin, [0.5, 0.52, 0.5], [0, 1.58, 0]);
    for (const x of [-0.09, 0.09]) this.part(g, "ball", "#27333a", [0.06, 0.06, 0.06], [x, 1.62, 0.23]).castShadow = false;
    if (kind === "farmer") {
      this.part(g, "rod", "#e3c56f", [1.0, 0.05, 1.0], [0, 1.82, 0]);
      this.part(g, "cone", "#e3c56f", [0.56, 0.36, 0.56], [0, 2.0, 0]);
    } else if (kind === "husband") this.part(g, "ball", "#3a2c22", [0.54, 0.3, 0.54], [0, 1.78, -0.03]);
    else {
      this.part(g, "ball", "#5a3a22", [0.6, 0.5, 0.6], [0, 1.66, -0.1]);
      this.part(g, "ball", "#5a3a22", [0.26, 0.26, 0.26], [0, 1.98, -0.12]);
    }
  }
  /** A four-legged animal: body, legs, head with ears, a tail. */
  private beast(g: T.Group, coat: string, o: { size?: number; head?: string; ears?: "point" | "round" | "droop"; snout?: number; tail?: "bush" | "thin" | "none"; woolly?: boolean; horns?: boolean }) {
    const s = o.size ?? 1,
      head = o.head ?? coat;
    this.part(g, "ball", coat, [0.75 * s, 0.62 * s, 1.25 * s], [0, 0.72 * s, 0]);
    if (o.woolly) for (const [x, y, z] of [[-0.25, 0.95, -0.3], [0.25, 0.95, 0.1], [0, 1.02, 0.4], [-0.2, 0.9, 0.3], [0.22, 0.92, -0.4]]) this.part(g, "ball", coat, [0.5 * s, 0.45 * s, 0.5 * s], [x * s, y * s, z * s]);
    for (const x of [-0.22, 0.22]) for (const z of [-0.42, 0.42]) this.part(g, "rod", o.woolly ? head : coat, [0.14 * s, 0.5 * s, 0.14 * s], [x * s, 0.25 * s, z * s]);
    this.part(g, "ball", head, [0.5 * s, 0.48 * s, 0.56 * s], [0, 1.02 * s, 0.72 * s]);
    this.part(g, "ball", head, [0.26 * s, 0.24 * s, (o.snout ?? 0.4) * s], [0, 0.94 * s, (0.95 + (o.snout ?? 0.4) * 0.3) * s]);
    this.part(g, "ball", "#1f2933", [0.1 * s, 0.09 * s, 0.1 * s], [0, 0.96 * s, (1.0 + (o.snout ?? 0.4) * 0.75) * s]).castShadow = false;
    for (const x of [-0.14, 0.14]) this.part(g, "ball", "#1f2933", [0.07 * s, 0.07 * s, 0.07 * s], [x * s, 1.12 * s, 0.95 * s]).castShadow = false;
    for (const x of [-0.17, 0.17])
      if (o.ears === "round") this.part(g, "ball", head, [0.2 * s, 0.2 * s, 0.08 * s], [x * s, 1.3 * s, 0.66 * s]);
      else if (o.ears === "droop") this.part(g, "ball", head, [0.12 * s, 0.26 * s, 0.14 * s], [x * 1.5 * s, 1.02 * s, 0.66 * s]);
      else this.part(g, "cone", head, [0.18 * s, 0.28 * s, 0.14 * s], [x * s, 1.36 * s, 0.64 * s]);
    if (o.horns) for (const x of [-0.1, 0.1]) this.part(g, "cone", "#d9cdb5", [0.08 * s, 0.34 * s, 0.08 * s], [x * s, 1.42 * s, 0.56 * s], [-0.5, 0, 0]);
    if (o.tail === "bush") this.part(g, "ball", coat, [0.26 * s, 0.26 * s, 0.7 * s], [0, 0.82 * s, -0.95 * s], [0.5, 0, 0]);
    else if (o.tail === "thin") this.part(g, "rod", coat, [0.07 * s, 0.6 * s, 0.07 * s], [0, 0.85 * s, -0.8 * s], [-0.9, 0, 0]);
  }
  private model(actor: Actor) {
    const g = new T.Group(),
      role = actor.role;
    g.scale.setScalar(1.2);
    if (role === "farmer") this.person(g, "#4f7f4a", "farmer");
    else if (role === "husband" || role === "wife") this.person(g, FAMILY[actor.pair % FAMILY.length], role);
    else if (role === "wolf") this.beast(g, "#7c858c", { size: 1.05, head: "#8b949b", snout: 0.5, tail: "bush" });
    else if (role === "fox") this.beast(g, "#d9742a", { size: 0.85, snout: 0.5, tail: "bush" });
    else if (role === "cat") this.beast(g, "#e59a3c", { size: 0.7, snout: 0.2, tail: "thin" });
    else if (role === "goat") this.beast(g, "#f1ece0", { size: 0.9, ears: "droop", horns: true, tail: "none" });
    else if (role === "sheep") this.beast(g, "#f6f3ea", { size: 0.9, head: "#3a332c", ears: "droop", woolly: true, tail: "none", snout: 0.3 });
    else if (role === "mouse") this.beast(g, "#a9a39b", { size: 0.45, ears: "round", snout: 0.3, tail: "thin" });
    else if (role === "hen") {
      this.part(g, "ball", "#fbf7ee", [0.6, 0.6, 0.8], [0, 0.5, 0]);
      this.part(g, "ball", "#fbf7ee", [0.34, 0.36, 0.34], [0, 0.95, 0.3]);
      this.part(g, "cone", "#e0a92a", [0.12, 0.2, 0.12], [0, 0.93, 0.52], [Math.PI / 2, 0, 0]);
      this.part(g, "ball", "#c8352b", [0.1, 0.16, 0.2], [0, 1.16, 0.28]);
      this.part(g, "cone", "#fbf7ee", [0.3, 0.5, 0.2], [0, 0.72, -0.42], [-0.9, 0, 0]);
      for (const x of [-0.12, 0.12]) this.part(g, "rod", "#e0a92a", [0.05, 0.24, 0.05], [x, 0.12, 0.02]);
    } else if (role === "cabbage") {
      this.part(g, "ball", "#7fbf5a", [0.9, 0.8, 0.9], [0, 0.4, 0]);
      for (let i = 0; i < 5; i++) this.part(g, "ball", "#9fd472", [0.6, 0.5, 0.24], [Math.sin(i * 1.26) * 0.34, 0.4, Math.cos(i * 1.26) * 0.34], [0, i * 1.26, 0]);
    } else if (role === "grain") {
      this.part(g, "ball", "#d2b680", [0.85, 1.0, 0.7], [0, 0.5, 0]);
      this.part(g, "rod", "#b99a62", [0.3, 0.2, 0.3], [0, 1.02, 0]);
      this.part(g, "rod", "#8a6a3a", [0.36, 0.05, 0.36], [0, 0.94, 0]);
    } else {
      // Cheese: a thick wedge with holes.
      this.part(g, "rod", "#f2c33a", [1.0, 0.5, 1.0], [0, 0.25, 0]).geometry = this.own(new T.CylinderGeometry(0.5, 0.5, 1, 3));
      for (const [x, z] of [[0.1, 0.2], [-0.15, -0.05], [0.2, -0.15]]) this.part(g, "ball", "#d9a520", [0.16, 0.05, 0.16], [x, 0.51, z]).castShadow = false;
    }
    return g;
  }
  /** Builds the company anew when it is not the one shown. */
  private cast(state: State) {
    const key = state.actors.map((a) => a.role + a.pair).join();
    if (key === this.built) return;
    this.built = key;
    for (const figure of this.figures) this.scene.remove(figure);
    this.figures = state.actors.map((actor) => {
      const figure = this.model(actor);
      this.scene.add(figure);
      return figure;
    });
  }
  /** Where an actor is: in the boat, or in its place on its bank (those in the boat leave their places free). */
  private spot(state: State, i: number, aboard = state.aboard, boat: number = state.boat, sides = state.actors.map((a) => a.side as number)) {
    const seat = aboard.indexOf(i);
    if (seat >= 0) return { x: (boat ? 1 : -1) * BOAT_X, y: 0.02, z: BOAT_Z + (seat - (aboard.length - 1) / 2) * 0.95, face: boat ? -1 : 1 };
    const side = sides[i],
      place = stand(side, i);
    return { x: place.x, y: 0, z: place.z, face: side ? -1 : 1 };
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 5.4 : 7.3, halfZ: 3.7, height: 2.6, lookY: 0.5, tilt: 0.9 };
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    return [...state.actors.map((_, i) => ({ ...this.spot(state, i), y: 0.9, r: 0.85, point: i })), { x: (state.boat ? 1 : -1) * BOAT_X, y: 0, z: BOAT_Z - 1.9, r: 0.9, point: GO }, { x: (state.boat ? 1 : -1) * BOAT_X, y: 0, z: BOAT_Z + 1.9, r: 0.9, point: GO }];
  }
  private put(i: number, at: { x: number; y: number; z: number; face: number }) {
    this.figures[i].position.set(at.x, at.y, at.z);
    this.figures[i].rotation.y = (at.face * Math.PI) / 2;
  }
  protected place(state: State) {
    this.cast(state);
    this.boat.position.x = (state.boat ? 1 : -1) * BOAT_X;
    state.actors.forEach((_, i) => this.put(i, this.spot(state, i)));
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    this.cast(state);
    if (!last || state.ply !== before.ply + 1) {
      // Getting in or out: a short hop to the new place.
      const moved = state.actors.map((_, i) => i).filter((i) => before.aboard.includes(i) !== state.aboard.includes(i) || before.aboard.indexOf(i) !== state.aboard.indexOf(i));
      if (!moved.length || before.actors.length !== state.actors.length) return false;
      this.place(before);
      this.tween(0, 260, (p) => {
        for (const i of moved) {
          const a = this.spot(before, i),
            b = this.spot(state, i);
          this.put(i, { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p + Math.sin(p * Math.PI) * 0.6, z: a.z + (b.z - a.z) * p, face: b.face });
        }
        if (p === 1) this.onContact();
      });
      return true;
    }
    // The boat is rowed across with its riders, who then step out onto the bank.
    const from = (last.from ? 1 : -1) * BOAT_X,
      sides = before.actors.map((a) => a.side as number);
    this.place(before);
    this.tween(0, 1100, (p) => {
      const ease = p * p * (3 - 2 * p),
        x = from + (-from - from) * ease;
      this.boat.position.x = x;
      this.boat.rotation.z = Math.sin(p * Math.PI * 4) * 0.03;
      last.riders.forEach((i) => {
        const seat = this.spot(before, i, last.riders, last.from, sides);
        this.put(i, { ...seat, x, y: 0.02 + Math.abs(Math.sin(p * Math.PI * 4)) * 0.03 });
      });
    });
    this.tween(1100, 320, (p) => {
      this.boat.rotation.z = 0;
      last.riders.forEach((i) => {
        const a = this.spot(before, i, last.riders, last.from ? 0 : 1, sides),
          b = this.spot(state, i);
        this.put(i, { x: a.x + (b.x - a.x) * p, y: Math.sin(p * Math.PI) * 0.7, z: a.z + (b.z - a.z) * p, face: b.face });
      });
      if (p === 1) this.onContact();
    });
    return true;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    // A ring under each rider, the keyboard's place, and the arrow of a hint over whoever (or the boat) is to be pressed.
    this.chosen.forEach((ring, k) => {
      const i = state?.aboard[k];
      ring.visible = !!state && i !== undefined && state.winner === null;
      if (state && i !== undefined) {
        const at = this.spot(state, i);
        ring.position.set(at.x, 0.1, at.z);
      }
    });
    const at = (point: number) => (!state ? null : point === GO ? { x: (state.boat ? 1 : -1) * BOAT_X, z: BOAT_Z, y: 1.9 } : point >= 0 && point < state.actors.length ? { ...this.spot(state, point), y: 2.5 } : null),
      cursor = marks.cursor === null ? null : at(marks.cursor === state?.actors.length ? GO : marks.cursor),
      hint = marks.hint ? at(marks.hint.to) : null;
    this.cursor.visible = !!cursor;
    if (cursor) this.cursor.position.set(cursor.x, 0.12, cursor.z);
    this.arrow.visible = !!hint;
    if (hint) this.arrow.position.set(hint.x, hint.y, hint.z);
  }
}
