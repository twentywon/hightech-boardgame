import { expect, type Page } from "@playwright/test";

export async function selectGame(page: Page, name: string = "오목") {
  const card = page.getByRole("button", { name: `${name} 살펴보기`, exact: true });
  await expect(card).toBeVisible();
  if (await card.getAttribute("aria-expanded") !== "true") await card.click();
}
