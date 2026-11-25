import { test, expect, type Page } from "@playwright/test";
import { atTheWheel, driver } from "../valet-driver";
import { selectGame } from "./library";

const canvas = (page: Page) => page.locator("#board canvas");
/** The car in hand: where it is, which way it points, how fast it goes and how far its wheels are turned. */
const car = async (page: Page) => {
  const [x, z, heading, v, steer] = ((await canvas(page).getAttribute("data-car")) ?? "").split(",").map(Number);
  return { x, z, heading, v, steer };
};
/** The shift's tally: cars parked, cars handed back, bumps, customers gone angry. */
const counts = async (page: Page) => ((await canvas(page).getAttribute("data-counts")) ?? "").split(",").map(Number);
const money = async (page: Page) => Number(await canvas(page).getAttribute("data-money"));
/** Sits down at the car park (its first lot, as laid) and waits for the first car to be in hand. */
async function sit(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "주차 요원");
  // Three lots to choose from, the first chosen.
  await expect(page.locator("dialog[open] .stage-card")).toHaveCount(3);
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  // A customer's car rolls in, the valet runs to it by itself, and it is mine to drive.
  await expect(canvas(page)).toHaveAttribute("data-phase", "drive", { timeout: 40000 });
  await expect(canvas(page)).toHaveAttribute("data-job", "waiting");
  return errors;
}
/** A key held or let go (sent to the table itself, as the keyboard would: a slow page then misses nothing). */
const key = (page: Page, type: "keydown" | "keyup", k: string) =>
  page.evaluate(([type, k]) => document.querySelector("#board canvas")!.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true })), [type, k]);
/** A finger put down on, or lifted from, one of the buttons on the screen. */
const finger = (page: Page, type: "pointerdown" | "pointerup", act: string, id: number) =>
  page.evaluate(
    ([type, act, id]) => {
      const button = document.querySelector<HTMLElement>(`.vp-pad [data-act=${act}]`)!,
        box = button.getBoundingClientRect();
      button.dispatchEvent(new PointerEvent(type as string, { pointerId: id as number, pointerType: "touch", isPrimary: id === 1, bubbles: true, cancelable: true, clientX: box.x + box.width / 2, clientY: box.y + box.height / 2 }));
    },
    [type, act, id] as const,
  );
/** Whether `inner` lies wholly inside `outer`. */
const inside = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

test("valet parking: the first car is mine to drive: the keys and the buttons on the screen drive and steer it, and it all fits the screen", async ({ page }) => {
  test.setTimeout(180000);
  const errors = await sit(page);
  // The shift's clock, the money (none yet) and the customer waiting are on the table.
  await expect(page.locator(".vp-clock")).toHaveText(/^[0-3]:\d\d$/);
  await expect(page.locator(".vp-money")).toContainText("0원");
  await expect(page.locator(".vp-job")).toHaveCount(1);
  await expect(page.locator(".vp-job.mine")).toContainText("주차");
  await expect(page.locator("#turn")).toContainText("수입 0원");
  const start = await car(page);
  expect(Math.abs(start.heading)).toBeLessThan(0.05);
  expect(Math.abs(start.v)).toBeLessThan(0.05);
  // ↑ drives forward (the car came in facing the lot: +x), and letting go lets it roll to rest.
  await key(page, "keydown", "ArrowUp");
  await expect(canvas(page)).toHaveAttribute("data-gear", "D");
  await expect.poll(async () => (await car(page)).x, { timeout: 30000 }).toBeGreaterThan(start.x + 1.5);
  await key(page, "keyup", "ArrowUp");
  // → turns the wheels right and the car's nose with them, while it still rolls.
  await key(page, "keydown", "ArrowRight");
  await expect.poll(async () => (await car(page)).steer, { timeout: 20000 }).toBeGreaterThan(0.3);
  await expect.poll(async () => (await car(page)).heading, { timeout: 20000 }).toBeGreaterThan(0.05);
  await key(page, "keyup", "ArrowRight");
  // Space is the handbrake: the car stands.
  await key(page, "keydown", " ");
  await expect.poll(async () => Math.abs((await car(page)).v), { timeout: 20000 }).toBeLessThan(0.02);
  await expect(canvas(page)).toHaveAttribute("data-gear", "P");
  await key(page, "keyup", " ");
  // ↓ from rest backs the car.
  const stood = await car(page);
  await key(page, "keydown", "s");
  await expect(canvas(page)).toHaveAttribute("data-gear", "R", { timeout: 20000 });
  await expect.poll(async () => (await car(page)).v, { timeout: 20000 }).toBeLessThan(-0.5);
  await expect.poll(async () => Math.hypot((await car(page)).x - stood.x, (await car(page)).z - stood.z), { timeout: 20000 }).toBeGreaterThan(0.3);
  await key(page, "keyup", "s");
  await key(page, "keydown", " ");
  await expect.poll(async () => Math.abs((await car(page)).v), { timeout: 20000 }).toBeLessThan(0.02);
  await key(page, "keyup", " ");
  // The buttons on the screen: the pedal and the wheel held by two fingers at once (the pedal stays down while the
  // other finger steers), each lit while held.
  const go = page.getByRole("button", { name: "가속", exact: true }),
    left = page.getByRole("button", { name: "왼쪽으로 핸들", exact: true });
  await expect(go).toBeVisible();
  await expect(page.getByRole("button", { name: "후진·브레이크", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "오른쪽으로 핸들", exact: true })).toBeVisible();
  const before = await car(page);
  await finger(page, "pointerdown", "up", 1);
  await expect(go).toHaveClass(/\bon\b/);
  await finger(page, "pointerdown", "left", 2);
  await expect(left).toHaveClass(/\bon\b/);
  await expect(go).toHaveClass(/\bon\b/);
  await expect.poll(async () => (await car(page)).steer, { timeout: 20000 }).toBeLessThan(-0.3);
  await expect.poll(async () => (await car(page)).v, { timeout: 20000 }).toBeGreaterThan(0.5);
  await expect.poll(async () => Math.hypot((await car(page)).x - before.x, (await car(page)).z - before.z), { timeout: 20000 }).toBeGreaterThan(0.5);
  await expect.poll(async () => (await car(page)).heading, { timeout: 20000 }).toBeLessThan(before.heading - 0.03);
  await finger(page, "pointerup", "left", 2);
  await expect(left).not.toHaveClass(/\bon\b/);
  await expect(go).toHaveClass(/\bon\b/);
  await finger(page, "pointerup", "up", 1);
  await expect(go).not.toHaveClass(/\bon\b/);
  // Nothing runs off the screen: no sideways scroll, the buttons and the words on the table.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const area = (await page.locator(".board-area").boundingBox())!,
    viewport = page.viewportSize()!;
  expect(inside(area, { x: 0, y: 0, width: viewport.width, height: viewport.height })).toBe(true);
  for (const part of [".vp-wheel", ".vp-pedals", ".vp-money", ".vp-clock", ".vp-jobs"]) expect(inside((await page.locator(part).boundingBox())!, area), part).toBe(true);
  // The buttons do not lie over one another, nor over the clock or the money.
  const boxes = await Promise.all([".vp-wheel", ".vp-pedals", ".vp-money", ".vp-clock"].map(async (part) => (await page.locator(part).boundingBox())!));
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++) {
      const [p, q] = [boxes[a], boxes[b]];
      expect(p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y, `${a} over ${b}`).toBe(true);
    }
  expect(errors).toEqual([]);
});

