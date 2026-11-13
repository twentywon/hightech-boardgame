import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";
import { stackedValues } from "../blackjack-fixtures";

/**
 * Stacks the shoe from outside the game: the page's own
 * `crypto.getRandomValues` replays values that make the real shuffle put
 * `order` on top (player, dealer up, player, hole, then draws in order).
 * The game ships no card controls of its own.
 */
async function stack(page: Page, order: string[]) {
  await page.addInitScript((values) => {
    let i = 0;
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (<A extends ArrayBufferView | null>(array: A): A => {
      const words = array as unknown;
      if (!(words instanceof Uint32Array)) return real(array as never) as A;
      for (let k = 0; k < words.length; k++)
        words[k] = i < values.length ? Math.floor(values[i++] * 4294967296) : 4294967295;
      return array;
    }) as typeof crypto.getRandomValues;
  }, stackedValues(order));
}
const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });
const settled = (page: Page) =>
  expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 15000 });
async function sit(page: Page) {
  await page.goto("/");
  await selectGame(page, "블랙잭");
  await button(page, /테이블에 앉기/).click();
  await expect(page.locator("canvas")).toBeVisible();
  await settled(page);
}
async function bet(page: Page, ...amounts: number[]) {
  for (const amount of amounts) await button(page, `${amount} 칩 추가`).click();
}
async function dealRound(page: Page, ...amounts: number[]) {
  await bet(page, ...amounts);
  await button(page, "카드 받기").click();
  await settled(page);
}
const chips = (page: Page) => page.locator("#bj-chips");
const turn = (page: Page) => page.locator("#turn");

