import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as rules from "../../src/games/glide/rules";
import { TILE_TOP, arrowAt, cellAt, glideSubject } from "../../src/games/glide/layout";

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
/** Where a place on the tiles is on the screen, as the view's camera shows it. */
async function onScreen(page: Page, w: number, h: number, at: { x: number; z: number }) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = glideSubject(w, h, aspect),
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(at.x, TILE_TOP, at.z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
/** A swipe across the table that way (screen up is north), beginning on the cube. */
async function swipe(page: Page, state: rules.State, dir: number) {
  const from = await onScreen(page, state.w, state.h, cellAt(state.w, state.h, state.cube)),
    way = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ][dir];
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + way[0] * 45, from.y + way[1] * 45, { steps: 3 });
  await page.mouse.move(from.x + way[0] * 90, from.y + way[1] * 90, { steps: 3 });
  await page.mouse.up();
}

test("glide cube: a seeded puzzle is solved by swipes and a key, then a fall is taken back with undo", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 92),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "미끄럼 큐브");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(5);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  // A puzzle was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  rules.createGame(1, random);
  const start = rules.createGame(1, random),
    way = rules.solve(start)!;
  expect(way.length).toBe(start.best);
  await expect(page.locator("canvas")).toHaveAttribute("data-cube", String(start.cube));
  // Every push but the last by a swipe, the last by an arrow key.
  let state = start;
  for (let k = 0; k < way.length; k++) {
    if (k < way.length - 1) await swipe(page, state, way[k]);
    else {
      await page.locator("canvas").focus();
      await page.keyboard.press(["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"][way[k]]);
    }
    state = rules.play(state, { from: -1, to: way[k], extra: -1 })!;
    await expect(moves(page)).toHaveText(`${k + 1}수`, { timeout: 20000 });
    await settled(page);
    if (k < way.length - 1) await expect(page.locator("canvas")).toHaveAttribute("data-cube", String(state.cube));
  }
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  // Back to the puzzle as it was laid, and a push that falls off, by a tap on its arrow round the cube.
  await page.locator("#pz-restart").click();
  await expect(moves(page)).toHaveText("0수", { timeout: 20000 });
  await settled(page);
  const fall = [0, 1, 2, 3].find((d) => rules.play(start, { from: -1, to: d, extra: -1 })?.winner === 1);
  expect(fall).toBeDefined();
  const arrow = await onScreen(page, start.w, start.h, arrowAt(start.w, start.h, start.cube, fall!));
  if (mobile) await page.touchscreen.tap(arrow.x, arrow.y);
  else await page.mouse.click(arrow.x, arrow.y);
  await expect(moves(page)).toHaveText("1수", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("실패!");
  await settled(page);
  await page.locator("#pg-undo").click();
  await expect(moves(page)).toHaveText("0수", { timeout: 20000 });
  await expect(page.locator("#turn")).not.toContainText("실패!");
  await expect(page.locator("canvas")).toHaveAttribute("data-cube", String(start.cube));
  expect(errors).toEqual([]);
});
