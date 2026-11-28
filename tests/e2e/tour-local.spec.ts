import { test, expect } from "@playwright/test";
import { selectGame } from "./library";
import { loadShuffles } from "./betting-helpers";

const die = (...faces: number[]) => faces.map((f) => (f - 0.5) / 6);

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
    for (const id of ["#tour-roll", "#tour-key", "#tour-end"]) {
      const button = page.locator(id);
      if ((await button.count()) && !(await button.isHidden()) && (await button.isEnabled())) await button.evaluate((b: HTMLElement) => b.click());
    }
    const pass = page.locator("dialog[open] .dialog-actions button").first();
    if (await pass.count()) await pass.click({ timeout: 500 });
    await expect(page.locator("#turn")).toContainText("<영희> 차례", { timeout: 700 });
  }).toPass({ timeout: 90000, intervals: [200] });
  // The second person is a person too: the dice wait for them.
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("<영희> 차례 — 주사위를 굴리세요.");
  expect(errors).toEqual([]);
});

test("world tour on one screen: the second person sells their own deed in their turn", async ({ page }) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Both roll 1 and 2 to Bangkok: 철수 passes it over, 영희 buys it.
  await loadShuffles(page, die(1, 2, 1, 2));
  await page.goto("/");
  await selectGame(page, "세계 일주");
  await page.locator("#tour-humans").selectOption("2");
  await page.locator(".tour-name").nth(0).fill("철수");
  await page.locator(".tour-name").nth(1).fill("영희");
  await page.locator("#tour-opponents").selectOption("0");
  await page.locator("#tour-start").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  const settled = () => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 20000 });
  await settled();
  await page.locator("#tour-roll").click();
  await settled();
  await page.locator("dialog[open]").getByRole("button", { name: "지나치기" }).click();
  await page.locator("#tour-end").click();
  await expect(page.locator("#turn")).toContainText("영희 차례", { timeout: 20000 });
  await settled();
  await page.locator("#tour-roll").click();
  await settled();
  await page.locator("dialog[open]").getByRole("button", { name: "사기 (80만원)" }).click();
  await expect(page.locator("#tour-money-1")).toHaveText("1,920만원");
  // 철수's deeds cannot be sold in 영희's turn.
  await page.getByRole("button", { name: "철수의 땅 증서 보기" }).click();
  await expect(page.locator("dialog[open] [data-sell]")).toHaveCount(0);
  await page.locator("dialog[open]").getByRole("button", { name: "닫기" }).click();
  // 영희 sells her own Bangkok: the money is hers, 철수's stays as it was.
  await page.getByRole("button", { name: "영희의 땅 증서 보기" }).click();
  await page.locator("dialog[open] [data-sell]").click();
  await expect(page.locator("#tour-money-1")).toHaveText("1,960만원");
  await expect(page.locator("#tour-money-0")).toHaveText("2,000만원");
  await expect(page.locator("dialog[open]")).toContainText("가진 땅이 없습니다.");
  expect(errors).toEqual([]);
});
