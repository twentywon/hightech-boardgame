import * as T from "three";
import { capturing } from "../../ui/banner";
import { block, capable, glossy, planks, stuff, weave, wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, ringMesh, type Spot, type TableSubject } from "../table/view";
import { sight, chances, possible } from "./deduce";
import { AGAIN, GAP, JOKER, POOL, SAY, STOP, TILES, codeIndex, codeSeat, colourOf, isTileCode, numberOf, seatNames, tileCode, type State } from "./rules";
import { RACK, TILE, codeSubject, frames, gapAt, heldAt, lieAt, nameAt, poolAt, standAt, type Pose } from "./layout";

export const NUMBERCODE_COLORS: [string, string] = ["#1d1b19", "#efe6d2"];
/** A tap on nothing: it clears a choice, where -1 would begin one (every move here starts from -1). */
export const NOTHING = 999;
const INK = { ivory: "#efe6d2", ebony: "#1e1b19" };
const axis = (v: [number, number, number]) => new T.Vector3(...v);
/** The quaternion that turns a tile's own axes into a pose's. */
function turnOf(pose: Pose) {
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(axis(pose.x), axis(pose.y), axis(pose.z)));
}
const ease = (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2);
/** A face-down tile of the pool: its back up, a little askew. */
function poolPose(slot: number, count: number): Pose {
  const at = poolAt(slot, count),
    c = Math.cos(at.turn),
    s = Math.sin(at.turn),
    spin = (v: [number, number, number]): [number, number, number] => [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
  return { p: [at.x, at.y, at.z], x: spin([-1, 0, 0]), y: spin([0, 0, -1]), z: [0, -1, 0] };
}
/** The numbers a hidden tile may still be, short: runs of three or more as a span, the joker as −. */
export function shortList(numbers: number[]) {
  const plain = numbers.filter((n) => n !== JOKER),
    parts: string[] = [];
  for (let i = 0; i < plain.length; ) {
    let j = i;
    while (j + 1 < plain.length && plain[j + 1] === plain[j] + 1) j++;
    if (j - i >= 2) parts.push(`${plain[i]}–${plain[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(plain[k]));
    i = j + 1;
  }
  if (numbers.includes(JOKER)) parts.push("−");
  return parts.join(" ");
}
/**
 * The table of 숫자 코드: a felt-topped card table with a wooden rack for each player, the tiles standing on them
 * (mine facing me, the others' backs toward me), the pool face down in the middle. A tile found is laid face up in
 * front of its place. Over the table: the names by the racks, the number picker for a guess, the bubble that asks
 * whether to go on, the number said last, and (if asked for) the numbers each hidden tile may still be.
 *
 * A hidden tile of another player has no number painted on it at all, and nothing about it is written into the page.
 */
export class NumberCodeView extends TableView<State> {
  private meshes: T.Mesh[] = [];
  private bodies: T.MeshStandardMaterial[] = [];
  private faces: T.MeshStandardMaterial[] = [];
  private backs: T.MeshStandardMaterial[] = [];
  private seats = 0;
  private racks = new T.Group();
  private glow: T.Mesh;
  private gaps: T.Mesh[] = [];
  private cursorRing: T.Mesh;
  private hovered = -1;
  private layer: HTMLDivElement;
  private names: HTMLDivElement[] = [];
  private tags: HTMLDivElement[] = [];
  private said: HTMLDivElement;
  private picker: HTMLDivElement;
  private ask: HTMLDivElement;
  /** The helper's reading, for the state it was made for. */
  private reading: { state: State; text: Map<number, string> } | null = null;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#241c16");
    const own = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.daylight("#fff3e2", "#3b3027", "#fff1da", 8, 2.1);
    const lamp = new T.PointLight("#ffd9a0", 9, 16, 1.6);
    lamp.position.set(0, 7.5, 0.5);
    this.scene.add(lamp);
    this.table();
    this.scene.add(this.racks);
    // The tiles: each its own paint, so that each can glow by itself when it may be chosen.
    const shape = this.own(block(TILE.w, TILE.h, TILE.d, 0.07, 3)),
      fine = capable(),
      backPicture = [0, 1].map((c) => this.own(back(c))),
      backRelief = fine ? [0, 1].map((c) => this.own(back(c, true))) : null;
    for (let id = 0; id < TILES; id++) {
      const c = colourOf(id),
        color = c ? INK.ivory : INK.ebony,
        body = glossy({ color, roughness: c ? 0.32 : 0.28, metalness: 0 }, 0.7),
        picture = this.own(face(id)),
        faceMat = glossy({ map: picture, roughness: c ? 0.32 : 0.28, ...(fine ? { bumpMap: this.own(face(id, true)), bumpScale: 1.6 } : {}) }, 0.7),
        backMat = glossy({ map: backPicture[c], roughness: c ? 0.32 : 0.28, ...(backRelief ? { bumpMap: backRelief[c], bumpScale: 1.2 } : {}) }, 0.7);
      for (const m of [body, faceMat, backMat]) this.own(m);
      this.bodies.push(body);
      this.faces.push(faceMat);
      this.backs.push(backMat);
      const mesh = new T.Mesh(shape, [body, body, body, body, backMat, backMat]);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.visible = false;
      mesh.userData.id = id;
      this.meshes.push(mesh);
      this.scene.add(mesh);
    }
    // A soft light on the felt under the rack of whoever is to move.
    const soft = document.createElement("canvas");
    soft.width = soft.height = 128;
    const pen = soft.getContext("2d")!,
      fade = pen.createRadialGradient(64, 64, 6, 64, 64, 64);
    fade.addColorStop(0, "rgba(255, 228, 150, 0.85)");
    fade.addColorStop(1, "rgba(255, 228, 150, 0)");
    pen.fillStyle = fade;
    pen.fillRect(0, 0, 128, 128);
    const glowMap = this.own(new T.CanvasTexture(soft));
    glowMap.colorSpace = T.SRGBColorSpace;
    this.glow = new T.Mesh(this.own(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), this.own(new T.MeshBasicMaterial({ map: glowMap, transparent: true, depthWrite: false, opacity: 0.55 })));
    this.glow.renderOrder = 1;
    this.scene.add(this.glow);
    // Where a joker of mine may go: a thin gold mark between my tiles.
    const mark = this.own(new T.MeshBasicMaterial({ color: "#ffc94a", transparent: true, opacity: 0.9 })),
      bar = this.own(new T.BoxGeometry(0.05, 0.62, 0.05));
    for (let k = 0; k < 28; k++) {
      const g = new T.Mesh(bar, mark);
      g.visible = false;
      this.gaps.push(g);
      this.scene.add(g);
    }
    this.cursorRing = ringMesh(own, 0.4, 0.47, "#ffffff");
    this.scene.add(this.cursorRing);
    // The lettering over the table.
    this.layer = document.createElement("div");
    this.layer.className = "nc-layer";
    this.said = document.createElement("div");
    this.said.className = "nc-said";
    this.said.setAttribute("aria-hidden", "true");
    this.said.hidden = true;
    this.picker = document.createElement("div");
    this.picker.className = "nc-pick";
    this.picker.setAttribute("role", "group");
    this.picker.setAttribute("aria-label", "숫자 고르기");
    this.picker.hidden = true;
    for (let n = 0; n <= JOKER; n++) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.n = String(n);
      button.textContent = n === JOKER ? "−" : String(n);
      if (n === JOKER) button.setAttribute("aria-label", "조커");
      button.onclick = (e) => {
        e.stopPropagation();
        this.onPick(SAY + n);
      };
      this.picker.append(button);
    }
    this.ask = document.createElement("div");
    this.ask.className = "nc-ask";
    this.ask.setAttribute("aria-hidden", "true");
    this.ask.hidden = true;
    const words = document.createElement("p");
    words.textContent = "맞혔습니다!";
    this.ask.append(words);
    for (const [label, point, kind] of [
      ["계속 맞히기", AGAIN, "go"],
      ["멈추기", STOP, "stop"],
    ] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.tabIndex = -1;
      button.className = kind;
      button.textContent = label;
      button.onclick = (e) => {
        e.stopPropagation();
        this.onPick(point);
      };
      this.ask.append(button);
    }
    this.layer.append(this.said, this.ask, this.picker);
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.append(this.layer);
    this.begin();
  }
  /** A card table: green felt in a rim of dark wood, on a floor of boards. */
  private table() {
    const felt = this.standard({ color: "#2c5a49", roughness: 0.95, ...weave(5, 3.6, (r) => this.own(r), 0.7) }),
      rim = this.standard({ ...planks(1.6, (r) => this.own(r)), color: "#7a5236" }),
      W = 12.6,
      D = 9.2;
    this.add(block(W, 0.12, D, 0.04), [felt, felt, felt, felt, felt, felt], 0, -0.06, 0);
    for (const [w, d, x, z] of [
      [W + 0.9, 0.45, 0, D / 2 + 0.22],
      [W + 0.9, 0.45, 0, -D / 2 - 0.22],
      [0.45, D, W / 2 + 0.22, 0],
      [0.45, D, -W / 2 - 0.22, 0],
    ])
      this.add(block(w, 0.2, d, 0.08), rim, x, -0.02, z);
    this.add(block(W + 0.9, 0.6, D + 0.9, 0.06), rim, 0, -0.45, 0);
    const floor = this.add(new T.PlaneGeometry(60, 60), this.standard({ ...stuff("boards", "#6a4a32", 7, (r) => this.own(r)), roughness: 0.7 }), 0, -2.6, 0);
    floor.rotation.x = -Math.PI / 2;
  }
  /** The racks of `seats` players: a pale wooden base, and a back for the tiles to lean on. */
  private buildRacks(seats: number) {
    this.racks.clear();
    const maple = this.standard({ map: this.own(wood(false)), color: "#e9c99a", roughness: 0.55 });
    frames(seats).forEach((frame, seat) => {
      const base = new T.Mesh(this.own(block(frame.length, RACK.h, RACK.d, 0.035)), maple),
        yaw = Math.atan2(-frame.along[1], frame.along[0]);
      base.position.set(frame.x, RACK.h / 2, frame.z);
      base.rotation.y = yaw;
      base.castShadow = base.receiveShadow = true;
      this.racks.add(base);
      // The back leans as the tiles do, on the side they lean to: behind mine as I see them, before the others'.
      const pose = standAt(seats, seat, 0, 1),
        q = turnOf(pose),
        y = axis(pose.y),
        z = axis(pose.z),
        backing = new T.Mesh(this.own(block(frame.length, 0.42, 0.05, 0.02)), maple),
        centre = axis(pose.p)
          .addScaledVector(y, 0.21 - TILE.h / 2)
          .addScaledVector(z, (seat === 0 ? -1 : 1) * (TILE.d / 2 + 0.03));
      backing.quaternion.copy(q);
      backing.position.copy(centre);
      backing.castShadow = backing.receiveShadow = true;
      this.racks.add(backing);
    });
  }
  protected subject(aspect: number): TableSubject {
    return codeSubject(this.state?.seats ?? 2, aspect);
  }
  /** Whether I may see a tile's number in `s`. */
  private seen(s: State, id: number) {
    return s.open[id] || s.winner !== null || s.rows[0].includes(id) || s.waiting.includes(id) || (s.held === id && s.seat === 0);
  }
  /** Where every tile in play is in `s`. */
  private poses(s: State) {
    const out = new Map<number, Pose>(),
      over = s.winner !== null;
    s.rows.forEach((row, seat) => row.forEach((id, i) => out.set(id, s.open[id] || over ? lieAt(s.seats, seat, i, row.length) : standAt(s.seats, seat, i, row.length))));
    if (s.held !== null) out.set(s.held, heldAt(s.seats, s.seat, s.rows[s.seat].length));
    s.waiting.forEach((id, k) => {
      const pose = heldAt(s.seats, 0, s.rows[0].length);
      out.set(id, { ...pose, p: [pose.p[0] + k * (TILE.w + 0.1), pose.p[1], pose.p[2]] });
    });
    s.pool.forEach((id, slot) => id !== null && out.set(id, poolPose(slot, s.pool.length)));
    return out;
  }
  /** Paints each tile as `s` shows it to me: its number only where I may see it. */
  private paint(s: State) {
    const inPlay = new Set([...s.rows.flat(), ...s.pool.filter((id): id is number => id !== null), ...s.waiting, ...(s.held !== null ? [s.held] : [])]);
    this.meshes.forEach((mesh, id) => {
      mesh.visible = inPlay.has(id);
      (mesh.material as T.Material[])[4] = this.seen(s, id) ? this.faces[id] : this.backs[id];
    });
  }
  private setPose(mesh: T.Mesh, pose: Pose) {
    mesh.position.set(...pose.p);
    mesh.quaternion.copy(turnOf(pose));
  }
  protected place(s: State) {
    if (this.seats !== s.seats) {
      this.seats = s.seats;
      this.buildRacks(s.seats);
      // The camera frames the table for this many players.
      this.resize();
    }
    this.paint(s);
    const poses = this.poses(s);
    for (const [id, pose] of poses) this.setPose(this.meshes[id], pose);
    this.light(s);
    this.overlay(s, true);
    this.mark(this.marks);
    const el = this.renderer.domElement;
    el.dataset.seats = String(s.seats);
    el.dataset.phase = s.phase;
    el.dataset.seat = String(s.seat);
    el.dataset.open = s.rows.map((row) => row.filter((id) => s.open[id]).length).join(",");
    el.dataset.rows = s.rows.map((row) => row.length).join(",");
    el.dataset.pool = String(s.pool.filter((id) => id !== null).length);
  }
  /** The glow under the rack of the seat to move. */
  private light(s: State) {
    const frame = frames(s.seats)[s.seat];
    this.glow.visible = s.winner === null;
    this.glow.position.set(frame.x - frame.out[0] * 0.2, 0.004, frame.z - frame.out[1] * 0.2);
    const long = frame.length + 1.2;
    this.glow.scale.set(frame.out[0] ? 2.6 : long, 1, frame.out[0] ? long : 2.6);
  }
  protected animate(before: State, s: State) {
    const from = this.poses(before),
      to = this.poses(s),
      moving: { mesh: T.Mesh; a: T.Vector3; b: T.Vector3; qa: T.Quaternion; qb: T.Quaternion; lift: number }[] = [];
    this.paint(s);
    for (const [id, pose] of to) {
      const old = from.get(id);
      if (!old) continue;
      const a = axis(old.p),
        b = axis(pose.p),
        qa = turnOf(old),
        qb = turnOf(pose);
      if (a.distanceTo(b) < 1e-4 && qa.angleTo(qb) < 1e-4) continue;
      moving.push({ mesh: this.meshes[id], a, b, qa, qb, lift: Math.min(0.7, a.distanceTo(b) * 0.22) });
    }
    this.light(s);
    this.overlay(s, false);
    if (!moving.length) return false;
    let landed = false;
    this.tween(0, 460, (p) => {
      const e = ease(p);
      for (const m of moving) {
        m.mesh.position.lerpVectors(m.a, m.b, e);
        m.mesh.position.y += Math.sin(Math.PI * e) * m.lift;
        m.mesh.quaternion.slerpQuaternions(m.qa, m.qb, e);
      }
      if (p >= 1 && !landed) {
        landed = true;
        this.onContact();
      }
    });
    return true;
  }
  /** Where a point of the table falls on the canvas, in pixels. */
  private screen(x: number, y: number, z: number) {
    const v = new T.Vector3(x, y, z).project(this.camera),
      el = this.renderer.domElement;
    return { left: ((v.x + 1) / 2) * el.clientWidth, top: ((1 - v.y) / 2) * el.clientHeight };
  }
  /** The lettering over the table, for `s`: at rest it is all shown; while things move only the names. */
  private overlay(s: State, rest: boolean) {
    const names = seatNames(s.seats),
      over = s.winner !== null;
    while (this.names.length < s.seats) {
      const tag = document.createElement("div");
      tag.className = "nc-name";
      tag.setAttribute("aria-hidden", "true");
      this.layer.prepend(tag);
      this.names.push(tag);
    }
    this.names.forEach((tag, seat) => {
      tag.hidden = seat >= s.seats;
      if (tag.hidden) return;
      const at = nameAt(s.seats, seat),
        point = this.screen(at.x, at.y, at.z);
      tag.textContent = s.out[seat] ? `${names[seat]} · 탈락` : names[seat];
      tag.classList.toggle("turn", !over && s.seat === seat);
      tag.classList.toggle("out", s.out[seat]);
      // The side racks' names stand outward of them; every name is kept inside the table, whatever its shape.
      const frame = frames(s.seats)[seat],
        west = frame.out[0] < 0,
        east = frame.out[0] > 0,
        width = tag.offsetWidth,
        room = this.renderer.domElement.clientWidth;
      tag.classList.toggle("west", west);
      tag.classList.toggle("east", east);
      const low = west ? width + 6 : east ? 6 : width / 2 + 6,
        high = west ? room - 6 : east ? room - width - 6 : room - width / 2 - 6;
      tag.style.left = `${Math.min(high, Math.max(low, point.left))}px`;
      tag.style.top = `${point.top}px`;
    });
    const quiet = !rest || capturing() || over;
    // The number said last, over the tile it was said of.
    const last = s.last;
    if (!quiet && last && (last.kind === "right" || last.kind === "wrong") && last.target !== null) {
      const seat = s.rows.findIndex((row) => row.includes(last.target!)),
        i = s.rows[seat].indexOf(last.target),
        pose = s.open[last.target] ? lieAt(s.seats, seat, i, s.rows[seat].length) : standAt(s.seats, seat, i, s.rows[seat].length),
        point = this.screen(pose.p[0], pose.p[1] + (s.open[last.target] ? 0.1 : TILE.h / 2 + 0.05), pose.p[2]);
      this.said.hidden = false;
      this.said.className = `nc-said ${last.kind}`;
      this.said.textContent = `${last.said === JOKER ? "−" : last.said}${last.kind === "right" ? " ✓" : " ✗"}`;
      // Too near the top (under the status line) it sits on the tile itself.
      const on = point.top - this.said.offsetHeight - 8 < 52,
        middle = on ? this.screen(pose.p[0], pose.p[1], pose.p[2]) : point;
      this.said.classList.toggle("on", on);
      this.said.style.left = `${middle.left}px`;
      this.said.style.top = `${middle.top}px`;
    } else this.said.hidden = true;
    // Go on or stop, after a right guess of mine.
    const asking = !quiet && s.seat === 0 && s.phase === "again";
    this.ask.hidden = !asking;
    if (asking) {
      const point = this.screen(0, 0.3, frames(s.seats)[0].z - 1.55);
      this.ask.style.left = `${point.left}px`;
      this.ask.style.top = `${point.top}px`;
    }
    this.helper(s, !quiet && s.helper);
  }
  /** The 추리 도우미: under each hidden tile of the others, the numbers it may still be, from what I can see alone. */
  private helper(s: State, on: boolean) {
    let text: Map<number, string> | null = null;
    if (on) {
      if (this.reading?.state !== s) {
        const map = new Map<number, string>();
        for (const t of chances(sight(s, 0)).tiles) map.set(tileCode(t.seat, t.index), shortList(possible(t.odds)));
        this.reading = { state: s, text: map };
      }
      text = this.reading.text;
    }
    const entries = text ? [...text] : [];
    while (this.tags.length < entries.length) {
      const tag = document.createElement("div");
      tag.className = "nc-cand";
      tag.setAttribute("aria-hidden", "true");
      this.layer.prepend(tag);
      this.tags.push(tag);
    }
    // Along the near and far racks a list keeps to its tile's width, wrapping onto more lines; where the tiles stand
    // close (a phone, a long row) the lists of every other tile go a line lower, so that each may take two widths.
    const laid: { tag: HTMLDivElement; left: number; top: number; seat: number; odd: boolean }[] = [],
      deepest = new Map<number, number>();
    this.tags.forEach((tag, k) => {
      const entry = entries[k];
      tag.hidden = !entry;
      if (!entry) return;
      const [code, words] = entry,
        seat = codeSeat(code),
        i = codeIndex(code),
        n = s.rows[seat].length,
        frame = frames(s.seats)[seat],
        pose = standAt(s.seats, seat, i, n),
        toward = RACK.d / 2 + 0.2,
        point = this.screen(pose.p[0] - frame.out[0] * toward, 0, pose.p[2] - frame.out[1] * toward),
        side = frame.out[0] !== 0;
      tag.textContent = words;
      tag.dataset.code = String(code);
      tag.classList.toggle("one", !words.includes(" ") && !words.includes("–"));
      tag.classList.toggle("side", side);
      let odd = false;
      if (!side) {
        const a = this.screen(standAt(s.seats, seat, 0, n).p[0], 0, pose.p[2]),
          b = this.screen(standAt(s.seats, seat, 1, n).p[0], 0, pose.p[2]),
          pitch = Math.abs(b.left - a.left),
          close = pitch < 46;
        odd = close && i % 2 === 1;
        tag.style.maxWidth = `${Math.max(26, (close ? 2 : 1.06) * pitch - 4)}px`;
      } else tag.style.maxWidth = "";
      laid.push({ tag, left: point.left, top: point.top, seat, odd });
      if (!odd) deepest.set(seat, Math.max(deepest.get(seat) ?? 0, tag.offsetHeight));
    });
    for (const { tag, left, top, seat, odd } of laid) {
      tag.style.left = `${left}px`;
      tag.style.top = `${odd ? top + (deepest.get(seat) ?? 0) + 2 : top}px`;
    }
  }
  /** Where the point stands that a code names, in `s`, or null. */
  private spotOf(s: State, code: number) {
    if (isTileCode(code)) {
      const seat = codeSeat(code),
        i = codeIndex(code),
        row = s.rows[seat];
      if (!row || i >= row.length) return null;
      const pose = s.open[row[i]] ? lieAt(s.seats, seat, i, row.length) : standAt(s.seats, seat, i, row.length);
      return { x: pose.p[0], y: pose.p[1], z: pose.p[2], floor: s.open[row[i]] ? 0.01 : RACK.h + 0.01 };
    }
    if (code >= POOL && code < GAP && s.pool[code - POOL] != null) {
      const at = poolAt(code - POOL, s.pool.length);
      return { x: at.x, y: at.y, z: at.z, floor: 0.01 };
    }
    if (code >= GAP && code < SAY) {
      const at = gapAt(s.seats, code - GAP, s.rows[0].length);
      return { ...at, floor: RACK.h + 0.01 };
    }
    return null;
  }
  protected spots(): Spot[] {
    const s = this.state;
    if (!s) return [];
    const out: Spot[] = [];
    s.rows.forEach((row, seat) =>
      row.forEach((_, i) => {
        const at = this.spotOf(s, tileCode(seat, i));
        if (at) out.push({ ...at, r: 0.36, point: tileCode(seat, i) });
      }),
    );
    s.pool.forEach((id, slot) => {
      if (id === null) return;
      const at = this.spotOf(s, POOL + slot)!;
      out.push({ ...at, r: 0.38, point: POOL + slot });
    });
    if (s.phase === "joker" && s.seat === 0)
      for (let k = 0; k <= s.rows[0].length; k++) {
        const at = this.spotOf(s, GAP + k)!;
        out.push({ ...at, r: 0.26, point: GAP + k });
      }
    return out;
  }
  /** A tap takes the tile it strikes; else the nearest place within reach; else nothing at all (never -1). */
  protected pick(ray: T.Ray) {
    const s = this.state;
    if (!s) return NOTHING;
    const caster = new T.Raycaster(ray.origin, ray.direction),
      hits = caster.intersectObjects(this.meshes.filter((m) => m.visible && !this.isHeld(s, m.userData.id)), false);
    for (const hit of hits) {
      const id = hit.object.userData.id as number,
        seat = s.rows.findIndex((row) => row.includes(id));
      if (seat >= 0) return tileCode(seat, s.rows[seat].indexOf(id));
      const slot = s.pool.indexOf(id);
      if (slot >= 0) return POOL + slot;
    }
    let best = NOTHING,
      nearest = Infinity;
    const at = new T.Vector3();
    for (const spot of this.spots()) {
      const d = ray.distanceToPoint(at.set(spot.x, spot.y, spot.z));
      if (d <= spot.r && d < nearest) {
        nearest = d;
        best = spot.point;
      }
    }
    return best;
  }
  private isHeld(s: State, id: number) {
    return s.held === id || s.waiting.includes(id);
  }
  /** A press on another hidden tile while one is chosen lets the first go, so that the tap chooses the second. */
  protected dragStart(point: number) {
    const pending = this.marks.pending ?? null;
    if (pending !== null && point !== pending && this.marks.targets.length === 0 && isTileCode(point)) this.onPick(NOTHING);
    return false;
  }
  protected hover(point: number) {
    this.hovered = point;
    this.mark(this.marks);
  }
  protected mark(marks: Marks) {
    const s = this.state;
    if (!s) return;
    const rest = !this.animating,
      targets = new Set(rest ? marks.targets : []),
      pending = rest ? (marks.pending ?? null) : null,
      choosing = pending !== null && marks.removable.some((p) => p >= SAY && p <= SAY + JOKER);
    // Tiles that may be chosen glow faintly, the one under the mouse more, the one chosen most.
    this.meshes.forEach((_, id) => {
      const seat = s.rows.findIndex((row) => row.includes(id)),
        code = seat >= 0 ? tileCode(seat, s.rows[seat].indexOf(id)) : s.pool.indexOf(id) >= 0 ? POOL + s.pool.indexOf(id) : -1,
        white = colourOf(id) === 1,
        level = code === -1 ? 0 : code === pending ? 3 : targets.has(code) || (choosing && code !== pending && isTileCode(code) && seat !== 0 && !s.open[id]) ? (code === this.hovered ? 2 : 1) : 0,
        // A glow shows far more on ebony than on ivory.
        strength = [0, white ? 0.08 : 0, white ? 0.26 : 0.1, white ? 0.45 : 0.4][level],
        glow = white ? "#ffb12e" : "#ffc85a";
      for (const material of [this.bodies[id], this.faces[id], this.backs[id]]) {
        material.emissive.set(strength ? glow : "#000000");
        material.emissiveIntensity = strength;
      }
    });
    this.gaps.forEach((g, k) => {
      const at = this.spotOf(s, GAP + k);
      g.visible = !!at && targets.has(GAP + k) && !capturing();
      if (at && g.visible) g.position.set(at.x, RACK.h + 0.34, at.z);
    });
    const cursor = marks.cursor !== null ? this.spotOf(s, marks.cursor) : null;
    this.cursorRing.visible = !!cursor && rest;
    if (cursor) this.cursorRing.position.set(cursor.x, cursor.floor, cursor.z);
    // The number picker over the tile chosen, in its colour.
    this.picker.hidden = !choosing || capturing();
    if (!this.picker.hidden && pending !== null) {
      const at = this.spotOf(s, pending)!,
        id = s.rows[codeSeat(pending)][codeIndex(pending)],
        top = this.screen(at.x, at.y + TILE.h / 2 + 0.05, at.z),
        offered = new Set(marks.removable);
      this.picker.classList.toggle("black", colourOf(id) === 0);
      this.picker.querySelectorAll<HTMLButtonElement>("button").forEach((button) => (button.hidden = !offered.has(SAY + Number(button.dataset.n))));
      const width = this.picker.offsetWidth,
        height = this.picker.offsetHeight,
        room = this.renderer.domElement.clientWidth,
        below = top.top - height - 24 < 56;
      this.picker.classList.toggle("below", below);
      const point = below ? this.screen(at.x, 0, at.z) : top;
      this.picker.style.left = `${Math.min(room - width / 2 - 8, Math.max(width / 2 + 8, point.left))}px`;
      this.picker.style.top = `${point.top}px`;
    }
    this.redraw();
  }
  dispose() {
    this.layer.remove();
    super.dispose();
  }
}
/** A tile's face: its number cut into ivory or ebony and filled (6 and 9 underlined, the joker a bar); `relief` paints the cut alone, for a bump map. */
function face(id: number, relief = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 280;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!,
    white = colourOf(id) === 1,
    n = numberOf(id);
  if (relief) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 280, 400);
  } else {
    const shade = ctx.createLinearGradient(0, 0, 0, 400);
    shade.addColorStop(0, white ? "#f7f0e0" : "#2a2623");
    shade.addColorStop(1, white ? "#e6dbc4" : "#151311");
    ctx.fillStyle = shade;
    ctx.fillRect(0, 0, 280, 400);
  }
  const ink = relief ? "#000000" : white ? "#1f1b17" : "#f1e7d1",
    lip = white ? "rgba(255, 255, 255, 0.85)" : "rgba(255, 255, 255, 0.16)",
    groove = white ? "rgba(60, 42, 24, 0.55)" : "rgba(0, 0, 0, 0.85)";
  const draw = (dx: number, dy: number, color: string) => {
    ctx.fillStyle = color;
    if (n === JOKER) {
      ctx.beginPath();
      ctx.roundRect(70 + dx, 186 + dy, 140, 30, 15);
      ctx.fill();
      return;
    }
    ctx.font = `800 ${n >= 10 ? 172 : 208}px Georgia, "Times New Roman", "DejaVu Serif", serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(n), 140 + dx, 196 + dy, 250);
    if (n === 6 || n === 9) {
      ctx.beginPath();
      ctx.roundRect(98 + dx, 302 + dy, 84, 14, 7);
      ctx.fill();
    }
  };
  if (!relief) {
    // A thin line cut round the face, then the number: a light lip below it, the shadow of the cut, the fill.
    ctx.strokeStyle = white ? "rgba(120, 96, 60, 0.35)" : "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(18, 18, 244, 364, 22);
    ctx.stroke();
    draw(3, 4, lip);
    draw(-2, -2, groove);
  }
  draw(0, 0, ink);
  const texture = new T.CanvasTexture(canvas);
  if (!relief) texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}
/** The back of a tile, the same for every tile of a colour: a small cut diamond in the middle. */
function back(colour: number, relief = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 140;
  canvas.height = 200;
  const ctx = canvas.getContext("2d")!,
    white = colour === 1;
  ctx.fillStyle = relief ? "#ffffff" : white ? "#ece2cc" : "#1f1c1a";
  ctx.fillRect(0, 0, 140, 200);
  ctx.strokeStyle = relief ? "#000000" : white ? "rgba(120, 96, 60, 0.45)" : "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = relief ? 6 : 4;
  ctx.beginPath();
  ctx.moveTo(70, 72);
  ctx.lineTo(96, 100);
  ctx.lineTo(70, 128);
  ctx.lineTo(44, 100);
  ctx.closePath();
  ctx.stroke();
  const texture = new T.CanvasTexture(canvas);
  if (!relief) texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
