import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { HOLES, createGame, moves } from "../../src/games/starhop/rules";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const rest = async (page: Page) => {
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(260);
};
async function sit(page: Page, name: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, name);
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  await page.locator("canvas").focus();
  return errors;
}
type Subject = { half: number; halfZ: number; height: number; lookY: number; tilt: number };
async function onScreen(page: Page, subject: Subject, x: number, y: number, z: number) {
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

test("chinese checkers: a marble is picked up and set down, and the computer answers", async ({ page }) => {
  const errors = await sit(page, "차이니즈 체커");
  const subject = { half: 5.6, halfZ: 5.6, height: 0.8, lookY: 0, tilt: 1.08 },
    at = (i: number) => onScreen(page, subject, (HOLES[i].q + HOLES[i].r / 2) * 0.62, 0.1, HOLES[i].r * 0.62 * 0.866),
    move = moves(createGame())[0];
  for (const hole of [move.from, move.to]) {
    const p = await at(hole);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
  }
  await expect(count(page)).toHaveText("2수", { timeout: 30000 });
  expect(errors).toEqual([]);
});

test("ludo: the die is rolled from the button on the board", async ({ page }) => {
  const errors = await sit(page, "루도");
  await page.locator(".board-area .pg-tools").getByRole("button", { name: "주사위 굴리기" }).click();
  await expect(count(page)).not.toHaveText("0수", { timeout: 30000 });
  await rest(page);
  expect(errors).toEqual([]);
});

test("pocket ball: the cue ball is pulled back and let go", async ({ page }) => {
  const errors = await sit(page, "포켓볼");
  const subject = { half: 4.2, halfZ: 6.2, height: 0.6, lookY: 0, tilt: 1.02 },
    from = await onScreen(page, subject, 0, 0.15, 2.9),
    to = await onScreen(page, subject, 0, 0, 4.4);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await expect(count(page)).not.toHaveText("0수", { timeout: 30000 });
  expect(errors).toEqual([]);
});

test("indian poker: I see only the other card, and a call ends the round", async ({ page }) => {
  const errors = await sit(page, "인디언 포커");
  await expect(page.getByLabel("로컬 2인", { exact: true })).toHaveCount(0);
  await expect(page.locator("#turn")).toContainText("상대 카드는");
  // My own card is nowhere in the page while the betting lasts.
  expect(await page.locator("main").innerHTML()).not.toContain("내 카드");
  await expect(page.getByRole("button", { name: "무르기", exact: true })).toBeHidden();
  await page.locator(".board-area .pg-tools").getByRole("button", { name: "콜 · 체크" }).click();
  await expect(count(page)).not.toHaveText("0수", { timeout: 30000 });
  await rest(page);
  expect(errors).toEqual([]);
});

test("table soccer: the ball runs by itself and my rods follow the keys", async ({ page }) => {
  const errors = await sit(page, "테이블 사커");
  const canvas = page.locator("canvas");
  await expect(page.getByRole("button", { name: "무르기", exact: true })).toBeHidden();
  await expect(canvas).toHaveAttribute("data-ball", /,/, { timeout: 10000 });
  const before = await canvas.getAttribute("data-ball");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(900);
  await page.keyboard.press(" ");
  await page.keyboard.up("ArrowRight");
  await expect.poll(async () => Number(await canvas.getAttribute("data-slide")), { timeout: 10000 }).toBeGreaterThan(0.5);
  await expect.poll(() => canvas.getAttribute("data-ball"), { timeout: 10000 }).not.toBe(before);
  await page.getByRole("button", { name: "게임 방법" }).click();
  await expect(page.locator("dialog[open]")).toContainText("골키퍼");
  expect(errors).toEqual([]);
});
