import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { loadShuffles } from "./betting-helpers";
import { throwValues } from "../yut-fixtures";
import { FOV, SUBJECTS, cameraDistance } from "../../src/engine/camera";
import { EXIT, stationAt } from "../../src/games/yut/view";
import type { Result } from "../../src/games/yut/rules";

const settled = (page: Page) =>
  expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 15000 });
const turn = (page: Page) => page.locator("#turn");
const moves = (page: Page) => page.locator("#yut-moves button");
/** Fixes the throws from outside the game; after `results` every throw is 개. */
const throws = (page: Page, results: Result[]) =>
  loadShuffles(page, throwValues([...results, ...Array<Result>(300).fill(2)]));
async function sit(page: Page, mode: "local" | "ai") {
  await page.goto("/");
  await selectGame(page, "윷놀이");
  await page.locator(`input[name=yut-mode][value=${mode}]`).check();
  await page.getByRole("button", { name: /마당에 앉기/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
}
async function toss(page: Page) {
  await page.locator("#yut-throw").click();
  await settled(page);
}
/** Screen position of a point on the ground of the yard. */
async function onYard(page: Page, at: { x: number; z: number }) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = SUBJECTS.yut,
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 90);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(at.x, 0, at.z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
async function tap(page: Page, at: { x: number; z: number }) {
  const p = await onYard(page, at);
  await page.mouse.click(p.x, p.y);
}

test("yut opens inline; throws gather, pieces enter, stack, capture and earn a throw", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Blue: 윷 then 걸. Red: 걸 (lands on blue's 3 → capture), then 도.
  await throws(page, [4, 3, 3, 1]);
  await sit(page, "local");
  await expect(turn(page)).toContainText("청 (플레이어 1) 차례 — 윷가락을 눌러 던지세요.");
  await expect(moves(page)).toHaveCount(0);
  // The same line is shown inside the yard, by the sticks.
  await expect(page.locator(".board-hint")).toHaveText("청 (플레이어 1) 차례 — 윷가락을 눌러 던지세요.");
  await toss(page);
  await expect(turn(page)).toContainText("윷! 윷가락을 눌러 한 번 더 던지세요.");
  await expect(page.locator("#yut-throw")).toHaveText("한 번 더 던지기");
  await toss(page);
  await expect(page.locator("#yut-throw")).toBeDisabled();
  await expect(page.locator(".yut-chip")).toHaveText(["윷", "걸"]);
  await expect(moves(page)).toHaveText(["윷 새 말 → 바깥 4", "걸 새 말 → 바깥 3"]);
  await moves(page).nth(1).click();
  await settled(page);
  await expect(page.locator("#yut-count-0")).toHaveText("대기 3 · 말판 1 · 난 말 0");
  // The remaining 윷 may bring in a new piece or carry the one on the board.
  await expect(moves(page)).toHaveText(["윷 바깥 3의 말 → 바깥 7", "윷 새 말 → 바깥 4"]);
  await page.screenshot({ path: `test-results/${info.project.name}-yut.png`, fullPage: true });
  await moves(page).nth(1).click();
  await settled(page);
  // Red throws 걸 and takes the blue piece on 3.
  await expect(turn(page)).toContainText("홍 (플레이어 2) 차례");
  await toss(page);
  await expect(moves(page)).toHaveText(["걸 새 말 → 바깥 3 · 잡기"]);
  await moves(page).first().click();
  await settled(page);
  await expect(page.locator("#yut-count-0")).toHaveText("대기 3 · 말판 1 · 난 말 0");
  await expect(turn(page)).toContainText("말을 잡았습니다. 윷가락을 눌러 한 번 더 던지세요.");
  await toss(page);
  await expect(moves(page)).toHaveText(["도 바깥 3의 말 → 바깥 4 · 잡기", "도 새 말 → 바깥 1"]);
  expect(errors).toEqual([]);
});

test("yut in the yard: tap a piece, then a gold ring; corners take the short road", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "mouse taps on the canvas are checked on desktop");
  test.setTimeout(120000);
  // Blue: 모, 도 → a piece on corner 1, which then turns onto the short road.
  await throws(page, [5, 1, 2, 3]);
  await sit(page, "local");
  await page.locator("canvas").scrollIntoViewIfNeeded();
  // The sticks themselves throw: tap them where they lie.
  await tap(page, { x: 0, z: 4.35 });
  await expect(page.locator(".yut-chip")).toHaveText(["모"]);
  await settled(page);
  await tap(page, { x: 0.3, z: 4.5 });
  await expect(page.locator(".yut-chip")).toHaveText(["모", "도"]);
  await settled(page);
  // Tap the waiting pieces, then the first corner.
  await tap(page, { x: -3.31, z: 4.31 });
  await expect(moves(page).locator("visible=true").and(page.locator(".chosen"))).toHaveCount(2);
  await tap(page, stationAt(5));
  await settled(page);
  await expect(moves(page)).toHaveText(["도 모서리 1의 말 → 첫 지름길 1", "도 새 말 → 바깥 1"]);
  await tap(page, stationAt(5));
  await tap(page, stationAt(20));
  await settled(page);
  await expect(turn(page)).toContainText("홍 (플레이어 2) 차례");
  await expect(page.locator("#yut-count-0")).toHaveText("대기 3 · 말판 1 · 난 말 0");
  expect(EXIT.x).toBeGreaterThan(stationAt(0).x);
});

test("yut against the computer plays on to a result, and the screen fits", async ({ page }, info) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sit(page, "ai");
  const scroll = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(scroll).toBeLessThanOrEqual(1);
  const box = (await page.locator("canvas").boundingBox())!;
  expect(box.width).toBeGreaterThan(info.project.name === "mobile" ? 300 : 600);
  // Throw and take the first offered move until someone has brought four pieces home.
  await expect(async () => {
    const toss = page.locator("#yut-throw"),
      first = moves(page).first();
    if (await toss.isEnabled()) await toss.click({ timeout: 1000 });
    else if ((await first.isVisible()) && (await first.isEnabled())) await first.click({ timeout: 1000 });
    await expect(page.locator("#yut-result")).toBeVisible({ timeout: 700 });
  }).toPass({ timeout: 220000, intervals: [100] });
  await expect(page.locator("#yut-final")).toContainText(/이겼습니다|컴퓨터가 먼저/);
  // No window comes up at the end.
  await page.waitForTimeout(1600);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.locator("#yut-again").click();
  await page.getByRole("dialog").getByRole("button", { name: "새 게임 시작" }).click();
  await expect(page.locator("#yut-count-0")).toHaveText("대기 4 · 말판 0 · 난 말 0");
  expect(errors).toEqual([]);
});
