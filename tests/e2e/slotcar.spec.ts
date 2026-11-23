import { test, expect, type Page } from "@playwright/test";
import { fastClock, selectGame } from "./library";

const canvas = (page: Page) => page.locator("#board canvas");
/** How far each car has come, along the track (laps and the way into this one). */
const progress = async (page: Page) => ((await canvas(page).getAttribute("data-progress")) ?? "").split(",").map(Number);
/** Sits down at the slot car table with the setup's choices. */
async function sit(page: Page, choose: { mode?: "ai" | "local"; course?: string; laps?: number; computers?: number; people?: number } = {}) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "슬롯 카");
  const dialog = page.locator("dialog[open]");
  if (choose.mode) await dialog.locator(`input[name=pg-mode][value=${choose.mode}]`).check();
  if (choose.course) await dialog.locator("#pg-variant").selectOption(choose.course);
  if (choose.laps) await dialog.locator("#pg-set-laps").selectOption(String(choose.laps));
  if (choose.computers) await dialog.locator("#pg-set-computers").selectOption(String(choose.computers));
  if (choose.people) await dialog.locator("#pg-set-people").selectOption(String(choose.people));
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 60000 });
  return errors;
}
/** Whether `inner` lies wholly inside `outer`. */
const inside = (inner: { x: number; y: number; width: number; height: number }, outer: { x: number; y: number; width: number; height: number }) =>
  inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.width <= outer.x + outer.width + 0.5 && inner.y + inner.height <= outer.y + outer.height + 0.5;

test("slot car: the race opens on the table, holding the pedal drives my car, the keyboard does too, and it all fits the screen", async ({ page }) => {
  test.setTimeout(240000);
  const errors = await sit(page);
  // Four lanes against three computers, the lights counting down before anything moves.
  await expect(canvas(page)).toHaveAttribute("data-lanes", "4");
  const pedal = page.getByRole("button", { name: "가속 페달", exact: true });
  await expect(pedal).toBeVisible();
  await expect(page.locator(".sc-board")).toContainText("나");
  await expect(canvas(page)).toHaveAttribute("data-phase", "race", { timeout: 60000 });
  await expect(page.locator(".sc-board")).toContainText("LAP");
  expect((await progress(page))[0]).toBeLessThan(0.5);
  // The pedal held: my car goes; let go, it stays down there and the car slows.
  const box = (await pedal.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(pedal).toHaveClass(/\bon\b/);
  await expect.poll(async () => (await progress(page))[0], { timeout: 40000 }).toBeGreaterThan(2);
  await page.mouse.up();
  await expect(pedal).not.toHaveClass(/\bon\b/);
  // The computer's cars drive themselves.
  await expect.poll(async () => Math.min(...(await progress(page)).slice(1)), { timeout: 40000 }).toBeGreaterThan(2);
  // Space holds the pedal as well.
  await expect.poll(async () => Number(((await canvas(page).getAttribute("data-speeds")) ?? "").split(",")[0]), { timeout: 30000 }).toBeLessThan(0.5);
  const before = (await progress(page))[0];
  await page.keyboard.down("Space");
  await expect.poll(async () => (await progress(page))[0], { timeout: 40000 }).toBeGreaterThan(before + 1);
  await page.keyboard.up("Space");
  // Nothing runs off the screen: no sideways scroll, the board, the pedal and the board of places on the table.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const area = (await page.locator(".board-area").boundingBox())!,
    viewport = page.viewportSize()!;
  expect(inside(area, { x: 0, y: 0, width: viewport.width, height: viewport.height })).toBe(true);
  expect(inside((await pedal.boundingBox())!, area)).toBe(true);
  expect(inside((await page.locator(".sc-board").boundingBox())!, area)).toBe(true);
  expect(inside((await canvas(page).boundingBox())!, area)).toBe(true);
  // Paused, the race stands still.
  await page.locator("#pg-pause").click();
  await expect(page.locator("#board")).toHaveAttribute("data-paused", "true");
  const held = await progress(page);
  await page.waitForTimeout(800);
  expect(await progress(page)).toEqual(held);
  await page.locator("#pg-pause").click();
  expect(errors).toEqual([]);
});

test("slot car: a short race against the computer ends with the finishing order", async ({ page }) => {
  test.setTimeout(330000);
  await fastClock(page);
  const errors = await sit(page, { mode: "ai", course: "eight", laps: 3, computers: 1 });
  await expect(canvas(page)).toHaveAttribute("data-lanes", "2");
  // I never touch the pedal: the computer's car laps the course three times and wins.
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 300000 });
  await expect(page.locator(".board-finale")).toContainText("레이스 종료");
  await expect(page.locator("#pg-final")).toContainText("컴퓨터가 이겼습니다.");
  await expect(page.locator("#pg-final")).toContainText("1위 컴퓨터 1 · 2위 나(완주 못 함)");
  await expect(page.locator(".sc-board")).toContainText("결승 순위");
  await expect(canvas(page)).toHaveAttribute("data-phase", "over");
  expect(await canvas(page).getAttribute("data-laps")).toBe("0,3");
  expect(errors).toEqual([]);
});

