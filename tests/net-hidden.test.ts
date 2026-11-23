import { describe, expect, test } from "vitest";
import { NOBODY, type NetRules } from "../src/net/match";
import { GuestRoom, HostRoom, memoryLinks } from "../src/net/room";
import { streamFor } from "../src/net/random";
import { pointRules } from "../src/net/points";
import type { HiddenView } from "../src/net/hidden";
import type { SeatInfo, SeatKind } from "../src/net/protocol";
import type { PointConfig } from "../src/ui/point-game";
import type { Move } from "../src/games/points/types";
import { seaBattleConfig } from "../src/games/seabattle/config";
import { CELLS, FLEET, LAY_REST, TURN_SHIP, sunk, type State as SeaState } from "../src/games/seabattle/rules";
import { hitBlowConfig } from "../src/games/hitblow/config";
import { ENTER, type State as BallState } from "../src/games/hitblow/rules";
import { dominoConfig } from "../src/games/domino/config";
import type { State as DominoState } from "../src/games/domino/rules";
import { tileRummyConfig } from "../src/games/tilerummy/config";
import type { State as RummyState } from "../src/games/tilerummy/rules";
import { numberCodeConfig } from "../src/games/numbercode/config";
import { GAP, POOL, isJoker, tileCode, type State as CodeState } from "../src/games/numbercode/rules";
import { netCreate as codeCreate } from "../src/games/numbercode/net";
import { Match } from "../src/net/match";

/*
 * 와이파이 여럿이 for the games with hidden things (`src/net/hidden.ts`): simulated devices joined by links in
 * memory, each playing only its own seat from its own view (`HiddenView.view`), its moves put back in the room's terms
 * (`HiddenView.move`). Every device must reach the same state, and no view may show what its seat may not know.
 */
const settle = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve();
};
const rulesOf = <S>(config: PointConfig<S>): NetRules<S> => pointRules(config.game, config.net!);
const hiddenOf = <S>(config: PointConfig<S>): HiddenView<S> => config.net!.hidden!;
type Device<S> = HostRoom<S> | GuestRoom<S>;

/** A room of the game: the host in seat 0, one guest a seat after it for each name, the rest of the seats as `rest`. */
async function room<S>(config: PointConfig<S>, guests: number, rest: SeatKind = "computer", variant = "", options = {}) {
  const seats: SeatInfo[] = config.net!.seats!(variant).map((s) => ({ ...s, kind: "open", person: null }));
  const rules = rulesOf(config),
    host = new HostRoom({ game: "g", title: "g", name: "방장", variant, options, seats, quiet: true }, rules, "host"),
    devices: Device<S>[] = [host];
  for (let i = 0; i < guests; i++) {
    const guest = new GuestRoom<S>({ game: "g", title: "g", name: `손님${i + 1}`, quiet: true }, rules, `guest${i}`),
      [a, b] = memoryLinks();
    host.connect(a);
    guest.connect(b);
    devices.push(guest);
    await settle();
  }
  seats.forEach((_, i) => {
    if (i > guests) host.setKind(i, rest);
  });
  host.begin(variant, options);
  await settle();
  return { host, devices };
}
/** The device that plays `seat` (the host's for a computer's). */
const deviceOf = <S>(host: HostRoom<S>, devices: Device<S>[], seat: number) => (host.seats[seat].kind === "computer" ? host : devices.find((d) => d.mySeat === seat)!);
/** Sends a move of `seat`'s view from its device, in the room's terms; null, or why it was refused. */
function send<S>(config: PointConfig<S>, device: Device<S>, seat: number, move: Move) {
  const real = device.match!.state,
    sent = hiddenOf(config).move(move, seat, real);
  return device.host ? (device as HostRoom<S>).play(sent, seat) : (device as GuestRoom<S>).play(sent);
}
/** A move for `seat` from its own view: the game's computer for that view (`HiddenView.game.choose`), or `pick`. */
function chosen<S>(config: PointConfig<S>, view: S, random: () => number, pick?: (view: S, random: () => number) => Move | null) {
  const game = hiddenOf(config).game ?? config.game;
  return pick?.(view, random) ?? game.choose!(view, "normal", random);
}
/**
 * Plays the game out through the room: every seat that may move does, each from its own device's view (all of them
 * before the room settles where several may move at once, so their moves cross); `watch` sees every device's view
 * after every round. Returns the number of rounds.
 */
