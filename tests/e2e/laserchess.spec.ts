import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { eyeOf, laserSubject, orbitOf, piecePoint, squarePoint, turnButton } from "../../src/games/laserchess/layout";

const canvas = (page: Page) => page.locator("canvas");
const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const cell = (r: number, c: number) => r * 10 + c;
const facing = async (page: Page) => Number(await page.locator("#board").getAttribute("data-facing")) as 0 | 1;

/** Where a point of the table is on the screen, through the same camera as the view's (turned to the side it faces). */
async function screenAt(page: Page, p: { x: number; y: number; z: number }) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    { eye, target } = eyeOf(aspect, orbitOf(await facing(page)), cameraDistance(aspect, false, laserSubject(aspect))),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(eye.x, eye.y, eye.z);
  camera.lookAt(target.x, target.y, target.z);
  camera.updateMatrixWorld();
  const v = new Vector3(p.x, p.y, p.z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
async function tap(page: Page, p: { x: number; y: number; z: number }, mobile: boolean) {
  const at = await screenAt(page, p);
  if (mobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}
/** A piece picked up by a tap, then a tap on a square it may go to. */
async function moveTo(page: Page, from: number, to: number, mobile: boolean) {
  await tap(page, piecePoint(from), mobile);
  await expect(page.locator("#turn")).toContainText("갈 곳을 고르세요");
  await tap(page, squarePoint(to), mobile);
}
/** A piece picked up by a tap, then a tap on one of the two turn buttons standing over it. */
async function turnBy(page: Page, from: number, left: boolean, mobile: boolean) {
  await tap(page, piecePoint(from), mobile);
  await expect(page.locator("#turn")).toContainText("갈 곳을 고르세요");
  await tap(page, turnButton(from, left, await facing(page)), mobile);
}
/** Waits for the `n`-th move to have been made and its shot shown. */
async function made(page: Page, n: number) {
  await expect(canvas(page)).toHaveAttribute("data-ply", String(n), { timeout: 30000 });
}
async function sitDown(page: Page, mode: "local" | "ai") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "레이저 체스");
  await page.locator("dialog.entry").getByLabel(mode === "ai" ? "컴퓨터 대전" : "로컬 2인", { exact: true }).check();
  await page.locator("dialog.entry .choice[data-value='classic']").click();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  return errors;
}

test("laser chess: against the computer a piece is moved and turned by taps, each move fires its beam and the computer answers", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await sitDown(page, "ai");
  await expect(page.locator("#turn")).toContainText("나 (은빛) 차례");
  expect(await facing(page)).toBe(0);
  // The deflector at (6, 7) one square to the left: my laser then fires up its own column and off the board.
  await moveTo(page, cell(6, 7), cell(6, 6), mobile);
  await made(page, 1);
  await expect(canvas(page)).toHaveAttribute("data-shot", "off");
  await expect(canvas(page)).toHaveAttribute("data-beam", "8");
  // The computer answers with a move and a shot of its own.
  await made(page, 2);
  await expect.poll(() => moves(page), { timeout: 30000 }).toBe(2);
  await settled(page);
  expect(Number(await canvas(page).getAttribute("data-beam"))).toBeGreaterThan(1);
  await expect(page.locator("#turn")).toContainText("나 (은빛) 차례", { timeout: 20000 });
  // My laser turned against the clock by its button: it fires along the home row, where a deflector sends it off.
  await turnBy(page, cell(7, 9), true, mobile);
  await made(page, 3);
  await expect(canvas(page)).toHaveAttribute("data-shot", "off");
  await expect(canvas(page)).toHaveAttribute("data-beam", "3");
  await made(page, 4);
  await settled(page);
  // Against the computer the table never turns.
  expect(await facing(page)).toBe(0);
  await expect(canvas(page)).toHaveAttribute("data-lost", "0,0");
  expect(errors).toEqual([]);
});

test("laser chess: two at one screen turn the table to the one to move, and a beam bent by a turned mirror takes a piece", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await sitDown(page, "local");
  // Silver clears column 7 of its deflector; gold turns its laser east (its beam goes off the board at the far edge).
  await moveTo(page, cell(6, 7), cell(6, 6), mobile);
  await made(page, 1);
  await settled(page);
  expect(await facing(page)).toBe(1);
  await expect(page.locator("#turn")).toContainText("금빛 (플레이어 2) 차례");
  await turnBy(page, cell(0, 0), true, mobile);
  await made(page, 2);
  await settled(page);
  expect(await facing(page)).toBe(0);
  // Silver turns its home-row deflector to face north and east; gold turns its laser back.
  await turnBy(page, cell(7, 7), true, mobile);
  await made(page, 3);
  await settled(page);
  await turnBy(page, cell(0, 0), false, mobile);
  await made(page, 4);
  await settled(page);
  expect(await facing(page)).toBe(0);
  // Silver's laser turned west: along the home row, up column 7 off the turned mirror, into the plain side of gold's
  // deflector at (1, 7).
  await turnBy(page, cell(7, 9), true, mobile);
  await made(page, 5);
  await expect(canvas(page)).toHaveAttribute("data-shot", "take");
  await expect(canvas(page)).toHaveAttribute("data-lost", "0,1");
  await expect(page.locator("#pg-count-1")).toContainText("11");
  await settled(page);
  expect(await facing(page)).toBe(1);
  // Taken back, the piece stands again and silver is to move, facing its own side.
  await page.locator("#pg-undo").click();
  await made(page, 4);
  await expect(canvas(page)).toHaveAttribute("data-lost", "0,0");
  await expect(page.locator("#board")).toHaveAttribute("data-facing", "0");
  await expect(page.locator("#turn")).toContainText("은빛 (플레이어 1) 차례");
  expect(errors).toEqual([]);
});
