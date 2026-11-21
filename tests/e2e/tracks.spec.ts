import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as rules from "../../src/games/tracks/rules";
import { TILE_TOP, cellAt, tracksSubject } from "../../src/games/tracks/layout";

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
/** Where the top of a cell is on the screen, as the view's camera shows it. */
async function cellOnScreen(page: Page, size: number, cell: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = tracksSubject(size, aspect),
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const p = cellAt(size, cell),
    v = new Vector3(p.x, TILE_TOP, p.z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
/** A drag through the middles of `cells`, one after another. */
async function drag(page: Page, size: number, cells: number[]) {
  const first = await cellOnScreen(page, size, cells[0]);
  await page.mouse.move(first.x, first.y);
  await page.mouse.down();
  for (const cell of cells.slice(1)) {
    const p = await cellOnScreen(page, size, cell);
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }
  await page.mouse.up();
}

test("train tracks: a tap marks a cell, drags lay the railway, the train runs, and undo takes the last stroke back", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 91),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "기차 선로");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(5);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  // A board was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  rules.createGame(1, random);
  const state = rules.createGame(1, random),
    n = state.size,
    route = rules.route({ size: n, links: state.answer, ports: state.ports }).cells;
  expect(route.length).toBeGreaterThan(4);
  // A tap on a cell the railway does not pass marks it.
  const off = state.answer.findIndex((mask, i) => !mask && !state.given[i]),
    mark = await cellOnScreen(page, n, off);
  if (mobile) await page.touchscreen.tap(mark.x, mark.y);
  else await page.mouse.click(mark.x, mark.y);
  await expect(moves(page)).toHaveText("1수", { timeout: 20000 });
  await settled(page);
  // The railway in two strokes, each one move: the first half from the entrance, then the rest.
  const half = Math.ceil(route.length / 2);
  await drag(page, n, route.slice(0, half));
  await expect(moves(page)).toHaveText("2수", { timeout: 20000 });
  await settled(page);
  await expect(page.locator("#turn")).not.toContainText("성공!");
  await drag(page, n, route.slice(half - 1));
  await expect(moves(page)).toHaveText("3수", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  // The train runs by itself and does not hold the table: undo takes the last stroke back at once.
  await settled(page);
  await page.locator("#pg-undo").click();
  await expect(moves(page)).toHaveText("2수", { timeout: 20000 });
  await expect(page.locator("#turn")).not.toContainText("성공!");
  expect(errors).toEqual([]);
});
