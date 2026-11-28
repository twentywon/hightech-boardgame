import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { idealThrow } from "../../src/games/basketball/sim";
import { swipeFor } from "../../src/games/basketball/layout";
import { cellPos, tttSubject } from "../../src/games/tictactoe/layout";
import type { Mode } from "../../src/games/tictactoe/rules";
import { selectGame } from "./library";

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
/** Sits down at a game, with the setup chosen first. */
async function sit(page: Page, name: string, setup: (page: Page) => Promise<void> = async () => {}) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, name);
  await setup(page);
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  return errors;
}
/** Where a cell of tic-tac-toe is on the screen, through the same camera as the table's. */
async function cellAt(page: Page, mode: Mode, cell: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = tttSubject(mode, aspect),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    distance = cameraDistance(aspect, false, subject),
    flat = Math.cos(subject.tilt) * distance;
  camera.position.set(0, Math.sin(subject.tilt) * distance, flat);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const p = cellPos(mode, cell),
    v = new Vector3(p.x, p.y + 0.05, p.z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
async function tap(page: Page, mode: Mode, cell: number) {
  const before = await moves(page),
    at = await cellAt(page, mode, cell);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => moves(page)).toBeGreaterThan(before);
}

test("tic-tac-toe: a tap marks a square and the computer answers", async ({ page }) => {
  const errors = await sit(page, "틱택토", async (p) => {
    await p.getByLabel("컴퓨터 대전", { exact: true }).check();
    await p.locator("#pg-variant").selectOption("classic");
  });
  await tap(page, "classic", 4);
  await expect.poll(() => moves(page), { timeout: 15000 }).toBe(2);
  expect(errors).toEqual([]);
});

test("tic-tac-toe: four down through the layers of the cube wins for two at one screen", async ({ page }) => {
  const errors = await sit(page, "틱택토", async (p) => {
    await p.getByLabel("로컬 2인", { exact: true }).check();
    await p.locator("#pg-variant").selectOption("cube");
  });
  for (const cell of [5, 0, 21, 1, 37, 2, 53]) await tap(page, "cube", cell);
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 15000 });
  expect(errors).toEqual([]);
});

test("air hockey: my mallet follows the hand, the puck moves, and a pause holds the table", async ({ page }) => {
  const errors = await sit(page, "에어하키", async (p) => {
    await p.getByLabel("컴퓨터 대전", { exact: true }).check();
  });
  await expect(page.locator("canvas")).toHaveAttribute("data-players", "1");
  const canvas = page.locator("canvas"),
    box = (await canvas.boundingBox())!;
  const before = await canvas.getAttribute("data-mallet");
  // The table lies across the screen with my goal at the left: a press there and a drag toward the middle,
  // through the puck lying in my half, strike it.
  await page.mouse.move(box.x + box.width * 0.15, box.y + box.height * 0.55);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(box.x + box.width * (0.15 + k * 0.035), box.y + box.height * 0.55);
  await page.mouse.up();
  await expect.poll(() => canvas.getAttribute("data-mallet")).not.toBe(before);
  const first = await canvas.getAttribute("data-puck");
  await expect.poll(() => canvas.getAttribute("data-puck"), { timeout: 10000 }).not.toBe(first);
  await canvas.focus();
  await page.keyboard.press("p");
  await expect(page.locator("#board")).toHaveAttribute("data-paused", /.*/);
  const held = await canvas.getAttribute("data-puck");
  await page.waitForTimeout(800);
  expect(await canvas.getAttribute("data-puck")).toBe(held);
  await page.keyboard.press("p");
  expect(errors).toEqual([]);
});

