import { test, expect, type Page } from "@playwright/test";
import { Box3, PerspectiveCamera, Ray, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as rules from "../../src/games/marbledrop/rules";
import { BOARD_TOP, CARRY, CELL, FUNNEL, HIGH, TRAY_SCALE, TRAY_TOP, TURNTABLE, WIDE, boardMiddle, cellAt, funnelAt, levelY, marbleSubject, trayHeight, trayPlaces } from "../../src/games/marbledrop/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");
const { CELLS, GO } = rules;

/** Stubs the random numbers so that the puzzle laid can be laid here too. */
async function seeded(page: Page, start: number) {
  await page.addInitScript((first) => {
    let seed = first;
    crypto.getRandomValues = ((buffer: Uint32Array) => {
      for (let i = 0; i < buffer.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        buffer[i] = seed * 2;
      }
      return buffer;
    }) as typeof crypto.getRandomValues;
  }, start);
  let seed = start;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed * 2) / 4294967296;
  };
}
/** Enters the game through its stage window and sits down at a stage by its card. */
async function sit(page: Page, stage: number) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "구슬 낙하 미로");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(rules.STAGES.length);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").nth(stage - 1).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  return errors;
}
/**
 * The table as its camera shows it. The camera follows the view's tilt and the turntable its turn, both read from
 * the canvas each time (`data-lift`, `data-turn`), so that every aim follows a view the player has turned. A press is
 * judged by a solid box for every unit (the frames are open), so an aim is taken only where the box of what is aimed
 * at is the first the line of sight meets; otherwise the turntable is turned a little by a drag on its rim.
 */
