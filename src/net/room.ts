import type { GameOptions, Move } from "../games/points/types";
import { HOST_ONLY, Match, type NetRules } from "./match";
import { APP_VERSION, PROTOCOL, decode, encode, type Message, type NetMove, type PersonInfo, type Request, type SeatInfo, type SeatKind, type StartInfo } from "./protocol";
import { newSeed } from "./random";

/**
 * A room of devices on one Wi-Fi: one host and up to seven guests, each guest joined to the host alone (a star).
 * Free of the page: a `Link` is anything that carries text both ways (a WebRTC data channel in the page, a pair of
 * queues in the tests). The host keeps the seats, starts the games and decides the order of moves; a guest asks
 * and is told.
 */
export interface Link {
  send(text: string): void;
  close(): void;
  onmessage: ((text: string) => void) | null;
  onclose: (() => void) | null;
}
export interface Ask {
  id: number;
  kind: Request;
  from: string;
}
export interface RoomEvents<S> {
  /** People came or went, or the seats changed. */
  changed?(): void;
  /** A game began (or began anew): the match is new. */
  started?(): void;
  /** A move was added to the match. */
  moved?(state: S, move: NetMove, ply: number): void;
  /** The match was rebuilt from a move list (an undo, a reconnection). */
  synced?(): void;
  /** Someone asks for an undo or a new game, and this device is one of those who answer. */
  asked?(ask: Ask): void;
  /** The request in hand was settled (granted, declined or dropped). */
  settled?(): void;
  /** A line for the status. */
  notice?(text: string): void;
  /** A move of mine was not taken, with the words why. */
  refused?(text: string): void;
  /** The host is gone (a guest's room) or a version or game did not match, with the words. */
  lost?(reason: string): void;
}
export const MOST_PEOPLE = 8;
/**
 * A ping every few seconds; a device not heard from for `SILENT` is taken for gone (a screen gone to sleep keeps its
 * channel open but answers nothing). A device whose own timers ran late (its page was busy or hidden, and browsers
 * slow the timers of hidden pages) judges nobody that round: the silence may be its own.
 */
const PING = 5000,
  SILENT = 45000;
/** Whether this page's own clock ran late since `last` (or the page is hidden): no one is judged silent then. */
const late = (last: number, now: number) => now - last > PING * 2.5 || (typeof document !== "undefined" && document.hidden);
/** The request's name with its object particle (무르기를, 새 게임을). */
const KIND_WORD: Record<Request, string> = { undo: "무르기를", new: "새 게임을" };
/** An id for this page's person, kept in memory only, so a device that drops can come back to its seat. */
export function personId(): string {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 14);
}
/** A name as it may be shown: trimmed, at most 12 letters, never empty. */
export const cleanName = (name: string, fallback = "플레이어") => [...(name.replace(/\s+/g, " ").trim() || fallback)].slice(0, 12).join("");

abstract class Room<S> {
  people: PersonInfo[] = [];
  seats: SeatInfo[] = [];
  match: Match<S> | null = null;
  /** The request waiting for answers, and who has still to answer. */
  pending: (Ask & { waiting: string[] }) | null = null;
  events: RoomEvents<S> = {};
  protected timer: ReturnType<typeof setInterval> | null = null;
  abstract readonly host: boolean;
  constructor(
    readonly me: string,
    readonly rules: NetRules<S>,
  ) {}
  /** The seat a person sits on, or null. */
  seatOf(id: string): number | null {
    const i = this.seats.findIndex((s) => s.kind === "person" && s.person === id);
    return i < 0 ? null : i;
  }
  get mySeat(): number | null {
    return this.seatOf(this.me);
  }
  person(id: string | null) {
    return this.people.find((p) => p.id === id) ?? null;
  }
  /** Who sits on a seat, in words: 나, a name, 컴퓨터, or nothing. */
  nameOf(seat: number): string {
    const s = this.seats[seat];
    if (!s) return "";
    if (s.kind === "computer") return "컴퓨터";
    if (s.kind !== "person") return "";
    return s.person === this.me ? "나" : (this.person(s.person)?.name ?? "");
  }
  /** The seat's person is away (dropped, not come back yet). */
  away(seat: number): boolean {
    const s = this.seats[seat];
    return !!s && s.kind === "person" && !this.person(s.person)?.connected;
  }
  /** Whether this device must answer the request in hand. */
  get mustAnswer() {
    return !!this.pending?.waiting.includes(this.me);
  }
  protected parse(text: string): Message | null {
    return decode(text);
  }
  abstract leave(): void;
}

