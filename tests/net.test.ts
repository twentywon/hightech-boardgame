import { describe, expect, test } from "vitest";
import { fromBase45, toBase45 } from "../src/net/codec";
import { buildSdp, codeProblem, packCompact, packSignal, parseSdp, unpackCompact, unpackSignal } from "../src/net/sdp";
import { qrModules, qrPixels, readQr } from "../src/net/qr";
import { APP_VERSION, PROTOCOL, decode, encode, type Message, type SeatInfo } from "../src/net/protocol";
import { HOST_ONLY, Match, NOBODY, type NetRules } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks, type Link } from "../src/net/room";
import { streamFor } from "../src/net/random";
import { pointRules } from "../src/net/points";
import { tictactoe as ticTacToe } from "../src/games/tictactoe/rules";
import { hexConquestConfig } from "../src/games/hexconquest/config";
import { chooseMove } from "../src/games/hexconquest/ai";
import { NEW_MAP, ORDER, START, type State as HexState } from "../src/games/hexconquest/rules";
import type { Move, PointGame } from "../src/games/points/types";

/** Lets every queued message be delivered (each hop is a microtask). */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};

const CHROME_OFFER = [
  "v=0",
  "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=extmap-allow-mixed",
  "a=msid-semantic: WMS",
  "m=application 61733 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=candidate:2999745851 1 udp 2122260223 4b9c1c2d-2a0e-4f8e-a0f7-5d8d4f1e0b7c.local 61733 typ host generation 0 network-id 1 network-cost 10",
  "a=candidate:1180912 1 udp 2122194687 192.168.0.23 50001 typ host generation 0 network-id 2",
  "a=candidate:84738 1 udp 2122129151 fe80::1c2b:3aff:fe4d:5e6f 50002 typ host generation 0 network-id 3",
  "a=candidate:4233069003 1 tcp 1518280447 192.168.0.23 9 typ host tcptype active generation 0 network-id 1 network-cost 10",
  "a=ice-ufrag:Hn0S",
  "a=ice-pwd:hW3n0hK6hrXzMSzQjGx1pT8n",
  "a=ice-options:trickle",
  "a=fingerprint:sha-256 4F:1A:2B:3C:4D:5E:6F:70:81:92:A3:B4:C5:D6:E7:F8:09:1A:2B:3C:4D:5E:6F:70:81:92:A3:B4:C5:D6:E7:D1",
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");

describe("codes", () => {
  test("base45 follows RFC 9285 and round-trips any bytes", () => {
    const text = (s: string) => toBase45(new TextEncoder().encode(s));
    expect(text("AB")).toBe("BB8");
    expect(text("Hello!!")).toBe("%69 VD92EX0");
    expect(text("ietf!")).toBe("QED8WEX0");
    const random = streamFor(7, 1);
    for (let n = 0; n < 60; n++) {
      const bytes = Uint8Array.from({ length: n }, () => Math.floor(random() * 256));
      expect([...fromBase45(toBase45(bytes))!]).toEqual([...bytes]);
    }
    expect(fromBase45("GGW")).toBeNull();
    expect(fromBase45("a")).toBeNull();
  });

  test("a data channel offer shrinks to its few values and is rebuilt with them", async () => {
    const compact = parseSdp("offer", CHROME_OFFER)!;
    expect(compact).not.toBeNull();
    expect(compact.ufrag).toBe("Hn0S");
    expect(compact.setup).toBe("actpass");
    // UDP only, in order; the mDNS name, the IPv4 and the IPv6 address all kept.
    expect(compact.candidates.map((c) => c.address)).toEqual(["4b9c1c2d-2a0e-4f8e-a0f7-5d8d4f1e0b7c.local", "192.168.0.23", "fe80::1c2b:3aff:fe4d:5e6f"]);
    const bytes = packCompact(compact);
    expect(bytes.length).toBeLessThan(120);
    const back = unpackCompact(bytes)!;
    expect(back.candidates.map((c) => c.address)).toEqual(["4b9c1c2d-2a0e-4f8e-a0f7-5d8d4f1e0b7c.local", "192.168.0.23", "fe80:0:0:0:1c2b:3aff:fe4d:5e6f"]);
    expect([...back.fingerprint]).toEqual([...compact.fingerprint]);

    const code = await packSignal({ type: "offer", sdp: CHROME_OFFER });
    expect(codeProblem(code)).toBeNull();
    // Short enough for a QR code a phone reads off another phone's screen.
    expect(code.length).toBeLessThan(180);
    const signal = (await unpackSignal(`  ${code}\n`))!;
    expect(signal.type).toBe("offer");
    const again = parseSdp("offer", signal.sdp)!;
    expect({ ...again, fingerprint: [...again.fingerprint] }).toEqual({ ...back, fingerprint: [...back.fingerprint] });
    expect(signal.sdp).toContain("a=fingerprint:sha-256 4F:1A:2B");
    expect(signal.sdp).toContain("a=candidate:1 1 udp");
    // The answer side keeps its role and type.
    const answer = await packSignal({ type: "answer", sdp: CHROME_OFFER.replace("a=setup:actpass", "a=setup:active") });
    const read = (await unpackSignal(answer))!;
    expect(read.type).toBe("answer");
    expect(read.sdp).toContain("a=setup:active");
    expect(buildSdp(parseSdp("answer", read.sdp)!)).toContain("a=mid:0");
  });

  test("a description of another shape is sent whole, deflated, and comes back the same", async () => {
    const odd = CHROME_OFFER.replace("m=application", "m=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=application");
    expect(parseSdp("offer", odd)).toBeNull();
    const code = await packSignal({ type: "offer", sdp: odd });
    expect(await unpackSignal(code)).toEqual({ type: "offer", sdp: odd });
  });

  test("codes that are cut, damaged or not ours are told apart", async () => {
    const code = await packSignal({ type: "offer", sdp: CHROME_OFFER });
    expect(codeProblem(code.slice(0, -1))).toMatch(/끝까지/);
    expect(codeProblem("hello")).toMatch(/연결 코드가 아닙니다/);
    expect(codeProblem("WTG9ABC.")).toMatch(/업데이트/);
    expect(codeProblem("")).toMatch(/붙여 넣거나/);
    expect(await unpackSignal("WTG1a.")).toBeNull();
  });

  test("a pairing code survives a QR code: made, seen as pixels, read back", async () => {
    const code = await packSignal({ type: "offer", sdp: CHROME_OFFER });
    const modules = qrModules(code);
    // Alphanumeric mode keeps it small: version 7 or less (45 modules), easy for a phone camera.
    expect(modules.length).toBeLessThanOrEqual(45);
    const { data, width, height } = qrPixels(code, 3);
    expect(readQr(data, width, height)).toBe(code);
    // Any text, in byte mode.
    const text = "hello, wtg {room}";
    const pixels = qrPixels(text, 4);
    expect(readQr(pixels.data, pixels.width, pixels.height)).toBe(text);
  });
});

describe("messages", () => {
  test("every message goes out and comes back as it was", () => {
    const messages: Message[] = [
      { t: "hello", v: PROTOCOL, app: APP_VERSION, role: "guest", game: "checkers", title: "체커", name: "민수", id: "abc" },
      { t: "seats", seats: [{ label: "흑", color: "#000", kind: "person", person: "abc", kinds: ["computer"] }], people: [{ id: "abc", name: "민수", host: false, connected: true }] },
      { t: "sit", seat: 1 },
      { t: "sit", seat: null },
      { t: "start", start: { round: 1, variant: "", options: { size: 9, misere: true, first: "me" }, seed: 12345, seats: [{ kind: "person", person: "a" }, { kind: "computer", person: null }] } },
      { t: "move", round: 1, ply: 3, move: { from: 1, to: 2, extra: -1 }, seat: 0 },
      { t: "refuse", round: 1, ply: 3, text: "상대 차례입니다." },
      { t: "request", id: 2, kind: "undo", from: "abc" },
      { t: "answer", id: 2, yes: false, from: "def" },
      { t: "resync", start: { round: 2, variant: "9", options: {}, seed: 1, seats: [] }, moves: [{ move: { from: -1, to: 4, extra: -1 }, seat: -1 }] },
      { t: "notice", text: "민수 님이 들어왔습니다." },
      { t: "bye", reason: "방장이 방을 닫았습니다." },
      { t: "ping", at: 123.5, echo: true },
    ];
    for (const m of messages) expect(decode(encode(m))).toEqual(m);
  });

  test("anything else is dropped", () => {
    expect(decode("not json")).toBeNull();
    expect(decode(JSON.stringify({ v: PROTOCOL, t: "move", round: 1, ply: -1, move: { from: 0, to: 0, extra: 0 }, seat: 0 }))).toBeNull();
    expect(decode(JSON.stringify({ v: PROTOCOL, t: "move", round: 1, ply: 0, move: { from: "x", to: 0, extra: 0 }, seat: 0 }))).toBeNull();
    expect(decode(JSON.stringify({ v: PROTOCOL + 1, t: "notice", text: "hi" }))).toBeNull();
    expect(decode(JSON.stringify({ v: PROTOCOL, t: "launch" }))).toBeNull();
    // A hello of another version is still read, so that it can be refused with words.
    expect(decode(JSON.stringify({ t: "hello", v: 99, app: "x", role: "guest", game: "g", title: "t", name: "n", id: "i" }))).not.toBeNull();
  });
});

/** Two seats of tic-tac-toe, the computer allowed on either. */
const SEATS: SeatInfo[] = [
  { label: "X", color: "#000", kind: "open", person: null, kinds: ["computer"] },
  { label: "O", color: "#fff", kind: "open", person: null, kinds: ["computer"] },
];
type T = ReturnType<typeof ticTacToe.create>;
const tttRules = pointRules(ticTacToe as PointGame<T>, {});
const at = (cell: number): Move => ({ from: -1, to: cell, extra: -1 });

/** A host and guests joined by memory links. */
async function room<S>(rules: NetRules<S>, seats: SeatInfo[], guests: string[], game = "tic-tac-toe") {
  const host = new HostRoom({ game, title: "틱택토", name: "방장", variant: "classic", options: {}, seats, quiet: true }, rules, "host");
  const others: { room: GuestRoom<S>; link: Link }[] = [];
  for (const [i, name] of guests.entries()) {
    const guest = new GuestRoom<S>({ game, title: "틱택토", name, quiet: true }, rules, `guest${i}`);
    const [a, b] = memoryLinks();
    host.connect(a);
    guest.connect(b);
    others.push({ room: guest, link: b });
    await settle();
  }
  return { host, guests: others };
}

describe("a room", () => {
  test("guests come in, take the open seats, and see the same seats as the host", async () => {
    const { host, guests } = await room(tttRules, SEATS, ["민수", "지아"]);
    expect(host.seats.map((s) => s.person)).toEqual(["host", "guest0"]);
    // The third person only watches.
    expect(host.people.map((p) => p.name)).toEqual(["방장", "민수", "지아"]);
    for (const g of guests) {
      expect(g.room.seats).toEqual(host.seats);
      expect(g.room.hostName).toBe("방장");
    }
    expect(guests[0].room.mySeat).toBe(1);
    expect(guests[1].room.mySeat).toBeNull();
    expect(host.startProblem()).toBeNull();
  });

  test("a device of another version is refused with 업데이트하세요", async () => {
    const host = new HostRoom({ game: "tic-tac-toe", title: "틱택토", name: "방장", variant: "classic", options: {}, seats: SEATS, quiet: true }, tttRules);
    const [a, b] = memoryLinks();
    host.connect(a);
    const heard: string[] = [];
    b.onmessage = (text) => heard.push(text);
    b.send(JSON.stringify({ t: "hello", v: PROTOCOL, app: "1999.01", role: "guest", game: "tic-tac-toe", title: "틱택토", name: "옛날", id: "old" }));
    await settle();
    const bye = decode(heard[0]) as Extract<Message, { t: "bye" }>;
    expect(bye.t).toBe("bye");
    expect(bye.reason).toContain("업데이트하세요");
    expect(host.people).toHaveLength(1);
    // Another game's room is refused with its name.
    const guest = new GuestRoom({ game: "checkers", title: "체커", name: "민수", quiet: true }, tttRules);
    const lost: string[] = [];
    guest.events.lost = (r) => lost.push(r);
    const [c, d] = memoryLinks();
    host.connect(c);
    guest.connect(d);
    await settle();
    expect(lost[0]).toContain("'틱택토' 방");
  });

  test("the host keeps the order: moves in turn are relayed to all, a move out of turn is refused with words", async () => {
    const { host, guests } = await room(tttRules, SEATS, ["민수", "지아"]);
    const [g, watcher] = guests.map((x) => x.room);
    const refused: string[] = [];
    g.events.refused = (text) => refused.push(text);
    host.begin();
    await settle();
    expect(g.match?.state).toEqual(host.match?.state);
    // The guest is O: X (the host) moves first. The guest's own check refuses it before anything is sent…
    expect(g.play(at(4))).toBe("상대 차례입니다.");
    // …and the host refuses it too when it is sent all the same.
    const sneaky = memoryLinks();
    void sneaky;
    (g as unknown as { say(m: Message): void }).say({ t: "move", round: 1, ply: 0, move: at(4), seat: 1 });
    await settle();
    expect(refused).toEqual(["상대 차례입니다."]);
    expect(host.match!.ply).toBe(0);
    // In turn.
    expect(host.play(at(4), 0)).toBeNull();
    await settle();
    expect(g.play(at(0))).toBeNull();
    await settle();
    expect(host.play(at(0), 0)).toBe("둘 수 없는 수입니다.");
    expect(host.play(at(8), 0)).toBeNull();
    await settle();
    // Someone watching cannot move.
    expect(watcher.play(at(1))).toBe("구경하는 중입니다.");
    for (const r of [g, watcher]) {
      expect(r.match!.ply).toBe(3);
      expect(r.match!.state).toEqual(host.match!.state);
      expect(r.match!.moves).toEqual(host.match!.moves);
    }
    // A move sent on a stale ply is refused and the sender is brought back in line.
    (g as unknown as { say(m: Message): void }).say({ t: "move", round: 1, ply: 1, move: at(2), seat: 1 });
    await settle();
    expect(refused.at(-1)).toContain("다시 맞췄습니다");
    expect(g.match!.state).toEqual(host.match!.state);
  });

  test("an undo is asked, accepted by the other, and every device goes back to the same state", async () => {
    const { host, guests } = await room(tttRules, SEATS, ["민수"]);
    const g = guests[0].room;
    const asked: number[] = [];
    host.events.asked = (a) => asked.push(a.id);
    host.begin();
    await settle();
    host.play(at(4), 0);
    await settle();
    g.play(at(0));
    await settle();
    const before = host.match!.states[1];
    // The guest asks to take back its O; the host must answer.
    expect(g.request("undo")).toBeNull();
    await settle();
    expect(asked).toHaveLength(1);
    expect(host.mustAnswer).toBe(true);
    host.answer(asked[0], true);
    await settle();
    expect(host.match!.ply).toBe(1);
    expect(host.match!.state).toEqual(before);
    expect(g.match!.state).toEqual(before);
    expect(g.pending).toBeNull();
    // Declined: nothing changes and the asker is told.
    const notices: string[] = [];
    g.events.notice = (t) => notices.push(t);
    g.play(at(1));
    await settle();
    g.request("undo");
    await settle();
    host.answer(asked.length ? host.pending!.id : 0, false);
    await settle();
    expect(host.match!.ply).toBe(2);
    expect(notices.some((t) => t.includes("거절"))).toBe(true);
  });

  test("a new game asked and accepted starts again with a new seed on every device", async () => {
    const { host, guests } = await room(tttRules, SEATS, ["민수"]);
    const g = guests[0].room;
    let starts = 0;
    g.events.started = () => starts++;
    host.begin();
    await settle();
    host.play(at(4), 0);
    await settle();
    host.request("new");
    await settle();
    expect(g.mustAnswer).toBe(true);
    g.answer(g.pending!.id, true);
    await settle();
    expect(host.start!.round).toBe(2);
    expect(g.start).toEqual(host.start);
    expect(g.match!.ply).toBe(0);
    expect(starts).toBe(2);
  });

  test("a dropped guest is away; coming back on a new link it is resynced to the same state", async () => {
    const { host, guests } = await room(tttRules, SEATS, ["민수"]);
    const g = guests[0].room;
    host.begin();
    await settle();
    host.play(at(4), 0);
    await settle();
    g.play(at(0));
    await settle();
    // The channel fails (as Wi-Fi does): both ends hear it.
    guests[0].link.onclose?.();
    await settle();
    expect(host.away(1)).toBe(true);
    expect(g.online).toBe(false);
    // Meanwhile the host moves; the guest's seat is not yet to move, so nothing waits.
    host.play(at(8), 0);
    // The same page joins again (a new pairing); the host sends the whole list.
    const [a, b] = memoryLinks();
    host.connect(a);
    let synced = 0;
    g.events.synced = () => synced++;
    g.connect(b);
    await settle();
    expect(host.away(1)).toBe(false);
    expect(g.mySeat).toBe(1);
    expect(synced).toBe(1);
    expect(g.match!.moves).toEqual(host.match!.moves);
    expect(g.match!.state).toEqual(host.match!.state);
    // A page opened anew (a new id) comes back to the seat by its name.
    const fresh = new GuestRoom<T>({ game: "tic-tac-toe", title: "틱택토", name: "민수", quiet: true }, tttRules, "other-id");
    b.onclose?.();
    await settle();
    const [c, d] = memoryLinks();
    host.connect(c);
    fresh.connect(d);
    await settle();
    expect(fresh.match!.state).toEqual(host.match!.state);
    expect(host.people.filter((p) => p.name === "민수")).toHaveLength(1);
  });

  test("the host leaving tells every guest", async () => {
    const { host, guests } = await room(tttRules, SEATS, ["민수"]);
    const lost: string[] = [];
    guests[0].room.events.lost = (r) => lost.push(r);
    host.begin();
    await settle();
    host.leave();
    await settle();
    expect(lost).toEqual(["방장이 방을 닫았습니다."]);
    expect(guests[0].room.dismissed).toBe(true);
  });
});

describe("shared chance", () => {
  const hexRules = pointRules(hexConquestConfig.game, hexConquestConfig.net!);
  const HEX_SEATS = (): SeatInfo[] => hexConquestConfig.net!.seats!("").map((s) => ({ ...s, kind: "open", person: null }));

  test("two devices given one start lay the same map and stay the same through the same moves", () => {
    const start = { round: 1, variant: "", options: {}, seed: 98765, seats: [{ kind: "person" as const, person: "a" }, { kind: "person" as const, person: "b" }, { kind: "closed" as const, person: null }, { kind: "person" as const, person: "c" }] };
    const one = new Match(hexRules, start),
      two = new Match(hexRules, start);
    expect(one.state).toEqual(two.state);
    // Three nations seated, in the order of play; the empty corner (황국) is plain land.
    expect(one.state.people).toBe(3);
    expect(one.state.humans).toEqual([ORDER[0], ORDER[1], ORDER[3]]);
    expect(one.toMove).toBe(HOST_ONLY);
    // Another map from the shared seed, then the start; then each seat's computer-chosen moves.
    expect(one.push({ from: -1, to: NEW_MAP, extra: -1 }, HOST_ONLY)).not.toBeNull();
    expect(one.state.world).not.toEqual(two.state.world);
    two.push({ from: -1, to: NEW_MAP, extra: -1 }, HOST_ONLY);
    expect(one.state).toEqual(two.state);
    one.push({ from: -1, to: START, extra: -1 }, HOST_ONLY);
    two.push({ from: -1, to: START, extra: -1 }, HOST_ONLY);
    const random = streamFor(5, 5);
    for (let i = 0; i < 120 && one.toMove !== NOBODY; i++) {
      const move = chooseMove(one.state, "normal", random);
      const seat = one.toMove;
      expect(one.push(move, seat)).not.toBeNull();
      expect(two.push(move, seat)).not.toBeNull();
    }
    expect(one.state).toEqual(two.state);
    expect(one.ply).toBeGreaterThan(30);
    // A different seed lays a different map.
    expect(new Match(hexRules, { ...start, seed: 1 }).state.world).not.toEqual(new Match(hexRules, start).state.world);
  });

  test("hex conquest for three on three devices: each moves its own nation and all boards agree", async () => {
    const { host, guests } = await room(hexRules, HEX_SEATS(), ["민수", "지아"], "hex-conquest");
    // 청국 the host, 홍국 and 황국 the guests; 흑국 left empty (closed at the start).
    expect(host.seats.map((s) => s.kind)).toEqual(["person", "person", "person", "open"]);
    expect(host.startProblem()).toBeNull();
    host.begin();
    await settle();
    expect(host.seats[3].kind).toBe("closed");
    const devices = [host, ...guests.map((g) => g.room)];
    for (const d of devices) expect(d.match!.state).toEqual(host.match!.state);
    // Only the host chooses the map and starts; a guest is refused.
    expect(guests[0].room.play({ from: -1, to: START, extra: -1 })).toBe("방장이 고르는 차례입니다.");
    // A capital tap in setup would change the seating: a room does not allow it.
    expect(host.play({ from: -1, to: 1010, extra: -1 }, HOST_ONLY)).toContain("방에서 정했습니다");
    expect(host.play({ from: -1, to: NEW_MAP, extra: -1 }, HOST_ONLY)).toBeNull();
    expect(host.play({ from: -1, to: START, extra: -1 }, HOST_ONLY)).toBeNull();
    await settle();
    const random = streamFor(11, 3);
    let moves = 0;
    while (host.match!.toMove !== NOBODY && moves < 150) {
      const seat = host.match!.toMove,
        device = devices.find((d) => d.mySeat === seat)!;
      const s = device.match!.state as HexState;
      const move = chooseMove(s, "easy", random);
      // Out of turn, another device is refused.
      const other = devices.find((d) => d.mySeat !== seat && !d.host) as GuestRoom<HexState> | undefined;
      if (other && moves % 25 === 0) expect(other.play(move)).toBe("상대 차례입니다.");
      expect(device.host ? (device as HostRoom<HexState>).play(move, seat) : (device as GuestRoom<HexState>).play(move)).toBeNull();
      await settle();
      moves++;
    }
    expect(moves).toBeGreaterThan(40);
    for (const d of devices) {
      expect(d.match!.ply).toBe(host.match!.ply);
      expect(d.match!.state).toEqual(host.match!.state);
    }
    // The order of play went round the three nations seated, never the empty corner.
    const seats = new Set(host.match!.moves.filter((m) => m.seat >= 0).map((m) => m.seat));
    expect([...seats].sort()).toEqual([0, 1, 2]);
  });

  test("a resync rebuilds the same state from the move list alone", () => {
    const start = { round: 1, variant: "", options: {}, seed: 4242, seats: [{ kind: "person" as const, person: "a" }, { kind: "person" as const, person: "b" }, { kind: "closed" as const, person: null }, { kind: "closed" as const, person: null }] };
    const live = new Match(hexRules, start);
    live.push({ from: -1, to: NEW_MAP, extra: -1 }, HOST_ONLY);
    live.push({ from: -1, to: START, extra: -1 }, HOST_ONLY);
    const random = streamFor(3, 3);
    for (let i = 0; i < 60 && live.toMove !== NOBODY; i++) live.push(chooseMove(live.state, "normal", random), live.toMove);
    const rebuilt = new Match(hexRules, start);
    expect(rebuilt.replay(live.moves)).toBe(true);
    expect(rebuilt.state).toEqual(live.state);
    // Taken back to a seat's last move, the list replays to the state before it.
    const seat = live.moves.at(-1)!.seat,
      length = live.undoFor(seat)!;
    const shorter = new Match(hexRules, start);
    shorter.replay(live.moves.slice(0, length));
    live.truncate(length);
    expect(live.state).toEqual(shorter.state);
    // Tic-tac-toe too.
    const ttt = new Match(tttRules, { ...start, seats: [] });
    for (const cell of [4, 0, 8, 2]) ttt.push(at(cell), ttt.toMove);
    const again = new Match(tttRules, { ...start, seats: [] });
    again.replay(ttt.moves);
    expect(again.state).toEqual(ttt.state);
  });
});
