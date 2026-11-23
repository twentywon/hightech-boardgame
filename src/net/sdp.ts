import { deflate, fromBase45, inflate, toBase45 } from "./codec";

/**
 * A WebRTC description made short enough for a QR code a phone can read off another phone's screen, and back.
 *
 * Only a data channel is ever negotiated, so nearly all of a description can be rebuilt from a few values: the ICE
 * user name and password, the DTLS fingerprint, the setup role, the media id and the host candidates (no ICE
 * servers are used, so there are no others). Those are packed as bytes (an mDNS `.local` name as its 16 bytes, an
 * address as 4 or 16) and written in base45, the letters a QR code holds most densely. A description that does not
 * fit this pattern (another browser's surprise) is sent whole instead, deflated where the platform can.
 *
 * The code is `WTG1` + base45 + `.`: the closing dot keeps a space at the end of the base45 from being trimmed away
 * when the text is pasted.
 */
export type SignalType = "offer" | "answer";
export interface Signal {
  type: SignalType;
  sdp: string;
}
export interface Candidate {
  address: string;
  port: number;
  tcp: boolean;
  /** For a TCP candidate: active, passive or so (simultaneous open). */
  tcptype?: "active" | "passive" | "so";
}
export interface Compact {
  type: SignalType;
  ufrag: string;
  pwd: string;
  mid: string;
  setup: "actpass" | "active" | "passive";
  /** The sha-256 fingerprint of the DTLS certificate, 32 bytes. */
  fingerprint: Uint8Array;
  candidates: Candidate[];
}

export const PREFIX = "WTG1",
  END = ".";
const VERSION = 1,
  COMPACT = 1,
  DEFLATED = 2,
  PLAIN = 3,
  ANSWER = 8;
const SETUPS = ["actpass", "active", "passive"] as const;
const TCPTYPES = [undefined, "active", "passive", "so"] as const;
/** The most candidates kept: a phone on Wi-Fi has one or two; more only lengthen the code. */
const MOST = 4;
const MDNS = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/i;

/** The values a description is rebuilt from, or null when it is not a plain data channel. */
export function parseSdp(type: SignalType, sdp: string): Compact | null {
  const lines = sdp.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const media = lines.filter((l) => l.startsWith("m="));
  if (media.length !== 1 || !/^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/.test(media[0])) return null;
  const value = (key: string) => lines.find((l) => l.startsWith(`a=${key}:`))?.slice(key.length + 3).trim();
  const ufrag = value("ice-ufrag"),
    pwd = value("ice-pwd"),
    mid = value("mid") ?? "0",
    setup = value("setup") as Compact["setup"] | undefined,
    print = value("fingerprint"),
    port = value("sctp-port");
  if (!ufrag || !pwd || !setup || !SETUPS.includes(setup) || !print || (port && port !== "5000")) return null;
  if (ufrag.length > 255 || pwd.length > 255 || mid.length > 255 || /[^\x21-\x7e]/.test(ufrag + pwd + mid)) return null;
  const [algorithm, hex] = print.split(/\s+/);
  if (algorithm.toLowerCase() !== "sha-256" || !hex || !/^([0-9a-f]{2}:){31}[0-9a-f]{2}$/i.test(hex)) return null;
  const fingerprint = Uint8Array.from(hex.split(":"), (h) => parseInt(h, 16));
  const candidates: Candidate[] = [];
  for (const line of lines) {
    if (!line.startsWith("a=candidate:")) continue;
    const f = line.slice(12).split(/\s+/);
    // foundation component protocol priority address port typ host …
    if (f.length < 8 || f[1] !== "1" || f[6] !== "typ" || f[7] !== "host") continue;
    const tcp = f[2].toLowerCase() === "tcp";
    if (!tcp && f[2].toLowerCase() !== "udp") continue;
    const at = f.indexOf("tcptype"),
      tcptype = tcp ? (f[at + 1] as Candidate["tcptype"]) : undefined;
    const port = Number(f[5]);
    if (!Number.isInteger(port) || port < 0 || port > 65535 || addressBytes(f[4]) === null) continue;
    // An active TCP candidate has no port of its own (9) and is no use to the other side without the rest.
    if (tcp && (at < 0 || !TCPTYPES.includes(tcptype))) continue;
    if (candidates.some((c) => c.address === f[4] && c.port === port && c.tcp === tcp)) continue;
    candidates.push({ address: f[4], port, tcp, ...(tcp ? { tcptype } : {}) });
  }
  // UDP first: on one Wi-Fi it is what connects; TCP only when there is no UDP at all.
  const udp = candidates.filter((c) => !c.tcp);
  return { type, ufrag, pwd, mid, setup, fingerprint, candidates: (udp.length ? udp : candidates).slice(0, MOST) };
}

