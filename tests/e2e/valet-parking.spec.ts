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
/** The valet on foot: where it stands. */
const valet = async (page: Page) => {
  const [x, z] = ((await canvas(page).getAttribute("data-valet")) ?? "").split(",").map(Number);
  return { x, z };
};
/** Sits down at the car park (its first lot, as laid) and waits for the first customer's car at the entrance, the valet on foot. */
async function sit(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "주차 요원");
  // Three lots to choose from, the first chosen.
  await expect(page.locator("dialog[open] .stage-card")).toHaveCount(3);
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  // The valet is on foot (nobody runs anywhere by itself), and a customer's car rolls in.
  await expect(canvas(page)).toHaveAttribute("data-phase", "walk");
  await expect.poll(async () => JSON.parse((await canvas(page).getAttribute("data-takes")) || "[]").length, { timeout: 40000 }).toBe(1);
  return errors;
}
/** A key held or let go (sent to the table itself, as the keyboard would: a slow page then misses nothing). */
const key = (page: Page, type: "keydown" | "keyup", k: string) =>
  page.evaluate(([type, k]) => document.querySelector("#board canvas")!.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true })), [type, k]);
/** A finger put down on, moved on, or lifted from a control on the screen (at its middle, or `dx`, `dy` from it). */
const finger = (page: Page, type: "pointerdown" | "pointermove" | "pointerup", part: string, id: number, dx = 0, dy = 0) =>
  page.evaluate(
    ([type, part, id, dx, dy]) => {
      const control = document.querySelector<HTMLElement>(part as string)!,
        box = control.getBoundingClientRect();
      control.dispatchEvent(new PointerEvent(type as string, { pointerId: id as number, pointerType: "touch", isPrimary: id === 1, bubbles: true, cancelable: true, clientX: box.x + box.width / 2 + (dx as number), clientY: box.y + box.height / 2 + (dy as number) }));
    },
    [type, part, id, dx, dy] as const,
  );
/** Whether `inner` lies wholly inside `outer`. */
const inside = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

