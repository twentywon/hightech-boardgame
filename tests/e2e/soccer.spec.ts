import { test, expect, type Page } from "@playwright/test";
import { fastClock, selectGame } from "./library";

const canvas = (page: Page) => page.locator("#board canvas");
const dialog = (page: Page) => page.locator("dialog[open]");
/** The rows of a camp (0 red, 1 blue, "wait"), as their words. */
const camp = (page: Page, which: 0 | 1 | "wait") => dialog(page).locator(`.so-camp.${which === "wait" ? "wait" : `t${which}`} .so-row`).allInnerTexts();
const choose = (page: Page, select: string, value: string) => dialog(page).locator(`#${select} + .choice-group .choice[data-value="${value}"]`).click();
/** Each player's place on the pitch (x, y), as the canvas tells it. */
async function men(page: Page) {
  return ((await canvas(page).getAttribute("data-men")) ?? "").split(";").map((p) => p.split(",").map(Number));
}
async function enter(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "축구");
  return errors;
}

test("soccer: the two-camp waiting room moves people and computers between red, the watchers and blue, in both modes", async ({ page }, info) => {
  const errors = await enter(page);
  const phone = info.project.name === "mobile";
  await expect(dialog(page).locator(".so-camp")).toHaveCount(3);
  await expect(dialog(page).locator(".so-camp-head")).toHaveText([/레드/, /관전/, /블루/]);
  // The usual start: me in red against one computer in blue; 2P waits (not on a phone: one person a device there).
  expect(await camp(page, 0)).toEqual(["나"]);
  expect(await camp(page, 1)).toEqual(["컴퓨터"]);
  expect(await camp(page, "wait")).toEqual(phone ? [] : ["2P"]);
  await expect(dialog(page).locator(".so-camp.t0 .so-camp-head")).toContainText("1/3");
  // A computer into red's empty place, one more into blue.
  await dialog(page).locator(".so-camp.t0 .so-add").first().click();
  await dialog(page).locator(".so-camp.t1 .so-add").first().click();
  expect(await camp(page, 0)).toEqual(["나", "컴퓨터"]);
  expect(await camp(page, 1)).toEqual(["컴퓨터", "컴퓨터"]);
  // A press on blue's computer, then on the watchers' head: it is taken away.
  await dialog(page).locator(".so-camp.t1 .so-row").first().click();
  await dialog(page).locator('.so-camp-head[data-camp="wait"]').click();
  expect(await camp(page, 1)).toEqual(["컴퓨터"]);
  if (!phone) {
    // 2P picked and sent to blue.
    await dialog(page).locator(".so-camp.wait .so-row").click();
    await dialog(page).locator('.so-camp-head[data-camp="1"]').click();
    expect(await camp(page, 1)).toEqual(["컴퓨터", "2P"]);
    await expect(dialog(page).locator("#so-keys")).toContainText("2P: 방향키");
  }
  // Me to the watchers: red keeps its computer, so the match can still begin.
  await dialog(page).locator(".so-camp.t0 .so-row", { hasText: "나" }).click();
  await dialog(page).locator('.so-camp-head[data-camp="wait"]').click();
  expect(await camp(page, "wait")).toContain("나");
  await expect(dialog(page).locator("#so-start")).toBeEnabled();
  // Red's last computer away: red is empty, the start waits.
  await dialog(page).locator(".so-camp.t0 .so-x").click();
  await expect(dialog(page).locator("#so-room-note")).toContainText("레드 팀에 한 명 이상");
  await expect(dialog(page).locator("#so-start")).toBeDisabled();
  // Back into red; then the gravity pitch: two a team at most.
  await dialog(page).locator(".so-camp.wait .so-row", { hasText: "나" }).click();
  await dialog(page).locator('.so-camp-head[data-camp="0"]').click();
  await dialog(page).locator(".so-camp.t0 .so-add").first().click();
  await dialog(page).locator(".so-camp.t0 .so-add").first().click();
  expect(await camp(page, 0)).toEqual(["나", "컴퓨터", "컴퓨터"]);
  await choose(page, "so-mode", "gravity");
  await expect(dialog(page).locator("#so-room-sub")).toContainText("중력 축구 · 한 팀 최대 2명");
  expect(await camp(page, 0)).toEqual(["나", "컴퓨터"]);
  await expect(dialog(page).locator(".so-camp.t0 .so-camp-head")).toContainText("2/2");
  await expect(dialog(page).locator(".so-camp.t0 .so-add")).toHaveCount(0);
  // Both limits cannot be open-ended.
  await choose(page, "so-minutes", "0");
  await expect(dialog(page).locator('#so-goals + .choice-group .choice[data-value="0"]')).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The game's rules open over the window.
  await page.locator("#entry-rules").click();
  await expect(page.locator("dialog[open]", { hasText: "대기실" }).last()).toContainText("관전 · 대기");
  await page.locator("dialog[open]").last().getByRole("button", { name: "확인" }).click();
  // Kickoff on the gravity pitch: the scoreboard, my tag, a phone's buttons.
  await dialog(page).locator("#so-start").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 60000 });
  await expect(canvas(page)).toHaveAttribute("data-mode", "gravity");
  await expect(page.locator(".so-board")).toContainText("레드");
  await expect(canvas(page)).toHaveAttribute("data-mine", "0");
  if (phone) {
    await expect(page.getByRole("button", { name: "점프" })).toBeVisible();
    await expect(page.getByRole("button", { name: "차기" })).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("soccer: against the computer, a match to one goal ends with the result", async ({ page }) => {
  test.setTimeout(240000);
  await fastClock(page);
  const errors = await enter(page);
  await choose(page, "so-goals", "1");
  await choose(page, "so-difficulty", "expert");
  await dialog(page).locator("#so-start").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 60000 });
  await expect(canvas(page)).toHaveAttribute("data-mode", "flat");
  await expect(page.locator(".so-note")).toContainText("킥오프");
  // I stand still: the kickoff opens after its wait and the computer scores.
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 200000 });
  await expect(page.locator(".board-finale")).toContainText("패배");
  await expect(page.locator("#pg-final")).toContainText("컴퓨터가 이겼습니다. 블루 팀이 1 대 0으로 이겼습니다.");
  await expect(page.locator(".so-score")).toContainText("0:1");
  expect(errors).toEqual([]);
});

