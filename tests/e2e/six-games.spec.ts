import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { BASE, slotX } from "../../src/games/carrom/rules";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const board = (page: Page) => page.locator("#board");
const rest = async (page: Page) => {
  await expect(board(page)).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(260);
};
async function sit(page: Page, name: string, before?: () => Promise<void>) {
  await page.goto("/");
  await selectGame(page, name);
  await before?.();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  await page.locator("canvas").focus();
}
async function keys(page: Page, list: string[]) {
  await rest(page);
  for (const key of list) await page.keyboard.press(key);
}
/** Where a point of the table appears on the page, for a view looking down at `tilt`. */
async function onScreen(page: Page, subject: { half: number; halfZ: number; height: number; lookY: number; tilt: number }, x: number, y: number, z: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
/** Presses at one place of the table, pulls to another and lets go. */
async function pull(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await rest(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
}

test("number baseball: I fix my number, throw, and the computer throws back; its number is not in the page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "숫자 야구");
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await page.locator("canvas").focus();
  await expect(page.locator("#turn")).toContainText("내 숫자 3자리를 정하세요");
  await expect(page.getByRole("button", { name: "무르기", exact: true })).toBeHidden();
  // 0, 1, 2 from the keys chalked on the board, then 확인 at the far right.
  // Each press of Enter is a move: the table is given time to take it.
  for (const walk of [["ArrowRight", "ArrowLeft"], ["ArrowRight"], ["ArrowRight"], Array<string>(9).fill("ArrowRight")]) await keys(page, [...walk, "Enter"]);
  await expect(page.locator("#turn")).toContainText("상대 숫자 3자리를 맞혀 보세요");
  for (const walk of [Array<string>(8).fill("ArrowLeft"), ["ArrowRight"], ["ArrowRight"], Array<string>(6).fill("ArrowRight")]) await keys(page, [...walk, "Enter"]);
  await expect(count(page)).toHaveText("2수", { timeout: 20000 });
  await expect(page.locator("#pg-count-0")).toContainText("1번째");
  await expect(page.locator("#pg-count-1")).toContainText("1번째");
  expect(await page.locator("main").innerHTML()).not.toContain("컴퓨터의 숫자는");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("wall race: the pawn steps, a wall is set from the keyboard, and the rules carry no controls section", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sit(page, "길막기");
  await expect(page.locator("#pg-count-0")).toHaveText("남은 벽 10개 · 앞으로 8칸");
  // The keyboard starts on my pawn. Up once is the gap above it, where a wall would go; up again is the square beyond.
  await keys(page, ["ArrowUp", "ArrowUp", "ArrowUp", "Enter"]);
  await expect(count(page)).toHaveText("2수", { timeout: 20000 });
  await expect(page.locator("#pg-count-0")).toContainText("남은 벽 10개");
  // The cursor has stayed on the pawn's new square: the gap above it takes a wall.
  await keys(page, ["ArrowUp", "Enter"]);
  await expect(page.locator("#pg-count-0")).toContainText("남은 벽 9개", { timeout: 20000 });
  await page.getByRole("button", { name: "게임 방법" }).click();
  const titles = await page.locator("dialog h3").allTextContents();
  expect(titles[0]).toBe("기본 규칙");
  expect(titles).not.toContain("조작");
  expect(titles).not.toContain("그 밖에");
  await page.locator("dialog").getByRole("button", { name: "확인" }).click();
  // Other games' windows have lost those sections too.
  await page.goto("/");
  await selectGame(page, "오목");
  await page.locator(".game-stage button.primary").click();
  await page.getByRole("button", { name: "게임 방법" }).click();
  const gomoku = await page.locator("dialog h3").allTextContents();
  expect(gomoku).toContain("삼삼(3-3) 규칙");
  expect(gomoku).not.toContain("조작");
  expect(errors).toEqual([]);
});

test("dominoes: a tile is laid, the computer answers, and the tools lie on the table", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "도미노");
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await page.locator("canvas").focus();
  await expect(page.locator("#pg-count-0")).toHaveText("패 7장");
  // The first tile of my hand: it goes down at once.
  await keys(page, ["ArrowRight", "ArrowLeft", "Enter"]);
  await expect(page.locator("#pg-count-0")).toHaveText("패 6장");
  await rest(page);
  await expect(count(page)).not.toHaveText("1수", { timeout: 20000 });
  // The buttons for drawing and passing belong to the board, not to the side panel.
  expect(await page.locator(".board-area .pg-tools #pg-tool-0").count()).toBe(1);
  expect(await page.locator(".game-sidebar .pg-tool").count()).toBe(0);
  expect(errors).toEqual([]);
});

