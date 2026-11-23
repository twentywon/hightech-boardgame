import { test, expect, type Page } from "@playwright/test";
import * as tower from "../../src/games/hanoi/rules";
import { selectGame } from "./library";

/**
 * The five puzzles the user asked to have upgraded (water pouring, the Amazons, queens on the board, the knight tour,
 * the tower of Hanoi): their new stages, modes and help, played in the browser.
 */
const count = (page: Page) => page.locator("#move-count");
const rest = async (page: Page) => {
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(260);
};
/** Sits down at a puzzle for one and picks the stage card that says `stage`. */
async function sit(page: Page, name: string, stage: string, cards: number) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, name);
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(cards);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: stage }).first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  return errors;
}
/** The platform's random numbers replaced by a known sequence; the same sequence, for the test to lay the same puzzles. */
async function seeded(page: Page, start: number) {
  await page.addInitScript((first) => {
    let seed = first;
    crypto.getRandomValues = ((buffer: Uint32Array) => {
      for (let i = 0; i < buffer.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        buffer[i] = seed * 2;
      }
      return buffer;
    }) as typeof crypto.getRandomValues;
  }, start);
  let seed = start;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed * 2) / 4294967296;
  };
}
/** Walks the keyboard over a board of `cols` columns: `home` goes to its first point, `go` to a point and presses it. */
function walker(page: Page, cols: number, rows: number) {
  let cursor = 0;
  return {
    home: async () => {
      await page.locator("canvas").focus();
      for (let i = 0; i <= cols; i++) await page.keyboard.press("ArrowLeft");
      for (let i = 0; i <= rows; i++) await page.keyboard.press("ArrowUp");
      cursor = 0;
    },
    go: async (to: number) => {
      const dc = (to % cols) - (cursor % cols),
        dr = Math.floor(to / cols) - Math.floor(cursor / cols);
      for (let i = 0; i < Math.abs(dc); i++) await page.keyboard.press(dc > 0 ? "ArrowRight" : "ArrowLeft");
      for (let i = 0; i < Math.abs(dr); i++) await page.keyboard.press(dr > 0 ? "ArrowDown" : "ArrowUp");
      cursor = to;
      await page.keyboard.press("Enter");
    },
  };
}

test("tower of Hanoi: a tower on four pegs is moved in the fewest with the hint, and the next stage is offered", async ({ page }) => {
  test.setTimeout(150000);
  const errors = await sit(page, "하노이의 탑", "기둥 4개 · 원판 5개", 10);
  const panel = page.locator(".puzzle-panel"),
    pegs = walker(page, 4, 0);
  await expect(panel.locator("#pz-stage")).toHaveText("기둥 4개 · 원판 5개 · 스테이지 1");
  let state = tower.createGame(5, 4);
  expect(state.best).toBe(13);
  await panel.getByRole("button", { name: "힌트", exact: true }).click();
  await expect(page.locator("#turn")).toContainText("화살표");
  await pegs.home();
  for (let n = 0; state.winner === null; n++) {
    const move = tower.hint(state)!;
    await pegs.go(move.from);
    await pegs.go(move.to);
    await expect(count(page)).toHaveText(`${n + 1}수`, { timeout: 20000 });
    await rest(page);
    state = tower.play(state, move)!;
  }
  expect(state.ply).toBe(13);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(panel.locator("#pz-next")).toBeVisible();
  await panel.locator("#pz-next").click();
  await expect(panel.locator("#pz-stage")).toHaveText("기둥 4개 · 원판 5개 · 스테이지 2");
  await expect(count(page)).toHaveText("0수");
  expect(errors).toEqual([]);
});
