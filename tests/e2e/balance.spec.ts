import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const rest = async (page: Page) => {
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(300);
};
/** Presses the table's first point by the keyboard (the first arrow shows the cursor) and waits for the move. */
async function press(page: Page, moves: string) {
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText(moves);
  await rest(page);
}

test("balance quiz: the four stages are laid, each takes a press, a hint is shown, and coins are weighed only in equal numbers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "저울 퀴즈");
  await page.locator(".game-stage button.primary").click();
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(4);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "추 달기" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await press(page, "1수");
  await page.locator("#pz-hint").click();
  await expect(page.locator(".board-hint")).toContainText("힌트");
  // The coins: one coin on a pan and none on the other cannot be weighed.
  await page.locator('.puzzle-level[data-stage="1"]').click();
  await expect(count(page)).toHaveText("0수");
  await press(page, "1수");
  await expect(page.locator("#pg-tool-0")).toBeDisabled();
  await expect(page.locator("#pg-tool-1")).toHaveText("가짜 지목하기");
  for (const stage of ["3", "4"]) {
    await page.locator(`.puzzle-level[data-stage="${stage}"]`).click();
    await expect(count(page)).toHaveText("0수");
    await press(page, "1수");
  }
  expect(errors).toEqual([]);
});
