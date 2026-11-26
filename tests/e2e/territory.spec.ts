import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

/*
 * 땅따먹기 against the computer: the field, the board of shares, the map, steering by the keys (and on a touch
 * screen by the lever), a loop out of my land taking more land, a pause. The real clock is kept: the software-drawn
 * page is slow, so what is waited for is what the canvas tells, not a time.
 */
test.setTimeout(240_000);
const canvas = (page: Page) => page.locator("#board canvas");
const list = async (page: Page, what: string) => ((await canvas(page).getAttribute(`data-${what}`)) ?? "").split(",").map(Number);
const place = async (page: Page, k = 0) => ((await canvas(page).getAttribute("data-pos")) ?? "").split(";")[k].split(",").map(Number);
const key = (page: Page, code: string, down: boolean) => page.evaluate(([c, d]) => void document.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { code: c as string, bubbles: true })), [code, down] as const);
async function sit(page: Page, computers = "1", level = "easy", variant = "180") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "땅따먹기");
  await page.locator("#pg-variant").selectOption(variant);
  await page.locator("#pg-level").selectOption(level);
  await page.locator("#pg-set-computers").selectOption(computers);
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  return errors;
}
/** Holds a key until my mover has passed `to` along `axis` (0 across, 1 down) the key's way, then lets it go. */
async function steer(page: Page, code: string, axis: 0 | 1, to: number) {
  const way = code === "ArrowRight" || code === "ArrowDown" ? 1 : -1;
  await key(page, code, true);
  await expect.poll(async () => ((await place(page))[axis] - to) * way, { timeout: 90_000 }).toBeGreaterThan(0);
  await key(page, code, false);
}

test("territory against the computer: the field and its board, a loop out of my land takes more land, a pause stops it", async ({ page }) => {
  const errors = await sit(page);
  await expect(canvas(page)).toHaveAttribute("data-movers", "2");
  await expect(canvas(page)).toHaveAttribute("data-mine", "0");
  // The board: both movers, mine called 나; the clock at three minutes; the map of the field.
  await expect(page.locator(".ld-board li")).toHaveCount(2);
  await expect(page.locator(".ld-board li.ld-me")).toContainText("나");
  await expect(page.locator(".ld-board li:not(.ld-me)")).toContainText("컴퓨터 1");
  await expect(page.locator(".ld-clock b")).toHaveText(/^[23]:\d\d$/);
  await expect(page.locator(".ld-map")).toBeVisible();
  expect(await page.locator("canvas").count()).toBe(1);
  await expect(canvas(page)).toHaveAttribute("data-phase", "play", { timeout: 60_000 });
  const start = (await list(page, "shares"))[0];
  expect(start).toBeCloseTo(0.51, 1);
  // It runs on by itself.
  const p0 = await place(page);
  await expect.poll(async () => Math.hypot(...(await place(page)).map((v, i) => v - p0[i])), { timeout: 30_000 }).toBeGreaterThan(1);
  // A loop: right, down, left, and up into my land again (my patch is about cells 13 to 17 both ways).
  await steer(page, "ArrowRight", 0, 23);
  expect((await list(page, "trails"))[0]).toBeGreaterThan(0);
  await steer(page, "ArrowDown", 1, 23);
  await steer(page, "ArrowLeft", 0, 15.2);
  await key(page, "ArrowUp", true);
  await expect.poll(async () => (await list(page, "shares"))[0], { timeout: 90_000 }).toBeGreaterThan(start + 0.3);
  await key(page, "ArrowUp", false);
  expect((await list(page, "outs"))[0]).toBe(0);
  expect(Number(await canvas(page).getAttribute("data-claims"))).toBeGreaterThan(0);
  await expect(page.locator(".ld-clock span")).not.toHaveText("0.5%");
  // A pause stops the field; P again lets it run.
  await canvas(page).focus();
  await page.keyboard.press("p");
  await expect(page.locator("#board")).toHaveAttribute("data-paused", "true");
  const held = await place(page);
  await page.waitForTimeout(1200);
  expect(await place(page)).toEqual(held);
  await page.keyboard.press("p");
  await expect.poll(async () => (await place(page)).join(), { timeout: 30_000 }).not.toBe(held.join());
  expect(errors).toEqual([]);
});

const lever = (page: Page, type: "pointerdown" | "pointermove" | "pointerup", id: number, x = 0, y = 0) =>
  page.evaluate(
    ([t, i, lx, ly]) => {
      const el = document.querySelector<HTMLElement>(".ld-pad .ld-stick")!,
        r = el.getBoundingClientRect(),
        reach = r.width * 0.32;
      el.dispatchEvent(new PointerEvent(t as string, { pointerId: i as number, pointerType: "touch", bubbles: true, cancelable: true, clientX: r.x + r.width / 2 + (lx as number) * reach, clientY: r.y + r.height / 2 - (ly as number) * reach }));
    },
    [type, id, x, y] as const,
  );
const near = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test("territory on a touch screen: the lever turns my mover the way it leans, and a finger drawn over the field does too", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "the lever is a touch screen's");
  const errors = await sit(page);
  await expect(page.locator(".ld-pad .ld-stick")).toHaveCount(1);
  await expect(canvas(page)).toHaveAttribute("data-phase", "play", { timeout: 60_000 });
  // Leaned down: it turns to head down the field (toward the viewer).
  await lever(page, "pointerdown", 11, 0, -0.95);
  await expect(page.locator(".ld-stick")).toHaveClass(/on/);
  await expect.poll(async () => near((await list(page, "heading"))[0], Math.PI / 2), { timeout: 30_000 }).toBeLessThan(0.15);
  // Leaned right, then let go: it keeps on to the right.
  await lever(page, "pointermove", 11, 0.95, 0);
  await expect.poll(async () => near((await list(page, "heading"))[0], 0), { timeout: 30_000 }).toBeLessThan(0.15);
  await lever(page, "pointerup", 11);
  await expect(page.locator(".ld-stick")).not.toHaveClass(/on/);
  // A finger drawn upward over the field turns it up.
  const box = (await canvas(page).boundingBox())!;
  await page.evaluate(
    ([x, y]) => {
      const el = document.querySelector<HTMLElement>("#board canvas")!;
      const at = (type: string, dy: number) => el.dispatchEvent(new PointerEvent(type, { pointerId: 21, pointerType: "touch", bubbles: true, cancelable: true, clientX: x, clientY: y + dy }));
      at("pointerdown", 0);
      at("pointermove", -30);
      at("pointermove", -60);
    },
    [box.x + box.width / 2, box.y + box.height * 0.6] as const,
  );
  await expect.poll(async () => near((await list(page, "heading"))[0], -Math.PI / 2), { timeout: 30_000 }).toBeLessThan(0.15);
  expect(errors).toEqual([]);
});