test("air hockey for two: two fingers on the table at once drive both mallets, and W A S D and the arrows drive one each", async ({ page, context }) => {
  const errors = await sit(page, "에어하키", async (p) => {
    await p.getByLabel("로컬 2인", { exact: true }).check();
    // The computer's level is offered only against the computer.
    await expect(p.locator("#pg-level-field")).toBeHidden();
  });
  const canvas = page.locator("canvas"),
    box = (await canvas.boundingBox())!,
    mallets = async () => ((await canvas.getAttribute("data-mallets")) ?? "").split(";").map((m) => m.split(",").map(Number));
  await expect(canvas).toHaveAttribute("data-players", "2");
  await expect(page.locator("#pg-side-0")).toContainText("왼쪽");
  await expect(page.locator("#pg-side-1")).toContainText("오른쪽");
  await expect(page.locator("aside.game-sidebar")).not.toContainText("컴퓨터");
  await expect.poll(async () => (await mallets()).length).toBe(2);
  const [left, right] = await mallets();
  // Two touch points, one on each half, go down and move at the same time (as two fingers on a phone or a tablet).
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  const L = { x: box.x + box.width * 0.2, y: box.y + box.height * 0.5 },
    R = { x: box.x + box.width * 0.8, y: box.y + box.height * 0.5 },
    points = (k: number) => [
      { x: L.x + k * box.width * 0.003, y: L.y - k * box.height * 0.012, id: 1 },
      { x: R.x - k * box.width * 0.003, y: R.y + k * box.height * 0.012, id: 2 },
    ];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(0) });
  for (let k = 1; k <= 12; k++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(k) });
    await page.waitForTimeout(60);
  }
  // Both mallets have gone where their own finger is: the left one up the screen (-x), the right one down it (+x).
  await expect.poll(async () => (await mallets())[0][0], { timeout: 10000 }).toBeLessThan(left[0] - 0.3);
  await expect.poll(async () => (await mallets())[1][0], { timeout: 10000 }).toBeGreaterThan(right[0] + 0.3);
  const [l, r] = await mallets();
  // Each stays in its own half.
  expect(l[1]).toBeGreaterThan(0);
  expect(r[1]).toBeLessThan(0);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  // The keys, back the other way: S for the left mallet down, ↑ for the right one up, at once.
  await canvas.focus();
  await page.keyboard.down("s");
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await mallets())[0][0], { timeout: 10000 }).toBeGreaterThan(l[0] + 0.2);
  await expect.poll(async () => (await mallets())[1][0], { timeout: 10000 }).toBeLessThan(r[0] - 0.2);
  await page.keyboard.up("s");
  await page.keyboard.up("ArrowUp");
  expect(errors).toEqual([]);
});

test("basketball: a swipe up throws the ball in, the clock starts, and Space throws too", async ({ page }) => {
  const errors = await sit(page, "농구");
  const canvas = page.locator("canvas"),
    box = (await canvas.boundingBox())!,
    stat = () => page.evaluate(() => [...document.querySelectorAll(".solo-stat")].map((e) => e.textContent ?? "").join(" "));
  await expect(canvas).toHaveAttribute("data-balls", "5");
  // Nothing runs before the first throw.
  await page.waitForTimeout(1200);
  expect(await moves(page)).toBe(0);
  // A swipe that does not begin on a ball takes nothing up and throws nothing (the user asked).
  const air = { x: box.x + box.width / 2, y: box.y + box.height * 0.3 };
  await page.mouse.move(air.x, air.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(air.x, air.y - (box.height * 0.25 * k) / 8);
  await page.mouse.up();
  await page.waitForTimeout(600);
  expect(await moves(page)).toBe(0);
  // A ball pressed on is taken up where it lies and thrown from there.
  const [bx, bz, sx, sy] = (await canvas.getAttribute("data-tray"))!.split(";")[0].split(",").map(Number),
    ideal = idealThrow(0, { x: bx, z: bz }),
    swipe = swipeFor(ideal.power, ideal.yaw, box.height),
    from = { x: box.x + sx, y: box.y + sy };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(from.x + (swipe.dx * k) / 8, from.y + (swipe.dy * k) / 8);
  await page.mouse.up();
  await expect.poll(() => moves(page)).toBeGreaterThan(0);
  // The ball goes in for two, and the seconds start to go by.
  await expect.poll(stat, { timeout: 15000 }).toContain("점수2");
  await expect.poll(stat, { timeout: 15000 }).not.toContain("45초");
  // Space held and let go throws the next ball.
  await canvas.focus();
  const before = await moves(page);
  await page.keyboard.down(" ");
  await page.waitForTimeout(500);
  await page.keyboard.up(" ");
  await expect.poll(async () => (await moves(page)) - before, { timeout: 5000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
