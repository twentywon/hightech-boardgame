import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import type { Square } from "chess.js";
import { selectGame } from "./library";
import { toWorld } from "../../src/games/chess/coordinates";
import { SUBJECTS, cameraDistance } from "../../src/engine/camera";
async function ready(page: Page) {
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", {
    timeout: 20000,
  });
  await expect(page.locator("#board")).toHaveAttribute(
    "data-animating",
    "false",
    { timeout: 10000 },
  );
}
async function start(page: Page) {
  await page.goto("/");
  await selectGame(page, "체스");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await ready(page);
}
async function cell(page: Page, s: Square) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    top = (await page.locator("#board").getAttribute("data-top")) === "true",
    d = cameraDistance(aspect, top, SUBJECTS.chess);
  const
    black = (await page.locator("#board").getAttribute("data-facing")) === "b",
    a = top ? Math.PI / 2 - 0.001 : (55 * Math.PI) / 180;
  const c = new PerspectiveCamera(38, aspect, 0.1, 80);
  c.position.set(0, Math.sin(a) * d, Math.cos(a) * d * (black ? -1 : 1));
  c.lookAt(0, 0.1, 0);
  c.updateMatrixWorld();
  const p = toWorld(s),
    v = new Vector3(p.x, 0.21, p.z).project(c);
  return {
    x: box.x + ((v.x + 1) * box.width) / 2,
    y: box.y + ((1 - v.y) * box.height) / 2,
  };
}
async function tap(page: Page, s: Square, info: TestInfo) {
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const p = await cell(page, s);
  if (info.project.name === "mobile") await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}
async function move(page: Page, from: Square, to: Square, info: TestInfo) {
  await ready(page);
  const before = Number(
    (await page.locator("#move-count").textContent())!.replace("수", ""),
  );
  await tap(page, from, info);
  await tap(page, to, info);
  if (info.project.name === "mobile") {
    await expect(page.locator("#move-count")).toHaveText(`${before}수`);
    await page.locator("#confirm").click();
  }
  await expect(page.locator("#move-count")).toHaveText(`${before + 1}수`);
  await ready(page);
}

