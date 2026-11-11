import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
async function sit(page: Page, ai = false) {
  await selectGame(page);
  if (ai) await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.locator("canvas").focus();
}
/** Places a stone with the keyboard once input is unlocked. */
async function enter(page: Page, moves: string) {
  await expect(async () => {
    await page.keyboard.press("Enter");
    await expect(count(page)).toHaveText(moves, { timeout: 500 });
  }).toPass({ timeout: 15000 });
}
/** Moves the keyboard cursor until the confirm button names `square`. */
async function aim(page: Page, key: string, square: string) {
  const confirm = page.getByRole("button", { name: /착수 확정|위치를 선택/ });
  await expect(async () => {
    await page.keyboard.press(key);
    await expect(confirm).toContainText(square, { timeout: 300 });
  }).toPass({ timeout: 15000 });
}

test("local undo takes back one stone at a time and is saved", async ({ page }) => {
  await page.goto("/");
  await sit(page);
  const undo = page.getByRole("button", { name: "무르기", exact: true });
  await expect(undo).toBeDisabled();
  await enter(page, "1수");
  await aim(page, "ArrowRight", "I8");
  await enter(page, "2수");
  await undo.click();
  await expect(count(page)).toHaveText("1수");
  await expect(page.locator("#turn")).toContainText("백돌");
  await undo.click();
  await expect(count(page)).toHaveText("0수");
  await expect(undo).toBeDisabled();
  await page.reload();
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await expect(count(page)).toHaveText("0수");
});

test("hint proposes a legal move and undo against the computer returns to my turn", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await sit(page, true);
  await enter(page, "1수");
  await expect(count(page)).toHaveText("2수", { timeout: 20000 });
  const hint = page.getByRole("button", { name: /힌트/ });
  await expect(hint).toBeEnabled();
  await hint.click();
  const confirm = page.getByRole("button", { name: /착수 확정/ });
  await expect(confirm).toBeEnabled({ timeout: 20000 });
  await expect(hint).toHaveText("힌트");
  await confirm.click();
  await expect(count(page)).toHaveText("4수", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("차례");
  await page.getByRole("button", { name: "무르기", exact: true }).click();
  await expect(count(page)).toHaveText("2수");
  await expect(page.locator("#turn")).toContainText("흑돌의 차례");
  // The board stays playable after the take-back.
  await page.locator("canvas").focus();
  await aim(page, "ArrowDown", "H13");
  await enter(page, "3수");
  expect(errors).toEqual([]);
});

test("a win against the computer is recorded once and ends undo", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const moves = [];
    for (let i = 0; i < 4; i++)
      moves.push(
        { row: 7, col: 3 + i, player: 1 },
        { row: 0, col: i * 2, player: 2 },
      );
    localStorage.setItem(
      "wtg.session.v1",
      JSON.stringify({ version: 2, mode: "ai", difficulty: "beginner", human: 1, moves }),
    );
  });
  await page.reload();
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await page.locator("canvas").focus();
  await enter(page, "9수");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("흑돌이 승리했습니다", { timeout: 15000 });
  await expect(dialog).toContainText("입문 전적 · 1승 0패 0무");
  await dialog.getByRole("button", { name: "게임판 보기" }).click();
  await expect(page.getByRole("button", { name: "무르기", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: /힌트/ })).toBeDisabled();
  // Reopening the finished game must not count the win again.
  await page.reload();
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await expect(page.getByRole("dialog")).toContainText("입문 전적 · 1승 0패 0무", {
    timeout: 15000,
  });
});

test("coordinate labels setting persists", async ({ page }) => {
  await page.goto("/");
  await sit(page);
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByLabel("오목판 좌표 표시")).toBeChecked();
  await page.getByLabel("오목판 좌표 표시").uncheck();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByLabel("오목판 좌표 표시")).not.toBeChecked();
});

test("the exported single HTML runs its AI Workers when opened from disk", async ({
  page,
}) => {
  execFileSync(process.execPath, ["scripts/export-html.mjs"], { stdio: "pipe" });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(resolve("dist/world-table-games.html")).href);
  for (const game of ["오목", "리버시"] as const) {
    await page.getByRole("button", { name: "World Table Games 홈" }).click();
    await selectGame(page, game);
    await page.getByLabel("컴퓨터 대전", { exact: true }).check();
    await page.getByRole("button", { name: "테이블에 앉기" }).click();
    await page.locator("canvas").focus();
    await enter(page, "1수");
    await expect(count(page)).toHaveText("2수", { timeout: 20000 });
    await expect(page.locator("main")).not.toContainText("AI Worker");
  }
  expect(errors).toEqual([]);
});
