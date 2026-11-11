import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, OVERHEAD, SUBJECTS, TILT, cameraDistance } from "../../src/engine/camera";
import { toWorld } from "../../src/games/janggi/view";
import { sq } from "../janggi-fixtures";

const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });
async function ready(page: Page) {
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 10000 });
}
const count = (page: Page) => page.locator("#move-count");
const turn = (page: Page) => page.locator("#turn");
/** Screen position of a board point, from the same camera the view uses. */
async function point(page: Page, index: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    top = (await page.locator("#board").getAttribute("data-top")) === "true",
    han = (await page.locator("#board").getAttribute("data-facing")) === "han",
    d = cameraDistance(aspect, top, SUBJECTS.janggi),
    a = top ? OVERHEAD : TILT,
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 80);
  camera.position.set(0, Math.sin(a) * d, Math.cos(a) * d * (han ? -1 : 1));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const w = toWorld(index),
    v = new Vector3(w.x, 0.26, w.z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
async function tap(page: Page, index: number, info: TestInfo) {
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const p = await point(page, index);
  if (info.project.name === "mobile") await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
/** Moves a piece with the pointer; a touch needs the confirm button. */
async function move(page: Page, from: number, to: number, info: TestInfo) {
  await ready(page);
  const before = Number((await count(page).textContent())!.replace("수", ""));
  await tap(page, from, info);
  await expect(page.locator("#confirm")).toHaveText("도착점을 선택하세요");
  await tap(page, to, info);
  if (info.project.name === "mobile") {
    await expect(count(page)).toHaveText(`${before}수`);
    await page.locator("#confirm").click();
  }
  await expect(count(page)).toHaveText(`${before + 1}수`);
  await ready(page);
}

test("janggi opens inline; pointer and keyboard moves, pass, undo, views and restart", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  const card = page.getByRole("button", { name: "장기 살펴보기", exact: true });
  await expect(card).toHaveAttribute("aria-expanded", "false");
  const url = page.url();
  await card.click();
  await expect(page.getByRole("region", { name: "장기 대국 설정" })).toBeVisible();
  await expect(page.getByRole("img", { name: "장기판 미리보기" })).toBeVisible();
  await expect(page.getByLabel("로컬 2인")).toBeChecked();
  await expect(page.getByLabel("AI 난이도")).toBeHidden();
  await expect(page.getByLabel("상차림")).toHaveValue("NENE");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(page.url()).toBe(url);
  await page.screenshot({ path: `test-results/${info.project.name}-janggi-setup.png`, fullPage: true });
  await button(page, /테이블에 앉기/).click();
  await ready(page);
  await expect(count(page)).toHaveText("0수");
  await expect(turn(page)).toContainText("초의 차례");
  await expect(page.locator("#jg-points-cho")).toHaveText("72점");
  await expect(page.locator("#jg-points-han")).toHaveText("73.5점");
  await expect(button(page, "무르기")).toBeDisabled();
  // Pointer: Cho's left chariot up one point; Han's centre soldier forward.
  await move(page, sq(1, 10), sq(1, 9), info);
  await expect(turn(page)).toContainText("한의 차례");
  await move(page, sq(5, 4), sq(5, 5), info);
  await expect(page.locator("#jg-history li")).toHaveCount(1);
  await expect(page.locator("#jg-history li").first()).toContainText("차 01→91");
  await expect(page.locator("#jg-history li").first()).toContainText("병 45→55");
  // A point that is not a legal destination keeps the piece selected and moves nothing.
  await tap(page, sq(9, 10), info);
  await tap(page, sq(9, 5), info);
  await expect(count(page)).toHaveText("2수");
  await button(page, "선택 취소").click();
  // Keyboard: the cursor starts on Cho's centre soldier.
  await page.locator("canvas").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#confirm")).toHaveText("도착점을 선택하세요");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#confirm")).toHaveText("졸 75→65 이동 확정");
  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText("3수");
  await ready(page);
  await page.screenshot({ path: `test-results/${info.project.name}-janggi-game.png`, fullPage: true });
  // Pass, then take both back one at a time.
  await button(page, "한수쉼").click();
  await expect(count(page)).toHaveText("4수");
  await expect(page.locator("#jg-history")).toContainText("한수쉼");
  await expect(turn(page)).toContainText("초의 차례");
  await button(page, "무르기").click();
  await expect(count(page)).toHaveText("3수");
  await expect(turn(page)).toContainText("한의 차례");
  await button(page, "무르기").click();
  await expect(count(page)).toHaveText("2수");
  await expect(page.locator("#jg-history")).not.toContainText("졸 75→65");
  // The overhead view still maps a click to the right point.
  await button(page, "시점 전환").click();
  await ready(page);
  await expect(page.locator("#board")).toHaveAttribute("data-top", "true");
  await move(page, sq(1, 7), sq(1, 6), info);
  await expect(page.locator("#jg-history")).toContainText("졸 71→61");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await button(page, "다시 시작").click();
  await page.getByRole("dialog").getByRole("button", { name: "새 게임" }).click();
  await ready(page);
  await expect(count(page)).toHaveText("0수");
  await expect(page.locator("#jg-history li")).toHaveCount(0);
  // Nothing is stored; a reload starts over.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /janggi|jg/i.test(k)))).toEqual([]);
  await page.reload();
  await expect(page.locator(".featured")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the janggi computer answers from its Worker; hint, undo, playing Han, and leaving", async ({
  page,
}, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "장기");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("normal");
  await page.getByLabel("AI 난이도").selectOption("easy");
  await page.getByLabel("상차림").selectOption("ENEN");
  await button(page, /테이블에 앉기/).click();
  await ready(page);
  await expect(page.locator(".player").nth(1)).toContainText("컴퓨터 · 쉬움");
  // Follow the hint: it proposes a move as a selection that I confirm.
  await button(page, "힌트").click();
  await expect(page.locator("#confirm")).toContainText("이동 확정", { timeout: 30000 });
  const worker = page.waitForEvent("worker", { timeout: 20000 });
  await page.locator("#confirm").click();
  await worker;
  await expect(count(page)).toHaveText("2수", { timeout: 30000 });
  await expect(turn(page)).toContainText("초의 차례", { timeout: 10000 });
  await ready(page);
  // One take-back returns to my own turn, undoing the reply as well.
  await button(page, "무르기").click();
  await expect(count(page)).toHaveText("0수");
  await move(page, sq(9, 7), sq(9, 6), info);
  await expect(count(page)).toHaveText("2수", { timeout: 30000 });
  // Leave while it is still my turn and come back as Han: the computer opens.
  await button(page, "World Table Games 홈").click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await selectGame(page, "장기");
  await expect(page.getByLabel("컴퓨터 대전", { exact: true })).toBeChecked();
  await expect(page.getByLabel("상차림")).toHaveValue("ENEN");
  await page.getByLabel("내 진영").selectOption("white");
  await button(page, /테이블에 앉기/).click();
  await ready(page);
  await expect(page.locator("#board")).toHaveAttribute("data-facing", "han");
  await expect(count(page)).toHaveText("1수", { timeout: 30000 });
  await expect(turn(page)).toContainText("한의 차례");
  await ready(page);
  // My soldier in front of the left chariot, seen from Han's side.
  await move(page, sq(9, 4), sq(9, 5), info);
  // Go home in the middle of the computer's search; nothing may arrive later.
  await button(page, "World Table Games 홈").click();
  await page.waitForTimeout(2500);
  await selectGame(page, "체스");
  await button(page, /테이블에 앉기/).click();
  await expect(count(page)).toHaveText("0수");
  expect(errors).toEqual([]);
});

