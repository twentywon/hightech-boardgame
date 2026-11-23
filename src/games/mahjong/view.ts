import * as T from "three";
import { capable } from "../../engine/scene-utils";
import { capturing } from "../../ui/banner";
import type { Move } from "../points/types";
import type { Marks } from "../points/view";
import { TableView, type Spot } from "../table/view";
import { tileKit, type Look } from "./faces";
import { D, FADE_MS, H, LAYER, MEET_MS, RISE_MS, W, extent, mahjongSubject, tileAt, trayAt } from "./layout";
import { STAGES, freeIn, pickable, stageOf, touchOf, type Slot, type State } from "./rules";
import { teaHouse } from "./teahouse";

/** What the last sound asked of the view was for: a tile picked, a pair matched, the tiles dealt again. */
export const mahjongCue: { kind: "pick" | "match" | "shuffle" } = { kind: "pick" };
export const TILE_COLORS: [string, string] = ["#f4ead2", "#1f7a52"];
/** How high a picked tile is lifted. */
const LIFT = 0.16;
/** How many tiles the tray shows lying in it at most (two by three, three deep). */
const PILE = 18;
const ease = (p: number) => p * p * (3 - 2 * p);
const clamp = (p: number) => Math.max(0, Math.min(1, p));

/** A rectangle with a tile's shape cut out of it, lying flat: a frame round a tile's face. */
function frameGeometry(margin: number, width: number) {
  const outer = new T.Shape(),
    w = W / 2 + margin,
    d = D / 2 + margin;
  outer.moveTo(-w, -d);
  outer.lineTo(w, -d);
  outer.lineTo(w, d);
  outer.lineTo(-w, d);
  outer.closePath();
  const hole = new T.Path(),
    iw = w - width,
    id = d - width;
  hole.moveTo(-iw, -id);
  hole.lineTo(-iw, id);
  hole.lineTo(iw, id);
  hole.lineTo(iw, -id);
  hole.closePath();
  outer.holes.push(hole);
  return new T.ShapeGeometry(outer).rotateX(-Math.PI / 2);
}
/** A soft golden glow, for under a picked tile. */
function haloTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    g = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, "rgba(255,214,120,0.95)");
  g.addColorStop(0.5, "rgba(255,190,80,0.45)");
  g.addColorStop(1, "rgba(255,170,60,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
interface Flyer {
  mesh: T.Mesh;
  material: T.MeshStandardMaterial | T.MeshLambertMaterial;
  from: T.Vector3;
  to: T.Vector3;
  start: number;
  live: boolean;
}

/**
 * Mahjong solitaire in a tea house: the layout's tiles on a rattan mat, the free ones a little brighter, the one
 * under the pointer warmer, a picked one lifted and glowing, the hint's two framed in gold. A pair taken rises, the
 * two come together with a click and a chime, and drift into the tray at the right, fading; a 다시 섞기 turns every
 * tile left over in a wave and shows its new face. A tap on a tile that cannot be taken is told in words and the tile
 * shakes. The canvas carries `data-present`, `data-free`, `data-pickable`, `data-selected`, `data-hint`,
 * `data-cursor`, `data-shuffles`, `data-faces` and `data-places` (where each tile that can be seen may be tapped, in CSS pixels).
 */
export class MahjongView extends TableView<State> {
  private slots: readonly Slot[];
  private kit: ReturnType<typeof tileKit>;
  private tiles: T.Mesh[] = [];
  private faceShown: number[] = [];
  private rayCaster = new T.Raycaster();
  private hovered = -1;
  private selected = -1;
  private hinted: number[] = [];
  private cursorAt = -1;
  private halo: T.Mesh;
  private hintFrames: T.Mesh[] = [];
  private cursorFrame: T.Mesh;
  private pile: T.InstancedMesh;
  private pileShown = 0;
  private pileTarget = 0;
  private trayPlace: { x: number; z: number };
  private flyers: Flyer[] = [];
  private shakes = new Map<number, number>();
  private clock = 0;
  private press = -1;
  constructor(host: HTMLElement, quality: "high" | "low", variant: string) {
    super(host, quality, "#2a1a12");
    const rich = capable();
    this.slots = STAGES[stageOf(Number(variant)) - 1].slots;
    const e = extent(this.slots);
    this.trayPlace = trayAt(this.slots);
    this.daylight("#fff2dc", "#4a2c1c", "#ffe9c8", Math.max(e.x, e.z) + 7, 2.1);
    const room = teaHouse(this.scene, (r) => this.own(r), rich, 2 * e.x + 1.1, 2 * e.z + 1.0, this.trayPlace);
    this.kit = tileKit((r) => this.own(r));
    this.slots.forEach((_, i) => {
      const mesh = new T.Mesh(this.kit.geometry(0), this.kit.looks.blocked);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.slot = i;
      this.tiles.push(mesh);
      this.faceShown.push(0);
      this.scene.add(mesh);
    });
    // The tiles taken, lying face down in the tray.
    this.pile = new T.InstancedMesh(this.kit.geometry(33), this.kit.looks.free, PILE);
    this.pile.castShadow = this.pile.receiveShadow = true;
    this.pile.count = 0;
    // Its bounds change as it fills: never left out of the picture for them.
    this.pile.frustumCulled = false;
    room.tray.add(this.pile);
    for (let k = 0; k < 4; k++) {
      const material = this.own(this.kit.looks.free.clone());
      material.transparent = true;
      const mesh = new T.Mesh(this.kit.geometry(0), material);
      mesh.visible = false;
      mesh.castShadow = true;
      this.scene.add(mesh);
      this.flyers.push({ mesh, material, from: new T.Vector3(), to: new T.Vector3(), start: 0, live: false });
    }
    this.halo = new T.Mesh(
      this.own(new T.PlaneGeometry(W * 2.1, D * 1.9).rotateX(-Math.PI / 2)),
      this.own(new T.MeshBasicMaterial({ map: this.own(haloTexture()), transparent: true, depthWrite: false, blending: T.AdditiveBlending })),
    );
    this.halo.visible = false;
    this.halo.renderOrder = 4;
    this.scene.add(this.halo);
    const gold = this.own(new T.MeshBasicMaterial({ color: "#ffcf4a", transparent: true, opacity: 0.95, depthWrite: false, side: T.DoubleSide })),
      ring = this.own(frameGeometry(0.06, 0.1));
    for (let k = 0; k < 2; k++) {
      const frame = new T.Mesh(ring, gold);
      frame.visible = false;
      frame.renderOrder = 6;
      this.hintFrames.push(frame);
      this.scene.add(frame);
    }
    this.cursorFrame = new T.Mesh(this.own(frameGeometry(0.08, 0.09)), this.own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9, depthWrite: false, side: T.DoubleSide })));
    this.cursorFrame.visible = false;
    this.cursorFrame.renderOrder = 7;
    this.scene.add(this.cursorFrame);
    this.begin();
  }
  protected subject(aspect: number) {
    return mahjongSubject(this.slots, aspect);
  }
  protected spots(): Spot[] {
    return [];
  }
  /** The tile a ray strikes first (a lifted or higher tile before what lies behind it), or -1. */
  protected pick(ray: T.Ray): number {
    this.rayCaster.ray.copy(ray);
    const hit = this.rayCaster.intersectObjects(
      this.tiles.filter((t) => t.visible),
      false,
    )[0];
    return hit ? (hit.object.userData.slot as number) : -1;
  }
  protected hover(point: number) {
    if (point === this.hovered) return;
    this.hovered = point;
    this.paintLooks();
  }
  /** A press on a tile that cannot be chosen now is taken here, so that it is sent as a move and refused with words. */
  protected dragStart(point: number) {
    const state = this.state;
    if (!state || state.winner !== null || point < 0 || !state.present[point] || pickable(state).has(point)) return false;
    this.press = point;
    return true;
  }
  protected dragEnd(at: { x: number; y: number; z: number } | null) {
    const press = this.press;
    this.press = -1;
    if (press < 0 || !at || !this.state) return;
    this.onMove({ from: -1, to: press, extra: -1 });
  }
  /** The screen refused a tap of mine: the tile shakes a little where it lies. */
  refused(move: Move) {
    const tile = move.from === -1 ? move.to : move.from;
    if (tile < 0 || tile >= this.tiles.length || this.reducedMotion) return;
    this.shakes.set(tile, performance.now());
    this.kick();
  }
  /** The tile of a slot at rest where it lies, showing `face`. */
  private rest(i: number, face: number) {
    const mesh = this.tiles[i],
      at = tileAt(this.slots[i]);
    if (this.faceShown[i] !== face) {
      mesh.geometry = this.kit.geometry(face);
      this.faceShown[i] = face;
    }
    mesh.position.set(at.x, at.y, at.z);
    mesh.rotation.set(0, 0, 0);
    mesh.scale.setScalar(1);
  }
  protected place(state: State) {
    this.slots.forEach((_, i) => {
      this.tiles[i].visible = !!state.present[i];
      this.rest(i, state.faces[i]);
    });
    this.pileTarget = state.present.length - state.present.reduce((n, p) => n + p, 0);
    if (!this.flyers.some((f) => f.live)) this.layPile(this.pileTarget);
    this.paintLooks();
    this.publish(true);
  }
  /** Lays `count` tiles face down in the tray (as many as it shows). */
  private layPile(count: number) {
    this.pileShown = count;
    const m = new T.Matrix4(),
      turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 0, 1), Math.PI),
      one = new T.Vector3(1, 1, 1),
      at = new T.Vector3(),
      shown = Math.min(PILE, count);
    for (let k = 0; k < shown; k++) {
      const layer = Math.floor(k / 6),
        spot = k % 6;
      at.set(((spot % 2) - 0.5) * (W + 0.05), 0.12 + (layer + 1) * LAYER, (Math.floor(spot / 2) - 1) * (D + 0.04));
      this.pile.setMatrixAt(k, m.compose(at, turn, one));
    }
    this.pile.count = shown;
    this.pile.instanceMatrix.needsUpdate = true;
    this.redraw();
  }
  /** Each tile's look for the state shown and the marks: picked, hinted, under the pointer, free or blocked. */
  private paintLooks() {
    const state = this.state;
    if (!state) return;
    const t = touchOf(this.slots),
      live = state.winner === null && !capturing();
    this.tiles.forEach((mesh, i) => {
      if (!state.present[i]) return;
      const look: Look =
        live && i === this.selected ? "picked" : live && this.hinted.includes(i) ? "hint" : live && i === this.hovered ? "hover" : freeIn(t, state.present, i) || !live ? "free" : "blocked";
      mesh.material = this.kit.looks[look];
    });
    if (!this.animating && this.selected >= 0 && state.present[this.selected]) this.tiles[this.selected].position.y = tileAt(this.slots[this.selected]).y + LIFT;
    this.redraw();
  }
  protected animate(before: State, state: State) {
    const last = state.last;
    if (last?.kind === "pair" && before.present[last.a] && !state.present[last.a]) {
      const [a, b] = tileAt(this.slots[last.a]).x <= tileAt(this.slots[last.b]).x ? [last.a, last.b] : [last.b, last.a],
        sa = tileAt(this.slots[a]),
        sb = tileAt(this.slots[b]),
        high = Math.max(sa.top, sb.top) + 0.75,
        mid = new T.Vector3((sa.x + sb.x) / 2, high, (sa.z + sb.z) / 2),
        ends = [mid.clone().add(new T.Vector3(-W / 2 - 0.02, 0, 0)), mid.clone().add(new T.Vector3(W / 2 + 0.02, 0, 0))],
        starts = [new T.Vector3(sa.x, sa.y, sa.z), new T.Vector3(sb.x, sb.y, sb.z)],
        total = RISE_MS + MEET_MS,
        meshes = [this.tiles[a], this.tiles[b]];
      meshes.forEach((m) => (m.material = this.kit.looks.picked));
      this.selected = -1;
      this.halo.visible = false;
      let landed = false;
      this.tween(0, total, (p) => {
        const ms = p * total,
          rise = ease(clamp(ms / RISE_MS)),
          meet = ease(clamp((ms - RISE_MS) / MEET_MS));
        meshes.forEach((m, k) => {
          const from = starts[k].clone().add(new T.Vector3(0, 0.45 * rise, 0));
          m.position.lerpVectors(from, ends[k], meet);
          m.position.y += Math.sin(meet * Math.PI) * 0.25;
          // The two lean toward each other as they come together.
          m.rotation.z = (k ? 1 : -1) * 0.22 * Math.sin(meet * Math.PI);
        });
        if (p >= 1 && !landed) {
          landed = true;
          mahjongCue.kind = "match";
          this.onContact();
          meshes.forEach((m, k) => this.fly(k ? b : a, state.faces[k ? b : a], ends[k]));
          meshes.forEach((m) => (m.visible = false));
        }
      });
      return true;
    }
    if (last?.kind === "shuffle" && state.shuffles !== before.shuffles) {
      const e = extent(this.slots);
      mahjongCue.kind = "shuffle";
      this.onContact();
      this.selected = -1;
      this.halo.visible = false;
      state.present.forEach((p, i) => {
        if (!p) return;
        const at = tileAt(this.slots[i]),
          delay = ((at.x + e.x) / (2 * e.x)) * 260 + (at.z + e.z) * 12,
          mesh = this.tiles[i];
        mesh.material = this.kit.looks.free;
        this.tween(delay, 380, (q) => {
          // A turn over and back: the new face shows once the tile has passed face down.
          if (q >= 0.5 && this.faceShown[i] !== state.faces[i]) {
            mesh.geometry = this.kit.geometry(state.faces[i]);
            this.faceShown[i] = state.faces[i];
          }
          mesh.rotation.x = ease(q) * Math.PI * 2;
          mesh.position.y = at.y + Math.sin(q * Math.PI) * 0.55;
        });
      });
      return true;
    }
    return false;
  }
  /** A tile of a pair taken drifts from where the two met into the tray, fading, on the view's own frames. */
  private fly(slot: number, face: number, from: T.Vector3) {
    const flyer = this.flyers.find((f) => !f.live);
    if (!flyer || this.reducedMotion || capturing()) {
      if (!this.flyers.some((f) => f.live)) this.layPile(this.pileTarget);
      return;
    }
    flyer.live = true;
    flyer.start = performance.now();
    flyer.from.copy(from);
    flyer.to.set(this.trayPlace.x + (slot % 2 ? 0.3 : -0.3), 0.9, this.trayPlace.z);
    flyer.mesh.geometry = this.kit.geometry(face);
    flyer.mesh.position.copy(from);
    flyer.mesh.rotation.set(0, 0, 0);
    flyer.mesh.scale.setScalar(1);
    flyer.material.opacity = 1;
    flyer.mesh.visible = true;
    this.kick();
  }
  protected mark(marks: Marks) {
    const state = this.state;
    if (!state) return;
    const live = state.winner === null && !capturing(),
      // With a hint shown nothing is picked: the screen names the hint's first tile as the one chosen.
      picked = live && !marks.hint && marks.selected !== null && marks.selected >= 0 && marks.selected < this.tiles.length ? marks.selected : -1;
    if (picked >= 0 && picked !== this.selected && state.present[picked]) {
      mahjongCue.kind = "pick";
      this.onContact();
    }
    if (picked !== this.selected && this.selected >= 0 && !this.animating && state.present[this.selected]) this.tiles[this.selected].position.y = tileAt(this.slots[this.selected]).y;
    this.selected = picked;
    this.hinted = live && marks.hint && marks.hint.from >= 0 ? [marks.hint.from, marks.hint.to] : [];
    this.cursorAt = live && marks.cursor !== null && marks.cursor >= 0 && state.present[marks.cursor] ? marks.cursor : -1;
    this.paintLooks();
    const top = (i: number, lift = 0) => {
      const at = tileAt(this.slots[i]);
      return new T.Vector3(at.x, at.top + lift + 0.004, at.z);
    };
    this.halo.visible = this.selected >= 0;
    if (this.halo.visible) {
      const at = tileAt(this.slots[this.selected]);
      this.halo.position.set(at.x, at.y + 0.012, at.z);
    }
    this.hintFrames.forEach((frame, k) => {
      frame.visible = k < this.hinted.length;
      if (frame.visible) frame.position.copy(top(this.hinted[k]));
    });
    this.cursorFrame.visible = this.cursorAt >= 0;
    if (this.cursorFrame.visible) this.cursorFrame.position.copy(top(this.cursorAt, this.cursorAt === this.selected ? LIFT : 0));
    this.publish(false);
    this.kick();
  }
  /** For browser tests: the tiles lying, free and pickable, the picked one, the hint, and where each seen tile may be tapped. */
  private publish(places: boolean) {
    const state = this.state;
    if (!state) return;
    const el = this.renderer.domElement,
      t = touchOf(this.slots),
      present = state.present.flatMap((p, i) => (p ? [i] : []));
    el.dataset.present = present.join(" ");
    el.dataset.free = present.filter((i) => freeIn(t, state.present, i)).join(" ");
    el.dataset.pickable = [...pickable(state)].sort((a, b) => a - b).join(" ");
    el.dataset.selected = String(this.selected);
    el.dataset.hint = this.hinted.join(" ");
    el.dataset.cursor = String(this.cursorAt);
    el.dataset.shuffles = String(state.shuffles);
    // The faces shown, slot by slot (-1 for a slot taken): nothing hidden, every face lies face up.
    el.dataset.faces = state.faces.map((f, i) => (state.present[i] ? f : -1)).join(" ");
    if (places) el.dataset.places = this.places(present);
  }
  /** Where each tile present can be tapped on the canvas: a point of its face that no other tile hides, "slot:x,y". */
  private places(present: number[]) {
    const el = this.renderer.domElement,
      w = el.clientWidth,
      h = el.clientHeight;
    if (!w || !h) return "";
    this.scene.updateMatrixWorld();
    this.camera.updateMatrixWorld();
    const out: string[] = [],
      v = new T.Vector3(),
      ndc = new T.Vector2();
    for (const i of present) {
      const at = tileAt(this.slots[i]);
      for (const [du, dv] of [
        [0, 0],
        [0, 0.3],
        [0, -0.3],
        [-0.28, 0.3],
        [0.28, 0.3],
      ]) {
        v.set(at.x + du * W, at.top + (i === this.selected ? LIFT : 0), at.z + dv * D).project(this.camera);
        if (Math.abs(v.x) > 0.98 || Math.abs(v.y) > 0.98) continue;
        ndc.set(v.x, v.y);
        this.rayCaster.setFromCamera(ndc, this.camera);
        if (this.pick(this.rayCaster.ray.clone()) !== i) continue;
        out.push(`${i}:${Math.round(((v.x + 1) / 2) * w)},${Math.round(((1 - v.y) / 2) * h)}`);
        break;
      }
    }
    return out.join(" ");
  }
  /** The view's own frames: the hint and the picked tile breathe, pairs drift into the tray, refused tiles shake. */
  private kick() {
    if (!this.clock && !this.disposed) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    let busy = false;
    const s = now / 1000;
    if (this.hinted.length && !this.reducedMotion) {
      this.kit.looks.hint.emissiveIntensity = 0.22 + 0.16 * Math.sin(s * 4.2);
      (this.hintFrames[0].material as T.MeshBasicMaterial).opacity = 0.7 + 0.25 * Math.sin(s * 4.2);
      busy = true;
    }
    if (this.halo.visible && !this.reducedMotion) {
      (this.halo.material as T.MeshBasicMaterial).opacity = 0.75 + 0.25 * Math.sin(s * 3.1);
      busy = true;
    }
    for (const f of this.flyers) {
      if (!f.live) continue;
      const p = clamp((now - f.start) / FADE_MS),
        q = ease(p);
      f.mesh.position.lerpVectors(f.from, f.to, q);
      f.mesh.position.y += Math.sin(p * Math.PI) * 0.6;
      f.mesh.scale.setScalar(1 - 0.25 * q);
      f.material.opacity = 1 - clamp((p - 0.35) / 0.65);
      if (p >= 1) {
        f.live = false;
        f.mesh.visible = false;
        if (!this.flyers.some((x) => x.live)) this.layPile(this.pileTarget);
      }
      busy = true;
    }
    for (const [tile, start] of this.shakes) {
      const p = (now - start) / 380,
        mesh = this.tiles[tile],
        at = tileAt(this.slots[tile]);
      if (p >= 1 || !this.state?.present[tile] || this.animating) {
        this.shakes.delete(tile);
        mesh.position.x = at.x;
        mesh.rotation.y = 0;
        continue;
      }
      mesh.position.x = at.x + Math.sin(p * Math.PI * 6) * 0.06 * (1 - p);
      mesh.rotation.y = Math.sin(p * Math.PI * 6) * 0.05 * (1 - p);
      busy = true;
    }
    this.redraw();
    if (busy) this.kick();
  };
  dispose() {
    if (this.clock) cancelAnimationFrame(this.clock);
    this.clock = 0;
    super.dispose();
  }
}
