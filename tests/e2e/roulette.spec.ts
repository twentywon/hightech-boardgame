import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV } from "../../src/engine/camera";
import { SPOTS, payoutOf, spotOf } from "../../src/games/roulette/bets";
import { betCamera, spotPlace } from "../../src/games/roulette/layout";
import { selectGame } from "./library";

const canvas = (page: Page) => page.locator("#board canvas");
/** The balance and the chips on the table, as the bar shows them. */
async function purse(page: Page) {
  const text = await page.locator(".rl-purse").innerText();
  return { balance: Number(/칩\s*(\d+)/.exec(text)?.[1] ?? -1), on: Number(/건 칩\s*(\d+)/.exec(text)?.[1] ?? -1) };
}

test("roulette: chips laid by clicks on a number, a split and red; a spin; the ball rests and the balance changes by the payout", async ({ page }) => {
  test.slow();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "룰렛");
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(canvas(page)).toHaveAttribute("data-phase", "bet");
  expect(await purse(page)).toEqual({ balance: 1000, on: 0 });
  // Where a spot is on the screen, through the view's own camera over the layout.
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    pose = betCamera(aspect),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(pose.position.x, pose.position.y, pose.position.z);
  camera.lookAt(pose.target.x, pose.target.y, pose.target.z);
  camera.updateMatrixWorld();
  const onScreen = (id: number) => {
    const p = spotPlace(id),
      v = new Vector3(p.x, p.y, p.z).project(camera);
    return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
  };
  await page.locator(".rl-chip-5").click();
  await expect(page.locator(".rl-chip-5")).toHaveAttribute("aria-pressed", "true");
  const bets = [spotOf("straight", [17]), spotOf("split", [17, 20]), spotOf("red", SPOTS.find((s) => s.kind === "red")!.numbers)];
  for (const [k, id] of bets.entries()) {
    const at = onScreen(id);
    await page.mouse.click(at.x, at.y);
    await expect.poll(() => purse(page)).toEqual({ balance: 1000 - 5 * (k + 1), on: 5 * (k + 1) });
  }
  // Taken back and laid again.
  await page.getByRole("button", { name: "되돌리기" }).click();
  await expect.poll(() => purse(page)).toEqual({ balance: 990, on: 10 });
  const red = onScreen(bets[2]);
  await page.mouse.click(red.x, red.y);
  await expect.poll(() => purse(page)).toEqual({ balance: 985, on: 15 });
  await page.getByRole("button", { name: "돌리기", exact: true }).click();
  await expect(canvas(page)).toHaveAttribute("data-phase", "spin");
  // While the ball runs the number is not told: the bar keeps the balance as it was, and the camera is over the wheel.
  await expect(canvas(page)).toHaveAttribute("data-result", "");
  expect(await purse(page)).toEqual({ balance: 985, on: 15 });
  await expect(canvas(page)).toHaveAttribute("data-focus", "1.00", { timeout: 15000 });
  await expect(canvas(page)).toHaveAttribute("data-spins", "1", { timeout: 15000 });
  await expect(canvas(page)).toHaveAttribute("data-phase", "bet", { timeout: 40000 });
  const number = Number(await canvas(page).getAttribute("data-result"));
  expect(number).toBeGreaterThanOrEqual(0);
  expect(number).toBeLessThanOrEqual(36);
  const paid = bets.reduce((sum, id) => sum + (SPOTS[id].numbers.includes(number) ? 5 * (payoutOf(SPOTS[id].numbers.length) + 1) : 0), 0);
  await expect.poll(() => purse(page)).toEqual({ balance: 985 + paid, on: 0 });
  // The number is the first of the recent numbers.
  await expect(page.locator(".rl-history .rl-n").first()).toHaveText(String(number));
  // 다시 걸기 lays the same bets again.
  await page.getByRole("button", { name: "다시 걸기" }).click();
  await expect.poll(() => purse(page)).toEqual({ balance: 985 + paid - 15, on: 15 });
  expect(errors).toEqual([]);
});
