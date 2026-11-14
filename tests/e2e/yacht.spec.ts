import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";
import { rollValues } from "../yacht-fixtures";

/**
 * Fixes the dice from outside the game: the page's own
 * `crypto.getRandomValues` replays values that make the real roll show
 * `faces` in order, then sixes. The game ships no way to set a die.
 */
async function loadDice(page: Page, faces: number[]) {
  await page.addInitScript((values) => {
    let i = 0;
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (<A extends ArrayBufferView | null>(array: A): A => {
      const words = array as unknown;
      if (!(words instanceof Uint32Array)) return real(array as never) as A;
      for (let k = 0; k < words.length; k++)
        words[k] = i < values.length ? Math.floor(values[i++] * 4294967296) : 4294967295;
      return array;
    }) as typeof crypto.getRandomValues;
  }, rollValues(faces));
}
const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });
const settled = (page: Page) =>
  expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 15000 });
const rollButton = (page: Page) => page.locator("#yd-roll");
const die = (page: Page, i: number) => page.locator(`#yd-die-${i}`);
const turn = (page: Page) => page.locator("#turn");
async function sit(page: Page, mode: "혼자 하기" | "로컬 2인" | "컴퓨터 대전" = "혼자 하기") {
  await page.goto("/");
  await selectGame(page, "요트 다이스");
  await page.getByLabel(mode, { exact: true }).check();
  await button(page, /테이블에 앉기/).click();
  await expect(page.locator("canvas")).toBeVisible();
  await settled(page);
}
async function rollOnce(page: Page) {
  await rollButton(page).click();
  await settled(page);
}
const faces = async (page: Page) =>
  Promise.all([0, 1, 2, 3, 4].map(async (i) => (await die(page, i).getAttribute("aria-label"))!.match(/: (\d)/)?.[1] ?? "-"));

