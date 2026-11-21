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
  // Where a point is on the screen, through the same eye as the table's (which steps aside for a wide ball and rises
  // for a high one: the canvas tells how far, `data-eye` and `data-lift`).
  const box = (await canvas.boundingBox())!,
    camera = new PerspectiveCamera(50, box.width / box.height, 0.1, 120);
  const screen = async (x: number, y: number, z: number) => {
    rallyCamera(camera, box.width / box.height, Number((await canvas.getAttribute("data-eye")) ?? 0), Number((await canvas.getAttribute("data-lift")) ?? 0));
    const p = new Vector3(x, y, z).project(camera);
    return { x: box.x + ((p.x + 1) / 2) * box.width, y: box.y + ((1 - p.y) / 2) * box.height };
  };
  // A point of the plane the pointer is aimed onto.
  const at = (x: number, z: number) => screen(x, HAND_Y, z);
  // My blade, at whatever height it has been raised to.
  const blade = async () => ((await canvas.getAttribute("data-blade")) ?? "").split(",").map(Number);
  // The mouse moves the paddle without a button: it goes where the hand is, across and along the table.
  let mouse = { x: 0, y: 0 };
  for (const [x, z] of [
    [-0.4, HALF_L + 0.3],
    [0.3, HALF_L + 0.25],
  ]) {
    mouse = await at(x, z);
    await page.mouse.move(mouse.x, mouse.y, { steps: 4 });
  }
  // The blade stands under the mouse at its own height, seen through the eye as it stands now (it may have stepped
  // aside or risen since, and the blade risen to meet the ball).
  const off = async () => {
    const [x, y, z] = await blade(),
      p = await screen(x, y, z);
    return Math.hypot(p.x - mouse.x, p.y - mouse.y);
  };
  await expect.poll(off, { timeout: 20000 }).toBeLessThan(box.height * 0.03);
  // The computer serves first: its ball is soon in play, and the paddle stays under the mouse while the eye follows it.
  await expect.poll(() => canvas.getAttribute("data-phase"), { timeout: 30000 }).toBe("rally");
  // (The blade is set at once for the height it will meet the ball at and rises to it within a few frames.)
  await expect.poll(off, { timeout: 5000 }).toBeLessThan(box.height * 0.03);
  // Whoever wins it, the rally ends in a point: the count of moves and the scoreboard show it.
  await expect.poll(() => moves(page), { timeout: 45000 }).toBeGreaterThan(0);
  const points = await page.locator(".tt-points").allInnerTexts();
  expect(points.map(Number).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  // A point in the middle of a game tells no game's result over the table (that comes only when a game is won).
  await expect(page.locator(".board-area .board-interlude")).toHaveCount(0);
  expect(errors).toEqual([]);
});
