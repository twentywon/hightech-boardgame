import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as R from "../src/games/tactics/rules";
import { chooseMove } from "../src/games/tactics/ai";
import { tacticsConfig } from "../src/games/tactics/config";
import { tacticsSubject, tilePoint, tileTop } from "../src/games/tactics/layout";

const { AIM_ACT, AIM_MOVE, CANCEL, STEP, STRIKE, UNDO, WAIT, cellAt } = R;
type Place = { cell: number; facing?: R.Dir; hp?: number };
/** A field with only the units named, where they are named, and `active` to act. */
function lay(field: string, put: Record<number, Place>, active: number): R.State {
  const s = R.createGame(field);
  for (const u of s.units) {
    u.hp = 0;
    u.cell = -1;
    u.charge = 0;
  }
  for (const [id, p] of Object.entries(put)) {
    const u = s.units[Number(id)];
    u.cell = p.cell;
    u.hp = p.hp ?? u.max;
    if (p.facing !== undefined) u.facing = p.facing;
  }
  s.active = active;
  s.units[active].charge = 100;
  return s;
}
const ok = (s: R.State, m: { from: number; to: number; extra: number }) => {
  const next = R.play(s, m);
  expect(next, JSON.stringify(m)).not.toBeNull();
  return next!;
};
const command = (to: number) => ({ from: -1, to, extra: -1 });
const step = (s: R.State, to: number) => ({ from: R.activeUnit(s).cell, to, extra: STEP });
const strike = (s: R.State, to: number) => ({ from: R.activeUnit(s).cell, to, extra: STRIKE });
/** Unit numbers: two sides alternate through the army (knight, assassin, archer, fire, healer, light). */
const ID = (job: R.Job, side: 0 | 1) => R.ARMY.indexOf(job) * 2 + side;

describe("tactical battle: the field and the armies", () => {
  test("every map is the same ground for both sides, and both armies start on their own edge", () => {
    for (const { id } of R.FIELDS) {
      const f = R.fieldOf(id);
      for (let c = 0; c < R.CELLS; c++) {
        expect(f.ground[R.CELLS - 1 - c]).toBe(f.ground[c]);
        expect(f.height[R.CELLS - 1 - c]).toBe(f.height[c]);
        expect(f.height[c]).toBeGreaterThanOrEqual(0);
        expect(f.height[c]).toBeLessThanOrEqual(3);
      }
      const s = R.createGame(id);
      expect(s.units).toHaveLength(12);
      for (const u of s.units) {
        expect(R.passable(f.ground[u.cell])).toBe(true);
        expect(u.side === 0 ? R.rowOf(u.cell) >= 8 : R.rowOf(u.cell) <= 1).toBe(true);
      }
      expect(new Set(s.units.map((u) => u.cell)).size).toBe(12);
    }
  });
});

describe("tactical battle: the queue", () => {
  test("units act by speed, ties going to the lower number, and one that only waits comes back sooner", () => {
    const s = R.createGame("forest");
    // The assassins are fastest; both reach 100 together and the blue one, numbered lower, goes first.
    expect(s.active).toBe(ID("assassin", 0));
    expect(R.queue(s, 2)).toEqual([ID("assassin", 0), ID("assassin", 1)]);
    const waited = ok(s, command(WAIT)),
      walked = ok(ok(s, step(s, R.reach(s, R.activeUnit(s)).dests[0])), command(WAIT));
    const me = ID("assassin", 0);
    expect(waited.units[me].charge).toBe(s.units[me].charge - 50);
    expect(walked.units[me].charge).toBe(s.units[me].charge - 100);
    expect(waited.active).toBe(ID("assassin", 1));
    // In the queue the one that only waited comes round again earlier.
    const again = (state: R.State) => R.queue(state, 12).indexOf(me);
    expect(again(waited)).toBeLessThan(again(walked));
    expect(waited.turns).toBe(1);
  });
  test("the queue is the next eight, the active unit first", () => {
    const s = R.createGame("wall"),
      q = R.queue(s, 8);
    expect(q).toHaveLength(8);
    expect(q[0]).toBe(s.active);
    // The slow knights come late.
    expect(q.slice(0, 4)).not.toContain(ID("knight", 0));
  });
});

