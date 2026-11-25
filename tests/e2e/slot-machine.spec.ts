import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

/** The status line's numbers: the credits, what a spin costs, and the last win (0 when none is said). */
async function books(page: Page) {
  const text = await page.locator("#turn").innerText(),
    credits = Number(/크레딧 (\d+)/.exec(text)?.[1] ?? -1),
    stake = Number(/= (\d+)/.exec(text)?.[1] ?? -1),
    won = Number(/방금 (\d+) 당첨/.exec(text)?.[1] ?? 0);
  return { credits, stake, won, text };
}
const points = async (page: Page) => JSON.parse((await page.locator("#board canvas").getAttribute("data-points")) ?? "{}") as Record<string, [number, number]>;
/** Waits for a spin to be over: the reels at rest and its win paid (the status line no longer says they turn). */
async function rested(page: Page) {
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-spinning", "false", { timeout: 20000 });
  await expect.poll(async () => (await books(page)).credits, { timeout: 20000 }).toBeGreaterThanOrEqual(0);
  await expect.poll(async () => /릴이 돌고/.test((await books(page)).text), { timeout: 20000 }).toBe(false);
}

test("slot machine: the bet is set on the cabinet, the lever pulled by a drag spins, space and the spin button spin, and the credits add up", async ({ page }, info) => {
  test.slow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "슬롯머신");
  await page.locator(".game-stage button.primary").click();
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect.poll(async () => (await books(page)).credits).toBe(1000);
  expect((await books(page)).stake).toBe(5);
  const box = (await canvas.boundingBox())!,
    at = async (key: string) => {
      const p = (await points(page))[key];
      return { x: box.x + p[0], y: box.y + p[1] };
    };
  // The 베팅 button on the deck: a line's bet goes from 1 to 2 (five lines: 10 a spin).
  const bet = await at("bet");
  await page.mouse.click(bet.x, bet.y);
  await expect.poll(async () => (await books(page)).stake).toBe(10);
  // The lever pulled down by a drag: the reels turn, stop, and the credits are 1000 - 10 + what was won.
  const knob = await at("lever");
  await page.mouse.move(knob.x, knob.y);
  await page.mouse.down();
  await page.mouse.move(knob.x, knob.y + box.height * 0.3, { steps: 8 });
  await expect(canvas).toHaveAttribute("data-spinning", "true", { timeout: 10000 });
  await page.mouse.up();
  await page.screenshot({ path: info.outputPath("spinning.png") });
  await rested(page);
  let after = await books(page);
  expect(after.credits).toBe(990 + after.won);
  // The lever springs back up once let go.
  await expect.poll(async () => Number(await canvas.getAttribute("data-lever"))).toBeLessThan(0.05);
  // Space spins (and a second press while they turn hurries the reels).
  let before = after.credits;
  await canvas.focus();
  await page.keyboard.press(" ");
  await expect(canvas).toHaveAttribute("data-spinning", "true", { timeout: 10000 });
  await page.keyboard.press(" ");
  await rested(page);
  after = await books(page);
  expect(after.credits).toBe(before - 10 + after.won);
  // The spin button on the deck.
  before = after.credits;
  const spin = await at("spin");
  await page.mouse.click(spin.x, spin.y);
  await expect(canvas).toHaveAttribute("data-spinning", "true", { timeout: 10000 });
  await rested(page);
  after = await books(page);
  expect(after.credits).toBe(before - 10 + after.won);
  await page.screenshot({ path: info.outputPath("rest.png") });
  // 최대: as many lines and the largest bet the credits allow (five lines of 10: 50 a spin).
  const max = await at("max");
  await page.mouse.click(max.x, max.y);
  await expect.poll(async () => (await books(page)).stake).toBe(50);
  expect(errors).toEqual([]);
});