test("valet parking: I walk the valet by the lever and the keys, get in by 탑승 next to the car (its bay named in a bubble), drive by the keys, the pedals and the steering wheel, and get out by 하차 once it stands", async ({ page }) => {
  test.setTimeout(360000);
  const errors = await sit(page);
  // The shift's clock, the money (none yet) and the customer waiting are on the table.
  await expect(page.locator(".vp-clock")).toHaveText(/^[0-3]:\d\d$/);
  await expect(page.locator(".vp-money")).toContainText("0원");
  await expect(page.locator(".vp-job")).toHaveCount(1);
  await expect(page.locator(".vp-job")).toHaveText("주차");
  await expect(page.locator("#turn")).toContainText("수입 0원");
  // On foot: the lever and 탑승 are on the screen, the pedals are not (they are for driving); 탑승 is not lit afar.
  const act = page.locator(".vp-act"),
    go = page.getByRole("button", { name: "가속", exact: true });
  await expect(page.locator(".vp-stick")).toBeVisible();
  await expect(page.getByRole("button", { name: "탑승", exact: true })).toBeVisible();
  await expect(go).toBeHidden();
  await expect(act).not.toHaveClass(/\bready\b/);
  // The lever leaned to the right by a thumb: the valet runs right; let go, it stands.
  const start = await valet(page);
  await finger(page, "pointerdown", ".vp-stick", 1);
  await finger(page, "pointermove", ".vp-stick", 1, 60, 0);
  await expect.poll(async () => (await valet(page)).x, { timeout: 30000 }).toBeGreaterThan(start.x + 1);
  expect(Math.abs((await valet(page)).z - start.z)).toBeLessThan(0.3);
  await finger(page, "pointerup", ".vp-stick", 1);
  const stood = await valet(page);
  await page.waitForTimeout(400);
  expect((await valet(page)).x).toBeCloseTo(stood.x, 2);
  // ← and ↓ walk it back to the car at the entrance, where it is stopped by the car's side, and 탑승 lights up.
  const [[id, cx]] = JSON.parse((await canvas(page).getAttribute("data-takes"))!);
  await key(page, "keydown", "ArrowLeft");
  await expect.poll(async () => (await valet(page)).x, { timeout: 30000 }).toBeLessThan(cx + 0.3);
  await key(page, "keyup", "ArrowLeft");
  await key(page, "keydown", "ArrowDown");
  await expect(canvas(page)).toHaveAttribute("data-near", String(id), { timeout: 30000 });
  await expect(act).toHaveClass(/\bready\b/);
  await page.waitForTimeout(300);
  // (It cannot walk into the car: it stands outside the car's side.)
  expect((await valet(page)).z).toBeLessThan(-0.9 - 0.25);
  await key(page, "keyup", "ArrowDown");
  // 탑승: at the wheel; the customer names a free bay, said in a bubble over the car, and kept in the row at the top.
  await finger(page, "pointerdown", ".vp-act", 3);
  await finger(page, "pointerup", ".vp-act", 3);
  await expect(canvas(page)).toHaveAttribute("data-phase", "drive", { timeout: 20000 });
  await expect(canvas(page)).toHaveAttribute("data-job", "waiting");
  const bay = (await canvas(page).getAttribute("data-bay"))!;
  expect(Number(bay)).toBeGreaterThanOrEqual(1);
  expect(Number(bay)).toBeLessThanOrEqual(14);
  await expect(canvas(page)).toHaveAttribute("data-said", `${bay}번 칸`);
  await expect(page.locator(".vp-job.mine")).toHaveText(`${bay}번 칸 주차`);
  expect(JSON.parse((await canvas(page).getAttribute("data-free"))!).map((b: number[]) => b[0])).toContain(JSON.parse((await canvas(page).getAttribute("data-want"))!)[0]);
  // The bubble goes after a few seconds of the lot's own clock (which a slowly drawn page stretches: at a frame a
  // second it runs a tenth of the time); the bay's number stays at the top.
  await expect(canvas(page)).toHaveAttribute("data-said", "", { timeout: 90000 });
  await expect(page.locator(".vp-job.mine")).toHaveText(`${bay}번 칸 주차`);
  // At the wheel: 하차 instead of 탑승, and the pedals.
  await expect(page.getByRole("button", { name: "하차", exact: true })).toBeVisible();
  await expect(go).toBeVisible();
  const car0 = await car(page);
  expect(Math.abs(car0.heading)).toBeLessThan(0.05);
  // ↑ drives forward (the car came in facing the lot: +x), and letting go lets it roll to rest.
  await key(page, "keydown", "ArrowUp");
  await expect(canvas(page)).toHaveAttribute("data-gear", "D");
  await expect.poll(async () => (await car(page)).x, { timeout: 30000 }).toBeGreaterThan(car0.x + 1.5);
  // 하차 while it still rolls: not let out.
  await finger(page, "pointerdown", ".vp-act", 3);
  await finger(page, "pointerup", ".vp-act", 3);
  await expect(canvas(page)).toHaveAttribute("data-phase", "drive");
  await key(page, "keyup", "ArrowUp");
  // → turns the wheels right and the car's nose with them, while it still rolls.
  await key(page, "keydown", "ArrowRight");
  await expect.poll(async () => (await car(page)).steer, { timeout: 20000 }).toBeGreaterThan(0.3);
  await key(page, "keyup", "ArrowRight");
  // Space is the handbrake: the car stands.
  await key(page, "keydown", " ");
  await expect.poll(async () => Math.abs((await car(page)).v), { timeout: 20000 }).toBeLessThan(0.02);
  await expect(canvas(page)).toHaveAttribute("data-gear", "P");
  await key(page, "keyup", " ");
  // ↓ from rest backs the car.
  await key(page, "keydown", "s");
  await expect(canvas(page)).toHaveAttribute("data-gear", "R", { timeout: 20000 });
  await expect.poll(async () => (await car(page)).v, { timeout: 20000 }).toBeLessThan(-0.5);
  await key(page, "keyup", "s");
  await key(page, "keydown", " ");
  await expect.poll(async () => Math.abs((await car(page)).v), { timeout: 20000 }).toBeLessThan(0.02);
  await key(page, "keyup", " ");
  // At the wheel the lever is a steering wheel, turned like a real one: a thumb taking it at the top and going round
  // clockwise turns it to the right (the wheel drawn turned with it) and the car's wheels right; let go, it comes back
  // to the middle by itself, not at once.
  await expect(page.locator(".vp-stick")).toHaveAttribute("aria-label", "핸들");
  await expect(page.locator(".vp-wheel")).toBeVisible();
  const wheel = async () => Number(await canvas(page).getAttribute("data-wheel"));
  await finger(page, "pointerdown", ".vp-stick", 4, 0, -46);
  await finger(page, "pointermove", ".vp-stick", 4, 33, -33);
  await finger(page, "pointermove", ".vp-stick", 4, 46, 0);
  await finger(page, "pointermove", ".vp-stick", 4, 33, 33);
  await finger(page, "pointermove", ".vp-stick", 4, 0, 46);
  await finger(page, "pointermove", ".vp-stick", 4, -33, 33);
  await expect.poll(wheel).toBeGreaterThan(200);
  expect(await page.locator(".vp-wheel").evaluate((el) => getComputedStyle(el).transform)).not.toBe("none");
  await expect.poll(async () => (await car(page)).steer, { timeout: 20000 }).toBeGreaterThan(0.2);
  await finger(page, "pointerup", ".vp-stick", 4);
  const letGo = await wheel();
  await expect.poll(wheel, { timeout: 20000 }).toBe(0);
  expect(letGo).toBeGreaterThan(0);
  await expect.poll(async () => Math.abs((await car(page)).steer), { timeout: 20000 }).toBeLessThan(0.05);
  // The pedal and the wheel held by two fingers at once: the wheel turned the other way round steers left while the
  // pedal stays down.
  const before = await car(page);
  await finger(page, "pointerdown", ".vp-go", 1);
  await expect(go).toHaveClass(/\bon\b/);
  await finger(page, "pointerdown", ".vp-stick", 2, 0, -46);
  await finger(page, "pointermove", ".vp-stick", 2, -33, -33);
  await finger(page, "pointermove", ".vp-stick", 2, -46, 0);
  await finger(page, "pointermove", ".vp-stick", 2, -33, 33);
  await finger(page, "pointermove", ".vp-stick", 2, 0, 46);
  await finger(page, "pointermove", ".vp-stick", 2, 33, 33);
  await expect(go).toHaveClass(/\bon\b/);
  await expect.poll(wheel).toBeLessThan(-200);
  await expect.poll(async () => (await car(page)).steer, { timeout: 20000 }).toBeLessThan(-0.3);
  await expect.poll(async () => (await car(page)).v, { timeout: 20000 }).toBeGreaterThan(0.5);
  await expect.poll(async () => (await car(page)).heading, { timeout: 20000 }).toBeLessThan(before.heading - 0.03);
  // Nothing runs off the screen while driving: no sideways scroll, the controls and the words on the table, apart.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const area = (await page.locator(".board-area").boundingBox())!,
    viewport = page.viewportSize()!;
  expect(inside(area, { x: 0, y: 0, width: viewport.width, height: viewport.height })).toBe(true);
  for (const part of [".vp-stick", ".vp-side", ".vp-money", ".vp-clock", ".vp-jobs"]) expect(inside((await page.locator(part).boundingBox())!, area), part).toBe(true);
  const boxes = await Promise.all([".vp-stick", ".vp-side", ".vp-money", ".vp-clock"].map(async (part) => (await page.locator(part).boundingBox())!));
  for (let a = 0; a < boxes.length; a++)
    for (let b = a + 1; b < boxes.length; b++) {
      const [p, q] = [boxes[a], boxes[b]];
      expect(p.x + p.width <= q.x || q.x + q.width <= p.x || p.y + p.height <= q.y || q.y + q.height <= p.y, `${a} over ${b}`).toBe(true);
    }
  await finger(page, "pointerup", ".vp-stick", 2);
  await finger(page, "pointerup", ".vp-go", 1);
  await expect(go).not.toHaveClass(/\bon\b/);
  // Stopped (in the aisle, no bay): 하차 (E) lets the valet out and leaves the car standing, still the customer's.
  await key(page, "keydown", " ");
  await expect.poll(async () => Math.abs((await car(page)).v), { timeout: 20000 }).toBeLessThan(0.02);
  await key(page, "keyup", " ");
  await expect(act).toHaveClass(/\bready\b/);
  await key(page, "keydown", "e");
  await key(page, "keyup", "e");
  await expect(canvas(page)).toHaveAttribute("data-phase", "walk", { timeout: 20000 });
  await expect(page.getByRole("button", { name: "탑승", exact: true })).toBeVisible();
  await expect(canvas(page)).toHaveAttribute("data-near", String(id));
  expect((await counts(page))[0]).toBe(0);
  // In again (Enter), the same bay.
  await key(page, "keydown", "Enter");
  await key(page, "keyup", "Enter");
  await expect(canvas(page)).toHaveAttribute("data-phase", "drive", { timeout: 20000 });
  await expect(canvas(page)).toHaveAttribute("data-bay", bay);
  expect(errors).toEqual([]);
});