describe("tactical battle: moving", () => {
  test("a step climbs or drops no more than the unit's jump, and water and trees cannot be entered", () => {
    const f = R.fieldOf("forest"),
      from = cellAt(6, 0),
      up = cellAt(4, 0);
    expect(f.height[from]).toBe(0);
    expect(f.height[up]).toBe(3);
    // The knight (jump 1, move 3) cannot get up there; the assassin (jump 3) can, straight up the slope.
    const knight = lay("forest", { [ID("knight", 0)]: { cell: from } }, ID("knight", 0)),
      assassin = lay("forest", { [ID("assassin", 0)]: { cell: from } }, ID("assassin", 0));
    expect(R.reach(knight, R.activeUnit(knight)).dests).not.toContain(up);
    const found = R.reach(assassin, R.activeUnit(assassin));
    expect(found.dests).toContain(up);
    for (const s of [knight, assassin]) {
      const unit = R.activeUnit(s),
        { dests, prev } = R.reach(s, unit);
      for (const d of dests) {
        expect(R.passable(f.ground[d])).toBe(true);
        const path = R.pathTo(prev, d);
        expect(path.length - 1).toBeLessThanOrEqual(R.JOBS[unit.job].move);
        for (let i = 1; i < path.length; i++) expect(Math.abs(f.height[path[i]] - f.height[path[i - 1]])).toBeLessThanOrEqual(R.JOBS[unit.job].jump);
      }
    }
    expect(found.dests.some((d) => f.ground[d] === "water" || f.ground[d] === "tree")).toBe(false);
  });
  test("a unit passes its own side but not the other's, and stops only on an empty tile", () => {
    // The river's left bridge: bank (6,2), bridge (5,2) and (4,2), far bank (3,2).
    const knight = ID("knight", 0),
      bank = cellAt(6, 2),
      deck = cellAt(5, 2),
      far = cellAt(4, 2);
    expect(R.fieldOf("river").ground[deck]).toBe("bridge");
    const friend = lay("river", { [knight]: { cell: bank }, [ID("archer", 0)]: { cell: deck } }, knight),
      foe = lay("river", { [knight]: { cell: bank }, [ID("archer", 1)]: { cell: deck } }, knight);
    expect(R.reach(friend, R.activeUnit(friend)).dests).toContain(far);
    expect(R.reach(friend, R.activeUnit(friend)).dests).not.toContain(deck);
    expect(R.reach(foe, R.activeUnit(foe)).dests).not.toContain(far);
  });
  test("a walk turns the unit the way it went, and 되돌리기 takes it back until it strikes", () => {
    const knight = ID("knight", 0),
      s = lay("forest", { [knight]: { cell: cellAt(8, 4), facing: 0 }, [ID("archer", 1)]: { cell: cellAt(8, 7) } }, knight),
      walked = ok(s, step(s, cellAt(8, 6)));
    expect(walked.units[knight].cell).toBe(cellAt(8, 6));
    expect(walked.units[knight].facing).toBe(1);
    expect(walked.last?.path).toEqual([cellAt(8, 4), cellAt(8, 5), cellAt(8, 6)]);
    expect(R.moves(walked).map((m) => m.to)).toContain(UNDO);
    const back = ok(walked, command(UNDO));
    expect(back.units[knight].cell).toBe(cellAt(8, 4));
    expect(back.units[knight].facing).toBe(0);
    expect(back.moved).toBe(false);
    expect(back.active).toBe(knight);
    // Walked, then struck: the turn ends, and there is nothing left to take back.
    const struck = ok(walked, strike(walked, cellAt(8, 7)));
    expect(struck.active).not.toBe(knight);
    // Struck first: nothing to take back, and walking after it ends the turn.
    const near = lay("forest", { [knight]: { cell: cellAt(8, 4) }, [ID("archer", 1)]: { cell: cellAt(8, 5) }, [ID("knight", 1)]: { cell: cellAt(0, 4) } }, knight),
      first = ok(near, strike(near, cellAt(8, 5)));
    expect(first.active).toBe(knight);
    expect(R.play(first, command(UNDO))).toBeNull();
    expect(ok(first, step(first, cellAt(8, 3))).active).not.toBe(knight);
  });
});

