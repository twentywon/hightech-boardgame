import * as T from "three";
import { capable, fall as drop } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { FlickView } from "../flick/view";
import { DT, copy, launch, shotCode, shotOf, speedOf, strike, type Disc } from "../flick/physics";
import { FLY_SECONDS, GO, arenaOf, goPoint, type Mode, type State } from "./rules";
import { HOP, HOP_HEIGHT, fallTrack, stepStones, stirring, type Bump, type Fall, type FallPose, type Stone, type StoneHeard } from "./physics";
import { Specks, edgeTexture, faceTexture, pieceGeometry, shadowTexture, stoneGeometry, stoneMaterial } from "./pieces";
import { study } from "./study";

export const STONE_COLORS: [string, string] = ["#1b1c20", "#f1ece0"];
export const PIECE_COLORS: [string, string] = ["#2f7d4f", "#c0392b"];
/** A stone's way through the air is drawn this many times the rules' arc. */
const FLIGHT_HEIGHT = 1.5;
interface Piece {
  /** Where the stone's middle is. */
  holder: T.Group;
  /** Its tip as it goes over an edge, about the level line across its way. */
  tumbler: T.Group;
  /** Its turn about the upright. */
  spinner: T.Group;
  shadow: T.Mesh;
  /** Its half thickness, and the turn its picture starts at (so no two shell stones look alike). */
  half: number;
  turn: number;
}
/**
 * The alkkagi table: a go board on its feet or a folding janggi board on a low table, in a study. A shot is run
 * here with the very physics the rules ran (`stepStones`), so it ends exactly where the rules say: stones slide
 * and turn, knock each other turning, throw up specks where they meet, fly and bounce, and tip off the edge to lie
 * on what is below.
 */
