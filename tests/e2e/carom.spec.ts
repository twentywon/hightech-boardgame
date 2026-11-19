import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { ORBIT, R, caromSubject } from "../../src/games/carom/layout";

const canvas = (page: Page) => page.locator("canvas");
const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 60000 });
/** Where a point of the table is on the screen, through the same camera as the view's (seen from the long side). */
async function onScreen(page: Page, x: number, y: number, z: number) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    subject = caromSubject(box.height),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    flat = Math.cos(subject.tilt) * distance;
  camera.position.set(Math.sin(ORBIT) * flat, Math.sin(subject.tilt) * distance, Math.cos(ORBIT) * flat);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
/** The balls as the canvas tells them, by id. */
async function balls(page: Page) {
  return (await canvas(page).getAttribute("data-balls"))!.split(";").map((p) => p.split(",").map(Number) as [number, number]);
}
/** Pulls back from ball `id` away from the point (tx, tz) and lets go: a shot toward it. */
async function pull(page: Page, id: number, tx: number, tz: number, length = 1.6) {
  const [bx, bz] = (await balls(page))[id],
    d = Math.hypot(tx - bx, tz - bz),
    from = await onScreen(page, bx, R, bz),
    to = await onScreen(page, bx - ((tx - bx) / d) * length, 0, bz - ((tz - bz) / d) * length);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}
async function sit(page: Page, variant: "four" | "three") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "당구");
  await page.getByLabel("로컬 2인", { exact: true }).check({ force: true });
  await page.locator("#pg-variant").selectOption(variant);
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(canvas(page)).toHaveAttribute("data-kind", variant);
  await settled(page);
  return errors;
}

test("carom billiards: 4구, a pull on the white ball shoots it and the turn or the score moves on", async ({ page }) => {
  const errors = await sit(page, "four");
  await expect(page.locator("#turn")).toContainText("빨간 공 두 개");
  await expect(page.locator("#move-count")).toHaveText("0수");
  const before = await balls(page);
  // At the red in the middle of the table.
  await pull(page, 0, 0, 0);
  await expect(page.locator("#move-count")).toHaveText("1수", { timeout: 30000 });
  await settled(page);
  expect(await balls(page)).not.toEqual(before);
  // Either a point (the white shoots again) or the yellow's turn.
  const turn = await canvas(page).getAttribute("data-turn"),
    score = await canvas(page).getAttribute("data-score");
  expect(turn === "1" || score === "1,0").toBe(true);
  expect(errors).toEqual([]);
});

test("carom billiards: 3쿠션, the tip picker sets where the cue strikes and the shot carries it", async ({ page }) => {
  const errors = await sit(page, "three");
  await expect(page.locator("#turn")).toContainText("쿠션 세 번");
  await expect(canvas(page)).toHaveAttribute("data-tip", "0,0");
  // A tap on the right of the little ball and above its middle: side spin to the right, a little top spin.
  const pad = page.locator(".ca-tip-ball"),
    box = (await pad.boundingBox())!;
  await pad.click({ position: { x: box.width * 0.78, y: box.height * 0.35 } });
  const tip = (await canvas(page).getAttribute("data-tip"))!.split(",").map(Number);
  expect(tip[0]).toBeGreaterThan(3);
  expect(tip[1]).toBeGreaterThan(0);
  await expect(pad).toHaveAttribute("aria-label", /오른쪽/);
  // The keyboard moves it a step.
  await pad.press("ArrowLeft");
  await expect(canvas(page)).toHaveAttribute("data-tip", `${tip[0] - 1},${tip[1]}`);
  // At the red on the foot spot.
  await pull(page, 0, 0, -2.5, 2);
  await expect(page.locator("#move-count")).toHaveText("1수", { timeout: 30000 });
  await settled(page);
  await expect(canvas(page)).toHaveAttribute("data-last-tip", `${tip[0] - 1},${tip[1]}`);
  // The next shot starts from the middle of the ball again.
  await expect(canvas(page)).toHaveAttribute("data-tip", "0,0");
  expect(errors).toEqual([]);
});
