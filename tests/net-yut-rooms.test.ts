import { describe, expect, test } from "vitest";
import { NOBODY } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks, type Link } from "../src/net/room";
import type { SeatInfo } from "../src/net/protocol";
import { yutMove, yutNet, yutThrow, type Seated } from "../src/net/screens";
import * as yut from "../src/games/yut/rules";
import { choose } from "../src/games/yut/ai";

/*
 * 윷놀이 over one Wi-Fi with up to four devices (the user asked for its connections to be checked): rooms of simulated
 * devices joined by memory links. Devices join, take seats, start, play; one drops (the host's computer plays its seat
 * meanwhile) and comes back; 새 게임 is asked of everyone; the host leaves. Every connected device must hold the host's
 * list and state after each step.
 */
type S = Seated<yut.State>;
const settle = async () => {
  for (let i = 0; i < 80; i++) await Promise.resolve();
};
const seats = (): SeatInfo[] => yutNet.seats.map((s) => ({ ...s, kind: "open", person: null }));
const pick = (s: S) => {
  if (s.game.throwsLeft > 0) return yutThrow();
  const m = choose(s.game) ?? yut.moves(s.game)[0];
  return yutMove(m.piece, m.result);
};

async function room(names: string[]) {
  const host = new HostRoom<S>({ game: yutNet.game, title: "윷놀이", name: "방장", variant: "", options: {}, seats: seats(), quiet: true }, yutNet, "host");
  const guests = names.map((name, i) => new GuestRoom<S>({ game: yutNet.game, title: "윷놀이", name, quiet: true }, yutNet, `g${i}`));
  const links: Link[] = [];
  const join = (g: GuestRoom<S>) => {
    const [a, b] = memoryLinks();
    host.connect(a);
    g.connect(b);
    links[guests.indexOf(g)] = a;
  };
  /** A channel lost (the Wi-Fi dropped, the page went away): both ends hear it close. */
  const drop = (k: number) => {
    const end = links[k],
      heard = end.onclose;
    end.close();
    heard?.();
  };
  for (const g of guests) {
    join(g);
    await settle();
  }
  const all = () => [host, ...guests];
  const same = () => {
    for (const g of guests) {
      if (!g.online) continue;
      expect(g.seats).toEqual(host.seats);
      expect(g.match?.moves).toEqual(host.match?.moves);
      expect(g.match?.state).toEqual(host.match?.state);
    }
  };
  /** One move by whoever plays the seat to move: its own device, or the host's computer for a computer's or a dropped seat. */
  const step = async () => {
    const m = host.match!,
      seat = m.toMove;
    if (seat === NOBODY) return false;
    const s = host.seats[seat],
      device = s.kind === "person" && !host.away(seat) ? all().find((r) => r.me === s.person)! : host;
    const text = device === host ? host.play(pick(m.state), seat) : (device as GuestRoom<S>).play(pick((device as GuestRoom<S>).match!.state));
    expect(text).toBeNull();
    await settle();
    return true;
  };
  return { host, guests, join, drop, same, step, all };
}

describe("윷놀이 over Wi-Fi, two to four devices", () => {
  test("a third and fourth device join, take the next seats and all start the same game; every move reaches every device", async () => {
    const r = await room(["민수", "지아", "하늘"]);
    expect(r.host.seats.map((s) => s.kind)).toEqual(["person", "person", "person", "person"]);
    expect([0, 1, 2, 3].map((k) => r.host.nameOf(k))).toEqual(["나", "민수", "지아", "하늘"]);
    expect(r.host.startProblem(2)).toBeNull();
    r.host.begin();
    await settle();
    for (const g of r.guests) expect(g.match?.state.seats).toEqual([0, 1, 2, 3]);
    r.same();
    for (let i = 0; i < 120 && (await r.step()); i++) r.same();
    expect(r.host.match!.ply).toBeGreaterThan(60);
  });

  test("three devices with the fourth seat closed: a game of three, in seat order", async () => {
    const r = await room(["민수", "지아"]);
    r.host.setKind(3, "closed");
    await settle();
    r.host.begin();
    await settle();
    expect(r.host.match!.state.seats).toEqual([0, 1, 2]);
    for (let i = 0; i < 80 && (await r.step()); i++) r.same();
  });

  test("a device drops mid-game: the host's computer plays its seat; it comes back to the same game and the same seat", async () => {
    const r = await room(["민수", "지아", "하늘"]);
    r.host.begin();
    await settle();
    for (let i = 0; i < 20; i++) await r.step();
    const gone = r.guests[1];
    r.drop(1);
    await settle();
    expect(gone.online).toBe(false);
    expect(r.host.away(2)).toBe(true);
    for (const g of [r.guests[0], r.guests[2]]) expect(g.away(2)).toBe(true);
    // Its seat is played by the host's computer meanwhile; the others still agree.
    for (let i = 0; i < 40; i++) {
      await r.step();
      r.same();
    }
    // Back by a new channel: let in as the same person, the game sent whole, the seat its own again.
    r.join(gone);
    await settle();
    expect(gone.online).toBe(true);
    expect(r.host.away(2)).toBe(false);
    expect(gone.mySeat).toBe(2);
    r.same();
    for (let i = 0; i < 40 && (await r.step()); i++) r.same();
  });

  test("새 게임 is asked of everyone seated: all agree and every device starts the next round together; one refusal drops it", async () => {
    const r = await room(["민수", "지아", "하늘"]);
    r.host.begin();
    await settle();
    for (let i = 0; i < 10; i++) await r.step();
    const asker = r.guests[0];
    expect(asker.request("new")).toBeNull();
    await settle();
    for (const room of r.all()) expect(room.pending?.kind).toBe("new");
    expect(asker.mustAnswer).toBe(false);
    // One says no: dropped on every device.
    const id = r.host.pending!.id;
    r.guests[2].answer(id, false);
    await settle();
    for (const room of r.all()) expect(room.pending).toBeNull();
    // Asked again, everyone says yes: round two on every device.
    expect(asker.request("new")).toBeNull();
    await settle();
    const again = r.host.pending!.id;
    r.host.answer(again, true);
    r.guests[1].answer(again, true);
    r.guests[2].answer(again, true);
    await settle();
    for (const room of r.all()) {
      expect(room.pending).toBeNull();
      expect(room.match!.ply).toBe(0);
    }
    for (const g of r.guests) expect(g.start?.round).toBe(2);
    r.same();
  });

  test("a request whose asker drops is called off on every device", async () => {
    const r = await room(["민수", "지아"]);
    r.host.begin();
    await settle();
    expect(r.guests[1].request("new")).toBeNull();
    await settle();
    r.drop(1);
    await settle();
    for (const room of [r.host, r.guests[0]]) expect(room.pending).toBeNull();
  });

  test("the host leaving ends the room for every device, which is told so", async () => {
    const r = await room(["민수", "지아", "하늘"]);
    r.host.begin();
    await settle();
    const told: string[] = [];
    for (const g of r.guests) g.events.lost = (reason) => told.push(reason);
    r.host.leave();
    await settle();
    for (const g of r.guests) {
      expect(g.online).toBe(false);
      expect(g.hostLeft).toBe(true);
    }
    expect(told.length).toBe(3);
  });
});
