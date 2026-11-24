import { test, expect } from "@playwright/test";
import { selectGame } from "./library";

const moves = async (page: import("@playwright/test").Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);

test("badminton: a swipe serves, the keys strike, the jump button jumps, and the points are counted", async ({ page }) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "배드민턴");
  await page.locator(".game-stage button.primary").click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  // My serve first: a swipe up the court serves it.
  await expect(canvas).toHaveAttribute("data-phase", "ready");
  await expect(canvas).toHaveAttribute("data-server", "0");
  await expect(page.locator(".bd-tip")).toBeVisible();
  const box = (await canvas.boundingBox())!,
    x = box.x + box.width / 2,
    y = box.y + box.height * 0.8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let k = 1; k <= 5; k++) await page.mouse.move(x + k * 4, y - k * box.height * 0.07);
  await page.mouse.up();
  await expect(canvas).toHaveAttribute("data-swung", "1");
  await expect.poll(() => canvas.getAttribute("data-phase"), { timeout: 10000 }).not.toBe("ready");
  await expect(page.locator(".bd-jump")).toBeVisible();
  // Then the keys: ↑ strikes the shuttle coming to me; the jump button jumps while it is in the air.
  await canvas.focus();
  let jumped = false,
    struck = false;
  const start = Date.now();
  while (Date.now() - start < 90000 && (!jumped || !struck || (await moves(page)) < 2)) {
    const d = await page.evaluate(() => ({ ...document.querySelector<HTMLCanvasElement>("#board canvas")!.dataset }));
    const me = (d.me ?? "").split(",").map(Number),
      s = (d.shuttle ?? "").split(",").map(Number);
    if (d.phase === "ready" && d.server === "0") await page.keyboard.press("ArrowUp");
    if (d.phase === "flying" && d.hitter === "1" && s[2] > 0) {
      if (!jumped) {
        await page.locator(".bd-jump").dispatchEvent("pointerdown");
        await expect.poll(async () => Number(((await canvas.getAttribute("data-me")) ?? "0,0").split(",")[1]), { timeout: 3000 }).toBeGreaterThan(0);
        jumped = true;
      } else if (Math.hypot(s[0] - me[0], s[2] - me[2]) < 2.2) await page.keyboard.press("ArrowUp");
    }
    if (d.hitter === "0" && d.phase === "flying" && Number(await canvas.getAttribute("data-swung")) > 1) struck = true;
    await page.waitForTimeout(40);
  }
  expect(jumped).toBe(true);
  expect(struck).toBe(true);
  expect(await moves(page)).toBeGreaterThanOrEqual(2);
  // The scoreboard counts the points: its two numbers add up to the points played.
  const [mine, theirs] = await page.locator(".tt-points").allInnerTexts();
  expect(Number(mine) + Number(theirs)).toBe(await moves(page));
  expect(errors).toEqual([]);
});