/** A whole description again from its values. */
export function buildSdp(c: Compact): string {
  const hex = [...c.fingerprint].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(":");
  const lines = [
    "v=0",
    `o=- ${Math.floor(1e15 + Math.random() * 8e15)} 2 IN IP4 127.0.0.1`,
    "s=-",
    "t=0 0",
    `a=group:BUNDLE ${c.mid}`,
    "a=msid-semantic: WMS",
    `m=application ${c.candidates[0]?.port || 9} UDP/DTLS/SCTP webrtc-datachannel`,
    "c=IN IP4 0.0.0.0",
    ...c.candidates.map((x, i) =>
      x.tcp
        ? `a=candidate:${i + 1} 1 tcp ${1518280447 - i * 256} ${x.address} ${x.port} typ host tcptype ${x.tcptype ?? "passive"} generation 0`
        : `a=candidate:${i + 1} 1 udp ${2122260223 - i * 256} ${x.address} ${x.port} typ host generation 0`,
    ),
    "a=end-of-candidates",
    `a=ice-ufrag:${c.ufrag}`,
    `a=ice-pwd:${c.pwd}`,
    "a=ice-options:trickle",
    `a=fingerprint:sha-256 ${hex}`,
    `a=setup:${c.setup}`,
    `a=mid:${c.mid}`,
    "a=sctp-port:5000",
    "a=max-message-size:262144",
  ];
  return lines.join("\r\n") + "\r\n";
}

