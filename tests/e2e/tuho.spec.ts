import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";
import { pullFor } from "../../src/games/tuho/layout";
import { IDEAL } from "../../src/games/tuho/rules";

const moves = async (page: Page) => Number(/(\d+)/.exec((await page.locator("#move-count").textContent()) ?? "")?.[1] ?? 0);
/** A side's total, from its line in the (unseen) panel. */
const score = async (page: Page, side: number) => Number(/^(\d+)점/.exec((await page.locator(`#pg-count-${side}`).textContent()) ?? "")?.[1] ?? NaN);
const resting = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 40000 });

/** Fixes the scatter of the computer's throws (a person's have none: they fly as the trembling hand let go). */
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
}
/** A pull down from the middle of the table that throws with `yaw` and `speed`. */
async function pull(page: Page, yaw: number, speed: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    way = pullFor(yaw, speed, box.height),
    from = { x: box.x + box.width / 2, y: box.y + box.height * 0.35 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + (way.dx * k) / 8, from.y + (way.dy * k) / 8);
  await page.mouse.up();
}

test("tuho: a pull throws the arrow into the mouth for 10, the computer answers, and the keyboard throws too", async ({ page }) => {
  test.setTimeout(180000);
  await seeded(page, 37);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "투호");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await resting(page);
  await expect(page.locator("#board")).toHaveAttribute("data-turn", "0");
  expect(await score(page, 0)).toBe(0);
  // A pull too short throws nothing.
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.42, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await moves(page)).toBe(0);
  const middle = IDEAL[0];
  // A straight pull of the length that reaches the mouth: the hand trembles far less than the mouth is wide.
  await pull(page, middle.yaw, middle.speed);
  await expect.poll(() => moves(page), { timeout: 20000 }).toBe(1);
  await expect.poll(() => score(page, 0), { timeout: 30000 }).toBe(10);
  // The computer throws once and the turn comes back.
  await expect(page.locator("#board")).toHaveAttribute("data-turn", "1", { timeout: 20000 });
  await expect.poll(() => moves(page), { timeout: 40000 }).toBe(2);
  await expect(page.locator("#board")).toHaveAttribute("data-turn", "0", { timeout: 40000 });
  await expect(page.locator("#pg-count-1")).toContainText("화살 9개 남음");
  // The keyboard: the arrows aim (the aim shows on the canvas, trembling), Enter throws.
  await resting(page);
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowLeft");
  const aim = () => page.locator("canvas").getAttribute("data-aim");
  const first = (await aim()) ?? "";
  expect(first).toMatch(/^-?\d+\.\d{5},\d+\.\d{3}$/);
  await expect.poll(aim, { timeout: 20000 }).not.toBe(first);
  await page.keyboard.press("Enter");
  await expect.poll(() => moves(page), { timeout: 20000 }).toBe(3);
  expect(errors).toEqual([]);
});
