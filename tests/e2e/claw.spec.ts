import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { BUTTON, CLAW_SUBJECT } from "../../src/games/claw/layout";
import { selectGame } from "./library";

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const tries = async (page: Page) => Number(/남은 횟수 (\d+)/.exec(await page.locator("#turn").innerText())?.[1] ?? -1);

test("claw machine: the claw is steered by held keys, the lever and a press on the glass, the button lets it down, and the try is counted", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "인형뽑기");
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  const start = await tries(page);
  expect(start).toBeGreaterThan(0);
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  // A key pressed and let go is two moves: the lever pushed, and let go.
  await expect.poll(() => moves(page)).toBeGreaterThanOrEqual(4);
  // The lever at the lower left (the user asked for it instead of arrows), pushed right a while: one move as it is
  // pushed and one as it is let go; the 뽑기 button stands at the lower right.
  const held = await moves(page),
    stick = (await page.locator(".pg-stick").boundingBox())!,
    canvasBox = (await page.locator("canvas").boundingBox())!,
    drop = (await page.getByRole("button", { name: "집게 내리기" }).boundingBox())!;
  expect(drop.x).toBeGreaterThan(canvasBox.x + canvasBox.width / 2);
  expect(stick.x + stick.width).toBeLessThan(canvasBox.x + canvasBox.width / 2);
  await page.mouse.move(stick.x + stick.width / 2, stick.y + stick.height / 2);
  await page.mouse.down();
  await page.mouse.move(stick.x + stick.width, stick.y + stick.height / 2, { steps: 4 });
  await page.waitForTimeout(400);
  await expect.poll(() => moves(page)).toBe(held + 1);
  await page.mouse.up();
  await expect.poll(() => moves(page)).toBe(held + 2);
  // A press on the pit through the glass, then the big red button on the deck, aimed through the same camera.
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    distance = cameraDistance(aspect, false, CLAW_SUBJECT),
    flat = Math.cos(CLAW_SUBJECT.tilt) * distance;
  camera.position.set(0, Math.sin(CLAW_SUBJECT.tilt) * distance, flat);
  camera.lookAt(0, CLAW_SUBJECT.lookY, 0);
  camera.updateMatrixWorld();
  const screen = (x: number, y: number, z: number) => {
    const v = new Vector3(x, y, z).project(camera);
    return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
  };
  const pit = screen(0.6, 0.45, 0),
    button = screen(BUTTON.x, BUTTON.y + 0.12, BUTTON.z);
  await page.mouse.click(pit.x, pit.y);
  const before = await moves(page);
  await page.mouse.click(button.x, button.y);
  await expect.poll(() => moves(page)).toBeGreaterThan(before);
  // The claw goes down, closes, comes back over the chute: the try is spent, a toy caught or not.
  await expect.poll(() => tries(page), { timeout: 30000 }).toBe(start - 1);
  expect(errors).toEqual([]);
});
