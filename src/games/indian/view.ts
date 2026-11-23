import * as T from "three";
import { block, capable, wood } from "../../engine/scene-utils";
import { FOV } from "../../engine/camera";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { CARD, drawBack, drawFace } from "../cards/faces";
import { ROUNDS, owed, pot, type State } from "./rules";
import { FELT, KIND, ROLES, coinGeometry, coinMaterials, flightAt, lasts, pairs, restOf, type Counts, type Flight, type Pose, type Role } from "./coins";
import { Figure } from "./figure";
import { TABLE, lounge } from "./lounge";

export const CHIP_COLORS: [string, string] = ["#c8321f", "#2f62c0"];
const /** Where the figure sits: its own measures below are from there. */
  SEAT = new T.Vector3(0, 0, -4.6),
  /** How large its card is drawn, where it lies before it is raised and where it is held, and where the wrist is then. */
  THEIRS = 1.6,
  CARD_DEPTH = 0.012,
  DOWN = new T.Vector3(-1.3, FELT + (CARD_DEPTH * THEIRS) / 2 + 0.003, 1.95),
  HELD = new T.Vector3(0, 7.2, 0.7),
  GRIP_DOWN = new T.Vector3(0.05, 0.09, -1.32),
  GRIP_HELD = new T.Vector3(-0.9, -1.2, -0.24),
  /** Where its other hand rests on the table, and where a coin lies in it, from the wrist. */
  REST = new T.Vector3(0.95, FELT + 0.1, 1.75),
  GRASP = new T.Vector3(-0.04, -0.07, 0.42),
  PALM_DOWN = new T.Vector3(0, -1, 0),
  FORWARD = new T.Vector3(-0.12, 0, 1),
  /** Where my own card lies before me: a little to the right, clear of the figure's card when it lays its own down. */
  MY_X = 0.55,
  /** The size of a card in the scene. */
  CW = 1.05,
  CH = CW * 1.5,
  /** Coins drawn at once of each paint (sixty in play, and some in the air). */
  CAPACITY = 96;