async function playOut<S>(
  config: PointConfig<S>,
  host: HostRoom<S>,
  devices: Device<S>[],
  most: number,
  watch: (view: S, seat: number, real: S) => void,
  pick?: (view: S, random: () => number) => Move | null,
) {
  const hidden = hiddenOf(config),
    random = streamFor(91, 7);
  let rounds = 0;
  while (host.match!.toMove !== NOBODY && rounds < most) {
    for (const seat of host.match!.movers) {
      const device = deviceOf(host, devices, seat),
        view = hidden.view(device.match!.state, seat),
        move = chosen(config, view, random, pick);
      expect(move, `seat ${seat}`).not.toBeNull();
      expect(send(config, device, seat, move!)).toBeNull();
    }
    await settle();
    rounds++;
    for (const d of devices) {
      expect(d.match!.state).toEqual(host.match!.state);
      if (d.mySeat !== null) watch(hidden.view(d.match!.state, d.mySeat), d.mySeat, d.match!.state);
    }
  }
  return rounds;
}

describe("배틀십 over Wi-Fi", () => {
  const hidden = hiddenOf(seaBattleConfig);
  test("both lay their fleets at once on their own devices; the battle begins once both are laid, 선공 first", async () => {
    const { host, devices } = await room(seaBattleConfig, 1),
      guest = devices[1] as GuestRoom<SeaState>;
    expect(host.match!.movers).toEqual([0, 1]);
    // Each device sees its own chart to lay, the other's empty.
    const mine = hidden.view(guest.match!.state, 1);
    expect(mine.phase).toBe("place");
    expect(mine.fleets[0]).toEqual([]);
    // The guest turns its next ship and lays it; the host lays its whole fleet at random; their moves cross.
    expect(send(seaBattleConfig, guest, 1, { from: -1, to: TURN_SHIP, extra: -1 })).toBeNull();
    expect(send(seaBattleConfig, host, 0, { from: -1, to: LAY_REST, extra: -1 })).toBeNull();
    await settle();
    expect(send(seaBattleConfig, guest, 1, { from: -1, to: 0, extra: -1 })).toBeNull();
    await settle();
    const real = host.match!.state;
    expect(real.fleets[0]).toHaveLength(FLEET.length);
    // Laid down the column from square 0, as the guest turned it.
    expect(real.fleets[1]).toEqual([{ name: FLEET[0][0], cells: [0, 10, 20, 30, 40] }]);
    expect(real.phase).toBe("place");
    // The host, laid, waits; it may not fire yet.
    expect(host.match!.movers).toEqual([1]);
    expect(hidden.waiting!(real, 0)).toContain("상대가 배를 놓는 중");
    expect(host.play({ from: -1, to: CELLS + 5, extra: -1 }, 0)).toBe("상대 차례입니다.");
    // The host's view of the guest's carrier: its squares unknown.
    expect(hidden.view(real, 0).fleets[1]).toEqual([{ name: FLEET[0][0], cells: [-1, -1, -1, -1, -1] }]);
    expect(send(seaBattleConfig, guest, 1, { from: -1, to: LAY_REST, extra: -1 })).toBeNull();
    await settle();
    expect(host.match!.state.phase).toBe("battle");
    expect(host.match!.toMove).toBe(0);
    expect(guest.match!.state).toEqual(host.match!.state);
  });

  test("a guest's view never holds the host's ships before they are hit; a square hit is known, a ship sunk shown whole", async () => {
    const { host, devices } = await room(seaBattleConfig, 1);
    let sightings = 0;
    await playOut(seaBattleConfig, host, devices, 400, (view, seat, real) => {
      const theirs = real.fleets[seat ? 0 : 1];
      view.fleets[1].forEach((ship, k) => {
        const truth = theirs[k];
        if (real.winner !== null || sunk(real, seat ? 0 : 1, truth)) return expect(ship).toEqual(truth);
        // Only the squares hit are told.
        ship.cells.forEach((c, i) => expect(c).toBe(view.shots[1][truth.cells[i]] ? truth.cells[i] : -1));
        if (ship.cells.some((c) => c >= 0)) sightings++;
      });
      // My own chart is the real one of my seat.
      expect(view.fleets[0]).toEqual(real.fleets[seat]);
      expect(view.turn === 0).toBe(real.turn === seat);
    });
    expect(host.match!.toMove).toBe(NOBODY);
    expect(sightings).toBeGreaterThan(0);
    // At the end every ship shows.
    const end = hidden.view(devices[1].match!.state, 1);
    expect(end.fleets).toEqual([host.match!.state.fleets[1], host.match!.state.fleets[0]]);
  });

  test("a shot of the guest's view (at side 1) lands on the host's waters in the room", () => {
    const real = { ...hidden.view(seaBattleConfig.net!.create!("", {}, [true, true], () => 0.5), 0), phase: "battle" as const };
    expect(hidden.move({ from: -1, to: CELLS + 7, extra: -1 }, 1, real)).toEqual({ from: -1, to: 7, extra: -1 });
    expect(hidden.move({ from: -1, to: CELLS + 7, extra: -1 }, 0, real)).toEqual({ from: -1, to: CELLS + 7, extra: -1 });
  });

  test("the host's computer stands in for a guest who drops, from the guest's own view", async () => {
    const { host, devices } = await room(seaBattleConfig, 1),
      guest = devices[1] as GuestRoom<SeaState>;
    guest.leave();
    await settle();
    expect(host.away(1)).toBe(true);
    // The host's computer lays the fleet of the seat and fires for it, from that seat's view.
    const view = hidden.view(host.match!.state, 1),
      move = hidden.game!.choose!(view, "normal", streamFor(1, 1))!;
    expect(move.to).toBe(LAY_REST);
    expect(host.play(hidden.move(move, 1, host.match!.state), 1)).toBeNull();
    expect(host.match!.state.fleets[1]).toHaveLength(FLEET.length);
  });
});

