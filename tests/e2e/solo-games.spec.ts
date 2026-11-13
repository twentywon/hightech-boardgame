import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { CENTRE, HOLES, SIZE, holeAt } from "../../src/games/peg/rules";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const rest = async (page: Page) => {
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(260);
};
/** Sits down at a game for one: there is no other side to choose and no level. */
async function sit(page: Page, name: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, name);
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await expect(page.locator("#pg-level-field")).toBeHidden();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(page.locator("#pg-side-1")).toBeHidden();
  return errors;
}
const score = async (page: Page) => Number(/점수 (\d+)/.exec(await page.locator("#turn").innerText())?.[1] ?? -1);

test("peg solitaire: a marble jumps into the middle, and the jump is taken back", async ({ page }) => {
  const errors = await sit(page, "페그 솔리테어");
  await rest(page);
  const subject = { half: 3.7, halfZ: 3.7, height: 0.7, lookY: 0, tilt: (58 * Math.PI) / 180 },
    at = async (hole: number) => {
      const box = (await page.locator("canvas").boundingBox())!,
        aspect = box.width / box.height,
        distance = cameraDistance(aspect, false, subject),
        camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
      camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const v = new Vector3((HOLES[hole].x - (SIZE - 1) / 2) * 0.86, 0.3, (HOLES[hole].z - (SIZE - 1) / 2) * 0.86).project(camera);
      return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
    };
  await expect(page.locator("#turn")).toContainText("구슬 32개");
  for (const hole of [holeAt(3, 1), CENTRE]) {
    const p = await at(hole);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
  }
  await expect(count(page)).toHaveText("1수", { timeout: 20000 });
  await rest(page);
  await expect(page.locator("#turn")).toContainText("구슬 31개");
  await page.locator(".board-controls").getByRole("button", { name: "무르기", exact: true }).click();
  await expect(count(page)).toHaveText("0수");
  await expect(page.locator("#turn")).toContainText("구슬 32개");
  expect(errors).toEqual([]);
});

test("2048: the arrow keys and a swipe slide the tiles", async ({ page }) => {
  const errors = await sit(page, "2048");
  await expect(page.locator(".solo-stat")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "무르기", exact: true })).toBeHidden();
  // Two tiles on sixteen squares: at least one of the four ways moves something.
  for (const key of ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"]) {
    await page.keyboard.press(key);
    await rest(page);
  }
  await expect(count(page)).not.toHaveText("0수");
  const before = await count(page).innerText(),
    box = (await page.locator("canvas").boundingBox())!,
    mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Swiped left, then down: one of the two always moves a tile after the keys above.
  for (const [dx, dy] of [[-box.width * 0.2, 0], [0, box.height * 0.2]]) {
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(mid.x + dx / 2, mid.y + dy / 2, { steps: 3 });
    await page.mouse.move(mid.x + dx, mid.y + dy, { steps: 3 });
    await page.mouse.up();
    await rest(page);
  }
  await expect(count(page)).not.toHaveText(before);
  await expect(page.locator("#turn")).toContainText("가장 큰 수");
  expect(errors).toEqual([]);
});

test("falling blocks: the clock brings the piece down, a key drops it, and an open window stops the clock", async ({ page }) => {
  const errors = await sit(page, "블록 내리기");
  await expect(page.locator(".solo-stat")).toHaveCount(3);
  // Nothing is pressed: the piece falls by itself.
  await expect(count(page)).not.toHaveText("0수", { timeout: 10000 });
  expect(await score(page)).toBe(0);
  await page.keyboard.press(" ");
  await expect.poll(() => score(page), { timeout: 10000 }).toBeGreaterThan(0);
  // The buttons on the table move the piece too.
  const tools = page.locator(".board-area .pg-tools");
  await tools.getByRole("button", { name: "→" }).click();
  await tools.getByRole("button", { name: "돌리기" }).click();
  await tools.getByRole("button", { name: "떨어뜨리기" }).click();
  const dropped = await score(page);
  expect(dropped).toBeGreaterThan(0);
  // While the rules are open nothing falls.
  await page.getByRole("button", { name: "게임 방법" }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  const held = await count(page).innerText();
  await page.waitForTimeout(2200);
  await expect(count(page)).toHaveText(held);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(count(page)).not.toHaveText(held, { timeout: 10000 });
  expect(errors).toEqual([]);
});

test("brick breaker: the ball is sent off and knocks a brick out", async ({ page }) => {
  const errors = await sit(page, "벽돌깨기");
  await expect(page.locator(".solo-stat")).toHaveCount(3);
  await expect(page.locator("#turn")).toContainText("남은 공 3");
  // The ball rests on the bat: nothing happens until it is sent off.
  await page.waitForTimeout(1200);
  await expect(count(page)).toHaveText("0수");
  await page.locator("canvas").focus();
  await page.keyboard.press(" ");
  await expect.poll(() => score(page), { timeout: 20000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
