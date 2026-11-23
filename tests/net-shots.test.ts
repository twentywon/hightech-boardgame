import { describe, expect, test } from "vitest";
import { decode, encode, type SeatInfo, type StartInfo } from "../src/net/protocol";
import { Match, NOBODY, type NetRules } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks, type Link } from "../src/net/room";
import { streamFor } from "../src/net/random";
import { pointRules } from "../src/net/points";
import { adopt, alike, merge } from "../src/net/settled";
import type { PointConfig } from "../src/ui/point-game";
import type { Move } from "../src/games/points/types";
import { alkkagiConfig } from "../src/games/alkkagi/config";
import { carromConfig } from "../src/games/carrom/config";
import { curlingConfig } from "../src/games/curling/config";
import { poolConfig } from "../src/games/pool/config";
import { caromConfig } from "../src/games/carom/config";
import { dartsConfig } from "../src/games/darts/config";
import { bowlingConfig } from "../src/games/bowling/config";
import { archeryConfig } from "../src/games/archery/config";
import { minigolfConfig } from "../src/games/minigolf/config";
import { tuhoConfig } from "../src/games/tuho/config";
import { SPIN, STONE, type State as CurlingState } from "../src/games/curling/rules";
import { shotCode } from "../src/games/flick/physics";

/*
 * 와이파이 여럿이 for the shot games: simulated devices joined by links in memory, each shooting only its own side. A
 * shot's physics runs in floating point, so the host's state after each shot goes with it (`settled`) and every
 * device takes it: here a guest whose own physics is made to end a hair apart (as another engine's might) still
 * agrees with the host to the last bit after every shot, and the chance of a shot (a computer's scatter, the winds,
 * the pinsetter) is drawn from the host's salted stream.
 */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
type AnyConfig = PointConfig<any>;
const GAMES: [string, AnyConfig, string][] = [
  ["alkkagi", alkkagiConfig, "go-5"],
  ["carrom", carromConfig, ""],
  ["curling", curlingConfig, "3"],
  ["pool", poolConfig, ""],
  ["carom", caromConfig, "four"],
  ["darts", dartsConfig, "countup"],
  ["bowling", bowlingConfig, "duel"],
  ["archery", archeryConfig, "match"],
  ["minigolf", minigolfConfig, "duel"],
  ["tuho", tuhoConfig, ""],
];
const rulesOf = <S>(config: PointConfig<S>): NetRules<S> => pointRules(config.game, config.net!);
function seatsOf<S>(config: PointConfig<S>, variant: string): SeatInfo[] {
  const colors = config.colorsOf?.(variant) ?? config.colors!,
    names = config.sidesOf?.(variant) ?? config.sides;
  return [0, 1].map((p) => ({ label: names[p], color: colors[p], kind: "open" as const, person: null, kinds: ["computer" as const] }));
}
/** Every number that is not whole moved by a hair, as another engine's rounding might end it. */
function jitter<T>(value: T): T {
  if (typeof value === "number") return (Number.isInteger(value) ? value : value + 1e-9 * Math.sign(value || 1)) as T;
  if (Array.isArray(value)) return value.map(jitter) as T;
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, jitter(v)])) as T;
  return value;
}
/** The rules as a device whose floating point ends a hair apart plays them. */
const drifting = <S>(rules: NetRules<S>): NetRules<S> => ({ ...rules, play: (s, m, r) => {
  const next = rules.play(s, m, r);
  return next && jitter(next);
} });
async function room<S>(config: PointConfig<S>, variant: string, guestRules = rulesOf(config)) {
  const rules = rulesOf(config),
    host = new HostRoom({ game: "g", title: "g", name: "방장", variant, options: {}, seats: seatsOf(config, variant), quiet: true }, rules, "host"),
    guest = new GuestRoom<S>({ game: "g", title: "g", name: "민수", quiet: true }, guestRules, "guest");
  const [a, b] = memoryLinks();
  host.connect(a);
  guest.connect(b);
  await settle();
  return { host, guest, link: b };
}
type Device<S> = HostRoom<S> | GuestRoom<S>;
/** Each side's device shoots the computer's shot for its own copy of the game; the host's computer plays computer seats. */
async function playOut<S>(config: PointConfig<S>, host: HostRoom<S>, devices: Device<S>[], most: number, check: () => void = () => {}) {
  let plies = 0;
  while (host.match!.toMove !== NOBODY && plies < most) {
    const seat = host.match!.toMove,
      device = host.seats[seat].kind === "computer" || host.away(seat) ? host : devices.find((d) => d.mySeat === seat)!,
      move = config.game.choose!(device.match!.state, "normal", streamFor(91, plies))!;
    expect(move).not.toBeNull();
    const text = device.host ? (device as HostRoom<S>).play(move, seat) : (device as GuestRoom<S>).play(move);
    expect(text).toBeNull();
    await settle();
    check();
    plies++;
  }
  return plies;
}

