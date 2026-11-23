import { describe, expect, test } from "vitest";
import { Lan, LAN_PORT, ROOM_SCHEME, adLine, adOf, joinProblem, readRoomCode, roomCode, typedAddress, type LanBridge, type LanEvent, type LanSelf } from "../src/net/lan";
import { qrModules, qrPixels, readQr } from "../src/net/qr";
import { codeProblem } from "../src/net/sdp";
import { APP_VERSION, PROTOCOL, type SeatInfo } from "../src/net/protocol";
import { GuestRoom, HostRoom } from "../src/net/room";
import type { NetRules } from "../src/net/match";
import { pointRules } from "../src/net/points";
import { chessMove, chessNet } from "../src/net/boards";
import { tictactoe as ticTacToe } from "../src/games/tictactoe/rules";
import type { Action } from "../src/games/chess/rules";
import type { Move, PointGame } from "../src/games/points/types";

/*
 * Wi-Fi play inside the Android app, against a fake of the app's bridge: one simulated Wi-Fi on which each fake app
 * announces its room (as NsdManager would), finds the others' rooms and opens connections that carry lines both
 * ways, every event delivered a moment later as the app's `evaluateJavascript` would.
 */
const settle = async () => {
  for (let i = 0; i < 60; i++) await Promise.resolve();
};
const SELF: LanSelf = { app: APP_VERSION, edition: "full" };

interface Service {
  name: string;
  address: string;
  port: number;
  attrs: Record<string, string>;
  owner: FakeApp;
}
class FakeWifi {
  services = new Map<string, Service>();
  apps: FakeApp[] = [];
  app(ip: string, self = SELF) {
    const app = new FakeApp(this, ip);
    app.lan = new Lan(app, self);
    this.apps.push(app);
    return app;
  }
  announce(service: Service) {
    const was = this.services.has(service.name);
    this.services.set(service.name, service);
    for (const app of this.apps)
      if (app.finding) {
        // A changed announcement is a re-registration: lost, then found with the new attributes.
        if (was) app.emit({ e: "lost", name: service.name });
        app.emit({ e: "found", name: service.name, address: service.address, port: service.port, attrs: service.attrs });
      }
  }
  withdraw(name: string) {
    if (!this.services.delete(name)) return;
    for (const app of this.apps) if (app.finding) app.emit({ e: "lost", name });
  }
}
let peers = 0;
class FakeApp implements LanBridge {
  lan!: Lan;
  finding = false;
  hosting: { name: string; port: number } | null = null;
  sockets = new Map<string, { other: FakeApp; peer: string; accepted: boolean }>();
  calls: string[] = [];
  constructor(
    readonly wifi: FakeWifi,
    readonly ip: string,
  ) {}
  emit(event: LanEvent) {
    queueMicrotask(() => this.lan.receive(event));
  }
  available() {
    return true;
  }
  host(info: string) {
    const { id, attrs } = JSON.parse(info);
    this.hosting = { name: `wtg-${id}`, port: LAN_PORT };
    this.emit({ e: "hosting", address: this.ip, port: LAN_PORT });
    this.wifi.announce({ name: this.hosting.name, address: this.ip, port: LAN_PORT, attrs: { ...attrs, a: `${this.ip}:${LAN_PORT}` }, owner: this });
  }
  update(attrs: string) {
    this.calls.push("update");
    if (this.hosting) this.wifi.announce({ name: this.hosting.name, address: this.ip, port: LAN_PORT, attrs: { ...JSON.parse(attrs), a: `${this.ip}:${LAN_PORT}` }, owner: this });
  }
  stopHost() {
    this.calls.push("stopHost");
    if (!this.hosting) return;
    this.wifi.withdraw(this.hosting.name);
    this.hosting = null;
    for (const [peer, s] of this.sockets) if (s.accepted) this.close(peer);
  }
  discover() {
    this.finding = true;
    for (const s of this.wifi.services.values()) this.emit({ e: "found", name: s.name, address: s.address, port: s.port, attrs: s.attrs });
  }
  stopDiscover() {
    this.finding = false;
  }
  connect(address: string) {
    const id = `c${++peers}`,
      target = this.wifi.apps.find((a) => a.hosting && `${a.ip}:${a.hosting.port}` === address);
    if (!target) {
      this.emit({ e: "fail", peer: id, text: "그 주소에 열린 방이 없습니다" });
      return id;
    }
    const theirs = `h${++peers}`;
    this.sockets.set(id, { other: target, peer: theirs, accepted: false });
    target.sockets.set(theirs, { other: this, peer: id, accepted: true });
    target.emit({ e: "incoming", peer: theirs, from: this.ip });
    this.emit({ e: "open", peer: id });
    return id;
  }
  send(peer: string, text: string) {
    const s = this.sockets.get(peer);
    if (!s) return false;
    s.other.emit({ e: "message", peer: s.peer, text });
    return true;
  }
  close(peer: string) {
    const s = this.sockets.get(peer);
    if (!s) return;
    this.sockets.delete(peer);
    s.other.sockets.delete(s.peer);
    s.other.emit({ e: "close", peer: s.peer });
  }
  /** The Wi-Fi went for a moment: every connection of this app ends, at both ends. */
  dropWifi() {
    for (const [peer, s] of [...this.sockets]) {
      this.sockets.delete(peer);
      s.other.sockets.delete(s.peer);
      s.other.emit({ e: "close", peer: s.peer });
      this.emit({ e: "close", peer });
    }
  }
}

