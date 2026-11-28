import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { REST_Y, TOP, arrowAt, cellAt, pushSubject } from "../../src/games/push/layout";
import { cellOf } from "../../src/games/push/rules";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("#board canvas");
const NE = 1;

/** Where a point of the table is on the screen, through the same camera as the view's (seen from the near side). */
async function screenAt(page: Page, p: { x: number; y: number; z: number }) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    subject = pushSubject(aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(p.x, p.y, p.z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
/** The top of the marble (or the floor of the cup) on the cell at axial (q, r). */
const cellPoint = (q: number, r: number, full = true) => ({ ...cellAt(cellOf(q, r)), y: full ? REST_Y + 0.12 : TOP });
async function tapAt(page: Page, at: { x: number; y: number }, mobile: boolean) {
  if (mobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}
const tapCell = async (page: Page, q: number, r: number, mobile: boolean, full = true) => tapAt(page, await screenAt(page, cellPoint(q, r, full)), mobile);
async function tapArrow(page: Page, group: [number, number][], dir: number, mobile: boolean) {
  await tapAt(page, await screenAt(page, arrowAt(group.map(([q, r]) => cellOf(q, r)), dir)), mobile);
}
const group = async (page: Page) => (await canvas(page).getAttribute("data-group")) ?? "";
const cells = async (page: Page) => (await canvas(page).getAttribute("data-cells")) ?? "";
const at = (q: number, r: number) => cellOf(q, r);
async function enter(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "구슬 밀기");
  return errors;
}
async function sitDown(page: Page) {
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
}

test("marble push: a group chosen by taps moves in line, a refusal is told, and undo takes it back", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await enter(page),
    dialog = page.locator("dialog.entry");
  await dialog.getByLabel("로컬 2인", { exact: true }).check();
  await dialog.locator(".choice[data-value='standard']").click();
  await sitDown(page);
  await expect(page.locator("#turn")).toContainText("호박 (플레이어 1) 차례");
  // A tap on the other side's marble is refused in words.
  await tapCell(page, 0, -2, mobile);
  await expect(page.locator("#turn")).toContainText("상대 구슬은 고를 수 없습니다");
  // Two of mine one behind the other, then the cell ahead of them: the pair steps forward in line.
  await tapCell(page, -1, 3, mobile);
  await expect.poll(() => group(page)).toBe(String(at(-1, 3)));
  await tapCell(page, -1, 2, mobile);
  await expect.poll(() => group(page)).toBe(`${at(-1, 3)},${at(-1, 2)}`);
  await expect(canvas(page)).toHaveAttribute("data-arrows", /2/);
  const before = await cells(page);
  await tapCell(page, -1, 1, mobile, false);
  await expect.poll(() => moves(page)).toBe(1);
  await settled(page);
  const after = await cells(page);
  expect(after[at(-1, 3)]).toBe(".");
  expect(after[at(-1, 1)]).toBe("0");
  expect(after).not.toBe(before);
  await expect(page.locator("#turn")).toContainText("청금석 (플레이어 2) 차례");
  // Side 1 takes three of its own sideways with the arrow.
  await tapCell(page, 0, -2, mobile);
  await tapCell(page, 2, -2, mobile);
  await expect.poll(() => group(page)).toBe(`${at(0, -2)},${at(1, -2)},${at(2, -2)}`);
  await tapArrow(page, [[0, -2], [1, -2], [2, -2]], 4, mobile);
  await expect.poll(() => moves(page)).toBe(2);
  await settled(page);
  expect((await cells(page))[at(-1, -1)]).toBe("1");
  await page.locator("#pg-undo").click();
  await expect.poll(() => moves(page)).toBe(1);
  expect(await cells(page)).toBe(after);
  expect(errors).toEqual([]);
});

test("marble push: against the computer a dragged group moves sideways and the computer answers", async ({ page }) => {
  const errors = await enter(page),
    dialog = page.locator("dialog.entry");
  await dialog.getByLabel("컴퓨터 대전", { exact: true }).check();
  await dialog.locator(".choice[data-value='standard']").click();
  await dialog.locator(".choice[data-label='쉬움']").click();
  await sitDown(page);
  // A drag across three of mine in the third row chooses them all.
  const from = await screenAt(page, cellPoint(-2, 2)),
    to = await screenAt(page, cellPoint(0, 2));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => group(page)).toBe(`${at(-2, 2)},${at(-1, 2)},${at(0, 2)}`);
  await tapArrow(page, [[-2, 2], [-1, 2], [0, 2]], NE, false);
  await expect.poll(() => moves(page)).toBe(1);
  // The computer answers.
  await expect.poll(() => moves(page), { timeout: 20000 }).toBe(2);
  await settled(page);
  const now = await cells(page);
  expect([at(-1, 1), at(0, 1), at(1, 1)].map((c) => now[c])).toEqual(["0", "0", "0"]);
  // Against the computer undo goes back to my own turn, before my move.
  await page.locator("#pg-undo").click();
  await expect.poll(() => moves(page)).toBe(0);
  // The keyboard: the cursor to a marble, Enter chooses it, W moves it up-left.
  await canvas(page).focus();
  // The first arrow key puts the cursor on my marble nearest the middle; Enter chooses it.
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect.poll(() => group(page)).not.toBe("");
  await page.keyboard.press("KeyW");
  await expect.poll(() => moves(page)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