test("slot car: four people at one screen each have a pedal toward their own side, and can hold them at once", async ({ page }) => {
  test.setTimeout(240000);
  const errors = await sit(page, { mode: "local", course: "hairpin", people: 4 });
  await expect(canvas(page)).toHaveAttribute("data-lanes", "4");
  const area = (await page.locator(".board-area").boundingBox())!,
    middle = { x: area.x + area.width / 2, y: area.y + area.height / 2 },
    pedals = page.locator(".sc-pedal");
  await expect(pedals).toHaveCount(4);
  // 1 at the lower left, 2 at the lower right, 3 at the upper right and 4 at the upper left, each inside the table.
  const corners = [
    [-1, 1],
    [1, 1],
    [1, -1],
    [-1, -1],
  ];
  for (let k = 0; k < 4; k++) {
    const box = (await page.getByRole("button", { name: new RegExp(`^${k + 1}번 .* 가속 페달$`) }).boundingBox())!;
    expect(Math.sign(box.x + box.width / 2 - middle.x)).toBe(corners[k][0]);
    expect(Math.sign(box.y + box.height / 2 - middle.y)).toBe(corners[k][1]);
    expect(inside(box, area)).toBe(true);
  }
  await expect(canvas(page)).toHaveAttribute("data-phase", "race", { timeout: 60000 });
  // Two fingers at once, on the pedals of cars 1 and 3: those two go, the others stay at the line.
  const press = (seat: number, id: number, type: "pointerdown" | "pointerup") =>
    page.evaluate(
      ({ seat, id, type }) => {
        const button = document.querySelector<HTMLElement>(`.sc-pedal[data-seat="${seat}"]`)!,
          r = button.getBoundingClientRect();
        button.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: "touch", isPrimary: id === 11, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true, cancelable: true }));
      },
      { seat, id, type },
    );
  await press(0, 11, "pointerdown");
  await press(2, 12, "pointerdown");
  await expect(page.locator('.sc-pedal[data-seat="0"]')).toHaveAttribute("data-held", "true");
  await expect(page.locator('.sc-pedal[data-seat="2"]')).toHaveAttribute("data-held", "true");
  await expect.poll(async () => Math.min((await progress(page))[0], (await progress(page))[2]), { timeout: 40000 }).toBeGreaterThan(1.5);
  const [, second, , fourth] = await progress(page);
  expect(second).toBeLessThan(0.3);
  expect(fourth).toBeLessThan(0.3);
  await press(0, 11, "pointerup");
  await press(2, 12, "pointerup");
  await expect(page.locator('.sc-pedal[data-seat="0"]')).toHaveAttribute("data-held", "false");
  // The board names every person's car.
  for (const name of ["1번 빨강", "2번 파랑", "3번 노랑", "4번 초록"]) await expect(page.locator(".sc-board")).toContainText(name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
