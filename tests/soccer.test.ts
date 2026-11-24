import { describe, expect, test } from "vitest";
import { CAP, DEFAULT_ROSTER, addComputer, homeTeam, moveRow, playMode, readRoster, rosterProblem, waiting, writeRoster, type Team } from "../src/games/soccer/roster";
import { GOAL, TIME, createGame, soccer } from "../src/games/soccer/rules";
import { BODY, FLAT, GOAL_PAUSE, GRAVITY, GRAVITY_PACE, IDLE, KICKOFF_WAIT, createWorld, step, think, type Input, type World } from "../src/games/soccer/sim";

/** Runs `world` for `n` slices with each player's controls from `control` (the computer's `think` by default); the events seen. */
function run(world: World, n: number, control: (k: number) => Input | null = (k) => think(world, k)) {
  const events: ReturnType<typeof step> = [];
  for (let i = 0; i < n; i++) events.push(...step(world, world.men.map((_, k) => control(k))));
  return events;
}
const snapshot = (w: World) => JSON.stringify([w.ball, w.men, w.phase, w.clock, w.counts]);

describe("soccer waiting room", () => {
  test("rosters read back legal: caps by mode, 나 and 2P once, the usual start for anything unreadable", () => {
    expect(writeRoster(readRoster("MC|CC", "flat"))).toBe("MC|CC");
    expect(writeRoster(readRoster("MCCC|CPCC", "flat"))).toBe("MCC|CPC");
    expect(writeRoster(readRoster("MCC|CC", "gravity"))).toBe("MC|CC");
    expect(writeRoster(readRoster("MM|PP", "flat"))).toBe("M|P");
    expect(writeRoster(readRoster("nonsense", "flat"))).toBe(DEFAULT_ROSTER);
    expect(writeRoster(readRoster(undefined, "gravity"))).toBe(DEFAULT_ROSTER);
    expect(CAP).toEqual({ flat: 3, gravity: 2 });
  });
  test("rows move between the camps; a full team takes nobody; a computer sent to the middle is gone", () => {
    let r = readRoster("M|C", "gravity");
    expect(waiting(r)).toEqual(["p2"]);
    // 2P from the waiting list to blue.
    r = moveRow(r, { team: null, index: 0, who: "p2" }, 1, "gravity")!;
    expect(writeRoster(r)).toBe("M|CP");
    // Blue is full (2 in gravity): nobody more, me neither.
    expect(moveRow(r, { team: 0, index: 0, who: "me" }, 1, "gravity")).toBeNull();
    expect(addComputer(r, 1, "gravity")).toBeNull();
    // The computer to the waiting list: taken away.
    r = moveRow(r, { team: 1, index: 0, who: "cpu" }, null, "gravity")!;
    expect(writeRoster(r)).toBe("M|P");
    expect(playMode(r)).toBe("local");
    expect(homeTeam(r)).toBe(0);
    // A stale place does nothing.
    expect(moveRow(r, { team: 1, index: 0, who: "cpu" }, 0, "gravity")).toBeNull();
    // Uneven teams are fine; an empty one is not.
    r = addComputer(moveRow(r, { team: 1, index: 0, who: "p2" }, 0, "gravity")!, 1, "gravity")!;
    expect(writeRoster(r)).toBe("MP|C");
    expect(playMode(r)).toBe("ai");
    expect(rosterProblem(r, "gravity")).toBeNull();
    expect(rosterProblem(readRoster("|C", "flat"), "flat")).toContain("레드");
    // Nobody at the screen plays: the computer against itself, told for red.
    const watch = readRoster("C|CC", "flat");
    expect(playMode(watch)).toBe("local");
    expect(homeTeam(watch)).toBe(0);
  });
});