describe("tactical battle: what each strike reaches", () => {
  const row = (r: number, ...cols: number[]) => cols.map((c) => cellAt(r, c));
  test("knight and assassin strike the enemy beside them; the archer two to five away, never beside her", () => {
    const archer = ID("archer", 0),
      s = lay(
        "wall",
        { [archer]: { cell: cellAt(7, 0) }, [ID("knight", 1)]: { cell: cellAt(7, 1) }, [ID("light", 1)]: { cell: cellAt(7, 3) }, [ID("fire", 1)]: { cell: cellAt(7, 5) }, [ID("healer", 1)]: { cell: cellAt(7, 6) }, [ID("knight", 0)]: { cell: cellAt(8, 0) } },
        archer,
      );
    expect(R.targetsFrom(s, R.activeUnit(s), cellAt(7, 0)).sort((a, b) => a - b)).toEqual(row(7, 3, 5));
    const k = lay("wall", { [ID("knight", 0)]: { cell: cellAt(7, 0) }, [ID("knight", 1)]: { cell: cellAt(7, 1) }, [ID("archer", 0)]: { cell: cellAt(8, 0) }, [ID("light", 1)]: { cell: cellAt(7, 3) } }, ID("knight", 0));
    expect(R.targetsFrom(k, R.activeUnit(k), cellAt(7, 0))).toEqual([cellAt(7, 1)]);
  });
  test("fire falls anywhere within four and burns a cross of five, friends and the caster included", () => {
    const fire = ID("fire", 0),
      s = lay("wall", { [fire]: { cell: cellAt(7, 4) }, [ID("knight", 1)]: { cell: cellAt(6, 4) }, [ID("knight", 0)]: { cell: cellAt(6, 5) }, [ID("archer", 1)]: { cell: cellAt(2, 4) } }, fire),
      unit = R.activeUnit(s),
      targets = R.targetsFrom(s, unit, unit.cell);
    expect(targets).toContain(cellAt(3, 4));
    expect(targets).not.toContain(cellAt(2, 4));
    expect(targets).not.toContain(unit.cell);
    expect(R.areaOf(s, unit, unit.cell, cellAt(6, 4)).sort()).toEqual([cellAt(5, 4), cellAt(6, 3), cellAt(6, 4), cellAt(6, 5), cellAt(7, 4)].sort());
    const hits = R.hitsOf(s, unit, unit.cell, cellAt(6, 4)).map((h) => h.id).sort((a, b) => a - b);
    expect(hits).toEqual([ID("knight", 0), ID("knight", 1), fire].sort((a, b) => a - b));
    // The hint warns of the friend caught in it.
    const aimed = ok(ok(s, command(AIM_ACT)), command(cellAt(6, 4)));
    expect(aimed.preview).toBe(cellAt(6, 4));
    expect(R.hint(aimed)).toContain("아군 2명도 맞습니다");
  });
  test("light runs straight for four, through everyone in its way, and stops at a tree", () => {
    const light = ID("light", 0),
      // Forest row 6: a tree stands at (6, 2).
      s = lay("forest", { [light]: { cell: cellAt(6, 0) }, [ID("knight", 0)]: { cell: cellAt(5, 0) }, [ID("archer", 1)]: { cell: cellAt(4, 0) }, [ID("knight", 1)]: { cell: cellAt(6, 3) } }, light),
      unit = R.activeUnit(s),
      lines = R.beams(s, unit.cell);
    expect(lines[1]).toEqual([cellAt(6, 1)]);
    expect(lines[0]).toEqual(row(5, 0).concat(row(4, 0), row(3, 0), row(2, 0)));
    // Any tile of a line aims the whole line; it hits the friend and the enemy on it.
    expect(R.canonical(s, unit.cell, unit, cellAt(3, 0))).toBe(cellAt(5, 0));
    const hits = R.hitsOf(s, unit, unit.cell, cellAt(5, 0)).map((h) => h.id);
    expect(hits.sort()).toEqual([ID("knight", 0), ID("archer", 1)].sort());
    const done = ok(s, strike(s, cellAt(3, 0)));
    expect(done.last?.area).toEqual(lines[0]);
  });
  test("the healer heals a hurt friend beside her or herself, never past full, and strikes no one", () => {
    const healer = ID("healer", 0),
      knight = ID("knight", 0),
      s = lay("forest", { [healer]: { cell: cellAt(8, 4), hp: 30 }, [knight]: { cell: cellAt(8, 5), hp: 20 }, [ID("archer", 0)]: { cell: cellAt(8, 3) }, [ID("knight", 1)]: { cell: cellAt(7, 4), hp: 3 } }, healer);
    // Full herself, the archer whole: only the knight is offered.
    expect(R.targetsFrom(s, R.activeUnit(s), cellAt(8, 4))).toEqual([cellAt(8, 5)]);
    const healed = ok(s, strike(s, cellAt(8, 5)));
    expect(healed.units[knight].hp).toBe(20 + R.HEAL);
    expect(healed.units[ID("knight", 1)].hp).toBe(3);
    expect(healed.last?.kind).toBe("heal");
    // (With a friend elsewhere: a healer alone on her side would be the angel.)
    const nearly = lay("forest", { [healer]: { cell: cellAt(8, 4), hp: 25 }, [knight]: { cell: cellAt(9, 1) }, [ID("knight", 1)]: { cell: cellAt(2, 4) } }, healer);
    const self = ok(nearly, strike(nearly, cellAt(8, 4)));
    expect(self.units[healer].hp).toBe(30);
  });
});

