import type { LiveMessage, PersonInfo, SeatInfo } from "./protocol";

/**
 * A table that runs in real time, played over one Wi-Fi (와이파이 여럿이, the user asked): air hockey, table soccer and
 * table tennis, and any later real-time table (a slot car track, a throttle a car). Free of the page and of Three.js.
 *
 * The host is the authority: its device runs the one simulation. Each guest sends its controls (`input`: a few
 * numbers the game packs, such as where its mallet is sent and a count of its kicks) `INPUT_HZ` times a second; the
 * host feeds them to the seat they sit on, glided between two sendings so that a hand's speed stays smooth
 * (`LiveHost.input`), and sends the table as it stands (`live`: the game's numbers, the host's clock and a `cut`)
 * `SNAP_HZ` times a second to everyone. A guest draws the table `BEHIND` milliseconds in the past, between the two
 * states either side of that moment (`LiveGuest.frame`), and draws its own controller where its own hand is (its
 * prediction), so that it feels immediate. Scores, sets and the end are not here: they are moves of the room's
 * match (the host's alone, `HOST_ONLY`), told in order and resynced to a device that comes back. A guest that drops
 * and returns gets the stream again by itself (the host sends to whoever is connected), and its seat is played by
 * the host's computer while it is away (`control` says "computer"). A pause by anyone seated pauses the table for
 * all (`hold`); the host's state says whether it stands paused, so a device that comes back knows.
 *
 * Messages stay small: numbers are rounded to millimetres (`pack`) and a game sends only what a guest draws.
 */
export const SNAP_HZ = 30,
  INPUT_HZ = 30,
  /** How often the host still tells a paused table (so that a device coming back sees it and knows it is paused). */
  PAUSED_HZ = 4,
  /** How far in the past a guest draws the host's table, in milliseconds: three snapshots, room for a late one. */
  BEHIND = 100;
/** Who drives a seat: this device's hand, a guest's (its `input`), the host's computer, or nobody (closed). */
export type Control = "me" | "remote" | "computer" | "nobody";
/** One state of the table as the host told it: its clock (ms), its cut and the game's numbers. */
export interface LiveFrame {
  at: number;
  cut: number;
  data: number[];
}
/** What a session needs of a room (`HostRoom`, `GuestRoom`, or a stand-in in the tests). */
export interface LiveRoom {
  readonly host: boolean;
  readonly me: string;
  seats: SeatInfo[];
  readonly mySeat: number | null;
  onlive: ((message: LiveMessage, from: string | null) => void) | null;
  sendLive(message: LiveMessage): void;
  seatOf(id: string): number | null;
  away(seat: number): boolean;
  person(id: string | null): PersonInfo | null;
}
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** Numbers as they are sent: rounded to `digits` decimals (millimetres for metres), so a message stays short. */
export const pack = (values: number[], digits = 3) => {
  const k = 10 ** digits;
  return values.map((v) => (Number.isFinite(v) ? Math.round(v * k) / k : 0));
};
/** Each number of `a` taken `t` of the way to the one of `b` (lists of one length; else `b`). */
export function blend(a: number[], b: number[], t: number) {
  if (a.length !== b.length) return b.slice();
  return a.map((v, i) => v + (b[i] - v) * t);
}
const now_ = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

/**
 * A guest's controls as the host feeds them: each sending is reached over the time the last two came apart (one
 * sending late), so that a mallet sent a hand's way in steps moves at the hand's speed instead of jumping.
 */
class Glide {
  private from: number[] | null = null;
  last: number[] | null = null;
  private at = 0;
  private span = 1000 / INPUT_HZ;
  push(data: number[], now: number) {
    // After a silence (a drop, a page that was hidden) the hand is where it is now, not swept there from where it was.
    if (this.last && now - this.at < 500) {
      this.from = this.value(now);
      this.span = clamp(now - this.at, 10, 120);
    } else this.from = null;
    this.last = data;
    this.at = now;
  }
  value(now: number): number[] | null {
    if (!this.last) return null;
    if (!this.from) return this.last.slice();
    return blend(this.from, this.last, clamp((now - this.at) / this.span, 0, 1));
  }
}

