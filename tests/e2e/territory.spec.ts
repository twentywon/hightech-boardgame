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
  // A loop, steered in the page by what the canvas tells (the software-drawn page is too slow to steer from here):
  // right, down, back left past where it began, and up into my land again.
  const loop = await page.evaluate(
    (start) =>
      new Promise<{ share: number; outs: number; trail: number; leg: number }>((done) => {
        const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
          read = () => {
            const d = el.dataset,
              [x, y] = d.pos!.split(";")[0].split(",").map(Number);
            return { x, y, share: Number(d.shares!.split(",")[0]), outs: Number(d.outs!.split(",")[0]), trail: Number(d.trails!.split(",")[0]) };
          },
          key = (code: string, down: boolean) => document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true })),
          from = read(),
          legs: [string, (p: ReturnType<typeof read>) => boolean][] = [
            ["ArrowRight", (p) => p.x > from.x + 4],
            ["ArrowDown", (p) => p.y > from.y + 4],
            ["ArrowLeft", (p) => p.x < from.x],
            ["ArrowUp", (p) => p.share > start + 0.3],
          ],
          began = performance.now();
        let leg = 0,
          most = 0;
        key(legs[0][0], true);
        const tick = () => {
          const p = read();
          most = Math.max(most, p.trail);
          if (p.outs || performance.now() - began > 150_000) {
            key(legs[Math.min(leg, 3)][0], false);
            return done({ share: p.share, outs: p.outs, trail: most, leg });
          }
          if (legs[leg][1](p)) {
            key(legs[leg][0], false);
            if (++leg === legs.length) return done({ share: p.share, outs: p.outs, trail: most, leg });
            key(legs[leg][0], true);
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
    start,
  );
  expect(loop).toMatchObject({ outs: 0, leg: 4 });
  expect(loop.trail).toBeGreaterThan(5);
  expect(loop.share).toBeGreaterThan(start + 0.3);
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

test("territory's three rounds, and a deathmatch: no clock but who is still in, and my fall ends it as a loss", async ({ page }) => {
  await page.goto("/");
  await selectGame(page, "땅따먹기");
  // The rounds offered: 3분판, 5분판, 데스매치 (the user asked).
  await expect(page.locator("#pg-variant option")).toHaveText(["3분판", "5분판", "데스매치"]);
  const errors = await sit(page, "1", "easy", "death");
  await expect(canvas(page)).toHaveAttribute("data-mode", "death");
  await expect(page.locator(".ld-clock b")).toHaveText("생존 2");
  await expect(canvas(page)).toHaveAttribute("data-phase", "play", { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute("data-left", "");
  // Out of my land, right, down, back left, then up across my own trail: out, and in a deathmatch for good.
  const fall = await page.evaluate(
    () =>
      new Promise<{ outs: number; leg: number }>((done) => {
        const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
          read = () => {
            const d = el.dataset,
              [x, y] = d.pos!.split(";")[0].split(",").map(Number);
            return { x, y, outs: Number(d.outs!.split(",")[0]), phase: d.phase };
          },
          key = (code: string, down: boolean) => document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true })),
          from = read(),
          legs: [string, (p: ReturnType<typeof read>) => boolean][] = [
            ["ArrowRight", (p) => p.x > from.x + 5],
            ["ArrowDown", (p) => p.y > from.y + 3],
            ["ArrowLeft", (p) => p.x < from.x + 3.4],
            ["ArrowUp", () => false],
          ],
          began = performance.now();
        let leg = 0;
        key(legs[0][0], true);
        const tick = () => {
          const p = read();
          if (p.outs || p.phase === "over" || performance.now() - began > 150_000) {
            key(legs[leg][0], false);
            return done({ outs: p.outs, leg });
          }
          if (legs[leg][1](p)) {
            key(legs[leg][0], false);
            key(legs[++leg][0], true);
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  expect(fall).toMatchObject({ outs: 1, leg: 3 });
  // Against the computer my fall ends a deathmatch: a loss, the computer first.
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute("data-phase", "over");
  await expect(page.locator("#pg-final")).toContainText("1위 컴퓨터 1");
  await expect(page.locator("#pg-final")).toContainText("마지막까지 살아남은 쪽이 이깁니다");
  expect((await list(page, "alive"))[0]).toBe(0);
  expect(errors).toEqual([]);
});