test("chess inline setup, actual mouse/touch capture, orientation, restart and other games", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".game-card[aria-expanded=false]")).toHaveCount(5);
  await expect(page.getByRole("button", { name: "개발 예정" })).toHaveCount(0);
  await selectGame(page, "체스");
  await expect(
    page.getByRole("heading", { name: /함께 앉으면/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("img", { name: "체스판 미리보기" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await ready(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await move(page, "e2", "e4", info);
  await move(page, "d7", "d5", info);
  await move(page, "e4", "d5", info);
  await expect(page.locator("#chess-history")).toContainText("exd5");
  await expect(page.locator("#chess-captured")).toContainText("♟");
  const p = await cell(page, "e8");
  await page.mouse.click(p.x, p.y, { button: "right" });
  await expect(page.locator("#move-count")).toHaveText("3수");
  await page.screenshot({
    path: `test-results/${info.project.name}-chess.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "보드 방향 전환", exact: true })
    .click();
  await ready(page);
  await move(page, "e7", "e6", info);
  await page.getByRole("button", { name: "시점 전환", exact: true }).click();
  await ready(page);
  await move(page, "g1", "f3", info);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "다시 시작", exact: true }).click();
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    "3D 오목판",
  );
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page, "리버시");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    "3D 리버시판",
  );
  expect(errors).toEqual([]);
});

test("chess AI stays responsive, cancels old work and applies settings only to a new game", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await page.goto("/");
  await selectGame(page, "체스");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("normal");
  await expect(page.getByLabel("플레이어 색상")).toHaveValue("white");
  await page.getByLabel("AI 난이도").selectOption("expert");
  await page.getByLabel("플레이어 색상").selectOption("black");
  const worker = page.waitForEvent("worker");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await worker;
  await expect(page.locator(".player").first()).toContainText(
    "컴퓨터 · 전문가",
  );
  const ticks = await page.evaluate(async () => {
    let running = true,
      last = performance.now();
    const gaps: number[] = [];
    const tick = (t: number) => {
      gaps.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await new Promise((r) => setTimeout(r, 1000));
    running = false;
    return { frames: gaps.length, maxGap: Math.max(...gaps) };
  });
  await info.attach("chess-worker-frames", {
    body: JSON.stringify(ticks),
    contentType: "application/json",
  });
  expect(ticks.frames).toBeGreaterThan(5);
  expect(ticks.maxGap).toBeLessThan(1000);
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.waitForTimeout(3200);
  await expect(page.locator("#move-count")).toHaveText("0수");
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page, "체스");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("AI 난이도").selectOption("easy");
  await page.getByLabel("플레이어 색상").selectOption("white");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await ready(page);
  await tap(page, "e2", info);
  await tap(page, "e4", info);
  if (info.project.name === "mobile") await page.locator("#confirm").click();
  await expect(page.locator("#move-count")).toHaveText("2수", {
    timeout: 15000,
  });
  await page.getByRole("button", { name: "대국 설정", exact: true }).click();
  await page.getByLabel("AI 난이도").selectOption("expert");
  await page.getByLabel("플레이어 색상").selectOption("black");
  await page.getByRole("button", { name: "설정 적용", exact: true }).click();
  await expect(page.locator(".player").last()).toContainText("컴퓨터 · 쉬움");
  await expect(page.locator("#move-count")).toHaveText("2수");
  const freshWorker = page.waitForEvent("worker");
  await page.getByRole("button", { name: "다시 시작", exact: true }).click();
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await freshWorker;
  await expect(page.locator(".player").first()).toContainText(
    "컴퓨터 · 전문가",
  );
  await expect(page.locator("#move-count")).toHaveText("1수", {
    timeout: 15000,
  });
  await info.attach("chess-search-time", {
    body: JSON.stringify({
      ms: await page.locator("#turn").getAttribute("data-search-ms"),
    }),
    contentType: "application/json",
  });
});

test("chess underpromotion can be cancelled; reload has no saved game or preferences", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await start(page);
  await page.evaluate(() => {
    (window as unknown as { chessWrites: string[] }).chessWrites = [];
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      (window as unknown as { chessWrites: string[] }).chessWrites.push(k);
      original.call(this, k, v);
    };
  });
  for (const [from, to] of [
    ["a2", "a4"],
    ["b7", "b5"],
    ["a4", "b5"],
    ["a7", "a6"],
    ["b5", "b6"],
    ["a6", "a5"],
    ["b6", "b7"],
    ["a5", "a4"],
  ] as [Square, Square][])
    await move(page, from, to, info);
  await tap(page, "b7", info);
  await tap(page, "a8", info);
  if (info.project.name === "mobile") await page.locator("#confirm").click();
  await expect(
    page.getByRole("heading", { name: "프로모션 기물을 선택하세요" }),
  ).toBeVisible();
  await expect(page.locator("#move-count")).toHaveText("8수");
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await tap(page, "b7", info);
  await tap(page, "a8", info);
  if (info.project.name === "mobile") await page.locator("#confirm").click();
  await page.getByRole("button", { name: /나이트/ }).click();
  await expect(page.locator("#chess-history")).toContainText("bxa8=N");
  await expect(page.locator("#move-count")).toHaveText("9수");
  expect(
    await page.evaluate(
      () => (window as unknown as { chessWrites: string[] }).chessWrites,
    ),
  ).toEqual([]);
  await page.reload();
  await expect(page.locator(".featured")).toHaveCount(0);
  await selectGame(page, "체스");
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await expect(page.getByLabel("AI 난이도")).toHaveValue("normal");
  await expect(page.getByLabel("플레이어 색상")).toHaveValue("white");
  await expect(page.getByRole("button", { name: /이어하기/ })).toHaveCount(0);
});

test("chess planned-move repetition claim ends the game without executing the declared move", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  await start(page);
  for (const [from, to] of [
    ["g1", "f3"],
    ["g8", "f6"],
    ["f3", "g1"],
    ["f6", "g8"],
    ["g1", "f3"],
    ["g8", "f6"],
    ["f3", "g1"],
  ] as [Square, Square][])
    await move(page, from, to, info);
  await tap(page, "f6", info);
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect(page.locator("#chess-claim-info")).toContainText("예정 수");
  await page.getByRole("button", { name: "무승부 청구", exact: true }).click();
  await expect(page.locator("#turn")).toContainText("무승부");
  await expect(page.locator("#move-count")).toHaveText("7수");
  await expect(page.getByRole("button", { name: "게임판 보기" })).toBeVisible();
  await page.getByRole("button", { name: "게임판 보기" }).click();
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await page.waitForTimeout(300);
  await expect(page.locator("dialog")).toHaveCount(0);
});
