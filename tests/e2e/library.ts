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
      // A game in play asks before it is left (the user asked).
      document.querySelector<HTMLButtonElement>("dialog.leave-dialog #leave-go")?.click();
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

/**
 * Test-only: the page's clock runs `factor` times faster (`performance.now` and the delays of `setTimeout` and
 * `setInterval`), so a whole game's animations and the computer's pauses pass quickly without any change to the game.
 * Use it for long play-throughs (a whole game against the computer); a software-drawn page otherwise needs many
 * minutes, more when several browsers run at once. Call before `page.goto`.
 */
export async function fastClock(page: Page, factor = 6) {
  await page.addInitScript((k) => {
    const now = performance.now.bind(performance),
      start = now();
    performance.now = () => start + (now() - start) * k;
    const timeout = window.setTimeout,
      interval = window.setInterval;
    window.setTimeout = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => timeout(fn, (ms ?? 0) / k, ...rest)) as typeof setTimeout;
    window.setInterval = ((fn: TimerHandler, ms?: number, ...rest: unknown[]) => interval(fn, (ms ?? 0) / k, ...rest)) as typeof setInterval;
  }, factor);
}

/** Leaves a table by its 나가기, saying 나가기 again in the window a game in play asks with (the user asked for it). */
export async function leaveTable(page: Page) {
  await page.locator("main.game-layout #back").click();
  const go = page.locator("dialog.leave-dialog #leave-go");
  if (await go.count()) await go.click();
}
