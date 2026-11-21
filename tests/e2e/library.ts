import { expect, type Page } from "@playwright/test";

/**
 * Enters a game from the collection (the user asked: a tile enters its game at once, and its settings come up in a
 * window over its table) and waits for that window to come to rest. Nothing is played until its start is pressed;
 * its panel carries the class `game-stage`, so `.game-stage button.primary` is that start, as it was in the
 * collection's panel. At a table or in another game's window already, it goes back to the collection first.
 */
export async function selectGame(page: Page, name: string = "오목") {
  if (await page.locator("main.game-layout, main.entry-backdrop").count())
    await page.evaluate(() => {
      const leave = document.querySelector<HTMLButtonElement>("dialog.entry[open] #setup-cancel");
      if (leave) return leave.click();
      document.querySelectorAll("dialog").forEach((d) => d.remove());
      document.querySelector<HTMLButtonElement>("main.game-layout #back")?.click();
    });
  const card = page.getByRole("button", { name: `${name} 살펴보기`, exact: true });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator("dialog.entry[open]")).toBeVisible();
  // The window opens with an animation: what is in it is not to be pressed before it has come to rest.
  await page.waitForFunction(() => {
    const dialog = document.querySelector("dialog[open]");
    return !!dialog && dialog.getAnimations({ subtree: true }).every((animation) => animation.playState === "finished");
  });
}