export interface HostSetup {
  game: string;
  title: string;
  name: string;
  variant: string;
  options: GameOptions;
  seats: SeatInfo[];
  /** No timers (tests). */
  quiet?: boolean;
}
/** The host's room: it admits guests, keeps the seats, starts games and puts every move in order. */
export class HostRoom<S> extends Room<S> {
  readonly host = true;
  readonly game: string;
  readonly title: string;
  variant: string;
  options: GameOptions;
  start: StartInfo | null = null;
  private links = new Map<Link, string | null>();
  private heard = new Map<Link, number>();
  private asks = 0;
  private closed = false;
  /**
   * Called after the people, the seats or the game changed, and once the room is left, besides `events` (which the
   * screens set): the app's announcement of the room on the Wi-Fi (`lan.ts`) follows the room here.
   */
  onstate: (() => void) | null = null;
  /** Whether the room was left (closed for everyone). */
  get left() {
    return this.closed;
  }
  private changed() {
    this.events.changed?.();
    this.onstate?.();
  }
  constructor(setup: HostSetup, rules: NetRules<S>, me = personId()) {
    super(me, rules);
    this.game = setup.game;
    this.title = setup.title;
    this.variant = setup.variant;
    this.options = setup.options;
    this.seats = setup.seats.map((s) => ({ ...s }));
    this.people = [{ id: me, name: cleanName(setup.name), host: true, connected: true }];
    const open = this.seats.findIndex((s) => s.kind === "open");
    if (open >= 0) this.seats[open] = { ...this.seats[open], kind: "person", person: me };
    if (!setup.quiet && typeof setInterval !== "undefined") this.timer = setInterval(() => this.beat(), PING);
  }
  /** A new channel to a guest: it is let in once it says hello. */
  connect(link: Link) {
    if (this.closed) return link.close();
    this.links.set(link, null);
    this.heard.set(link, Date.now());
    link.onmessage = (text) => this.receive(link, text);
    link.onclose = () => this.drop(link);
  }
  /** How many guests are connected now. */
  get guests() {
    return [...this.links.values()].filter(Boolean).length;
  }
  private send(link: Link, message: Message) {
    try {
      link.send(encode(message));
    } catch {
      // A channel closing as it is written to is noticed by its own close.
    }
  }
  private broadcast(message: Message) {
    for (const [link, id] of this.links) if (id) this.send(link, message);
  }
  private seatsMessage(): Message {
    return { t: "seats", seats: this.seats, people: this.people };
  }
  private hello(): Message {
    return { t: "hello", v: PROTOCOL, app: APP_VERSION, role: "host", game: this.game, title: this.title, name: this.people[0].name, id: this.me };
  }
  private refuse(link: Link, reason: string) {
    this.send(link, { t: "bye", reason });
    this.links.delete(link);
    this.heard.delete(link);
    link.onclose = null;
    link.close();
  }
  private receive(link: Link, text: string) {
    if (!this.links.has(link)) return;
    this.heard.set(link, Date.now());
    const m = this.parse(text);
    if (!m) return;
    const id = this.links.get(link) ?? null;
    if (m.t === "hello") return id ? this.resync(link) : this.admit(link, m);
    if (!id) return;
    const who = this.person(id)!;
    switch (m.t) {
      case "sit":
        return this.sit(m.seat, id);
      case "move": {
        if (!this.match || !this.start || m.round !== this.start.round) return this.send(link, { t: "refuse", round: m.round, ply: m.ply, text: "지난 게임의 수입니다." });
        if (m.ply !== this.match.ply) {
          this.send(link, { t: "refuse", round: m.round, ply: m.ply, text: "그 사이에 판이 바뀌었습니다. 다시 맞췄습니다." });
          return this.resync(link);
        }
        const seat = this.seatOf(id),
          tried = seat === null ? { text: "자리에 앉지 않았습니다. 구경만 할 수 있습니다." } : this.match.try(m.move, seat, false);
        if ("text" in tried) return this.send(link, { t: "refuse", round: m.round, ply: m.ply, text: tried.text });
        return this.record(m.move, seat!);
      }
      case "request": {
        const text = this.request(m.kind, id);
        if (text) this.send(link, { t: "notice", text });
        return;
      }
      case "answer":
        return this.answered(m.id, m.yes, id);
      case "ping":
        if (!m.echo) this.send(link, { t: "ping", at: m.at, echo: true });
        return;
      case "bye":
        this.links.delete(link);
        link.onclose = null;
        link.close();
        return this.gone(who, `${who.name} 님이 나갔습니다.`);
    }
  }
  /** A guest's hello: refused for another version or game, else let in (back to its seat if it had one). */
  private admit(link: Link, m: Extract<Message, { t: "hello" }>) {
    if (m.v !== PROTOCOL || m.app !== APP_VERSION)
      return this.refuse(link, `방장의 기기와 버전이 다릅니다(방장 ${APP_VERSION}, 이 기기 ${m.app}). 두 기기 모두 업데이트하세요.`);
    if (m.role !== "guest") return this.refuse(link, "방장끼리는 연결할 수 없습니다. 한 사람은 참가하기를 고르세요.");
    if (m.game !== this.game) return this.refuse(link, `방장은 '${this.title}' 방을 열었습니다. 같은 게임에서 참가하기를 고르세요.`);
    const name = cleanName(m.name);
    // The same person again (by id, or by name after the page was opened anew), or someone new.
    let who = this.person(m.id) ?? this.people.find((p) => !p.host && !p.connected && p.name === name) ?? null;
    const back = !!who;
    if (!who) {
      if (this.people.length >= MOST_PEOPLE) return this.refuse(link, `방이 가득 찼습니다(${MOST_PEOPLE}명).`);
      let unique = name,
        n = 2;
      while (this.people.some((p) => p.name === unique)) unique = `${name}${n++}`;
      who = { id: m.id, name: unique, host: false, connected: true };
      this.people.push(who);
    }
    // An older channel of the same person is let go.
    for (const [other, id] of this.links)
      if (other !== link && id === who.id) {
        this.links.delete(other);
        other.onclose = null;
        other.close();
      }
    who.connected = true;
    this.links.set(link, who.id);
    this.send(link, this.hello());
    // Someone new takes the first open seat until the game begins.
    if (!back && !this.match) {
      const open = this.seats.findIndex((s) => s.kind === "open");
      if (open >= 0) this.seats[open] = { ...this.seats[open], kind: "person", person: who.id };
    }
    this.broadcast(this.seatsMessage());
    if (this.match) this.resync(link);
    this.tell(back ? `${who.name} 님이 다시 연결되었습니다.` : `${who.name} 님이 들어왔습니다.`);
    this.changed();
  }
  private resync(link: Link) {
    if (this.match && this.start) this.send(link, { t: "resync", start: this.start, moves: this.match.moves });
  }
  private tell(text: string) {
    this.broadcast({ t: "notice", text });
    this.events.notice?.(text);
  }
  /** A channel closed: its person is away (the seat waits, or the computer stands in, as the screen decides). */
  private drop(link: Link) {
    const id = this.links.get(link);
    this.links.delete(link);
    this.heard.delete(link);
    const who = id ? this.person(id) : null;
    if (!who || [...this.links.values()].includes(who.id)) return;
    this.gone(who, `${who.name} 님의 연결이 끊겼습니다.`);
  }
  private gone(who: PersonInfo, text: string) {
    who.connected = false;
    // Before a game someone who left gives the seat up.
    if (!this.match) {
      const seat = this.seatOf(who.id);
      if (seat !== null) this.seats[seat] = { ...this.seats[seat], kind: "open", person: null };
      this.people = this.people.filter((p) => p !== who);
    }
    if (this.pending?.waiting.includes(who.id) || this.pending?.from === who.id) this.dropRequest(`${who.name} 님이 없어 요청을 취소했습니다.`);
    this.broadcast(this.seatsMessage());
    this.tell(text);
    this.changed();
  }
  private lastBeat = Date.now();
  private beat() {
    const now = Date.now();
    if (late(this.lastBeat, now)) for (const link of this.heard.keys()) this.heard.set(link, now);
    this.lastBeat = now;
    for (const [link, id] of this.links) {
      if (now - (this.heard.get(link) ?? now) > SILENT) {
        link.onclose = null;
        link.close();
        this.drop(link);
        continue;
      }
      if (id) this.send(link, { t: "ping", at: now, echo: false });
    }
  }
  /** Takes a seat (null: only watch). Only before a game. */
  sit(seat: number | null, id = this.me) {
    if (this.match) return;
    const target = seat === null ? null : this.seats[seat];
    if (target && target.kind === "person" && target.person !== id) return;
    if (target && target.kind !== "open" && target.kind !== "person" && id !== this.me) return;
    const was = this.seatOf(id);
    if (was !== null) this.seats[was] = { ...this.seats[was], kind: "open", person: null };
    if (seat !== null && target) this.seats[seat] = { ...this.seats[seat], kind: "person", person: id };
    this.broadcast(this.seatsMessage());
    this.changed();
  }
  /** The host makes a seat open, a computer's or closed (as the game allows). */
  setKind(seat: number, kind: SeatKind) {
    const s = this.seats[seat];
    if (this.match || !s || (kind !== "open" && !s.kinds.includes(kind))) return;
    this.seats[seat] = { ...s, kind, person: null };
    this.broadcast(this.seatsMessage());
    this.changed();
  }
  /** Why the game cannot begin yet, or null. `least`: the fewest people seated; `closable`: an open seat counts as closed. */
  startProblem(least = 2): string | null {
    const people = this.seats.filter((s) => s.kind === "person").length;
    if (people < least) return `자리에 앉은 사람이 ${least}명 이상이어야 합니다.`;
    const open = this.seats.filter((s) => s.kind === "open" && !s.kinds.includes("closed")).length;
    if (open) return "빈자리가 있습니다. 사람을 더 연결하거나 컴퓨터로 정하세요.";
    return null;
  }
  /** Starts a game with the seats as they are (open seats that may be closed are closed). */
  begin(variant = this.variant, options = this.options) {
    this.variant = variant;
    this.options = options;
    this.seats = this.seats.map((s) => (s.kind === "open" ? { ...s, kind: s.kinds.includes("closed") ? "closed" : "computer", person: null } : s));
    this.start = {
      round: (this.start?.round ?? 0) + 1,
      variant,
      options,
      seed: newSeed(),
      seats: this.seats.map((s) => ({ kind: s.kind === "person" ? "person" : s.kind === "computer" ? "computer" : "closed", person: s.person })),
    };
    this.pending = null;
    this.match = new Match(this.rules, this.start);
    this.broadcast(this.seatsMessage());
    this.broadcast({ t: "start", start: this.start });
    this.events.started?.();
    this.onstate?.();
  }
  /** A move made on the host's device: its own seat's, a host-only one, or a computer seat's. Null, or why not. */
  play(move: Move, seat: number): string | null {
    if (!this.match) return "게임이 시작되지 않았습니다.";
    const to = this.match.toMove,
      mine = to === HOST_ONLY || to === this.mySeat || this.seats[to]?.kind === "computer" || this.away(to);
    const tried = this.match.try(move, to === HOST_ONLY ? HOST_ONLY : seat, true);
    if ("text" in tried) return tried.text;
    if (!mine) return "상대 차례입니다.";
    this.record(move, to === HOST_ONLY ? HOST_ONLY : seat);
    return null;
  }
  private record(move: Move, seat: number) {
    const match = this.match!,
      ply = match.ply,
      state = match.push(move, seat);
    if (!state) return;
    this.broadcast({ t: "move", round: this.start!.round, ply, move, seat });
    this.events.moved?.(state, { move, seat }, ply);
  }
  /** An undo or a new game asked (by me, or by a guest): granted at once when nobody else is to answer. */
  request(kind: Request, from = this.me): string | null {
    if (!this.match) return "게임이 시작되지 않았습니다.";
    if (this.pending) return "다른 요청에 대한 대답을 기다리는 중입니다.";
    const seat = this.seatOf(from);
    if (seat === null) return "자리에 앉은 사람만 요청할 수 있습니다.";
    if (kind === "undo" && this.match.undoFor(seat) === null) return "아직 무를 수가 없습니다.";
    const waiting = this.seats.filter((s) => s.kind === "person" && s.person !== from && this.person(s.person)?.connected).map((s) => s.person!);
    const ask = { id: ++this.asks, kind, from };
    if (!waiting.length) {
      this.grant(ask);
      return null;
    }
    this.pending = { ...ask, waiting };
    this.broadcast({ t: "request", ...ask });
    if (waiting.includes(this.me)) this.events.asked?.(ask);
    const who = this.person(from)!;
    this.events.notice?.(from === this.me ? `${KIND_WORD[kind]} 요청했습니다. 대답을 기다립니다.` : `${who.name} 님이 ${KIND_WORD[kind]} 요청했습니다.`);
    return null;
  }
  /** My own answer to the request in hand. */
  answer(id: number, yes: boolean) {
    this.answered(id, yes, this.me);
  }
  private answered(id: number, yes: boolean, from: string) {
    const ask = this.pending;
    if (!ask || ask.id !== id || !ask.waiting.includes(from)) return;
    this.broadcast({ t: "answer", id, yes, from });
    if (!yes) return this.dropRequest(`${this.person(from)?.name ?? ""} 님이 ${KIND_WORD[ask.kind]} 거절했습니다.`);
    ask.waiting = ask.waiting.filter((w) => w !== from);
    if (!ask.waiting.length) {
      this.pending = null;
      this.grant(ask);
      this.events.settled?.();
    }
  }
  private dropRequest(text: string) {
    if (!this.pending) return;
    this.pending = null;
    this.tell(text);
    this.events.settled?.();
  }
  private grant(ask: Ask) {
    if (ask.kind === "new") return this.begin();
    const match = this.match!,
      length = match.undoFor(this.seatOf(ask.from) ?? -9);
    if (length === null) return;
    match.truncate(length);
    for (const link of this.links.keys()) if (this.links.get(link)) this.resync(link);
    this.events.synced?.();
    this.tell(`${this.person(ask.from)?.name ?? ""} 님의 수를 물렀습니다.`);
  }
  leave() {
    if (this.closed) return;
    this.closed = true;
    this.broadcast({ t: "bye", reason: "방장이 방을 닫았습니다." });
    for (const link of this.links.keys()) {
      link.onclose = null;
      link.onmessage = null;
      link.close();
    }
    this.links.clear();
    if (this.timer) clearInterval(this.timer);
    this.onstate?.();
  }
}