/** An address as bytes: kind 0 IPv4, 1 IPv6, 2 an mDNS name (its UUID), 3 any other name. */
function addressBytes(address: string): { kind: number; bytes: number[] } | null {
  const v4 = address.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const bytes = v4.slice(1).map(Number);
    return bytes.every((b) => b <= 255) ? { kind: 0, bytes } : null;
  }
  const mdns = address.match(MDNS);
  if (mdns) {
    const hex = mdns.slice(1).join("");
    return { kind: 2, bytes: Array.from({ length: 16 }, (_, i) => parseInt(hex.slice(i * 2, i * 2 + 2), 16)) };
  }
  if (address.includes(":")) {
    const v6 = ipv6(address);
    return v6 ? { kind: 1, bytes: v6 } : null;
  }
  if (address.length > 0 && address.length < 64 && /^[\x21-\x7e]+$/.test(address)) return { kind: 3, bytes: [address.length, ...[...address].map((ch) => ch.charCodeAt(0))] };
  return null;
}
/** The 16 bytes of an IPv6 address, or null. */
function ipv6(text: string): number[] | null {
  if (text.includes("%") || !/^[0-9a-f:]+$/i.test(text)) return null;
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [],
    tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/i.test(g))) return null;
  return groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 255];
  });
}
function addressText(kind: number, bytes: number[]): string {
  if (kind === 0) return bytes.join(".");
  if (kind === 2) {
    const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}.local`;
  }
  if (kind === 1) {
    const groups = Array.from({ length: 8 }, (_, i) => ((bytes[i * 2] << 8) | bytes[i * 2 + 1]).toString(16));
    return groups.join(":");
  }
  return String.fromCharCode(...bytes);
}

/** The values as bytes. */
export function packCompact(c: Compact): Uint8Array {
  const out: number[] = [(VERSION << 4) | COMPACT | (c.type === "answer" ? ANSWER : 0), SETUPS.indexOf(c.setup)];
  const text = (s: string) => out.push(s.length, ...[...s].map((ch) => ch.charCodeAt(0)));
  text(c.ufrag);
  text(c.pwd);
  text(c.mid);
  out.push(c.fingerprint.length, ...c.fingerprint);
  out.push(c.candidates.length);
  for (const x of c.candidates) {
    const a = addressBytes(x.address)!;
    out.push(a.kind | (x.tcp ? 4 : 0) | (TCPTYPES.indexOf(x.tcptype) << 3), ...a.bytes, x.port >> 8, x.port & 255);
  }
  return Uint8Array.from(out);
}

/** The values back from their bytes, or null. */
export function unpackCompact(bytes: Uint8Array): Compact | null {
  let at = 0;
  const take = (n: number) => {
    if (at + n > bytes.length) throw new Error("short");
    const part = [...bytes.slice(at, at + n)];
    at += n;
    return part;
  };
  const text = () => String.fromCharCode(...take(take(1)[0]));
  try {
    const head = take(1)[0];
    if (head >> 4 !== VERSION || (head & 7) !== COMPACT) return null;
    const setup = SETUPS[take(1)[0]];
    if (!setup) return null;
    const ufrag = text(),
      pwd = text(),
      mid = text(),
      fingerprint = Uint8Array.from(take(take(1)[0]));
    const count = take(1)[0],
      candidates: Candidate[] = [];
    for (let i = 0; i < count; i++) {
      const flags = take(1)[0],
        kind = flags & 3,
        tcp = !!(flags & 4),
        tcptype = TCPTYPES[(flags >> 3) & 3];
      const raw = kind === 0 ? take(4) : kind === 3 ? take(take(1)[0]) : take(16),
        [hi, lo] = take(2);
      candidates.push({ address: addressText(kind, raw), port: (hi << 8) | lo, tcp, ...(tcp ? { tcptype: tcptype ?? "passive" } : {}) });
    }
    if (at !== bytes.length || fingerprint.length !== 32) return null;
    return { type: head & ANSWER ? "answer" : "offer", ufrag, pwd, mid, setup, fingerprint, candidates };
  } catch {
    return null;
  }
}

/** A description as a pairing code (see the head of this file). */
export async function packSignal(signal: Signal): Promise<string> {
  const compact = parseSdp(signal.type, signal.sdp);
  let bytes: Uint8Array;
  if (compact && compact.candidates.length) bytes = packCompact(compact);
  else {
    const whole = new TextEncoder().encode(signal.sdp),
      squeezed = await deflate(whole),
      kind = squeezed ? DEFLATED : PLAIN,
      body = squeezed ?? whole;
    bytes = new Uint8Array(body.length + 1);
    bytes[0] = (VERSION << 4) | kind | (signal.type === "answer" ? ANSWER : 0);
    bytes.set(body, 1);
  }
  return PREFIX + toBase45(bytes) + END;
}

/**
 * The host's invite names its game in front of the code (so that a guest may scan it from the collection's
 * 참가하기 and land in that game): `WTGG:CHESS/WTG1…` (`gameTag`, the game id in capitals with only letters, digits
 * and hyphens, for the QR's alphanumeric mode). An invite without it (an older device's) is the bare code; an answer
 * never has one. Readers older than this see a code that does not start with `WTG1` and say the versions differ.
 */
export const TAG_PREFIX = "WTGG:";
export const gameTag = (game: string) => game.toUpperCase().replace(/[^A-Z0-9-]/g, "");
export const tagInvite = (code: string, game: string) => (gameTag(game) ? `${TAG_PREFIX}${gameTag(game)}/${code}` : code);
/** The game an invite names (its `gameTag`, null for a bare code) and the code itself. */
export function readInvite(text: string): { tag: string | null; code: string } {
  const t = text.trim().replace(/[\r\n\t]/g, "");
  if (t.slice(0, TAG_PREFIX.length).toUpperCase() !== TAG_PREFIX) return { tag: null, code: t };
  const m = /^([A-Za-z0-9-]{1,48})\/(.*)$/.exec(t.slice(TAG_PREFIX.length));
  return m ? { tag: m[1].toUpperCase(), code: m[2] } : { tag: "", code: "" };
}

/** Why a code cannot be read, in words; null when it can. */
export function codeProblem(code: string): string | null {
  const tagged = readInvite(code);
  const text = tagged.code;
  if (tagged.tag !== null && !text.startsWith(PREFIX)) return PREFIX.startsWith(text) ? "코드가 끝까지 복사되지 않았습니다." : "코드가 손상되었습니다. 다시 복사해 주세요.";
  if (!text) return "코드를 붙여 넣거나 카메라로 읽어 주세요.";
  if (!text.startsWith(PREFIX)) return text.startsWith("WTG") ? "이 기기와 버전이 다른 코드입니다. 두 기기 모두 업데이트하세요." : "이 게임의 연결 코드가 아닙니다.";
  if (!text.endsWith(END)) return "코드가 끝까지 복사되지 않았습니다.";
  return fromBase45(text.slice(PREFIX.length, -END.length)) ? null : "코드가 손상되었습니다. 다시 복사해 주세요.";
}

/** A pairing code back as a description, or null when it is not one. */
export async function unpackSignal(code: string): Promise<Signal | null> {
  const text = readInvite(code).code;
  if (codeProblem(text)) return null;
  const bytes = fromBase45(text.slice(PREFIX.length, -END.length));
  if (!bytes?.length || bytes[0] >> 4 !== VERSION) return null;
  const kind = bytes[0] & 7,
    type: SignalType = bytes[0] & ANSWER ? "answer" : "offer";
  if (kind === COMPACT) {
    const compact = unpackCompact(bytes);
    return compact ? { type: compact.type, sdp: buildSdp(compact) } : null;
  }
  const body = bytes.slice(1),
    whole = kind === DEFLATED ? await inflate(body) : kind === PLAIN ? body : null;
  return whole ? { type, sdp: new TextDecoder().decode(whole) } : null;
}
