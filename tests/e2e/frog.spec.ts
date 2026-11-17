import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as frogRules from "../../src/games/frog/rules";
import { frogAt, frogSubject, stumpAt } from "../../src/games/frog/layout";

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
  await selectGame(page, "개구리 징검다리");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(frogRules.STAGES.length);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").nth(stage - 1).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  return errors;
}
/** Where the table's camera shows a point, and a tap there (a touch on the phone), for a row of `n` stumps. */
async function aim(page: Page, n: number, mobile: boolean) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = frogSubject(n, aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const at = (x: number, y: number, z: number) => {
    const v = new Vector3(x, y, z).project(camera);
    return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
  };
  const tap = async (p: { x: number; y: number }) => {
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  const frog = (i: number) => {
      const f = frogAt(n, i);
      return at(f.x, f.y, f.z);
    },
    stump = (i: number) => {
      const s = stumpAt(n, i);
      return at(s.x, s.top, s.z);
    };
  return { frog, stump, onFrog: (i: number) => tap(frog(i)), onStump: (i: number) => tap(stump(i)) };
}

test("frog hop: entered through its stage window, a seeded puzzle is solved by taps", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 79),
    errors = await sit(page, 1);
  // A row was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  frogRules.createGame(1, random);
  let state = frogRules.createGame(1, random);
  const { onFrog } = await aim(page, state.frogs.length, mobile);
  // A frog that has nowhere to go moves nothing when tapped.
  const stuck = state.frogs.findIndex((f, i) => f !== frogRules.NONE && frogRules.targets(state, i).length === 0);
  expect(stuck).toBeGreaterThanOrEqual(0);
  await onFrog(stuck);
  await page.waitForTimeout(400);
  await expect(moves(page)).toHaveText("0수");
  // With one empty stump every frog that can move has one way to go: a tap sends it there.
  const plan = frogRules.solve(state)!;
  expect(plan.length).toBe(state.best);
  for (const [k, move] of plan.entries()) {
    expect(frogRules.targets(state, move.from)).toEqual([move.to]);
    await onFrog(move.from);
    await expect(moves(page)).toHaveText(`${k + 1}수`, { timeout: 20000 });
    await settled(page);
    state = frogRules.play(state, move)!;
  }
  expect(state.winner).toBe(0);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  expect(errors).toEqual([]);
});

test("frog hop: with two empty stumps a frog is picked up by a tap and set down on the stump tapped (or dragged to)", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 75),
    errors = await sit(page, frogRules.STAGES.length);
  // The row laid as the screen was set up is of the first stage; the card lays the one chosen.
  frogRules.createGame(1, random);
  let state = frogRules.createGame(frogRules.STAGES.length, random);
  const { frog, stump, onFrog, onStump } = await aim(page, state.frogs.length, mobile),
    plan = frogRules.solve(state)!;
  let picked = -1;
  for (const [k, move] of plan.entries()) {
    const ways = frogRules.targets(state, move.from);
    if (picked >= 0 && !mobile) {
      // The move after a pick is made by dragging the frog onto its stump.
      const a = frog(move.from),
        b = stump(move.to);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
      await page.mouse.move(b.x, b.y - 20, { steps: 4 });
      await page.mouse.up();
    } else {
      await onFrog(move.from);
      if (ways.length > 1) {
        // Picked up: nothing has moved until its stump is tapped.
        await page.waitForTimeout(300);
        await expect(moves(page)).toHaveText(`${k}수`);
        await onStump(move.to);
        picked = k;
      }
    }
    await expect(moves(page)).toHaveText(`${k + 1}수`, { timeout: 20000 });
    await settled(page);
    state = frogRules.play(state, move)!;
    if (picked >= 0 && k > picked) break;
  }
  expect(picked).toBeGreaterThanOrEqual(0);
  // 무르기 takes the last move back.
  const made = picked + 2;
  await page.locator("#pg-undo").click();
  await expect(moves(page)).toHaveText(`${made - 1}수`);
  expect(errors).toEqual([]);
});
