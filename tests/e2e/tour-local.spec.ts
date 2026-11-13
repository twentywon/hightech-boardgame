import { test, expect } from "@playwright/test";
import { selectGame } from "./library";

test("world tour for several people: names are asked for, and each takes a turn on the same screen", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "세계 일주");
  await page.locator("#tour-humans").selectOption("2");
  await expect(page.locator(".tour-name")).toHaveCount(2);
  await page.locator(".tour-name").nth(0).fill("철수");
  await page.locator(".tour-name").nth(1).fill("<영희>");
  // Two people may play without a computer.
  await page.locator("#tour-opponents").selectOption("0");
  await page.locator("#tour-start").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(page.locator("#tour-players li")).toHaveCount(2);
  await expect(page.locator("#tour-players")).toContainText("철수");
  // A name is text, never markup.
  await expect(page.locator("#tour-players")).toContainText("<영희>");
  await expect(page.locator("#turn")).toContainText("철수 차례");
  // 철수 plays until the dice pass: whatever is offered is passed over, and the turn is ended.
  await expect(async () => {
    for (const id of ["#tour-roll", "#tour-end"]) {
      const button = page.locator(id);
      if ((await button.count()) && !(await button.isHidden()) && (await button.isEnabled())) await button.evaluate((b: HTMLElement) => b.click());
    }
    const pass = page.locator("dialog[open] .dialog-actions button").first();
    if (await pass.count()) await pass.click({ timeout: 500 });
    await expect(page.locator("#turn")).toContainText("영희 차례", { timeout: 700 });
  }).toPass({ timeout: 90000, intervals: [200] });
  // The second person is a person too: the dice wait for them.
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("영희 차례");
  expect(errors).toEqual([]);
});