describe("the host's settled state", () => {
  test("alike reads values as JSON does; merge keeps what agrees and takes the host's where it differs", () => {
    expect(alike({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(alike([1, 2], [1, 2.0000001])).toBe(false);
    const mine = { last: { code: 3 }, discs: [{ x: 1, z: 2 }, { x: 3, z: 4 }], n: 1 },
      told = JSON.parse(JSON.stringify({ ...mine, discs: [{ x: 1, z: 2 }, { x: 3.0000001, z: 4 }] }));
    const merged = merge(mine, told);
    expect(merged).toEqual(told);
    expect(merged.last).toBe(mine.last);
    expect(merged.discs[0]).toBe(mine.discs[0]);
    expect(merged.discs[1]).not.toBe(mine.discs[1]);
    // What agrees throughout is my own object; a state of another shape is not taken; a move my play refused takes the host's.
    expect(merge(mine, JSON.parse(JSON.stringify(mine)))).toBe(mine);
    expect(adopt(mine, { other: 1 }, mine)).toBe(mine);
    expect(adopt(null, told, mine)).toEqual(told);
  });

  test("a move and a resync carry the state, read back as sent; a list where a state should be is not read", () => {
    const text = encode({ t: "move", round: 1, ply: 0, move: { from: 1, to: 2, extra: -1 }, seat: 0, salt: 5, settled: { a: [1.5, 2] } });
    expect(decode(text)).toMatchObject({ settled: { a: [1.5, 2] } });
    expect(decode(text.replace('{"a":[1.5,2]}', "[1]"))).toBeNull();
    const live = encode({ t: "live", round: 1, ply: 3, move: { from: 100, to: 7, extra: 4 }, seat: 1 });
    expect(decode(live)).toMatchObject({ t: "live", ply: 3, seat: 1 });
    expect(decode(live.replace('"ply":3', '"ply":-1'))).toBeNull();
  });
});

describe.each(GAMES)("%s over Wi-Fi", (name, config, variant) => {
  test("for two, both seats may be a computer's; every state of a game reads back the same through JSON, and stays small", () => {
    expect(config.net?.settled).toBe(true);
    const rules = rulesOf(config),
      start: StartInfo = { round: 1, variant, options: {}, seed: 4242, seats: [{ kind: "person", person: "a" }, { kind: "person", person: "b" }] },
      match = new Match(rules, start);
    let largest = 0;
    for (let k = 0; k < 30 && match.toMove !== NOBODY; k++) {
      const move = config.game.choose!(match.state, "normal", streamFor(7, k))!;
      expect(match.push(move, match.toMove, (k * 2654435761) >>> 0 || 1)).not.toBeNull();
      const text = JSON.stringify(match.state);
      largest = Math.max(largest, text.length);
      expect(alike(JSON.parse(text), match.state)).toBe(true);
    }
    expect(largest).toBeLessThan(48000);
  }, 90000);

  test("two devices, the guest's physics a hair apart: after every shot both hold the host's state to the last bit", async () => {
    const { host, guest } = await room(config, variant, drifting(rulesOf(config)));
    host.begin();
    await settle();
    expect(guest.match!.state).toEqual(host.match!.state);
    const plies = await playOut(config, host, [host, guest], name === "darts" || name === "archery" ? 24 : 12, () => {
      expect(alike(guest.match!.state, host.match!.state)).toBe(true);
      expect(guest.match!.ply).toBe(host.match!.ply);
    });
    expect(plies).toBeGreaterThan(5);
    // Both seats shot.
    expect(new Set(host.match!.moves.map((m) => m.seat))).toEqual(new Set([0, 1]));
    // Without the host's word the drifting guest would have parted from it.
    const alone = new Match(drifting(rulesOf(config)), host.match!.start);
    alone.replay(host.match!.moves);
    expect(alike(alone.state, host.match!.state)).toBe(false);
  }, 90000);

  test("a guest who drops is played by the host's computer and comes back to the host's very state", async () => {
    const { host, guest, link } = await room(config, variant, drifting(rulesOf(config)));
    host.begin();
    await settle();
    await playOut(config, host, [host, guest], 4);
    link.close();
    await settle();
    expect(host.away(1)).toBe(true);
    // The host's device plays both seats now.
    await playOut(config, host, [host], 6);
    const [a, b] = memoryLinks();
    host.connect(a);
    guest.connect(b);
    await settle();
    expect(host.away(1)).toBe(false);
    expect(guest.match!.ply).toBe(host.match!.ply);
    expect(alike(guest.match!.state, host.match!.state)).toBe(true);
  }, 90000);
});

describe("chance and real-time inputs over Wi-Fi", () => {
  test("a computer's dart scatters by the host's salt: the guest lands it where the host did", async () => {
    const { host, guest } = await room(dartsConfig, "countup");
    host.setKind(1, "computer");
    host.begin();
    await settle();
    // The host throws, then its computer throws for seat 1.
    await playOut(dartsConfig, host, [host, guest], 9);
    const computer = host.match!.moves.filter((m) => m.seat === 1);
    expect(computer.length).toBeGreaterThan(0);
    expect(computer.every((m) => m.move.extra > 0 && (m.salt ?? 0) > 0)).toBe(true);
    expect(guest.match!.state).toEqual(host.match!.state);
  });

  test("the archery winds of a room are drawn from its shared seed, the same on every device", async () => {
    const { host, guest } = await room(archeryConfig, "match");
    host.begin();
    await settle();
    expect(guest.match!.state.winds).toEqual(host.match!.state.winds);
    const other = new Match(rulesOf(archeryConfig), { ...host.match!.start, seed: host.match!.start.seed + 1 });
    expect(other.state.winds).not.toEqual(host.match!.state.winds);
  });

  test("a room plays the variant for two: bowling, golf and archery alone become the game for two", () => {
    expect(bowlingConfig.net!.variant!("solo")).toBe("duel");
    expect(minigolfConfig.net!.variant!("solo")).toBe("duel");
    expect(archeryConfig.net!.variant!("36")).toBe("match");
  });

  test("curling: a stone swept on its way is told to the others as it goes, and its throw carries the sweeping", async () => {
    const { host, guest } = await room(curlingConfig, "3");
    const seen: { move: Move; seat: number }[] = [],
      heard: { move: Move; seat: number }[] = [];
    host.events.previewed = (move, seat) => heard.push({ move, seat });
    guest.events.previewed = (move, seat) => seen.push({ move, seat });
    host.begin();
    await settle();
    const throwMove = (sweep: number): Move => ({ from: STONE, to: shotCode(0, 9), extra: sweep });
    // The host's stone first: the guest watches it go, swept in its second and third spells.
    host.preview(throwMove(-1));
    host.preview(throwMove(0b110));
    // Out of turn, the guest's word is not passed on.
    guest.preview(throwMove(-1));
    await settle();
    expect(seen.map((s) => s.move.extra)).toEqual([-1, 0b110]);
    expect(heard).toEqual([]);
    expect(host.play(throwMove(0b110), 0)).toBeNull();
    await settle();
    const told = guest.match!.state as CurlingState;
    expect(told.last!.sweep).toBe(0b110);
    expect(told).toEqual(host.match!.state);
    // Now the guest's stone: the host sees it on its way; a word of an older ply is not.
    guest.preview(throwMove(1));
    await settle();
    expect(heard).toEqual([{ move: throwMove(1), seat: 1 }]);
    expect(guest.play(throwMove(1))).toBeNull();
    await settle();
    guest.preview(throwMove(3));
    await settle();
    expect(heard.length).toBe(1);
    expect(guest.match!.state).toEqual(host.match!.state);
    expect((host.match!.state as CurlingState).last!.sweep).toBe(1);
    // The turn is set by the side to throw as a move of its own, and goes to the other device too.
    expect(host.play({ from: -1, to: SPIN, extra: -1 }, 0)).toBeNull();
    await settle();
    expect((guest.match!.state as CurlingState).spin).toBe(1);
  });
});
