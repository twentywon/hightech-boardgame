import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const board = (page: Page) => page.locator("#board");
async function sit(page: Page, name: string, local = false) {
  await page.goto("/");
  await selectGame(page, name);
  if (local) await page.getByLabel("로컬 2인", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(board(page)).toHaveAttribute("data-animating", "false", { timeout: 15000 });
  await page.locator("canvas").focus();
}
/** Presses keys once the table has come to rest. */
async function keys(page: Page, list: string[]) {
  await expect(board(page)).toHaveAttribute("data-animating", "false", { timeout: 20000 });
  await page.waitForTimeout(260);
  for (const key of list) await page.keyboard.press(key);
}

test("four in a row: discs fall to the bottom, the computer answers, undo returns to my turn", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sit(page, "사목");
  await expect(page.locator("#turn")).toContainText("원반을 떨어뜨릴 줄");
  // The keyboard starts over the middle column.
  await keys(page, ["ArrowRight", "ArrowLeft", "Enter"]);
  await expect(count(page)).toHaveText("2수", { timeout: 20000 });
  await expect(page.locator("#pg-count-0")).toHaveText("원반 1개");
  await keys(page, []);
  await page.getByRole("button", { name: "무르기", exact: true }).click();
  await expect(count(page)).toHaveText("0수");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The rules follow the common order.
  await page.getByRole("button", { name: "게임 방법" }).click();
  await expect(page.locator("dialog h3").first()).toHaveText("기본 규칙");
  await expect(page.locator("dialog")).toContainText("조작");
  expect(errors).toEqual([]);
});

test("four in a row with two players: four across on the bottom row wins", async ({ page }) => {
  await sit(page, "사목", true);
  // Red drops on columns 4, 5, 6, 7 from the middle; blue answers on column 1.
  const far = ["ArrowLeft", "ArrowLeft", "ArrowLeft"];
  for (const walk of [[], far, ["ArrowRight"], far, ["ArrowRight", "ArrowRight"], far, ["ArrowRight", "ArrowRight", "ArrowRight"]]) {
    // The cursor stays where it was: walk back to the middle first.
    await keys(page, ["ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowRight", "ArrowRight", "ArrowRight", ...walk, "Enter"]);
  }
  await expect(page.locator("#pg-final")).toContainText("빨강 (플레이어 1) 승리", { timeout: 15000 });
  await expect(page.locator("#pg-final")).toContainText("네 개가 한 줄로");
});

test("twist five: a marble is placed, then a quarter is turned from the buttons beside the board", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sit(page, "돌림 오목");
  await keys(page, ["ArrowRight", "Enter"]);
  // The marble waits while the turn is chosen; nothing has been played yet.
  await expect(page.locator("#turn")).toContainText("돌릴 판과 방향을 고르세요");
  await expect(count(page)).toHaveText("0수");
  // Escape takes the marble back.
  await page.keyboard.press("Escape");
  await expect(page.locator("#turn")).toContainText("구슬을 놓을 자리");
  await keys(page, ["Enter"]);
  // Walk off the board to the right, onto a turn button.
  await keys(page, ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Enter"]);
  await expect(count(page)).toHaveText("2수", { timeout: 25000 });
  await expect(page.locator("#pg-count-0")).toHaveText("구슬 1개");
  await expect(page.locator("#pg-count-1")).toHaveText("구슬 1개");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("hare and hounds: a hound steps forward, the hare answers, a hound cannot go back", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sit(page, "토끼와 사냥개");
  await expect(page.locator("#pg-side-0")).toContainText("사냥개");
  // The cursor starts on the hound at the end; it steps to the middle of the first column.
  await keys(page, ["ArrowRight", "ArrowLeft", "Enter"]);
  await expect(page.locator("#turn")).toContainText("갈 곳을 고르세요");
  await keys(page, ["ArrowRight", "Enter"]);
  await expect(count(page)).toHaveText("2수", { timeout: 20000 });
  // From the first column, the end behind it is no destination.
  await keys(page, ["Enter"]);
  await expect(page.locator("#turn")).toContainText("갈 곳을 고르세요");
  await keys(page, ["ArrowLeft", "Enter"]);
  await expect(count(page)).toHaveText("2수");
  expect(errors).toEqual([]);
});

test("battleship: I lay my fleet, a shot lands in the other waters, the computer fires back, its ships stay hidden", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "배틀십");
  // No table for two: the mode cannot be chosen.
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await page.locator("canvas").focus();
  await expect(page.locator("#turn")).toContainText("항공모함(5칸)을 내 해역에 놓으세요 — 가로");
  await expect(page.locator("#pg-count-0")).toHaveText("배 0 / 5척 배치");
  const turnShip = page.getByRole("button", { name: /배 돌리기/ }),
    layRest = page.getByRole("button", { name: "남은 배 무작위로 놓기" });
  // The keyboard starts in my own waters: the carrier goes down where it stands.
  await keys(page, ["ArrowRight", "ArrowLeft", "Enter"]);
  await expect(page.locator("#pg-count-0")).toHaveText("배 1 / 5척 배치");
  await expect(page.locator("#turn")).toContainText("전함(4칸)");
  await turnShip.click();
  await expect(page.locator("#turn")).toContainText("세로로 놓입니다");
  // Undo lifts the carrier again.
  await page.getByRole("button", { name: "무르기", exact: true }).click();
  await page.getByRole("button", { name: "무르기", exact: true }).click();
  await expect(page.locator("#pg-count-0")).toHaveText("배 0 / 5척 배치");
  await page.locator("canvas").focus();
  await keys(page, ["Enter"]);
  await layRest.click();
  await expect(page.locator("#pg-count-0")).toHaveText("남은 배 5척");
  await expect(turnShip).toBeHidden();
  await expect(layRest).toBeHidden();
  await expect(page.locator("#turn")).toContainText("상대 해역에서 쏠 칸");
  await expect(count(page)).toHaveText("0수");
  // The keyboard now starts in the waters I fire at.
  await page.locator("canvas").focus();
  await keys(page, ["ArrowRight", "Enter"]);
  await expect(count(page)).toHaveText("2수", { timeout: 20000 });
  // The same square cannot be fired at twice.
  await keys(page, ["Enter"]);
  await expect(count(page)).toHaveText("2수");
  await keys(page, ["ArrowDown", "Enter"]);
  await expect(count(page)).toHaveText("4수", { timeout: 20000 });
  // Nothing about the fleets is written into the page.
  const html = await page.locator("main").innerHTML();
  expect(html).not.toMatch(/항공모함|순양함|잠수함|구축함/);
  await page.screenshot({ path: `test-results/${info.project.name}-battleship.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("hare and hounds as the hare: the computer's hounds move first, then the hare is mine", async ({ page }) => {
  await page.goto("/");
  await selectGame(page, "토끼와 사냥개");
  await page.getByLabel("내 말 (컴퓨터 대전)").selectOption("hare");
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(page.locator("#pg-side-0")).toContainText("나 (토끼)");
  await expect(page.locator("#pg-side-1")).toContainText("(사냥개)");
  await expect(count(page)).toHaveText("1수", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("토끼를 고른 뒤 갈 곳을 고르세요", { timeout: 20000 });
  await page.locator("canvas").focus();
  // The far end: walk the cursor to the hare and step it one column in.
  await keys(page, ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Enter"]);
  await expect(page.locator("#turn")).toContainText("갈 곳을 고르세요");
  await keys(page, ["ArrowLeft", "Enter"]);
  await expect(count(page)).toHaveText("3수", { timeout: 20000 });
});