export class AlkkagiView extends FlickView<State> {
  private pieces: Piece[] = [];
  private built: Stone[] | null = null;
  private rings: T.Mesh[] = [];
  private cursor: T.Mesh;
  private stone: T.BufferGeometry;
  private paints: T.Material[];
  private shade: T.Texture;
  private faces = new Map<string, T.Material[]>();
  private shapes = new Map<number, T.BufferGeometry>();
  private edge: T.Material;
  private sparks: Specks;
  private dust: Specks;
  /** Ways of falls already worked out, by the fall. */
  private tracks = new WeakMap<Fall, FallPose[]>();
  /** The shot being run, so that a newer state stops an older run; and its frame. */
  private run = 0;
  private frame = 0;
  private aim: { x: number; z: number; angle: number; power: number } | null = null;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: Mode,
  ) {
    super(host, quality, "#2c2119");
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    const sun = this.daylight("#fff4dc", "#5a4030", "#ffeccc", 10.5, 2.2);
    sun.position.set(-6, 12, 4);
    // Drawn without a graphics card, the shadows are drawn at a quarter of the size: the room's large surfaces made
    // the shadow pass the dearest part of a frame.
    if (!capable()) sun.shadow.mapSize.set(1024, 1024);
    study(this.scene, own, mode);
    this.stone = own(stoneGeometry(0.42));
    this.paints = [own(stoneMaterial(own, false)), own(stoneMaterial(own, true))];
    this.shade = own(shadowTexture());
    this.edge = this.standard({ map: own(edgeTexture()), roughness: 0.5 });
    for (let i = 0; i < 16; i++) {
      const ring = ringMesh(own, 0.3, 0.37, "#ffd24a");
      this.rings.push(ring);
      this.scene.add(ring);
    }
    this.cursor = ringMesh(own, 0.26, 0.33, "#ffffff");
    this.scene.add(this.cursor);
    // A knock of stones throws a few bright specks; wood throws dust, as does a stone coming down.
    this.sparks = new Specks(own, 90, mode === "go" ? "#fff3d0" : "#f4d9a6", mode === "go", 3, 9);
    this.dust = new Specks(own, 140, mode === "go" ? "#d9c29a" : "#c9a874", false, 4, 2.5);
    this.scene.add(this.sparks.points, this.dust.points);
    this.begin();
  }
  /** Over Wi-Fi the second side's device sees the board from its own half (the far end at one screen). */
  protected seated() {
    this.faceFrom(this.netSide === 1 ? Math.PI : 0);
  }
  protected subject(): TableSubject {
    return { half: 5.3, halfZ: 5.5, height: 0.8, lookY: 0, tilt: 1.05 };
  }
  protected resize() {
    super.resize();
    const h = this.host.clientHeight * Math.min(devicePixelRatio, 2);
    this.sparks?.setScale(h / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
    this.dust?.setScale(h / (2 * Math.tan((this.camera.fov * Math.PI) / 360)));
  }
  protected discs(state: State) {
    this.build(state);
    return state.discs;
  }
  protected arena(state: State) {
    return arenaOf(state.mode);
  }
  /** The paint of a janggi piece's faces and sides, one set a character and side. */
  private faceOf(label: string, owner: number) {
    const key = `${label}${owner}`;
    let paint = this.faces.get(key);
    if (!paint) {
      const own = <R extends { dispose(): void }>(r: R) => this.own(r),
        relief = capable() ? own(faceTexture(label, "#000", true)) : null,
        face = this.standard({ map: own(faceTexture(label, PIECE_COLORS[owner])), roughness: 0.5, ...(relief ? { bumpMap: relief, bumpScale: 2.5 } : {}) });
      paint = [face, this.edge];
      this.faces.set(key, paint);
    }
    return paint;
  }
  /** Makes a stone for every disc of the state that has none yet; a new game starts over. */
  private build(state: State) {
    if (this.built && state.discs.length < this.pieces.length) {
      for (const piece of this.pieces) {
        piece.holder.removeFromParent();
        piece.shadow.removeFromParent();
        (piece.shadow.material as T.Material).dispose();
      }
      this.pieces = [];
    }
    this.built = state.discs;
    const arena = arenaOf(state.mode);
    for (let id = this.pieces.length; id < state.discs.length; id++) {
      const disc = state.discs[id],
        owner = state.owners[id],
        holder = new T.Group(),
        tumbler = new T.Group(),
        spinner = new T.Group();
      let mesh: T.Mesh, half: number;
      if (state.mode === "go") {
        half = disc.r * arena.thick;
        mesh = new T.Mesh(this.stone, this.paints[owner]);
        mesh.scale.set(disc.r, disc.r, disc.r);
      } else {
        half = arena.thick;
        let shape = this.shapes.get(disc.r);
        if (!shape) this.shapes.set(disc.r, (shape = this.own(pieceGeometry(disc.r, half * 2))));
        mesh = new T.Mesh(shape, this.faceOf(state.labels[id], owner));
      }
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      spinner.add(mesh);
      tumbler.add(spinner);
      holder.add(tumbler);
      const shadow = new T.Mesh(this.own(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), new T.MeshBasicMaterial({ map: this.shade, transparent: true, depthWrite: false, opacity: 0.6 }));
      shadow.renderOrder = 2;
      this.scene.add(holder, shadow);
      // Shell stones are laid each at its own turn, so that their bands differ; janggi pieces stand square.
      // Janggi pieces' letters face the one who sees the board: over Wi-Fi 한's device sees it from 한's end.
      this.pieces.push({ holder, tumbler, spinner, shadow, half, turn: state.mode === "go" ? ((id * 2.399) % (Math.PI * 2)) : this.netSide === 1 ? Math.PI : 0 });
    }
  }
  protected mesh(id: number) {
    return this.pieces[id].holder;
  }
  /** The way a stone that went over the edge takes, worked out once. */
  private trackOf(fall: Fall) {
    let track = this.tracks.get(fall);
    if (!track) this.tracks.set(fall, (track = fallTrack(fall, arenaOf(this.mode).below)));
    return track;
  }
  /** Lays a stone on the board at rest or in its slide, `air` above the board. */
  private poseOnBoard(disc: Stone, air = 0, flip = 0, way = 0) {
    const piece = this.pieces[disc.id];
    piece.holder.visible = disc.on;
    piece.holder.position.set(disc.x, piece.half + air, disc.z);
    piece.spinner.rotation.y = (disc.a ?? 0) + piece.turn;
    // A stone in the air turns over once along its way (it lands flat again).
    piece.tumbler.quaternion.setFromAxisAngle(new T.Vector3(Math.sin(way), 0, -Math.cos(way)), flip);
    const shadow = piece.shadow;
    shadow.visible = disc.on;
    shadow.position.set(disc.x + air * 0.25, 0.004, disc.z - air * 0.12);
    shadow.scale.setScalar(disc.r * (2.5 + air * 0.9));
    (shadow.material as T.MeshBasicMaterial).opacity = 0.62 / (1 + air * 1.6);
  }
  /** Lays a stone that went over the edge where its fall has it. */
  private poseFallen(disc: Stone, pose: FallPose, fall: Fall) {
    const piece = this.pieces[disc.id];
    piece.holder.visible = true;
    piece.holder.position.set(pose.x, pose.y, pose.z);
    piece.spinner.rotation.y = pose.a + piece.turn;
    // Tipping toward the way out: about the level line across it.
    piece.tumbler.quaternion.setFromAxisAngle(new T.Vector3(fall.nz, 0, -fall.nx), pose.tip);
    const below = arenaOf(this.mode).below,
      top = below.tops.find((t) => Math.abs(pose.x) <= t.halfX && Math.abs(pose.z) <= t.halfZ),
      ground = top ? top.y : below.floor,
      above = Math.max(0, pose.y - piece.half - ground);
    piece.shadow.visible = true;
    piece.shadow.position.set(pose.x, ground + 0.004, pose.z);
    piece.shadow.scale.setScalar(disc.r * (2.5 + above * 0.6));
    (piece.shadow.material as T.MeshBasicMaterial).opacity = 0.62 / (1 + above * 1.2);
  }
  protected place(state: State) {
    this.build(state);
    for (const disc of state.discs) {
      const fall = disc.fell;
      if (disc.on) this.poseOnBoard(disc);
      else if (fall) {
        const track = this.trackOf(fall);
        this.poseFallen(disc, track[track.length - 1], fall);
      } else {
        this.pieces[disc.id].holder.visible = false;
        this.pieces[disc.id].shadow.visible = false;
      }
    }
  }
  sync(state: State, animate = true) {
    // A newer state stops a shot still being run.
    this.run++;
    cancelAnimationFrame(this.frame);
    super.sync(state, animate);
  }
  protected animate(before: State, state: State) {
    if (before.phase === "place" && state.discs.length > before.discs.length) return this.setDown(before, state);
    const live = this.struck(before, state) as Stone[] | null;
    if (!live || !state.last) return false;
    const run = this.run,
      arena = arenaOf(state.mode),
      start = performance.now(),
      heard: StoneHeard = { hits: 0, discs: 0, walls: 0, force: 0, at: [] },
      falls = new Map<number, { track: FallPose[]; fall: Fall; t0: number; next: number }>();
    this.tween(0, 60000, () => {});
    let count = 0,
      sounded = 0,
      last = start,
      bumps = 0;
    const tick = () => {
      if (run !== this.run || this.disposed) return;
      const t = performance.now(),
        // Specks live by the clock, however slowly the frames come.
        dt = Math.min(0.25, (t - last) / 1000);
      last = t;
      const since = t - start;
      if (since >= 0) {
        const due = Math.floor(since / (DT * 1000));
        while (count < due && stirring(live)) {
          for (const gone of stepStones(live, arena, heard)) {
            const fall = live[gone].fell!;
            falls.set(gone, { track: this.trackOf(fall), fall, t0: start + count * DT * 1000, next: 0 });
          }
          count++;
        }
        // What was struck: a click for the knock, and specks where it was.
        if (heard.hits > sounded) this.onContact();
        sounded = heard.hits;
        for (; bumps < heard.at!.length; bumps++) this.bump(heard.at![bumps], state.mode, count + bumps);
        for (const disc of live) {
          if (!disc.on) continue;
          const flight = disc.air && disc.flight ? 1 - disc.air / disc.flight : 0,
            air = disc.air && disc.flight ? Math.sin(Math.PI * flight) * FLIGHT_HEIGHT : disc.hop ? Math.sin(Math.PI * (1 - disc.hop / HOP)) * FLIGHT_HEIGHT * HOP_HEIGHT : 0;
          this.poseOnBoard(disc, air, flight * Math.PI * 2, Math.atan2(disc.vz, disc.vx));
        }
        for (const [gone, fall] of falls) {
          const index = Math.min(fall.track.length - 1, Math.floor((t - fall.t0) / (DT * 1000)));
          for (; fall.next <= index; fall.next++) {
            const pose = fall.track[fall.next];
            if (pose.thud && pose.thud > 6) {
              this.onContact();
              this.dust.burst(pose.x, pose.y - this.pieces[gone].half, pose.z, 7, 1.4, 0.7, 0.11, gone * 31 + fall.next);
            }
          }
          this.poseFallen(live[gone], fall.track[index], fall.fall);
        }
      }
      const sparking = this.sparks.advance(dt),
        dusting = this.dust.advance(dt),
        specks = sparking || dusting;
      this.redraw();
      const falling = [...falls.values()].some((f) => f.next < f.track.length);
      if (since < 0 || stirring(live) || falling || specks) this.frame = requestAnimationFrame(tick);
      else {
        this.settleNow();
        this.place(state);
        this.onSettled();
        this.redraw();
      }
    };
    this.frame = requestAnimationFrame(tick);
    return true;
  }
  /** Specks where a knock was. */
  private bump(bump: Bump, mode: Mode, seed: number) {
    const strength = Math.min(1, bump.force / 12);
    if (bump.kind === "land") this.dust.burst(bump.x, 0.02, bump.z, 10, 1.6, 0.6, 0.12, seed);
    else if (mode === "go") this.sparks.burst(bump.x, 0.12, bump.z, Math.round(3 + strength * 9), 1.5 + strength * 3, 0.32, 0.05, seed);
    else {
      this.dust.burst(bump.x, 0.14, bump.z, Math.round(3 + strength * 7), 0.8 + strength * 1.8, 0.55, 0.07, seed);
      this.sparks.burst(bump.x, 0.14, bump.z, Math.round(2 + strength * 4), 1 + strength * 2, 0.22, 0.04, seed + 1);
    }
  }
  /** Stones newly set on the board drop onto their points, one after another, with a click each. */
  private setDown(before: State, state: State) {
    const fresh = state.discs.slice(before.discs.length);
    this.build(state);
    fresh.forEach((disc, i) => {
      const piece = this.pieces[disc.id];
      this.poseOnBoard(disc, 1);
      this.tween(i * 90, 260, (p) => {
        const height = drop(p) * 1;
        this.poseOnBoard(disc, height);
        if (p >= 1) this.onContact();
      });
      piece.holder.visible = true;
    });
    return true;
  }
  protected struck(before: State, state: State) {
    if (!state.last || state.ply !== before.ply + 1) return null;
    const shot = shotOf(state.last.code)!,
      live = copy(before.discs) as Disc[];
    strike(live[state.last.disc], shot.angle, speedOf(shot.power));
    if (state.last.fly) launch(live[state.last.disc], FLY_SECONDS);
    return live;
  }
  protected shooter(point: number) {
    const state = this.state,
      disc = state?.phase === "play" ? state.discs[point] : undefined;
    // Only a stone the screen has marked as mine to move.
    return disc?.on && this.marks.movable.includes(point) ? { x: disc.x, z: disc.z } : null;
  }
  protected shoot(point: number, degrees: number, power: number) {
    this.onMove({ from: point, to: shotCode(degrees, power), extra: -1 });
  }
  protected aimed(aim: { x: number; z: number; angle: number; power: number } | null) {
    this.aim = aim;
  }
  protected spots(): Spot[] {
    const state = this.state;
    if (!state) return [];
    if (state.phase === "place") return Array.from({ length: GO * GO }, (_, point) => ({ ...goPoint(point), y: 0, r: 0.25, point }));
    return state.discs.filter((d) => d.on).map((d) => ({ x: d.x, y: 0.1, z: d.z, r: d.r + 0.12, point: d.id }));
  }
  protected mark(marks: Marks) {
    const state = this.state,
      playing = state?.phase === "play",
      mine = playing ? marks.movable.map((id) => state!.discs[id]).filter((d) => d?.on) : [];
    this.rings.forEach((ring, i) => {
      const disc = mine[i];
      ring.visible = !!disc;
      if (disc) {
        ring.position.set(disc.x, 0.012, disc.z);
        ring.scale.setScalar((disc.r + 0.1) / 0.335);
      }
    });
    const at = marks.cursor !== null && state?.phase === "place" ? goPoint(marks.cursor) : null;
    this.cursor.visible = !!at;
    if (at) this.cursor.position.set(at.x, 0.013, at.z);
  }
  dispose() {
    this.run++;
    cancelAnimationFrame(this.frame);
    for (const piece of this.pieces) (piece.shadow.material as T.Material).dispose();
    super.dispose();
  }
}
