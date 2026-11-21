import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { BASE, pusherSubject } from "../../src/games/coinpusher/layout";
import { AIMS, FIELD, aimX } from "../../src/games/coinpusher/sim";
import { selectGame } from "./library";

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const hand = async (page: Page) => Number(/남은 동전 (\d+)/.exec(await page.locator("#turn").innerText())?.[1] ?? -1);

test("coin pusher: presses at different columns drop coins, a held press keeps dropping, keys and the button drop too, the counters change and the machine pauses", async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "코인 푸셔");
  await page.locator(".game-stage button.primary").click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  expect(await hand(page)).toBe(30);
  // A press over a column of the playfield, aimed through the view's own camera.
  const box = (await canvas.boundingBox())!,
    aspect = box.width / box.height,
    subject = pusherSubject(aspect),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    distance = cameraDistance(aspect, false, subject);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const column = (place: number) => {
    const v = new Vector3(aimX(place), BASE, FIELD.front - 0.5).project(camera);
    return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
  };
  for (const place of [3, Math.floor(AIMS / 2), AIMS - 4]) {
    const before = await hand(page),
      at = column(place);
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => hand(page)).toBe(before - 1);
  }
  // Held, a press keeps dropping coins.
  const held = await hand(page),
    middle = column(12);
  await page.mouse.move(middle.x, middle.y);
  await page.mouse.down();
  await expect.poll(() => hand(page), { timeout: 15000 }).toBeLessThanOrEqual(held - 2);
  await page.mouse.up();
  // The keys: an arrow pushes the chute along while it is held (two moves), space drops a coin.
  await canvas.focus();
  const keyed = await moves(page);
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => moves(page)).toBeGreaterThanOrEqual(keyed + 2);
  const before = await hand(page);
  await page.keyboard.press(" ");
  await expect.poll(() => hand(page)).toBeLessThan(before);
  // The button at the lower left drops a coin too.
  const tool = await hand(page);
  await page.getByRole("button", { name: "동전 넣기" }).click();
  await expect.poll(() => hand(page)).toBeLessThan(tool);
  // The machine pushes coins over the front or down the gutters by itself: what falls is counted as moves of its own.
  const dropped = await moves(page);
  await expect.poll(() => moves(page), { timeout: 30000 }).toBeGreaterThan(dropped);
  // Paused, nothing moves and a press drops nothing.
  await page.locator("#pg-pause").click();
  await expect(page.locator("#board")).toHaveAttribute("data-paused", "true");
  const still = await moves(page);
  await page.mouse.click(middle.x, middle.y);
  await page.waitForTimeout(1500);
  expect(await moves(page)).toBe(still);
  await page.locator("#pg-pause").click();
  await expect(page.locator("#board")).toHaveAttribute("data-paused", "false");
  expect(errors).toEqual([]);
});