test("yacht dice opens inline; roll, keep, score, and a whole solo game", async ({ page }, info) => {
  test.setTimeout(150000);
  const errors: string[] = [],
    foreign: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (!/^(http:\/\/127\.0\.0\.1:4174|data:|blob:)/.test(r.url())) foreign.push(r.url());
  });
  // First roll 3 3 4 5 6; the first die is thrown again and shows 2.
  await loadDice(page, [3, 3, 4, 5, 6, 2]);
  await page.goto("/");
  const card = page.getByRole("button", { name: "요트 다이스 살펴보기", exact: true });
  await expect(card).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: "개발 예정" })).toHaveCount(0);
  const url = page.url();
  await card.click();
  await expect(page.getByRole("region", { name: "요트 다이스 대국 설정" })).toBeVisible();
  await expect(page.getByRole("img", { name: "요트 다이스 테이블 미리보기" })).toBeVisible();
  await expect(page.getByLabel("혼자 하기", { exact: true })).toBeChecked();
  // The computer has one fixed strength and there is no hint.
  await expect(page.getByLabel("AI 난이도")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(page.url()).toBe(url);
  await page.screenshot({ path: `test-results/${info.project.name}-yacht-setup.png`, fullPage: true });
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  await expect(page.locator("#move-count")).toHaveText("1 / 12 라운드");
  await expect(turn(page)).toContainText("주사위를 굴리세요");
  // Nothing can be kept or scored before the first roll.
  await expect(die(page, 0)).toBeDisabled();
  await expect(page.locator(".yd-pick")).toHaveCount(0);
  await expect(button(page, "힌트")).toHaveCount(0);
  // A double click rolls once.
  await rollButton(page).dblclick();
  await settled(page);
  await expect(rollButton(page)).toHaveText("굴리기 (2번 남음)");
  expect(await faces(page)).toEqual(["3", "3", "4", "5", "6"]);
  await expect(button(page, "스몰 스트레이트에 15점 기록")).toBeVisible();
  await expect(button(page, "라지 스트레이트에 0점 기록")).toBeVisible();
  await expect(button(page, "초이스에 21점 기록")).toBeVisible();
  await expect(button(page, "트레이에 6점 기록")).toBeVisible();
  // Keep four with the keyboard and the pointer, release and keep again.
  await die(page, 1).focus();
  await page.keyboard.press("Enter");
  await expect(die(page, 1)).toHaveAttribute("aria-pressed", "true");
  await expect(die(page, 1)).toHaveAttribute("aria-label", "주사위 2: 3, 보관 중");
  for (const i of [2, 3, 4]) await die(page, i).click();
  await die(page, 4).click();
  await expect(die(page, 4)).toHaveAttribute("aria-pressed", "false");
  await die(page, 4).click();
  await settled(page);
  await page.screenshot({ path: `test-results/${info.project.name}-yacht-keep.png`, fullPage: true });
  await rollOnce(page);
  expect(await faces(page)).toEqual(["2", "3", "4", "5", "6"]);
  await expect(rollButton(page)).toHaveText("굴리기 (1번 남음)");
  await button(page, "라지 스트레이트에 30점 기록").dblclick();
  await settled(page);
  await expect(page.locator("#yd-largeStraight-0")).toHaveText("30");
  await expect(page.locator("#yd-total-0")).toHaveText("30");
  await expect(page.locator("#move-count")).toHaveText("2 / 12 라운드");
  await expect(page.locator(".yd-pick")).toHaveCount(0);
  await expect(rollButton(page)).toHaveText("굴리기 (3번 남음)");
  // Round 2: three rolls use the turn up; the dice can no longer be kept.
  for (let i = 0; i < 3; i++) await rollOnce(page);
  await expect(rollButton(page)).toBeDisabled();
  await expect(die(page, 0)).toBeDisabled();
  await expect(turn(page)).toContainText("굴림을 모두 썼습니다");
  await expect(page.locator(".yd-pick")).toHaveCount(11);
  await expect(page.locator('[data-category="largeStraight"] .yd-pick')).toHaveCount(0);
  await button(page, "요트에 50점 기록").click();
  await settled(page);
  await expect(page.locator("#yd-total-0")).toHaveText("80");
  // Play out the remaining ten rounds: every category must be filled.
  for (let round = 3; round <= 12; round++) {
    await expect(page.locator("#move-count")).toHaveText(`${round} / 12 라운드`);
    await rollOnce(page);
    await page.locator(".yd-pick").first().click();
    await settled(page);
  }
  // With no window at the end, the status line tells the result itself.
  await expect(turn(page)).toContainText("총점 170점");
  // All sixes: sixes 30, choice 30, four of a kind 30; no bonus at 30 upper points.
  await expect(page.locator("#yd-upper-0")).toHaveText("30 / 63");
  await expect(page.locator("#yd-bonus-0")).toHaveText("0");
  await expect(page.locator("#yd-total-0")).toHaveText("170");
  await expect(page.locator("#yd-final")).toContainText("총점 170점");
  await expect(rollButton(page)).toBeDisabled();
  await page.screenshot({ path: `test-results/${info.project.name}-yacht-over.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // No window comes up: the status line tells the result, and 새 게임 over the table leads to the setup.
  await expect(page.locator("#turn")).toContainText("총점 170점", { timeout: 10000 });
  await page.waitForTimeout(1200);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.locator("#restart").click();
  await page.getByRole("dialog").getByRole("button", { name: "새 게임 시작" }).click();
  await settled(page);
  await expect(page.locator("#move-count")).toHaveText("1 / 12 라운드");
  await expect(page.locator("#yd-total-0")).toHaveText("0");
  // Nothing is stored; a reload starts over.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /yacht|yd/i.test(k)))).toEqual([]);
  await page.reload();
  await expect(page.locator(".featured")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(foreign).toEqual([]);
});

test("the computer takes its own turn; leaving drops the turn in progress", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await loadDice(page, [1, 1, 1, 1, 1, 2, 3, 4, 6, 6]);
  await page.goto("/");
  await selectGame(page, "요트 다이스");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  await expect(page.locator(".yd-sheet thead")).toContainText("컴퓨터");
  await expect(page.locator(".yd-sheet thead")).not.toContainText("보통");
  await rollOnce(page);
  await button(page, "요트에 50점 기록").click();
  // The computer rolls 2 3 4 6 6 and plays on by itself; my controls wait.
  await expect(turn(page)).toContainText("컴퓨터", { timeout: 10000 });
  await expect(rollButton(page)).toBeDisabled();
  await expect(page.locator(".yd-pick")).toHaveCount(0);
  await expect(turn(page)).toContainText("나 차례 — 주사위를 굴리세요", { timeout: 40000 });
  await expect(page.locator(".yd-sheet td.filled")).toHaveCount(2);
  await expect(page.locator("#move-count")).toHaveText("2 / 12 라운드");
  await expect(page.locator("#yd-total-0")).toHaveText("50");
  expect(Number(await page.locator("#yd-total-1").textContent())).toBeGreaterThan(0);
  // Hand the turn to the computer and leave while it is still playing.
  await rollOnce(page);
  await page.locator(".yd-pick").first().click();
  await expect(turn(page)).toContainText("컴퓨터", { timeout: 10000 });
  await button(page, "World Table Games 홈").click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.waitForTimeout(2500);
  await selectGame(page, "리버시");
  await button(page, /테이블에 앉기/).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  await button(page, "World Table Games 홈").click();
  // The mode chosen earlier is remembered for this page; the game is new.
  await selectGame(page, "요트 다이스");
  await expect(page.getByLabel("컴퓨터 대전", { exact: true })).toBeChecked();
  await page.getByLabel("로컬 2인", { exact: true }).check();
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  await expect(page.locator("#yd-total-0")).toHaveText("0");
  await expect(page.locator("#yd-total-1")).toHaveText("0");
  await expect(turn(page)).toContainText("플레이어 1 차례");
  await rollOnce(page);
  await page.locator(".yd-pick").first().click();
  await settled(page);
  await expect(turn(page)).toContainText("플레이어 2 차례 — 주사위를 굴리세요");
  await expect(rollButton(page)).toBeEnabled();
  await expect(page.locator("#move-count")).toHaveText("1 / 12 라운드");
  expect(errors).toEqual([]);
});

test("dialogs wait their turn and the tray fits every screen shape", async ({ page }, info) => {
  await loadDice(page, [2, 2, 5, 5, 5]);
  await sit(page);
  await rollOnce(page);
  await button(page, "게임 방법").click();
  await expect(page.getByRole("dialog")).toContainText("63점 이상이면 +35점");
  await expect(page.locator("dialog")).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: "확인" }).click();
  await expect(button(page, "풀하우스에 19점 기록")).toBeEnabled();
  await button(page, "설정").click();
  await expect(page.locator("dialog")).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: "설정 저장" }).click();
  await expect(rollButton(page)).toBeEnabled();
  const shapes =
    info.project.name === "mobile"
      ? [{ width: 915, height: 412 }, { width: 740, height: 360 }] // phones play in landscape only
      : [{ width: 900, height: 620 }, { width: 700, height: 1000 }, { width: 1440, height: 1000 }];
  for (const size of shapes) {
    await page.setViewportSize(size);
    await settled(page);
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
    await rollButton(page).scrollIntoViewIfNeeded();
    const box = (await rollButton(page).boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    expect(await faces(page)).toEqual(["2", "2", "5", "5", "5"]);
    await page.screenshot({ path: `test-results/${info.project.name}-yacht-${size.width}x${size.height}.png` });
  }
  await button(page, "풀하우스에 19점 기록").click();
  await settled(page);
  await expect(page.locator("#yd-fullHouse-0")).toHaveText("19");
});
