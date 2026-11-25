import { describe, expect, test } from "vitest";
import * as B from "../src/games/roulette/bets";
import * as R from "../src/games/roulette/rules";
import * as S from "../src/games/roulette/sim";

const made = (to: number) => ({ from: -1, to, extra: -1 });
const play = (state: R.State, ...moves: number[]) => moves.reduce((s, to) => R.play(s, made(to)) ?? (() => { throw new Error(`refused ${to}`); })(), state);
const id = (kind: B.Kind, numbers: number[]) => {
  const found = B.spotOf(kind, numbers);
  expect(found, `${kind} ${numbers}`).toBeGreaterThanOrEqual(0);
  return found;
};

describe("roulette: the wheel", () => {
  test("37 pockets in the European order, 18 red and 18 black, the colours alternating round the wheel", () => {
    expect(S.ORDER).toHaveLength(37);
    expect([...S.ORDER].sort((a, b) => a - b)).toEqual(Array.from({ length: 37 }, (_, k) => k));
    expect(S.ORDER.slice(0, 6)).toEqual([0, 32, 15, 19, 4, 21]);
    expect(S.REDS).toHaveLength(18);
    expect(S.colourOf(0)).toBe("green");
    for (let k = 1; k < 36; k++) expect(S.colourOf(S.ORDER[k]), `${S.ORDER[k]}`).not.toBe(S.colourOf(S.ORDER[k + 1]));
    expect(S.colourOf(1)).toBe("red");
    expect(S.colourOf(2)).toBe("black");
  });
  test("a spin always comes to rest in one pocket by itself, and the same seed spins the same way", () => {
    for (let seed = 1; seed <= 400; seed++) {
      const spin = S.runSpin(seed);
      expect(spin.forced, `seed ${seed}`).toBe(false);
      expect(spin.time).toBeLessThan(12);
      expect(spin.frames.at(-1)!.phase).toBe("rest");
      expect(S.ORDER[spin.slot]).toBe(spin.number);
      expect(S.numberOf(seed)).toBe(spin.number);
      // It goes round the track, drops, and comes onto the rotor before it rests.
      const phases = new Set(spin.frames.map((f) => f.phase));
      for (const phase of ["track", "cone", "rotor", "rest"]) expect(phases.has(phase as S.Phase), `${seed} ${phase}`).toBe(true);
    }
    const a = S.runSpin(77),
      b = S.runSpin(77);
    expect(b.number).toBe(a.number);
    expect(b.frames.map((f) => [f.x, f.z, f.rotor])).toEqual(a.frames.map((f) => [f.x, f.z, f.rotor]));
    // Where it rests is where the ball really is: on the rotor, against the turret, inside the pocket it names.
    const s = S.launch(123);
    while (s.phase !== "rest") S.step(s);
    expect(S.slotAt(S.angleOf(s.x, s.z), s.rotor)).toBe(s.slot);
    expect(Math.hypot(s.x, s.z)).toBeLessThan(S.RIM);
  });
  test("over many spins every number comes up, about equally often", () => {
    const counts = new Array(37).fill(0),
      n = 3700;
    for (let seed = 1; seed <= n; seed++) counts[S.numberOf(seed * 7919)]++;
    expect(Math.min(...counts)).toBeGreaterThan(50);
    const expected = n / 37,
      chi = counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    // 36 degrees of freedom: above 80 would be far beyond chance.
    expect(chi).toBeLessThan(80);
  });
  test("the ball strikes the diamonds and the frets on the way (not a straight slide into a pocket)", () => {
    let diamonds = 0,
      frets = 0;
    for (let seed = 1; seed <= 200; seed++)
      for (const f of S.runSpin(seed).frames)
        for (const e of f.events) {
          if (e.kind === "diamond") diamonds++;
          if (e.kind === "fret") frets++;
        }
    expect(diamonds).toBeGreaterThan(40);
    expect(frets).toBeGreaterThan(300);
  });
});

