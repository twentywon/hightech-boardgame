import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as S from "../../src/games/slide/rules";
import { TILE_TOP, cellAt, slideSubject } from "../../src/games/slide/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");

/** Stubs the random numbers so that the tray laid can be laid here too. */
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
/** Where the top of the tile at `cell` is on the screen, through the view's camera. */
async function screen(page: Page, size: number, cell: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = slideSubject(aspect),
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const p = cellAt(size, cell),
    v = new Vector3(p.x, TILE_TOP, p.z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}

test("sliding puzzle: the 3×3 card lays the tray, and tapping the hinted tiles solves it", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 81),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "슬라이딩 퍼즐");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window: three numbered trays and two pictures.
  await expect(dialog.locator(".stage-card")).toHaveCount(5);
  await dialog.locator(".stage-card").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  // A tray was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  S.createGame(1, random);
  let state = S.createGame(1, random);
  expect(state.size).toBe(3);
  // A tap on a tile out of the gap's line moves nothing.
  const gap = state.tiles.indexOf(0),
    away = state.tiles.findIndex((_, cell) => cell !== gap && cell % 3 !== gap % 3 && Math.floor(cell / 3) !== Math.floor(gap / 3)),
    still = await screen(page, 3, away);
  await page.mouse.click(still.x, still.y);
  await page.waitForTimeout(400);
  await expect(moves(page)).toHaveText("0수");
  let count = 0;
  while (state.winner === null) {
    const move = S.hint(state)!,
      p = await screen(page, 3, move.from);
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
    state = S.play(state, move)!;
    count++;
    await expect(moves(page)).toHaveText(`${count}수`, { timeout: 20000 });
    await settled(page);
  }
  expect(count).toBeGreaterThan(0);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  expect(errors).toEqual([]);
});

test("sliding puzzle: a drag toward the gap and an arrow key each push a tile", async ({ page }) => {
  const random = await seeded(page, 83);
  await page.goto("/");
  await selectGame(page, "슬라이딩 퍼즐");
  await page.getByRole("dialog").locator(".stage-card").nth(1).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  S.createGame(1, random);
  const state = S.createGame(2, random),
    gap = state.tiles.indexOf(0);
  expect(state.size).toBe(4);
  // The gap starts in the corner: drag the tile on its left into it.
  const from = await screen(page, 4, gap - 1),
    to = await screen(page, 4, gap);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + ((to.x - from.x) * k) / 8, from.y + ((to.y - from.y) * k) / 8);
  await page.mouse.up();
  await expect(moves(page)).toHaveText("1수", { timeout: 20000 });
  await settled(page);
  // The gap is now one place left: the arrow down slides the tile above it down.
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowDown");
  await expect(moves(page)).toHaveText("2수", { timeout: 20000 });
});
