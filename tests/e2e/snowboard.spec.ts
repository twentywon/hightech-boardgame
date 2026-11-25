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
 * A jump the moment the rider rides on the snow, done in the page so that the slow software-drawn page does not miss
 * it: `how` is a key (↑), the screen's ▲ button, or a tap on the slope.
 */
async function pop(page: Page, how: "key" | "button" | "tap") {
  await page.evaluate(
    (how) =>
      new Promise<void>((done) => {
        const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
          button = document.querySelector<HTMLElement>('.sb-btn[data-act="jump"]')!,
          box = el.getBoundingClientRect();
        const look = () => {
          if (el.dataset.phase !== "ride") return requestAnimationFrame(look);
          if (how === "key") {
            el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
            el.dispatchEvent(new KeyboardEvent("keyup", { key: "ArrowUp", bubbles: true, cancelable: true }));
          } else {
            const target = how === "button" ? button : el,
              at = how === "button" ? button.getBoundingClientRect() : box,
              init = { pointerId: 7, pointerType: "touch", isPrimary: true, clientX: at.left + at.width / 2, clientY: at.top + at.height / 2, bubbles: true, cancelable: true };
            target.dispatchEvent(new PointerEvent("pointerdown", { ...init, buttons: 1 }));
            target.dispatchEvent(new PointerEvent("pointerup", { ...init, buttons: 0 }));
          }
          done();
        };
        requestAnimationFrame(look);
      }),
    how,
  );
}
/** A finger put on (or lifted from) one of the screen's buttons: tuck, back or front. */
const finger = (page: Page, act: string, down: boolean) =>
  page.evaluate(
    ([act, down]) => {
      const b = document.querySelector<HTMLElement>(`.sb-btn[data-act="${act}"]`)!,
        at = b.getBoundingClientRect();
      b.dispatchEvent(new PointerEvent(down ? "pointerdown" : "pointerup", { pointerId: 9, pointerType: "touch", isPrimary: true, clientX: at.left + at.width / 2, clientY: at.top + at.height / 2, bubbles: true, cancelable: true, buttons: down ? 1 : 0 }));
    },
    [act, down] as const,
  );

test("snowboard: the clock goes; ↓ and the ▼ button tuck, ↑, the ▲ button and a tap jump, ← and the ⟲ button turn the rider in the air, and the score and speed show", async ({ page }) => {
  test.setTimeout(150000);
  const errors = await sit(page);
  await expect(page.locator(".sb-score")).toContainText("SCORE 0");
  await expect(page.locator(".sb-mult")).toHaveText("×1");
  await expect(page.locator(".sb-time")).toContainText("TIME 1:5");
  await expect(page.locator(".sb-btn")).toHaveCount(4);
  // The rider rides off by itself and the clock runs; the speed shows in km/h.
  await expect.poll(async () => Number(await data(page, "x")), { timeout: 20000 }).toBeGreaterThan(5);
  await expect.poll(async () => Number(await data(page, "time")), { timeout: 10000 }).toBeGreaterThan(1);
  await expect(page.locator(".sb-speed")).toContainText("km/h");
  await canvas(page).focus();
  // ↓ held: the rider tucks; let go, it stands.
  await page.keyboard.down("ArrowDown");
  await expect.poll(async () => Number(await data(page, "crouch")), { timeout: 10000 }).toBeGreaterThan(0.5);
  await page.keyboard.up("ArrowDown");
  await expect.poll(async () => Number(await data(page, "crouch")), { timeout: 10000 }).toBeLessThan(0.3);
  // The ▼ button the same way, held by a finger.
  await finger(page, "tuck", true);
  await expect.poll(async () => Number(await data(page, "crouch")), { timeout: 10000 }).toBeGreaterThan(0.5);
  await finger(page, "tuck", false);
  await expect.poll(async () => Number(await data(page, "crouch")), { timeout: 10000 }).toBeLessThan(0.3);
  // ↑ pops the rider into the air; so do the ▲ button and a tap on the slope.
  for (const how of ["key", "button", "tap"] as const) {
    const before = (await counts(page))[0];
    await pop(page, how);
    await expect.poll(async () => (await counts(page))[0], { timeout: 15000, message: how }).toBeGreaterThan(before);
  }
  // In the air ← (or the ⟲ button) turns the rider backward (counterclockwise): its angle grows well past the slope's.
  for (const by of ["key", "button"] as const) {
    const turned = await page.evaluate(
      (by) =>
        new Promise<number>((done) => {
          const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
            button = document.querySelector<HTMLElement>('.sb-btn[data-act="back"]')!,
            key = (type: string, k: string) => el.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true })),
            hold = (down: boolean) => {
              if (by === "key") return key(down ? "keydown" : "keyup", "ArrowLeft");
              const at = button.getBoundingClientRect();
              button.dispatchEvent(new PointerEvent(down ? "pointerdown" : "pointerup", { pointerId: 11, pointerType: "touch", isPrimary: true, clientX: at.left + 5, clientY: at.top + 5, bubbles: true, cancelable: true, buttons: down ? 1 : 0 }));
            };
          let phase = 0,
            start = 0,
            at = 0;
          const look = (now: number) => {
            const d = el.dataset;
            if (phase === 0 && d.phase === "ride") {
              key("keydown", "ArrowUp");
              key("keyup", "ArrowUp");
              phase = 1;
            } else if (phase === 1 && d.phase === "air") {
              start = Number(d.angle);
              hold(true);
              phase = 2;
              at = now;
            } else if (phase === 2 && (now - at > 450 || d.phase !== "air")) {
              const turned = Number(d.angle) - start;
              hold(false);
              return done(turned);
            }
            requestAnimationFrame(look);
          };
          requestAnimationFrame(look);
        }),
      by,
    );
    expect(turned, by).toBeGreaterThan(0.4);
  }
  // Points come in as the run goes on (gates, snowflakes, landings): the score and the status line show them.
  const score = async () => Number(/점수 ([\d,]+)/.exec(await page.locator("#turn").innerText())?.[1]?.replaceAll(",", "") ?? -1);
  await expect.poll(score, { timeout: 60000 }).toBeGreaterThan(0);
  await expect(page.locator(".sb-score")).toContainText(`SCORE ${(await score()).toLocaleString("ko-KR")}`);
  expect(errors).toEqual([]);
});