/** The host's side of a real-time table: it feeds the guests' controls to their seats and tells the table to all. */
export class LiveHost {
  readonly host = true;
  /** Whether the table stands paused (for everyone). */
  paused = false;
  /** The table was paused or let run again, by `from` (a person's id). */
  onpause: ((paused: boolean, from: string) => void) | null = null;
  private seq = 0;
  private cut = 0;
  private sent = -Infinity;
  private hands = new Map<string, Glide>();
  private readonly listen = (m: LiveMessage, from: string | null) => this.receive(m, from);
  constructor(
    readonly room: LiveRoom,
    readonly round: number,
    private clock: () => number = now_,
  ) {
    room.onlive = this.listen;
  }
  /** The seat this device plays (null: watching). */
  get seat() {
    return this.room.mySeat;
  }
  /** Who drives `seat` now: a guest away has the host's computer in its place until it comes back. */
  control(seat: number): Control {
    const s = this.room.seats[seat];
    if (!s || (s.kind !== "person" && s.kind !== "computer")) return "nobody";
    if (s.kind === "computer") return "computer";
    if (s.person === this.room.me) return "me";
    return this.room.away(seat) ? "computer" : "remote";
  }
  /** The controls of the guest on `seat`, glided between its last two sendings; null before any came. */
  input(seat: number, now = this.clock()): number[] | null {
    const person = this.room.seats[seat]?.person;
    return person ? (this.hands.get(person)?.value(now) ?? null) : null;
  }
  /** The last controls the guest on `seat` sent, as sent (for what is counted, not glided: kicks, tosses). */
  latest(seat: number): number[] | null {
    const person = this.room.seats[seat]?.person;
    return person ? (this.hands.get(person)?.last ?? null) : null;
  }
  /** The table jumps (a new face-off): guests go straight to the next state instead of sliding there. */
  jump() {
    this.cut++;
  }
  /** Tells the table as it stands when it is time to (`SNAP_HZ`, `PAUSED_HZ` while paused); `make` packs it. */
  tick(make: () => number[], now = this.clock()) {
    if (now - this.sent < 1000 / (this.paused ? PAUSED_HZ : SNAP_HZ) - 2) return;
    this.sent = now;
    this.room.sendLive({ t: "live", round: this.round, seq: ++this.seq, at: Math.round(now), cut: this.cut, paused: this.paused, data: make() });
  }
  /** Pauses the table for everyone, or lets it run (anyone seated may; `from` is who asked). */
  pause(paused: boolean, from = this.room.me) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.sent = -Infinity;
    this.room.sendLive({ t: "hold", round: this.round, paused, from });
    this.onpause?.(paused, from);
  }
  private receive(m: LiveMessage, from: string | null) {
    if (!from || m.round !== this.round) return;
    if (m.t === "input") {
      let hand = this.hands.get(from);
      if (!hand) this.hands.set(from, (hand = new Glide()));
      hand.push(m.data, this.clock());
    } else if (m.t === "hold" && this.room.seatOf(from) !== null) this.pause(m.paused, from);
  }
  /** The session ends (a new game, the table left): the room's live messages go nowhere. */
  close() {
    if (this.room.onlive === this.listen) this.room.onlive = null;
  }
}

/** A guest's side of a real-time table: it sends my controls and keeps the host's last states to draw between. */
export class LiveGuest {
  readonly host = false;
  /** Whether the host's table stands paused. */
  paused = false;
  onpause: ((paused: boolean, from: string) => void) | null = null;
  private frames: LiveFrame[] = [];
  /** How late each of the last states came, by this page's clock against the host's (the least is the clock's offset). */
  private delays: number[] = [];
  private seq = 0;
  private told = -1;
  private sent = -Infinity;
  private heard = -Infinity;
  private readonly listen = (m: LiveMessage) => this.receive(m);
  constructor(
    readonly room: LiveRoom,
    readonly round: number,
    private clock: () => number = now_,
  ) {
    room.onlive = this.listen;
  }
  get seat() {
    return this.room.mySeat;
  }
  /** The newest state the host told, or null. */
  get newest(): LiveFrame | null {
    return this.frames[this.frames.length - 1] ?? null;
  }
  /** Milliseconds since the host's table was last heard. */
  quiet(now = this.clock()) {
    return now - this.heard;
  }
  /** Sends my controls when it is time to (`INPUT_HZ`); `make` packs them (null: nothing to send, watching). */
  tick(make: () => number[] | null, now = this.clock()) {
    if (now - this.sent < 1000 / INPUT_HZ - 2) return;
    const data = make();
    if (!data) return;
    this.sent = now;
    this.room.sendLive({ t: "input", round: this.round, seq: ++this.seq, data });
  }
  /** Asks the host to pause the table for everyone, or to let it run; it is paused here once the host tells it. */
  pause(paused: boolean) {
    this.room.sendLive({ t: "hold", round: this.round, paused, from: this.room.me });
  }
  /**
   * The table to draw now: the two states either side of the moment `BEHIND` ago (on the host's clock, as this page
   * reckons it), and how far between them; past the newest, the newest. Across a cut, the later state alone.
   */
  frame(now = this.clock()): { a: LiveFrame; b: LiveFrame; t: number } | null {
    const frames = this.frames;
    if (!frames.length) return null;
    const offset = Math.min(...this.delays),
      at = now - offset - BEHIND;
    let k = frames.length - 1;
    while (k > 0 && frames[k - 1].at > at) k--;
    const b = frames[k],
      a = frames[Math.max(0, k - 1)];
    if (a === b || at >= b.at) return { a: b, b, t: 1 };
    if (a.cut !== b.cut) return { a: b, b, t: 1 };
    return { a, b, t: clamp((at - a.at) / Math.max(1, b.at - a.at), 0, 1) };
  }
  private receive(m: LiveMessage) {
    if (m.round !== this.round) return;
    const now = this.clock();
    if (m.t === "hold") return this.hold(m.paused, m.from);
    if (m.t !== "live" || m.seq <= this.told) return;
    this.told = m.seq;
    this.heard = now;
    this.delays.push(now - m.at);
    if (this.delays.length > 90) this.delays.shift();
    this.frames.push({ at: m.at, cut: m.cut, data: m.data });
    // Kept: a second's worth, more than the moment drawn ever looks back.
    while (this.frames.length > 2 && this.frames[1].at < m.at - 1000) this.frames.shift();
    if (m.paused !== this.paused) this.hold(m.paused, "");
  }
  private hold(paused: boolean, from: string) {
    if (paused === this.paused) return;
    this.paused = paused;
    this.onpause?.(paused, from);
  }
  /** The session ends: the room's live messages go nowhere. */
  close() {
    if (this.room.onlive === this.listen) this.room.onlive = null;
  }
}
export type LiveSession = LiveHost | LiveGuest;