describe("tactical battle: damage", () => {
  const knight = ID("knight", 0),
    archer = ID("archer", 1);
  const at = (place: Place, target: Place, attacker = knight) => {
    const s = lay("forest", { [attacker]: place, [archer]: target, [ID("knight", 1)]: { cell: cellAt(0, 4) } }, attacker);
    return R.damageOf(s, s.units[attacker], place.cell, s.units[archer]).amount;
  };
  test("attack less defence, from the front on level ground", () => {
    // Knight 16 against the archer's 3: 13. On forest row 8 everything is level.
    expect(at({ cell: cellAt(8, 4) }, { cell: cellAt(7, 4), facing: 2 })).toBe(13);
  });
  test("a quarter more from higher ground and a quarter less from lower", () => {
    // Forest (6, 8) is two levels up, (7, 8) one: the knight above strikes harder, below weaker.
    const f = R.fieldOf("forest");
    expect(f.height[cellAt(6, 8)]).toBeGreaterThan(f.height[cellAt(7, 8)]);
    expect(at({ cell: cellAt(6, 8) }, { cell: cellAt(7, 8), facing: 0 })).toBe(Math.round(13 * 1.25));
    expect(at({ cell: cellAt(7, 8) }, { cell: cellAt(6, 8), facing: 2 })).toBe(Math.round(13 * 0.75));
  });
  test("half more from behind, a quarter more from the side, and the assassin twice from behind", () => {
    // The archer at (7, 4) looks toward the far edge: the knight below her at (8, 4) is behind her.
    expect(at({ cell: cellAt(8, 4) }, { cell: cellAt(7, 4), facing: 0 })).toBe(Math.round(13 * 1.5));
    expect(at({ cell: cellAt(8, 4) }, { cell: cellAt(7, 4), facing: 1 })).toBe(Math.round(13 * 1.25));
    const assassin = ID("assassin", 0);
    expect(at({ cell: cellAt(8, 4) }, { cell: cellAt(7, 4), facing: 0 }, assassin)).toBe((R.JOBS.assassin.power - R.JOBS.archer.def) * 2);
    expect(at({ cell: cellAt(8, 4) }, { cell: cellAt(7, 4), facing: 2 }, assassin)).toBe(R.JOBS.assassin.power - R.JOBS.archer.def);
  });
  test("at least one, however thick the armour", () => {
    const s = lay("forest", { [ID("light", 0)]: { cell: cellAt(8, 4) }, [ID("knight", 1)]: { cell: cellAt(7, 4), facing: 2 } }, ID("light", 0));
    // A made-up weak strike: the rule still leaves one.
    const weak = { ...s.units[ID("light", 0)], job: "healer" as R.Job };
    expect(R.damageOf(s, weak, cellAt(8, 4), s.units[ID("knight", 1)]).amount).toBe(1);
  });
  test("struck units lose health and fall at nothing, and the strike turns the striker toward its target", () => {
    const s = lay("forest", { [knight]: { cell: cellAt(8, 4), facing: 1 }, [archer]: { cell: cellAt(7, 4), facing: 2, hp: 10 }, [ID("knight", 1)]: { cell: cellAt(0, 4) } }, knight),
      done = ok(s, strike(s, cellAt(7, 4)));
    expect(done.units[archer].hp).toBe(0);
    expect(done.units[archer].cell).toBe(-1);
    expect(done.units[knight].facing).toBe(0);
    expect(done.last?.hits?.[0]).toMatchObject({ id: archer, amount: 13, fell: true });
  });
});