describe("숫자야구 over Wi-Fi", () => {
  const hidden = hiddenOf(hitBlowConfig),
    key = (to: number): Move => ({ from: -1, to, extra: -1 });
  test("both key their numbers at once, their keys crossing; neither view holds the other's number or keys", async () => {
    const { host, devices } = await room(hitBlowConfig, 1, "computer", "3"),
      guest = devices[1] as GuestRoom<BallState>;
    expect(host.match!.movers).toEqual([0, 1]);
    // Keys of the two devices cross: the guest's are sent before the host's come back to it.
    for (const [mine, theirs] of [
      [1, 7],
      [2, 8],
      [3, 9],
    ]) {
      expect(send(hitBlowConfig, guest, 1, key(theirs))).toBeNull();
      expect(send(hitBlowConfig, host, 0, key(mine))).toBeNull();
      await settle();
    }
    const real = host.match!.state;
    expect(real.net!.entries).toEqual([
      [1, 2, 3],
      [7, 8, 9],
    ]);
    expect(guest.match!.state).toEqual(real);
    // Each view keys its own; the other's keys are not in it.
    expect(hidden.view(real, 0).entry).toEqual([1, 2, 3]);
    expect(hidden.view(real, 1).entry).toEqual([7, 8, 9]);
    expect(send(hitBlowConfig, host, 0, key(ENTER))).toBeNull();
    await settle();
    const waiting = hidden.view(host.match!.state, 0);
    expect(waiting.secrets[0]).toEqual([1, 2, 3]);
    // The host has chosen: it waits for the guest, who has not, and may not throw.
    expect(waiting.turn).toBe(1);
    expect(hidden.waiting!(host.match!.state, 0)).toContain("상대가 숫자를 정하는 중");
    expect(host.play(key(4), 0)).toBe("상대 차례입니다.");
    const before = hidden.view(guest.match!.state, 1);
    expect(before.secrets[1]).toEqual([]);
    expect(JSON.stringify(before)).not.toContain("1,2,3");
    expect(send(hitBlowConfig, guest, 1, key(ENTER))).toBeNull();
    await settle();
    expect(host.match!.state.phase).toBe("play");
    expect(host.match!.toMove).toBe(0);
    expect(hidden.view(host.match!.state, 0).turn).toBe(0);
    expect(hidden.view(host.match!.state, 1).turn).toBe(1);
  });

  test("played out, each throws in turn and the views hold only their own number until the end", async () => {
    const { host, devices } = await room(hitBlowConfig, 1, "computer", "4");
    let throws = 0;
    await playOut(hitBlowConfig, host, devices, 200, (view, seat, real) => {
      const mine = real.net!.secrets[seat],
        theirs = real.net!.secrets[seat ? 0 : 1];
      expect(view.secrets[0]).toEqual(mine);
      expect(view.secrets[1]).toEqual(real.winner !== null ? theirs : []);
      expect(view.guesses[0]).toEqual(real.guesses[seat]);
      expect("net" in view).toBe(false);
      throws = real.guesses[0].length + real.guesses[1].length;
    });
    const end = host.match!.state;
    expect(end.winner).not.toBeNull();
    // The same number of throws each, 선공 first.
    expect(end.guesses[0].length).toBe(end.guesses[1].length);
    expect(throws).toBeGreaterThan(2);
    const reason = hidden.game!.reason(hidden.view(end, 1));
    expect(reason).toContain(`상대의 숫자는 ${end.net!.secrets[0]!.join("")}`);
  });

  test("a guest who drops mid-number is played by the host's computer, which throws whole numbers", async () => {
    const { host, devices } = await room(hitBlowConfig, 1, "computer", "3"),
      guest = devices[1] as GuestRoom<BallState>;
    expect(send(hitBlowConfig, guest, 1, key(5))).toBeNull();
    await settle();
    guest.leave();
    await settle();
    const move = hidden.game!.choose!(hidden.view(host.match!.state, 1), "normal", streamFor(4, 4))!;
    expect(move.to).toBeGreaterThanOrEqual(100);
    expect(host.play(move, 1)).toBeNull();
    expect(host.match!.state.net!.secrets[1]).toHaveLength(3);
    expect(host.match!.state.net!.entries[1]).toEqual([]);
  });
});