describe("roulette: the layout", () => {
  test("every kind of bet covers the right numbers and pays the right odds", () => {
    const count = (kind: B.Kind) => B.SPOTS.filter((s) => s.kind === kind).length;
    expect([count("straight"), count("split"), count("street"), count("corner"), count("line"), count("column"), count("dozen")]).toEqual([37, 60, 14, 23, 11, 3, 3]);
    for (const kind of ["red", "black", "even", "odd", "low", "high"] as const) expect(count(kind)).toBe(1);
    const pays = (kind: B.Kind, numbers: number[]) => B.payoutOf(B.SPOTS[id(kind, numbers)].numbers.length);
    expect(pays("straight", [17])).toBe(35);
    expect(pays("split", [17, 20])).toBe(17);
    expect(pays("split", [0, 2])).toBe(17);
    expect(pays("street", [13, 14, 15])).toBe(11);
    expect(pays("street", [0, 1, 2])).toBe(11);
    expect(pays("corner", [17, 18, 20, 21])).toBe(8);
    expect(pays("corner", [0, 1, 2, 3])).toBe(8);
    expect(pays("line", [13, 14, 15, 16, 17, 18])).toBe(5);
    const outside = (kind: B.Kind) => B.SPOTS.find((s) => s.kind === kind)!;
    expect(outside("dozen").numbers).toEqual(Array.from({ length: 12 }, (_, k) => k + 1));
    expect(B.payoutOf(12)).toBe(2);
    expect(outside("red").numbers).toEqual(S.REDS);
    expect(outside("black").numbers.every((n) => S.colourOf(n) === "black")).toBe(true);
    expect(outside("even").numbers.every((n) => n % 2 === 0 && n > 0)).toBe(true);
    expect(outside("low").numbers).toEqual(Array.from({ length: 18 }, (_, k) => k + 1));
    for (const kind of ["red", "black", "even", "odd", "low", "high"] as const) {
      expect(outside(kind).numbers).toHaveLength(18);
      expect(outside(kind).numbers).not.toContain(0);
    }
    const columns = B.SPOTS.filter((s) => s.kind === "column").map((s) => s.numbers);
    expect(columns.map((c) => c[0]).sort()).toEqual([1, 2, 3]);
    expect(columns.every((c) => c.length === 12 && c.every((n) => n % 3 === c[0] % 3))).toBe(true);
    // Splits are neighbours on the layout; corners are two by two; lines two streets side by side.
    for (const s of B.SPOTS.filter((s) => s.kind === "split" && !s.numbers.includes(0))) expect([1, 3]).toContain(s.numbers[1] - s.numbers[0]);
    for (const s of B.SPOTS.filter((s) => s.kind === "corner" && !s.numbers.includes(0))) expect(s.numbers[3] - s.numbers[0]).toBe(4);
    for (const s of B.SPOTS.filter((s) => s.kind === "line")) expect(s.numbers).toEqual(Array.from({ length: 6 }, (_, k) => s.numbers[0] + k));
    expect(B.winsOn(B.SPOTS[id("straight", [5])], 5)).toBe(35);
    expect(B.winsOn(B.SPOTS[id("straight", [5])], 6)).toBe(0);
  });
  test("a tap at a spot's place bets on that spot, every one of them; a tap on a number's middle is that number", () => {
    B.SPOTS.forEach((s, k) => expect(B.spotAt(s.x, s.z), `${s.name}`).toBe(k));
    for (let n = 0; n <= 36; n++) {
      const c = B.cellOf(n);
      // Anywhere well inside the cell, not only its middle.
      for (const [dx, dz] of [[0, 0], [0.07, 0.08], [-0.07, -0.08]]) expect(B.spotAt(c.x + dx, c.z + dz)).toBe(id("straight", [n]));
    }
    const c17 = B.cellOf(17),
      c20 = B.cellOf(20);
    // Near the line between 17 and 20: the split; near the corner of 17, 18, 20 and 21: the corner.
    expect(B.spotAt((c17.x + c20.x) / 2 + 0.03, c17.z)).toBe(id("split", [17, 20]));
    expect(B.spotAt((c17.x + c20.x) / 2, c17.z - B.H / 2 + 0.02)).toBe(id("corner", [17, 18, 20, 21]));
    // Off the layout: nothing.
    expect(B.spotAt(B.FELT.right + 0.1, 0)).toBe(-1);
    expect(B.spotAt(0, B.FELT.near + 0.1)).toBe(-1);
  });
});

