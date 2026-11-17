import { test, expect } from "@playwright/test";
import { selectGame } from "./library";
import { games } from "../../src/core/catalog";

test("a tile enters its game at once and asks its settings in a window, without navigation or a game begun", async ({ page }, info) => {
  const errors: string[] = [], workers: string[] = [];
  let navigations = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("worker", (w) => workers.push(w.url()));
  // Pages loaded (a history entry pushed for the window is no navigation).
  page.on("load", () => navigations++);
  await page.goto("/");
  const url = page.url();
  await expect(page.locator(".game-card")).toHaveCount(games.length);
  await expect(page.locator(".game-card[aria-haspopup=dialog]")).toHaveCount(games.length);
  await expect(page.getByRole("button", { name: "개발 예정" })).toHaveCount(0);
  // No panel opens in the collection any more.
  await expect(page.locator(".featured")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "테이블에 앉기" })).toHaveCount(0);
  await page.screenshot({ path: `test-results/${info.project.name}-collection.png`, fullPage: true });

  await selectGame(page, "리버시");
  const window = page.locator("dialog[open]");
  await expect(window.getByRole("heading", { name: "리버시", exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "리버시 대국 설정" })).toBeVisible();
  await expect(window.getByRole("button", { name: "테이블에 앉기" })).toHaveCount(1);
  await expect(window.getByLabel("로컬 2인")).toBeChecked();
  await window.getByLabel("컴퓨터 대전", { exact: true }).check();
  // The lists are chosen with buttons (the user asked); the list itself follows them, unseen.
  await window.getByRole("button", { name: "쉬움", exact: true }).click();
  await expect(window.getByLabel("AI 난이도")).toHaveValue("easy");
  await expect(window.getByRole("button", { name: "쉬움", exact: true })).toHaveAttribute("aria-pressed", "true");
  await window.getByLabel("AI 난이도").selectOption("normal");
  await expect(window.getByRole("button", { name: "보통", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(window.getByLabel("플레이어 색상")).toHaveValue("black");
  // Nothing is played behind the window: the page shows the game's picture.
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.locator("main.entry-backdrop")).toHaveCount(1);
  await page.screenshot({ path: `test-results/${info.project.name}-entry-reversi.png` });
  // Back from the window is back to the collection, at the game's tile.
  await window.getByRole("button", { name: "← 컬렉션으로" }).click();
  await expect(page.locator("main.library")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "리버시 살펴보기" })).toBeFocused();

  // Another game: its start sits down with what was chosen in the window.
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("aria-label", "3D 오목판", { timeout: 20000 });
  await expect(page.locator(".player").filter({ hasText: "컴퓨터" })).toHaveCount(1);
  expect(page.url()).toBe(url);
  expect(navigations).toBe(1);
  expect(errors).toEqual([]);
});

test("collection keeps its filters, supports keyboard/touch, and leaving a table comes back to its tile", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "보드게임", exact: true }).click();
  const gomoku = page.getByRole("button", { name: "오목 살펴보기", exact: true });
  await gomoku.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog[open]")).toBeVisible();
  // Escape closes the window and comes back to the collection, at the tile; so does the browser's back.
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(gomoku).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.goBack();
  await expect(page.locator("main.library")).toHaveCount(1);
  const reversi = page.getByRole("button", { name: "리버시 살펴보기" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The games lie in a grid, row under row, not in one line to be scrolled sideways.
  const rows = await page.locator(".game-entry:not([hidden])").evaluateAll((tiles) => new Set(tiles.map((t) => Math.round(t.getBoundingClientRect().top))).size);
  expect(rows).toBeGreaterThan(2);
  // It is no strip to be scrolled sideways: every tile lies within the width of the page.
  expect(await page.locator("#game-rail").evaluate((grid) => getComputedStyle(grid).overflowX)).toBe("visible");
  expect(await page.locator(".game-entry:not([hidden])").evaluateAll((tiles) => tiles.every((t) => t.getBoundingClientRect().left >= 0 && t.getBoundingClientRect().right <= innerWidth + 1))).toBe(true);
  // Games for one and games for two can be told apart, and looked at separately.
  await page.getByRole("button", { name: "인원 1인용" }).click();
  await expect(page.getByRole("button", { name: "스파이더 살펴보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "오목 살펴보기", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "퍼즐게임", exact: true }).click();
  await expect(page.getByRole("button", { name: "스파이더 살펴보기" })).toBeHidden();
  await expect(page.getByRole("button", { name: "2048 살펴보기" })).toBeVisible();
  await page.getByRole("button", { name: "인원 2인용" }).click();
  await expect(page.locator(".game-entry:not([hidden])")).toHaveCount(0);
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page.getByRole("button", { name: "인원 전체" }).click();
  await expect(page.getByRole("button", { name: "오목 살펴보기", exact: true })).toContainText("2인용");
  // A tap on a tile enters its game too.
  if (info.project.name === "mobile") {
    await reversi.scrollIntoViewIfNeeded();
    await page.waitForFunction(() => new Promise<boolean>((done) => { const y = scrollY; setTimeout(() => done(scrollY === y), 300); }));
    const box = (await reversi.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else await reversi.click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  await page.reload();
  await expect(page.locator(".featured")).toHaveCount(0);
  await expect(page.locator("main.library")).toHaveCount(1);
});

test("inline game selections keep independent preferences when storage writes are blocked", async ({ page }) => {
  await page.addInitScript(() => { Storage.prototype.setItem = () => { throw Error("Storage disabled"); }; });
  await page.goto("/");
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("AI 난이도").selectOption("expert");
  await page.getByLabel("플레이어 색상").selectOption("white");
  await selectGame(page, "리버시");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("normal");
  await page.getByLabel("AI 난이도").selectOption("easy");
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("expert");
  await expect(page.getByLabel("플레이어 색상")).toHaveValue("white");
  await selectGame(page, "리버시");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("easy");
});
