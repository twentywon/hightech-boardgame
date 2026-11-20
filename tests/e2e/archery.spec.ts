import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";
import { dragFor } from "../../src/games/archery/layout";

const moves = async (page: Page) => Number(/(\d+)/.exec((await page.locator("#move-count").textContent()) ?? "")?.[1] ?? 0);
const resting = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 40000 });
const aimOf = (text: string | null) => (text ?? "").split(",").map(Number);

/** Fixes the winds of every arrow and the scatter of the computer's (a person's arrows have none: they go where the pin was). */
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
/**
 * One arrow by hand: a press draws the bow, the pin's place is read from `data-aim` once the bow is at full draw,
 * the press is dragged against the hand's drift to bring the pin back to the middle of the face, and let go.
 */
async function shoot(page: Page) {
  const canvas = page.locator("canvas"),
    box = (await canvas.boundingBox())!,
    from = { x: box.x + box.width / 2, y: box.y + box.height * 0.62 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute("data-drawn", "true", { timeout: 20000 });
  await expect.poll(() => canvas.getAttribute("data-aim"), { timeout: 20000 }).toMatch(/^-?\d+\.\d,-?\d+\.\d$/);
  const [x, y] = aimOf(await canvas.getAttribute("data-aim")),
    back = dragFor(-x, -y, box.height);
  await page.mouse.move(from.x + back.dx, from.y + back.dy);
  await page.mouse.up();
}

test("archery: three arrows by press, hold and release, the computer answering each, and the set score changes", async ({ page }) => {
  // Six arrows, each flying a second and a quarter and resting first: the range draws a few frames a second under
  // software rendering, slower still with three browsers at once.
  test.setTimeout(240000);
  await seeded(page, 57);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "양궁");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.locator("#pg-variant").selectOption("match");
  await page.locator(".game-stage button.primary").click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await resting(page);
  await expect(page.locator("#pg-count-0")).toHaveText("세트 0점");
  await expect(canvas).toHaveAttribute("data-sets", "0,0");
  await expect(canvas).toHaveAttribute("data-wind", /^\d+\.\d,\d+$/);
  // A press let go before the bow is drawn lets it down: nothing is shot.
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await moves(page)).toBe(0);
  await expect(canvas).toHaveAttribute("data-drawn", "false");
  // While the bow is held the pin wanders by itself, as a hand does; Escape lets the bow down without shooting.
  await page.mouse.down();
  await expect.poll(() => canvas.getAttribute("data-aim"), { timeout: 20000 }).toMatch(/\d/);
  const first = await canvas.getAttribute("data-aim");
  await expect.poll(() => canvas.getAttribute("data-aim"), { timeout: 20000 }).not.toBe(first);
  for (const at of [first, await canvas.getAttribute("data-aim")]) {
    const [x, y] = aimOf(at);
    // Never far from the middle, where the pin starts.
    expect(Math.hypot(x, y)).toBeLessThan(400);
  }
  await page.keyboard.press("Escape");
  await expect(canvas).toHaveAttribute("data-drawn", "false", { timeout: 20000 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  expect(await moves(page)).toBe(0);
  const winds = new Set<string>();
  for (let k = 1; k <= 3; k++) {
    await expect(page.locator("#board")).toHaveAttribute("data-turn", "0", { timeout: 40000 });
    await resting(page);
    winds.add((await canvas.getAttribute("data-wind")) ?? "");
    await shoot(page);
    await expect.poll(() => moves(page), { timeout: 20000 }).toBe(2 * k - 1);
    // Each of my arrows is written into the set, a value from M to X.
    await expect.poll(async () => /이번 ([^(]+)\(/.exec((await page.locator("#pg-count-0").textContent()) ?? "")?.[1].trim().split(" ").length ?? 0, { timeout: 20000 }).toBe(k);
    const mine = /이번 ([^(]+)\(/.exec((await page.locator("#pg-count-0").textContent()) ?? "")![1].trim().split(" ");
    for (const label of mine) expect(["X", "10", "9", "8", "7", "6", "5", "4", "3", "2", "1", "M"]).toContain(label);
    // The computer answers each arrow with one of its own (after my third, the set is shot and scored).
    if (k < 3) await expect.poll(() => moves(page), { timeout: 40000 }).toBe(2 * k);
  }
  await expect.poll(() => moves(page), { timeout: 40000 }).toBe(6);
  // Once the last arrow has struck, the set's result stands over the table for a moment (decoration, no buttons):
  // its word for me, then the two totals and the set points.
  const interlude = page.locator(".board-area .board-interlude");
  await expect(interlude.locator(".interlude-word")).toHaveText(/^1세트 (승리|패배|무승부)$/, { timeout: 40000 });
  const word = (await interlude.locator(".interlude-word").textContent()) ?? "",
    detail = (await interlude.locator(".interlude-detail").textContent()) ?? "";
  expect(detail).toMatch(/^\d+ : \d+ · 세트점 \d : \d$/);
  await expect(interlude).toHaveAttribute("aria-hidden", "true");
  await expect(interlude.locator("button")).toHaveCount(0);
  await expect(page.locator(".board-finale")).toHaveCount(0);
  // It fades by itself.
  await expect(interlude).toHaveCount(0, { timeout: 10000 });
  // The set is shot: its set points are given (2 to the higher total, 1 each for a tie), and the next set begins.
  await resting(page);
  const sets = aimOf(await canvas.getAttribute("data-sets"));
  expect(sets[0] + sets[1]).toBe(2);
  expect(detail).toContain(`세트점 ${sets[0]} : ${sets[1]}`);
  expect(word).toBe(`1세트 ${sets[0] > sets[1] ? "승리" : sets[0] < sets[1] ? "패배" : "무승부"}`);
  await expect(page.locator("#pg-count-0")).toHaveText(`세트 ${sets[0]}점`);
  await expect(page.locator("#pg-count-1")).toHaveText(`세트 ${sets[1]}점`);
  // The wind changed between my arrows.
  winds.add((await canvas.getAttribute("data-wind")) ?? "");
  expect(winds.size).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
