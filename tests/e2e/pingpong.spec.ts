import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { HALF_L } from "../../src/games/pingpong/sim";
import { HAND_Y, rallyCamera } from "../../src/games/pingpong/layout";
import { selectGame } from "./library";

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);

test("table tennis: my paddle follows the mouse, the computer serves, and a point is scored", async ({ page }) => {
  // A rally runs in real time, slowed with the screen when the picture is drawn by software.
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "탁구");
  await page.locator(".game-stage button.primary").click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  // Where a point of the plane my hand moves over is on the screen, through the same eye as the table's (which
  // steps back for a high ball: the canvas tells how far it stands back now).
  const box = (await canvas.boundingBox())!,
    camera = new PerspectiveCamera(50, box.width / box.height, 0.1, 120);
  const at = async (x: number, z: number) => {
    rallyCamera(camera, box.width / box.height, Number((await canvas.getAttribute("data-step")) ?? 0));
    const p = new Vector3(x, HAND_Y, z).project(camera);
    return { x: box.x + ((p.x + 1) / 2) * box.width, y: box.y + ((1 - p.y) / 2) * box.height };
  };
  const paddle = async () => ((await canvas.getAttribute("data-paddle")) ?? "").split(",").map(Number);
  // The mouse moves the paddle without a button: it goes where the hand is, across and along the table.
  for (const [x, z] of [
    [-0.4, HALF_L + 0.3],
    [0.3, HALF_L + 0.25],
  ]) {
    const p = await at(x, z);
    await page.mouse.move(p.x, p.y, { steps: 4 });
  }
  await expect.poll(async () => Math.abs((await paddle())[0] - 0.3), { timeout: 20000 }).toBeLessThan(0.06);
  expect(Math.abs((await paddle())[1] - (HALF_L + 0.25))).toBeLessThan(0.06);
  // The computer serves first: its ball is soon in play.
  await expect.poll(() => canvas.getAttribute("data-phase"), { timeout: 30000 }).toBe("rally");
  // Whoever wins it, the rally ends in a point: the count of moves and the scoreboard show it.
  await expect.poll(() => moves(page), { timeout: 45000 }).toBeGreaterThan(0);
  const points = await page.locator(".tt-points").allInnerTexts();
  expect(points.map(Number).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  // A point in the middle of a game tells no game's result over the table (that comes only when a game is won).
  await expect(page.locator(".board-area .board-interlude")).toHaveCount(0);
  expect(errors).toEqual([]);
});
