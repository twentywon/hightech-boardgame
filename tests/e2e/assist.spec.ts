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

test("Reversi undo restores flipped discs; hint and undo work against the computer", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "리버시");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.locator("canvas").focus();
  const undo = page.getByRole("button", { name: "무르기", exact: true });
  await expect(undo).toBeDisabled();
  await enter(page, "1수");
  await expect(page.locator("#black-count")).toHaveText("4");
  await expect(page.locator("#white-count")).toHaveText("1");
  await expect(undo).toBeEnabled({ timeout: 10000 });
  await undo.click();
  await expect(count(page)).toHaveText("0수");
  await expect(page.locator("#black-count")).toHaveText("2");
  await expect(page.locator("#white-count")).toHaveText("2");
  await expect(undo).toBeDisabled();

  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page, "리버시");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.locator("canvas").focus();
  await enter(page, "1수");
  await expect(count(page)).toHaveText("2수", { timeout: 20000 });
  const hint = page.getByRole("button", { name: /힌트/ });
  await expect(hint).toBeEnabled({ timeout: 10000 });
  await hint.click();
  const confirm = page.getByRole("button", { name: /착수 확정/ });
  await expect(confirm).toBeEnabled({ timeout: 20000 });
  await confirm.click();
  await expect(count(page)).toHaveText("4수", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("흑돌의 차례", { timeout: 10000 });
  await expect(async () => {
    await undo.click({ timeout: 500 });
    await expect(count(page)).toHaveText("2수", { timeout: 500 });
  }).toPass({ timeout: 15000 });
  await expect(page.locator("#turn")).toContainText("흑돌의 차례");
  const discs = async () =>
    Number(await page.locator("#black-count").textContent()) +
    Number(await page.locator("#white-count").textContent());
  expect(await discs()).toBe(6);
  expect(errors).toEqual([]);
});

test("Chess undo and hint: take back a move, then play the suggested move", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "체스");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", {
    timeout: 20000,
  });
  await page.locator("canvas").focus();
  const undo = page.getByRole("button", { name: "무르기", exact: true });
  const confirm = page.locator("#confirm");
  await expect(undo).toBeDisabled();
  // e2 is the keyboard cursor's starting square for White.
  await expect(async () => {
    await page.keyboard.press("Enter");
    await expect(confirm).toHaveText("도착 칸을 선택하세요", { timeout: 300 });
  }).toPass({ timeout: 15000 });
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(confirm).toHaveText("E2 → E4 이동 확정");
  await confirm.click();
  await expect(count(page)).toHaveText("1수");
  await expect(page.locator("#chess-history li")).toHaveCount(1);
  await expect(async () => {
    await undo.click({ timeout: 500 });
    await expect(count(page)).toHaveText("0수", { timeout: 500 });
  }).toPass({ timeout: 15000 });
  await expect(page.locator("#chess-history li")).toHaveCount(0);
  await expect(page.locator("#turn")).toContainText("백의 차례");
  await expect(undo).toBeDisabled();

  // Against the computer: follow the hint, let it reply, then take both back.
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page, "체스");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", {
    timeout: 20000,
  });
  const hint = page.getByRole("button", { name: /힌트/ });
  await expect(hint).toBeEnabled({ timeout: 10000 });
  await hint.click();
  await expect(confirm).toContainText("이동 확정", { timeout: 30000 });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(count(page)).toHaveText("2수", { timeout: 30000 });
  await expect(page.locator("#turn")).toContainText("백의 차례", { timeout: 10000 });
  await expect(async () => {
    await undo.click({ timeout: 500 });
    await expect(count(page)).toHaveText("0수", { timeout: 500 });
  }).toPass({ timeout: 15000 });
  await expect(page.locator("#turn")).toContainText("백의 차례");
  expect(errors).toEqual([]);
});

test("local chess and janggi turn to the player to move; gomoku and reversi stay put", async ({ page }) => {
  test.setTimeout(120000);
  const board = page.locator("#board");
  const calm = () => expect(board).toHaveAttribute("data-animating", "false", { timeout: 15000 });
  // Gomoku: the board stays where it is, so "up" still means row 7 for white.
  await page.goto("/");
  await sit(page);
  await enter(page, "1수");
  await aim(page, "ArrowUp", "H7");
  await enter(page, "2수");
  // Chess: after White's move the board faces Black.
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page, "체스");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(board).toHaveAttribute("data-facing", "w");
  await page.locator("canvas").focus();
  await expect(async () => {
    await page.keyboard.press("Enter");
    await expect(page.locator("#confirm")).toHaveText("도착 칸을 선택하세요", { timeout: 300 });
  }).toPass({ timeout: 15000 });
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await page.locator("#confirm").click();
  await expect(count(page)).toHaveText("1수");
  await expect(board).toHaveAttribute("data-facing", "b");
  await calm();
  // Janggi: after Cho's move the board faces Han.
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page, "장기");
  await page.getByRole("button", { name: /테이블에 앉기/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(board).toHaveAttribute("data-facing", "cho");
  await page.locator("canvas").focus();
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText("1수");
  await expect(board).toHaveAttribute("data-facing", "han");
  await calm();
  // From Han's seat "up" is toward Cho: the centre soldier steps forward.
  await page.keyboard.press("Enter");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#confirm")).toHaveText("병 45→55 이동 확정");
});