test("blackjack opens inline, then bet → deal → hit → dealer → settlement → next round", async ({
  page,
}, info) => {
  const errors: string[] = [],
    foreign: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (!/^(http:\/\/127\.0\.0\.1:4174|data:|blob:)/.test(r.url())) foreign.push(r.url());
  });
  // Round 1: 5♠ 6♦ against 9♥ + hidden 7♣; hit 10♦ → 21; dealer 16 draws 2♠ → 18.
  // Round 2: 5♥ 6♣ against 10♠ + 8♦; double → 9♠ = 20 beats 18.
  await stack(page, ["5S", "9H", "6D", "7C", "10D", "2S", "5H", "10S", "6C", "8D", "9S"]);
  await page.goto("/");
  const card = page.getByRole("button", { name: "블랙잭 살펴보기", exact: true });
  await expect(card).toHaveAttribute("aria-expanded", "false");
  const url = page.url();
  await card.click();
  await expect(page.getByRole("region", { name: "블랙잭 대국 설정" })).toBeVisible();
  await expect(page.getByRole("img", { name: "블랙잭 테이블 미리보기" })).toBeVisible();
  await expect(page.locator(".featured")).toContainText("시작 칩 1,000");
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(page.url()).toBe(url);
  await page.screenshot({ path: `test-results/${info.project.name}-blackjack-setup.png`, fullPage: true });
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  await expect(chips(page)).toHaveText("1,000");
  await expect(page.locator("#move-count")).toHaveText("0라운드");
  await expect(button(page, "카드 받기")).toBeDisabled();
  await expect(button(page, "이전 베팅")).toBeDisabled();
  // Stake: add, clear, add again with the keyboard.
  await bet(page, 100, 50, 10);
  await expect(page.locator("#bj-bet")).toHaveText("160");
  await button(page, "베팅 초기화").click();
  await expect(page.locator("#bj-bet")).toHaveText("0");
  await button(page, "100 칩 추가").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#bj-bet")).toHaveText("100");
  await button(page, "카드 받기").focus();
  await page.keyboard.press("Space");
  await settled(page);
  await expect(chips(page)).toHaveText("900");
  await expect(turn(page)).toContainText("내 차례 — 합계 11, 딜러 9");
  // The hole card is described only as hidden, anywhere in the page.
  await expect(page.locator("#bj-dealer")).toContainText("비공개 카드");
  await expect(page.locator("#bj-dealer")).toContainText("보이는 합계 9");
  const html = await page.content();
  expect(html).not.toContain("7♣");
  expect(html).not.toContain("클럽 7");
  expect(html).not.toMatch(/합계 16/);
  await expect(button(page, "더블 다운 (+100)")).toBeEnabled();
  await expect(button(page, "스플릿 (+100)")).toBeDisabled();
  await page.screenshot({ path: `test-results/${info.project.name}-blackjack-turn.png`, fullPage: true });
  await button(page, "히트").click();
  await settled(page);
  await expect(turn(page)).toContainText("라운드 종료 — 이겼습니다 (+100)");
  await expect(page.locator("#bj-dealer")).toContainText("7♣");
  await expect(page.locator("#bj-dealer")).toContainText("합계 18");
  await expect(page.locator("#bj-outcome")).toContainText("베팅 100");
  await expect(page.locator("#bj-outcome")).toContainText("승리 +100");
  await expect(page.locator("#bj-net")).toContainText("이번 라운드 +100 · 돌려받은 칩 200");
  await expect(chips(page)).toHaveText("1,100");
  await expect(button(page, "히트")).toBeHidden();
  // Next round clears the table and offers the previous stake.
  await button(page, "다음 라운드").click();
  await settled(page);
  await expect(page.locator("#bj-hands li")).toHaveCount(0);
  await expect(page.locator("#bj-bet")).toHaveText("0");
  await button(page, "이전 베팅 100").click();
  await expect(page.locator("#bj-bet")).toHaveText("100");
  await button(page, "카드 받기").click();
  await settled(page);
  await expect(page.locator("#move-count")).toHaveText("2라운드");
  await button(page, "더블 다운 (+100)").click();
  await settled(page);
  await expect(page.locator("#bj-hands li")).toContainText("베팅 200");
  await expect(page.locator("#bj-outcome")).toContainText("승리 +200");
  await expect(chips(page)).toHaveText("1,300");
  await page.screenshot({ path: `test-results/${info.project.name}-blackjack-result.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Nothing is stored; a reload starts over.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /blackjack|bj/i.test(k)))).toEqual([]);
  await page.reload();
  await expect(page.locator(".featured")).toHaveCount(0);
  await selectGame(page, "블랙잭");
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  await expect(chips(page)).toHaveText("1,000");
  await expect(page.locator("#move-count")).toHaveText("0라운드");
  expect(errors).toEqual([]);
  expect(foreign).toEqual([]);
});

test("split plays two hands in order and settles each; rapid clicks never repeat a step", async ({
  page,
}) => {
  // 8♥ 8♣ against 6♠ + 10♥. Split: left gets 3♦, right gets K♣.
  // Left doubles → 10♣ = 21. Right stands on 18. Dealer 16 draws 5♣ → 21.
  // Round 2: 2♠ 3♦ against 9♦ + 7♠; one hit → 4♥.
  await stack(page, ["8H", "6S", "8C", "10H", "3D", "KC", "10C", "5C", "2S", "9D", "3D", "7S", "4H", "5S"]);
  await sit(page);
  await bet(page, 100);
  // A double click on deal takes the stake and deals once.
  await button(page, "카드 받기").dblclick();
  await settled(page);
  await expect(page.locator("#move-count")).toHaveText("1라운드");
  await expect(chips(page)).toHaveText("900");
  await expect(page.locator("#bj-hands li")).toHaveCount(1);
  await button(page, "스플릿 (+100)").dblclick();
  await settled(page);
  await expect(chips(page)).toHaveText("800");
  await expect(page.locator("#bj-hands li")).toHaveCount(2);
  await expect(page.locator("#bj-hands li").nth(0)).toHaveAttribute("aria-current", "true");
  await expect(page.locator("#bj-hands li").nth(0)).toContainText("핸드 1 · 지금 차례");
  await expect(turn(page)).toContainText("핸드 1 차례 — 합계 11");
  await expect(button(page, "스플릿 (+100)")).toBeDisabled();
  await button(page, "더블 다운 (+100)").click();
  await settled(page);
  await expect(chips(page)).toHaveText("700");
  await expect(page.locator("#bj-hands li").nth(1)).toHaveAttribute("aria-current", "true");
  await expect(turn(page)).toContainText("핸드 2 차례 — 합계 18");
  await button(page, "스탠드").click();
  await settled(page);
  const rows = page.locator("#bj-outcome li");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("핸드 1 · 베팅 200");
  await expect(rows.nth(0)).toContainText("푸시 ±0");
  await expect(rows.nth(1)).toContainText("핸드 2 · 베팅 100");
  await expect(rows.nth(1)).toContainText("패배 −100");
  await expect(page.locator("#bj-net")).toContainText("이번 라운드 −100 · 돌려받은 칩 200");
  await expect(chips(page)).toHaveText("900");
  await expect(page.locator("#bj-dealer")).toContainText("합계 21");
  // Round 2: a double click on hit draws exactly one card.
  await button(page, "다음 라운드").dblclick();
  await settled(page);
  await expect(page.locator("#bj-hands li")).toHaveCount(0);
  await dealRound(page, 50);
  await expect(chips(page)).toHaveText("850");
  await button(page, "히트").dblclick();
  await settled(page);
  await expect(page.locator("#bj-hands li .bj-card")).toHaveCount(3);
  await expect(turn(page)).toContainText("내 차례 — 합계 9");
  await expect(button(page, /더블 다운/)).toBeDisabled();
  await expect(page.locator("#bj-note")).toContainText("처음 두 장");
});

test("running out of chips offers a fresh session; leaving and new sessions drop earlier work", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Two losing rounds at the maximum stake: 16 against 20, twice.
  await stack(page, ["10S", "10H", "6D", "KD", "10C", "QH", "6S", "KS"]);
  await sit(page);
  for (const expected of ["500", "0"]) {
    await dealRound(page, 100, 100, 100, 100, 100);
    await expect(button(page, "100 칩 추가")).toBeHidden();
    await button(page, "스탠드").click();
    await settled(page);
    await expect(chips(page)).toHaveText(expected);
    if (expected !== "0") await button(page, "다음 라운드").click();
  }
  await expect(button(page, "다음 라운드")).toBeHidden();
  await expect(page.locator("#bj-note")).toContainText("최소 베팅 10보다 적습니다");
  // Being out of chips is told in a window first.
  await expect(page.getByRole("dialog")).toContainText("칩을 모두 잃었습니다", { timeout: 10000 });
  await page.getByRole("dialog").getByRole("button", { name: "확인" }).click();
  await button(page, "칩 다시 받기").click();
  await settled(page);
  await expect(chips(page)).toHaveText("1,000");
  await expect(page.locator("#move-count")).toHaveText("0라운드");
  await expect(page.locator("#bj-hands li")).toHaveCount(0);
  await expect(button(page, "이전 베팅")).toBeDisabled();
  // Start a deal and leave while the cards are still in the air.
  await bet(page, 100);
  await button(page, "카드 받기").click();
  await button(page, "World Table Games 홈").click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.waitForTimeout(1500);
  // Another game runs untouched by the abandoned deal.
  await selectGame(page, "리버시");
  await button(page, /테이블에 앉기/).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  await button(page, "World Table Games 홈").click();
  // Back at the table: a clean session.
  await selectGame(page, "블랙잭");
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  await expect(chips(page)).toHaveText("1,000");
  await expect(page.locator("#bj-hands li")).toHaveCount(0);
  // A new session in the middle of a round discards it.
  await dealRound(page, 50);
  await expect(chips(page)).toHaveText("950");
  await button(page, "새 게임").click();
  await page.getByRole("dialog").getByRole("button", { name: "새 게임 시작" }).click();
  await settled(page);
  await expect(chips(page)).toHaveText("1,000");
  await expect(page.locator("#bj-hands li")).toHaveCount(0);
  await expect(turn(page)).toContainText("칩을 올려 베팅하세요");
  expect(errors).toEqual([]);
});

test("dialogs do not collide with the result, and the table fits every screen shape", async ({
  page,
}, info) => {
  await stack(page, ["10S", "9H", "9D", "8C", "KH", "5D", "QD", "6C", "4S"]);
  await sit(page);
  await dealRound(page, 100);
  // Rules while it is my turn: one dialog, and the hand waits behind it.
  await button(page, "게임 방법").click();
  await expect(page.getByRole("dialog")).toContainText("보험");
  await expect(page.locator("dialog")).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: "확인" }).click();
  await expect(turn(page)).toContainText("내 차례");
  await button(page, "스탠드").click();
  await settled(page);
  await expect(turn(page)).toContainText("이겼습니다 (+100)");
  // Settings over the finished round: the result stays in the page, no second dialog.
  await button(page, "설정").click();
  await expect(page.locator("dialog")).toHaveCount(1);
  await expect(page.locator("#bj-outcome")).toContainText("승리 +100");
  await page.getByRole("dialog").getByRole("button", { name: "설정 저장" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(button(page, "다음 라운드")).toBeEnabled();
  await button(page, "다음 라운드").click();
  await dealRound(page, 100);
  // Rotate and resize mid-round: the table and the action buttons stay on screen.
  const shapes =
    info.project.name === "mobile"
      ? [{ width: 915, height: 412 }, { width: 740, height: 360 }] // phones play in landscape only
      : [{ width: 900, height: 620 }, { width: 700, height: 1000 }, { width: 1440, height: 1000 }];
  for (const size of shapes) {
    await page.setViewportSize(size);
    await settled(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    // The table refits on the next layout pass after the resize.
    await expect(async () => {
      const canvas = (await page.locator("canvas").boundingBox())!;
      expect(canvas.width).toBeGreaterThan(200);
      expect(canvas.height).toBeGreaterThan(150);
      expect(canvas.x).toBeGreaterThanOrEqual(0);
      expect(canvas.x + canvas.width).toBeLessThanOrEqual(size.width + 1);
      expect(canvas.y + canvas.height).toBeLessThanOrEqual(size.height + 1);
    }).toPass({ timeout: 5000 });
    const hit = button(page, "히트");
    await hit.scrollIntoViewIfNeeded();
    const box = (await hit.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    await expect(page.locator("#bj-hands li")).toHaveCount(1);
    await page.screenshot({
      path: `test-results/${info.project.name}-blackjack-${size.width}x${size.height}.png`,
    });
  }
  await button(page, "히트").click();
  await settled(page);
  await expect(page.locator("#bj-hands li .bj-card")).toHaveCount(3);
});
