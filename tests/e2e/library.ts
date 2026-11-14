import { expect, type Page } from "@playwright/test";

export async function selectGame(page: Page, name: string = "오목") {
  const card = page.getByRole("button", { name: `${name} 살펴보기`, exact: true });
  await expect(card).toBeVisible();
  if (await card.getAttribute("aria-expanded") !== "true") await card.click();
  // The panel opens with an animation: what is in it is not to be pressed (least of all by force) before it has come to rest.
  await page.waitForFunction(() => {
    const stage = document.querySelector(".game-stage");
    return !!stage && stage.getAnimations().every((animation) => animation.playState === "finished");
  });
}
