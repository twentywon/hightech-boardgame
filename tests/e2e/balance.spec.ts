import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { coinRest, panRest, subjectOf } from "../../src/games/scale/layout";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const rest = async (page: Page) => {
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(300);
};
/** Presses the table's first point by the keyboard (the first arrow shows the cursor) and waits for the move. */
async function press(page: Page, moves: string) {
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText(moves);
  await rest(page);
}

test("balance quiz: the four stages are laid, each takes a press, a hint is shown, and coins are weighed whatever lies on the pans", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "저울 퀴즈");
  await page.locator(".game-stage button.primary").click();
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(4);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "추 달기" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await press(page, "1수");
  await page.locator("#pz-hint").click();
  await expect(page.locator(".board-hint")).toContainText("힌트");
  // The coins: one coin on a pan and none on the other can be weighed too, and a weighing is spent.
  await page.locator('.puzzle-level[data-stage="1"]').click();
  await expect(count(page)).toHaveText("0수");
  await press(page, "1수");
  const left = Number((await page.locator("#turn").innerText()).match(/저울 (\d+)번 남음/)![1]);
  await expect(page.locator("#pg-tool-0")).toBeEnabled();
  await page.locator("#pg-tool-0").click();
  await expect(count(page)).toHaveText("2수");
  await expect(page.locator("#turn")).toContainText(`저울 ${left - 1}번 남음`);
  await rest(page);
  await expect(page.locator("#pg-tool-1")).toHaveText("가짜 지목하기");
  // The goods and the mobile: a button by a number turns it, and only 정답 확인 says whether the answer is right.
  for (const stage of ["3", "4"]) {
    await page.locator(`.puzzle-level[data-stage="${stage}"]`).click();
    await expect(count(page)).toHaveText("0수");
    await press(page, "1수");
    await expect(page.locator("#turn")).not.toContainText(/성공!|실패!/);
    await expect(page.locator("#pg-tool-2")).toHaveText("정답 확인");
    await page.locator("#pg-tool-2").click();
    await expect(count(page)).toHaveText("2수");
    await expect(page.locator("#turn")).toContainText(/성공!|실패!/);
    await rest(page);
  }
  expect(errors).toEqual([]);
});

/** Where a place on the coins' table is on the screen, through the same camera as the view. */
async function onScreen(page: Page, p: { x: number; y: number; z: number }) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = subjectOf("coins"),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    flat = Math.cos(subject.tilt) * distance;
  camera.position.set(0, Math.sin(subject.tilt) * distance, flat);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(p.x, p.y, p.z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await rest(page);
}

test("balance quiz: coins are dragged onto the pans and off again, and a bare tap moves nothing", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "저울 퀴즈");
  await page.locator(".game-stage button.primary").click();
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "가짜 동전" }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  const coins = Number((await page.locator("#turn").innerText()).match(/동전 (\d+)개/)![1]),
    coin = (i: number) => onScreen(page, coinRest(i, coins)),
    pan = (side: number) => {
      const p = panRest(side);
      return onScreen(page, { ...p, y: p.y + 0.4 });
    };
  // A tap on a coin leaves it in the rack.
  const first = await coin(0);
  await page.mouse.click(first.x, first.y);
  await rest(page);
  await expect(count(page)).toHaveText("0수");
  // One coin on each pan: they can be weighed.
  await drag(page, await coin(0), await pan(0));
  await expect(count(page)).toHaveText("1수");
  await drag(page, await coin(1), await pan(1));
  await expect(count(page)).toHaveText("2수");
  // Carried off the pan, the coin goes back to the rack; let go over its own pan, nothing happens.
  await drag(page, await pan(1), await onScreen(page, { x: 0, y: 0.6, z: 2.6 }));
  await expect(count(page)).toHaveText("3수");
  const left = panRest(0);
  await drag(page, await pan(0), await onScreen(page, { ...left, y: left.y + 1.3 }));
  await expect(count(page)).toHaveText("3수");
  expect(errors).toEqual([]);
});
