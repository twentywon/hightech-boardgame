import { test, expect } from "@playwright/test";
import { selectGame } from "./library";
import { loadShuffles } from "./betting-helpers";

const die = (...faces: number[]) => faces.map((f) => (f - 0.5) / 6);
/** The golden key card that sends a traveller to 우주여행 (the 16th of 31). */
const SPACE_CARD = 15.5 / 31;

test("world tour: on 우주여행 the spaces ahead light up on the board and the one tapped is where the traveller goes", async ({ page }, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // 철수 rolls a double one onto the golden key, and draws the space travel invitation.
  await loadShuffles(page, [...die(1, 1), SPACE_CARD]);
  await page.goto("/");
  await selectGame(page, "세계 일주");
  await page.locator("#tour-humans").selectOption("2");
  await page.locator(".tour-name").nth(0).fill("철수");
  await page.locator(".tour-name").nth(1).fill("영희");
  await page.locator("#tour-opponents").selectOption("0");
  await page.locator("#tour-start").click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  const settled = () => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await settled();
  await page.locator("#tour-roll").click();
  await settled();
  await page.locator("#tour-key").evaluate((b: HTMLElement) => b.click());
  await expect(page.locator("dialog[open]")).toContainText("우주여행 초청장");
  await page.locator("dialog[open] .dialog-actions button").last().click();
  await settled();
  // No list window: the spaces ahead are lit on the board instead.
  await expect(page.locator("#turn")).toContainText("판에서 빛나는 칸");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-offered", /(^|,)39(,|$)/);
  const offered = (await canvas.getAttribute("data-offered"))!.split(",").map(Number);
  expect(offered).toHaveLength(39);
  expect(offered).not.toContain(30);
  const spots = JSON.parse((await canvas.getAttribute("data-spots"))!) as Record<string, [number, number]>;
  const tap = async (i: number) => {
    const [x, y] = spots[i];
    if (info.project.name === "mobile") {
      const box = (await canvas.boundingBox())!;
      await page.touchscreen.tap(box.x + x, box.y + y);
    } else await canvas.click({ position: { x, y } });
  };
  // A tap on 뉴욕 asks first; 다시 고르기 keeps the board's choice open.
  await tap(31);
  await expect(page.locator("dialog[open]")).toContainText("뉴욕으로 떠납니다");
  await page.locator("dialog[open]").getByRole("button", { name: "다시 고르기" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  // 서울, the last space before the start: 떠나기 takes the traveller there and the lights go out.
  await tap(39);
  await expect(page.locator("dialog[open]")).toContainText("서울로 떠납니다");
  await page.locator("dialog[open]").getByRole("button", { name: "떠나기" }).click();
  await settled();
  await expect(page.locator("#tour-note")).toContainText("서울(으)로 우주여행을 떠납니다");
  await expect(canvas).toHaveAttribute("data-offered", "");
  expect(errors).toEqual([]);
});
