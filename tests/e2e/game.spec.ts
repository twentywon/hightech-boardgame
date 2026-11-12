import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";
test("menu, actual WebGL moves, camera and the new-game dialog", async ({
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
  // Nothing is kept across a reload: no game is offered to continue.
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
  const angled = await page.locator("canvas").screenshot();
  await page.getByRole("button", { name: "시점 전환" }).click();
  await page.waitForTimeout(550);
  const overhead = await page.locator("canvas").screenshot();
  expect(overhead.equals(angled)).toBe(false);
  // The new-game dialog can be left without losing the game.
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.getByRole("dialog").getByLabel("삼삼(3-3) 허용")).toBeChecked();
  await page.getByRole("dialog").getByRole("button", { name: "계속하기" }).click();
  await expect(page.locator("#move-count")).toHaveText("1수");
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "새 게임 시작" }).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  await expect(page.getByRole("button", { name: /힌트/ })).toHaveCount(0);
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
  // The dialog opens on the mode being played and applies its choices to the next game.
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("컴퓨터 대전", { exact: true })).toBeChecked();
  await dialog.getByLabel("AI 난이도").selectOption("beginner");
  const restartWorker = page.waitForEvent("worker", { timeout: 15000 });
  await dialog.getByRole("button", { name: "새 게임 시작" }).click();
  await restartWorker;
  await expect(page.locator(".player").first()).toContainText("컴퓨터 · 입문");
  await expect(page.locator("#move-count")).toHaveText("1수");
});

/** Sits down against the expert as black and plays the centre, so that it starts thinking. */
async function provoke(page: Page) {
  await selectGame(page);
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
// @alone: it measures how evenly frames come, which other browsers running beside it would spoil.
test("expert Worker keeps animation frames alive; menu and a new game discard old work @alone", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  const workers: string[] = [];
  page.on("worker", (worker) => workers.push(worker.url()));
  await page.goto("/");
  await provoke(page);
  await expect
    .poll(() => workers.length, { timeout: 15000 })
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
  expect(ticks.count).toBeGreaterThan(5);
  expect(ticks.max).toBeLessThan(1000);
  await expect(page.locator("#move-count")).toHaveText("2수", { timeout: 20000 });
  // Start another expert calculation, then begin a fresh local game from the dialog.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(async () => {
    await page.keyboard.press("Enter");
    await expect(page.locator("#move-count")).toHaveText("3수", { timeout: 500 });
  }).toPass({ timeout: 15000 });
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await page.getByRole("dialog").getByLabel("로컬 2인", { exact: true }).check();
  await page.getByRole("dialog").getByRole("button", { name: "새 게임 시작" }).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  await page.waitForTimeout(3400);
  await expect(page.locator("#move-count")).toHaveText("0수");
  // The same when leaving for the collection in the middle of a search.
  await page.getByRole("button", { name: "컬렉션", exact: false }).click();
  await provoke(page);
  await page.getByRole("button", { name: "컬렉션", exact: false }).click();
  await selectGame(page);
  await page.getByLabel("로컬 2인", { exact: true }).check();
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.waitForTimeout(3400);
  await expect(page.locator("#move-count")).toHaveText("0수");
});

test("random color is resolved once for the game", async ({ page }) => {
  await page.goto("/");
  await selectGame(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("플레이어 색상").selectOption("random");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  // Do not stub global Math.random: Three.js uses it for resource identifiers.
  const black = await page.locator(".player").first().textContent();
  const human = black!.includes("나") ? 1 : 2;
  await expect(page.locator(".player").nth(human - 1)).toContainText("나");
  await expect(page.locator(".player").nth(2 - human)).toContainText("컴퓨터");
  await expect(page.locator("#move-count")).toHaveText(
    human === 2 ? "1수" : "0수", { timeout: 15000 },
  );
});

test("with the double three refused, the meeting point of two open threes cannot be played", async ({ page }) => {
  await page.goto("/");
  await selectGame(page);
  await page.getByLabel("삼삼(3-3) 허용").uncheck();
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.locator(".board-label")).toContainText("삼삼 금지");
  await page.locator("canvas").focus();
  const count = page.locator("#move-count");
  /** Walks the cursor from the centre and places a stone there. */
  const put = async (keys: string[], moves: number) => {
    // Past the input lock, so that no key of the walk is dropped.
    await page.waitForTimeout(450);
    await expect(async () => {
      for (const key of keys) await page.keyboard.press(key);
      await page.keyboard.press("Enter");
      await expect(count).toHaveText(`${moves}수`, { timeout: 500 });
    }).toPass({ timeout: 15000 });
  };
  const far = (side: string) => Array<string>(5).fill(side);
  await put(["ArrowUp"], 1);
  await put(far("ArrowLeft"), 2);
  await put(["ArrowDown"], 3);
  await put([...far("ArrowLeft"), "ArrowUp"], 4);
  await put(["ArrowLeft"], 5);
  await put([...far("ArrowLeft"), "ArrowDown"], 6);
  await put(["ArrowRight"], 7);
  await put(far("ArrowRight"), 8);
  // The centre would make an open three across and another down.
  await page.waitForTimeout(450);
  await page.keyboard.press("Enter");
  await expect(page.locator("#turn")).toContainText("삼삼 금지");
  await expect(count).toHaveText("8수");
  // One open three alone is allowed.
  await put(["ArrowUp", "ArrowUp"], 9);
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
});
