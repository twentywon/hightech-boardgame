import { test, expect, type Page } from "@playwright/test";
import { fastClock, selectGame } from "./library";

const canvas = (page: Page) => page.locator("#board canvas");
const score = async (page: Page) => Number(/점수 (\d+)/.exec(await page.locator("#turn").innerText())?.[1] ?? -1);
/** Sits down at the lake (its first level, as laid). */
async function sit(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "낚시");
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(canvas(page)).toHaveAttribute("data-phase", "ready");
  return errors;
}
/**
 * A steady hand at the rod, run in the page frame by frame (a person watches the float the same way): Space strikes
 * the moment the float goes under; then, hooked, Space pressed again and again (eight times a second by the clock)
 * turns the reel's crank while the fish does not run, and stops while it surges or the line is near breaking; a line
 * back in is cast again with Space.
 */
async function angler(page: Page) {
  await page.evaluate(() => {
    const board = document.querySelector<HTMLCanvasElement>("#board canvas")!;
    let last = performance.now();
    const key = (type: string) => board.dispatchEvent(new KeyboardEvent(type, { key: " ", bubbles: true, cancelable: true }));
    const tap = () => {
      key("keydown");
      key("keyup");
    };
    const loop = () => {
      if (!board.isConnected) return;
      const d = board.dataset,
        now = performance.now();
      if (d.phase === "ready" || d.phase === "bite") tap();
      else if (d.phase === "fight" && d.surge !== "1" && Number(d.tension) < 0.8) {
        for (let k = 0; k < 4 && now - last >= 125; k++, last += 125) tap();
        last = Math.max(last, now - 125);
      } else last = now;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

test("fishing: a press on the water casts, a strike at the bite hooks, reeling lands a catch and the score rises", async ({ page }, info) => {
  test.setTimeout(150000);
  const errors = await sit(page);
  await expect(page.locator("#turn")).toContainText("남은 시간");
  expect(await score(page)).toBe(0);
  // A press (a tap on a phone) on the middle of the water casts the float there.
  const box = (await canvas(page).boundingBox())!,
    [x, y] = (await canvas(page).getAttribute("data-water"))!.split(",").map(Number);
  if (info.project.name === "mobile") await page.touchscreen.tap(box.x + x, box.y + y);
  else await page.mouse.click(box.x + x, box.y + y);
  await expect(canvas(page)).toHaveAttribute("data-phase", "wait", { timeout: 10000 });
  const [fx, fz] = (await canvas(page).getAttribute("data-float"))!.split(",").map(Number);
  expect(Math.abs(fx)).toBeLessThan(1);
  expect(Math.abs(fz + 14)).toBeLessThan(1);
  // The float lands with a move (the cast counts), and the clock runs.
  await expect.poll(async () => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0)).toBeGreaterThan(0);
  // Something comes and the float goes under; the hand strikes and reels until something is landed.
  await angler(page);
  await expect(canvas(page)).toHaveAttribute("data-phase", /bite|fight|land/, { timeout: 30000 });
  await expect.poll(async () => Number(await canvas(page).getAttribute("data-caught")), { timeout: 70000, intervals: [200] }).toBeGreaterThan(0);
  // A fish (or the boot) brings points; a can alone brings none, so the hand fishes on until the score has risen.
  await expect.poll(() => score(page), { timeout: 70000, intervals: [250] }).toBeGreaterThan(0);
  await expect(page.locator(".fish-board [data-k=score]")).toHaveText(String(await score(page)));
  expect(errors).toEqual([]);
});

test("fishing: the round runs out after its 90 seconds and says 시간 종료 @alone", async ({ page }) => {
  test.setTimeout(200000);
  // The lake never moves on more than 0.3 s in one frame (so that a bite is never skipped on a slow device): under
  // software drawing (a few frames a second) the quicker clock gains little, so the round may still take its 90 s.
  await fastClock(page, 3);
  const errors = await sit(page);
  // Cast once, and leave the line in the water until the clock has run out.
  await canvas(page).focus();
  await page.keyboard.press("Space");
  await expect(canvas(page)).toHaveAttribute("data-phase", /flight|wait/);
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 150000 });
  await expect(page.locator(".board-finale")).toContainText("시간 종료");
  await expect(page.locator(".fish-board [data-k=left]")).toHaveText("0초");
  // The line comes back in, and nothing more can be cast.
  await expect(canvas(page)).toHaveAttribute("data-phase", "ready", { timeout: 15000 });
  await canvas(page).focus();
  await page.keyboard.press("Space");
  await page.waitForTimeout(400);
  await expect(canvas(page)).toHaveAttribute("data-phase", "ready");
  expect(errors).toEqual([]);
});

test("fishing: hooked, circles drawn on the screen turn the reel, and the fish comes in; a press alone winds nothing", async ({ page }) => {
  test.setTimeout(120000);
  const errors = await sit(page);
  const data = () => page.evaluate(() => ({ ...document.querySelector<HTMLCanvasElement>("#board canvas")!.dataset }));
  // Cast with Space, and strike at the bite (watched every frame in the page).
  await page.evaluate(() => {
    const board = document.querySelector<HTMLCanvasElement>("#board canvas")!;
    const tap = () => ["keydown", "keyup"].forEach((type) => board.dispatchEvent(new KeyboardEvent(type, { key: " ", bubbles: true, cancelable: true })));
    const loop = () => {
      const phase = board.dataset.phase;
      if (phase === "ready" || phase === "bite") tap();
      if (phase !== "fight") requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await expect(canvas(page)).toHaveAttribute("data-phase", "fight", { timeout: 60000 });
  // A finger put down and held still winds nothing.
  const finger = (kind: "down" | "circles" | "up", ms = 0) =>
    page.evaluate(
      ({ kind, ms }) => {
        const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
          box = el.getBoundingClientRect(),
          cx = box.left + box.width * 0.5,
          cy = box.top + box.height * 0.6,
          r = box.height * 0.12;
        el.setPointerCapture = () => {};
        const send = (type: string, x: number, y: number) =>
          el.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: "touch", isPrimary: true, buttons: kind === "up" ? 0 : 1, clientX: x, clientY: y, bubbles: true }));
        if (kind === "down") return send("pointerdown", cx + r, cy);
        if (kind === "up") return send("pointerup", cx + r, cy);
        // Circles, three a second, a place every 16 ms (a software-drawn page delivers real touches far apart).
        const start = performance.now();
        for (let k = 1; k * 16 <= ms; k++) {
          while (performance.now() - start < k * 16);
          const a = 2 * Math.PI * 3 * ((k * 16) / 1000);
          send("pointermove", cx + r * Math.cos(a), cy + r * Math.sin(a));
        }
      },
      { kind, ms },
    );
  await finger("down");
  const before = Number((await data()).distance);
  await page.waitForTimeout(500);
  expect(Number((await data()).spin)).toBe(0);
  // Circles: the crank turns, the reel winds and the fish comes nearer (between surges, while it is still on).
  let spun = 0,
    nearer = false;
  for (let k = 0; k < 10 && !nearer; k++) {
    await finger("circles", 700);
    const d = await data();
    spun = Math.max(spun, Number(d.spin));
    if (d.phase !== "fight" || Number(d.distance) < before - 0.3) nearer = true;
  }
  expect(spun).toBeGreaterThan(1);
  expect(nearer).toBe(true);
  // Lifted, the crank stops.
  await finger("up");
  await expect.poll(async () => Number((await data()).spin), { timeout: 5000 }).toBe(0);
  expect(errors).toEqual([]);
});