describe("도미노 over Wi-Fi", () => {
  const hidden = hiddenOf(dominoConfig);
  test("each device sees its own hand at the near side; played out, both agree", async () => {
    const { host, devices } = await room(dominoConfig, 1);
    const start = host.match!.state;
    expect(hidden.view(start, 1).hands).toEqual([start.hands[1], start.hands[0]]);
    expect(hidden.view(start, 0)).toBe(start);
    await playOut(dominoConfig, host, devices, 200, (view, seat, real) => {
      expect(view.hands[0]).toEqual(real.hands[seat]);
      expect(view.turn === 0).toBe(real.turn === seat && real.winner === null ? true : view.turn === 0);
      if (real.winner !== null && real.winner !== "draw") expect(view.winner === 0).toBe(real.winner === seat);
    });
    expect(host.match!.toMove).toBe(NOBODY);
  });

  test("the guest's seat may be the host's computer, which plays from that seat's hand", async () => {
    const { host, devices } = await room(dominoConfig, 0);
    expect(host.seats[1].kind).toBe("computer");
    await playOut(dominoConfig, host, devices, 200, () => {});
    expect(host.match!.toMove).toBe(NOBODY);
  });
});

describe("타일 러미 over Wi-Fi", () => {
  const hidden = hiddenOf(tileRummyConfig);
  test("each device sees its own rack; every tap is a room move; played out by the computer for both seats from their views", async () => {
    const { host, devices } = await room(tileRummyConfig, 1);
    await playOut(
      tileRummyConfig,
      host,
      devices,
      1500,
      (view, seat, real) => {
        expect(view.racks[0]).toEqual(real.racks[seat]);
        expect(view.opened[0]).toBe(real.opened[seat]);
      },
      (view, random) => hidden.game!.choose!(view, "easy", random),
    );
    expect(host.match!.toMove).toBe(NOBODY);
  }, 60000);

  test("a person's tap on seat 1 is played as at one screen", async () => {
    const { host, devices } = await room(tileRummyConfig, 1),
      guest = devices[1] as GuestRoom<RummyState>;
    // The host draws, ending its turn; the guest picks a tile of its rack up and puts it back down.
    expect(send(tileRummyConfig, host, 0, { from: -1, to: 403, extra: -1 })).toBeNull();
    await settle();
    const tile = guest.match!.state.racks[1][0];
    expect(send(tileRummyConfig, guest, 1, { from: -1, to: tile, extra: -1 })).toBeNull();
    await settle();
    expect(host.match!.state.picked).toEqual([tile]);
    expect(hidden.view(host.match!.state, 1).picked).toEqual([tile]);
  });
});