test("valet parking: a car driven into a free bay and stopped there is parked, and the customer pays", async ({ page }) => {
  test.setTimeout(240000);
  const errors = await sit(page);
  expect(await money(page)).toBe(0);
  expect(await counts(page)).toEqual([0, 0, 0, 0]);
  const free = JSON.parse((await canvas(page).getAttribute("data-free"))!).length;
  expect(free).toBe(14);
  // A careful driver at the wheel in the page, by the arrow keys and Space alone (no hook into the game): up the
  // aisle, round into the first free bay, and stopped in it.
  await page.evaluate(atTheWheel, driver.toString());
  await expect.poll(async () => (await counts(page))[0], { timeout: 150000, intervals: [250] }).toBe(1);
  // Parked: the pay with its tip is mine (20 for the job at the least, in hundreds of won on the table), the bay is
  // taken, and the table's words say so.
  const paid = await money(page);
  expect(paid).toBeGreaterThanOrEqual(20);
  expect(paid).toBeLessThanOrEqual(45);
  expect(JSON.parse((await canvas(page).getAttribute("data-free"))!).length).toBe(free - 1);
  await expect(page.locator("#turn")).toContainText(`수입 ${(paid * 100).toLocaleString("en-US")}원`);
  await expect(page.locator("#turn")).toContainText("주차 1대");
  await expect(page.locator(".vp-money")).toContainText(`${(paid * 100).toLocaleString("en-US")}원`);
  // Nothing was bumped on the way.
  expect((await counts(page))[2]).toBe(0);
  expect(errors).toEqual([]);
});

test("valet parking: a whole shift: cars parked, asked for again and driven out by the exit, and at the end of the three minutes the day's takings @alone", async ({ page }, info) => {
  // Three minutes of the shift's own clock (which a slowly drawn page stretches), once: in a small window, where the
  // page is drawn fastest.
  test.skip(info.project.name !== "desktop", "one whole shift is enough");
  test.setTimeout(900000);
  await page.setViewportSize({ width: 760, height: 480 });
  const errors = await sit(page);
  await page.evaluate(atTheWheel, driver.toString());
  // A customer comes back for a car: it is driven out of its bay and to the exit, and paid for again.
  await expect.poll(async () => (await counts(page))[1], { timeout: 400000, intervals: [500] }).toBeGreaterThan(0);
  await expect(page.locator("#turn")).toContainText(/출차 [1-9]\d*대/);
  // The clock runs out: the shift is over, neither won nor lost, and the takings stand.
  await expect(canvas(page)).toHaveAttribute("data-phase", "over", { timeout: 700000 });
  await expect(page.locator(".board-finale .finale-word")).toHaveText("근무 종료");
  const [parked, returned] = await counts(page),
    taken = await money(page);
  expect(parked).toBeGreaterThanOrEqual(4);
  expect(returned).toBeGreaterThanOrEqual(1);
  expect(taken).toBeGreaterThan(100);
  await expect(page.locator("#turn")).toContainText(`${(taken * 100).toLocaleString("en-US")}원`);
  await expect(page.locator(".vp-clock")).toHaveText("0:00");
  // Again: the lots are offered, and a new shift begins from nothing.
  await page.locator("#finale-again").click();
  await expect(page.locator("dialog[open] .stage-card")).toHaveCount(3);
  await page.locator("dialog[open] .stage-card").first().click();
  await expect(canvas(page)).not.toHaveAttribute("data-phase", "over", { timeout: 30000 });
  await expect.poll(() => money(page)).toBe(0);
  expect(await counts(page)).toEqual([0, 0, 0, 0]);
  await expect(page.locator(".vp-clock")).toHaveText(/^[23]:\d\d$/);
  expect(errors).toEqual([]);
});