test("the janggi board fits every screen shape", async ({ page }, info) => {
  await page.goto("/");
  await selectGame(page, "장기");
  await button(page, /테이블에 앉기/).click();
  await ready(page);
  await button(page, "게임 방법").click();
  await expect(page.getByRole("dialog")).toContainText("빅장");
  await page.getByRole("dialog").getByRole("button", { name: "확인" }).click();
  const shapes =
    info.project.name === "mobile"
      ? [{ width: 915, height: 412 }, { width: 412, height: 915 }]
      : [{ width: 900, height: 620 }, { width: 700, height: 1000 }, { width: 1440, height: 1000 }];
  for (const size of shapes) {
    await page.setViewportSize(size);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(async () => {
      const canvas = (await page.locator("canvas").boundingBox())!;
      expect(canvas.width).toBeGreaterThan(200);
      expect(canvas.height).toBeGreaterThan(150);
      expect(canvas.x).toBeGreaterThanOrEqual(0);
      expect(canvas.x + canvas.width).toBeLessThanOrEqual(size.width + 1);
      expect(canvas.y + canvas.height).toBeLessThanOrEqual(size.height + 1);
    }).toPass({ timeout: 5000 });
    await page.screenshot({ path: `test-results/${info.project.name}-janggi-${size.width}x${size.height}.png` });
  }
  // After the last resize a pointer move still lands on the right point.
  await move(page, sq(5, 7), sq(5, 6), info);
});
