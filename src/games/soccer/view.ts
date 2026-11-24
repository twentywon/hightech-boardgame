import * as T from "three";
import { glossy } from "../../engine/scene-utils";
import type { LiveGuest, LiveHost, LiveSession } from "../../net/live";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { Hands, follow, hostInputs, inputOf, readSnap, snapOf, type Hand } from "./net";
import { MODE_NAMES, TEAM_COLORS, TEAM_NAMES, modeOf, type Mode } from "./roster";
import { GOAL, TIME, playerName, shirtOf, type State } from "./rules";
import { DT, FLAT, GRAVITY, createWorld, step as stepWorld, think, ticks, timeLeft, type Event as MatchEvent, type Input, type World } from "./sim";
import { ballTexture, flatStadium, gravityStadium, shirtTexture, tagTexture, type Stadium } from "./stadium";
import { noZoom } from "../../engine/zoom";

export const SOCCER_COLORS: [string, string] = TEAM_COLORS;
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** What a key does, and for whom: the first person at the screen (WASD and Space, and the arrows when playing alone) or the second (the arrows and Enter or /). */
type Role = "up" | "down" | "left" | "right" | "kick" | "jump";
const FIRST: Record<string, Role> = { KeyW: "up", KeyA: "left", KeyS: "down", KeyD: "right", Space: "kick" };
const SECOND: Record<string, Role> = { ArrowUp: "up", ArrowLeft: "left", ArrowDown: "down", ArrowRight: "right", Enter: "kick", NumpadEnter: "kick", Slash: "kick", Numpad0: "kick" };
/** A person's hand at this screen: keys held, the joystick or the touch buttons, and the presses counted. */
class LocalHand {
  keys = new Set<Role>();
  stick: { x: number; y: number } | null = null;
  /** The joystick pushed up in the side view, which is the jump (the user asked: the lever up jumps). */
  stickUp = false;
  touch = new Set<Role>();
  kicks = 0;
  jumps = 0;
  private usedKicks = 0;
  private usedJumps = 0;
  private holds(role: Role) {
    return this.keys.has(role) || this.touch.has(role);
  }
  /** The way, the kick and the jump as they stand (for sending, and for this screen's own pitch). */
  hand(gravity: boolean): Hand {
    let x = (this.holds("right") ? 1 : 0) - (this.holds("left") ? 1 : 0),
      y = (this.holds("up") ? 1 : 0) - (this.holds("down") ? 1 : 0);
    if (this.stick && !x && !y) ({ x, y } = this.stick);
    // In the side view "up" is the jump.
    return { x, y: gravity ? 0 : y, kick: this.holds("kick"), kicks: this.kicks, jump: gravity && (this.holds("jump") || this.holds("up") || this.stickUp), jumps: this.jumps };
  }
  /** One slice's controls: a press counted since the last slice is a press now. */
  input(gravity: boolean): Input {
    const h = this.hand(gravity),
      input: Input = { x: h.x, y: h.y, kick: h.kick, kickPress: this.kicks > this.usedKicks, jump: h.jump, jumpPress: this.jumps > this.usedJumps };
    this.usedKicks = this.kicks;
    this.usedJumps = this.jumps;
    return input;
  }
  press(role: Role, gravity: boolean) {
    if (role === "kick") this.kicks++;
    if (role === "jump" || (gravity && role === "up")) this.jumps++;
  }
  clear() {
    this.keys.clear();
    this.touch.clear();
    this.stick = null;
    this.stickUp = false;
  }
}
/** A player on the pitch: its body, its face, the kick's rim and flash, my ring. */
interface ManMesh {
  group: T.Group;
  rim: T.Mesh;
  flash: T.Mesh;
  flashMat: T.MeshBasicMaterial;
}
/**
 * 축구 on its own small stadium (`stadium.ts`), run in fixed slices (`sim.ts`) as the other real-time tables are: the
 * view steps the match and reports its goals and the clock's end as moves (`GOAL + team`, `TIME`); over Wi-Fi the host
 * steps it and tells the guests, who draw it a moment behind and send their hands (`net.ts`).
 *
 * 평면 축구 is seen from above at a tilt, red at the left; 중력 축구 from the side. Each player is a disc in its team's
 * colour with its number; mine has a yellow ring and a 나 tag (the second person at the screen a 2P tag), the kick held
 * shows as a white rim and a kick as a ring that flashes out. The scoreboard and the clock stand at the top. Keys: the
 * first person W A S D and Space (the arrows and X too when alone), the second the arrows and Enter (or /); in the
 * side view W and ↑ jump. A phone gets a joystick (in the side view: left and right run, up jumps) and a 차기 button for its one person.
 */