test("valet parking: walked to the car, driven into the bay its customer named and stopped there, the valet gets out and the customer pays", async ({ page }) => {
  test.setTimeout(240000);
  const errors = await sit(page);
  expect(await money(page)).toBe(0);
  expect(await counts(page)).toEqual([0, 0, 0, 0]);
  const free = JSON.parse((await canvas(page).getAttribute("data-free"))!).length;
  expect(free).toBe(14);
  // A careful valet at work in the page, by the arrow keys, Space and E alone (no hook into the game): to the car, in,
  // up the aisle, round into the named bay, stopped in it, and out.
  await page.evaluate(atTheWheel, driver.toString());
  await expect(canvas(page)).toHaveAttribute("data-phase", "drive", { timeout: 60000 });
  const bay = (await canvas(page).getAttribute("data-bay"))!;
  expect(Number(bay)).toBeGreaterThanOrEqual(1);
  await expect.poll(async () => (await counts(page))[0], { timeout: 150000, intervals: [250] }).toBe(1);
  // Parked in that bay: the pay with its tip is mine (20 for the job at the least, in hundreds of won on the table),
  // the bay is taken, and the table's words say so.
  await expect(page.locator(".vp-word")).toContainText(`${bay}번 칸 주차`);
  const paid = await money(page);
  expect(paid).toBeGreaterThanOrEqual(20);
  expect(paid).toBeLessThanOrEqual(45);
  expect(JSON.parse((await canvas(page).getAttribute("data-free"))!).map((b: number[]) => b[0])).not.toContain(Number(bay) - 1);
  await expect(page.locator("#turn")).toContainText(`수입 ${(paid * 100).toLocaleString("en-US")}원`);
  await expect(page.locator("#turn")).toContainText("주차 1대");
  await expect(page.locator(".vp-money")).toContainText(`${(paid * 100).toLocaleString("en-US")}원`);
  // Nothing was bumped on the way, and the valet is on foot again.
  expect((await counts(page))[2]).toBe(0);
  await expect(canvas(page)).toHaveAttribute("data-phase", "walk");
  expect(errors).toEqual([]);
});

