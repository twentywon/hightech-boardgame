import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { GOSTOP_LAYOUT as L } from "../../src/games/gostop/layout";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const rest = async (page: Page) => {
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(260);
};
async function onScreen(page: Page, x: number, y: number, z: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = aspect < 1.2 ? { ...L.SUBJECT, half: L.SUBJECT.half * 0.96 } : L.SUBJECT,
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}

test("go-stop: the cards are dealt from the pile, a card of my hand is tapped and played, and the computer answers", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // A fixed shuffle in which my hand holds no three of a month (three would be held together and move the row).
  await page.addInitScript(() => {
    let seed = 1;
    crypto.getRandomValues = ((buffer: Uint32Array) => {
      for (let i = 0; i < buffer.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        buffer[i] = seed * 2;
      }
      return buffer;
    }) as typeof crypto.getRandomValues;
  });
  await page.goto("/");
  await selectGame(page, "고스톱");
  // Against the computer only: each side's hand is hidden from the other.
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  // The deal from the pile takes a while; nothing can be played until it is over.
  await rest(page);
  // No panel beside the table (it stays in the page as a pixel for readers): the scores are painted on the table.
  await expect(page.locator(".game-layout")).toHaveClass(/no-panel/);
  await expect(page.locator(".board-hint")).toContainText("낼 카드를 고르세요");
  // The first card of my hand, at the left of the near row.
  const at = await onScreen(page, -4.5 * L.HAND_STEP, 0.04, L.HAND_Z);
  await page.mouse.click(at.x, at.y);
  // Two floor cards of different kinds: the one to take is chosen with the keyboard.
  await page.waitForTimeout(300);
  if (/가져올 카드/.test(await page.locator(".board-hint").innerText())) {
    await page.locator("canvas").focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");
  }
  // My card and the computer's (a go said by either counts too).
  await expect(count(page)).not.toHaveText(/^[01]수$/, { timeout: 30000 });
  await expect(page.locator(".board-hint")).toContainText(/낼 카드를 고르세요|고 하시겠습니까|이겼습니다/, { timeout: 30000 });
  expect(errors).toEqual([]);
});
