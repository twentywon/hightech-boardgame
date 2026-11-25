import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

const canvas = (page: Page) => page.locator("#board canvas");
const data = async (page: Page, key: string) => (await canvas(page).getAttribute(`data-${key}`)) ?? "";
/** The ride's counts: pops, landings, crashes, gates, snowflakes. */
const counts = async (page: Page) => (await data(page, "counts")).split(",").map(Number);
async function sit(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "스노보드");
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  // Synthetic pointers are not real ones the page could capture.
  await page.evaluate(() => (document.querySelector<HTMLCanvasElement>("#board canvas")!.setPointerCapture = () => {}));
  return errors;
}
/**
 * A press held on the snow and let go (a pop), done in the page so that the slow software-drawn page does not stretch
 * it: it waits until the rider rides on the snow, holds `ms`, and lets go while it still does. `how` is a key (Space)
 * or a finger at the share `x` of the canvas's width.
 */
async function pop(page: Page, how: { key: string } | { x: number }, ms = 320) {
  await page.evaluate(
    ([how, ms]) =>
      new Promise<void>((done) => {
        const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
          box = el.getBoundingClientRect(),
          send = (down: boolean) => {
            if ("key" in how) el.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: how.key, bubbles: true, cancelable: true }));
            else el.dispatchEvent(new PointerEvent(down ? "pointerdown" : "pointerup", { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: box.left + box.width * how.x, clientY: box.top + box.height * 0.6, bubbles: true, cancelable: true, buttons: down ? 1 : 0 }));
          };
        let since = -1;
        const look = (now: number) => {
          const riding = el.dataset.phase === "ride";
          if (since < 0) {
            if (riding) {
              send(true);
              since = now;
            }
          } else if (now - since >= (ms as number)) {
            // Let go only on the snow (in the air a let-go pops nothing): else start again.
            if (riding) {
              send(false);
              return done();
            }
            send(false);
            since = -1;
          }
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }),
    [how, ms] as const,
  );
}

test("snowboard: the run's clock goes, a press held crouches and let go pops (keys and a finger), the hands turn the rider in the air, and the score shows", async ({ page }) => {
  test.setTimeout(150000);
  const errors = await sit(page);
  await expect(page.locator(".sb-score")).toContainText("SCORE 0");
  await expect(page.locator(".sb-mult")).toHaveText("×1");
  await expect(page.locator(".sb-time")).toContainText("TIME 1:5");
  // The rider rides off by itself and the clock runs.
  await expect.poll(async () => Number(await data(page, "x")), { timeout: 20000 }).toBeGreaterThan(5);
  await expect.poll(async () => Number(await data(page, "time")), { timeout: 10000 }).toBeGreaterThan(1);
  await canvas(page).focus();
  // Space held: the rider crouches.
  await page.keyboard.down(" ");
  await expect.poll(async () => Number(await data(page, "crouch")), { timeout: 10000 }).toBeGreaterThan(0.5);
  await page.keyboard.up(" ");
  await expect.poll(async () => Number(await data(page, "crouch")), { timeout: 10000 }).toBeLessThan(0.3);
  // A held Space let go on the snow pops the rider into the air.
  const before = (await counts(page))[0];
  await pop(page, { key: " " });
  await expect.poll(async () => (await counts(page))[0], { timeout: 10000 }).toBeGreaterThan(before);
  // A finger the same way (on either half).
  const afterKey = (await counts(page))[0];
  await pop(page, { x: 0.75 });
  await expect.poll(async () => (await counts(page))[0], { timeout: 10000 }).toBeGreaterThan(afterKey);
  // In the air ← turns the rider backward (counterclockwise): its angle grows well past the slope's.
  const turned = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
          key = (type: string, k: string) => el.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
        let phase = 0,
          start = 0,
          at = 0;
        const look = (now: number) => {
          const d = el.dataset;
          if (phase === 0 && d.phase === "ride") {
            key("keydown", " ");
            phase = 1;
            at = now;
          } else if (phase === 1 && now - at > 400 && d.phase === "ride") {
            key("keyup", " ");
            phase = 2;
          } else if (phase === 2 && d.phase === "air") {
            start = Number(d.angle);
            key("keydown", "ArrowLeft");
            phase = 3;
            at = now;
          } else if (phase === 3 && (now - at > 450 || d.phase !== "air")) {
            const turned = Number(d.angle) - start;
            key("keyup", "ArrowLeft");
            return done(turned);
          }
          requestAnimationFrame(look);
        };
        requestAnimationFrame(look);
      }),
  );
  expect(turned).toBeGreaterThan(0.4);
  // Points come in as the run goes on (gates, snowflakes, landings): the score and the status line show them.
  const score = async () => Number(/점수 ([\d,]+)/.exec(await page.locator("#turn").innerText())?.[1]?.replaceAll(",", "") ?? -1);
  await expect.poll(score, { timeout: 60000 }).toBeGreaterThan(0);
  await expect(page.locator(".sb-score")).toContainText(`SCORE ${(await score()).toLocaleString("ko-KR")}`);
  expect(errors).toEqual([]);
});
