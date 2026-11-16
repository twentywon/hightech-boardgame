import { describe, expect, test } from "vitest";
import { seededRandom } from "../src/core/ai";
import * as wr from "../src/games/whack/rules";
import * as ws from "../src/games/whack/sim";

describe("whack-a-mole", () => {
  test("the clock runs the round out, and only what the machine reports changes the score", () => {
    let s = wr.createGame(2);
    expect(s.left).toBe(wr.ROUND);
    s = wr.play(s, { from: -1, to: wr.HIT + 10, extra: -1 })!;
    s = wr.play(s, { from: -1, to: wr.MISS, extra: -1 })!;
    s = wr.play(s, { from: -1, to: wr.ESCAPE, extra: -1 })!;
    expect([s.score, s.hits, s.misses, s.escapes]).toEqual([10, 1, 1, 1]);
    expect(wr.play(s, { from: -1, to: wr.HIT, extra: -1 })).toBeNull();
    for (let k = 0; k < wr.ROUND; k++) s = wr.play(s, { from: -1, to: wr.TICK, extra: -1 })!;
    expect(s.left).toBe(0);
    expect(s.winner).toBe(0);
    expect(wr.play(s, { from: -1, to: wr.TICK, extra: -1 })).toBeNull();
  });
  test("moles come up in free holes, go down by themselves, and a blow knocks one that is out", () => {
    const world = ws.createWorld(2, seededRandom(3)),
      seen: ws.Happening[] = [];
    let seconds = 0;
    for (let k = 0; k < 60 * 6; k++)
      for (const event of ws.step(world, wr.ROUND)) {
        if (event.kind === "second") seconds++;
        seen.push(event);
      }
    expect(seconds).toBe(6);
    expect(seen.some((e) => e.kind === "escape")).toBe(true);
    // A blow on an empty hole is a miss; on a mole that is up, a hit for its worth.
    const empty = world.moles.findIndex((m) => !m);
    expect(ws.whack(world, empty)).toEqual({ kind: "miss", hole: empty });
    world.moles[empty] = { kind: ws.PLAIN, phase: "up", t: 0, stay: 1, height: 1, hits: 1 };
    const hit = ws.whack(world, empty);
    expect(hit).toMatchObject({ kind: "hit", mole: ws.PLAIN, points: ws.WORTH[ws.PLAIN] });
    // Knocked, it cannot be hit again.
    expect(ws.whack(world, empty).kind).toBe("miss");
  });
  test("a hard hat takes two blows, a run of hits earns more, and a miss breaks it", () => {
    const world = ws.createWorld(1, seededRandom(4)),
      up = (kind: number) => ({ kind, phase: "up" as const, t: 0, stay: 1, height: 1, hits: kind === ws.HELMET ? 2 : 1 });
    world.moles[0] = up(ws.HELMET);
    expect(ws.whack(world, 0).kind).toBe("clink");
    expect(ws.whack(world, 0)).toMatchObject({ kind: "hit", points: ws.WORTH[ws.HELMET] });
    for (let n = 0; n < 4; n++) {
      world.moles[1] = up(ws.PLAIN);
      ws.whack(world, 1);
    }
    expect(world.combo).toBe(5);
    world.moles[2] = up(ws.PLAIN);
    expect((ws.whack(world, 2) as { points: number }).points).toBe(ws.WORTH[ws.PLAIN] + 8);
    ws.whack(world, 3);
    expect(world.combo).toBe(0);
    // The hole under a point of the top, or none between them.
    expect(ws.holeAt(ws.HOLES[4][0] + 0.3, ws.HOLES[4][1])).toBe(4);
    expect(ws.holeAt(0, -1.1)).toBe(-1);
  });
});
