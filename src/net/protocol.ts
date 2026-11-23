import type { GameOptions, Move } from "../games/points/types";

/**
 * The messages devices of a room exchange over their data channels: JSON, one message a send, each carrying the
 * protocol's version `v`. Devices exchange moves, never boards: every move goes through the game's own `play` on
 * every device. The host is the authority on order (a star: guests talk only to the host, which relays).
 *
 *  hello    both ways when a channel opens: protocol and app version, the game, the name, a person's id (kept for
 *           this page only, so that a device that drops can come back to its seat). A host refuses a different
 *           version with `bye` ("업데이트하세요") and a different game with `bye` naming it.
 *  seats    host → all: who is in the room and who sits where (each seat a person, a computer, closed or open).
 *  sit      guest → host: the seat I take (null: I only watch).
 *  start    host → all: a game begins (round, variant, options, the shared random seed, the seats).
 *  move     guest → host: a move I make on the game's `ply`-th move; host → all: the `ply`-th move, from `seat`,
 *           with the `salt` the host drew for its chance when it took it (a guest's own move comes back so too).
 *  refuse   host → guest: that move was not taken, with the words why.
 *  request  undo or new game asked by `from`; host → all. answer: yes or no, guest → host → all.
 *  resync   host → guest: the game as it stands (its start and every move with its salt), on (re)connection and
 *           after an undo.
 *  notice   host → all: a line for the status (someone left, a request declined).
 *  bye      leaving, or a refusal to let in, with the words why.
 *  ping     both ways every few seconds (`echo` answers one), so a device that went quiet is noticed.
 *
 * A table that runs in real time (`live.ts`: air hockey, table soccer, table tennis) adds three, outside the move list:
 *  live     host → all, many times a second: the table as it stands (`data`, numbers the game packs), the host's
 *           clock `at` (ms), `cut` (bumped when the table jumps, so a guest never slides across it), `paused`.
 *  input    guest → host, many times a second: my controls as numbers (where my mallet is sent, a kick counted).
 *  hold     a pause asked (guest → host) or told (host → all), by `from`.
 */
export const PROTOCOL = 1;
/** Bumped whenever a rule or a move changes meaning, so that devices of different builds do not play together. */
export const APP_VERSION = "2026.11-net4";

/** A seat: waiting for a person, taken by a person, played by the host's computer, or left out (an empty corner). */
export type SeatKind = "open" | "person" | "computer" | "closed";
export interface SeatInfo {
  label: string;
  color: string;
  kind: SeatKind;
  /** The person sitting there (kind "person"). */
  person: string | null;
  /** What the host may make the seat besides a person's: "computer", "closed". */
  kinds: SeatKind[];
}
export interface PersonInfo {
  id: string;
  name: string;
  host: boolean;
  connected: boolean;
}
export interface Taken {
  kind: "person" | "computer" | "closed";
  person: string | null;
}
export interface StartInfo {
  /** Counts the games begun in this room, so a late message of the last one is told apart. */
  round: number;
  variant: string;
  options: GameOptions;
  seed: number;
  seats: Taken[];
}
export interface NetMove {
  move: Move;
  /** The seat that moved; -1 for a move only the host makes (hex conquest's map and start). */
  seat: number;
  /** What the host drew for the move's chance when it took it (`streamFor`); 0 or left out: none. */
  salt?: number;
}
export type Request = "undo" | "new";
export type Message =
  | { t: "hello"; v: number; app: string; role: "host" | "guest"; game: string; title: string; name: string; id: string }
  | { t: "seats"; seats: SeatInfo[]; people: PersonInfo[] }
  | { t: "sit"; seat: number | null }
  | { t: "start"; start: StartInfo }
  | { t: "move"; round: number; ply: number; move: Move; seat: number; salt?: number }
  | { t: "refuse"; round: number; ply: number; text: string }
  | { t: "request"; id: number; kind: Request; from: string }
  | { t: "answer"; id: number; yes: boolean; from: string }
  | { t: "resync"; start: StartInfo; moves: NetMove[] }
  | { t: "notice"; text: string }
  /** `closed`: the host left and the room is gone for everyone. */
  | { t: "bye"; reason: string; closed?: boolean }
  | { t: "ping"; at: number; echo: boolean }
  | LiveMessage;
/** The messages of a real-time table (`live.ts`), each of one game (`round`). */
export type LiveMessage =
  | { t: "live"; round: number; seq: number; at: number; cut: number; paused: boolean; data: number[] }
  | { t: "input"; round: number; seq: number; data: number[] }
  | { t: "hold"; round: number; paused: boolean; from: string };
/** The most numbers a table's state (`live`) and a hand's controls (`input`) may carry. */
export const LIVE_MOST = 256,
  INPUT_MOST = 16;

export function encode(message: Message): string {
  return JSON.stringify(message.t === "hello" ? message : { v: PROTOCOL, ...message });
}

