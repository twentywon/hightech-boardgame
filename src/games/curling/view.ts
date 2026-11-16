import * as T from "three";
import { block, glossy, stuff } from "../../engine/scene-utils";
import { speckled } from "../../engine/scenery";
import type { Marks } from "../points/view";
import { FlickView } from "../flick/view";
import { copy, shotCode, shotOf, strike, type Disc } from "../flick/physics";
import { ringMesh, type Spot, type TableSubject } from "../table/view";
import { ARENA, BACK, CURL, HACK, HOG, HOUSE, R, STONE, STONES, SWEEP_SLICES, SWEEP_WINDOWS, TEE, speedOf, swept, type State } from "./rules";

export const CURLING_COLORS: [string, string] = ["#c8321f", "#e0b020"];
export const CURLING_SUBJECT: TableSubject = { half: 7.5, halfZ: 2.7, height: 0.4, lookY: 0, tilt: 1.0 };
/**
 * The thrower's eye (the user asked for a first-person view): behind the hack and a little above it, looking down
 * the sheet, so that the house lies far up the screen and a stone is pulled back toward oneself.
 */
export const EYE = { back: 5, height: 3, ahead: 2.6 };
/** How far the eye goes down the sheet after a stone: until the house is in the middle of the view. */
export const CHASE = TEE - (HACK.x + EYE.ahead);
/** A pull on the ground counts this many times its length, so that a full pull fits between the hack and the bottom of the screen. */
export const PULL = 2.4;
/** Sets a camera at the thrower's eye, moved `shift` down the sheet; browser tests aim with the same. */
export function throwerCamera(camera: T.PerspectiveCamera, shift = 0) {
  camera.position.set(HACK.x - EYE.back + shift, EYE.height, HACK.z);
  camera.lookAt(HACK.x + EYE.ahead + shift, 0, HACK.z);
  camera.updateMatrixWorld();
}
/**
 * The scoreboard (the user sent a stadium's and asked for one): a lit board hung from the roof by two cables over
 * the next sheet at the right, turned square to the thrower's eye, its shape (`width`, `height`, scaled to fit) and
 * where it is seen while the eye is at the hack, as shares of the screen (its right edge, its top, and how much of
 * the height it takes) at a fixed distance before the eye (`depth`, short of the far wall, which would hide it), so
 * that it is the same on any shape of screen and clear of the status line at the top.
 * It leaves the view when the eye follows a stone down the ice.
 */