const TTT_SEATS: SeatInfo[] = [
  { label: "X", color: "#000", kind: "open", person: null, kinds: ["computer"] },
  { label: "O", color: "#fff", kind: "open", person: null, kinds: ["computer"] },
];
type T = ReturnType<typeof ticTacToe.create>;
const tttRules = pointRules(ticTacToe as PointGame<T>, {});
const at = (cell: number): Move => ({ from: -1, to: cell, extra: -1 });

/** A host app with its room open on the Wi-Fi, and a guest app looking for rooms. */
async function wifiRoom<S>(rules: NetRules<S>, game: string, title: string, seats: SeatInfo[]) {
  const wifi = new FakeWifi(),
    hostApp = wifi.app("192.168.0.12"),
    guestApp = wifi.app("192.168.0.23");
  const host = new HostRoom<S>({ game, title, name: "민수", variant: "classic", options: {}, seats, quiet: true }, rules, "hostid");
  hostApp.lan.host(host as HostRoom<unknown>);
  const stop = guestApp.lan.find();
  await settle();
  const guest = new GuestRoom<S>({ game, title, name: "지아", quiet: true }, rules, "guestid");
  return { wifi, hostApp, guestApp, host, guest, stop };
}

describe("rooms announced on the Wi-Fi", () => {
  test("the host's room is listed with its title, game and people, and joined with one tap", async () => {
    const { hostApp, guestApp, host, guest } = await wifiRoom(tttRules, "tic-tac-toe", "틱택토", TTT_SEATS);
    expect(hostApp.lan.address).toBe(`192.168.0.12:${LAN_PORT}`);
    const rooms = guestApp.lan.list("tic-tac-toe");
    expect(rooms).toHaveLength(1);
    expect(adLine(rooms[0])).toBe("민수의 방 · 틱택토 · 1/2명");
    expect(joinProblem(rooms[0], SELF, "tic-tac-toe")).toBeNull();
    // The tap: a connection to the room's address, and the room's own hello.
    guest.connect(await guestApp.lan.dial(rooms[0].address));
    await settle();
    expect(guest.online).toBe(true);
    expect(guest.hostName).toBe("민수");
    expect(guest.mySeat).toBe(1);
    expect(host.people.map((p) => p.name)).toEqual(["민수", "지아"]);
    // The announcement follows the room: two people now, then a game under way.
    expect(adLine(guestApp.lan.list("tic-tac-toe")[0])).toBe("민수의 방 · 틱택토 · 2/2명");
    host.begin();
    await settle();
    expect(guestApp.lan.list("tic-tac-toe")[0].playing).toBe(true);
    expect(adLine(guestApp.lan.list("tic-tac-toe")[0])).toContain("게임 중");
    // Nothing changed, nothing re-announced.
    const updates = hostApp.calls.filter((c) => c === "update").length;
    expect(host.request("undo")).toBe("아직 무를 수가 없습니다.");
    await settle();
    expect(hostApp.calls.filter((c) => c === "update").length).toBe(updates);
  });

  test("tic-tac-toe is played over the app's connection; a dropped guest taps the room again and is back in its seat", async () => {
    const { guestApp, host, guest } = await wifiRoom(tttRules, "tic-tac-toe", "틱택토", TTT_SEATS);
    guest.connect(await guestApp.lan.dial(guestApp.lan.list("tic-tac-toe")[0].address));
    await settle();
    host.begin();
    await settle();
    expect(host.play(at(4), 0)).toBeNull();
    await settle();
    expect(guest.play(at(4))).toBe("둘 수 없는 수입니다.");
    expect(guest.play(at(0))).toBeNull();
    await settle();
    expect(host.play(at(8), 0)).toBeNull();
    await settle();
    expect(guest.match!.moves).toEqual(host.match!.moves);
    expect(guest.match!.ply).toBe(3);

    // The Wi-Fi drops: the host sees the seat away, the guest is told.
    guestApp.dropWifi();
    await settle();
    expect(guest.online).toBe(false);
    expect(host.away(1)).toBe(true);
    // The host's room is still in the list, marked as the guest's own (by the host's id), and a move made meanwhile
    // (the host's computer standing in would make one) is caught up on return.
    const ad = guestApp.lan.list("tic-tac-toe")[0];
    expect(ad.id).toBe(host.me);
    expect(ad.people).toBe(1);
    expect(host.play(at(2), 1)).toBeNull();
    guest.connect(await guestApp.lan.dial(ad.address));
    await settle();
    expect(guest.online).toBe(true);
    expect(guest.mySeat).toBe(1);
    expect(host.away(1)).toBe(false);
    expect(host.people).toHaveLength(2);
    expect(guest.match!.moves).toEqual(host.match!.moves);
    expect(guest.match!.ply).toBe(4);
    expect(host.play(at(6), 0)).toBeNull();
    await settle();
    expect(guest.match!.state).toEqual(host.match!.state);
  });

  test("chess over the app's connection: both boards agree, a drop and a return keep the game", async () => {
    const seats: SeatInfo[] = chessNet.seats.map((s) => ({ ...s, kind: "open", person: null }));
    const { guestApp, host, guest } = await wifiRoom(chessNet, "chess", "체스", seats);
    const ad = guestApp.lan.list("chess")[0];
    expect(adLine(ad)).toBe("민수의 방 · 체스 · 1/2명");
    guest.connect(await guestApp.lan.dial(ad.address));
    await settle();
    host.begin();
    await settle();
    const line: Action[] = [
      { from: "e2", to: "e4" },
      { from: "e7", to: "e5" },
      { from: "g1", to: "f3" },
      { from: "b8", to: "c6" },
    ];
    for (const [i, a] of line.entries()) {
      expect(i % 2 ? guest.play(chessMove(a)) : host.play(chessMove(a), 0)).toBeNull();
      await settle();
    }
    expect(guest.match!.state).toEqual(host.match!.state);
    guestApp.dropWifi();
    await settle();
    guest.connect(await guestApp.lan.dial(guestApp.lan.list("chess")[0].address));
    await settle();
    expect(guest.mySeat).toBe(1);
    expect(host.play(chessMove({ from: "f1", to: "c4" }), 0)).toBeNull();
    await settle();
    expect(guest.play(chessMove({ from: "g8", to: "f6" }))).toBeNull();
    await settle();
    expect(guest.match!.ply).toBe(6);
    expect(guest.match!.state).toEqual(host.match!.state);
  });

  test("the room closes with its host: the announcement goes and the guest is told", async () => {
    const { hostApp, guestApp, host, guest } = await wifiRoom(tttRules, "tic-tac-toe", "틱택토", TTT_SEATS);
    guest.connect(await guestApp.lan.dial(guestApp.lan.list("tic-tac-toe")[0].address));
    await settle();
    host.leave();
    await settle();
    expect(hostApp.calls).toContain("stopHost");
    expect(hostApp.lan.hosted).toBeNull();
    expect(guestApp.lan.list("tic-tac-toe")).toHaveLength(0);
    expect(guest.online).toBe(false);
    expect(guest.dismissed).toBe(true);
    // A connection to a room that is gone fails with words.
    await expect(guestApp.lan.dial(`192.168.0.12:${LAN_PORT}`)).rejects.toThrow("열린 방이 없습니다");
  });

  test("rooms of another version, edition or game are listed greyed and cannot be joined", () => {
    const lan = new Lan(new FakeWifi().app("10.0.0.2"), SELF);
    const found = (name: string, attrs: Record<string, string>): LanEvent => ({
      e: "found",
      name,
      address: "10.0.0.9",
      port: LAN_PORT,
      attrs: { wtg: String(PROTOCOL), app: APP_VERSION, ed: "full", g: "chess", t: "체스", n: "하늘", id: name, p: "1", s: "2", on: "0", ...attrs },
    });
    lan.receive(found("a", {}));
    lan.receive(found("b", { app: "2025.01-old" }));
    lan.receive(found("c", { ed: "student" }));
    lan.receive(found("d", { g: "gomoku", t: "오목" }));
    lan.receive(found("e", { wtg: "0" }));
    // Something else on the Wi-Fi with the same type but none of our attributes.
    lan.receive({ e: "found", name: "x", address: "10.0.0.8", port: 1, attrs: {} });
    const rooms = lan.list("chess");
    expect(rooms.map((r) => r.name)).toEqual(["a", "b", "c", "e", "d"]);
    expect(rooms.map((r) => joinProblem(r, SELF, "chess"))).toEqual([null, "버전이 다릅니다", "버전이 다릅니다 (학생용 앱)", "버전이 다릅니다", "다른 게임: 오목"]);
    // The address from the announcement's own attribute where it gives one, else the resolved host and port.
    expect(adOf({ e: "found", name: "z", address: "fe80::1", port: 5, attrs: { app: "x", g: "chess", id: "z", a: "192.168.0.5:47297" } })!.address).toBe("192.168.0.5:47297");
    expect(rooms[0].address).toBe(`10.0.0.9:${LAN_PORT}`);
    lan.receive({ e: "lost", name: "a" });
    expect(lan.list("chess").map((r) => r.name)).not.toContain("a");
  });

  test("a typed address takes the default port, and words say what is wrong", () => {
    expect(typedAddress(" 192.168.0.12 ")).toEqual({ address: `192.168.0.12:${LAN_PORT}` });
    expect(typedAddress("192.168.0.12:5000")).toEqual({ address: "192.168.0.12:5000" });
    expect("text" in typedAddress("")).toBe(true);
    expect("text" in typedAddress("192.168.0.300")).toBe(true);
    expect("text" in typedAddress("192.168.0.12:99999")).toBe(true);
    expect("text" in typedAddress("http://192.168.0.12")).toBe(true);
  });

  test("a device that is not hosting refuses a connection; one that finds stops when every finder stops", async () => {
    const app = new FakeWifi().app("10.0.0.2");
    const closed: string[] = [];
    app.close = (peer) => void closed.push(peer);
    app.lan.receive({ e: "incoming", peer: "h1", from: "10.0.0.3" });
    expect(closed).toEqual(["h1"]);
    const a = app.lan.find(),
      b = app.lan.find();
    a();
    expect(app.finding).toBe(true);
    b();
    expect(app.finding).toBe(false);
  });
});