export class SoccerView extends TableView<State> {
  private mode: Mode;
  private world: World | null = null;
  private built = false;
  private stadium: Stadium | null = null;
  private men: ManMesh[] = [];
  private ball: T.Mesh | null = null;
  private tags: (T.Sprite | null)[] = [];
  private hud: HTMLElement;
  private pad: HTMLElement;
  private hands = [new LocalHand(), new LocalHand()];
  private netHands = new Hands();
  /** The player this screen's first person plays (null: nobody, watching), and the second's. */
  private mine: number | null = null;
  private second: number | null = null;
  private last = performance.now();
  private left = 0;
  private paused = false;
  private ticker = 0;
  private hudText = "";
  /** When the last goal went in (the crowd jumps, the net shakes), by the page's clock. */
  private cheered = -Infinity;
  private shook: 0 | 1 = 0;
  /** What of the host's match a guest has heard so far (its counts), to make each sound once. */
  private heard: World["counts"] | null = null;
  private letGoTimer = 0;
  private stickPointer: number | null = null;
  /** A sound: a kick, the ball off a board or a post, a goal's roar, the whistle, the crowd's murmur. */
  onKnock: ((kind: string, strength: number) => void) | null = null;
  private readonly keyDown = (e: KeyboardEvent) => this.key(e, true);
  private readonly keyUp = (e: KeyboardEvent) => this.key(e, false);
  private readonly blurred = () => this.letGo();
  private readonly hidden = () => document.hidden && this.letGo();
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    variant: string,
    private live: LiveSession | null = null,
  ) {
    super(host, quality, "#1c2530");
    // Two fingers on this canvas are the game's own (two players at one screen).
    noZoom(this.renderer.domElement);
    this.mode = modeOf(variant);
    this.hud = document.createElement("div");
    this.hud.className = "so-hud";
    this.hud.setAttribute("aria-hidden", "true");
    this.pad = document.createElement("div");
    this.pad.className = "so-pad";
    host.append(this.hud, this.pad);
    const el = this.renderer.domElement;
    el.style.touchAction = "none";
    el.style.cursor = "default";
    const still = (e: Event) => {
      if (e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchstart", still, { passive: false });
    el.addEventListener("touchmove", still, { passive: false });
    el.addEventListener("contextmenu", still);
    document.addEventListener("keydown", this.keyDown);
    document.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.blurred);
    document.addEventListener("visibilitychange", this.hidden);
    this.begin();
    const tick = () => {
      if (this.disposed) return;
      this.ticker = requestAnimationFrame(tick);
      this.advance(performance.now());
    };
    this.ticker = requestAnimationFrame(tick);
  }
  /** The match never makes the screen wait: a goal may be reported at any moment. */
  get animating() {
    return false;
  }
  setPaused(paused: boolean) {
    this.paused = paused;
    if (paused) this.onKnock?.("crowd", 0);
  }
  private get gravity() {
    return this.mode === "gravity";
  }
  /** Whether a second person plays at this screen (the arrows are theirs then). */
  private get two() {
    return this.second !== null;
  }
  private letGo() {
    this.hands.forEach((h) => h.clear());
    this.markPad();
    const live = this.live;
    if (live && !live.host && this.mine !== null) {
      clearTimeout(this.letGoTimer);
      this.letGoTimer = window.setTimeout(() => (live as LiveGuest).tick(() => inputOf(this.hands[0].hand(this.gravity))), 40);
    }
  }
  private running() {
    // Over Wi-Fi a window open on one device does not stop the match for the others (a pause does, for all).
    return !!this.world && !!this.state && this.world.phase !== "over" && !this.paused && !document.hidden && (!!this.live || !document.querySelector("dialog[open]"));
  }
  /** A key for a person's hand, from anywhere on the page but a field, a window or another button. */
  private key(e: KeyboardEvent, down: boolean) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let hand = 0,
      role: Role | undefined = FIRST[e.code];
    if (!role) {
      role = SECOND[e.code];
      if (role && this.two) hand = 1;
      if (!role && e.code === "KeyX" && !this.two) role = "kick";
    }
    if (!role) return;
    if (this.gravity && (e.code === "KeyW" || e.code === "ArrowUp")) role = "jump";
    // Nobody plays that hand here (watching, or no second person).
    if ((hand === 0 && this.mine === null) || (hand === 1 && this.second === null)) return;
    const target = e.target as HTMLElement | null;
    if (target && target !== this.renderer.domElement && target.closest("input, select, textarea, dialog, button")) return;
    if (down && document.querySelector("dialog[open]")) return;
    e.preventDefault();
    const h = this.hands[hand];
    if (down) {
      if (!e.repeat && !h.keys.has(role)) h.press(role, this.gravity);
      h.keys.add(role);
    } else h.keys.delete(role);
  }
  /**
   * The touch controls of this screen's one person: a joystick and 차기, on both pitches (the user asked for the side
   * view's ◀ ▶ and 점프 to become the same lever: there it runs left and right, and pushed up it jumps).
   */
  private makePad() {
    this.pad.replaceChildren();
    const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
    if (!coarse || this.mine === null) return;
    const hand = this.hands[0],
      color = TEAM_COLORS[this.state!.players[this.mine].team];
    this.pad.style.setProperty("--team", color);
    const hold = (button: HTMLElement, role: Role) => {
      const lift = (e: PointerEvent) => {
        if (!button.hasPointerCapture?.(e.pointerId) && e.type !== "pointerup") return;
        hand.touch.delete(role);
        this.markPad();
      };
      button.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        try {
          button.setPointerCapture(e.pointerId);
        } catch {
          // Gone already.
        }
        if (!hand.touch.has(role)) hand.press(role, this.gravity);
        hand.touch.add(role);
        this.markPad();
      });
      button.addEventListener("pointerup", lift);
      button.addEventListener("pointercancel", lift);
      button.addEventListener("lostpointercapture", () => {
        hand.touch.delete(role);
        this.markPad();
      });
      button.addEventListener("contextmenu", (e) => e.preventDefault());
    };
    const button = (cls: string, label: string, text: string) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `so-button ${cls}`;
      b.tabIndex = -1;
      b.setAttribute("aria-label", label);
      b.innerHTML = `<span aria-hidden="true">${text}</span>`;
      this.pad.append(b);
      return b;
    };
    {
      const stick = document.createElement("div");
      stick.className = "so-stick";
      stick.setAttribute("aria-label", "조이스틱");
      stick.innerHTML = `<i class="so-knob"></i>`;
      this.pad.append(stick);
      const knob = stick.querySelector<HTMLElement>(".so-knob")!;
      const move = (e: PointerEvent) => {
        if (this.stickPointer !== e.pointerId) return;
        const box = stick.getBoundingClientRect(),
          r = box.width / 2,
          dx = (e.clientX - box.left - r) / (r * 0.7),
          dy = (e.clientY - box.top - r) / (r * 0.7),
          len = Math.hypot(dx, dy),
          k = len > 1 ? 1 / len : 1;
        hand.stick = len < 0.18 ? { x: 0, y: 0 } : { x: dx * k, y: -dy * k };
        // In the side view the lever pushed well up is the jump: counted as a press when it gets there.
        const up = this.gravity && hand.stick.y > 0.55;
        if (up && !hand.stickUp) hand.press("jump", true);
        hand.stickUp = up;
        knob.style.translate = `${dx * k * r * 0.55}px ${dy * k * r * 0.55}px`;
      };
      const end = (e: PointerEvent) => {
        if (this.stickPointer !== e.pointerId) return;
        this.stickPointer = null;
        hand.stick = null;
        hand.stickUp = false;
        knob.style.translate = "";
      };
      stick.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.stickPointer = e.pointerId;
        try {
          stick.setPointerCapture(e.pointerId);
        } catch {
          // Gone already.
        }
        move(e);
      });
      stick.addEventListener("pointermove", move);
      stick.addEventListener("pointerup", end);
      stick.addEventListener("pointercancel", end);
    }
    hold(button("so-kick", "차기", "차기"), "kick");
  }
  private markPad() {
    const hand = this.hands[0];
    this.pad.querySelectorAll<HTMLElement>(".so-button").forEach((b) => {
      const role = "kick" as Role;
      b.classList.toggle("on", hand.touch.has(role));
    });
  }
  /** Builds the stadium, the players and the ball for the match the state describes (once: a new match is a new view). */
  private build(state: State) {
    this.built = true;
    this.mode = state.mode;
    const own: Own = (r) => this.own(r);
    this.world = createWorld(state.mode, state.players.map((p) => p.team), state.level, Math.floor(Math.random() * 2 ** 31), ticks(state.minutes * 60));
    if (this.live) {
      const k = this.live.seat === null ? -1 : state.players.findIndex((p) => p.seat === this.live!.seat);
      this.mine = k >= 0 ? k : null;
    } else {
      const me = state.players.findIndex((p) => p.who === "me"),
        two = state.players.findIndex((p) => p.who === "p2");
      this.mine = me >= 0 ? me : null;
      this.second = two >= 0 ? two : null;
      // 2P alone at the screen (나 waits): the first keys are theirs.
      if (this.mine === null && this.second !== null) {
        this.mine = this.second;
        this.second = null;
      }
    }
    this.light();
    this.stadium = this.gravity ? gravityStadium(this.scene, own) : flatStadium(this.scene, own);
    state.players.forEach((p, k) => this.men.push(this.makeMan(own, state, k)));
    const ballMesh = new T.Mesh(own(new T.SphereGeometry(this.world.ball.r, 28, 18)), this.standard({ map: ballTexture(own), roughness: 0.45 }));
    ballMesh.castShadow = true;
    this.scene.add(ballMesh);
    this.ball = ballMesh;
    this.tags = state.players.map((_, k) => (k === this.mine ? this.makeTag(own, "#ffd84a", this.live ? "나" : state.players[k].who === "p2" ? "2P" : "나") : k === this.second ? this.makeTag(own, "#9be7ff", "2P") : null));
    this.makePad();
    this.resize();
  }
  private light() {
    this.scene.add(new T.HemisphereLight("#eef4ff", "#3a4a2a", this.gravity ? 1.7 : 1.9));
    const sun = new T.DirectionalLight("#fff4e0", 2.2);
    if (this.gravity) {
      sun.position.set(-3, 9, 8);
      Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 7, bottom: -2, near: 1, far: 30 });
    } else {
      sun.position.set(-5, 14, 7);
      Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 7, bottom: -7, near: 1, far: 40 });
    }
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.normalBias = 0.02;
    this.own(sun.shadow);
    this.scene.add(sun);
    this.scene.background = new T.Color(this.gravity ? "#24344f" : "#1c2530");
  }
  /** A player: a disc of its team's colour with its number and who plays it, its rims and rings. */
  private makeMan(own: Own, state: State, k: number): ManMesh {
    const p = state.players[k],
      world = this.world!,
      r = world.men[k].r,
      color = TEAM_COLORS[p.team],
      group = new T.Group(),
      word = this.live ? "" : p.who === "me" ? "나" : p.who === "p2" ? "2P" : "",
      paint = own(glossy({ color, roughness: 0.4 }, 0.6)),
      dark = this.standard({ color: "#14161a", roughness: 0.7 }),
      face = this.standard({ map: shirtTexture(own, color, shirtOf(state, k), word), roughness: 0.55 }),
      white = own(new T.MeshBasicMaterial({ color: "#ffffff", side: T.DoubleSide })),
      flashMat = own(new T.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })),
      thick = this.gravity ? 0.26 : 0.16;
    // The flat pitch's discs lie on the grass; the side view's stand up facing the camera.
    const holder = new T.Group();
    if (this.gravity) holder.rotation.x = Math.PI / 2;
    group.add(holder);
    const body = new T.Mesh(own(new T.CylinderGeometry(r, r, thick, 44)), paint);
    body.castShadow = true;
    holder.add(body);
    const edge = new T.Mesh(own(new T.CylinderGeometry(r + 0.022, r + 0.022, thick * 0.55, 44)), dark);
    holder.add(edge);
    const top = new T.Mesh(own(new T.CircleGeometry(r * 0.97, 44)), face);
    top.rotation.x = -Math.PI / 2;
    top.position.y = thick / 2 + 0.002;
    holder.add(top);
    // The kick held: a white rim round the face.
    const rim = new T.Mesh(own(new T.RingGeometry(r * 0.97, r + 0.045, 44)), white);
    rim.rotation.x = -Math.PI / 2;
    rim.position.y = thick / 2 + 0.004;
    rim.visible = false;
    holder.add(rim);
    // A kick: a ring that flashes out.
    const flash = new T.Mesh(own(new T.RingGeometry(1, 1.14, 48)), flashMat);
    flash.rotation.x = -Math.PI / 2;
    flash.position.y = this.gravity ? thick / 2 + 0.01 : 0.02;
    flash.visible = false;
    holder.add(flash);
    // My ring (and the second person's), on the ground round the disc or round its face.
    if (k === this.mine || k === this.second) {
      const ring = new T.Mesh(own(new T.RingGeometry(r + 0.07, r + 0.15, 48)), own(new T.MeshBasicMaterial({ color: k === this.mine ? "#ffd84a" : "#9be7ff", side: T.DoubleSide })));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = this.gravity ? thick / 2 + 0.006 : -thick / 2 + 0.012;
      holder.add(ring);
    }
    if (!this.gravity) holder.position.y = thick / 2;
    this.scene.add(group);
    return { group, rim, flash, flashMat };
  }
  private makeTag(own: Own, color: string, word: string) {
    const tag = new T.Sprite(own(new T.SpriteMaterial({ map: tagTexture(own, color, word), depthTest: false, transparent: true })));
    tag.scale.set(0.72, 0.54, 1);
    tag.renderOrder = 10;
    this.scene.add(tag);
    return tag;
  }
  /** The controls of every player for one slice: the people's hands here, a guest's over Wi-Fi, the computer's. */
  private inputs(world: World): Input[] {
    const state = this.state!,
      live = this.live;
    if (live) {
      const mine = this.mine !== null ? this.hands[0].input(this.gravity) : { x: 0, y: 0, kick: false };
      return hostInputs(world, state, (seat) => (live as LiveHost).control(seat), (seat) => (live as LiveHost).latest(seat), mine, this.netHands);
    }
    return state.players.map((p, k) => (k === this.mine ? this.hands[0].input(this.gravity) : k === this.second ? this.hands[1].input(this.gravity) : p.who === "cpu" ? think(world, k) : { x: 0, y: 0, kick: false }));
  }
  /** Runs the match for the time that has passed since the last frame. */
  private advance(now: number) {
    const real = Math.min(0.4, (now - this.last) / 1000);
    this.last = now;
    const world = this.world,
      live = this.live;
    if (live && !live.host) this.follow(now);
    else if (world && this.running()) {
      this.left += real;
      while (this.left >= DT && this.running()) {
        this.left -= DT;
        this.tell(stepWorld(world, this.inputs(world)));
      }
    } else this.left = 0;
    // The host tells its match to the guests (paused or not, so that one coming back sees it).
    if (live?.host && world && this.state) (live as LiveHost).tick(() => snapOf(world), now);
    if (world) {
      this.pose(now, real);
      this.crowd();
    }
    this.redraw();
  }
  /**
   * A guest's frame: my hand is sent to the host, and the host's match is drawn a moment behind; its kicks, knocks,
   * goals and whistles are heard here as their counts go up. The moves (goals, the clock's end) come from the room.
   */
  private follow(now: number) {
    const live = this.live as LiveGuest,
      world = this.world;
    if (!world) return;
    const playing = this.mine !== null && this.running() && !live.paused;
    live.tick(() => (this.mine === null ? null : inputOf(playing ? this.hands[0].hand(this.gravity) : { x: 0, y: 0, kick: false, kicks: this.hands[0].kicks, jump: false, jumps: this.hands[0].jumps })), now);
    const frame = live.frame(now),
      a = frame && readSnap(frame.a.data),
      b = frame && readSnap(frame.b.data);
    if (!frame || !a || !b) return;
    follow(world, a, b, frame.t);
    const heard = this.heard;
    if (heard) {
      const c = world.counts;
      if (c.kicks > heard.kicks) this.onKnock?.("kick", 1);
      if (c.bumps > heard.bumps) this.onKnock?.("bump", 0.6);
      if (c.posts > heard.posts) this.onKnock?.("post", 0.8);
      if (c.whistles > heard.whistles) this.onKnock?.("whistle", heard.whistles ? 0.6 : 1);
      if (c.goals > heard.goals) this.goal(b.scorer ?? 0);
    }
    this.heard = { ...world.counts };
  }
  private goal(team: 0 | 1) {
    this.cheered = performance.now();
    this.shook = team === 0 ? 1 : 0;
    this.onKnock?.("goal", 1);
  }
  /** What a slice did, told to the screen (moves) and the ear. */
  private tell(events: MatchEvent[]) {
    for (const event of events) {
      if (event.kind === "kick") this.onKnock?.("kick", event.power);
      else if (event.kind === "bump") this.onKnock?.("bump", event.power);
      else if (event.kind === "post") this.onKnock?.("post", event.power);
      else if (event.kind === "whistle") this.onKnock?.("whistle", event.start ? 1 : 0.6);
      else if (event.kind === "goal") {
        this.goal(event.team);
        this.onMove({ from: -1, to: GOAL + event.team, extra: -1 });
      } else if (event.kind === "time") this.onMove({ from: -1, to: TIME, extra: -1 });
    }
  }
  /** The crowd's murmur while the match runs, its jump after a goal. */
  private crowd() {
    const world = this.world!,
      since = (performance.now() - this.cheered) / 1000,
      on = world.phase !== "over" && !this.paused && !document.hidden;
    this.onKnock?.("crowd", on ? (since < 3 ? 1 : 0.4) : 0);
    const jump = since < 2.4 && !this.reducedMotion ? Math.abs(Math.sin(since * 11)) * 0.12 * (1 - since / 2.4) : 0;
    this.stadium?.crowd.forEach((g) => (g.position.y = jump));
    this.stadium?.nets.forEach((net, s) => {
      const shake = s === this.shook && since < 1.2 && !this.reducedMotion ? Math.sin(since * 30) * 0.05 * (1 - since / 1.2) : 0;
      net.position.x = shake;
    });
  }
  /** Puts the players and the ball where the match has them. */
  private pose(now: number, real: number) {
    const world = this.world!,
      ball = this.ball!,
      b = world.ball;
    world.men.forEach((m, k) => {
      const mesh = this.men[k];
      if (this.gravity) mesh.group.position.set(m.x, m.y, 0);
      else mesh.group.position.set(m.x, 0, -m.y);
      mesh.rim.visible = m.held;
      const f = Math.min(1, m.flash / 14);
      mesh.flash.visible = f < 1;
      if (f < 1) {
        const size = m.r + 0.05 + f * 0.55;
        mesh.flash.scale.set(size, size, size);
        mesh.flashMat.opacity = 0.9 * (1 - f);
      }
      const tag = this.tags[k];
      if (tag) tag.position.set(m.x, this.gravity ? m.y + m.r + 0.55 : 0.85, this.gravity ? 0.3 : -m.y);
    });
    const was = ball.position.clone();
    if (this.gravity) {
      ball.position.set(b.x, b.y, 0);
      ball.rotation.z -= (ball.position.x - was.x) / b.r;
    } else {
      ball.position.set(b.x, b.r, -b.y);
      const dx = ball.position.x - was.x,
        dz = ball.position.z - was.z,
        d = Math.hypot(dx, dz);
      if (d > 1e-5 && d < 2) ball.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(dz / d, 0, -dx / d), d / b.r));
    }
    void now;
    void real;
    this.describe();
  }
  /** The scoreboard and the clock over the pitch, and what browser tests read off the canvas. */
  private describe() {
    const world = this.world!,
      state = this.state!,
      left = timeLeft(world),
      secs = left === null ? world.clock * DT : left,
      clock = state.overtime || world.overtime ? "연장" : `${String(Math.floor(secs / 60)).padStart(2, "0")}:${String(Math.floor(secs % 60)).padStart(2, "0")}`,
      myTeam = this.mine === null ? -1 : state.players[this.mine].team,
      note =
        state.champion !== null
          ? "경기 종료"
          : world.phase === "goal"
            ? `${TEAM_NAMES[world.scorer ?? 0]} 골!`
            : world.phase === "kickoff"
              ? `킥오프 · ${TEAM_NAMES[world.kickoff]}`
              : state.overtime
                ? "골든골"
                : "",
      side = (t: 0 | 1) => `<span class="so-side so-t${t}${t === myTeam ? " mine" : ""}"><i></i><b>${TEAM_NAMES[t]}</b></span>`,
      text = `<div class="so-board">${side(0)}<span class="so-score"><b>${state.score[0]}</b><em>:</em><b>${state.score[1]}</b></span>${side(1)}</div><div class="so-clock${state.overtime ? " over" : ""}">${clock}</div>${note ? `<div class="so-note">${note}</div>` : ""}`;
    if (text !== this.hudText) {
      this.hudText = text;
      this.hud.innerHTML = text;
    }
    const data = this.renderer.domElement.dataset;
    data.mode = this.mode;
    data.phase = state.champion !== null ? "over" : world.phase;
    data.ball = `${world.ball.x.toFixed(2)},${world.ball.y.toFixed(2)}`;
    data.men = world.men.map((m) => `${m.x.toFixed(2)},${m.y.toFixed(2)}`).join(";");
    data.mine = this.mine === null ? "" : String(this.mine);
    data.second = this.second === null ? "" : String(this.second);
    data.clock = String(Math.round(world.clock * DT));
    data.kicks = String(world.counts.kicks);
    data.names = state.players.map((_, k) => (k === this.mine ? "나" : playerName(state, k))).join(",");
  }
  protected subject(aspect: number): TableSubject {
    if (this.gravity) {
      const { W, H } = GRAVITY;
      return { half: W + 0.75, halfZ: 0.5, height: H + 0.45, lookY: (H + 0.45) / 2 - 0.2, tilt: aspect < 1.3 ? 0.24 : 0.15 };
    }
    const narrow = aspect < 1.3;
    return { half: FLAT.BX + 0.35, halfZ: FLAT.BY + (narrow ? 0.6 : 0.85), height: 0.9, lookY: 0, tilt: narrow ? 1.2 : 1.0 };
  }
  protected spots(): Spot[] {
    return [];
  }
  protected place(state: State) {
    if (!this.built) this.build(state);
    const world = this.world!;
    // The rules decide what the clock's end and each goal mean: golden goal from a tie, or the match over.
    world.overtime = state.overtime;
    if (state.champion !== null && !world.done) {
      world.done = true;
      if (world.phase !== "goal") world.phase = "over";
    }
    this.pose(performance.now(), 0);
  }
  protected animate() {
    return false;
  }
  protected mark() {}
  /** The view's name for its mode, for the screen's words. */
  get modeName() {
    return MODE_NAMES[this.mode];
  }
  dispose() {
    cancelAnimationFrame(this.ticker);
    clearTimeout(this.letGoTimer);
    document.removeEventListener("keydown", this.keyDown);
    document.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.blurred);
    document.removeEventListener("visibilitychange", this.hidden);
    this.onKnock?.("crowd", 0);
    this.hud.remove();
    this.pad.remove();
    super.dispose();
  }
}