test("soccer: two people at one keyboard, W A S D for me and the arrows for 2P, on both pitches", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "A phone has one person a device.");
  test.setTimeout(180000);
  const errors = await enter(page);
  // 2P into blue in the computer's place.
  await dialog(page).locator(".so-camp.t1 .so-x").click();
  await dialog(page).locator(".so-camp.wait .so-row").click();
  await dialog(page).locator('.so-camp-head[data-camp="1"]').click();
  await choose(page, "so-minutes", "5");
  await dialog(page).locator("#so-start").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 60000 });
  await expect(canvas(page)).toHaveAttribute("data-mine", "0");
  await expect(canvas(page)).toHaveAttribute("data-second", "1");
  const before = await men(page);
  await page.keyboard.down("KeyW");
  await page.keyboard.down("ArrowDown");
  await expect.poll(async () => (await men(page))[0][1], { timeout: 20000 }).toBeGreaterThan(before[0][1] + 0.5);
  await expect.poll(async () => (await men(page))[1][1], { timeout: 20000 }).toBeLessThan(before[1][1] - 0.5);
  await page.keyboard.up("KeyW");
  await page.keyboard.up("ArrowDown");
  // Paused, nothing moves.
  await page.locator("#pg-pause").click();
  await expect(page.locator("#board")).toHaveAttribute("data-paused", "true");
  const held = await canvas(page).getAttribute("data-men");
  await page.waitForTimeout(600);
  expect(await canvas(page).getAttribute("data-men")).toBe(held);
  await page.locator("#pg-pause").click();
  // The gravity pitch from 새 게임: 2P's ↑ jumps, my D runs right.
  await page.locator("#restart").click();
  await choose(page, "so-mode", "gravity");
  await dialog(page).locator(".setup-host button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-mode", "gravity", { timeout: 60000 });
  await expect(canvas(page)).toHaveAttribute("data-second", "1");
  const ground = await men(page);
  await page.keyboard.down("ArrowUp");
  await expect.poll(async () => (await men(page))[1][1], { timeout: 20000 }).toBeGreaterThan(ground[1][1] + 0.4);
  await page.keyboard.up("ArrowUp");
  await page.keyboard.down("KeyD");
  await expect.poll(async () => (await men(page))[0][0], { timeout: 20000 }).toBeGreaterThan(ground[0][0] + 0.5);
  await page.keyboard.up("KeyD");
  expect(errors).toEqual([]);
});
