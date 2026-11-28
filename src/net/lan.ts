import type { HostRoom, Link } from "./room";
import { PROTOCOL } from "./protocol";

/**
 * Wi-Fi play inside the Android app, with no QR code: the host's app opens a room on a small TCP server of its own
 * and announces it on the Wi-Fi by DNS-SD (`NsdManager`, type `_wtgroom._tcp`); the others' apps list the rooms
 * they find and join with one tap (or by scanning the host's room QR code, `roomCode`, or by a typed address where
 * announcements are filtered). Free of the page and of
 * Three.js, like the rest of `src/net/`: the app is reached through a `LanBridge` (`window.wtgNet`, see
 * `android/app/src/main/java/kr/worldtable/student/LanBridge.java`), whose events come back through `receive`
 * (`window.wtgNetEvent`). Every connection is a `Link`, so `HostRoom` and `GuestRoom` play over it as over WebRTC.
 *
 * Messages travel as lines of UTF-8 (a room's messages are JSON, which never holds a raw line break); the app keeps
 * the sockets, the page only names them by a peer id.
 */
export interface LanBridge {
  /** Whether the app can host and find rooms (false: the page keeps to the QR way). */
  available(): boolean;
  /** Opens the server and announces the room: JSON `{ id, attrs }` (the TXT attributes, all text). */
  host(info: string): void;
  /** The room's attributes changed (people, seats, a game begun): JSON of the attributes. */
  update(attrs: string): void;
  /** Stops announcing and closes the server and every connection it took. */
  stopHost(): void;
  /** Looks for rooms on the Wi-Fi: `found` and `lost` events until `stopDiscover`. */
  discover(): void;
  stopDiscover(): void;
  /** Connects to a host's `address:port`: the new peer's id; `open` or `fail` follows. */
  connect(address: string): string;
  /** Sends a line to a peer: false when it is closed. */
  send(peer: string, text: string): boolean;
  close(peer: string): void;
}
export type LanEvent =
  /** The server listens and the room is announced (again, after the app came back to the screen). */
  | { e: "hosting"; address: string; port: number }
  /** The app closed the room's server for a while (it stayed off screen too long): it opens again on return. */
  | { e: "stopped"; text: string }
  /** A guest connected to my server. */
  | { e: "incoming"; peer: string; from: string }
  /** My connection to a host opened, or failed. */
  | { e: "open"; peer: string }
  | { e: "fail"; peer: string; text: string }
  | { e: "message"; peer: string; text: string }
  | { e: "close"; peer: string }
  /** A room announced on the Wi-Fi (again, when its attributes changed), and one gone. */
  | { e: "found"; name: string; address: string; port: number; attrs: Record<string, string> }
  | { e: "lost"; name: string }
  | { e: "error"; what: "host" | "discover"; text: string };

/** The port a host's app tries first, so that a typed address may leave it out; another is taken when it is busy. */
export const LAN_PORT = 47297;
/** How long a connection to a host may take on one Wi-Fi before it is given up. */
const DIAL_MS = 8000;

/** A room as its announcement tells it. */
export interface RoomAd {
  /** The announcement's service name (one per room). */
  name: string;
  /** Where to connect: `address:port`. */
  address: string;
  protocol: number;
  app: string;
  edition: string;
  game: string;
  title: string;
  /** The host's name, and the host's person id (a returning guest knows its room by it). */
  host: string;
  id: string;
  /** People connected, and the seats a person may take. */
  people: number;
  seats: number;
  playing: boolean;
}
/** What this page is: rooms of another version or edition are shown but cannot be joined. */
export interface LanSelf {
  app: string;
  edition: string;
}

