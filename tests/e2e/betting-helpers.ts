import { expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

/**
 * Fixes the shuffles from outside the game: the page's own
 * `crypto.getRandomValues` replays `values` (see tests/card-fixtures.ts),
 * then leaves the remaining cards in place. The games ship no card controls.
 */
export async function loadShuffles(page: Page, values: number[]) {
  await page.addInitScript((queue) => {
    let i = 0;
    const real = crypto.getRandomValues.bind(crypto);
    crypto.getRandomValues = (<A extends ArrayBufferView | null>(array: A): A => {
      const words = array as unknown;
      if (!(words instanceof Uint32Array)) return real(array as never) as A;
      for (let k = 0; k < words.length; k++)
        words[k] = i < queue.length ? Math.floor(queue[i++] * 4294967296) : 4294967295;
      return array;
    }) as typeof crypto.getRandomValues;
  }, values);
}
export const button = (page: Page, name: string | RegExp) =>
  page.getByRole("button", { name, exact: typeof name === "string" });
export const settled = (page: Page) =>
  expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 15000 });
export const turn = (page: Page) => page.locator("#turn");
/** Waits until seat 0 may act. */
export const myTurn = (page: Page) =>
  expect(page.locator("#bg-call")).toBeEnabled({ timeout: 30000 });
/** Waits until the hand is over and its result is on screen. */
export const handOver = (page: Page) =>
  expect(page.locator("#bg-deal, #bg-rebuy").locator("visible=true").first()).toBeEnabled({
    timeout: 40000,
  });
export async function sit(page: Page, game: string, opponents: number, level = "normal") {
  await page.goto("/");
  await selectGame(page, game);
  await page.getByLabel("상대 수").selectOption(String(opponents));
  await page.getByLabel("AI 난이도").selectOption(level);
  await button(page, /테이블에 앉기/).click();
  await expect(page.locator("canvas")).toBeVisible();
  await settled(page);
}
export const seat = (page: Page, index: number) => page.locator("#bg-seats li").nth(index);