export const BOARD = { width: 5.4, height: 1.8, right: 0.975, top: 0.08, share: 0.19, depth: 12.5 };
/** On a short screen (a phone held sideways) it is larger, and lower, below the status line. */
export const SMALL_BOARD = { top: 0.12, share: 0.26, depth: 9 };
/** Where the stones not yet thrown wait, beside the sheet at the hack's end: mine on the near side, the computer's across. */
export const waitingAt = (side: number, k: number) => ({ x: -6.9 + k * 0.48, z: side === 0 ? 2.15 : -2.15 });
/** The ice: pebbled white with the house in blue and red rings, and the lines across. */
function iceTexture() {
  const W = 2048,
    H = 512,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    sx = (x: number) => ((x + ARENA.halfX) / (2 * ARENA.halfX)) * W,
    sz = (z: number) => ((z + ARENA.halfZ) / (2 * ARENA.halfZ)) * H,
    unit = W / (2 * ARENA.halfX);
  ctx.fillStyle = "#f4f8fb";
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = `rgba(${180 + (i % 40)}, ${205 + (i % 30)}, 230, 0.25)`;
    ctx.fillRect((i * 811) % W, (i * 367) % H, 2, 2);
  }
  // The house: twelve-foot blue, eight-foot white, four-foot red, the button white.
  for (const [r, color] of [[HOUSE, "#2f62c0"], [HOUSE * 0.68, "#f4f8fb"], [HOUSE * 0.36, "#c8321f"], [0.15, "#f4f8fb"]] as [number, string][]) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(sx(TEE), sz(0), r * unit, r * unit, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const line = (x: number, color: string, width: number) => {
    ctx.fillStyle = color;
    ctx.fillRect(sx(x) - width / 2, 0, width, H);
  };
  line(HOG, "#c8321f", 10);
  line(TEE, "#2a2a35", 4);
  line(BACK, "#2a2a35", 4);
  line(HACK.x - 0.3, "#2a2a35", 4);
  ctx.fillStyle = "#2a2a35";
  ctx.fillRect(sx(HACK.x - 0.3), sz(0) - 2, sx(BACK) - sx(HACK.x - 0.3), 4);
  // The hack itself: two dark rubber footholds.
  ctx.fillStyle = "#1d1f23";
  ctx.fillRect(sx(HACK.x - 0.45), sz(-0.18), 0.22 * unit, 0.14 * unit);
  ctx.fillRect(sx(HACK.x - 0.45), sz(0.04), 0.22 * unit, 0.14 * unit);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** A curling stone: polished granite with a bevelled band, and a coloured handle on top. */
function stoneShape() {
  const profile = [[0, 0], [0.12, 0], [0.16, 0.02], [0.17, 0.05], [0.17, 0.09], [0.16, 0.12], [0.12, 0.14], [0, 0.145]].map(([r, y]) => new T.Vector2(r, y));
  return new T.LatheGeometry(profile, 32);
}
/** A stone: the granite body and its handle on two posts, in the handle's colour. */
function curlingStone(body: T.BufferGeometry, granite: T.Material, grip: T.BufferGeometry, post: T.BufferGeometry, paint: T.Material) {
  const g = new T.Group(),
    b = new T.Mesh(body, granite),
    h = new T.Mesh(grip, paint);
  b.castShadow = b.receiveShadow = true;
  h.position.set(0, 0.2, 0);
  h.castShadow = true;
  for (const dx of [-0.07, 0.07]) {
    const p = new T.Mesh(post, paint);
    p.position.set(dx, 0.16, 0);
    g.add(p);
  }
  g.add(b, h);
  return g;
}
/** How far apart the sheets of the rink lie, centre to centre. */
const PITCH = ARENA.halfZ * 2 + 1.1;
/**
 * A sheet of ice seen from behind the hack, the house far up it; a stone is pulled back toward oneself and let go,
 * and the eye follows it down the ice, then comes back to the hack.
 */
export class CurlingView extends FlickView<State> {
  private stones: T.Group[] = [];
  /** A stone of each side standing in the hack, ready to be slid (the stones of an end scored may still lie on the ice). */
  private ready: T.Group[] = [];
  private turnMark: T.Mesh;
  private cursor: T.Mesh;
  /** How far down the sheet the eye is, the stone it follows during a shot, and a count that stops an old glide back. */
  private shift = 0;
  private chasing: number | null = null;
  private landed = false;
  private glide = 0;
  /** The scoreboard: its case, the lit face painted on a canvas and what it shows now, and the cables it hangs by. */
  private board = new T.Group();
  private face: { canvas: HTMLCanvasElement; texture: T.CanvasTexture; said: string };
  private cables: T.Mesh[] = [];
  /**
   * A stone of mine being thrown (the user asked for sweeping): it runs live before the throw is made, and the
   * spells it was swept in are gathered into `sweep`, which the throw then carries. `made` is the count of moves the
   * throw leads to, whose state is then laid out without running the shot again.
   */
  private live: { ply: number; point: number; code: number; id: number; sweep: number } | null = null;
  private made = -1;
  /** Whether the player is sweeping now (holding the ice, the button or Space), whether the stone is being swept, and the sweeping of a throw replayed. */
  private sweeping = false;
  private swept = false;
  private replayed = 0;
  /** Two brooms that sweep before a swept stone, and the button to hold while a stone of mine runs. */
  private brooms: T.Group[] = [];
  private sweepButton: HTMLButtonElement;
  private unlisten: () => void;
  constructor(
    host: HTMLElement,
    quality: "high" | "low",
    private mode: "local" | "ai" = "ai",
  ) {
    super(host, quality, "#1c2630");
    this.daylight("#f2f7ff", "#5a6878", "#ffffff", 9, 2.0);
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    const ice = this.standard({ map: keep(iceTexture()), roughness: 0.18, metalness: 0.05 }),
      boards = this.standard({ color: "#d9dfe6", roughness: 0.5 });
    this.add(block(ARENA.halfX * 2, 0.1, ARENA.halfZ * 2, 0.02), [boards, boards, ice, boards, boards, boards], 0, -0.05, 0).castShadow = false;
    // Low boards at the ends of the sheet; its sides are the rink's foam dividers (`rink`).
    for (const x of [-ARENA.halfX - 0.08, ARENA.halfX + 0.08]) this.add(block(0.12, 0.18, ARENA.halfZ * 2 + 0.3, 0.04), boards, x, 0.04, 0);
    const granite = keep(glossy({ ...stuff("stone", "#8a8d92", 0.4, keep), roughness: 0.25 })),
      body = keep(stoneShape()),
      grip = keep(new T.CapsuleGeometry(0.035, 0.16, 4, 8).rotateZ(Math.PI / 2)),
      post = keep(new T.CylinderGeometry(0.03, 0.03, 0.05, 8));
    CURLING_COLORS.forEach((color, side) => {
      const paint = keep(glossy({ color, roughness: 0.3 }));
      for (let k = 0; k <= STONES; k++) {
        const g = curlingStone(body, granite, grip, post, paint);
        this.scene.add(g);
        if (k < STONES) this.stones.push(g);
        else this.ready.push(g);
      }
    });
    this.rink(ice.map!, boards, granite, body, grip, post);
    this.face = this.scoreboard();
    // An arrow on the ice by the hack shows the turn chosen.
    const shape = new T.Shape();
    shape.absarc(0, 0, 0.32, 0.3, Math.PI * 1.6, false);
    shape.absarc(0, 0, 0.24, Math.PI * 1.6, 0.3, true);
    this.turnMark = new T.Mesh(keep(new T.ShapeGeometry(shape)), keep(new T.MeshBasicMaterial({ color: "#2f62c0", transparent: true, opacity: 0.8, side: T.DoubleSide })));
    this.turnMark.rotation.x = -Math.PI / 2;
    this.turnMark.position.set(HACK.x, 0.02, HACK.z);
    this.scene.add(this.turnMark);
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.cursor = ringMesh(own, 0.26, 0.32, "#ffd24a");
    this.scene.add(this.cursor);
    // The sweepers' brooms: a black shaft rising back toward the sweeper's hands at the side, and a red or blue pad on the ice.
    const shaft = keep(new T.CylinderGeometry(0.022, 0.022, 1.45, 8).translate(0, 0.725, 0)),
      pad = keep(block(0.13, 0.06, 0.36, 0.025)),
      black = this.standard({ color: "#1d1f23", roughness: 0.5 });
    for (const [side, color] of [[-1, "#c8321f"], [1, "#2f62c0"]] as const) {
      const broom = new T.Group(),
        stick = new T.Mesh(shaft, black),
        head = new T.Mesh(pad, this.standard({ color, roughness: 0.9 }));
      head.position.y = 0.03;
      stick.position.y = 0.05;
      stick.rotation.set(side * 0.55, 0, 0.95);
      stick.castShadow = head.castShadow = true;
      broom.add(stick, head);
      broom.visible = false;
      broom.userData.side = side;
      this.scene.add(broom);
      this.brooms.push(broom);
    }
    // Held down while a stone of mine runs: sweeping. A press anywhere on the ice and Space (or S) do the same.
    this.sweepButton = document.createElement("button");
    this.sweepButton.className = "cu-sweep";
    this.sweepButton.type = "button";
    this.sweepButton.hidden = true;
    this.sweepButton.setAttribute("aria-label", "스위핑: 누르고 있는 동안 얼음을 닦습니다");
    this.sweepButton.innerHTML = "스위핑<small>누르고 있기</small>";
    const hold = (on: boolean) => {
      this.sweeping = on && !!this.live;
      this.sweepButton.setAttribute("aria-pressed", String(this.sweeping));
    };
    this.sweepButton.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.sweepButton.setPointerCapture(e.pointerId);
      hold(true);
    });
    for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) this.sweepButton.addEventListener(name, () => hold(false));
    this.sweepButton.addEventListener("contextmenu", (e) => e.preventDefault());
    host.append(this.sweepButton);
    const canvas = this.renderer.domElement,
      press = () => this.live && hold(true),
      lift = () => hold(false),
      SWEEP_KEYS = [" ", "s", "S", "ㄴ"],
      down = (e: KeyboardEvent) => {
        if (!this.live || !SWEEP_KEYS.includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        hold(true);
      },
      up = (e: KeyboardEvent) => {
        if (!SWEEP_KEYS.includes(e.key)) return;
        if (this.live) {
          e.preventDefault();
          e.stopPropagation();
        }
        hold(false);
      };
    canvas.addEventListener("pointerdown", press);
    for (const name of ["pointerup", "pointercancel", "pointerleave"]) canvas.addEventListener(name, lift);
    window.addEventListener("keydown", down, true);
    window.addEventListener("keyup", up, true);
    window.addEventListener("blur", lift);
    this.unlisten = () => {
      window.removeEventListener("keydown", down, true);
      window.removeEventListener("keyup", up, true);
      window.removeEventListener("blur", lift);
    };
    this.begin();
  }
  /**
   * The rink round the sheet (the user asked for an ice rink): pebbled ice under everything, two sheets either side
   * (lit less, with stones of other clubs resting in their houses and brooms on the ice), dark foam dividers between
   * the sheets, rubber hacks, and beyond the houses and along both sides a white dasher wall with glass over it and
   * rows of seats rising behind, some of them taken. Nothing stands behind the hack: the eye is there.
   */
  private rink(markings: T.Texture, boards: T.Material, granite: T.Material, body: T.BufferGeometry, grip: T.BufferGeometry, post: T.BufferGeometry) {
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r),
      floor = this.add(
        new T.PlaneGeometry(120, 90),
        this.standard({ map: keep(speckled("#e7eff5", ["#d6e3ed", "#f6fafd", "#cddbe7", "#e1ebf3"], 11, 40, 3200)), roughness: 0.16, metalness: 0.02 }),
        0,
        -0.012,
        0,
      );
    floor.rotation.x = -Math.PI / 2;
    floor.castShadow = false;
    const SHEETS = [-2, -1, 0, 1, 2].map((k) => k * PITCH),
      rubber = this.standard({ color: "#17181b", roughness: 0.7 }),
      foothold = keep(block(0.22, 0.05, 0.13, 0.02));
    // The other sheets are lit less than the one being played, so that the eye stays on it.
    const ice = this.standard({ map: markings, color: "#c3ccd5", roughness: 0.22, metalness: 0.05 });
    for (const z of SHEETS) {
      if (z) {
        this.add(block(ARENA.halfX * 2, 0.1, ARENA.halfZ * 2, 0.02), [boards, boards, ice, boards, boards, boards], 0, -0.05, z).castShadow = false;
        for (const x of [-ARENA.halfX - 0.08, ARENA.halfX + 0.08]) this.add(block(0.12, 0.18, ARENA.halfZ * 2 + 0.3, 0.04), boards, x, 0.04, z);
      }
      // The hack's two rubber footholds, where the painted ones are.
      for (const dz of [-0.11, 0.11]) {
        const hold = new T.Mesh(foothold, rubber);
        hold.position.set(HACK.x - 0.34, 0.02, z + dz);
        hold.castShadow = hold.receiveShadow = true;
        this.scene.add(hold);
      }
    }
    // Foam dividers along both sides of every sheet.
    const foam = this.standard({ color: "#22324f", roughness: 0.55 }),
      bar = keep(new T.CylinderGeometry(0.07, 0.07, ARENA.halfX * 2 + 0.4, 14).rotateZ(Math.PI / 2));
    for (const z of SHEETS)
      for (const side of [-1, 1]) {
        const mesh = new T.Mesh(bar, foam);
        mesh.position.set(0, 0.06, z + side * (ARENA.halfZ + 0.1));
        mesh.castShadow = mesh.receiveShadow = true;
        this.scene.add(mesh);
      }
    // Stones of the other sheets' games, in blue and green, lying where they came to rest.
    const club = ["#2f62c0", "#2f8a52"].map((color) => keep(glossy({ color, roughness: 0.3 })));
    for (const [x, z, c] of [
      [4.2, -PITCH + 0.35, 0], [5.0, -PITCH - 0.55, 1], [3.6, -PITCH - 0.95, 0], [5.6, -PITCH + 0.9, 1], [2.2, -PITCH + 0.6, 1],
      [4.4, PITCH - 0.95, 1], [5.3, PITCH - 1.2, 0], [-1.4, PITCH - 1.1, 0], [4.9, PITCH + 0.4, 1],
      [4.6, -2 * PITCH + 0.2, 1], [3.9, 2 * PITCH - 0.6, 0],
    ]) {
      const stone = curlingStone(body, granite, grip, post, club[c]);
      stone.position.set(x, 0, z);
      stone.rotation.y = x * 1.7;
      this.scene.add(stone);
    }
    // Brooms left lying by the hacks of the other sheets: a shaft and a pad.
    const shaft = keep(new T.CylinderGeometry(0.025, 0.025, 1.5, 8).rotateZ(Math.PI / 2)),
      pad = keep(block(0.12, 0.06, 0.34, 0.025)),
      black = this.standard({ color: "#1d1f23", roughness: 0.5 }),
      fabric = ["#c8321f", "#2f62c0"].map((color) => this.standard({ color, roughness: 0.9 }));
    for (const [x, z, turn, c] of [[-4.4, -PITCH - 0.8, 0.5, 0], [-3.9, PITCH - 1.15, -0.3, 1]]) {
      const broom = new T.Group(),
        stick = new T.Mesh(shaft, black),
        head = new T.Mesh(pad, fabric[c]);
      stick.position.set(0, 0.04, 0);
      head.position.set(0.78, 0.03, 0);
      stick.castShadow = head.castShadow = true;
      broom.add(stick, head);
      broom.position.set(x, 0, z);
      broom.rotation.y = turn;
      this.scene.add(broom);
    }
    // The dasher wall with glass over it beyond the houses and along both sides, and seats rising behind it.
    const white = this.standard({ color: "#f1f4f7", roughness: 0.45 }),
      kick = this.standard({ color: "#1f3f7a", roughness: 0.5 }),
      cap = this.standard({ color: "#2f62c0", roughness: 0.4 }),
      glass = this.own(new T.MeshStandardMaterial({ color: "#dff0ff", roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false })),
      concrete = this.standard({ color: "#8e959d", roughness: 0.9 }),
      endX = ARENA.halfX + 0.75,
      sideZ = 2 * PITCH + ARENA.halfZ + 0.6,
      backX = -16,
      ROWS = 4,
      deep = endX + 0.95 + ROWS * 0.85;
    const wall = (length: number, along: "x" | "z", x: number, z: number) => {
      const put = (w: number, h: number, y: number, m: T.Material) => this.add(along === "z" ? block(0.16, h, w, 0.03) : block(w, h, 0.16, 0.03), m, x, y, z);
      put(length, 0.82, 0.41, white);
      put(length + 0.02, 0.2, 0.1, kick).castShadow = false;
      put(length + 0.04, 0.07, 0.84, cap);
      const pane = this.add(along === "z" ? new T.PlaneGeometry(length, 1.1).rotateY(Math.PI / 2) : new T.PlaneGeometry(length, 1.1), glass, x, 1.43, z);
      pane.castShadow = pane.receiveShadow = false;
    };
    wall(sideZ * 2, "z", endX, 0);
    for (const side of [-1, 1]) wall(endX - backX, "x", (endX + backX) / 2, side * sideZ);
    // Concrete steps, each row of seats a step higher; the ends' seats face back down the ice, the sides' across it.
    const pan = keep(block(0.5, 0.08, 0.46, 0.03)),
      back = keep(block(0.5, 0.48, 0.07, 0.03)),
      plastic = this.own(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.45 })),
      seats: { x: number; z: number; y: number; turn: number; red: boolean }[] = [];
    for (let row = 0; row < ROWS; row++) {
      const rise = 0.42 * (row + 1),
        out = 0.95 + row * 0.85;
      this.add(block(0.85, rise, sideZ * 2 + ROWS * 1.7, 0.03), concrete, endX + out, rise / 2, 0).castShadow = false;
      for (let z = -sideZ + 0.3; z < sideZ; z += 0.66) seats.push({ x: endX + out, z, y: rise, turn: -Math.PI / 2, red: Math.abs(Math.round(z / 0.66)) % 7 === row });
      for (const side of [-1, 1]) {
        this.add(block(endX + out - backX, rise, 0.85, 0.03), concrete, (endX + out + backX) / 2, rise / 2, side * (sideZ + out)).castShadow = false;
        for (let x = backX + 0.5; x < endX + out - 0.4; x += 0.66)
          seats.push({ x, z: side * (sideZ + out), y: rise, turn: side < 0 ? 0 : Math.PI, red: Math.abs(Math.round(x / 0.66)) % 7 === row });
      }
    }
    // The hall's walls behind the top row, so that nothing shows past the seats.
    const hall = this.standard({ color: "#3b4a5c", roughness: 0.9 });
    this.add(new T.PlaneGeometry(sideZ * 2 + 12, 14).rotateY(-Math.PI / 2), hall, deep + 0.3, 6, 0).castShadow = false;
    for (const side of [-1, 1]) this.add(new T.PlaneGeometry(deep - backX + 2, 14).rotateY(side < 0 ? 0 : Math.PI), hall, (deep + backX) / 2, 6, side * (sideZ + ROWS * 0.85 + 1.2)).castShadow = false;
    const m = new T.Matrix4(),
      q = new T.Quaternion(),
      up = new T.Vector3(0, 1, 0),
      one = new T.Vector3(1, 1, 1),
      blue = new T.Color("#2a5bb8"),
      red = new T.Color("#c8321f"),
      pans = new T.InstancedMesh(pan, plastic, seats.length),
      backs = new T.InstancedMesh(back, plastic, seats.length),
      legs = new T.InstancedMesh(keep(new T.CylinderGeometry(0.03, 0.03, 0.3, 6)), this.standard({ color: "#3a3f46", roughness: 0.5, metalness: 0.5 }), seats.length);
    // Some seats are taken: a body and a head, in winter clothes; the same people each time (no randomness).
    let seed = 7;
    const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648,
      taken = seats.filter(() => next() < 0.32),
      coats = ["#1f2a44", "#7a1f2a", "#2f5f3a", "#c9a23a", "#5a5f66", "#e2dccf", "#2f62c0", "#8a4a2a"].map((c) => new T.Color(c)),
      skin = ["#f1c9a5", "#d9a37c", "#a8714a", "#7a4a2c"].map((c) => new T.Color(c)),
      torsos = new T.InstancedMesh(keep(new T.CapsuleGeometry(0.17, 0.3, 4, 8)), this.own(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.85 })), taken.length),
      heads = new T.InstancedMesh(keep(new T.SphereGeometry(0.13, 12, 8)), this.own(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.7 })), taken.length);
    seats.forEach((s, i) => {
      q.setFromAxisAngle(up, s.turn);
      const away = new T.Vector3(0, 0, -0.22).applyQuaternion(q);
      pans.setMatrixAt(i, m.compose(new T.Vector3(s.x, s.y + 0.3, s.z), q, one));
      backs.setMatrixAt(i, m.compose(new T.Vector3(s.x + away.x, s.y + 0.55, s.z + away.z), q, one));
      legs.setMatrixAt(i, m.makeTranslation(s.x, s.y + 0.15, s.z));
      pans.setColorAt(i, s.red ? red : blue);
      backs.setColorAt(i, s.red ? red : blue);
    });
    taken.forEach((s, i) => {
      q.setFromAxisAngle(up, s.turn);
      const lean = new T.Vector3(0, 0, -0.06).applyQuaternion(q);
      torsos.setMatrixAt(i, m.makeTranslation(s.x + lean.x, s.y + 0.62, s.z + lean.z));
      heads.setMatrixAt(i, m.makeTranslation(s.x + lean.x, s.y + 1.02, s.z + lean.z));
      torsos.setColorAt(i, coats[Math.floor(next() * coats.length)]);
      heads.setColorAt(i, skin[Math.floor(next() * skin.length)]);
    });
    for (const mesh of [pans, backs, legs, torsos, heads]) {
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }
  }
  /** Builds the scoreboard: a black case, the lit face, two cables up to the roof. */
  private scoreboard() {
    const { width, height } = BOARD,
      canvas = document.createElement("canvas");
    canvas.width = 1200;
    canvas.height = 400;
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 8;
    const steel = this.standard({ color: "#16191f", roughness: 0.45, metalness: 0.6 });
    this.add(block(width + 0.2, height + 0.2, 0.16, 0.04), steel, 0, 0, 0, this.board);
    // Lit from within: the face is not shaded by the hall's lights.
    const lit = this.add(new T.PlaneGeometry(width, height), this.own(new T.MeshBasicMaterial({ map: texture, toneMapped: false })), 0, 0, 0.085, this.board);
    lit.castShadow = lit.receiveShadow = false;
    const cable = this.own(new T.CylinderGeometry(0.02, 0.02, 1, 6));
    for (let k = 0; k < 2; k++) {
      const mesh = new T.Mesh(cable, steel);
      mesh.scale.y = 14;
      this.scene.add(mesh);
      this.cables.push(mesh);
    }
    this.scene.add(this.board);
    return { canvas, texture, said: "" };
  }
  /** Stands the scoreboard where it is seen at the same place on the screen from the hack, turned to the eye. */
  private stand() {
    const base = this.camera.clone();
    throwerCamera(base, 0);
    const chosen = this.host.clientHeight < 500 ? SMALL_BOARD : BOARD,
      top = chosen.top,
      // Never wider than a third of the screen, or on a squarer screen it would reach over the house.
      share = Math.min(chosen.share, (0.33 * this.camera.aspect * BOARD.height) / BOARD.width),
      tan = Math.tan((base.fov * Math.PI) / 360),
      depth = chosen.depth,
      size = (share * 2 * depth * tan) / BOARD.height,
      across = (BOARD.width * size) / (2 * depth * tan * base.aspect),
      ndc = new T.Vector3((BOARD.right - across / 2) * 2 - 1, 1 - (top + share / 2) * 2, 0.5).unproject(base),
      ray = ndc.sub(base.position).normalize(),
      forward = base.getWorldDirection(new T.Vector3()),
      at = base.position.clone().addScaledVector(ray, depth / ray.dot(forward));
    // Square to the eye at the hack, so that it reads as a plain rectangle there (it leans back a little in the hall).
    this.board.position.copy(at);
    this.board.quaternion.copy(base.quaternion);
    this.board.scale.setScalar(size);
    this.board.updateMatrixWorld();
    // The cables rise straight up from the top corners of its case, out of sight.
    this.cables.forEach((cable, k) => {
      const corner = new T.Vector3((k ? 1 : -1) * BOARD.width * 0.36, BOARD.height / 2 + 0.1, 0).applyMatrix4(this.board.matrixWorld);
      cable.position.set(corner.x, corner.y + 7, corner.z);
    });
  }
  /** Paints the scoreboard: each side's points end by end and in all, the end being played, the hammer, the last end scored. */
  private score(state: State) {
    const names = this.mode === "ai" ? ["나", "컴퓨터"] : ["빨강", "노랑"],
      said = `${names}|${state.ends}|${state.scores[0]}|${state.scores[1]}|${state.end}|${state.hammer}|${state.done}|${state.winner}`;
    if (said === this.face.said) return;
    this.face.said = said;
    const ctx = this.face.canvas.getContext("2d")!,
      W = 1200,
      H = 400,
      font = (weight: number, size: number) => `${weight} ${size}px "Inter", "Noto Sans KR", sans-serif`,
      bright = ["#ff4f3c", "#ffc83c"];
    // A deep blue field crossed by lighter bands, as such boards are.
    const field = ctx.createLinearGradient(0, 0, W, H);
    field.addColorStop(0, "#1a2c8c");
    field.addColorStop(1, "#14217a");
    ctx.fillStyle = field;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(90, 120, 230, 0.22)";
    for (const [a, b] of [[300, 520], [640, 760], [880, 1180]]) {
      ctx.beginPath();
      ctx.moveTo(a, 0);
      ctx.lineTo(b, 0);
      ctx.lineTo(b - 260, H);
      ctx.lineTo(a - 260, H);
      ctx.closePath();
      ctx.fill();
    }
    const n = state.ends,
      left = 470,
      totalX = W - 120,
      step = Math.min(190, (totalX - 120 - left) / Math.max(1, n - 1)),
      colX = (k: number) => (n === 1 ? left : left + k * step),
      rows = [178, 312],
      played = state.scores[0].length,
      // The end on now (or next), unless the game is over.
      current = state.winner === null ? played : -1;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // The column of the end on now is a little lighter.
    if (current >= 0 && current < n) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.09)";
      ctx.fillRect(colX(current) - step * 0.42, 96, step * 0.84, 280);
    }
    ctx.fillStyle = "#ffffff";
    ctx.font = font(700, 40);
    for (let k = 0; k < n; k++) ctx.fillText(String(k + 1), colX(k), 62);
    ctx.fillText("Total", totalX, 62);
    ctx.textAlign = "left";
    ctx.font = font(800, 34);
    ctx.fillStyle = state.winner === null ? "rgba(255,255,255,0.7)" : "#ffe27a";
    ctx.fillText(state.winner === null ? `${Math.min(played + 1, n)}엔드` : "FINAL", 40, 62);
    // Both names in one size, the largest that lets the longer fit before the first end's column.
    ctx.font = font(900, 84);
    const room = left - 90 - 140,
      nameSize = Math.min(84, ...names.map((name) => Math.floor((84 * room) / ctx.measureText(name).width)));
    names.forEach((name, side) => {
      const y = rows[side];
      // The side's colour as a stone seen from above: granite and its handle.
      ctx.fillStyle = "#9aa0a8";
      ctx.beginPath();
      ctx.arc(80, y, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = CURLING_COLORS[side];
      ctx.beginPath();
      ctx.arc(80, y, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#e9ecef";
      ctx.fillRect(66, y - 6, 28, 12);
      ctx.textAlign = "left";
      ctx.fillStyle = bright[side];
      ctx.font = font(900, nameSize);
      ctx.fillText(name, 140, y + 4);
      // The hammer, the last stone of the end on now.
      if (state.winner === null && state.hammer === side) {
        ctx.fillStyle = "#ffffff";
        ctx.font = font(900, 64);
        ctx.textAlign = "center";
        ctx.fillText("*", left - 62, y + 10);
      }
      ctx.textAlign = "center";
      ctx.font = font(800, 96);
      ctx.fillStyle = "#ffffff";
      state.scores[side].forEach((points, k) => ctx.fillText(String(points), colX(k), y + 4));
      ctx.fillStyle = bright[side];
      ctx.fillText(String(state.scores[side].reduce((a, b) => a + b, 0)), totalX, y + 4);
    });
    // The end last scored is boxed in the colour of the side that scored it.
    if (played) {
      const k = played - 1,
        side = state.scores[0][k] ? 0 : state.scores[1][k] ? 1 : -1;
      if (side >= 0) {
        ctx.strokeStyle = bright[side];
        ctx.lineWidth = 5;
        ctx.strokeRect(colX(k) - 42, rows[side] - 58, 84, 116);
      }
    }
    ctx.textAlign = "left";
    ctx.font = font(700, 22);
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.fillText("WORLD TABLE GAMES", 40, 378);
    ctx.textAlign = "right";
    ctx.fillText(`CURLING · ${n} ENDS`, W - 40, 378);
    this.face.texture.needsUpdate = true;
    this.redraw();
  }
  private look() {
    throwerCamera(this.camera, this.shift);
    this.redraw();
  }
  protected resize() {
    super.resize();
    this.stand();
    this.look();
  }
  /** The replay of a shot is over (or dropped): the next laying out brings the eye back. */
  protected settleNow() {
    super.settleNow();
    if (this.chasing !== null) this.landed = true;
  }
  sync(state: State, animate = true) {
    // While a stone of mine runs, the same state shown again changes nothing; anything else ends the run.
    if (this.live) {
      if (animate && state.ply === this.live.ply) return;
      this.stopReplay();
      this.endRun();
    }
    // A state laid out without its shot (a new game, a test) is seen from the hack.
    if (!animate) {
      this.glide++;
      this.shift = 0;
      this.chasing = null;
      this.landed = false;
    }
    super.sync(state, animate);
    this.look();
  }
  /** The eye keeps the stone it follows a little ahead of the hack's place on the screen, as far as the house; the brooms sweep before it. */
  protected rolled(id: number, mesh: T.Object3D, dx: number, dz: number) {
    if (id !== this.chasing) return;
    this.shift = Math.max(this.shift, Math.min(CHASE, mesh.position.x + dx - (HACK.x + 1)));
    this.look();
    const now = performance.now(),
      x = mesh.position.x + dx,
      z = mesh.position.z + dz;
    for (const broom of this.brooms) {
      const side = broom.userData.side as number;
      broom.visible = this.swept && !this.reducedMotion;
      // Quick strokes side to side, the two brooms out of step, just before the stone.
      broom.position.set(x + R + (side < 0 ? 0.22 : 0.48), 0, z + side * 0.1 + Math.sin(now / 55 + (side < 0 ? 0 : 1.7)) * 0.16);
      broom.rotation.y = Math.sin(now / 55 + (side < 0 ? 0 : 1.7)) * 0.25;
    }
  }
  /** Before each slice of a shot: a stone of mine is swept while the player sweeps (a spell at a time); a throw replayed is swept as it was. */
  protected beforeStep(discs: Disc[], n: number) {
    const live = this.live,
      stone = discs.find((d) => d.id === (live ? live.id : this.chasing) && d.on);
    if (!stone) {
      this.swept = false;
      return;
    }
    const going = stone.vx !== 0 || stone.vz !== 0;
    if (live && n % SWEEP_SLICES === 0) {
      const spell = n / SWEEP_SLICES;
      if (spell < SWEEP_WINDOWS && this.sweeping && going) live.sweep += 2 ** spell;
    }
    stone.slick = swept(live ? live.sweep : this.replayed, n) || undefined;
    this.swept = !!stone.slick && going;
  }
  /** A run of my stone is over (or dropped): the button and the brooms go. */
  private endRun() {
    this.live = null;
    this.sweeping = this.swept = false;
    this.sweepButton.hidden = true;
    this.sweepButton.setAttribute("aria-pressed", "false");
    for (const broom of this.brooms) broom.visible = false;
  }
  /** A pull is followed farther than the pointer goes (`PULL`), in the same direction. */
  protected dragMove(at: { x: number; y: number; z: number }) {
    super.dragMove({ ...at, x: HACK.x + (at.x - HACK.x) * PULL, z: HACK.z + (at.z - HACK.z) * PULL });
  }
  protected aimColor() {
    return "#2f62c0";
  }
  protected subject() {
    return CURLING_SUBJECT;
  }
  protected discs(state: State) {
    return state.stones;
  }
  protected arena() {
    return ARENA;
  }
  protected mesh(id: number) {
    return this.stones[id];
  }
  protected struck(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1) return null;
    // A throw of mine has been run already, as it was swept: its state is laid out as it stands.
    if (state.ply === this.made) {
      this.made = -1;
      return null;
    }
    this.replayed = last.sweep;
    const shot = shotOf(last.code)!,
      live = copy(before.done ? [] : before.stones),
      stone: Disc = { id: last.id, x: HACK.x, z: HACK.z, vx: 0, vz: 0, r: R, m: 1, on: true, curl: CURL[last.spin] || undefined };
    strike(stone, shot.angle, speedOf(shot.power));
    live.push(stone);
    // Every shot is seen from the hack: an eye still on its way back from the last one is put there at once.
    this.glide++;
    this.shift = 0;
    this.chasing = last.id;
    this.look();
    // The stones of an end already scored are cleared before the first of the next; the stone in the hack goes.
    if (before.done) for (const g of this.stones) g.visible = false;
    for (const g of this.ready) g.visible = false;
    this.mesh(last.id).visible = true;
    return live;
  }
  protected shooter(point: number) {
    return point === STONE && this.marks.movable.includes(STONE) ? { ...HACK } : null;
  }
  /**
   * A stone of mine let go: it runs live before the throw is made, so that it can be swept on its way (the user
   * asked), and when everything has come to rest the throw is made with the spells it was swept in. The rules then
   * slide it again with the same physics and the same sweeping, and come to the same stones.
   */
  protected shoot(point: number, degrees: number, power: number) {
    const state = this.state;
    if (!state || state.winner !== null) return;
    const code = shotCode(degrees, power),
      shot = shotOf(code)!,
      side = state.turn,
      id = side * STONES + (state.done ? 0 : state.thrown[side]),
      discs = copy(state.done ? [] : state.stones),
      stone: Disc = { id, x: HACK.x, z: HACK.z, vx: 0, vz: 0, r: R, m: 1, on: true, curl: CURL[state.spin] || undefined };
    strike(stone, shot.angle, speedOf(shot.power));
    discs.push(stone);
    this.live = { ply: state.ply, point, code, id, sweep: 0 };
    this.glide++;
    this.shift = 0;
    this.chasing = id;
    this.look();
    if (state.done) for (const g of this.stones) g.visible = false;
    for (const g of this.ready) g.visible = false;
    this.mesh(id).visible = true;
    this.sweepButton.hidden = false;
    this.replay(discs, ARENA, () => {
      const live = this.live;
      if (!live) return;
      this.endRun();
      this.made = live.ply + 1;
      // The eye comes back once the throw's state is laid out.
      this.settleNow();
      this.onMove({ from: live.point, to: live.code, extra: live.sweep > 0 ? live.sweep : -1 });
    });
  }
  protected place(state: State) {
    super.place(state);
    this.score(state);
    // After a shot the eye rests on the house for a moment, then glides back to the hack.
    if (this.chasing !== null && this.landed) {
      this.chasing = null;
      this.landed = false;
      const from = this.shift,
        token = ++this.glide;
      if (from > 0 && !this.reducedMotion)
        this.tween(700, 650, (p) => {
          if (token !== this.glide) return;
          this.shift = from * (1 - p * p * (3 - 2 * p));
          this.look();
        });
      else {
        this.shift = 0;
        this.look();
      }
    }
    const onIce = new Set(state.stones.map((d) => d.id));
    // Stones not on the ice: those still to be thrown wait by the hack, those thrown and taken off are gone.
    for (const side of [0, 1])
      for (let k = 0; k < STONES; k++) {
        const id = side * STONES + k,
          g = this.stones[id];
        if (onIce.has(id)) continue;
        const left = state.done ? false : k >= state.thrown[side] + (side === state.turn ? 1 : 0);
        g.visible = left;
        if (left) g.position.set(waitingAt(side, k).x, 0, waitingAt(side, k).z);
      }
    // The stone in the hack: the next one of the side to throw.
    this.ready.forEach((g, side) => {
      g.visible = state.winner === null && side === state.turn;
      g.position.set(HACK.x, 0, HACK.z);
    });
    this.turnMark.visible = state.winner === null && state.spin !== 0;
    this.turnMark.scale.set(state.spin === 2 ? -1 : 1, 1, 1);
  }
  protected spots(): Spot[] {
    return [{ ...HACK, y: 0.1, r: 0.4, point: STONE }];
  }
  dispose() {
    this.unlisten();
    this.sweepButton.remove();
    super.dispose();
  }
  protected mark(marks: Marks) {
    const mine = marks.movable.includes(STONE) && !this.animating;
    this.cursor.visible = mine;
    this.cursor.position.set(HACK.x, 0.015, HACK.z);
  }
}
