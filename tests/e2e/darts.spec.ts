import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";
import { swipeFor } from "../../src/games/darts/layout";
import { START, TREBLE_IN, TREBLE_OUT } from "../../src/games/darts/rules";

const moves = async (page: Page) => Number(/(\d+)/.exec((await page.locator("#move-count").textContent()) ?? "")?.[1] ?? 0);
/** What a side has left in 501, from its line in the panel. */
const left = async (page: Page, side: number) => Number(/남은 (\d+)점/.exec((await page.locator(`#pg-count-${side}`).textContent()) ?? "")?.[1] ?? NaN);
const resting = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 40000 });

/** Fixes the scatter of the computer's darts (a person's have none: they land where the trembling ring was). */
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
/** A swipe up from low in the middle of the table that aims at the point (x, y) of the board. */
async function throwAt(page: Page, x: number, y: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    swipe = swipeFor(x, y, box.height),
    from = { x: box.x + box.width / 2, y: box.y + box.height * 0.88 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + (swipe.dx * k) / 8, from.y + (swipe.dy * k) / 8);
  await page.mouse.up();
}

test("darts: three swipes throw three darts, the score comes down, the turn passes to the computer and back, and the ring trembles", async ({ page }) => {
  // Seven throws and the computer's three, each resting first: the pub draws a few frames a second under software
  // rendering, and slower still with three browsers at once (one minute ran out in the run beside the others).
  test.setTimeout(240000);
  await seeded(page, 91);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "다트");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.locator("#pg-variant").selectOption("501");
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await resting(page);
  await expect(page.locator("#pg-count-0")).toHaveText("남은 501점");
  await expect(page.locator("#board")).toHaveAttribute("data-turn", "0");
  // A swipe downward, or too short, throws nothing.
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.7, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await moves(page)).toBe(0);
  // Three darts at the treble twenty. The hand trembles, so where each lands is not fixed, but always on the board
  // round the top of it: each scores something and none more than a treble.
  for (let k = 1; k <= 3; k++) {
    await throwAt(page, 0, (TREBLE_IN + TREBLE_OUT) / 2);
    await expect.poll(() => moves(page), { timeout: 20000 }).toBe(k);
    if (k < 3) {
      await resting(page);
      await expect(page.locator("#board")).toHaveAttribute("data-turn", "0");
    }
  }
  // The visit is written off the score, and the computer takes its three darts.
  await expect(page.locator("#pg-count-0")).not.toHaveText("남은 501점", { timeout: 20000 });
  const mine = await left(page, 0);
  expect(mine).toBeGreaterThanOrEqual(START - 180);
  expect(mine).toBeLessThanOrEqual(START - 3);
  await expect(page.locator("#board")).toHaveAttribute("data-turn", "1", { timeout: 20000 });
  await expect.poll(() => moves(page), { timeout: 40000 }).toBe(6);
  await expect(page.locator("#board")).toHaveAttribute("data-turn", "0", { timeout: 40000 });
  await expect(page.locator("#pg-count-1")).not.toHaveText("남은 501점");
  // The keyboard throws too: Enter at the point the arrows have aimed.
  await resting(page);
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowUp");
  // The ring trembles like a hand while the keys aim: where its dot is moves by itself, round the point aimed at
  // (the middle of the treble twenty, moved up a step).
  const dot = () => page.locator("canvas").getAttribute("data-aim");
  const first = (await dot()) ?? "";
  expect(first).toMatch(/^-?\d+\.\d,-?\d+\.\d$/);
  await expect.poll(dot, { timeout: 20000 }).not.toBe(first);
  for (const at of [first, (await dot()) ?? ""]) {
    const [x, y] = at.split(",").map(Number);
    expect(Math.hypot(x, y - ((TREBLE_IN + TREBLE_OUT) / 2 + 5))).toBeLessThan(75);
  }
  await page.keyboard.press("Enter");
  await expect.poll(() => moves(page), { timeout: 20000 }).toBe(7);
  expect(errors).toEqual([]);
});