const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);
const isStr = (x: unknown, most = 4000): x is string => typeof x === "string" && x.length <= most;
const isMove = (x: unknown): x is Move => {
  const m = x as Move;
  return !!m && typeof m === "object" && isInt(m.from) && isInt(m.to) && isInt(m.extra);
};
const isOptions = (x: unknown): x is GameOptions =>
  !!x && typeof x === "object" && !Array.isArray(x) && Object.values(x as object).every((v) => typeof v === "number" || typeof v === "boolean" || isStr(v, 200));
const KINDS: SeatKind[] = ["open", "person", "computer", "closed"];
/** A salt as the host draws it: a whole number of 32 bits, or none. */
const isSalt = (x: unknown) => x === undefined || (isInt(x) && x >= 0 && x <= 0xffffffff);
const isTaken = (x: unknown): x is Taken => {
  const t = x as Taken;
  return !!t && (t.kind === "person" || t.kind === "computer" || t.kind === "closed") && (t.person === null || isStr(t.person, 64));
};
const isStart = (x: unknown): x is StartInfo => {
  const s = x as StartInfo;
  return !!s && isInt(s.round) && isStr(s.variant, 200) && isOptions(s.options) && isInt(s.seed) && Array.isArray(s.seats) && s.seats.length <= 8 && s.seats.every(isTaken);
};

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isCount = (x: unknown): x is number => isInt(x) && x >= 0;
/** A list of at most `most` finite numbers (a live table's state or a hand's controls). */
const isNums = (x: unknown, most: number): x is number[] => Array.isArray(x) && x.length <= most && x.every(isNum);

/** A message read back, checked field by field; null for anything else (a message of another version but hello). */
export function decode(text: string): Message | null {
  let m: Record<string, unknown>;
  try {
    m = JSON.parse(text);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  if (m.t === "hello")
    return isInt(m.v) && isStr(m.app, 64) && (m.role === "host" || m.role === "guest") && isStr(m.game, 80) && isStr(m.title, 80) && isStr(m.name, 40) && isStr(m.id, 64)
      ? (m as Message)
      : null;
  if (m.v !== PROTOCOL) return null;
  return checked(m);
}
function checked(whole: Record<string, unknown>): Message | null {
  const { v: _v, ...m } = whole;
  switch (m.t) {
    case "seats":
      return Array.isArray(m.seats) &&
        m.seats.length <= 8 &&
        m.seats.every((s: SeatInfo) => s && isStr(s.label, 40) && isStr(s.color, 40) && KINDS.includes(s.kind) && (s.person === null || isStr(s.person, 64)) && Array.isArray(s.kinds) && s.kinds.every((k) => KINDS.includes(k))) &&
        Array.isArray(m.people) &&
        m.people.length <= 8 &&
        m.people.every((p: PersonInfo) => p && isStr(p.id, 64) && isStr(p.name, 40) && typeof p.host === "boolean" && typeof p.connected === "boolean")
        ? (m as Message)
        : null;
    case "sit":
      return m.seat === null || (isInt(m.seat) && m.seat >= 0 && m.seat < 8) ? (m as Message) : null;
    case "start":
      return isStart(m.start) ? (m as Message) : null;
    case "move":
      return isInt(m.round) && isInt(m.ply) && m.ply >= 0 && isMove(m.move) && isInt(m.seat) && isSalt(m.salt) ? (m as Message) : null;
    case "refuse":
      return isInt(m.round) && isInt(m.ply) && isStr(m.text, 400) ? (m as Message) : null;
    case "request":
      return isInt(m.id) && (m.kind === "undo" || m.kind === "new") && isStr(m.from, 64) ? (m as Message) : null;
    case "answer":
      return isInt(m.id) && typeof m.yes === "boolean" && isStr(m.from, 64) ? (m as Message) : null;
    case "resync":
      return isStart(m.start) && Array.isArray(m.moves) && m.moves.length <= 20000 && m.moves.every((x: NetMove) => x && isMove(x.move) && isInt(x.seat) && isSalt(x.salt)) ? (m as Message) : null;
    case "notice":
      return isStr(m.text, 400) ? (m as Message) : null;
    case "bye":
      return isStr(m.reason, 400) ? (m as Message) : null;
    case "ping":
      return typeof m.at === "number" && typeof m.echo === "boolean" ? (m as Message) : null;
    // A real-time table's messages (`live.ts`).
    case "live":
      return isInt(m.round) && isCount(m.seq) && isNum(m.at) && isCount(m.cut) && typeof m.paused === "boolean" && isNums(m.data, LIVE_MOST) ? (m as Message) : null;
    case "input":
      return isInt(m.round) && isCount(m.seq) && isNums(m.data, INPUT_MOST) ? (m as Message) : null;
    case "hold":
      return isInt(m.round) && typeof m.paused === "boolean" && isStr(m.from, 64) ? (m as Message) : null;
  }
  return null;
}
