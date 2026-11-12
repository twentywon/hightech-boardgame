import { test, expect } from "@playwright/test";
import { selectGame } from "./library";

test("the browser's back button leaves a table for the collection, not the page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  for (const name of ["오목", "체커"]) {
    await selectGame(page, name);
    await page.locator(".game-stage button.primary").click();
    await expect(page.locator("canvas")).toBeVisible();
    await page.goBack();
    await expect(page.locator("main.library")).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(0);
  }
  // A window over the table is closed first.
  await selectGame(page, "오목");
  await page.locator(".game-stage button.primary").click();
  await page.getByRole("button", { name: "게임 방법" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator("canvas")).toBeVisible();
  // Leaving by the table's own button uses the entry up: the next back does not bring the table again.
  await page.getByRole("button", { name: "← 컬렉션" }).click();
  await expect(page.locator("main.library")).toBeVisible();
  await selectGame(page, "리버시");
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toBeVisible();
  await page.goBack();
  await expect(page.locator("main.library")).toBeVisible();
  expect(errors).toEqual([]);
});
