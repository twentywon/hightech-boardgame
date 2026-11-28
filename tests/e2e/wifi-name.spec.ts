import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

/*
 * The name typed for a Wi-Fi room is kept on the device, so every game's room and the collection's 참가하기 start
 * with it, after a reload too; and no window opens with the name field focused, which would bring a phone's keyboard
 * up at once (the user asked for both).
 */
async function lobby(page: Page, game: string) {
  await page.goto("/");
  await selectGame(page, game);
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  return page.locator("dialog.net-lobby #net-name");
}

test("a Wi-Fi name is typed once and kept for every game's room; no field is focused as a window opens", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let name = await lobby(page, "틱택토");
  await expect(name).toHaveValue("");
  await expect(name).not.toBeFocused();
  await name.fill("철수");
  // Another game, after a reload: the name is there and the field still waits for a tap.
  name = await lobby(page, "오목");
  await expect(name).toHaveValue("철수");
  await expect(name).not.toBeFocused();
  await expect(page.locator("dialog.net-lobby[open]")).toBeFocused();
  await name.fill("영희");
  // The collection's 참가하기 starts with it too.
  await page.goto("/");
  await page.locator("#join-room").click();
  const join = page.locator("dialog.net-join[open] #net-name");
  await expect(join).toHaveValue("영희");
  await expect(join).not.toBeFocused();
  expect(errors).toEqual([]);
});
