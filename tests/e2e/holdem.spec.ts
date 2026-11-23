import { test, expect } from "@playwright/test";
import { button, handOver, loadShuffles, myTurn, playOut, seat, settled, sit, turn } from "./betting-helpers";
import { selectGame } from "./library";
import { stackValues } from "../card-fixtures";
import { createDeck } from "../../src/games/blackjack/shoe";
import { faceOf } from "../../src/games/holdem/game";

/** One shuffle that deals `order`: the hole cards one at a time from the button's left, then the board. */
const deal = (order: string) => stackValues(createDeck(1), faceOf, order.split(" "));
const chipsOf = async (text: Promise<string | null>) => Number((await text)!.match(/칩 ([\d,]+)/)![1].replace(/,/g, ""));

test("texas hold'em heads-up: dealt, called through the flop to the showdown, the computer's cards hidden till then", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [],
    foreign: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  // The page's own origin (whatever port the preview server has), inlined data and blobs; nothing else.
  const own = `${new URL(test.info().project.use.baseURL!).origin}/`;
  page.on("request", (r) => {
    if (!r.url().startsWith(own) && !/^(data:|blob:)/.test(r.url())) foreign.push(r.url());
  });
  // I hold the button (the small blind): the computer is dealt 7♦ 2♣ and I A♠ A♥, then the board A♦ K♣ 9♥ 4♠ 3♣.
  await loadShuffles(page, deal("7D AS 2C AH AD KC 9H 4S 3C"));
  await page.goto("/");
  await selectGame(page, "텍사스 홀덤");
  await expect(page.getByLabel("상대 수")).toHaveValue("3");
  await expect(page.getByLabel("상대 수").locator("option")).toHaveText(["컴퓨터 1명", "컴퓨터 2명", "컴퓨터 3명", "컴퓨터 4명", "컴퓨터 5명"]);
  await page.getByLabel("상대 수").selectOption("1");
  await button(page, /테이블에 앉기/).click();
  await expect(page.locator("canvas")).toBeVisible();
  await settled(page);
  await expect(turn(page)).toContainText("덱을 눌러 시작하세요");
  await button(page, "카드 받기").click();
  await settled(page);
  await myTurn(page);
  await expect(page.locator("#move-count")).toHaveText("1판");
  await expect(page.locator("#bg-chips")).toHaveText("990");
  await expect(page.locator("#bg-pot")).toHaveText("30");
  await expect(turn(page)).toContainText("내 차례 — 프리플롭");
  await expect(page.locator("#bg-call")).toHaveText("콜 (10)");
  await expect(page.locator("#bg-fold")).toHaveText("폴드");
  // My two cards are mine alone; the computer's carry no face anywhere in the page.
  await expect(seat(page, 0).locator(".bj-card")).toHaveText(["A♠", "A♥"]);
  await expect(seat(page, 0).locator(".bj-card.secret")).toHaveCount(2);
  await expect(seat(page, 0)).toContainText("A 원페어");
  await expect(seat(page, 1).locator(".bj-card.hidden")).toHaveCount(2);
  await expect(page.locator("#bg-board .bj-card")).toHaveCount(0);
  let html = await page.content();
  expect(html).not.toContain("7♦");
  expect(html).not.toContain("2♣");
  // The raise is sized with − and +; the call stays what it was.
  const offered = await page.locator("#bg-raise").textContent();
  expect(offered).toMatch(/^레이즈 \([\d,]+\)$/);
  await button(page, "금액 늘리기").click();
  await expect(page.locator("#bg-raise")).not.toHaveText(offered!);
  await button(page, "금액 줄이기").click();
  await expect(page.locator("#bg-raise")).toHaveText(offered!);
  await page.screenshot({ path: `test-results/${info.project.name}-holdem-preflop.png` });
  // Check or call until the flop lies in the middle.
  await expect(async () => {
    const call = page.locator("#bg-call");
    if ((await call.isVisible()) && (await call.isEnabled())) await call.click({ timeout: 1000 });
    await expect(page.locator("#bg-board .bj-card")).toHaveCount(3, { timeout: 1000 });
  }).toPass({ timeout: 60000 });
  await expect(page.locator("#bg-board")).toContainText("A♦ K♣ 9♥");
  await expect(seat(page, 0)).toContainText("A 트리플");
  html = await page.content();
  expect(html).not.toContain("7♦");
  expect(html).not.toContain("2♣");
  await page.screenshot({ path: `test-results/${info.project.name}-holdem-flop.png` });
  // Never betting, I leave the computer nothing to fold to: the hand goes to the showdown.
  await playOut(page);
  await expect(page.locator("#bg-board .bj-card")).toHaveText(["A♦", "K♣", "9♥", "4♠", "3♣"]);
  await expect(page.locator("#bg-outcome")).toContainText("나 · A 트리플");
  await expect(turn(page)).toContainText("나 승리 — A 트리플");
  await expect(seat(page, 1).locator(".bj-card:not(.hidden)")).toHaveText(["7♦", "2♣"]);
  const mine = Number((await page.locator("#bg-chips").textContent())!.replace(/,/g, "")),
    theirs = await chipsOf(seat(page, 1).locator(".bg-stack").textContent());
  expect(mine + theirs).toBe(2000);
  expect(mine).toBeGreaterThan(1000);
  await page.screenshot({ path: `test-results/${info.project.name}-holdem-showdown.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // The button passes: the computer posts the small blind and speaks first.
  await button(page, "다음 판").click();
  await settled(page);
  await expect(page.locator("#move-count")).toHaveText("2판");
  await expect(seat(page, 1)).toContainText(/SB|레이즈|콜|올인|폴드/);
  expect(errors).toEqual([]);
  expect(foreign).toEqual([]);
});

test("texas hold'em with five computers: six seats, a sized raise taken, the hand played out", async ({ page }, info) => {
  test.setTimeout(120000);
  await sit(page, "텍사스 홀덤", 5);
  await expect(page.locator("#bg-seats li")).toHaveCount(6);
  await button(page, "카드 받기").click();
  await settled(page);
  // On the button I speak after the three seats left of the big blind.
  await myTurn(page);
  await expect(turn(page)).toContainText("프리플롭");
  const before = Number((await page.locator("#bg-chips").textContent())!.replace(/,/g, "")),
    raise = page.locator("#bg-raise");
  if (await raise.isEnabled()) {
    await button(page, "금액 늘리기").click();
    const amount = Number((await raise.textContent())!.match(/\(([\d,]+)\)/)![1].replace(/,/g, ""));
    await raise.click();
    await expect(page.locator("#bg-chips")).toHaveText((before - amount).toLocaleString("ko-KR"));
  }
  await page.screenshot({ path: `test-results/${info.project.name}-holdem-six.png` });
  await playOut(page);
  await handOver(page);
  const total =
    Number((await page.locator("#bg-chips").textContent())!.replace(/,/g, "")) +
    (await Promise.all([1, 2, 3, 4, 5].map((i) => chipsOf(seat(page, i).locator(".bg-stack").textContent())))).reduce((a, b) => a + b, 0);
  expect(total).toBe(6000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
