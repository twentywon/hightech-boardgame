import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as marbleRules from "../../src/games/marbledrop/rules";
import { BOARD_TOP, STOREY, TRAY_TOP, funnelAt, marbleSubject, plotAt, trayAt } from "../../src/games/marbledrop/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");

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
  await expect(dialog.locator(".stage-card")).toHaveCount(marbleRules.STAGES.length);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").nth(stage - 1).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  return errors;
}
/**
 * The table as its camera shows it: where a point is on the screen, a tap (a touch on the phone), and the drag of
 * a tray piece by its top onto a plot. A carried piece keeps the offset from the pointer it was taken up with,
 * followed on the board's top, so the drag ends where that offset brings the piece's foot onto the plot.
 */
async function table(page: Page, size: number, mobile: boolean) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = marbleSubject(size, aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const at = (x: number, y: number, z: number) => {
    const v = new Vector3(x, y, z).project(camera);
    return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
  };
  const ground = (p: { x: number; y: number }) => {
    const ray = new Raycaster(),
      hit = new Vector3();
    ray.setFromCamera(new Vector2(((p.x - box.x) / box.width) * 2 - 1, -(((p.y - box.y) / box.height) * 2 - 1)), camera);
    ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -BOARD_TOP), hit);
    return hit;
  };
  const tap = async (p: { x: number; y: number }) => {
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  /** The middle of the top of tray piece j, where it stands. */
  const top = (state: marbleRules.State, j: number) => {
    const piece = state.tray[j],
      foot = piece.at >= 0 ? plotAt(size, piece.at, aspect) : trayAt(size, state.tray.length, j, aspect),
      base = piece.at >= 0 ? BOARD_TOP : TRAY_TOP + 0.01;
    return { foot, screen: at(foot.x, base + piece.height * STOREY, foot.z) };
  };
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
  };
  return {
    at,
    tap,
    /** Taps tray piece j's top (a piece on the board turns a quarter). */
    onPiece: (state: marbleRules.State, j: number) => tap(top(state, j).screen),
    /** Drags tray piece j by its top onto `plot`. */
    carry: async (state: marbleRules.State, j: number, plot: number) => {
      const { foot, screen } = top(state, j),
        grip = ground(screen),
        to = plotAt(size, plot, aspect);
      await drag(screen, at(to.x + grip.x - foot.x, BOARD_TOP, to.z + grip.z - foot.z));
    },
    /** Drags tray piece j by its top off the board's left edge, onto the bench. */
    away: async (state: marbleRules.State, j: number) => {
      const { foot, screen } = top(state, j),
        edge = plotAt(size, 0, aspect);
      await drag(screen, at(edge.x - 1.1, BOARD_TOP, foot.z));
    },
    funnel: (state: marbleRules.State) => {
      const f = funnelAt(size, state.start.at, state.start.level, aspect);
      return tap(at(f.x, f.y, f.z));
    },
  };
}

test("marble drop maze: the tray's pieces are dragged onto their plots, turned by taps, and the marble runs home", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 80),
    errors = await sit(page, 2);
  // A puzzle was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  marbleRules.createGame(1, random);
  let state = marbleRules.createGame(2, random);
  const n = state.size * state.size,
    { onPiece, carry, funnel } = await table(page, state.size, mobile);
  let made = 0;
  for (const [j, want] of state.answer.entries()) {
    await carry(state, j, want.at);
    await expect(moves(page)).toHaveText(`${++made}수`, { timeout: 20000 });
    await settled(page);
    state = marbleRules.play(state, { from: n + j, to: want.at, extra: -1 })!;
    expect(state.tray[j].at).toBe(want.at);
    // A bare tap on a piece set down turns it a quarter clockwise, until it faces as the answer has it.
    while (marbleRules.normal(state.tray[j].kind, state.tray[j].rot) !== want.rot) {
      await onPiece(state, j);
      await expect(moves(page)).toHaveText(`${++made}수`, { timeout: 20000 });
      await settled(page);
      state = marbleRules.play(state, { from: want.at, to: want.at, extra: -1 })!;
    }
  }
  expect(marbleRules.hint(state)).toEqual({ from: -1, to: marbleRules.GO, extra: -1 });
  // A tap on the start tower's funnel drops the marble.
  await funnel(state);
  await expect(moves(page)).toHaveText(`${made + 1}수`, { timeout: 20000 });
  await settled(page);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  expect(errors).toEqual([]);
});

test("marble drop maze: a piece goes back to the tray, a failing drop is shown and taken back with 무르기", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 81),
    errors = await sit(page, 1);
  marbleRules.createGame(1, random);
  let state = marbleRules.createGame(1, random);
  const n = state.size * state.size,
    { carry, away, funnel } = await table(page, state.size, mobile);
  // Set down, then carried off the board: back in its place in the tray.
  // A plot of the near row, which nothing stands before.
  const free = Array.from({ length: n }, (_, i) => n - 1 - i).find((i) => marbleRules.empty(state, i) && !state.answer.some((a) => a.at === i))!;
  await carry(state, 0, free);
  await expect(moves(page)).toHaveText("1수", { timeout: 20000 });
  await settled(page);
  state = marbleRules.play(state, { from: n, to: free, extra: -1 })!;
  await away(state, 0);
  await expect(moves(page)).toHaveText("2수", { timeout: 20000 });
  await settled(page);
  state = marbleRules.play(state, { from: free, to: n, extra: -1 })!;
  expect(state.tray[0].at).toBe(-1);
  // Dropped with nothing set: the marble comes to grief, and the table says why.
  const trouble = marbleRules.judge(state).trouble!;
  expect(trouble.fault).not.toBeNull();
  await funnel(state);
  await expect(moves(page)).toHaveText("3수", { timeout: 20000 });
  await settled(page);
  await expect(page.locator("#turn")).toContainText(`실패! ${marbleRules.why(trouble.fault)}`);
  await expect(page.locator("#pz-hint")).toBeDisabled();
  await page.locator("#pg-undo").click();
  await expect(moves(page)).toHaveText("2수");
  await settled(page);
  await expect(page.locator("#turn")).not.toContainText("실패!");
  await expect(page.locator("#pz-hint")).toBeEnabled();
  expect(errors).toEqual([]);
});
