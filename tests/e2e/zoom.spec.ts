import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

/** Starts a game of gomoku and waits for its table to be drawn. */
async function gomoku(page: Page) {
  await page.goto("/");
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(1500);
  return canvas;
}

test("a mouse wheel zooms the table about the pointer and the zoom stays; a click still lands", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "the wheel is the desktop's");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const canvas = await gomoku(page);
  const box = (await canvas.boundingBox())!;
  const before = await canvas.screenshot();
  await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.46);
  for (let i = 0; i < 4; i++) {
    await page.mouse.wheel(0, -120);
    await page.waitForTimeout(60);
  }
  await page.waitForTimeout(300);
  const zoomed = await canvas.screenshot();
  expect(zoomed.equals(before)).toBe(false);
  // Left alone, it stays zoomed.
  await page.waitForTimeout(900);
  expect((await canvas.screenshot()).equals(zoomed)).toBe(true);
  // A click on the zoomed table is still a move.
  await canvas.click({ position: { x: box.width / 2, y: box.height / 2 } });
  await expect(page.locator("#move-count")).toHaveText("1수");
  // Wheeling back out comes back to the usual view.
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(60);
  }
  expect(errors).toEqual([]);
});

test("two fingers zoom the table, and once lifted it glides back; the pinch is not a move", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "two fingers are the phone's");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const canvas = await gomoku(page);
  const box = (await canvas.boundingBox())!;
  const before = await canvas.screenshot();
  const cdp = await page.context().newCDPSession(page);
  const cx = box.x + box.width / 2,
    cy = box.y + box.height / 2;
  const points = (spread: number) => [
    { x: cx - spread, y: cy, id: 1 },
    { x: cx + spread, y: cy, id: 2 },
  ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(30) });
  for (let s = 40; s <= 160; s += 20) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(s) });
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(200);
  const pinched = await canvas.screenshot();
  expect(pinched.equals(before)).toBe(false);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  // Back to the usual view, and no stone was placed.
  await expect.poll(async () => (await canvas.screenshot()).equals(before), { timeout: 3000 }).toBe(true);
  await expect(page.locator("#move-count")).toHaveText("0수");
  // A single tap is still a move.
  await page.touchscreen.tap(cx, cy);
  await expect(page.locator("#move-count")).toHaveText("1수");
  expect(errors).toEqual([]);
});
