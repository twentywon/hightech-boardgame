import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";
import { PerspectiveCamera, Vector3 } from "three";
import { toWorld } from "../../src/games/reversi/coordinates";
import { SUBJECTS, cameraDistance } from "../../src/engine/camera";
import {
  counts,
  legalMoves,
  point,
  other,
} from "../../src/games/reversi/rules";
import {
  encode,
  SESSION_KEY,
  OPTIONS_KEY,
} from "../../src/games/reversi/storage";
import { playout, findPassHistory } from "../reversi-fixtures";
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
test("Reversi actual WebGL mouse/touch flips, save, camera, restart and game selection", async ({
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
  await page.reload();
  await open(page);
  await page.getByRole("button", { name: "리버시 이어하기" }).click();
  await expect(page.locator("#black-count")).toHaveText("4");
  const before = await page.locator("canvas").screenshot();
  await page.getByRole("button", { name: "시점 전환" }).click();
  await page.waitForTimeout(550);
  expect((await page.locator("canvas").screenshot()).equals(before)).toBe(
    false,
  );
  await page.getByRole("button", { name: "다시 시작", exact: true }).click();
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.locator("#move-count")).toHaveText("0수");
  await expect(page.locator("#black-count")).toHaveText("2");
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
  await page.getByRole("button", { name: "대국 설정" }).click();
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("AI 난이도").selectOption("hard");
  await page.getByRole("button", { name: "리버시 이어하기" }).click();
  await expect(page.locator(".player").first()).toContainText("컴퓨터 · 쉬움");
  await page.getByRole("button", { name: "다시 시작", exact: true }).click();
  const restartWorker = page.waitForEvent("worker", { timeout: 15000 });
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await restartWorker;
  await expect(page.locator(".player").first()).toContainText(
    "컴퓨터 · 어려움",
  );
  await expect(page.locator("#move-count")).toHaveText("1수", {
    timeout: 15000,
  });
});
test("Reversi auto-pass announcement and validated saved history", async ({
  page,
}) => {
  const state = findPassHistory();
  await page.goto("/");
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: SESSION_KEY,
    value: encode({ state, mode: "local", difficulty: "normal", human: 1 }),
  });
  await open(page);
  await page.getByRole("button", { name: "리버시 이어하기" }).click();
  await expect(page.locator("#pass-notice")).toContainText("자동 패스");
  await expect(page.locator("#turn")).toContainText(
    state.turn === 1 ? "흑돌" : "백돌",
  );
  const c = counts(state.board);
  await expect(page.locator("#black-count")).toHaveText(String(c.black));
  await expect(page.locator("#white-count")).toHaveText(String(c.white));
  await page.locator("canvas").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#move-count")).toHaveText(
    `${state.moves.length + 1}수`,
  );
});
test("actual Workers stay responsive and are cancelled when switching both games", async ({
  page,
}, info) => {
  test.setTimeout(90000);
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem(
      "wtg.session.v1",
      JSON.stringify({
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
      }),
    ),
  );
  await page.reload();
  const gWorker = page.waitForEvent("worker");
  await selectGame(page);
  await page.getByRole("button", { name: "저장한 게임 이어하기" }).click();
  await gWorker;
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await open(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.waitForTimeout(3400);
  await expect(page.locator("#move-count")).toHaveText("0수");
  await expect(page.locator("#black-count")).toHaveText("2");
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  const state = playout(5, 40);
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), {
    key: SESSION_KEY,
    value: encode({
      state,
      mode: "ai",
      difficulty: "expert",
      human: other(state.turn),
    }),
  });
  await open(page);
  const rWorker = page.waitForEvent("worker");
  await page.getByRole("button", { name: "리버시 이어하기" }).click();
  await rWorker;
  await page.bringToFront();
  expect(await page.evaluate(() => document.visibilityState)).toBe("visible");
  const ticks = await page.evaluate(async () => {
    const began = performance.now();
    let heartbeats = 0;
    const interval = setInterval(() => heartbeats++, 30);
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
    clearInterval(interval);
    return {
      count: gaps.length,
      max: Math.max(...gaps),
      heartbeats,
      durationMs: performance.now() - began,
      visibility: document.visibilityState,
    };
  });
  await info.attach("reversi-worker-frames", {
    body: JSON.stringify(ticks),
    contentType: "application/json",
  });
  expect(ticks.count).toBeGreaterThan(5);
  expect(ticks.max).toBeLessThan(1000);
  await page.getByRole("button", { name: "World Table Games 홈" }).click();
  await selectGame(page);
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await page.waitForTimeout(3400);
  await expect(page.locator("#move-count")).toHaveText("0수");
  await expect(page.locator("canvas")).toHaveAttribute(
    "aria-label",
    "3D 오목판",
  );
});
test("Reversi random color stays resolved across resume and storage failure is safe", async ({
  page,
}) => {
  await page.goto("/");
  await open(page);
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("플레이어 색상").selectOption("random");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  const human = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!).human,
    SESSION_KEY,
  );
  expect([1, 2]).toContain(human);
  await expect(page.locator("#move-count")).toHaveText(
    human === 2 ? "1수" : "0수",
    { timeout: 15000 },
  );
  await page.reload();
  await open(page);
  await page.getByRole("button", { name: "리버시 이어하기" }).click();
  await expect(page.locator(".player").nth(human - 1)).toContainText("나");
  await page.getByRole("button", { name: "대국 설정" }).click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw Error("Storage disabled");
    };
  });
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.getByLabel("AI 난이도").selectOption("expert");
  await page.getByLabel("플레이어 색상").selectOption("white");
  await page.getByRole("button", { name: "테이블에 앉기" }).click();
  await expect(page.locator(".player").first()).toContainText(
    "컴퓨터 · 전문가",
  );
  await expect(page.locator("#move-count")).toHaveText("1수", {
    timeout: 15000,
  });
  await expect(page.locator("#save-status")).toContainText(
    "저장을 사용할 수 없습니다",
  );
});
