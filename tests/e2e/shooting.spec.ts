import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";
import { RIGS, type Mode } from "../../src/games/shooting/layout";

/** Fixes the world's seed (and so where targets light, clays fly and animals come out) and the sights' wander. */
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
const data = (page: Page) => page.evaluate(() => ({ ...document.querySelector<HTMLCanvasElement>("#board canvas")!.dataset }));
const score = async (page: Page) => Number((await data(page)).score ?? 0);
async function enter(page: Page, mode: Mode) {
  await page.goto("/");
  await selectGame(page, "사격");
  await page.locator("#pg-variant").selectOption(mode);
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("#board canvas")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(page.locator("#board canvas")).toHaveAttribute("data-mode", mode);
}
/**
 * One shot by hand: waits for something to shoot at (a lit target, a clay in the air, an animal in view; for clays the
 * gun is raised while the next clay is counted in), presses on it, holds, and once the sights stand close to a line
 * lets go, the last drag and the release made in one step in the page from what the canvas says (`data-aim`, the
 * thing's own aim in `data-targets`), so that the place has not moved on between reading and shooting.
 */
async function shoot(page: Page, mode: Mode) {
  const canvas = page.locator("#board canvas"),
    box = (await canvas.boundingBox())!;
  let at: { x: number; y: number } | null = null;
  await expect
    .poll(
      async () => {
        const d = await data(page);
        if (d.zoom !== "0.00" || d.loaded !== "true") return false;
        if (mode === "clay") {
          if (d.phase !== "ready") return false;
          at = { x: box.width / 2, y: box.height * 0.42 };
          return true;
        }
        const t = (JSON.parse(d.targets || "[]") as { x: number; y: number; yaw: number; doing?: string }[]).find((t) => t.x > 60 && t.x < box.width - 60 && t.y > 80 && t.y < box.height - 60 && t.doing !== "swim" && Math.abs(t.yaw) < RIGS[mode].yaws * 900);
        at = t ? { x: t.x, y: t.y } : null;
        return !!t;
      },
      { timeout: 60000, intervals: [100] },
    )
    .toBe(true);
  const press = { x: box.x + at!.x, y: box.y + at!.y };
  await page.mouse.move(press.x, press.y);
  await page.mouse.down();
  await expect(canvas).toHaveAttribute("data-holding", "true", { timeout: 20000 });
  const result = await page.evaluate(
    ({ press, fov, height, limit }) =>
      new Promise<string>((done) => {
        const c = document.querySelector<HTMLCanvasElement>("#board canvas")!,
          start = performance.now();
        const look = () => {
          // The thing nearest where the gun points (the one pressed on, if it is still there).
          const [yaw, pitch] = c.dataset.aim!.split(",").map(Number),
            things = JSON.parse(c.dataset.targets || "[]") as { yaw: number; pitch: number }[],
            t = things.sort((p, q) => Math.hypot(p.yaw - yaw, p.pitch - pitch) - Math.hypot(q.yaw - yaw, q.pitch - pitch))[0],
            [ox, oy] = (c.dataset.offset || "99,99").split(",").map(Number);
          if (!t || c.dataset.zoom !== "1.00" || Math.hypot(ox, oy) > limit) {
            if (performance.now() - start > 30000) return done("timeout");
            return setTimeout(look, 15);
          }
          // The press aimed the gun at what was under it and nothing has dragged it since: the aim is `data-aim`.
          const k = (fov * Math.PI) / 180 / height,
            x = press.x + (t.yaw - yaw) / 1000 / k,
            y = press.y - (t.pitch - pitch) / 1000 / k;
          c.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: x, clientY: y, bubbles: true }));
          c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "mouse", button: 0, clientX: x, clientY: y, bubbles: true }));
          done("shot");
        };
        look();
      }),
    { press, fov: RIGS[mode].aimFov, height: box.height, limit: mode === "clay" ? 10 : 6 },
  );
  await page.mouse.up();
  return result;
}

test.describe("shooting", () => {
  test("BB booth: a tap fires nothing; held up the rear sight wanders and settles; a lit target shot with the sights in line scores", async ({ page }) => {
    test.setTimeout(240000);
    await seeded(page, 31);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await enter(page, "bb");
    const canvas = page.locator("#board canvas");
    // A press let go before the gun is up lowers it without a shot.
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForTimeout(500);
    await expect(page.locator("#move-count")).toHaveText("0수");
    // Held, the rear sight moves off the front sight and back, and the eye goes to the sights.
    await page.mouse.down();
    await expect(canvas).toHaveAttribute("data-zoom", "1.00", { timeout: 20000 });
    await expect.poll(() => canvas.getAttribute("data-offset"), { timeout: 20000 }).toMatch(/^-?\d/);
    const first = await canvas.getAttribute("data-offset");
    await expect.poll(() => canvas.getAttribute("data-offset"), { timeout: 20000 }).not.toBe(first);
    // Held still, the hand steadies: the share of the full wander it allows comes down toward its floor.
    await expect.poll(async () => Number(await canvas.getAttribute("data-steady")), { timeout: 20000 }).toBeLessThan(0.3);
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(canvas).toHaveAttribute("data-holding", "false");
    await expect(canvas).toHaveAttribute("data-zoom", "0.00", { timeout: 20000 });
    // Shots at lit targets, until one scores.
    for (let k = 0; k < 6 && (await score(page)) === 0; k++) {
      expect(await shoot(page, "bb")).toBe("shot");
      await page.waitForTimeout(800);
    }
    expect(await score(page)).toBeGreaterThan(0);
    await expect(page.locator(".sh-hud")).toContainText("점수");
    expect(errors).toEqual([]);
  });
  test("clay range: a clay thrown, shot with the sights near a line, breaks", async ({ page }) => {
    test.setTimeout(240000);
    await seeded(page, 47);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await enter(page, "clay");
    for (let k = 0; k < 6 && (await score(page)) === 0; k++) {
      expect(await shoot(page, "clay")).toBe("shot");
      await page.waitForTimeout(800);
    }
    expect(await score(page)).toBeGreaterThan(0);
    await expect(page.locator(".sh-card i.x")).not.toHaveCount(0);
    expect(errors).toEqual([]);
  });
  test("hunt: an animal hit is wounded or taken, and a take scores", async ({ page }) => {
    test.setTimeout(300000);
    await seeded(page, 59);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await enter(page, "hunt");
    for (let k = 0; k < 10 && (await score(page)) === 0; k++) {
      expect(await shoot(page, "hunt")).toBe("shot");
      await page.waitForTimeout(900);
    }
    expect(await score(page)).toBeGreaterThan(0);
    await expect(page.locator(".sh-bag")).toBeVisible();
    expect(errors).toEqual([]);
  });
});
