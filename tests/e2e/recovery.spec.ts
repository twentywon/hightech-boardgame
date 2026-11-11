import { test, expect, type Page } from "@playwright/test";
import { SUBJECTS, cameraDistance } from "../../src/engine/camera";
import { selectGame } from "./library";
import { PerspectiveCamera, Vector3 } from "three";
import { playout } from "../reversi-fixtures";
import { encode, SESSION_KEY } from "../../src/games/reversi/storage";

async function start(page: Page, game: "gomoku" | "reversi", ai = false) {
  await page.goto("/");
  await selectGame(page, game === "gomoku" ? "오목" : "리버시");
  if (ai) {
    await page.getByLabel("컴퓨터 대전", { exact: true }).check();
    await page.getByLabel("플레이어 색상").selectOption("white");
  }
  await page.getByRole("button", {
    name: "테이블에 앉기",
  }).click();
}

async function opening(page: Page, game: "gomoku" | "reversi") {
  const box = (await page.locator("canvas").boundingBox())!;
  const aspect = box.width / box.height;
  const distance = cameraDistance(aspect, false, SUBJECTS[game]);
  const angle = 55 * Math.PI / 180;
  const camera = new PerspectiveCamera(38, aspect, 0.1, 60);
  // In a local game the table is turned to the player to move.
  const flipped = (await page.locator("#board").getAttribute("data-flipped")) === "true";
  camera.position.set(0, Math.sin(angle) * distance, Math.cos(angle) * distance * (flipped ? -1 : 1));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const v = (game === "gomoku" ? new Vector3(0, .15, 0) : new Vector3(-.36, .15, -1.08)).project(camera);
  return { x: box.x + (v.x + 1) * box.width / 2, y: box.y + (1 - v.y) * box.height / 2 };
}

for (const game of ["gomoku", "reversi"] as const) {
  test(`${game}: secondary buttons and cancelled gestures never place a stone`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await start(page, game);
    const p = await opening(page, game);
    await page.mouse.click(p.x, p.y, { button: "right" });
    await page.mouse.click(p.x, p.y, { button: "middle" });
    await expect(page.locator("#move-count")).toHaveText("0수");
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.locator("canvas").dispatchEvent("pointercancel", { pointerId: 1, pointerType: "mouse", isPrimary: true });
    await expect(page.locator("#confirm")).toBeDisabled();
    await page.mouse.up();
    await expect(page.locator("#move-count")).toHaveText("0수");
    expect(errors).toEqual([]);
  });

  test(`${game}: leaving the playable board clears the pending selection`, async ({ page }, info) => {
    await start(page, game);
    const p = await opening(page, game);
    if (info.project.name === "mobile") await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.move(p.x, p.y);
    await expect(page.locator("#confirm")).toBeEnabled();
    const box = (await page.locator("canvas").boundingBox())!;
    if (info.project.name === "mobile") await page.touchscreen.tap(box.x + 5, box.y + 5);
    else await page.mouse.move(box.x + 5, box.y + 5);
    await expect(page.locator("#confirm")).toBeDisabled();
    await expect(page.locator("#move-count")).toHaveText("0수");
  });

  test(`${game}: Worker failure stays visible through camera changes and retry recovers`, async ({ page }) => {
    await page.addInitScript(() => {
      const RealWorker = window.Worker;
      let fail = true;
      window.Worker = class extends RealWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          if (fail) { fail = false; throw new Error("Test worker startup failed"); }
          super(url, options);
        }
      };
    });
    await start(page, game, true);
    const retry = page.getByRole("button", { name: "AI 다시 시도" });
    await expect(retry).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "시점 전환" }).click();
    await expect(retry).toBeVisible();
    await retry.click();
    await expect(page.locator("#move-count")).toHaveText("1수", { timeout: 15000 });
  });

  test(`${game}: game result survives page suspension while settings are open`, async ({ page }) => {
    await page.goto("/");
    const reversi = playout(7, 1);
    expect(reversi.winner).toBeNull();
    const key = game === "gomoku" ? "wtg.session.v1" : SESSION_KEY;
    const value = game === "gomoku" ? JSON.stringify({
      version: 2, mode: "local", moves: Array.from({ length: 8 }, (_, i) => ({
        row: i % 2 ? 0 : 7, col: i % 2 ? Math.floor(i / 2) : 3 + i / 2, player: i % 2 ? 2 : 1,
      })),
    }) : encode({ state: reversi, mode: "local", difficulty: "normal", human: 1 });
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key, value });
    await page.reload();
    await selectGame(page, game === "gomoku" ? "오목" : "리버시");
    await page.getByRole("button", { name: game === "gomoku" ? "저장한 게임 이어하기" : "리버시 이어하기" }).click();
    await page.locator("canvas").focus();
    // Open settings in the same task as the winning keypress. Software WebGL can
    // delay a later Playwright click until after the 850/900ms result timer fires.
    await page.evaluate(() => {
      document.querySelector("canvas")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      document.querySelector<HTMLButtonElement>("#settings")!.click();
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await expect(page.locator("#turn")).toContainText(/승리|무승부/);
    await page.getByLabel("렌더링 품질").selectOption("low");
    await page.waitForTimeout(1200);
    await expect(page.getByRole("heading", { name: "나만의 테이블" })).toBeVisible();
    await page.getByRole("button", { name: "설정 저장" }).click();
    await expect(page.getByRole("button", { name: "게임판 보기" })).toBeVisible({ timeout: 15000 });
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("wtg.settings.v1")!).quality)).toBe("low");
  });
}