describe("roulette: the books", () => {
  const fresh = () => R.createGame(4242);
  test("chips go from the hand onto the table, within the limits, and come back by undo and clear", () => {
    let s = fresh();
    expect(s.balance).toBe(R.START);
    expect(R.moves(s).some((m) => m.to === R.SPIN)).toBe(false);
    const seventeen = id("straight", [17]);
    s = play(s, R.CHIP + 2, seventeen, seventeen);
    expect(s.balance).toBe(950);
    expect(s.bets[seventeen]).toBe(50);
    expect(R.moves(s).some((m) => m.to === R.SPIN)).toBe(true);
    // A straight up takes at most 100: a fifth 25 is refused.
    s = play(s, seventeen, seventeen);
    expect(R.play(s, made(seventeen))).toBeNull();
    expect(R.moves(s).some((m) => m.to === seventeen)).toBe(false);
    // Red takes up to 500.
    const red = B.SPOTS.findIndex((x) => x.kind === "red");
    s = play(s, R.CHIP + 3, red, red, red, red, red);
    expect(s.bets[red]).toBe(500);
    expect(R.play(s, made(red))).toBeNull();
    s = play(s, R.UNDO);
    expect(s.bets[red]).toBe(400);
    expect(s.balance).toBe(R.START - 100 - 400);
    s = play(s, R.CLEAR);
    expect(s.balance).toBe(R.START);
    expect(R.staked(s)).toBe(0);
    // Never more than is in hand.
    let poor = { ...fresh(), balance: 3 };
    poor = play(poor, R.CHIP + 0, seventeen, seventeen, seventeen);
    expect(R.play(poor, made(seventeen))).toBeNull();
    expect(poor.balance).toBe(0);
  });
  test("a spin's number comes from the wheel's physics for the state's seed, and every bet is paid at its odds", () => {
    let s = fresh();
    const seed = s.seed,
      number = S.numberOf(seed),
      neighbour = number === 36 ? 35 : number + 1,
      bets = [id("straight", [number]), id("straight", [neighbour]), B.SPOTS.findIndex((x) => x.kind === "red"), B.SPOTS.findIndex((x) => x.kind === "dozen" && x.numbers.includes(Math.max(1, number)))];
    s = play(s, R.CHIP + 1, ...bets);
    expect(s.balance).toBe(R.START - 20);
    s = play(s, R.SPIN);
    const r = s.result!;
    expect(r.number).toBe(number);
    expect(r.staked).toBe(20);
    let paid = 5 * 36;
    if (S.colourOf(number) === "red") paid += 10;
    if (number > 0) paid += 15;
    expect(r.paid).toBe(paid);
    expect(s.balance).toBe(R.START - 20 + paid);
    expect(s.history[0]).toBe(number);
    expect(s.spins).toBe(1);
    expect(s.seed).not.toBe(seed);
    expect(R.staked(s)).toBe(0);
    // 다시 걸기 lays the same bets again, from the hand.
    s = play(s, R.REBET);
    expect(R.staked(s)).toBe(20);
    expect(bets.every((b) => s.bets[b] === 5)).toBe(true);
    expect(R.play(s, made(R.REBET))).toBeNull();
  });
  test("standing up ends the game won, even or lost; losing every chip ends it lost", () => {
    const s = fresh();
    expect(play({ ...s, balance: 1200 }, R.CASH).winner).toBe(0);
    expect(play(s, R.CASH).winner).toBe("draw");
    expect(play({ ...s, balance: 300 }, R.CASH).winner).toBe(1);
    // Not with chips on the table.
    expect(R.play(play(s, id("straight", [3])), made(R.CASH))).toBeNull();
    // Everything on one number that does not come up: nothing left, the game is lost.
    const number = S.numberOf(s.seed),
      other = (number + 1) % 37;
    let broke = { ...s, balance: 100 };
    broke = play(broke, R.CHIP + 3, id("straight", [other]), R.SPIN);
    expect(broke.balance).toBe(0);
    expect(broke.winner).toBe(1);
    expect(R.moves(broke)).toEqual([]);
    expect(R.roulette.reason(broke)).toContain("모두 잃었습니다");
  });
  test("only spins count as moves; the state is shown as balance and chips on the table", () => {
    let s = fresh();
    s = play(s, R.CHIP + 1, id("straight", [1]), id("split", [1, 2]));
    expect(R.roulette.ply(s)).toBe(0);
    expect(R.roulette.hint(s)).toContain("건 칩 10");
    s = play(s, R.SPIN);
    expect(R.roulette.ply(s)).toBe(1);
    expect(R.roulette.hint(s)).toContain(`${s.result!.number}`);
  });
});
