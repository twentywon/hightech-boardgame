import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

const canvas = (page: Page) => page.locator("#board canvas");
const data = (page: Page, key: string) => canvas(page).getAttribute(`data-${key}`);
const score = async (page: Page) => Number(/점수 ([\d,]+)/.exec(await page.locator("#turn").innerText())?.[1]?.replaceAll(",", "") ?? -1);
async function sit(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "핀볼");
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(canvas(page)).toHaveAttribute("data-phase", "plunger");
  // Synthetic pointers are not real ones the page could capture.
  await page.evaluate(() => (document.querySelector<HTMLCanvasElement>("#board canvas")!.setPointerCapture = () => {}));
  return errors;
}
/**
 * Pointer events sent in the page, as a finger's (the software-drawn page is too slow for real touches to arrive
 * together): `type` at the share (x, y) of the canvas, for the finger `id`.
 */
async function finger(page: Page, type: "pointerdown" | "pointermove" | "pointerup", id: number, x: number, y: number) {
  await page.evaluate(
    ([type, id, x, y]) => {
      const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
        box = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent(type as string, { pointerId: id as number, pointerType: "touch", isPrimary: id === 1, clientX: box.left + box.width * (x as number), clientY: box.top + box.height * (y as number), bubbles: true, cancelable: true, buttons: type === "pointerup" ? 0 : 1 }));
    },
    [type, id, x, y] as const,
  );
}

test("pinball: the keys flip and launch, fingers hold both flippers at once, the knob pulled launches, and points are scored", async ({ page }) => {
  test.setTimeout(150000);
  const errors = await sit(page);
  await expect(page.locator("#turn")).toContainText("공 1/3");
  expect(await score(page)).toBe(0);
  await canvas(page).focus();
  // The flippers by the keys: each up while its key is held.
  await page.keyboard.down("ArrowLeft");
  await expect(canvas(page)).toHaveAttribute("data-flippers", "1,0");
  await page.keyboard.up("ArrowLeft");
  await expect(canvas(page)).toHaveAttribute("data-flippers", "0,0");
  await page.keyboard.down("/");
  await expect(canvas(page)).toHaveAttribute("data-flippers", "0,1");
  await page.keyboard.up("/");
  await expect(canvas(page)).toHaveAttribute("data-flippers", "0,0");
  // Two fingers, one on each half: both flippers up together; each lifted lets its own fall.
  await finger(page, "pointerdown", 1, 0.2, 0.6);
  await finger(page, "pointerdown", 2, 0.8, 0.4);
  await expect(canvas(page)).toHaveAttribute("data-flippers", "1,1");
  await finger(page, "pointerup", 1, 0.2, 0.6);
  await expect(canvas(page)).toHaveAttribute("data-flippers", "0,1");
  await finger(page, "pointerup", 2, 0.8, 0.4);
  await expect(canvas(page)).toHaveAttribute("data-flippers", "0,0");
  // The plunger's knob pressed and pulled down: the pull shows, and let go the ball is launched up its lane.
  const [kx, ky] = (await data(page, "knob"))!.split(",").map(Number);
  expect(kx).toBeGreaterThan(0.5);
  expect(ky).toBeGreaterThan(0.6);
  await finger(page, "pointerdown", 3, kx, ky);
  await finger(page, "pointermove", 3, kx, ky + 0.15);
  await expect.poll(async () => Number(await data(page, "charge"))).toBeGreaterThan(0.5);
  await finger(page, "pointerup", 3, kx, ky + 0.15);
  await expect.poll(async () => Number((await data(page, "ball"))!.split(",")[1]), { timeout: 20000 }).toBeGreaterThan(0.5);
  // A player in the page flips at the ball as it comes down to either flipper and launches it again from the
  // plunger (Space held a moment): points are scored and shown.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
      key = (type: string, k: string) => el.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true }));
    const held: Record<string, boolean> = {};
    let lastY = 1,
      charging = 0;
    const loop = () => {
      if (!el.isConnected) return;
      const [x, y] = (el.dataset.ball ?? "0,1").split(",").map(Number),
        falling = y < lastY;
      lastY = y;
      for (const [k, side] of [["ArrowLeft", -1], ["ArrowRight", 1]] as const) {
        const near = Math.hypot(x - side * 0.06, y - 0.15) < 0.1 && falling;
        if (near !== !!held[k]) {
          key(near ? "keydown" : "keyup", k);
          held[k] = near;
        }
      }
      if (el.dataset.phase === "plunger") {
        if (!charging) {
          key("keydown", " ");
          charging = performance.now();
        } else if (performance.now() - charging > 700) {
          key("keyup", " ");
          charging = 0;
        }
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await expect.poll(() => score(page), { timeout: 90000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