async function table(page: Page, mobile: boolean) {
  const canvas = page.locator("#board canvas"),
    box = (await canvas.boundingBox())!,
    aspect = box.width / box.height;
  const view = async () => {
    const turn = Number(await canvas.getAttribute("data-turn")),
      lift = Number(await canvas.getAttribute("data-lift")),
      subject = marbleSubject(aspect, lift),
      distance = cameraDistance(aspect, false, subject),
      camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
    camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
    camera.lookAt(0, subject.lookY, 0);
    camera.updateMatrixWorld();
    const screen = (x: number, y: number, z: number) => {
      const v = new Vector3(x, y, z).project(camera);
      return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
    };
    return { turn, camera, screen };
  };
  /** The tag of what the line of sight to `point` meets first: a unit of the board ("start", "g0", "t1"), or "". */
  const firstHit = (state: rules.State, turn: number, camera: PerspectiveCamera, point: Vector3) => {
    let best = Infinity,
      tag = "";
    const up = new Vector3(0, 1, 0),
      test = (owner: string, cell: number, bottom: number, top: number, middle = cellAt(cell, turn, aspect), angle = turn, half = WIDE / 2) => {
        // Into the unit's own frame: about its middle, the turntable's turn undone.
        const from = camera.position.clone().sub(new Vector3(middle.x, 0, middle.z)).applyAxisAngle(up, -angle),
          way = point.clone().sub(camera.position).normalize().applyAxisAngle(up, -angle),
          hit = new Ray(from, way).intersectBox(new Box3(new Vector3(-half, bottom, -half), new Vector3(half, top, half)), new Vector3());
        if (hit && hit.distanceTo(from) < best) {
          best = hit.distanceTo(from);
          tag = owner;
        }
      },
      add = (piece: rules.Piece, owner: string) => {
        for (const v of rules.voxelsOf(piece)) test(owner, v.cell, levelY(v.level), levelY(v.level) + HIGH);
      };
    add(state.start, "start");
    const s = state.start;
    test("start", s.at, levelY(s.level + s.units.length), levelY(s.level + s.units.length) + FUNNEL + 0.1);
    state.given.forEach((p, g) => add(p, `g${g}`));
    // The tray's pieces where they stand in the tray (smaller, a beam lying along x), which the turntable does not turn.
    const places = trayPlaces(state.tray, aspect);
    state.tray.forEach((p, j) => {
      if (p.at >= 0) return add(p, `t${j}`);
      const mid = rules.middle(p.units.length);
      p.units.forEach((_, i) => {
        const column = p.shape === "column",
          bottom = TRAY_TOP + (column ? i : 0) * HIGH * TRAY_SCALE,
          middle = { x: places[j].x + (column ? 0 : (i - mid) * CELL * TRAY_SCALE), z: places[j].z };
        test(`tray${j}`, -1, bottom, bottom + HIGH * TRAY_SCALE, middle, 0, (WIDE / 2) * TRAY_SCALE);
      });
    });
    return tag;
  };
  const tap = async (p: { x: number; y: number }) => {
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
  };
  /** Turns the turntable by dragging across its left rim, where nothing stands. */
  const spin = async (pixels: number) => {
    const { screen } = await view(),
      m = boardMiddle(aspect),
      rim = screen(m.x - TURNTABLE + 0.12, BOARD_TOP, m.z + 0.25);
    await drag(rim, { x: rim.x + pixels, y: rim.y });
    await settled(page);
  };
  /** A point on a placed piece (or the funnel) that nothing hides, turning the table until there is one. */
  const visible = async (state: rules.State, owner: string, points: (turn: number) => Vector3[]) => {
    for (let tries = 0; tries < 8; tries++) {
      const v = await view(),
        seen = points(v.turn).find((p) => firstHit(state, v.turn, v.camera, p) === owner);
      if (seen) return v.screen(seen.x, seen.y, seen.z);
      await spin(90);
    }
    throw new Error(`${owner} stays hidden`);
  };
  return {
    view,
    spin,
    tap,
    /** Drags tray piece j by the top of it in the tray, over the cell `cell` (at the height a carried piece hovers). */
    put: async (state: rules.State, j: number, cell: number) => {
      const { turn, screen } = await view(),
        at = trayPlaces(state.tray, aspect)[j],
        to = cellAt(cell, turn, aspect);
      await drag(screen(at.x, TRAY_TOP + trayHeight(state.tray[j]) - 0.03, at.z), screen(to.x, CARRY, to.z));
    },
    /** Drags placed tray piece j off the board onto the bench (it goes back to the tray). */
    away: async (state: rules.State, j: number) => {
      const top = rules.voxelsOf(state.tray[j]).sort((a, b) => b.level - a.level)[0],
        from = await visible(state, `t${j}`, (turn) => {
          const c = cellAt(top.cell, turn, aspect);
          return [new Vector3(c.x, levelY(top.level) + HIGH - 0.03, c.z)];
        }),
        { screen } = await view(),
        m = boardMiddle(aspect);
      await drag(from, screen(m.x - TURNTABLE - 0.6, CARRY, m.z));
    },
    /** Taps placed tray piece j (it turns a quarter, on to the next way that fits). */
    turn: async (state: rules.State, j: number) => {
      const units = rules.voxelsOf(state.tray[j]).sort((a, b) => b.level - a.level),
        at = await visible(state, `t${j}`, (turn) =>
          units.map((u) => {
            const c = cellAt(u.cell, turn, aspect);
            return new Vector3(c.x, levelY(u.level) + HIGH - 0.03, c.z);
          }),
        );
      await tap(at);
    },
    /** Taps the funnel over the start. */
    funnel: async (state: rules.State) => {
      const at = await visible(state, "start", (turn) => {
        const f = funnelAt(state.start, turn, aspect);
        return [new Vector3(f.x, f.y, f.z)];
      });
      await tap(at);
    },
    /** Drags on the rim to turn the table, and reads back the turn. */
    turned: async () => Number(await canvas.getAttribute("data-turn")),
  };
}
const count = async (page: Page) => Number(((await moves(page).textContent()) ?? "").replace(/\D/g, ""));
const counted = async (page: Page, made: number) => {
  await expect(moves(page)).toHaveText(`${made}수`, { timeout: 30000 });
  await settled(page);
};