test("valet parking: each lot has its own setting: the mart by day, the burger restaurant's lot at night, the car park under the ground", async ({ page }) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  for (const [k, name, scene] of [
    [1, "햄버거 가게 주차장", "burger-night"],
    [2, "지하 주차장", "underground"],
    [0, "마트 주차장", "mart"],
  ] as const) {
    await selectGame(page, "주차 요원");
    const cards = page.locator("dialog[open] .stage-card");
    await expect(cards).toHaveCount(3);
    await expect(cards.nth(k)).toContainText(name);
    // (Choosing a lot sits down at it.)
    await cards.nth(k).click();
    await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
    await expect(canvas(page)).toHaveAttribute("data-scene", scene, { timeout: 30000 });
    // The lot works as ever: a customer's car rolls in to be taken.
    await expect.poll(async () => JSON.parse((await canvas(page).getAttribute("data-takes")) || "[]").length, { timeout: 40000 }).toBe(1);
  }
  expect(errors).toEqual([]);
});

test("valet parking: the lots are labelled 쉬움, 보통, 어려움 in their order, and a car kept waiting in the street sounds its horn, again and again", async ({ page }) => {
  test.setTimeout(180000);
  const errors = await sit(page);
  // The lot's level on the table's label.
  await expect(page.locator("main.game-layout")).toContainText("마트 주차장 (쉬움)");
  // Nobody takes the car at the entrance: the next customer waits in the street and honks, more than once.
  await expect.poll(async () => Number(await canvas(page).getAttribute("data-honks")), { timeout: 90000 }).toBeGreaterThanOrEqual(1);
  const first = Number(await canvas(page).getAttribute("data-honks"));
  await expect.poll(async () => Number(await canvas(page).getAttribute("data-honks")), { timeout: 30000 }).toBeGreaterThan(first);
  // The lot picker names each lot with its level.
  await page.locator("#restart").click();
  const cards = page.locator("dialog[open] .stage-card");
  await expect(cards).toHaveCount(3);
  for (const [k, text] of ["마트 주차장 (쉬움)", "햄버거 가게 주차장 (보통)", "지하 주차장 (어려움)"].entries()) await expect(cards.nth(k)).toContainText(text);
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
  // A customer comes back for a car: the valet walks to it, and it is driven out of its bay and to the exit, and paid for again.
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
