import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";
import { PerspectiveCamera, Vector3 } from "three";
import { toWorld } from "../../src/games/reversi/coordinates";
import { SUBJECTS, cameraDistance } from "../../src/engine/camera";
async function open(page: Page) {
  await selectGame(page, "리버시");
}

async function cell(page: Page, row: number, col: number, top = false) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    d = cameraDistance(aspect, top, SUBJECTS.reversi),
    a = top ? Math.PI / 2 - 0.001 : (55 * Math.PI) / 180;
  const camera = new PerspectiveCamera(38, aspect, 0.1, 60);
  camera.position.set(0, Math.sin(a) * d, Math.cos(a) * d);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const w = toWorld({ row, col }),
    v = new Vector3(w.x, 0.15, w.z).project(camera);
  return {
    x: box.x + ((v.x + 1) / 2) * box.width,
    y: box.y + ((1 - v.y) / 2) * box.height,
  };
}
test("Reversi actual WebGL mouse/touch flips, camera, new game and game selection", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "리버시 살펴보기", exact: true }),
  ).toBeVisible();
  await open(page);
  await page.getByRole("button", { name: "테이블에 앉기", exact: false }).click();
  await expect(page.locator("#black-count")).toHaveText("2");
  await expect(page.locator("#white-count")).toHaveText("2");
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    "3D 리버시판",
  );
  const pos = await cell(page, 2, 3);
  if (info.project.name === "mobile") {
    await page.touchscreen.tap(pos.x, pos.y);
  } else await page.mouse.click(pos.x, pos.y);
  await expect(page.locator("#black-count")).toHaveText("4");
  await expect(page.locator("#white-count")).toHaveText("1");
  await expect(page.locator("#turn")).toContainText("백돌");
  await page.waitForTimeout(650);
  const invalid = await cell(page, 0, 0);
  if (info.project.name === "mobile")
    await page.touchscreen.tap(invalid.x, invalid.y);
  else await page.mouse.click(invalid.x, invalid.y);
  await expect(page.locator("#move-count")).toHaveText("1수", {
    timeout: 15000,
  });
  await page.screenshot({
    path: `test-results/${info.project.name}-reversi.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByLabel("합법 수 안내").uncheck();
  await expect(page.getByRole("button", { name: /힌트|대국 설정/ })).toHaveCount(0);
  const before = await page.locator("canvas").screenshot();
  await page.getByRole("button", { name: "시점 전환" }).click();
  await page.waitForTimeout(550);
  expect((await page.locator("canvas").screenshot()).equals(before)).toBe(
    false,
  );
  await page.locator(".side-setup").getByRole("button", { name: "새 게임 시작" }).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  await expect(page.locator("#black-count")).toHaveText("2");
  // Nothing is kept for later: the collection offers no game to continue.
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await open(page);
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.getByRole("heading", { name: /^오목/ })).toBeVisible();
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    "3D 오목판",
  );
  expect(errors).toEqual([]);
});
test("Reversi difficulty/color persist independently; changes apply next match", async ({
  page,
}) => {
  await page.goto("/");
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("AI 난이도").selectOption("expert");
  await page.getByLabel("플레이어 색상").selectOption("white");
  await open(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("normal");
  await expect(page.getByLabel("플레이어 색상")).toHaveValue("black");
  await expect(page.getByLabel("AI 난이도").locator("option")).toHaveCount(5);
  await page.getByLabel("AI 난이도").selectOption("easy");
  await page.getByLabel("플레이어 색상").selectOption("white");
  await page.reload();
  await open(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("easy");
  await expect(page.getByLabel("플레이어 색상")).toHaveValue("white");
  const openingWorker = page.waitForEvent("worker", { timeout: 15000 });
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await openingWorker;
  await expect(page.locator("#move-count")).toHaveText("1수", {
    timeout: 15000,
  });
  await expect(page.locator(".player").first()).toContainText("컴퓨터 · 쉬움");
  // The dialog opens on the mode being played; leaving it changes nothing.
  const dialog = page.locator(".side-setup");
  await expect(dialog.getByLabel("컴퓨터 대전", { exact: true })).toBeChecked();
  await dialog.getByLabel("AI 난이도").selectOption("hard");
  await expect(page.locator(".player").first()).toContainText("컴퓨터 · 쉬움");
  const restartWorker = page.waitForEvent("worker", { timeout: 15000 });
  await page.locator(".side-setup").getByRole("button", { name: "새 게임 시작" }).click();
  await restartWorker;
  await expect(page.locator(".player").first()).toContainText(
    "컴퓨터 · 어려움",
  );
  await expect(page.locator("#move-count")).toHaveText("1수", {
    timeout: 15000,
  });
});
/** Sits down against the expert as black and plays a first move, so that it starts thinking. */
async function provoke(page: Page, game: "오목" | "리버시") {
  await selectGame(page, game);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("AI 난이도").selectOption("expert");
  await page.getByLabel("플레이어 색상").selectOption("black");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.locator("canvas").focus();
  await expect(async () => {
    await page.keyboard.press("Enter");
    await expect(page.locator("#move-count")).not.toHaveText("0수", { timeout: 500 });
  }).toPass({ timeout: 15000 });
}
test("actual Workers stay responsive and are cancelled when switching both games", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/");
  const gWorker = page.waitForEvent("worker");
  await provoke(page, "오목");
  await gWorker;
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await open(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.waitForTimeout(3400);
  await expect(page.locator("#move-count")).toHaveText("0수");
  await expect(page.locator("#black-count")).toHaveText("2");
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  const rWorker = page.waitForEvent("worker");
  await provoke(page, "리버시");
  await rWorker;
  await page.bringToFront();
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  const ticks = await page.evaluate(async () => {
    let last = performance.now(),
      running = true;
    const gaps: number[] = [];
    function tick(t: number) {
      gaps.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 1200));
    running = false;
    return { count: gaps.length, max: Math.max(...gaps) };
  });
  await info.attach("reversi-worker-frames", {
    body: JSON.stringify(ticks),
    contentType: "application/json",
  });
  expect(ticks.count).toBeGreaterThan(5);
  expect(ticks.max).toBeLessThan(1000);
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page);
  await page.getByLabel("로컬 2인", { exact: true }).check();
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.waitForTimeout(3400);
  await expect(page.locator("#move-count")).toHaveText("0수");
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    "3D 오목판",
  );
});
test("Reversi random color is resolved once and storage failure is safe", async ({
  page,
}) => {
  await page.goto("/");
  await open(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("플레이어 색상").selectOption("random");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  const human = (await page.locator(".player").first().textContent())!.includes("나") ? 1 : 2;
  await expect(page.locator(".player").nth(2 - human)).toContainText("컴퓨터");
  await expect(page.locator("#move-count")).toHaveText(
    human === 2 ? "1수" : "0수",
    { timeout: 15000 },
  );
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("Storage disabled");
    };
  });
  const dialog = page.locator(".side-setup");
  await dialog.getByLabel("AI 난이도").selectOption("expert");
  await dialog.getByLabel("플레이어 색상").selectOption("white");
  await dialog.getByRole("button", { name: "새 게임 시작" }).click();
  await expect(page.locator(".player").first()).toContainText(
    "컴퓨터 · 전문가",
  );
  await expect(page.locator("#move-count")).toHaveText("1수", {
    timeout: 15000,
  });
});