describe("the room's QR code (QR 찍기)", () => {
  const at = `192.168.0.12:${LAN_PORT}`;
  test("holds the address, game, edition and version, in capitals, and reads back in any case", () => {
    const code = roomCode(at, SELF, "tic-tac-toe");
    expect(code).toBe(`${ROOM_SCHEME}192.168.0.12:${LAN_PORT}/TIC-TAC-TOE/FULL/${PROTOCOL}/${APP_VERSION.toUpperCase()}`);
    expect(readRoomCode(code)).toEqual({ address: at, game: "tic-tac-toe", edition: "full", protocol: PROTOCOL, app: APP_VERSION.toUpperCase() });
    expect(readRoomCode(` ${code.toLowerCase()}\n`)?.game).toBe("tic-tac-toe");
    // Morris's id has an apostrophe: the code is written in bytes, and still read.
    expect(readRoomCode(roomCode(at, SELF, "nine-men's-morris"))?.game).toBe("nine-men's-morris");
    // Small enough for a phone across the table: the alphanumeric code is a version 3 symbol (29 modules).
    expect(qrModules(code).length).toBeLessThanOrEqual(29);
  });

  test("survives a round trip through a QR picture", () => {
    const code = roomCode(at, SELF, "chess"),
      image = qrPixels(code, 4);
    expect(readRoomCode(readQr(image.data, image.width, image.height)!)).toEqual(readRoomCode(code));
  });

  test("anything else is not a room's code: the QR way's codes, a bare address, a bad address", () => {
    expect(readRoomCode("WTG1ABC.DEF")).toBeNull();
    expect(readRoomCode(at)).toBeNull();
    expect(readRoomCode("WTGROOM://192.168.0.300:47297/CHESS/FULL/1/X")).toBeNull();
    expect(readRoomCode("WTGROOM://192.168.0.12:47297/CHESS/FULL")).toBeNull();
    expect(readRoomCode("https://example.com/")).toBeNull();
    // And the QR way does not take a room's code for one of its own.
    expect(codeProblem(roomCode(at, SELF, "chess"))).not.toBeNull();
  });

  test("is checked as a room in the list is: another game, version or edition is refused with words", () => {
    const check = (code: string, game = "tic-tac-toe", title = "오목") => joinProblem({ ...readRoomCode(code)!, title }, SELF, game);
    expect(check(roomCode(at, SELF, "tic-tac-toe"))).toBeNull();
    expect(check(roomCode(at, SELF, "gomoku"))).toBe("다른 게임: 오목");
    expect(check(roomCode(at, { ...SELF, app: "2025.01-old" }, "tic-tac-toe"))).toBe("버전이 다릅니다");
    expect(check(roomCode(at, { ...SELF, edition: "student" }, "tic-tac-toe"))).toBe("버전이 다릅니다 (학생용 앱)");
    expect(check(roomCode(at, SELF, "tic-tac-toe").replace(`/${PROTOCOL}/`, `/${PROTOCOL + 1}/`))).toBe("버전이 다릅니다");
  });
});