describe("soccer rules", () => {
  test("a match: players from the roster, the score limit ends it, side 0 is my team", () => {
    const s = createGame("flat", { roster: "C|MCC", goals: "3", minutes: "0", level: "expert" });
    expect(s.players.map((p) => `${p.team}${p.who}`)).toEqual(["0cpu", "1me", "1cpu", "1cpu"]);
    expect([s.home, s.goals, s.minutes, s.level]).toEqual([1, 3, 0, "expert"]);
    let t = s;
    for (const team of [1, 0, 1, 1]) t = soccer.play(t, { from: -1, to: GOAL + team, extra: -1 })!;
    expect(t.score).toEqual([1, 3]);
    expect(t.champion).toBe(1);
    // Blue won and I am blue: side 0 won.
    expect(soccer.winner(t)).toBe(0);
    expect(soccer.reason(t)).toMatch(/^블루 팀이 3 대 1로 이겼습니다\./);
    expect(soccer.moves(t)).toEqual([]);
    expect(soccer.play(t, { from: -1, to: GOAL, extra: -1 })).toBeNull();
    // No time limit: the clock's end is no move.
    expect(soccer.play(s, { from: -1, to: TIME, extra: -1 })).toBeNull();
  });
  test("the clock's end: the leader wins, a tie goes to golden goal; both limits open-ended is not allowed", () => {
    const s = createGame("gravity", { roster: "M|C", goals: "0", minutes: "1" });
    const lead = soccer.play(soccer.play(s, { from: -1, to: GOAL + 1, extra: -1 })!, { from: -1, to: TIME, extra: -1 })!;
    expect(lead.champion).toBe(1);
    expect(soccer.winner(lead)).toBe(1);
    const tie = soccer.play(s, { from: -1, to: TIME, extra: -1 })!;
    expect([tie.overtime, tie.champion]).toEqual([true, null]);
    expect(soccer.play(tie, { from: -1, to: TIME, extra: -1 })).toBeNull();
    const golden = soccer.play(tie, { from: -1, to: GOAL, extra: -1 })!;
    expect(golden.champion).toBe(0);
    expect(soccer.reason(golden)).toContain("연장 골든골");
    expect(createGame("flat", { goals: "0", minutes: "0" }).goals).toBe(3);
    // A team left empty gets a computer.
    expect(createGame("flat", { roster: "M|" }).players.map((p) => p.who)).toEqual(["me", "cpu"]);
  });
});

