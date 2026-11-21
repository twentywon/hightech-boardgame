import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { iceSubject, nimShift, nimSubject, ringRim, scoopTop } from "../../src/games/nim/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("canvas");
const number = async (page: Page, name: string) => Number(await canvas(page).getAttribute(name));

/** Where a point of the table is on the screen, through the same camera as the view's (`shift` moves it left). */
async function screenAt(page: Page, subjectOf: (aspect: number) => { half: number; halfZ?: number; height: number; lookY: number; tilt: number }, shiftOf: (aspect: number) => number, p: { x: number; y: number; z: number }) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    subject = subjectOf(aspect),
    shift = shiftOf(aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(-shift, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(-shift, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(p.x, p.y, p.z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
async function tapAt(page: Page, at: { x: number; y: number }, mobile: boolean) {
  if (mobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}
/** A tap on the ring at place `k` from the open end of the rod: a take of `k + 1`. */
async function tapRing(page: Page, k: number, mobile: boolean) {
  const total = await number(page, "data-total"),
    left = await number(page, "data-left");
  const at = await screenAt(page, (a) => nimSubject(total, a), (a) => nimShift(total, a), ringRim(total, left - 1 - k));
  await tapAt(page, at, mobile);
}
/** A tap on the `k + 1`-th scoop from the next to be eaten: a take of `k + 1`. */
async function tapScoop(page: Page, k: number, mobile: boolean) {
  const eaten = (await number(page, "data-total")) - (await number(page, "data-left"));
  await tapAt(page, await screenAt(page, iceSubject, () => 0, scoopTop(eaten + 1 + k)), mobile);
}
async function enter(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "님 게임");
  return errors;
}
async function sitDown(page: Page) {
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
}

test("nim: numbers set in the entry window, then a game won against the computer by taps on the rings", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await enter(page),
    dialog = page.locator("dialog.entry");
  await dialog.getByLabel("컴퓨터 대전", { exact: true }).check();
  const rings = dialog.locator("#pg-set-rings"),
    most = dialog.locator("#pg-set-most");
  await expect(rings).toHaveValue("21");
  await expect(most).toHaveValue("3");
  // A number typed past its bounds is brought within them; − and + step one at a time.
  await rings.fill("99");
  await rings.blur();
  await expect(rings).toHaveValue("50");
  await expect(dialog.getByRole("button", { name: "고리 수 늘리기" })).toBeDisabled();
  await rings.fill("12");
  await rings.blur();
  for (let k = 0; k < 2; k++) await dialog.getByRole("button", { name: "고리 수 줄이기" }).click();
  await expect(rings).toHaveValue("10");
  await dialog.getByRole("button", { name: "한 번에 가져갈 수 있는 최대 개수 줄이기" }).click();
  await expect(most).toHaveValue("2");
  await expect(dialog.getByRole("button", { name: "한 번에 가져갈 수 있는 최대 개수 줄이기" })).toBeDisabled();
  // The last ring wins here: with ten and two at a time, the first to move wins by leaving nine.
  await dialog.getByLabel("마지막을 가져가면 진다").uncheck();
  await dialog.locator(".choice[data-label='나']").click();
  await dialog.locator(".choice[data-label='어려움']").click();
  await sitDown(page);
  await expect(canvas(page)).toHaveAttribute("data-total", "10");
  await expect(page.locator("#turn")).toContainText("1~2개");
  // Three at once are refused, and the screen says why.
  await tapRing(page, 2, mobile);
  await expect(page.locator("#turn")).toContainText("2개까지만");
  expect(await moves(page)).toBe(0);
  for (let turn = 0; turn < 8 && !(await page.locator(".board-finale").count()); turn++) {
    await settled(page);
    await expect(page.locator("#turn")).toContainText("나 (앞자리) 차례", { timeout: 20000 });
    const left = await number(page, "data-left"),
      before = await moves(page),
      take = left % 3 || 1;
    await tapRing(page, take - 1, mobile);
    await expect.poll(() => moves(page), { timeout: 20000 }).toBeGreaterThan(before);
    await expect(canvas(page)).toHaveAttribute("data-left", String(left - take), { timeout: 20000 });
    if (left === take) break;
    // The computer answers.
    await expect.poll(() => moves(page), { timeout: 20000 }).toBe(before + 2);
  }
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#pg-final")).toContainText("이겼습니다!");
  await expect(page.locator("#pg-result")).toHaveAttribute("data-outcome", "win");
  const taken = [await page.locator("#pg-count-0").innerText(), await page.locator("#pg-count-1").innerText()].map((t) => Number(/\d+/.exec(t)![0]));
  expect(taken[0] + taken[1]).toBe(10);
  // 새 게임 offers the numbers as they were set; 아이스크림 31 has its own.
  await page.locator("#restart").click();
  const again = page.locator("dialog.setup-dialog[open]");
  await expect(again.locator("#pg-set-rings")).toHaveValue("10");
  await again.locator(".choice[data-value='31']").click();
  await expect(again.locator(".pg-number").first()).toBeHidden();
  await expect(again.getByLabel("마지막을 가져가면 진다")).toBeHidden();
  await again.getByRole("button", { name: "계속하기" }).click();
  expect(errors).toEqual([]);
});

test("아이스크림 31: two at one screen eat by taps on the scoops until one eats 31", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await enter(page),
    dialog = page.locator("dialog.entry");
  await dialog.getByLabel("로컬 2인", { exact: true }).check();
  await dialog.locator(".choice[data-value='31']").click();
  await expect(dialog.locator(".pg-number").first()).toBeHidden();
  await expect(dialog.getByLabel("마지막을 가져가면 진다")).toBeHidden();
  await sitDown(page);
  await expect(canvas(page)).toHaveAttribute("data-total", "31");
  // Four at once are refused.
  await tapScoop(page, 3, mobile);
  await expect(page.locator("#turn")).toContainText("3개까지만");
  // Three each by turns, ten times; the numbers are called as they are eaten.
  for (let k = 0; k < 10; k++) {
    const before = await moves(page);
    await tapScoop(page, 2, mobile);
    if (k === 0) await expect(page.locator(".board-shout")).toHaveText("1, 2, 3!");
    await expect.poll(() => moves(page), { timeout: 20000 }).toBe(before + 1);
    await settled(page);
  }
  await expect(canvas(page)).toHaveAttribute("data-left", "1");
  await expect(page.locator("#turn")).toContainText("앞자리 (플레이어 1) 차례");
  // The first player is left with 31 alone.
  await tapScoop(page, 0, mobile);
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 20000 });
  await expect(page.locator("#pg-final")).toHaveText("뒷자리 (플레이어 2) 승리! 앞자리가 31번 아이스크림을 먹었습니다.");
  await expect(page.locator("#pg-count-0")).toHaveText("16개");
  await expect(page.locator("#pg-count-1")).toHaveText("15개");
  expect(errors).toEqual([]);
});

test("nim: a point game without numbers of its own (tic-tac-toe) is set up and played as before", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "틱택토");
  const dialog = page.locator("dialog.entry");
  await expect(dialog.locator(".pg-number, [data-setting]")).toHaveCount(0);
  await dialog.getByLabel("컴퓨터 대전", { exact: true }).check();
  await dialog.locator(".choice[data-value='misere']").click();
  await expect(dialog.locator("#pg-variant")).toHaveValue("misere");
  await sitDown(page);
  await expect(page.locator("#turn")).toContainText("세 줄을 만들면 집니다");
  // The keyboard lays a mark in the middle; the computer answers.
  await canvas(page).focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect.poll(() => moves(page), { timeout: 15000 }).toBe(2);
  expect(errors).toEqual([]);
});