const int = (text: string | undefined, fallback = 0) => {
  const n = Number(text);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
};
/** A room read from a `found` event; null for an announcement that is not one of ours. */
export function adOf(found: Extract<LanEvent, { e: "found" }>): RoomAd | null {
  const a = found.attrs ?? {};
  if (!a.app || !a.g || !a.id) return null;
  const address = a.a && /^[\w.:-]+:\d+$/.test(a.a) ? a.a : found.address && found.port ? `${found.address}:${found.port}` : "";
  if (!address) return null;
  return {
    name: found.name,
    address,
    protocol: int(a.wtg, -1),
    app: a.app,
    edition: a.ed || "full",
    game: a.g,
    title: a.t || a.g,
    host: a.n || "방장",
    id: a.id,
    people: int(a.p, 1),
    seats: int(a.s, 2),
    playing: a.on === "1",
  };
}
/** The attributes a host's room is announced with. */
export function adAttrs(room: HostRoom<unknown>, self: LanSelf): Record<string, string> {
  return {
    wtg: String(PROTOCOL),
    app: self.app,
    ed: self.edition,
    g: room.game,
    t: room.title,
    n: room.people[0]?.name ?? "",
    id: room.me,
    p: String(room.people.filter((p) => p.connected).length),
    s: String(room.seats.filter((s) => s.kind === "open" || s.kind === "person").length),
    on: room.match ? "1" : "0",
  };
}
/** Why this page may not join a room (another version, edition or game), or null. */
export function joinProblem(ad: Pick<RoomAd, "protocol" | "app" | "edition" | "game" | "title">, self: LanSelf, game: string): string | null {
  // A room's QR code carries the version in capitals (`roomCode`).
  if (ad.protocol !== PROTOCOL || ad.app.toUpperCase() !== self.app.toUpperCase()) return "버전이 다릅니다";
  if (ad.edition !== self.edition) return `버전이 다릅니다 (${ad.edition === "student" ? "학생용" : "일반"} 앱)`;
  if (ad.game !== game) return `다른 게임: ${ad.title}`;
  return null;
}
/** A room's line in the list: 민수의 방 · 체스 · 1/2명. */
export const adLine = (ad: RoomAd) => `${ad.host}의 방 · ${ad.title} · ${ad.people}/${ad.seats}명${ad.playing ? " · 게임 중" : ""}`;