/** A card with rounded corners and a little thickness: its back (group 0), its face (1) and its edge (2). */
function cardGeometry() {
  const r = 0.07,
    w = CW / 2 - r,
    h = CH / 2 - r,
    shape = new T.Shape();
  shape.moveTo(-w, -CH / 2);
  shape.lineTo(w, -CH / 2);
  shape.absarc(w, -h, r, -Math.PI / 2, 0, false);
  shape.lineTo(CW / 2, h);
  shape.absarc(w, h, r, 0, Math.PI / 2, false);
  shape.lineTo(-w, CH / 2);
  shape.absarc(-w, h, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-CW / 2, -h);
  shape.absarc(-w, -h, r, Math.PI, Math.PI * 1.5, false);
  const uv = (x: number, y: number) => new T.Vector2(x / CW + 0.5, y / CH + 0.5),
    geometry = new T.ExtrudeGeometry(shape, {
      depth: CARD_DEPTH,
      bevelEnabled: false,
      curveSegments: 5,
      UVGenerator: {
        generateTopUV: (_g, v, a, b, c) => [uv(v[a * 3], v[a * 3 + 1]), uv(v[b * 3], v[b * 3 + 1]), uv(v[c * 3], v[c * 3 + 1])],
        generateSideWallUV: () => [new T.Vector2(), new T.Vector2(), new T.Vector2(), new T.Vector2()],
      },
    });
  geometry.translate(0, 0, -CARD_DEPTH / 2);
  // The caps come first, the back (at z = 0, facing away) and then the face: they are given materials of their own.
  const caps = geometry.groups[0],
    sides = geometry.groups[1];
  geometry.clearGroups();
  geometry.addGroup(caps.start, caps.count / 2, 0);
  geometry.addGroup(caps.start + caps.count / 2, caps.count / 2, 1);
  geometry.addGroup(sides.start, sides.count, 2);
  return geometry;
}
/** How many coins lie where: my stack (less what I am setting as a bet), my bet, the pot, the computer's stack. */
function counts(s: State): Counts {
  const bet = s.phase === "bet" && s.turn === 0 && s.winner === null ? s.wager : 0;
  return { mine: s.chips[0] - bet, bet, pot: pot(s), theirs: s.chips[1] };
}
type Sign = { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
/** A key position of the figure's free hand (its wrist, in its own measures) at a time. */
type Key = { t: number; p: T.Vector3 };
/**
 * Seen from my own seat in a card room: a white lay figure sits across the
 * table in a leather wing chair and holds its card to its forehead, face
 * toward me. My own card is at my forehead, so all I see of it is its back at
 * the top of my view. Coins are thrown, pushed and scooped in the view's own
 * frames, as decoration: the state alone says how many lie where.
 */
export class IndianView extends TableView<State> {
  private faces = new Map<number, T.Material>();
  private figure: Figure;
  private theirs = new T.Group();
  private theirCard: T.Mesh;
  private mine: T.Mesh;
  private shown: T.Mesh;
  private easel: T.Group;
  private waiting: T.Mesh;
  private back: T.Material;
  private edge: T.Material;
  /** A small board standing by the pot that says how much lies in it, and another that says which round of the ten this is. */
  private sign: Sign;
  private count: Sign;
  private coins: T.InstancedMesh[];
  /** How many coins are laid at rest where; during a showdown the pot first, then the winner's stack. */
  private laid: Counts = { mine: 0, bet: 0, pot: 0, theirs: 0 };
  private flights: (Flight & { byHand?: boolean })[] = [];
  /** The second half of a showdown: the pot goes to whoever took it. */
  private pending: { at: number; state: State; from: Counts } | null = null;
  private keys: Key[] = [];
  private clock = 0;
  /** Whether the figure breathes and looks about by itself (only where a graphics card draws and motion is welcome). */
  private live: boolean;
  private lastKnock = 0;
  onKnock: ((kind: "disc" | "cushion" | "pocket", strength: number) => void) | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#17130f");
    const rich = capable();
    this.live = rich && !this.reducedMotion;
    this.scene.add(new T.HemisphereLight("#f4e6cf", "#2a1c14", 1.35));
    const lamp = new T.SpotLight("#ffeccc", 3.4, 0, 0.8, 0.6, 0);
    lamp.position.set(0, 12, 2);
    lamp.target.position.set(0, TABLE, -2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    lamp.shadow.normalBias = 0.02;
    this.own(lamp.shadow);
    this.scene.add(lamp, lamp.target);
    lounge(this.scene, (r) => this.own(r), rich);
    // The figure: smooth and white, jointed like an artist's model, with a face.
    this.figure = new Figure((r) => this.own(r), (o) => this.standard(o));
    this.figure.group.position.copy(SEAT);
    this.scene.add(this.figure.group);
    // The cards: its own at its forehead, mine at the top of my view, and mine again laid down once the round is over.
    const card = this.own(cardGeometry());
    this.back = this.standard({ map: this.texture((ctx, w, h) => drawBack(ctx, w, h)), roughness: 0.55 });
    this.edge = this.standard({ color: "#f1ece0", roughness: 0.7 });
    const cardMesh = (face: T.Material) => {
      const it = new T.Mesh(card, [this.back, face, this.edge]);
      it.castShadow = false;
      it.receiveShadow = true;
      return it;
    };
    // Its card lies face down on the table before it is raised.
    this.theirCard = cardMesh(this.back);
    this.theirs.add(this.theirCard);
    this.theirs.scale.setScalar(THEIRS);
    this.figure.group.add(this.theirs);
    this.pose(1);
    this.rest();
    // Neither face of my own card is ever its picture until it is laid open.
    this.mine = cardMesh(this.back);
    // Laid open, my card leans back on a little brass rest, so that its face can be read from my seat.
    this.shown = cardMesh(this.back);
    const lean = 0.36,
      half = (CH * 1.5) / 2;
    this.shown.rotation.x = -Math.PI / 2 + lean;
    this.shown.position.set(MY_X, FELT + Math.sin(lean) * half + 0.01, 2.4);
    this.shown.scale.setScalar(1.5);
    this.easel = new T.Group();
    const brass = this.standard({ color: "#c09a4f", metalness: capable() ? 0.85 : 0.4, roughness: 0.3 }),
      far = 2.4 - Math.cos(lean) * half * 0.82,
      rise = FELT + Math.sin(lean) * half * 1.82 - 0.03;
    this.add(new T.CylinderGeometry(0.025, 0.025, 1.2, 10), brass, 0, rise, far, this.easel).rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) this.add(new T.CylinderGeometry(0.02, 0.03, rise - FELT, 8), brass, s * 0.55, (rise + FELT) / 2, far - 0.02, this.easel);
    this.add(new T.BoxGeometry(1.3, 0.03, 0.06), brass, 0, FELT + 0.015, 2.4 + Math.cos(lean) * half + 0.02, this.easel);
    this.easel.position.x = MY_X;
    this.easel.visible = false;
    // My card as it is dealt: face down on the table before me.
    this.waiting = cardMesh(this.back);
    this.waiting.rotation.x = -Math.PI / 2;
    this.waiting.position.set(MY_X, FELT + CARD_DEPTH * 0.75 + 0.002, 2.4);
    this.waiting.scale.setScalar(1.5);
    this.waiting.visible = false;
    this.scene.add(this.easel);
    this.scene.add(this.shown, this.waiting, this.camera);
    // Fixed before my eyes, so that it stays at the top of the view whatever the shape of the screen.
    this.mine.position.set(0, 0.66, -1.9);
    this.mine.rotation.x = 0.45;
    this.mine.scale.setScalar(0.44);
    this.camera.add(this.mine);
    // Two boards on brass stands, either side of the figure and above the piles of coins, so that nothing on the table stands before them.
    this.sign = this.post(-2.3, 0.16);
    this.count = this.post(2.3, -0.16);
    // The coins: one drawing of each paint, every coin an instance of it.
    const coin = this.own(coinGeometry());
    this.coins = [0, 1, 2].map((kind) => {
      const mesh = new T.InstancedMesh(coin, coinMaterials(kind, (r) => this.own(r), rich), CAPACITY);
      mesh.count = 0;
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return mesh;
    });
    this.begin();
    this.kick();
  }
  /** A sign on a brass stand: a walnut frame round a painted board. */
  private post(x: number, turn: number): Sign {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 160;
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const walnut = this.standard({ map: this.own(wood(true, 0.7)), roughness: 0.4 }),
      brass = this.standard({ color: "#c09a4f", metalness: capable() ? 0.85 : 0.4, roughness: 0.3 }),
      stand = new T.Group(),
      board = new T.Mesh(this.own(new T.PlaneGeometry(1.62, 0.675)), this.own(new T.MeshBasicMaterial({ map: texture }))),
      frame = new T.Mesh(this.own(block(1.8, 0.86, 0.08, 0.035)), walnut),
      stem = new T.Mesh(this.own(new T.CylinderGeometry(0.03, 0.03, 0.95, 12)), brass),
      foot = new T.Mesh(
        this.own(new T.LatheGeometry([[0.001, 0], [0.3, 0], [0.31, 0.03], [0.22, 0.07], [0.08, 0.1], [0.05, 0.16], [0.001, 0.16]].map(([r, y]) => new T.Vector2(r, y)), 32)),
        brass,
      );
    stand.position.set(x, TABLE + 1.36, -0.9);
    stand.rotation.y = turn;
    board.position.z = 0.042;
    frame.position.z = 0;
    stem.position.set(0, -0.87, -0.01);
    foot.position.set(0, -1.36 + FELT - TABLE, -0.01);
    frame.castShadow = stem.castShadow = true;
    stand.add(frame, board, stem, foot);
    this.scene.add(stand);
    return { canvas, texture, said: "" };
  }
  /** The card and the arm that holds it, from lying on the table (0) to standing on the forehead (1). */
  private pose(p: number, faceUp = false) {
    const e = p * p * (3 - 2 * p),
      card = this.theirs.position.lerpVectors(DOWN, HELD, e);
    // It comes up in an arc, turning its face to me as it goes.
    card.y += Math.sin(Math.PI * e) * 0.35;
    card.z += Math.sin(Math.PI * e) * 0.5;
    // On the table it lies face down, or face up when it has been laid down to give the round up.
    const flat = faceUp ? -Math.PI / 2 : Math.PI / 2;
    this.theirs.rotation.x = flat + (-0.1 - flat) * e;
    const wrist = card.clone().add(new T.Vector3().lerpVectors(GRIP_DOWN, GRIP_HELD, e)),
      palm = new T.Vector3().lerpVectors(PALM_DOWN, new T.Vector3(0.15, 0, 1), e);
    this.figure.cardArm.reach(wrist, palm, new T.Vector3(0, 0, 1), e);
  }
  /** The free hand at rest on the table. */
  private rest(at = REST) {
    this.figure.freeArm.reach(at, PALM_DOWN, FORWARD, 0.15);
  }
  /** The figure picks its card up from the table and raises it to its forehead. */
  private lift() {
    this.pose(0);
    this.tween(180, 1100, (p) => this.pose(p));
  }
  /** It gives the round up: the card comes down from the forehead and is laid on the table, face up. */
  private layDown() {
    this.pose(1);
    this.tween(120, 900, (p) => this.pose(1 - p, true));
  }
  private texture(paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
    const canvas = document.createElement("canvas");
    [canvas.width, canvas.height] = CARD.pixels;
    paint(canvas.getContext("2d")!, canvas.width, canvas.height);
    const t = this.own(new T.CanvasTexture(canvas));
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  private face(value: number) {
    // A card not known to this device (its own over Wi-Fi, or one not yet raised) is 0: its back only.
    if (!value) return this.back;
    let material = this.faces.get(value);
    if (!material) {
      material = this.standard({ map: this.texture((ctx, w, h) => drawFace(ctx, w, h, `${value === 1 ? "A" : value}S`)), roughness: 0.55 });
      this.faces.set(value, material);
    }
    return material;
  }
  protected subject(aspect: number): TableSubject {
    return { half: aspect < 1 ? 2.7 : 3.7, halfZ: 0.6, height: 8.9, lookY: 5.3, tilt: 0.2 };
  }
  protected spots(): Spot[] {
    return [];
  }
  /** Writes a word and a figure on one of the boards: gold on green baize, in a gilt line. */
  private say(sign: Sign, label: string, value: string) {
    if (sign.said === label + value) return;
    sign.said = label + value;
    const ctx = sign.canvas.getContext("2d")!,
      g = ctx.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, "#17402f");
    g.addColorStop(1, "#0d281d");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 384, 160);
    ctx.strokeStyle = "#d6b25e";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(10, 10, 364, 140, 14);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(19, 19, 346, 122, 9);
    ctx.stroke();
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = "#efe3c4";
    ctx.font = '700 64px "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans KR", sans-serif';
    ctx.fillText(label, 36, 84);
    ctx.textAlign = "right";
    ctx.fillStyle = "#f6cf63";
    ctx.shadowColor = "rgba(0,0,0,0.45)";
    ctx.shadowOffsetY = 3;
    ctx.font = `800 ${value.length > 3 ? 82 : 100}px "Helvetica Neue", Arial, sans-serif`;
    ctx.fillText(value, 350, 88);
    ctx.shadowColor = "transparent";
    sign.texture.needsUpdate = true;
  }
  protected place(state: State) {
    this.placeCards(state);
    // The coins: as the state has them, unless the pot of a showdown is still to be taken.
    if (this.pending && this.pending.state !== state) this.pending = null;
    this.laid = this.pending ? this.pending.from : counts(state);
    this.flights = this.flights.filter((f) => !f.target || f.target.index < this.laid[f.target.role]);
    if (!this.keys.length) this.rest();
    this.drawCoins(performance.now());
    this.say(this.sign, "판돈", String(this.laid.pot));
    this.say(this.count, "판", `${state.round}/${ROUNDS}`);
  }
  private placeCards(state: State) {
    const showing = state.phase === "show" || state.winner !== null,
      ready = state.phase === "ready" && state.winner === null;
    this.theirCard.material = [this.back, this.face(state.cards[1]), this.edge];
    // Before the round the cards lie face down; a card given up lies face up; otherwise it is on the forehead.
    if (ready) this.pose(0);
    else if (showing && state.folded === 1) this.pose(0, true);
    else this.pose(1);
    // My own card: face down before me, then on my forehead (its back at the top of my view), then laid open.
    this.waiting.visible = ready;
    this.mine.visible = !showing && !ready;
    this.shown.visible = this.easel.visible = showing;
    this.shown.material = [this.back, showing ? this.face(state.cards[0]) : this.back, this.edge];
    // For browser tests: the card on the figure's forehead once raised, and my own only once the round is shown.
    const el = this.renderer.domElement;
    el.dataset.theirs = ready || !state.cards[1] ? "" : String(state.cards[1]);
    el.dataset.mine = showing && state.cards[0] ? String(state.cards[0]) : "";
  }
  sync(state: State, animate = true) {
    // A table laid out afresh (a new game, a rebuild) has nothing in the air: every coin lies where the state says.
    if (!animate || this.reducedMotion) this.settleCoins();
    super.sync(state, animate);
  }
  private settleCoins() {
    this.flights = [];
    this.pending = null;
    this.keys = [];
  }
  protected animate(before: State, state: State) {
    const now = performance.now();
    this.firePending(now);
    if (state.ply === before.ply) {
      // My bet being set: a coin thrown onto the table for each one more, picked back up for each one fewer.
      const was = counts(before),
        is = counts(state);
      if (is.bet === was.bet + 1) this.toss(was.bet, now);
      else if (is.bet === was.bet - 1) this.pickUp(is.bet, now);
      else this.move(was, is, now);
      this.laid = is;
      this.kick();
      return false;
    }
    if (state.ply !== before.ply + 1) return false;
    this.placeCards(state);
    this.say(this.count, "판", `${state.round}/${ROUNDS}`);
    let busy = 300;
    // The cards are raised when I say so; the figure lays its own down when it gives the round up.
    if (before.phase === "ready" && state.phase === "bet") {
      this.lift();
      busy = 1300;
    } else if (before.phase === "bet" && state.phase === "show" && state.folded === 1) {
      this.layDown();
      busy = 1050;
    }
    const was = counts(before),
      is = counts(state),
      mover = before.turn;
    if (before.phase === "bet" && state.phase === "show") {
      // A showdown: what the last bet puts in goes into the pot, and a moment later the pot goes to whoever took it.
      const paid = state.folded === null ? Math.min(owed(before), before.chips[mover]) : 0,
        middle: Counts = { ...was, bet: 0, pot: was.pot + was.bet + paid };
      if (mover === 0) middle.mine -= paid;
      else middle.theirs -= paid;
      this.bet(was, middle, mover, 0, now);
      this.pending = { at: now + (paid ? 1000 : 650), state, from: middle };
      this.laid = middle;
    } else if (before.phase === "bet" && state.phase === "bet") {
      // A bet made: by me from my bet and my stack; by the figure's hand, its raise thrown a coin at a time.
      const raised = mover === 1 ? Math.max(0, state.bets[1] - before.bets[1] - Math.min(owed(before), before.chips[1])) : 0;
      if (mover === 1 && is.pot === was.pot) this.tap(now);
      this.bet(was, is, mover, raised, now);
      this.laid = is;
    } else {
      // A new round: the antes go in.
      this.move(was, is, now);
      this.laid = is;
    }
    this.drawCoins(now);
    this.say(this.sign, "판돈", String(this.laid.pot));
    this.tween(0, busy, () => {});
    this.kick();
    return true;
  }
  /** The present pose of the `index`-th coin of `role`, taken out of any flight that was bringing it there. */
  private take(role: Role, index: number, now: number): Pose {
    const i = this.flights.findIndex((f) => f.target?.role === role && f.target.index === index);
    if (i < 0) return restOf(role, index);
    const pose = { p: new T.Vector3(), q: new T.Quaternion() };
    flightAt(this.flights[i], now, pose);
    this.flights.splice(i, 1);
    return pose;
  }
  /** Where my hand is, just below the bottom of my view: my coins are thrown from there and picked back up to it. */
  private myHand(): Pose {
    this.camera.updateMatrixWorld();
    const depth = 3,
      p = this.camera.localToWorld(new T.Vector3(0.7, -depth * Math.tan(((FOV / 2) * Math.PI) / 180) - 0.35, -depth));
    return { p, q: new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 1.2) };
  }
  /** One more coin of my bet: thrown from my hand onto my pile. */
  private toss(index: number, now: number) {
    this.flights.push({
      style: "throw",
      from: this.myHand(),
      to: restOf("bet", index),
      target: { role: "bet", index },
      kind: KIND.bet,
      landKind: KIND.bet,
      start: now,
      turns: 2 + (index % 2),
      phase: Math.random() * Math.PI * 2,
      heard: 0,
    });
  }
  /** One fewer: the top coin of my bet picked back up. */
  private pickUp(index: number, now: number) {
    this.flights.push({ style: "away", from: this.take("bet", index, now), to: this.myHand(), target: null, kind: KIND.bet, landKind: KIND.bet, start: now, turns: 1, phase: 0, heard: 0 });
  }
  /** Every coin that changes place between two layouts slides or is scooped across, one just after another. */
  private move(from: Counts, to: Counts, now: number, delay = 0, gap = 30) {
    const list = pairs(from, to);
    list.forEach(({ from: a, to: b }, i) =>
      this.flights.push({
        style: "slide",
        from: this.take(a.role, a.index, now),
        to: restOf(b.role, b.index),
        target: b,
        kind: KIND[a.role],
        landKind: KIND[b.role],
        start: now + delay + i * gap,
        turns: 0,
        phase: 0,
        heard: 0,
      }),
    );
    if (list.length) this.onContact();
    return list.length;
  }
  /**
   * A bet made by `mover`. Mine slides in from my pile and my stack; the figure's hand pushes the coins it calls with
   * and throws its raise, `raised` coins one by one.
   */
  private bet(from: Counts, to: Counts, mover: 0 | 1, raised: number, now: number) {
    const list = pairs(from, to);
    if (mover === 0 || !list.length) {
      this.move(from, to, now);
      return;
    }
    const local = (p: T.Vector3) => p.clone().sub(SEAT),
      toward = (p: T.Vector3, share: number) => p.clone().lerp(restOf("pot", 0).p, share),
      pushed = list.slice(0, list.length - raised),
      thrown = list.slice(list.length - raised);
    this.keys = [{ t: now, p: this.figure.freeArm.wrist.clone() }];
    let t = now + 120;
    if (pushed.length) {
      // The hand comes down behind the coins it calls with and pushes them out toward the pot.
      const first = restOf(pushed[0].from.role, pushed[0].from.index).p;
      this.keys.push({ t: t + 300, p: local(first).add(new T.Vector3(0.1, 0.12, -0.35)) });
      pushed.forEach(({ from: a, to: b }, i) =>
        this.flights.push({
          style: "slide",
          from: this.take(a.role, a.index, now),
          to: restOf(b.role, b.index),
          target: b,
          kind: KIND[a.role],
          landKind: KIND[b.role],
          start: t + 300 + i * 30,
          turns: 0,
          phase: 0,
          heard: 0,
        }),
      );
      this.keys.push({ t: t + 300 + 380, p: local(toward(first, 0.4)).add(new T.Vector3(0, 0.12, -0.35)) });
      t += 300 + 420;
      this.onContact();
    }
    thrown.forEach(({ from: a, to: b }, i) => {
      // Picked off the top of a stack, raised and flicked toward the pot.
      const source = this.take(a.role, a.index, now),
        release = toward(source.p, 0.28).setY(FELT + 0.75),
        grab = t + 300,
        start = grab + 260;
      this.keys.push({ t: grab, p: local(source.p).sub(GRASP) });
      this.flights.push({
        style: "throw",
        from: { p: release, q: source.q.clone() },
        to: restOf(b.role, b.index),
        target: b,
        kind: KIND[a.role],
        landKind: KIND[b.role],
        start,
        held: { at: grab, from: source },
        turns: 2 + (i % 2),
        phase: Math.random() * Math.PI * 2,
        heard: 0,
        byHand: true,
      });
      this.keys.push({ t: start, p: local(release).sub(GRASP) }, { t: start + 160, p: local(toward(release, 0.12)).sub(GRASP).add(new T.Vector3(0, -0.15, 0)) });
      t = start + 60;
    });
    this.keys.push({ t: t + 450, p: REST.clone() });
  }
  /** A check: two taps of the free hand on the table. */
  private tap(now: number) {
    const up = (h: number) => REST.clone().add(new T.Vector3(0, h, -0.05));
    this.keys = [
      { t: now, p: this.figure.freeArm.wrist.clone() },
      { t: now + 170, p: up(0.32) },
      { t: now + 280, p: REST.clone() },
      { t: now + 400, p: up(0.24) },
      { t: now + 510, p: REST.clone() },
    ];
  }
  /** The pot goes to whoever took it (or stays for the next round after a tie). */
  private firePending(now: number) {
    const pending = this.pending;
    if (!pending) return;
    this.pending = null;
    this.laid = counts(pending.state);
    this.move(pending.from, this.laid, now, 0, 26);
    this.say(this.sign, "판돈", String(this.laid.pot));
  }
  /** Lays every coin: those at rest where they lie, those in flight where they are now. */
  private drawCoins(now: number) {
    const used = [0, 0, 0],
      matrix = new T.Matrix4(),
      one = new T.Vector3(1, 1, 1),
      busy = new Set(this.flights.filter((f) => f.target).map((f) => `${f.target!.role}${f.target!.index}`)),
      pose: Pose = { p: new T.Vector3(), q: new T.Quaternion() },
      put = (kind: number) => {
        if (used[kind] < CAPACITY) this.coins[kind].setMatrixAt(used[kind]++, matrix.compose(pose.p, pose.q, one));
      };
    for (const role of ROLES)
      for (let i = 0; i < this.laid[role]; i++) {
        if (busy.has(`${role}${i}`)) continue;
        restOf(role, i, pose);
        put(KIND[role]);
      }
    for (const f of this.flights) put(flightAt(f, now, pose).kind);
    this.coins.forEach((mesh, kind) => {
      mesh.count = used[kind];
      mesh.instanceMatrix.needsUpdate = true;
    });
  }
  /** Runs the view's own frames while anything moves by itself: coins, the free hand, the figure breathing. */
  private kick() {
    if (!this.clock && !this.disposed) this.clock = requestAnimationFrame(this.frame);
  }
  private frame = (now: number) => {
    this.clock = 0;
    if (this.disposed) return;
    now = performance.now();
    if (this.pending && now >= this.pending.at) this.firePending(now);
    const pose: Pose = { p: new T.Vector3(), q: new T.Quaternion() };
    this.flights = this.flights.filter((f) => {
      const at = flightAt(f, now, pose);
      if (at.sound > f.heard) {
        // A thrown coin rings as it lands, again after its hop and faintly as it settles; a pushed one clicks once.
        const strength = f.style === "throw" ? [0, 0.9, 0.35, 0.12][at.sound] : at.sound === 1 ? 0.28 : 0;
        if (strength && (f.style === "throw" || now - this.lastKnock > 90)) {
          this.onKnock?.("disc", strength);
          this.lastKnock = now;
        }
        f.heard = at.sound;
      }
      return !at.done && now - f.start < lasts(f) + 50;
    });
    this.hand(now);
    if (this.live) this.figure.idle(now / 1000);
    this.drawCoins(now);
    this.redraw();
    if (this.live || this.flights.length || this.pending || this.keys.length) this.kick();
  };
  /** The free hand follows its keys, or the coin it carries. */
  private hand(now: number) {
    if (!this.keys.length) return;
    const carried = this.flights.find((f) => f.byHand && f.held && now >= f.held.at && now < f.start);
    if (carried) {
      const pose: Pose = { p: new T.Vector3(), q: new T.Quaternion() };
      flightAt(carried, now, pose);
      this.rest(pose.p.sub(SEAT).sub(GRASP));
      return;
    }
    const keys = this.keys,
      last = keys[keys.length - 1];
    if (now >= last.t) {
      this.rest(last.p);
      this.keys = [];
      return;
    }
    let k = 0;
    while (k < keys.length - 2 && now >= keys[k + 1].t) k++;
    const a = keys[k],
      b = keys[k + 1],
      s = Math.min(1, Math.max(0, (now - a.t) / Math.max(1, b.t - a.t)));
    this.rest(a.p.clone().lerp(b.p, s * s * (3 - 2 * s)));
  }
  protected mark(_marks: Marks) {}
  dispose() {
    cancelAnimationFrame(this.clock);
    this.clock = 0;
    super.dispose();
  }
}
