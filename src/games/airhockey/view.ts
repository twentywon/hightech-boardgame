import * as T from "three";
import { aim, block, glossy } from "../../engine/scene-utils";
import { pub } from "../../engine/scenery";
import type { Level } from "../points/ai";
import { TableView, type Spot, type TableSubject } from "../table/view";
import type { State } from "./rules";
import { shout } from "../../ui/banner";
import { DT, GOAL, HALF_X, HALF_Z, MALLET, MAX_PUCK, PUCK, createWorld, freshMind, keep, type World } from "./sim";
import { DROP, ORBIT, RAIL, airHockeySubject } from "./layout";
import { blend, type LiveGuest, type LiveSession } from "../../net/live";
import { hostSlice, inputOf, readInput, readSnap, snapOf, type Tally } from "./net";

export const AIRHOCKEY_COLORS: [string, string] = ["#e0322a", "#2a6fe0"];
/** Where a side's mallet stands at a face-off, before its goal. */
const home = (side: 0 | 1) => ({ x: 0, z: side === 0 ? HALF_Z - 0.9 : -HALF_Z + 0.9 });
/**
 * The playing surface: white with a field of tiny air holes, the red centre line, blue circles and the creases before
 * the goals; its name reads along the table for whoever looks (`turned`: from the other long side, seat 1 over Wi-Fi).
 */