describe("숫자 코드 over Wi-Fi", () => {
  const hidden = hiddenOf(numberCodeConfig);
  const rules = rulesOf(numberCodeConfig);
  /** A seed whose deal gives jokers to two players of three. */
  function jokerDeal() {
    for (let seed = 1; seed < 4000; seed++) {
      const s = codeCreate({ jokers: true }, [true, true, true, false], streamFor(seed, 0));
      if (s.net!.waiting.filter((w) => w.length).length === 2) return seed;
    }
    throw new Error("no deal");
  }
  test("jokers dealt are placed by their owners at once before the first turn; each view has its own row near", () => {
    const seed = jokerDeal(),
      match = new Match(rules, { round: 1, variant: "", options: { jokers: true }, seed, seats: [{ kind: "person", person: "a" }, { kind: "person", person: "b" }, { kind: "computer", person: null }, { kind: "closed", person: null }] });
    const s = match.state;
    expect(s.seats).toBe(3);
    const placers = match.movers;
    expect(placers).toHaveLength(2);
    // Every row is in order without its jokers, which wait with their owners.
    s.rows.forEach((row) => expect(row.some(isJoker)).toBe(false));
    for (const seat of placers) {
      const view = hidden.view(s, seat);
      expect(view.phase).toBe("joker");
      expect(view.seat).toBe(0);
      expect(view.rows[0]).toEqual(s.rows[seat]);
      expect(view.waiting).toEqual(s.net!.waiting[seat]);
    }
    // Both place theirs, in either order; then 1번 begins with the pool.
    for (const seat of [...placers].reverse())
      while (match.state.net!.waiting[seat].length) expect(match.try({ from: -1, to: GAP, extra: -1 }, seat, false)).toHaveProperty("state"), match.push({ from: -1, to: GAP, extra: -1 }, seat);
    expect(match.movers).toEqual([0]);
    const after = match.state;
    expect(after.phase).toBe("draw");
    for (const seat of placers) expect(isJoker(after.rows[seat][0])).toBe(true);
    // Seat 1's view names a tile of seat 2 as its own seat 1; the room as seat 2's.
    const view = hidden.view(after, 1);
    expect(view.rows[1]).toEqual(after.rows[2]);
    expect(hidden.move({ from: -1, to: tileCode(1, 0), extra: 300 }, 1, after)).toEqual({ from: -1, to: tileCode(2, 0), extra: 300 });
    expect(hidden.move({ from: -1, to: POOL + 3, extra: -1 }, 1, after)).toEqual({ from: -1, to: POOL + 3, extra: -1 });
  });

  test("three devices and a computer play to the last one standing, each from its own view", async () => {
    const { host, devices } = await room(numberCodeConfig, 2, "computer", "", { jokers: true, helper: false });
    // The fourth seat is the computer's: four play.
    expect(host.match!.state.seats).toBe(4);
    await playOut(numberCodeConfig, host, devices, 600, (view, seat, real) => {
      const p = real.net!.seats.indexOf(seat);
      expect(view.rows[0]).toEqual(real.rows[p]);
      expect(view.out[0]).toBe(real.out[p]);
    });
    const end = host.match!.state;
    expect(host.match!.toMove).toBe(NOBODY);
    expect(end.out.filter((o) => !o)).toHaveLength(1);
    const champion = end.net!.champion!;
    expect(end.out[champion]).toBe(false);
    expect(numberCodeConfig.net!.winnerSeat!(end)).toBe(end.net!.seats[champion]);
    for (const d of devices) expect(hidden.view(d.match!.state, d.mySeat!).winner).toBe(d.mySeat === end.net!.seats[champion] ? 0 : 1);
  });

  test("a closed seat leaves the game to the seats taken", async () => {
    const { host } = await room(numberCodeConfig, 1, "closed");
    expect(host.match!.state.seats).toBe(2);
    expect(host.match!.state.net!.seats).toEqual([0, 1]);
  });
});