test("marble drop maze: the tray's pieces are dragged to their places, turned by taps, and the marble runs home", async ({ page }, info) => {
  test.setTimeout(180000);
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 80),
    errors = await sit(page, 3);
  // A puzzle was laid as the screen was set up; the card pressed in the window lays the third stage's, the one chosen.
  rules.createGame(1, random);
  let state = rules.createGame(3, random);
  expect(state.tray.some((p) => p.shape === "beam")).toBe(true);
  const hand = await table(page, mobile);
  let made = 0;
  // The pieces go in the hint's order: from the bottom up, so that every support is there before what it carries.
  for (let guard = 0; guard < 4 * CELLS; guard++) {
    const move = rules.hint(state)!;
    if (move.to === GO) break;
    expect(move.from).toBeGreaterThanOrEqual(CELLS);
    const j = move.from - CELLS,
      cell = Math.floor((move.to - rules.PUT) / 4);
    await hand.put(state, j, cell);
    state = rules.play(state, { from: CELLS + j, to: cell, extra: -1 })!;
    await counted(page, ++made);
    // A bare tap on a piece set down turns it, until it stands as the answer has it.
    while (rules.matched(state).slotOf[j] < 0) {
      await hand.turn(state, j);
      const from = rules.handle(state, rules.world(state), j);
      state = rules.play(state, { from, to: from, extra: -1 })!;
      await counted(page, ++made);
    }
  }
  expect(rules.hint(state)).toEqual({ from: -1, to: GO, extra: -1 });
  // A tap on the funnel drops the marble.
  await hand.funnel(state);
  await counted(page, ++made);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  expect(errors).toEqual([]);
});

test("marble drop maze: a refused place, a piece back to the tray, a failing drop taken back, and the view turned and set back", async ({ page }, info) => {
  test.setTimeout(150000);
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 81),
    errors = await sit(page, 1);
  rules.createGame(1, random);
  let state = rules.createGame(1, random);
  const hand = await table(page, mobile);
  // Onto the start's cell: refused, the reason in the status line, and nothing made.
  await hand.put(state, 0, state.start.at);
  await settled(page);
  await expect(page.locator("#turn")).toContainText("출발점과 도착점 위에는 아무것도 놓을 수 없습니다.");
  expect(await count(page)).toBe(0);
  // Set down on a free cell of the near row, then dragged off the board: back in the tray.
  const free = [15, 14, 13, 12, 11, 10, 9, 8].find((c) => c !== state.goal && c !== state.start.at && !state.given.some((p) => rules.voxelsOf(p).some((v) => v.cell === c)))!;
  await hand.put(state, 0, free);
  state = rules.play(state, { from: CELLS, to: free, extra: -1 })!;
  await counted(page, 1);
  await hand.away(state, 0);
  state = rules.play(state, { from: rules.handle(state, rules.world(state), 0), to: CELLS, extra: -1 })!;
  await counted(page, 2);
  expect(state.tray[0].at).toBe(-1);
  // Dropped with the tray still full: the marble comes to grief, and the table says why.
  const trouble = rules.judge(state).trouble!;
  await hand.funnel(state);
  await counted(page, 3);
  await expect(page.locator("#turn")).toContainText(`실패! ${rules.why(trouble.fault)}`);
  await expect(page.locator("#pz-hint")).toBeDisabled();
  await page.locator("#pg-undo").click();
  await counted(page, 2);
  await expect(page.locator("#turn")).not.toContainText("실패!");
  await expect(page.locator("#pz-hint")).toBeEnabled();
  // A drag across the rim turns the turntable; 시점 전환 sets it square again.
  await hand.spin(140);
  expect(Math.abs(await hand.turned())).toBeGreaterThan(0.5);
  await page.locator("#camera").click();
  await settled(page);
  await expect(page.locator("#board canvas")).toHaveAttribute("data-turn", "0.0000");
  await expect(page.locator("#board canvas")).toHaveAttribute("data-lift", "0.0000");
  expect(errors).toEqual([]);
});
