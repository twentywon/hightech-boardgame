import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as R from "../../src/games/hula/rules";
import { HULA, handX } from "../../src/games/hula/layout";

const canvas = (page: Page) => page.locator("canvas");
const data = async (page: Page, key: string) => (await canvas(page).getAttribute(`data-${key}`)) ?? "";
const mine = async (page: Page) => (await data(page, "mine")).split(",").filter(Boolean).map(Number);
const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
/** Where a point of the table is on the screen, through the same camera as the view's. */
async function screenAt(page: Page, x: number, z: number, y = 0.06) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    subject = HULA.SUBJECT,
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
async function tap(page: Page, at: { x: number; y: number }, mobile: boolean) {
  if (mobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}
/** Taps card `id` of my hand (lifted a little toward the middle once picked). */
async function tapCard(page: Page, id: number, mobile: boolean, picked = false) {
  const hand = await mine(page),
    i = hand.indexOf(id);
  expect(i).toBeGreaterThanOrEqual(0);
  await tap(page, await screenAt(page, handX(i, hand.length), HULA.HAND_Z - (picked ? HULA.LIFT : 0)), mobile);
}
/** Waits for my move to come back (my turn, a claim of mine, or the round's end) and the table to rest. */
async function myMove(page: Page) {
  await expect
    .poll(async () => (await data(page, "seat")) === "0" && (await page.locator("#board").getAttribute("data-animating")) === "false", { timeout: 60000 })
    .toBe(true);
}

test("hula: against one computer, a turn by taps (draw, register, discard) and one by keys and buttons; the computer plays and the score shows", async ({ page }, info) => {
  test.setTimeout(180000);
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "훌라");
  const dialog = page.locator("dialog.entry");
  await expect(dialog.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await dialog.locator("#pg-set-rivals").selectOption("1");
  await dialog.locator("#pg-variant").selectOption("3");
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  // Two at the table, seven cards each, my turn to draw; the score says the round and the points.
  expect(await data(page, "hands")).toBe("7,7");
  expect(await data(page, "phase")).toBe("draw");
  await expect(page.locator(".hula-score").first()).toContainText("1/3판");
  await expect(page.locator(".hula-score").first()).toContainText("나 0점");
  // The computer's cards are face down and written nowhere.
  expect(await data(page, "open")).toBe("0");
  // A tap on the stock draws its top card.
  await tap(page, await screenAt(page, HULA.STOCK.x, HULA.STOCK.z, 0.3), mobile);
  await expect(canvas(page)).toHaveAttribute("data-phase", "meld");
  await settled(page);
  expect(await mine(page)).toHaveLength(8);
  // A meld I hold, picked card by card and registered with its button (if I hold none, nothing to register).
  const meld = R.meldsIn(await mine(page)).sort((a, b) => b.length - a.length)[0];
  if (meld) {
    for (const id of meld) {
      await tapCard(page, id, mobile);
      await settled(page);
    }
    await expect(canvas(page)).toHaveAttribute("data-picked", String(meld.length));
    await page.getByRole("button", { name: "등록", exact: true }).click();
    await expect(canvas(page)).toHaveAttribute("data-melds", "1");
    await settled(page);
  }
  // A card picked, put back, picked again; then the discard pile tapped discards it and the computer is to play.
  const hand = await mine(page),
    card = hand[hand.length - 1];
  await tapCard(page, card, mobile);
  await expect(canvas(page)).toHaveAttribute("data-picked", "1");
  await settled(page);
  await tapCard(page, card, mobile, true);
  await expect(canvas(page)).toHaveAttribute("data-picked", "0");
  await settled(page);
  await tapCard(page, card, mobile);
  await expect(canvas(page)).toHaveAttribute("data-picked", "1");
  await settled(page);
  await tap(page, await screenAt(page, HULA.DISCARD.x, HULA.DISCARD.z, 0.3), mobile);
  await expect.poll(() => data(page, "top"), { timeout: 10000 }).toBe(String(card));
  // The computer draws (or claims), perhaps registers, and discards: then it is mine again (a turn, a claim, or the round's end).
  await myMove(page);
  // It has taken my card (땡큐) or discarded one of its own over it.
  expect(await data(page, "top")).not.toBe(String(card));
  if ((await data(page, "phase")) === "draw") {
    // By keys: → from my first card walks to the second, Enter picks it and puts it back; ← and Enter pick the first.
    await canvas(page).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
    await expect(canvas(page)).toHaveAttribute("data-picked", "1");
    await page.keyboard.press("Enter");
    await expect(canvas(page)).toHaveAttribute("data-picked", "0");
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("Enter");
    await expect(canvas(page)).toHaveAttribute("data-picked", "1");
    await page.keyboard.press("Enter");
    await expect(canvas(page)).toHaveAttribute("data-picked", "0");
    // The sort button lays my hand in the other order.
    const before = await mine(page);
    await page.getByRole("button", { name: "숫자순 정렬" }).click();
    await expect.poll(async () => (await mine(page)).join(",")).not.toBe(before.join(","));
    expect([...(await mine(page))].sort((a, b) => a - b)).toEqual([...before].sort((a, b) => a - b));
    // The stock's button (kept for the keyboard) draws, and 버리기 discards the card picked.
    await page.getByRole("button", { name: "한 장 가져오기" }).click();
    await expect(canvas(page)).toHaveAttribute("data-phase", "meld");
    await settled(page);
    const now = await mine(page);
    await tapCard(page, now[0], mobile);
    await expect(canvas(page)).toHaveAttribute("data-picked", "1");
    await page.getByRole("button", { name: "버리기", exact: true }).click();
    await expect.poll(() => data(page, "top")).toBe(String(now[0]));
  }
  expect(errors).toEqual([]);
});