test("alkkagi: stones are set in a row, the computer sets its own, and a pull flicks a stone", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "the pull is made with the mouse here");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sit(page, "알까기", async () => {
    await page.getByLabel("알과 개수").selectOption("go-3");
  });
  await expect(page.locator("#pg-count-0")).toHaveText("놓을 알 3개");
  // The tool lies on the board.
  await page.locator(".board-area .pg-tools").getByRole("button", { name: "남은 알 한 줄로 놓기" }).click();
  await expect(page.locator("#pg-count-1")).toHaveText("남은 알 3개", { timeout: 30000 });
  await expect(page.locator("#turn")).toContainText("당겼다 놓아 튕기세요");
  const subject = { half: 5.3, halfZ: 5.5, height: 0.8, lookY: 0, tilt: 1.05 };
  // The middle stone of my row stands on the middle column, four lines from the centre line.
  await pull(page, await onScreen(page, subject, 0, 0.1, 2), await onScreen(page, subject, 0, 0, 3.4));
  await expect(count(page)).not.toHaveText("0수", { timeout: 30000 });
  await rest(page);
  expect(errors).toEqual([]);
});

test("alkkagi with janggi pieces: sixteen a side stand ready and no stones are set", async ({ page }) => {
  await sit(page, "알까기", async () => {
    await page.getByLabel("알과 개수").selectOption("janggi");
  });
  await expect(page.locator("#pg-side-0")).toContainText("나 (초)");
  await expect(page.locator("#pg-count-0")).toHaveText("남은 알 16개");
  await expect(page.locator("#pg-count-1")).toHaveText("남은 알 16개");
  await expect(page.locator(".pg-tools .pg-tool:visible")).toHaveCount(0);
  await page.getByRole("button", { name: "게임 방법" }).click();
  await expect(page.locator("dialog")).toContainText("경첩");
});

test("carrom: the striker is pulled back on the base line and let go", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "the pull is made with the mouse here");
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sit(page, "카롬");
  await expect(page.locator("#pg-count-0")).toHaveText("넣은 말 0 / 9");
  const subject = { half: 5.9, halfZ: 5.9, height: 0.6, lookY: 0, tilt: 1.08 },
    x = slotX(14);
  await pull(page, await onScreen(page, subject, x, 0.07, BASE), await onScreen(page, subject, x, 0.07, BASE + 1.2));
  await expect(count(page)).not.toHaveText("0수", { timeout: 30000 });
  await rest(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("tile rummy: drawing ends my turn, the computer plays its own, and the rack grows", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "타일 러미");
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(page.locator("#pg-count-0")).toHaveText("타일 14개 · 등록 전");
  const draw = page.locator(".board-area .pg-tools").getByRole("button", { name: "한 장 가져오기" });
  await expect(draw).toBeVisible();
  await expect(page.getByRole("button", { name: "차례 마치기" })).toBeHidden();
  await rest(page);
  await draw.click();
  await expect(page.locator("#pg-count-0")).toHaveText("타일 15개 · 등록 전", { timeout: 20000 });
  // The computer has had its turn when the tool is offered again.
  await expect(draw).toBeVisible({ timeout: 40000 });
  await expect(page.locator("#pg-count-1")).toContainText("타일");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