describe("soccer pitch", () => {
  test("the same controls give the same match, slice for slice", () => {
    for (const mode of ["flat", "gravity"] as const) {
      const teams: Team[] = mode === "flat" ? [0, 0, 0, 1, 1, 1] : [0, 0, 1, 1];
      const a = createWorld(mode, teams, "normal", 42, 3600),
        b = createWorld(mode, teams, "normal", 42, 3600);
      run(a, 60 * 40);
      run(b, 60 * 40);
      expect(snapshot(a)).toBe(snapshot(b));
      expect(a.counts.kicks).toBeGreaterThan(5);
      // Another stream for the computer plays another match.
      const c = createWorld(mode, teams, "normal", 43, 3600);
      run(c, 60 * 40);
      expect(snapshot(c)).not.toBe(snapshot(a));
    }
  });
  test("flat: a kick sends the ball hard from close by only; a ball over the line between the posts is a goal, then the conceding team kicks off", () => {
    const w = createWorld("flat", [0, 1]);
    // Out of reach, a kick does nothing.
    const me = w.men[0];
    Object.assign(me, { x: -1, y: 0 });
    run(w, 1, (k) => (k === 0 ? { x: 0, y: 0, kick: true, kickPress: true } : IDLE));
    expect(w.ball.vx).toBe(0);
    // Touching, it does: the kickoff is taken.
    Object.assign(me, { x: -(me.r + w.ball.r + 0.04), y: 0, vx: 0, vy: 0 });
    const events = run(w, 1, (k) => (k === 0 ? { x: 0, y: 0, kick: true, kickPress: true } : IDLE));
    expect(events.some((e) => e.kind === "kick")).toBe(true);
    expect(w.ball.vx).toBeGreaterThan(BODY.flat.kick * 0.9);
    expect(w.phase).toBe("play");
    // The ball rolls into the right goal (red's attack) and red scores.
    Object.assign(w.ball, { x: FLAT.HX - 1, y: 0.3, vx: 0.2, vy: 0 });
    const goal = run(w, 30, () => IDLE).find((e) => e.kind === "goal");
    expect(goal).toEqual({ kind: "goal", team: 0 });
    expect(w.phase).toBe("goal");
    // Inside the goal the net holds it.
    run(w, 60, () => IDLE);
    expect(w.ball.x).toBeLessThanOrEqual(FLAT.HX + FLAT.DEPTH);
    expect(Math.abs(w.ball.y)).toBeLessThan(FLAT.GOAL);
    run(w, GOAL_PAUSE, () => IDLE);
    expect(w.phase).toBe("kickoff");
    expect(w.kickoff).toBe(1);
    expect([w.ball.x, w.ball.y]).toEqual([0, 0]);
    // Wide of the posts the end line sends it back; a post knocks it away.
    Object.assign(w.ball, { x: FLAT.HX - 0.5, y: 2.4, vx: 0.2, vy: 0 });
    w.phase = "play";
    expect(run(w, 20, () => IDLE).some((e) => e.kind === "goal")).toBe(false);
    expect(w.ball.vx).toBeLessThan(0);
    Object.assign(w.ball, { x: FLAT.HX - 0.8, y: FLAT.GOAL, vx: 0.2, vy: 0 });
    expect(run(w, 20, () => IDLE).some((e) => e.kind === "post")).toBe(true);
    expect(w.ball.vx).toBeLessThan(0);
  });
  test("flat kickoff: the other team keeps out of the centre circle and its own half until the ball is touched, or the wait runs out", () => {
    const w = createWorld("flat", [0, 1]);
    // Blue does not kick off: it runs at the ball and is held at the circle.
    run(w, 240, (k) => (k === 1 ? { x: -1, y: 0, kick: false } : IDLE));
    const blue = w.men[1];
    expect(Math.hypot(blue.x, blue.y)).toBeGreaterThanOrEqual(FLAT.CIRCLE + blue.r - 1e-9);
    expect(w.ball.vx).toBe(0);
    // Red (kicking off) may walk into the circle but not over the halfway line elsewhere.
    run(w, 60, (k) => (k === 0 ? { x: 0, y: 1, kick: false } : IDLE));
    expect(w.men[0].x).toBeLessThanOrEqual(-w.men[0].r + 1e-9);
    // Nobody kicks off: after the wait it is open play.
    run(w, KICKOFF_WAIT, () => IDLE);
    expect(w.phase).toBe("play");
  });
  test("gravity: players fall, stand, jump only from the ground; the ball bounces; a ball under the crossbar past the goal line is a goal", () => {
    const w = createWorld("gravity", [0, 1]),
      me = w.men[0];
    Object.assign(me, { y: 2, ground: false });
    run(w, 80, () => IDLE);
    expect(me.y).toBeCloseTo(me.r, 6);
    expect(me.ground).toBe(true);
    // A jump from the ground goes up; held in the air it does not jump again.
    run(w, 1, (k) => (k === 0 ? { x: 0, y: 0, kick: false, jump: true, jumpPress: true } : IDLE));
    expect(me.vy).toBeGreaterThan(0.15);
    // Slices scaled by the pitch's pace (a slower pitch rises and falls in more of them).
    run(w, Math.round(12 / GRAVITY_PACE), (k) => (k === 0 ? { x: 0, y: 0, kick: false, jump: true } : IDLE));
    const top = me.y;
    expect(top).toBeGreaterThan(1);
    run(w, Math.round(10 / GRAVITY_PACE), (k) => (k === 0 ? { x: 0, y: 0, kick: false, jump: true, jumpPress: true } : IDLE));
    expect(me.vy).toBeLessThan(0);
    // Dropped, the ball bounces back up off the grass.
    Object.assign(w.ball, { x: 2, y: 3, vx: 0, vy: 0 });
    let rose = false;
    for (let i = 0; i < 120; i++) {
      run(w, 1, () => IDLE);
      if (w.ball.vy > 0.05 && w.ball.y < 1.5) rose = true;
    }
    expect(rose).toBe(true);
    expect(w.ball.y).toBeLessThan(GRAVITY.H);
    // A kick lifts it.
    Object.assign(w.ball, { x: 0, y: w.ball.r, vx: 0, vy: 0 });
    Object.assign(me, { x: -(me.r + w.ball.r + 0.05), y: me.r, vx: 0, vy: 0, ground: true });
    run(w, 1, (k) => (k === 0 ? { x: 0, y: 0, kick: true, kickPress: true } : IDLE));
    expect(w.ball.vy).toBeGreaterThan(0.05);
    expect(w.ball.vx).toBeGreaterThan(0.05);
    // Over the crossbar is no goal; under it is.
    w.phase = "play";
    Object.assign(w.ball, { x: GRAVITY.GL - 0.6, y: GRAVITY.GH + 0.6, vx: 0.15, vy: 0 });
    expect(run(w, 10, () => IDLE).some((e) => e.kind === "goal")).toBe(false);
    Object.assign(w.ball, { x: -GRAVITY.GL + 0.6, y: 0.6, vx: -0.15, vy: 0 });
    expect(run(w, Math.round(20 / GRAVITY_PACE), () => IDLE).find((e) => e.kind === "goal")).toEqual({ kind: "goal", team: 1 });
  });
  test("the computer scores against an idle player, at every level, on both pitches", () => {
    for (const mode of ["flat", "gravity"] as const)
      for (const level of ["beginner", "normal", "expert"] as const) {
        const w = createWorld(mode, [0, 1], level, 7);
        const goals = run(w, 60 * 120, (k) => (k === 0 ? IDLE : think(w, k))).filter((e) => e.kind === "goal");
        expect(goals.length, `${mode} ${level}`).toBeGreaterThan(0);
        expect(goals.every((e) => e.kind === "goal" && e.team === 1)).toBe(true);
      }
  });
  test("the clock runs except while a goal is celebrated, and its end is told once", () => {
    const w = createWorld("flat", [0, 1], "normal", 1, 120);
    const told = run(w, 400, () => IDLE).filter((e) => e.kind === "time");
    expect(told.length).toBe(1);
    expect(w.clock).toBe(400);
  });
});
