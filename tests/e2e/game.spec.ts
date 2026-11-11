import { test, expect } from "@playwright/test";
import { selectGame } from "./library";
test("menu, actual WebGL moves, persistence, camera and restart", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /함께 앉으면/ }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "개발 예정" })).toHaveCount(0);
  await page.screenshot({
    path: `test-results/${info.project.name}-menu.png`,
    fullPage: true,
  });
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  const canvas = page.locator("canvas");
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(500);
  const bounds = (await canvas.boundingBox())!;
  const mobile = info.project.name === "mobile";
  if (mobile) {
    await page.touchscreen.tap(
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2,
    );
    await expect(page.getByRole("button", { name: /착수 확정/ })).toBeEnabled();
    await expect(page.locator("#move-count")).toHaveText("0수");
    await page.getByRole("button", { name: /착수 확정/ }).click();
  } else
    await canvas.click({
      position: { x: bounds.width / 2, y: bounds.height / 2 },
    });
  await expect(page.locator("#move-count")).toHaveText("1수");
  await expect(page.locator("#turn")).toContainText("백돌");
  await page.waitForTimeout(400);
  if (!mobile) {
    await canvas.click({
      position: { x: bounds.width / 2, y: bounds.height / 2 },
    });
    await expect(page.locator("#move-count")).toHaveText("1수");
  }
  await page.screenshot({
    path: `test-results/${info.project.name}-game.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await expect(page.locator("#move-count")).toHaveText("1수");
  const angled = await page.locator("canvas").screenshot();
  await page.getByRole("button", { name: "시점 전환" }).click();
  await page.waitForTimeout(550);
  const overhead = await page.locator("canvas").screenshot();
  expect(overhead.equals(angled)).toBe(false);
  await page.getByRole("button", { name: "다시 시작", exact: true }).click();
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  expect(errors).toEqual([]);
});
test("AI responds and settings persist", async ({ page }, info) => {
  await page.goto("/");
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  const canvas = page.locator("canvas");
  await canvas.focus();
  // Initial software WebGL uploads precede Worker startup. Bound that separately
  // from the AI response instead of charging both to the default 5s assertion.
  const began = Date.now();
  const worker = page.waitForEvent("worker", { timeout: 15000 });
  await page.keyboard.press("Enter");
  await worker;
  await info.attach("ai-worker-start-delay", {
    body: JSON.stringify({ elapsedMs: Date.now() - began }),
    contentType: "application/json",
  });
  await expect(page.locator("#move-count")).toHaveText("2수");
  await expect(page.locator("#turn")).toContainText("흑돌");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("착수 효과음").uncheck();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByLabel("착수 효과음")).not.toBeChecked();
});

test("five difficulties, white opening, next-game policy and persisted preferences", async ({
  page,
}, info) => {
  await page.goto("/");
  await selectGame(page);
  await expect(page.locator("#ai-options")).toBeHidden();
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("normal");
  await expect(page.getByLabel("AI 난이도").locator("option")).toHaveCount(5);
  await page.getByLabel("AI 난이도").selectOption("hard");
  await page.getByLabel("플레이어 색상").selectOption("white");
  await page.screenshot({
    path: `test-results/${info.project.name}-ai-options.png`,
    fullPage: true,
  });
  await page.reload();
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("hard");
  await expect(page.getByLabel("플레이어 색상")).toHaveValue("white");
  await selectGame(page);
  const openingWorker = page.waitForEvent("worker", { timeout: 15000 });
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await openingWorker;
  await expect(page.locator(".player").first()).toContainText(
    "컴퓨터 · 어려움",
  );
  await expect(page.locator("#move-count")).toHaveText("1수");
  await expect(page.locator("#turn")).toContainText("백돌");
  await page.getByRole("button", { name: "컬렉션", exact: false }).click();
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("AI 난이도").selectOption("beginner");
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await expect(page.locator(".player").first()).toContainText(
    "컴퓨터 · 어려움",
  );
  await page.getByRole("button", { name: "다시 시작", exact: true }).click();
  const restartWorker = page.waitForEvent("worker", { timeout: 15000 });
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await restartWorker;
  await expect(page.locator(".player").first()).toContainText("컴퓨터 · 입문");
  await expect(page.locator("#move-count")).toHaveText("1수");
});

const thinkingSession = {
  version: 2,
  mode: "ai",
  difficulty: "expert",
  human: 2,
  moves: [
    { row: 7, col: 7, player: 1 },
    { row: 6, col: 7, player: 2 },
    { row: 8, col: 8, player: 1 },
    { row: 8, col: 7, player: 2 },
    { row: 6, col: 6, player: 1 },
    { row: 9, col: 9, player: 2 },
    { row: 5, col: 7, player: 1 },
    { row: 9, col: 6, player: 2 },
  ],
};
test("expert Worker keeps animation frames alive; menu and restart discard old work", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto("/");
  await page.evaluate(
    (s) => localStorage.setItem("wtg.session.v1", JSON.stringify(s)),
    thinkingSession,
  );
  await page.reload();
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await expect(page.locator("#turn")).toContainText("컴퓨터가 생각 중");
  await expect
    .poll(() => workers.length, { timeout: 10000 })
    .toBeGreaterThan(0);
  const ticks = await page.evaluate(async () => {
    const gaps: number[] = [];
    let last = performance.now(),
      alive = true;
    function tick(t: number) {
      gaps.push(t - last);
      last = t;
      if (alive) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 1600));
    alive = false;
    return { count: gaps.length, max: Math.max(...gaps) };
  });
  await info.attach("worker-frame-measurement", {
    body: JSON.stringify(ticks),
    contentType: "application/json",
  });
  expect(workers.length).toBeGreaterThan(0);
  expect(ticks.count).toBeGreaterThan(5);
  expect(ticks.max).toBeLessThan(1000);
  await expect(page.locator("#move-count")).toHaveText("9수", {
    timeout: 10000,
  });
  // Start another expert calculation, then leave for a fresh local game.
  await page.getByRole("button", { name: "컬렉션", exact: false }).click();
  await page.evaluate(
    (s) => localStorage.setItem("wtg.session.v1", JSON.stringify(s)),
    thinkingSession,
  );
  await page.reload();
  const beforeRestart = workers.length;
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await expect
    .poll(() => workers.length, { timeout: 10000 })
    .toBeGreaterThan(beforeRestart);
  await page.getByRole("button", { name: "다시 시작", exact: true }).click();
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  await page.waitForTimeout(3400);
  await expect(page.locator("#move-count")).toHaveText("0수");
  await page.getByRole("button", { name: "컬렉션", exact: false }).click();
  await page.evaluate(
    (s) => localStorage.setItem("wtg.session.v1", JSON.stringify(s)),
    thinkingSession,
  );
  await page.reload();
  const beforeMenu = workers.length;
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await expect
    .poll(() => workers.length, { timeout: 10000 })
    .toBeGreaterThan(beforeMenu);
  await page.getByRole("button", { name: "컬렉션", exact: false }).click();
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.waitForTimeout(3400);
  await expect(page.locator("#move-count")).toHaveText("0수");
});

test("random color is resolved once and retained when resuming", async ({
  page,
}) => {
  await page.goto("/");
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("플레이어 색상").selectOption("random");
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  // Do not stub global Math.random: Three.js uses it for resource identifiers.
  const human = await page.evaluate(
    () => JSON.parse(localStorage.getItem("wtg.session.v1")!).human,
  );
  expect([1, 2]).toContain(human);
  await expect(page.locator("#move-count")).toHaveText(
    human === 2 ? "1수" : "0수", { timeout: 15000 },
  );
  await page.reload();
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await expect(page.locator(".player").nth(human - 1)).toContainText("나");
  await expect(page.locator("#move-count")).toHaveText(human === 2 ? "1수" : "0수");
});

test("AI selection remains usable when storage writes are blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => {
      throw new Error("Storage disabled");
    };
  });
  await page.goto("/");
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("AI 난이도").selectOption("expert");
  await page.getByLabel("플레이어 색상").selectOption("white");
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.locator(".player").first()).toContainText(
    "컴퓨터 · 전문가",
  );
  await expect(page.locator("#move-count")).toHaveText("1수");
  await expect(page.locator("#save-status")).toContainText(
    "저장을 사용할 수 없습니다",
  );
});
