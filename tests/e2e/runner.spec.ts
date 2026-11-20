import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

/** Where the runner is (his side, the way along it, his height, which way round, in the air), from the canvas. */
const runner = async (page: Page) => JSON.parse((await page.locator("canvas").getAttribute("data-runner")) ?? "{}") as { side: number; u: number; h: number; dir: number; air: boolean };
const count = async (page: Page, name: "strikes" | "jumps") => Number((await page.locator("canvas").getAttribute(`data-${name}`)) ?? 0);

test("square runner: he runs by himself, a tap strikes, a swipe up jumps, and a pause stops the room", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "네모 러너");
  // The ten rooms are offered as cards in the entry window; the first is the practice room.
  await expect(page.locator("dialog[open] .stage-card")).toHaveCount(10);
  await page.locator("dialog[open] .stage-card").first().click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(canvas).toHaveAttribute("data-stage", "1");
  // He runs round the room by himself.
  const first = JSON.stringify(await runner(page));
  await expect.poll(async () => JSON.stringify(await runner(page)), { timeout: 10000 }).not.toBe(first);
  // A tap on the table is a strike.
  const box = (await canvas.boundingBox())!,
    x = box.x + box.width / 2,
    y = box.y + box.height / 2;
  await page.mouse.click(x, y);
  await expect.poll(() => count(page, "strikes")).toBe(1);
  // A swipe up is a jump (or, near a wall, the turn onto it).
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(x, y - k * 12);
  await page.mouse.up();
  await expect.poll(() => count(page, "jumps")).toBe(1);
  // The swipe was not also a strike; a key strikes too, once the strike before has been made.
  expect(await count(page, "strikes")).toBe(1);
  await page.waitForTimeout(400);
  await page.keyboard.press("z");
  await expect.poll(() => count(page, "strikes")).toBe(2);
  // P stops the room: he stands where he is until it is pressed again.
  await page.keyboard.press("p");
  await expect(page.locator("#board")).toHaveAttribute("data-paused", /.*/);
  const held = JSON.stringify(await runner(page));
  await page.waitForTimeout(800);
  expect(JSON.stringify(await runner(page))).toBe(held);
  await page.keyboard.press("p");
  await expect.poll(async () => JSON.stringify(await runner(page)), { timeout: 10000 }).not.toBe(held);
  // 레벨 선택 shows the rooms again; the boss room has its boss.
  await page.locator("#restart").click();
  await page.locator("dialog[open] .stage-card").nth(7).click();
  await expect(canvas).toHaveAttribute("data-stage", "8");
  await expect(canvas).toHaveAttribute("data-boss", "8");
  expect(errors).toEqual([]);
});

test("square runner: left alone, he runs into walls until the last heart is gone", async ({ page }) => {
  await page.goto("/");
  await selectGame(page, "네모 러너");
  await page.locator("dialog[open] .stage-card").first().click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  // A wall about every three seconds, a heart each: the end is told in the middle of the table.
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 30000 });
  await expect(page.locator(".board-finale")).toContainText("실패");
});