describe("tactical battle: the angel", () => {
  test("a healer left alone on her side becomes the angel, who kills at a stroke and falls to any hit", () => {
    const archer = ID("archer", 0),
      knight1 = ID("knight", 1),
      healer1 = ID("healer", 1),
      s = lay("forest", { [archer]: { cell: cellAt(8, 4) }, [ID("knight", 0)]: { cell: cellAt(9, 4) }, [knight1]: { cell: cellAt(6, 4), hp: 5 }, [healer1]: { cell: cellAt(2, 4) } }, archer),
      done = ok(s, strike(s, cellAt(6, 4)));
    expect(done.units[knight1].hp).toBe(0);
    const angel = done.units[healer1];
    expect(angel.job).toBe("angel");
    expect(angel.hp).toBe(1);
    expect(R.JOBS.angel.def).toBe(0);
    expect(done.last?.angels).toEqual([healer1]);
    expect(done.winner).toBeNull();
    // Her strike reaches eight and fells even a whole knight; any strike fells her.
    const hers = { ...done, active: healer1, moved: false, acted: false };
    const targets = R.targetsFrom(hers, angel, angel.cell);
    expect(targets).toContain(cellAt(8, 4));
    expect(targets).toContain(cellAt(9, 4));
    expect(R.damageOf(hers, angel, angel.cell, hers.units[ID("knight", 0)]).amount).toBe(R.JOBS.knight.hp);
    const slain = ok(hers, strike(hers, cellAt(9, 4)));
    expect(slain.units[ID("knight", 0)].hp).toBe(0);
    expect(R.damageOf(hers, hers.units[archer], cellAt(8, 4), angel).amount).toBeGreaterThanOrEqual(angel.hp);
    // She flies: neither water nor heights stop her.
    expect(R.reach(hers, angel).dests.length).toBeGreaterThan(30);
    expect(tacticsConfig.cheer?.(s, done, "ai")).toBe("천사 강림!");
  });
  test("it happens for either side, and not while a healer has a friend left", () => {
    const fire = ID("fire", 1),
      s = lay("forest", { [fire]: { cell: cellAt(3, 4) }, [ID("healer", 0)]: { cell: cellAt(9, 5) }, [ID("knight", 0)]: { cell: cellAt(6, 4), hp: 2 }, [ID("archer", 0)]: { cell: cellAt(8, 8) } }, fire),
      once = ok(s, strike(s, cellAt(6, 4)));
    expect(once.units[ID("healer", 0)].job).toBe("healer");
    const t = lay("forest", { [fire]: { cell: cellAt(3, 4) }, [ID("healer", 0)]: { cell: cellAt(9, 5) }, [ID("knight", 0)]: { cell: cellAt(6, 4), hp: 2 } }, fire),
      twice = ok(t, strike(t, cellAt(6, 4)));
    expect(twice.units[ID("healer", 0)].job).toBe("angel");
  });
});

describe("tactical battle: choosing, winning", () => {
  test("choosing what to do counts no move; a tile is tapped once to be seen and again to be struck", () => {
    const knight = ID("knight", 0),
      s = lay("forest", { [knight]: { cell: cellAt(8, 4) }, [ID("archer", 1)]: { cell: cellAt(7, 4) }, [ID("knight", 1)]: { cell: cellAt(0, 4) } }, knight);
    expect(R.moves(s).map((m) => m.to)).toEqual([AIM_MOVE, AIM_ACT, WAIT]);
    const moving = ok(s, command(AIM_MOVE));
    expect(moving.ply).toBe(0);
    expect(R.moves(moving).map((m) => m.to)).toContain(CANCEL);
    expect(R.moves(moving).map((m) => m.to)).toContain(cellAt(8, 5));
    expect(ok(moving, command(CANCEL)).aim).toBeNull();
    const aiming = ok(s, command(AIM_ACT)),
      seen = ok(aiming, command(cellAt(7, 4)));
    expect(seen.preview).toBe(cellAt(7, 4));
    expect(seen.ply).toBe(0);
    expect(seen.units[ID("archer", 1)].hp).toBe(R.JOBS.archer.hp);
    const struck = ok(seen, command(cellAt(7, 4)));
    expect(struck.ply).toBe(1);
    expect(struck.units[ID("archer", 1)].hp).toBe(R.JOBS.archer.hp - 13);
    // Tiles that are not offered are refused.
    expect(R.play(aiming, command(cellAt(5, 5)))).toBeNull();
  });
  test("the battle is won when every enemy has fallen", () => {
    const knight = ID("knight", 0),
      archer = ID("archer", 1),
      s = lay("forest", { [knight]: { cell: cellAt(8, 4) }, [archer]: { cell: cellAt(7, 4), hp: 4 } }, knight),
      won = ok(s, strike(s, cellAt(7, 4)));
    expect(won.winner).toBe(0);
    expect(R.moves(won)).toEqual([]);
    expect(R.reason(won)).toMatch(/^청군이 홍군을 모두 물리쳤습니다\./);
    expect(tacticsConfig.game.tally(won)).toEqual(["1명", "0명"]);
  });
  test("a battle that goes on too long is drawn", () => {
    let s = R.createGame("river");
    s = { ...s, turns: R.LIMIT - 1 };
    const drawn = ok(s, command(WAIT));
    expect(drawn.winner).toBe("draw");
    expect(R.reason(drawn)).toContain(`${R.LIMIT}번`);
  });
});

