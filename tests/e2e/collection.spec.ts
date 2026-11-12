import { test, expect } from "@playwright/test";
import { selectGame } from "./library";
import { games } from "../../src/core/catalog";

test("collection starts collapsed and switches game details inline without navigation", async ({ page }, info) => {
  const errors: string[] = [], workers: string[] = [];
  let navigations = 0;
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("worker", (w) => workers.push(w.url()));
  page.on("framenavigated", (frame) => { if (frame === page.mainFrame()) navigations++; });
  await page.goto("/");
  const url = page.url();
  await expect(page.locator(".game-card")).toHaveCount(games.length);
  await expect(page.locator(".game-card[aria-expanded=false]")).toHaveCount(games.length);
  await expect(page.getByRole("button", { name: "개발 예정" })).toHaveCount(0);
  await expect(page.locator(".featured")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "테이블에 앉기" })).toHaveCount(0);
  await page.screenshot({ path: `test-results/${info.project.name}-collection-collapsed.png`, fullPage: true });

  await selectGame(page, "리버시");
  await expect(page.getByRole("heading", { name: /함께 앉으면/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "리버시 대국 설정" })).toBeVisible();
  await expect(page.getByRole("img", { name: "리버시판 미리보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "테이블에 앉기" })).toHaveCount(1);
  await expect(page.getByLabel("로컬 2인")).toBeChecked();
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("normal");
  await expect(page.getByLabel("플레이어 색상")).toHaveValue("black");
  await page.screenshot({ path: `test-results/${info.project.name}-collection-reversi.png`, fullPage: true });

  await selectGame(page);
  await expect(page.getByRole("region", { name: "오목 대국 설정" })).toBeVisible();
  await expect(page.getByRole("img", { name: "나무 오목판 미리보기" })).toBeVisible();
  await expect(page.getByRole("button", { name: "리버시 살펴보기" })).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator(".featured")).toHaveCount(1);
  await page.getByRole("button", { name: "오목 살펴보기", exact: true }).click();
  await expect(page.locator(".featured")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(page.url()).toBe(url);
  expect(navigations).toBe(1);
  expect(workers).toEqual([]);
  expect(errors).toEqual([]);
});

test("collection preserves filters, supports keyboard/touch and resets on home or reload", async ({ page }, info) => {
  await page.goto("/");
  await page.getByRole("button", { name: "보드게임", exact: true }).click();
  const gomoku = page.getByRole("button", { name: "오목 살펴보기", exact: true });
  await gomoku.focus();
  await page.keyboard.press("Enter");
  await expect(gomoku).toBeFocused();
  await expect(gomoku).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "보드게임", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(gomoku).toHaveAttribute("aria-expanded", "false");
  const reversi = page.getByRole("button", { name: "리버시 살펴보기" });
  if (info.project.name === "mobile") {
    const box = (await reversi.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  } else await reversi.click();
  await expect(page.getByRole("region", { name: "리버시 대국 설정" })).toBeVisible();
  await page.getByRole("button", { name: "카드게임", exact: true }).click();
  await expect(page.getByRole("region", { name: "리버시 대국 설정" })).toBeHidden();
  await expect(page.getByText("블랙잭", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await expect(page.getByRole("region", { name: "리버시 대국 설정" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await expect(page.locator(".featured")).toHaveCount(0);
  await selectGame(page);
  await page.reload();
  await expect(page.locator(".featured")).toHaveCount(0);
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
