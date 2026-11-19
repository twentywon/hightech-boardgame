import { test } from "vitest";
import { createGame, play, JOBS, standing } from "../src/games/tactics/rules";
import { chooseMove } from "../src/games/tactics/ai";
import { seededRandom } from "../src/core/ai";

test("sim", () => {
  for (const field of ["forest", "wall", "river"]) for (const [a, b] of [["normal", "normal"], ["hard", "easy"], ["easy", "hard"], ["hard","hard"]] as const) {
    const random = seededRandom(7);
    let s = createGame(field), worst = 0, total = 0, cmds = 0, acts = { 0: 0, 1: 0 } as any;
    const t0 = performance.now();
    while (s.winner === null && cmds < 3000) {
      const side = s.units[s.active].side;
      const t = performance.now();
      const m = chooseMove(s, side === 0 ? a : b, random)!;
      const dt = performance.now() - t; worst = Math.max(worst, dt); total += dt;
      const n = play(s, m);
      if (!n) throw new Error("refused " + JSON.stringify(m));
      if (n.turns !== s.turns) acts[side]++;
      s = n; cmds++;
    }
    (globalThis as any).out = ((globalThis as any).out ?? "") + [field, a, b, "winner", s.winner, "turns", s.turns, "cmds", cmds, "left", standing(s,0).length, standing(s,1).length, "worst ms", worst.toFixed(1), "avg", (total/cmds).toFixed(1), "total", (performance.now()-t0).toFixed(0), "humanacts", acts[0]].join(" ") + "\n";
  }
  require("fs").writeFileSync("/tmp/claude-0/tactics-probe/out.txt", (globalThis as any).out);
});