describe("tactical battle: the computer", () => {
  test("it plays whole battles against itself to an end, quickly, on every map and level", () => {
    const random = seededRandom(11);
    let decided = 0;
    for (const { id } of R.FIELDS)
      for (const [a, b] of [
        ["hard", "normal"],
        ["easy", "hard"],
      ] as const) {
        let s = R.createGame(id),
          commands = 0,
          slowest = 0;
        while (s.winner === null && commands < 4000) {
          const side = R.activeUnit(s).side,
            began = performance.now(),
            move = chooseMove(s, side === 0 ? a : b, random);
          slowest = Math.max(slowest, performance.now() - began);
          expect(move).not.toBeNull();
          s = ok(s, move!);
          commands++;
        }
        expect(s.winner, `${id} ${a} against ${b}`).not.toBeNull();
        expect(slowest).toBeLessThan(300);
        if (s.winner !== "draw") decided++;
      }
    expect(decided).toBeGreaterThanOrEqual(4);
  }, 60000);
  test("it strikes a unit it can fell rather than wait, and keeps its fire off its own", () => {
    const knight = ID("knight", 1),
      s = lay("forest", { [knight]: { cell: cellAt(3, 2) }, [ID("archer", 0)]: { cell: cellAt(5, 2), hp: 5 }, [ID("knight", 0)]: { cell: cellAt(9, 0) } }, knight);
    const turn = (state: R.State, level: "easy" | "normal" | "hard") => {
      let t = state;
      for (let k = 0; k < 3 && t.active === state.active && t.winner === null; k++) t = ok(t, chooseMove(t, level, seededRandom(3))!);
      return t;
    };
    expect(turn(s, "normal").units[ID("archer", 0)].hp).toBe(0);
    // The archer stands beside the red knight: a cross that catches her and spares him is always there.
    const fire = ID("fire", 1),
      u = lay("forest", { [fire]: { cell: cellAt(2, 4) }, [ID("knight", 1)]: { cell: cellAt(6, 4) }, [ID("archer", 0)]: { cell: cellAt(6, 5) }, [ID("knight", 0)]: { cell: cellAt(9, 0) } }, fire);
    for (const level of ["normal", "hard"] as const) {
      const after = turn(u, level);
      expect(after.units[ID("knight", 1)].hp).toBe(R.JOBS.knight.hp);
      expect(after.units[ID("archer", 0)].hp).toBeLessThan(R.JOBS.archer.hp);
    }
  });
});

describe("tactical battle: layout", () => {
  test("tiles stand on the plinth at their height, water lower, and the camera's subject keeps the field in view", () => {
    const f = R.fieldOf("river"),
      water = f.ground.indexOf("water");
    expect(tileTop("river", water)).toBeLessThan(tileTop("river", cellAt(9, 0)));
    expect(tileTop("forest", cellAt(4, 0))).toBeGreaterThan(tileTop("forest", cellAt(4, 3)));
    // Turning the field a quarter moves a corner tile to the next corner.
    const a = tilePoint("forest", cellAt(9, 0), 0),
      b = tilePoint("forest", cellAt(9, 0), 1);
    expect(Math.hypot(a.x, a.z)).toBeCloseTo(Math.hypot(b.x, b.z));
    expect(Math.abs(a.x - b.x) + Math.abs(a.z - b.z)).toBeGreaterThan(1);
    for (const aspect of [0.8, 1.4, 2.4]) expect(tacticsSubject(aspect).halfZ).toBeGreaterThan(6);
  });
});
