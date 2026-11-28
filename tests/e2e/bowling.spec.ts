import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV } from "../../src/engine/camera";
import { BALL_Z, START_X, bowlerCamera, swipeFor } from "../../src/games/bowling/layout";
import { BALL_R } from "../../src/games/bowling/sim";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 60000 });
/** Where the ball waiting on the approach is on the screen, through the bowler's eye as the table sets it. */
async function ballAt(page: Page) {
  const box = (await page.locator("canvas").boundingBox())!,
    camera = new PerspectiveCamera(FOV, box.width / box.height, 0.1, 120);
  bowlerCamera(camera, 0);
  const v = new Vector3(START_X, BALL_R, BALL_Z).project(camera);
  return { box, x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
/** A swipe up from the ball at about eight metres a second, straight down the lane. */
async function bowl(page: Page) {
  const { box, x, y } = await ballAt(page),
    swipe = swipeFor(8, 0, box.height);
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(x + (swipe.dx * k) / 10, y + (swipe.dy * k) / 10);
  await page.mouse.up();
}

test("bowling: a ball swiped up the lane knocks pins down and the next ball comes", async ({ page }) => {
  // A ball takes about twelve seconds to roll, strike and be set again under software rendering, more with three
  // browsers at once (one minute ran out in the run beside the others).
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "볼링");
  // Alone, so that every ball is mine.
  await page.locator("#pg-variant").selectOption("solo");
  await page.locator(".game-stage button.primary").click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  await expect(canvas).toHaveAttribute("data-standing", "10");
  await expect(page.locator(".board-hint")).toContainText("1프레임 첫 공");
  await bowl(page);
  await expect(page.locator("#move-count")).toHaveText("1수", { timeout: 30000 });
  // The ball rolls, the pins fall, the pinsetter clears the deck and the ball comes back.
  await settled(page);
  const hint = await page.locator(".board-hint").innerText();
  if (hint.includes("2프레임")) await expect(canvas).toHaveAttribute("data-standing", "10");
  else {
    expect(hint).toContain("1프레임 둘째 공");
    expect(Number(await canvas.getAttribute("data-standing"))).toBeLessThan(10);
  }
  // The next ball is thrown the same way.
  await bowl(page);
  await expect(page.locator("#move-count")).toHaveText("2수", { timeout: 30000 });
  await settled(page);
  await expect(page.locator(".board-hint")).toContainText(/2프레임|3프레임/);
  expect(errors).toEqual([]);
});
