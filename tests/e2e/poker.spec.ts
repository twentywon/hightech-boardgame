import { test, expect } from "@playwright/test";
import { button, handOver, loadShuffles, myTurn, seat, settled, sit, turn } from "./betting-helpers";
import { stackValues } from "../card-fixtures";
import { createDeck } from "../../src/games/blackjack/shoe";
import { faceOf } from "../../src/games/poker/game";

/** One shuffle that deals `order`: down, down, up to each seat, then one card a street. */
const deal = (order: string) => stackValues(createDeck(1), faceOf, order.split(" "));

test("seven-card stud opens inline; a hand runs from the third card to the showdown", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [],
    foreign: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (!/^(http:\/\/127\.0\.0\.1:4174|data:|blob:)/.test(r.url())) foreign.push(r.url());
  });
  // I am dealt A♠ A♦ down and A♥ up, then K♠ K♦ 2♣ 3♦: a full house.
  // The computer is dealt 2♠ 7♦ down and 9♣ up, then 4♥ J♦ 8♣ 6♠: nothing.
  await loadShuffles(page, deal("AS 2S AD 7D AH 9C KS 4H KD JD 2C 8C 3D 6S"));
  await page.goto("/");
  const card = page.getByRole("button", { name: "세븐 포커 살펴보기", exact: true });
  await expect(card).toHaveAttribute("aria-expanded", "false");
  const url = page.url();
  await card.click();
  await expect(page.getByRole("region", { name: "세븐 포커 대국 설정" })).toBeVisible();
  await expect(page.getByRole("img", { name: "세븐 포커 테이블 미리보기" })).toBeVisible();
  await expect(page.getByLabel("상대 수")).toHaveValue("3");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(page.url()).toBe(url);
  await page.getByLabel("상대 수").selectOption("1");
  await page.screenshot({ path: `test-results/${info.project.name}-poker-setup.png`, fullPage: true });
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  await button(page, "카드 받기").dblclick();
  await settled(page);
  await myTurn(page);
  await expect(page.locator("#move-count")).toHaveText("1판");
  await expect(page.locator("#bg-chips")).toHaveText("990");
  await expect(page.locator("#bg-pot")).toHaveText("20");
  await expect(turn(page)).toContainText("내 차례 — 3번째 카드 베팅");
  // My two down cards are marked as unseen by the others; theirs are only "hidden".
  await expect(seat(page, 0).locator(".bj-card")).toHaveText(["A♠", "A♦", "A♥"]);
  await expect(seat(page, 0).locator(".bj-card.secret")).toHaveCount(2);
  await expect(seat(page, 0)).toContainText("트리플");
  await expect(seat(page, 1).locator(".bj-card.hidden")).toHaveCount(2);
  await expect(seat(page, 1).locator(".bj-card:not(.hidden)")).toHaveText(["9♣"]);
  const html = await page.content();
  expect(html).not.toContain("2♠");
  expect(html).not.toContain("7♦");
  await page.screenshot({ path: `test-results/${info.project.name}-poker-turn.png`, fullPage: true });
  // Check or call every time; the hand ends by a fold or at the seventh card.
  await expect(async () => {
    const call = page.locator("#bg-call");
    if ((await call.isVisible()) && (await call.isEnabled())) await call.click({ timeout: 1000 });
    await expect(page.locator("#bg-deal")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 90000 });
  await handOver(page);
  await expect(page.locator("#bg-outcome")).toContainText("나");
  const mine = Number((await page.locator("#bg-chips").textContent())!.replace(/,/g, "")),
    theirs = Number(
      (await seat(page, 1).locator(".bg-stack").textContent())!.match(/칩 ([\d,]+)/)![1].replace(/,/g, ""),
    );
  expect(mine + theirs).toBe(2000);
  expect(mine).toBeGreaterThan(1000);
  // Down cards open only at a showdown the computer reached.
  if ((await page.locator("#bg-outcome").textContent())!.includes("다이"))
    expect(await page.content()).not.toContain("7♦");
  else {
    await expect(seat(page, 0)).toContainText("풀하우스");
    await expect(seat(page, 1).locator(".bj-card:not(.hidden)")).toHaveCount(7);
  }
  await page.screenshot({ path: `test-results/${info.project.name}-poker-result.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await button(page, "다음 판").click();
  await settled(page);
  await expect(page.locator("#move-count")).toHaveText("2판");
  await page.reload();
  await expect(page.locator(".featured")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(foreign).toEqual([]);
});

test("seven-card stud with three computers fits every screen shape and resets on a new session", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await sit(page, "세븐 포커", 3, "hard");
  await expect(page.locator("#bg-seats li")).toHaveCount(4);
  await button(page, "카드 받기").click();
  await settled(page);
  await expect(page.locator("#bg-pot")).toHaveText("40");
  await myTurn(page);
  await button(page, "게임 방법").click();
  await expect(page.getByRole("dialog")).toContainText("로열 스트레이트 플러시");
  await expect(page.locator("dialog")).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: "확인" }).click();
  await expect(page.locator("#bg-call")).toBeEnabled();
  const shapes =
    info.project.name === "mobile"
      ? [{ width: 915, height: 412 }, { width: 412, height: 915 }]
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
    const call = page.locator("#bg-call");
    await call.scrollIntoViewIfNeeded();
    const box = (await call.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    await expect(seat(page, 0).locator(".bj-card")).toHaveCount(3);
    await page.screenshot({ path: `test-results/${info.project.name}-poker-${size.width}x${size.height}.png` });
  }
  // Fold; the computers finish among themselves.
  await button(page, "다이").click();
  await handOver(page);
  const stacks = await page.locator("#bg-seats .bg-stack").allTextContents();
  expect(stacks.reduce((n, t) => n + Number(t.match(/칩 ([\d,]+)/)![1].replace(/,/g, "")), 0)).toBe(4000);
  await button(page, "새 세션").click();
  await page.getByRole("dialog").getByRole("button", { name: "새 세션" }).click();
  await settled(page);
  await expect(page.locator("#bg-chips")).toHaveText("1,000");
  await expect(page.locator("#move-count")).toHaveText("0판");
});
