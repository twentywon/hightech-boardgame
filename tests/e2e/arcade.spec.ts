import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { HOLES } from "../../src/games/whack/sim";
import { WHACK_SUBJECT } from "../../src/games/whack/layout";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const moves = async (page: Page) => Number(/(\d+)/.exec(await count(page).innerText())?.[1] ?? 0);
/** Sits down at a game for one, its stage left as laid. */
async function sit(page: Page, name: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, name);
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  return errors;
}

test("the arcade games have a kind of their own in the collection", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "아케이드게임", exact: true }).click();
  for (const name of ["스네이크", "두더지 잡기", "인형뽑기", "블록 내리기", "벽돌깨기", "과일 게임", "고기 굽기", "테이블 사커", "에어하키", "농구", "코인 푸셔", "슬롯 카", "축구", "낚시", "룰렛", "슬롯머신", "주차 요원", "금화 쟁탈전", "활잡이 결투", "시대 전쟁", "땅따먹기"])
    await expect(page.getByRole("button", { name: `${name} 살펴보기`, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "2048 살펴보기", exact: true })).toBeHidden();
  // Games of a real sport are 스포츠게임 now (the user asked), not arcade.
  await expect(page.getByRole("button", { name: "볼링 살펴보기", exact: true })).toBeHidden();
  await expect(page.locator(".game-entry:not([hidden])")).toHaveCount(21);
  await page.getByRole("button", { name: "스포츠게임", exact: true }).click();
  for (const name of ["컬링", "포켓볼", "다트", "탁구", "볼링"])
    await expect(page.getByRole("button", { name: `${name} 살펴보기`, exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "스네이크 살펴보기", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "퍼즐게임", exact: true }).click();
  await expect(page.getByRole("button", { name: "블록 내리기 살펴보기", exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("snake: the clock moves it on, keys turn it, and a pause stops it", async ({ page }) => {
  const errors = await sit(page, "스네이크");
  // It crawls by itself.
  await expect.poll(() => moves(page), { timeout: 10000 }).toBeGreaterThan(3);
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("p");
  const held = await moves(page);
  await page.waitForTimeout(900);
  expect(await moves(page)).toBe(held);
  await expect(page.locator("#board")).toHaveAttribute("data-paused", /.*/);
  await page.keyboard.press("p");
  await expect.poll(() => moves(page), { timeout: 10000 }).toBeGreaterThan(held);
  // The arrow keys at the lower left turn it too (a turn straight back is refused, so one of two always turns it).
  const before = await moves(page);
  await page.getByRole("button", { name: "왼쪽으로" }).click();
  await page.getByRole("button", { name: "아래로" }).click();
  await expect.poll(() => moves(page)).toBeGreaterThan(before);
  // Left alone, it runs into the fence and the game ends.
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});

test("whack-a-mole: a key or a press brings the mallet down, and the clock runs", async ({ page }) => {
  const errors = await sit(page, "두더지 잡기");
  await expect(page.locator("#turn")).toContainText("남은 시간");
  await page.locator("canvas").focus();
  const first = await moves(page);
  await page.keyboard.press("4");
  // A blow is a move at once (a hit or a miss), and seconds go by as moves too.
  await expect.poll(() => moves(page)).toBeGreaterThan(first);
  // A press on the middle hole, aimed through the same camera.
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    distance = cameraDistance(aspect, false, WHACK_SUBJECT),
    flat = Math.cos(WHACK_SUBJECT.tilt) * distance;
  camera.position.set(0, Math.sin(WHACK_SUBJECT.tilt) * distance, flat);
  camera.lookAt(0, WHACK_SUBJECT.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(HOLES[3][0], 0, HOLES[3][1]).project(camera),
    at = { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
  const before = await moves(page);
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => moves(page)).toBeGreaterThan(before);
  // Under software rendering with other browsers running a frame can take longer than the clock adds at most (0.3s), so allow time.
  await expect.poll(async () => Number(/남은 시간 (\d+)/.exec(await page.locator("#turn").innerText())?.[1] ?? 99), { timeout: 12000 }).toBeLessThan(44);
  expect(errors).toEqual([]);
});