/** A typed address as the app takes it (`192.168.0.12` or `192.168.0.12:47297`), or the words why not. */
export function typedAddress(text: string): { address: string } | { text: string } {
  const t = text.trim().replace(/\s+/g, "").replace(/。|．/g, ".");
  if (!t) return { text: "방장의 기기에 나온 주소를 넣어 주세요(예: 192.168.0.12:47297)." };
  const m = /^((?:\d{1,3}\.){3}\d{1,3}|[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*)(?::(\d{1,5}))?$/.exec(t);
  if (!m) return { text: "주소는 192.168.0.12:47297처럼 숫자와 점, 콜론으로 씁니다." };
  if (/^[\d.]+$/.test(m[1]) && m[1].split(".").some((n) => Number(n) > 255)) return { text: "주소의 숫자는 255보다 클 수 없습니다." };
  const port = m[2] ? Number(m[2]) : LAN_PORT;
  if (port < 1 || port > 65535) return { text: "콜론 뒤의 포트 번호가 맞지 않습니다." };
  return { address: `${m[1]}:${port}` };
}

/**
 * A room's address as the host's QR code carries it, for a guest's app to join with one scan (QR 찍기):
 * `WTGROOM://192.168.0.12:47297/TIC-TAC-TOE/FULL/1/2026.11-NET3` (address, game, edition, protocol, app version).
 * All in capitals so that the code is written in the QR's compact alphanumeric mode (a game id with another
 * character, such as morris's apostrophe, falls back to bytes); the reader takes any case.
 */
export interface RoomCode {
  address: string;
  game: string;
  edition: string;
  protocol: number;
  app: string;
}
export const ROOM_SCHEME = "WTGROOM://";
export const roomCode = (address: string, self: LanSelf, game: string) => `${ROOM_SCHEME}${address}/${game}/${self.edition}/${PROTOCOL}/${self.app}`.toUpperCase();
/** The room a scanned (or pasted) code names, or null for any other text (the QR way's codes among them). */
export function readRoomCode(text: string): RoomCode | null {
  const m = /^wtgroom:\/\/([^/\s]+)\/([a-z0-9'-]+)\/([a-z]+)\/(\d{1,4})\/(\S{1,40})$/i.exec(text.trim());
  if (!m) return null;
  const at = typedAddress(m[1]);
  if ("text" in at) return null;
  return { address: at.address, game: m[2].toLowerCase(), edition: m[3].toLowerCase(), protocol: Number(m[4]), app: m[5] };
}

/** A connection of the app's as a `Link`: messages that come before anyone listens are kept, then handed on. */
export class LanLink implements Link {
  onclose: (() => void) | null = null;
  private listener: ((text: string) => void) | null = null;
  private early: string[] = [];
  done = false;
  constructor(
    private readonly lan: Lan,
    readonly peer: string,
  ) {}
  get onmessage() {
    return this.listener;
  }
  set onmessage(fn: ((text: string) => void) | null) {
    this.listener = fn;
    while (fn && this.early.length) fn(this.early.shift()!);
  }
  /** A line from the app. */
  take(text: string) {
    if (this.done) return;
    if (this.listener) this.listener(text);
    else if (this.early.length < 64) this.early.push(text);
  }
  /** The app says the connection closed. */
  ended() {
    if (this.done) return;
    this.done = true;
    this.lan.forget(this.peer);
    this.onclose?.();
  }
  send(text: string) {
    if (this.done || !this.lan.bridge.send(this.peer, text)) throw new Error("closed");
  }
  close() {
    if (this.done) return;
    this.done = true;
    this.lan.forget(this.peer);
    try {
      this.lan.bridge.close(this.peer);
    } catch {
      // Already gone.
    }
  }
}

/** The app's Wi-Fi rooms as the page sees them: the room it hosts, the rooms it finds, the connections it holds. */
export class Lan {
  /** Rooms found on the Wi-Fi, by service name. */
  readonly rooms = new Map<string, RoomAd>();
  /** The room this device hosts, its address for typing (`192.168.0.12:47297`), and why hosting failed. */
  hosted: HostRoom<unknown> | null = null;
  address = "";
  problem = "";
  /** Why looking for rooms failed. */
  findProblem = "";
  private links = new Map<string, LanLink>();
  /** The peers that connected to my server (closed with it). */
  private incoming = new Set<string>();
  private dials = new Map<string, { resolve: (link: LanLink) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private listeners = new Set<() => void>();
  private finding = 0;
  private told = "";
  constructor(
    readonly bridge: LanBridge,
    readonly self: LanSelf,
  ) {}
  /** Calls `fn` whenever the rooms found, the address or a problem changed; returns the way to stop. */
  watch(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private changed() {
    for (const fn of [...this.listeners]) fn();
  }
  /** The rooms found (not my own), those of this game first. */
  list(game: string): RoomAd[] {
    const mine = this.hosted?.me;
    return [...this.rooms.values()].filter((r) => r.id !== mine).sort((a, b) => Number(a.game !== game) - Number(b.game !== game));
  }
  /** An event from the app. */
  receive(event: LanEvent) {
    if (!event || typeof event !== "object") return;
    switch (event.e) {
      case "hosting":
        this.address = `${event.address}:${event.port}`;
        this.problem = event.address ? "" : "와이파이 주소를 알 수 없습니다. 와이파이에 연결되어 있는지 확인하세요.";
        if (!event.address) this.address = "";
        return this.changed();
      case "stopped":
        this.address = "";
        this.problem = event.text;
        return this.changed();
      case "incoming": {
        const room = this.hosted;
        if (!room || room.left) {
          this.bridge.close(event.peer);
          return;
        }
        const link = new LanLink(this, event.peer);
        this.links.set(event.peer, link);
        this.incoming.add(event.peer);
        room.connect(link);
        return;
      }
      case "open": {
        const dial = this.dials.get(event.peer);
        if (!dial) return this.bridge.close(event.peer);
        this.dials.delete(event.peer);
        clearTimeout(dial.timer);
        const link = new LanLink(this, event.peer);
        this.links.set(event.peer, link);
        return dial.resolve(link);
      }
      case "fail": {
        const dial = this.dials.get(event.peer);
        if (!dial) return;
        this.dials.delete(event.peer);
        clearTimeout(dial.timer);
        return dial.reject(new Error(event.text || "연결하지 못했습니다."));
      }
      case "message":
        return this.links.get(event.peer)?.take(event.text);
      case "close": {
        const dial = this.dials.get(event.peer);
        if (dial) {
          this.dials.delete(event.peer);
          clearTimeout(dial.timer);
          dial.reject(new Error("연결이 끊겼습니다."));
        }
        return this.links.get(event.peer)?.ended();
      }
      case "found": {
        // A room told after looking stopped (the phone's discovery answers late) would stay in the list unseen and
        // never be withdrawn: it is not kept. The next look starts from an empty list.
        if (!this.finding) return;
        const ad = adOf(event);
        if (!ad) return;
        this.rooms.set(ad.name, ad);
        return this.changed();
      }
      case "lost":
        if (this.rooms.delete(event.name)) this.changed();
        return;
      case "error":
        if (event.what === "host") this.problem = event.text;
        else this.findProblem = event.text;
        return this.changed();
    }
  }
  /** A link the page is done with. */
  forget(peer: string) {
    this.links.delete(peer);
    this.incoming.delete(peer);
  }

  /** Opens `room` on the Wi-Fi: announced, guests let in as they connect, until the room is left. */
  host(room: HostRoom<unknown>) {
    if (this.hosted && this.hosted !== room) this.unhost();
    this.hosted = room;
    this.address = "";
    this.problem = "";
    this.told = JSON.stringify(adAttrs(room, this.self));
    room.onstate = () => {
      if (room.left) return this.hosted === room && this.unhost();
      const attrs = JSON.stringify(adAttrs(room, this.self));
      if (attrs === this.told || this.hosted !== room) return;
      this.told = attrs;
      this.bridge.update(attrs);
    };
    this.bridge.host(JSON.stringify({ id: room.me, attrs: JSON.parse(this.told) }));
    this.changed();
  }
  private unhost() {
    const room = this.hosted;
    if (room) room.onstate = null;
    this.hosted = null;
    this.address = "";
    this.problem = "";
    for (const peer of [...this.incoming]) this.links.get(peer)?.close();
    this.incoming.clear();
    this.bridge.stopHost();
    this.changed();
  }

  /** Starts looking for rooms (each caller stops its own). */
  find(): () => void {
    if (this.finding++ === 0) {
      this.rooms.clear();
      this.findProblem = "";
      this.bridge.discover();
    }
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      if (--this.finding === 0) {
        this.bridge.stopDiscover();
        this.rooms.clear();
      }
    };
  }
  /** Looks again from the start (다시 찾기): the list is emptied and filled anew. */
  refind() {
    if (!this.finding) return;
    this.rooms.clear();
    this.findProblem = "";
    this.bridge.stopDiscover();
    this.bridge.discover();
    this.changed();
  }
  /** Connects to a host: the link once it opens. */
  dial(address: string): Promise<LanLink> {
    return new Promise((resolve, reject) => {
      let peer: string;
      try {
        peer = this.bridge.connect(address);
      } catch {
        return reject(new Error("연결하지 못했습니다."));
      }
      if (!peer) return reject(new Error("연결하지 못했습니다."));
      const timer = setTimeout(() => {
        if (!this.dials.delete(peer)) return;
        this.bridge.close(peer);
        reject(new Error("대답이 없습니다."));
      }, DIAL_MS);
      this.dials.set(peer, { resolve, reject, timer });
    });
  }
}

interface AppWindow {
  wtgNet?: LanBridge;
  wtgNetEvent?: (event: LanEvent | string) => void;
}
let app: Lan | null | undefined;
/** The Android app's Wi-Fi rooms, or null in a plain browser (the QR way alone). */
export function appLan(self: LanSelf): Lan | null {
  if (app !== undefined) return app;
  const w = globalThis as unknown as AppWindow,
    bridge = w.wtgNet;
  try {
    if (!bridge || typeof bridge.available !== "function" || !bridge.available()) return (app = null);
  } catch {
    return (app = null);
  }
  const lan = new Lan(bridge, self);
  w.wtgNetEvent = (event) => {
    try {
      lan.receive(typeof event === "string" ? JSON.parse(event) : event);
    } catch {
      // An event the page cannot read is let go.
    }
  };
  return (app = lan);
}