export interface GuestSetup {
  game: string;
  title: string;
  name: string;
  quiet?: boolean;
}
/** A guest's room: it follows the host, and asks the host for everything it does. */
export class GuestRoom<S> extends Room<S> {
  readonly host = false;
  hostName = "";
  start: StartInfo | null = null;
  /** The game's own words, for a guest whose game differs. */
  readonly game: string;
  readonly title: string;
  name: string;
  private link: Link | null = null;
  private heard = 0;
  private left = false;
  connected = false;
  /** Why the host was lost, in words ("" while connected). */
  reason = "";
  private readonly quiet: boolean;
  constructor(setup: GuestSetup, rules: NetRules<S>, me = personId()) {
    super(me, rules);
    this.quiet = !!setup.quiet;
    this.game = setup.game;
    this.title = setup.title;
    this.name = cleanName(setup.name);
    if (!setup.quiet && typeof setInterval !== "undefined") this.timer = setInterval(() => this.beat(), PING);
  }
  /** A channel to the host (again, after a drop): hello, and the host answers with the room as it stands. */
  connect(link: Link) {
    if (this.link) {
      this.link.onclose = null;
      this.link.close();
    }
    this.left = false;
    this.link = link;
    this.heard = Date.now();
    link.onmessage = (text) => this.receive(text);
    link.onclose = () => this.lose("방장과의 연결이 끊겼습니다.");
    this.greet();
    // A hello the host did not answer (a busy page, a channel that opened on one side first) is said again.
    let tries = 0;
    const again = () => {
      if (this.link !== link || this.connected || ++tries > 6) return;
      this.greet();
      setTimeout(again, 2500);
    };
    if (typeof setTimeout !== "undefined" && !this.quiet) setTimeout(again, 2500);
  }
  private greet() {
    this.say({ t: "hello", v: PROTOCOL, app: APP_VERSION, role: "guest", game: this.game, title: this.title, name: this.name, id: this.me });
  }
  private say(message: Message) {
    try {
      this.link?.send(encode(message));
    } catch {
      // Noticed by the channel's own close.
    }
  }
  private lose(reason: string) {
    if (!this.link) return;
    this.link.onclose = null;
    this.link.onmessage = null;
    this.link.close();
    this.link = null;
    this.connected = false;
    this.reason = reason;
    for (const p of this.people) if (p.host) p.connected = false;
    this.pending = null;
    this.events.lost?.(reason);
    this.events.changed?.();
  }
  private lastBeat = Date.now();
  private beat() {
    const now = Date.now();
    if (late(this.lastBeat, now)) this.heard = now;
    this.lastBeat = now;
    if (!this.link) return;
    if (now - this.heard > SILENT) return this.lose("방장의 기기에서 대답이 없습니다.");
    this.say({ t: "ping", at: Date.now(), echo: false });
  }
  private receive(text: string) {
    this.heard = Date.now();
    const m = this.parse(text);
    if (!m) return;
    switch (m.t) {
      case "hello":
        if (m.v !== PROTOCOL || m.app !== APP_VERSION) {
          this.say({ t: "bye", reason: "버전이 다릅니다." });
          return this.lose(`방장의 기기와 버전이 다릅니다(방장 ${m.app}, 이 기기 ${APP_VERSION}). 두 기기 모두 업데이트하세요.`);
        }
        this.hostName = m.name;
        this.connected = true;
        this.reason = "";
        return this.events.changed?.();
      case "seats":
        this.seats = m.seats;
        this.people = m.people;
        return this.events.changed?.();
      case "start":
        this.start = m.start;
        this.pending = null;
        this.match = new Match(this.rules, m.start);
        return this.events.started?.();
      case "resync": {
        const fresh = !this.start || this.start.round !== m.start.round || this.start.seed !== m.start.seed;
        this.start = m.start;
        const match = fresh || !this.match ? new Match(this.rules, m.start) : this.match;
        match.replay(m.moves);
        this.match = match;
        return fresh ? this.events.started?.() : this.events.synced?.();
      }
      case "move": {
        if (!this.match || !this.start || m.round !== this.start.round || m.ply < this.match.ply) return;
        // A move missed: the host is asked for the whole list again.
        if (m.ply > this.match.ply) return this.greet();
        const state = this.match.push(m.move, m.seat);
        if (!state) return this.greet();
        return this.events.moved?.(state, { move: m.move, seat: m.seat }, m.ply);
      }
      case "refuse":
        return this.events.refused?.(m.text);
      case "request": {
        const waiting = this.seats.filter((s) => s.kind === "person" && s.person !== m.from && this.person(s.person)?.connected).map((s) => s.person!);
        this.pending = { id: m.id, kind: m.kind, from: m.from, waiting };
        if (waiting.includes(this.me)) this.events.asked?.(m);
        else if (m.from !== this.me) this.events.notice?.(`${this.person(m.from)?.name ?? ""} 님이 ${KIND_WORD[m.kind]} 요청했습니다.`);
        else this.events.notice?.(`${KIND_WORD[m.kind]} 요청했습니다. 대답을 기다립니다.`);
        return;
      }
      case "answer":
        if (this.pending && this.pending.id === m.id) {
          if (!m.yes) this.pending = null;
          else this.pending.waiting = this.pending.waiting.filter((w) => w !== m.from);
          if (!this.pending || !this.pending.waiting.length) {
            this.pending = null;
            this.events.settled?.();
          }
        }
        return;
      case "notice":
        if (this.pending && /취소|거절/.test(m.text)) {
          this.pending = null;
          this.events.settled?.();
        }
        return this.events.notice?.(m.text);
      case "bye":
        this.left = true;
        return this.lose(m.reason);
      case "ping":
        if (!m.echo) this.say({ t: "ping", at: m.at, echo: true });
        return;
    }
  }
  /** Whether a channel to the host is open. */
  get online() {
    return !!this.link && this.connected;
  }
  /** The host closed the room (rather than the channel failing). */
  get dismissed() {
    return this.left;
  }
  sit(seat: number | null) {
    this.say({ t: "sit", seat });
  }
  /** Sends a move of mine to the host, once it is seen to be mine and legal here: null, or why it may not be made. */
  play(move: Move): string | null {
    if (!this.online) return "방장과 연결되어 있지 않습니다.";
    if (!this.match || !this.start) return "게임이 시작되지 않았습니다.";
    const seat = this.mySeat;
    if (seat === null) return "구경하는 중입니다.";
    const tried = this.match.try(move, seat, false);
    if ("text" in tried) return tried.text;
    this.say({ t: "move", round: this.start.round, ply: this.match.ply, move, seat });
    return null;
  }
  request(kind: Request): string | null {
    if (!this.online) return "방장과 연결되어 있지 않습니다.";
    if (this.pending) return "다른 요청에 대한 대답을 기다리는 중입니다.";
    const seat = this.mySeat;
    if (seat === null) return "자리에 앉은 사람만 요청할 수 있습니다.";
    if (kind === "undo" && this.match?.undoFor(seat) == null) return "아직 무를 수가 없습니다.";
    this.say({ t: "request", id: 0, kind, from: this.me });
    return null;
  }
  answer(id: number, yes: boolean) {
    this.say({ t: "answer", id, yes, from: this.me });
    if (!yes) this.pending = null;
  }
  leave() {
    if (this.link) {
      this.say({ t: "bye", reason: `${this.name} 님이 나갔습니다.` });
      this.link.onclose = null;
      this.link.onmessage = null;
      this.link.close();
      this.link = null;
    }
    this.connected = false;
    if (this.timer) clearInterval(this.timer);
  }
}

/** Two ends of a channel in memory, each message delivered a moment later (as a data channel would): for tests. */
export function memoryLinks(): [Link, Link] {
  const make = (): Link & { other?: Link; open: boolean } => ({
    open: true,
    onmessage: null,
    onclose: null,
    send(text: string) {
      if (!this.open) throw new Error("closed");
      const other = this.other as Link & { open: boolean };
      queueMicrotask(() => other.open && other.onmessage?.(text));
    },
    close() {
      if (!this.open) return;
      this.open = false;
      const other = this.other as Link & { open: boolean };
      queueMicrotask(() => {
        if (!other.open) return;
        other.open = false;
        other.onclose?.();
      });
    },
  });
  const a = make(),
    b = make();
  a.other = b;
  b.other = a;
  return [a, b];
}