function surface(turned = false) {
  const W = 512,
    H = Math.round((W * HALF_Z) / HALF_X),
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    px = (x: number) => ((x + HALF_X) / (HALF_X * 2)) * W,
    pz = (z: number) => ((z + HALF_Z) / (HALF_Z * 2)) * H,
    unit = W / (HALF_X * 2);
  ctx.fillStyle = "#f4f6f8";
  ctx.fillRect(0, 0, W, H);
  // The air holes, in rows.
  ctx.fillStyle = "rgba(90,100,115,0.35)";
  for (let y = 6; y < H; y += 12) for (let x = (y / 12) % 2 ? 12 : 6; x < W; x += 12) ctx.fillRect(x, y, 1.6, 1.6);
  ctx.lineWidth = 5;
  ctx.strokeStyle = "#d8352c";
  ctx.beginPath();
  ctx.moveTo(0, pz(0));
  ctx.lineTo(W, pz(0));
  ctx.stroke();
  ctx.strokeStyle = "#2f6fd0";
  for (const z of [-HALF_Z * 0.5, HALF_Z * 0.5]) {
    ctx.beginPath();
    ctx.moveTo(0, pz(z));
    ctx.lineTo(W, pz(z));
    ctx.stroke();
  }
  ctx.strokeStyle = "#d8352c";
  ctx.beginPath();
  ctx.arc(px(0), pz(0), unit * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  // The creases before each goal.
  ctx.strokeStyle = "#2f6fd0";
  for (const end of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(px(0), pz(end * HALF_Z), unit * 1.2, end < 0 ? 0 : Math.PI, end < 0 ? Math.PI : Math.PI * 2);
    ctx.stroke();
  }
  // The name reads along the table, as the table is seen from its long side.
  ctx.save();
  ctx.translate(px(0), pz(0));
  ctx.rotate(turned ? Math.PI / 2 : -Math.PI / 2);
  ctx.font = `900 ${Math.round(unit * 0.32)}px "Inter", Arial, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(216,53,44,0.85)";
  ctx.fillText("AIR HOCKEY", 0, 0);
  ctx.restore();
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/**
 * An air hockey table in the corner of a pub (the same room as table soccer and pocket ball), seen from its long
 * side so that it lies across the screen: a white surface full of air holes between padded rails, a goal slot at each
 * end, an amber puck, my red mallet at the left and the computer's blue one at the right. The score is on a board of
 * its own over the table (the screen's scoreboard panel). The view plays the table in real time (`sim.ts`) and
 * reports each goal as a move; my mallet goes exactly where the hand is. With `two` (two at one screen) both mallets
 * are hands: every pointer that goes down takes the mallet of the half it is on and drives it, by its own id, until it
 * lifts, so that two fingers play at once (the view follows pointers itself; `TableView` follows only one).
 *
 * Over Wi-Fi (`live`) each device sees the table from its own side, its own goal at the left (seat 1 looks from the
 * other long side), and its hand drives its own mallet. The host's view runs the one table: its own hand, each
 * guest's hand as the room feeds it (`LiveHost.input`), the computer for a seat whose person is away; it tells the
 * table to all (`snapOf`). A guest's view runs no table: it draws the host's, a moment behind, and its own mallet
 * where its hand is (`readSnap`, `LiveGuest.frame`), and sends its hand (`inputOf`).
 */
export class AirHockeyView extends TableView<State> {
  private world: World = createWorld(0, 0);
  private puck: T.Group;
  private mallets: T.Group[] = [];
  /** Where each hand has its mallet go, and where it was sent at the end of the last frame (the way between is swept). */
  private hands = [home(0), home(1)];
  private sent = [home(0), home(1)];
  /** Which mallet each pointer down on the table holds (by pointer id); a mouse not pressed drives the half it is over. */
  private holds = new Map<number, 0 | 1>();
  /** Seconds before the computer plays after a goal; keys held for each side; the last frame; time owed to the table. */
  private wait = 0.9;
  private keys = [
    { x: 0, z: 0 },
    { x: 0, z: 0 },
  ];
  private last = performance.now();
  private left = 0;
  private paused = false;
  private frame = 0;
  /** When a mallet's strike and a rail's knock were last heard, so that a puck pushed along is not a rattle. */
  private clicked = { mallet: 0, rail: 0 };
  /** A knock heard: the puck struck by a mallet (`disc`), against a rail (`cushion`), into a goal slot (`pocket`). */
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  private ticker = 0;
  private shown = 0;
  /** The side this device plays (seat 1 over Wi-Fi sees the table from the other long side), and the computer's thoughts for each side. */
  private mine: 0 | 1 = 0;
  private minds = [freshMind(), freshMind()] as [ReturnType<typeof freshMind>, ReturnType<typeof freshMind>];
  /** Counts of strikes, rail knocks and time-outs (told to guests, who make their own sounds), and what a guest has heard of them. */
  private tally: Tally = { hits: 0, walls: 0, timeouts: 0 };
  private heardTally: Tally | null = null;
  private heardCut = 0;
  private wasHanded: [boolean, boolean] = [true, true];
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private level: Level,
    private two = false,
    private live: LiveSession | null = null,
  ) {
    super(host, quality, "#16110d");
    if (live) this.mine = live.seat === 1 ? 1 : 0;
    this.orbit = ORBIT + (this.mine ? Math.PI : 0);
    this.scene.add(new T.HemisphereLight("#d8cdb8", "#221a14", 1.6));
    const lamp = new T.SpotLight("#fff0cf", 3.6, 0, 0.95, 0.5, 0);
    lamp.position.set(0, 11, 0.5);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    const keep_ = <R extends { dispose(): void }>(r: R) => this.own(r);
    // The pub round it, turned with the eye so that its wall stays behind the table.
    const room = new T.Group();
    room.rotation.y = this.orbit;
    this.scene.add(room);
    pub(room, keep_, HALF_Z + 0.9, DROP);
    const GROUND = -DROP;
    // The table: the white surface, padded rails with the goal slots, a blue body on four legs.
    const field = this.add(new T.PlaneGeometry(HALF_X * 2, HALF_Z * 2).rotateX(-Math.PI / 2), this.standard({ map: keep_(surface(this.mine === 1)), roughness: 0.25 }), 0, 0, 0);
    field.castShadow = false;
    const rail = keep_(glossy({ color: "#1f4fae", roughness: 0.35 }, 0.5)),
      pad = this.standard({ color: "#14171c", roughness: 0.6 }),
      body = this.standard({ color: "#1b3d86", roughness: 0.5 }),
      chrome = this.standard({ color: "#d7dde4", roughness: 0.25, metalness: 0.85 }),
      W = RAIL.width,
      high = RAIL.high;
    for (const sx of [-1, 1]) this.add(block(W, high, HALF_Z * 2 + W * 2, 0.06), rail, sx * (HALF_X + W / 2), high / 2, 0);
    for (const sz of [-1, 1]) {
      const wing = HALF_X - GOAL;
      for (const sx of [-1, 1]) this.add(block(wing, high, W, 0.06), rail, sx * (GOAL + wing / 2), high / 2, sz * (HALF_Z + W / 2));
      // The goal slot: a dark mouth in the end rail, and the chute under it.
      this.add(new T.BoxGeometry(GOAL * 2, high * 0.5, W), pad, 0, high * 0.75, sz * (HALF_Z + W / 2)).castShadow = false;
      this.add(new T.BoxGeometry(GOAL * 2 + 0.1, 0.4, 0.5), pad, 0, -0.25, sz * (HALF_Z + 0.35)).castShadow = false;
    }
    // A thin black pad along the rails' inner faces.
    for (const sx of [-1, 1]) this.add(new T.BoxGeometry(0.03, high * 0.7, HALF_Z * 2), pad, sx * (HALF_X + 0.015), high * 0.4, 0).castShadow = false;
    const depth = 0.9;
    this.add(block(HALF_X * 2 + W * 2 + 0.1, depth, HALF_Z * 2 + W * 2 + 0.1, 0.08), body, 0, -depth / 2 - 0.01, 0);
    this.add(new T.BoxGeometry(HALF_X * 2 + W * 2 + 0.14, 0.06, HALF_Z * 2 + W * 2 + 0.14), chrome, 0, -0.04, 0).castShadow = false;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        this.add(new T.CylinderGeometry(0.16, 0.2, -GROUND - depth, 14), body, sx * (HALF_X - 0.2), (GROUND - depth) / 2, sz * (HALF_Z - 0.4));
        this.add(new T.CylinderGeometry(0.26, 0.26, 0.06, 18), chrome, sx * (HALF_X - 0.2), GROUND + 0.03, sz * (HALF_Z - 0.4));
      }
    // The puck, and the two mallets (a disc with a rounded rim and a knob to hold).
    this.puck = new T.Group();
    this.add(new T.CylinderGeometry(PUCK, PUCK, 0.06, 32), keep_(glossy({ color: "#ffb21f", roughness: 0.3 }, 0.6)), 0, 0.03, 0, this.puck);
    this.add(new T.TorusGeometry(PUCK * 0.62, 0.012, 6, 28).rotateX(Math.PI / 2), this.standard({ color: "#c46a00" }), 0, 0.062, 0, this.puck).castShadow = false;
    this.scene.add(this.puck);
    const lathe = (points: number[][]) => keep_(new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), 36)),
      base = lathe([[0, 0], [MALLET, 0], [MALLET + 0.02, 0.03], [MALLET, 0.08], [MALLET * 0.7, 0.1], [0.15, 0.11], [0.12, 0.14], [0, 0.14]]),
      knob = lathe([[0, 0.12], [0.11, 0.12], [0.1, 0.26], [0.14, 0.3], [0.13, 0.36], [0.06, 0.39], [0, 0.39]]);
    AIRHOCKEY_COLORS.forEach((color) => {
      const g = new T.Group(),
        paint = keep_(glossy({ color, roughness: 0.3 }, 0.6));
      this.add(base, paint, 0, 0, 0, g);
      this.add(knob, paint, 0, 0, 0, g);
      this.scene.add(g);
      this.mallets.push(g);
    });
    // The hands. Every pointer is followed by its own id: a press takes the mallet of the half it is on (against the
    // computer, always mine) and drives it until it lifts; a second finger on a half already held takes that mallet
    // over. A mouse moves a mallet by hovering too (no button needed): mine, or for two, the one whose half it is over.
    const el = this.renderer.domElement,
      ray = new T.Raycaster(),
      hit = new T.Vector3(),
      ground = (e: PointerEvent) => {
        aim(ray, e, el, this.camera);
        return ray.ray.intersectPlane(this.floor, hit) ? { x: hit.x, z: hit.z } : null;
      },
      halfOf = (z: number): 0 | 1 => (!this.two ? this.mine : z >= 0 ? 0 : 1),
      letGo = (e: PointerEvent) => this.holds.delete(e.pointerId);
    el.addEventListener("pointerdown", (e) => {
      if ((e.pointerType === "mouse" && e.button !== 0) || this.disposed || !this.running()) return;
      const at = ground(e);
      if (!at) return;
      const side = halfOf(at.z);
      for (const [id, held] of this.holds) if (held === side) this.holds.delete(id);
      this.holds.set(e.pointerId, side);
      try {
        el.setPointerCapture(e.pointerId);
      } catch {
        // A pointer already gone: nothing to follow.
      }
      this.reach(side, at.x, at.z);
    });
    el.addEventListener("pointermove", (e) => {
      if (this.disposed || !this.running()) return;
      const held = this.holds.get(e.pointerId);
      if (held === undefined && e.pointerType !== "mouse") return;
      const at = ground(e);
      if (at) this.reach(held ?? halfOf(at.z), at.x, at.z);
    });
    el.addEventListener("pointerup", letGo);
    el.addEventListener("pointercancel", letGo);
    el.addEventListener("lostpointercapture", letGo);
    // No page scroll, zoom or long-press menu under the fingers (the canvas is `touch-action: none` as well).
    const still = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", still, { passive: false });
    el.addEventListener("touchmove", still, { passive: false });
    el.addEventListener("contextmenu", still);
    el.style.touchAction = "none";
    // Keys go as the table is seen: right toward the far goal (-z), up away from me (-x). Against the computer the arrows
    // and W A S D both move my mallet; for two, W A S D move the left mallet and the arrows the right one.
    const WAYS: Record<string, [number, number]> = { ArrowLeft: [0, 1], ArrowRight: [0, -1], ArrowUp: [-1, 0], ArrowDown: [1, 0], KeyA: [0, 1], KeyD: [0, -1], KeyW: [-1, 0], KeyS: [1, 0] },
      sideOf = (code: string): 0 | 1 => (this.two && code.startsWith("Arrow") ? 1 : this.mine),
      // Seen from the other long side (seat 1 over Wi-Fi), every way is turned round.
      turn = this.mine ? -1 : 1;
    el.addEventListener("keydown", (e) => {
      const way = WAYS[e.code];
      if (!way || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      const keys = this.keys[sideOf(e.code)];
      if (way[0]) keys.x = way[0] * turn;
      if (way[1]) keys.z = way[1] * turn;
    });
    el.addEventListener("keyup", (e) => {
      const way = WAYS[e.code];
      if (!way) return;
      const keys = this.keys[sideOf(e.code)];
      if (way[0] && keys.x === way[0] * turn) keys.x = 0;
      if (way[1] && keys.z === way[1] * turn) keys.z = 0;
    });
    el.addEventListener("blur", () => this.stopKeys());
    this.pose();
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The table never makes the screen wait: a goal may be reported at any moment. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    this.stopKeys();
  }
  private stopKeys() {
    this.keys = [
      { x: 0, z: 0 },
      { x: 0, z: 0 },
    ];
  }
  private running() {
    // Over Wi-Fi a window open on one device does not stop the table for the others (a pause does, for all).
    return !!this.state && this.state.winner === null && !this.paused && !document.hidden && (!!this.live || !document.querySelector("dialog[open]"));
  }
  /** Which sides a hand drives here (mine, two at one screen, or a guest's on the host), the others the computer's. */
  private handed(): [boolean, boolean] {
    const live = this.live;
    if (!live || !live.host) return this.two ? [true, true] : [true, false];
    const by = (side: number) => live.control(side) === "me" || live.control(side) === "remote";
    return [by(0), by(1)];
  }
  /** A hand over the table: that side's mallet goes there (kept to its half), at no speed limit. */
  private reach(side: 0 | 1, x: number, z: number) {
    this.hands[side] = keep(side, x, z);
  }
  protected orbit = ORBIT;
  /** Every press on the running table is a hand on a mallet (followed above, pointer by pointer), never a pick. */
  protected dragStart() {
    return this.running();
  }
  /** Runs the table for the time that has passed since the last frame. */
  private advance(now: number) {
    const real = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.live && !this.live.host) return this.follow(now, real);
    if (this.running()) {
      const handed = this.handed(),
        hands = ([0, 1] as const).filter((side) => handed[side]),
        live = this.live;
      // A side taken over by a hand (a guest back from a drop) starts its sweep from where its mallet stands.
      for (const side of hands)
        if (!this.wasHanded[side]) {
          const m = this.world.mallets[side];
          this.hands[side] = this.sent[side] = { x: m.x, z: m.z };
        }
      this.wasHanded = handed;
      // Keys move the mallets of this screen's hands; a guest's hand is where the room says it is.
      for (const side of hands) {
        if (live?.control(side) === "remote") {
          const got = readInput(side, live.host ? live.input(side, now) : null);
          if (got) this.hands[side] = got;
          continue;
        }
        const keys = this.keys[side];
        if (keys.x || keys.z) this.reach(side, this.hands[side].x + keys.x * 7 * real, this.hands[side].z + keys.z * 7 * real);
      }
      this.left += real;
      // Each hand's way over this frame is spread over its slices, so that the mallet sweeps it at its true speed.
      // After a goal (and at the start) only the computer waits: the hands and the puck are always in play.
      const slices = Math.floor(this.left / DT),
        from = this.sent.map((p) => ({ ...p }));
      for (let k = 1; k <= slices; k++) {
        this.left -= DT;
        const at = ([0, 1] as const).map((side) =>
          handed[side] ? { x: from[side].x + ((this.hands[side].x - from[side].x) * k) / slices, z: from[side].z + ((this.hands[side].z - from[side].z) * k) / slices } : null,
        );
        const computer = !handed[0] || !handed[1];
        if (!computer) this.wait = 0;
        else if (this.wait > 0) this.wait -= DT;
        const [hit, wall] = [this.world.hit, this.world.wall],
          scorer = hostSlice(this.world, this.level, at, this.minds, this.wait > 0);
        if (this.world.hit > hit) this.tally.hits++;
        if (this.world.wall > wall) this.tally.walls++;
        if (this.world.served !== null) {
          // Kept too long in one half: the other side has it, laid still in their half.
          const to = this.world.served;
          this.world.served = null;
          if (computer && !handed[to]) this.wait = 0.6;
          this.tally.timeouts++;
          shout("시간 초과");
          this.onKnock?.("cushion", 0.4);
        }
        if (scorer !== null) {
          this.left = 0;
          this.wait = computer ? 1.1 : 0;
          live?.host && live.jump();
          // The side that let it in has the puck; a hand's mallet stays where the hand is.
          const kept = this.world.mallets.map((m) => ({ x: m.x, z: m.z }));
          this.world = createWorld(scorer === 0 ? 1 : 0, (Math.random() - 0.5) * 0.8);
          for (const side of hands) {
            Object.assign(this.world.mallets[side], kept[side]);
            this.world.targets[side] = { ...kept[side] };
            this.sent[side] = { ...kept[side] };
          }
          this.onKnock?.("pocket", 1);
          this.onMove({ from: -1, to: scorer, extra: -1 });
          break;
        }
      }
      if (slices) for (const side of hands) this.sent[side] = { ...this.world.targets[side] };
      // A strike or a knock is as loud as the puck is quick after it; a puck merely nudged along is not heard again at once.
      const { puck } = this.world,
        strength = Math.min(1, Math.hypot(puck.vx, puck.vz) / (MAX_PUCK * 0.75));
      if (this.world.hit && strength > 0.03 && now - this.clicked.mallet > 70) {
        this.clicked.mallet = now;
        this.onKnock?.("disc", strength);
      }
      if (this.world.wall && strength > 0.03 && now - this.clicked.rail > 60) {
        this.clicked.rail = now;
        this.onKnock?.("cushion", strength);
      }
      this.world.hit = this.world.wall = 0;
    }
    // The host tells its table to the guests (paused or not, so that one coming back sees it).
    if (this.live?.host && this.state) this.live.tick(() => snapOf(this.world, this.tally), now);
    this.pose();
    this.redraw();
  }
  /**
   * A guest's frame: my hand is sent to the host, and the host's table is drawn a moment behind, my own mallet where
   * my hand is (it goes there at once on the host too, a moment later); the sounds and words follow its counts.
   */
  private follow(now: number, real: number) {
    const live = this.live as LiveGuest,
      mine = this.mine,
      seated = live.seat === 0 || live.seat === 1,
      playing = seated && this.running() && !live.paused;
    if (playing) {
      const keys = this.keys[mine];
      if (keys.x || keys.z) this.reach(mine, this.hands[mine].x + keys.x * 7 * real, this.hands[mine].z + keys.z * 7 * real);
    }
    live.tick(() => (playing ? inputOf(this.hands[mine]) : null), now);
    const frame = live.frame(now),
      a = frame && readSnap(frame.a.data),
      b = frame && readSnap(frame.b.data);
    if (frame && a && b) {
      const t = frame.t,
        [px, pz, vx, vz, ax, az, bx, bz] = blend(frame.a.data.slice(0, 8), frame.b.data.slice(0, 8), t),
        { puck, mallets } = this.world;
      Object.assign(puck, { x: px, z: pz, vx, vz });
      Object.assign(mallets[0], { x: ax, z: az });
      Object.assign(mallets[1], { x: bx, z: bz });
      if (playing) Object.assign(mallets[mine], this.hands[mine]);
      // What the host's table did since the last frame drawn here: knocks, a time-out, a goal (a cut).
      const heard = this.heardTally,
        strength = Math.min(1, Math.hypot(vx, vz) / (MAX_PUCK * 0.75));
      if (heard) {
        if (b.hits > heard.hits && strength > 0.03) this.onKnock?.("disc", strength);
        if (b.walls > heard.walls && strength > 0.03) this.onKnock?.("cushion", strength);
        if (b.timeouts > heard.timeouts) {
          shout("시간 초과");
          this.onKnock?.("cushion", 0.4);
        }
        if (frame.b.cut > this.heardCut) this.onKnock?.("pocket", 1);
      }
      this.heardTally = { hits: b.hits, walls: b.walls, timeouts: b.timeouts };
      this.heardCut = frame.b.cut;
    }
    this.pose();
    this.redraw();
  }
  /** Puts the puck and the mallets where the table has them. */
  private pose() {
    const { puck, mallets } = this.world;
    this.puck.position.set(puck.x, 0, puck.z);
    this.puck.visible = Math.abs(puck.z) < HALF_Z + PUCK * 2;
    mallets.forEach((m, i) => this.mallets[i].position.set(m.x, 0, m.z));
    if (++this.frame % 6 === 0) {
      const data = this.renderer.domElement.dataset;
      data.puck = `${puck.x.toFixed(2)},${puck.z.toFixed(2)}`;
      data.mallet = `${mallets[0].x.toFixed(2)},${mallets[0].z.toFixed(2)}`;
      // Both mallets (left;right), and whether two hands play, for browser tests.
      data.mallets = mallets.map((m) => `${m.x.toFixed(2)},${m.z.toFixed(2)}`).join(";");
      data.players = this.two ? "2" : "1";
    }
  }
  protected subject(aspect: number): TableSubject {
    return airHockeySubject(aspect);
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    // A new match, known by the count of moves going back to nothing.
    if (state.ply === 0 && this.shown > 0) {
      this.world = createWorld(0, 0);
      this.hands = [home(0), home(1)];
      this.sent = [home(0), home(1)];
      this.holds.clear();
      this.wait = this.two ? 0 : 0.9;
    }
    this.shown = state.ply;
    this.pose();
  }
  protected animate() {
    return false;
  }
  protected mark() {}
  dispose() {
    cancelAnimationFrame(this.ticker);
    super.dispose();
  }
}
