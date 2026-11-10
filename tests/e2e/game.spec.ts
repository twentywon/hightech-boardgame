import { test, expect } from "@playwright/test";
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
  await expect(page.getByRole("button", { name: "개발 예정" })).toHaveCount(4);
  await page.screenshot({
    path: `test-results/${info.project.name}-menu.png`,
    fullPage: true,
  });
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
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await expect(page.locator("#move-count")).toHaveText("1수");
  await page.getByRole("button", { name: "시점 전환" }).click();
  await page.waitForTimeout(550);
  await page.getByRole("button", { name: "다시 시작", exact: true }).click();
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  expect(errors).toEqual([]);
});
test("AI responds and settings persist", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  const canvas = page.locator("canvas");
  await canvas.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#move-count")).toHaveText("2수");
  await expect(page.locator("#turn")).toContainText("흑돌");
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await page.getByLabel("착수 효과음").uncheck();
  await page.getByRole("button", { name: "설정 저장" }).click();
  await page.reload();
  await page.getByRole("button", { name: "설정", exact: true }).click();
  await expect(page.getByLabel("착수 효과음")).not.toBeChecked();
});
