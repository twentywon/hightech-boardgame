import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { loadShuffles } from "./betting-helpers";
import { FOV, cameraDistance, type Subject } from "../../src/engine/camera";
import { checkersBoard } from "../../src/games/checkers/board";
import { dotsPoints } from "../../src/games/dots/config";
import { hexLayout } from "../../src/games/hex/config";
import { paperPlace, paperSubject } from "../../src/games/paper/view";
import { MANCALA_SUBJECT, pitAt } from "../../src/games/mancala/view";
import { SPIDER_SUBJECT, columnSpots, stockSpot } from "../../src/games/spider/layout";

const settled = (page: Page) =>
  expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 20000 });
const turn = (page: Page) => page.locator("#turn");
const moves = (page: Page) => page.locator("#move-count");
const die = (...faces: number[]) => faces.map((f) => (f - 0.5) / 6);
async function sit(page: Page, game: string, mode: "local" | "ai", variant?: string) {
  await page.goto("/");
  await selectGame(page, game);
  await page.locator(`input[name=pg-mode][value=${mode}]`).check();
  if (variant) await page.locator("#pg-variant").selectOption(variant);
  await page.getByRole("button", { name: /앉기|펴기/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  await page.locator("canvas").scrollIntoViewIfNeeded();
}
/** Taps the ground point (x, z) as the view's camera shows it. */
async function tap(page: Page, subject: Subject & { tilt: number }, x: number, z: number, mobile: boolean, y = 0) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(camera),
    px = box.x + ((v.x + 1) * box.width) / 2,
    py = box.y + ((1 - v.y) * box.height) / 2;
  if (mobile) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}

test("checkers: a step, a forced capture and the computer's answer", async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mobile = info.project.name === "mobile",
    board = checkersBoard(),
    go = async (square: number) => {
      await tap(page, board.subject, board.points[square].x, board.points[square].z, mobile);
      await settled(page);
    };
  await sit(page, "체커", "local");
  await expect(page.locator("#pg-count-0")).toHaveText("말 12 · 왕 0");
  // Red 42→33 and white 19→26 meet: red must take, and any other move is refused.
  await go(42);
  await go(33);
  await expect(moves(page)).toHaveText("1수");
  await go(19);
  await go(26);
  await expect(turn(page)).toContainText("잡을 수 있으면 반드시 잡아야 합니다");
  await go(44);
  await go(35);
  await expect(moves(page)).toHaveText("2수");
  // Red's 33 jumps white's 26 and lands on 19.
  await go(33);
  await go(19);
  await expect(moves(page)).toHaveText("3수");
  await expect(page.locator("#pg-count-1")).toHaveText("말 11 · 왕 0");
  // White takes back: 10 jumps 19 and lands on 28.
  await go(10);
  await go(28);
  await expect(moves(page)).toHaveText("4수");
  await expect(page.locator("#pg-count-0")).toHaveText("말 11 · 왕 0");
  await page.screenshot({ path: `test-results/${info.project.name}-checkers.png`, fullPage: true });
  await sit(page, "체커", "ai");
  await go(42);
  await go(33);
  await expect(moves(page)).toHaveText("2수", { timeout: 20000 });
  expect(errors).toEqual([]);
});

test("the notebook: dots and boxes closes a box for another turn, hex colours a cell", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mobile = info.project.name === "mobile";
  // Hex fills its page, with the pencils in a corner; dots and boxes keeps them beside it.
  const mark = async (point: { x: number; z: number }, corner = false) => {
    const p = paperPlace(point, corner);
    await tap(page, paperSubject(corner), p.x, p.z, mobile, 0.07);
    await settled(page);
  };
  await sit(page, "도츠 앤 박시스", "local", "3");
  await expect(page.locator(".side-mode")).toContainText("네모 3 × 3");
  const lines = dotsPoints(3);
  // Lines 0, 3 and 12 leave box 0 open on its right side (13).
  for (const line of [0, 3, 12]) await mark(lines[line]);
  await expect(moves(page)).toHaveText("3수");
  await expect(turn(page)).toContainText("파랑 (플레이어 2) 차례");
  await mark(lines[13]);
  await expect(page.locator("#pg-count-1")).toHaveText("네모 1");
  // Blue closed the box and draws again.
  await expect(turn(page)).toContainText("파랑 (플레이어 2) 차례");
  // A line already drawn is refused.
  await mark(lines[13]);
  await expect(moves(page)).toHaveText("4수");
  await page.locator("#pg-undo").click();
  await expect(page.locator("#pg-count-1")).toHaveText("네모 0");
  await page.screenshot({ path: `test-results/${info.project.name}-dots.png`, fullPage: true });
  await sit(page, "헥스", "ai", "7");
  await expect(page.locator(".side-mode")).toContainText("7 × 7");
  await mark(hexLayout(7).points[24], true);
  await expect(moves(page)).toHaveText("2수", { timeout: 30000 });
  await expect(page.locator("#pg-count-0")).toHaveText("칸 1");
  await expect(page.locator("#pg-count-1")).toHaveText("칸 1");
  await page.screenshot({ path: `test-results/${info.project.name}-hex.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("mancala in the market: sowing into my store keeps the turn", async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mobile = info.project.name === "mobile",
    sow = async (pit: number) => {
      const p = pitAt(pit);
      await tap(page, MANCALA_SUBJECT, p.x, p.z, mobile, 0.56);
      await settled(page);
    };
  await sit(page, "만칼라", "local");
  await expect(page.locator("#pg-count-0")).toHaveText("창고 0");
  // Four stones from my third pit end in my store.
  await sow(2);
  await expect(moves(page)).toHaveText("1수");
  await expect(page.locator("#pg-count-0")).toHaveText("창고 1");
  await expect(turn(page)).toContainText("아래쪽 (플레이어 1) 차례");
  // The other side's pits are not mine to sow.
  await sow(9);
  await expect(moves(page)).toHaveText("1수");
  await sow(5);
  await expect(turn(page)).toContainText("위쪽 (플레이어 2) 차례");
  await page.screenshot({ path: `test-results/${info.project.name}-mancala.png`, fullPage: true });
  await sit(page, "만칼라", "ai");
  await sow(0);
  await expect(turn(page)).toContainText("나 (아래쪽) 차례", { timeout: 30000 });
  expect(Number((await moves(page).textContent())!.replace("수", ""))).toBeGreaterThanOrEqual(2);
  expect(errors).toEqual([]);
});

test("snakes and ladders: the die walks the token and a ladder lifts it", async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Red rolls 3 (the ladder to 22); blue rolls 6 and, rolling again, 2.
  await loadShuffles(page, die(3, 6, 2));
  await sit(page, "뱀과 사다리", "local");
  await expect(page.locator("#pg-undo")).toBeHidden();
  await page.locator("#pg-action").click();
  await settled(page);
  await expect(page.locator("#pg-count-0")).toHaveText("22번 칸");
  await expect(turn(page)).toContainText("파랑 (플레이어 2) 차례");
  // A tap on the board rolls as well.
  // Clear of the back and settings buttons in the corner.
  await page.locator("canvas").click({ position: { x: 240, y: 160 } });
  await settled(page);
  await expect(page.locator("#pg-count-1")).toHaveText("6번 칸");
  await expect(turn(page)).toContainText("6이 나왔습니다. 한 번 더 굴리세요.");
  await page.locator("#pg-action").click();
  await settled(page);
  await expect(page.locator("#pg-count-1")).toHaveText("30번 칸");
  await page.screenshot({ path: `test-results/${info.project.name}-snakes.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("spider solitaire: a hint, a card dragged to its column, undo and a new row", async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mobile = info.project.name === "mobile";
  // One fixed shuffle, so the same cards come every time.
  await loadShuffles(page, Array.from({ length: 103 }, (_, i) => ((i * 37) % 101) / 101));
  await page.goto("/");
  await selectGame(page, "스파이더");
  await expect(page.getByLabel("무늬 수")).toHaveValue("1");
  await page.getByRole("button", { name: /테이블에 앉기/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  await page.locator("canvas").scrollIntoViewIfNeeded();
  await expect(page.locator("#sp-done")).toHaveText("0 / 8");
  await expect(page.locator("#sp-stock")).toHaveText("5번");
  await expect(page.locator("#sp-undo")).toBeDisabled();
  // The hint names a card and a column; drag that card there.
  const lengths = [6, 6, 6, 6, 5, 5, 5, 5, 5, 5];
  const spotOf = async (column: number, dz = 0.4) => {
    const cards = Array.from({ length: lengths[column] }, (_, i) => ({ id: i, rank: 1, suit: 0, up: i === lengths[column] - 1 })),
      spot = columnSpots(cards, column)[lengths[column] - 1],
      box = (await page.locator("canvas").boundingBox())!,
      aspect = box.width / box.height,
      d = cameraDistance(aspect, false, SPIDER_SUBJECT),
      camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
    camera.position.set(0, Math.sin(SPIDER_SUBJECT.tilt) * d, Math.cos(SPIDER_SUBJECT.tilt) * d);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const v = new Vector3(spot.x, 0.03, spot.z + dz).project(camera);
    return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
  };
  const drag = async (from: number, to: number) => {
    const a = await spotOf(from),
      b = await spotOf(to, 0.9);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await settled(page);
  };
  await page.locator("#sp-hint").click();
  const advice = (await turn(page).textContent())!.match(/(\d+)번째 줄의 카드를 (\d+)번째 줄로/)!;
  expect(advice).not.toBeNull();
  const [from, to] = [Number(advice[1]) - 1, Number(advice[2]) - 1];
  // Let go over a column that cannot take it: the card slides back.
  const wrong = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].find((c) => c !== from && c !== to)!;
  await drag(from, wrong);
  await page.locator("#sp-hint").click();
  if ((await turn(page).textContent())!.includes(`${from + 1}번째 줄의 카드를 ${to + 1}번째 줄로`)) await expect(moves(page)).toHaveText("0수");
  // A click without a drag moves nothing.
  const still = await spotOf(from);
  await page.mouse.click(still.x, still.y);
  await expect(moves(page)).toHaveText("0수");
  await drag(from, to);
  await expect(moves(page)).toHaveText("1수");
  await page.locator("#sp-undo").click();
  await expect(moves(page)).toHaveText("0수");
  // The stock on the table deals a row, like the button.
  await expect(async () => {
    if ((await page.locator("#sp-stock").textContent()) === "5번") await tap(page, SPIDER_SUBJECT, stockSpot.x, stockSpot.z, mobile, 0.05);
    await settled(page);
    await expect(page.locator("#sp-stock")).toHaveText("4번", { timeout: 1000 });
  }).toPass({ timeout: 15000 });
  await page.locator("#sp-deal").click();
  await settled(page);
  await expect(page.locator("#sp-stock")).toHaveText("3번");
  await expect(moves(page)).toHaveText("2수");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-spider.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("world tour: buy a city, the computer takes its turn, a building goes up", async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // I roll 1 and 2 and reach Bangkok; the computer rolls 2 and 3 to the space that pays out the fund.
  await loadShuffles(page, die(1, 2, 2, 3));
  await page.goto("/");
  await selectGame(page, "세계 일주");
  await page.getByLabel("컴퓨터 수").selectOption("1");
  await page.getByRole("button", { name: /여행 떠나기/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  await expect(page.locator("#tour-money-0")).toContainText("2,000 · 도시 0 · 출발");
  await expect(page.locator("#tour-offer")).toBeHidden();
  await page.locator("#tour-roll").click();
  await settled(page);
  // The offer comes up as a dialog.
  await expect(page.getByRole("heading", { name: "방콕을(를) 살까요?" })).toBeVisible();
  await expect(turn(page)).toContainText("방콕을(를) 80에 살 수 있습니다");
  await page.locator("dialog").getByRole("button", { name: "사기 (80)" }).click();
  await expect(page.locator("#tour-money-0")).toContainText("1,920 · 도시 1 · 방콕");
  // The turn is mine until I end it: the deeds can be opened and a place sold.
  const end = page.locator("#tour-end");
  await expect(end).toBeVisible();
  await expect(page.locator("#tour-roll")).toBeHidden();
  await page.getByRole("button", { name: "나의 땅 증서 보기" }).click();
  await expect(page.locator("dialog .deed-list li")).toHaveCount(1);
  await expect(page.locator("dialog .deed-list")).toContainText("방콕");
  // Bare land in Bangkok: the stay costs one and a half times its price.
  await expect(page.locator("dialog .deed-list")).toContainText("숙박료 120");
  await expect(page.locator("dialog [data-sell]")).toHaveCount(1);
  await page.locator("dialog").getByRole("button", { name: "닫기" }).click();
  // The button lies inside the board.
  const inside = await page.evaluate(() => {
    const b = document.getElementById("tour-end")!.getBoundingClientRect(),
      a = document.querySelector(".board-area")!.getBoundingClientRect();
    return b.left >= a.left && b.right <= a.right && b.top >= a.top && b.bottom <= a.bottom;
  });
  expect(inside).toBe(true);
  await end.click();
  await expect(end).toBeHidden();
  // The computer rolls by itself and reaches the empty fund.
  await expect(page.locator("#tour-money-1")).toContainText("2,000 · 도시 0 · 기금 수령", { timeout: 20000 });
  await expect(page.locator("#tour-roll")).toBeEnabled({ timeout: 20000 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Play on, buying, building and drawing golden keys, into the next round.
  let keys = 0;
  await expect(async () => {
    const read = page.locator("dialog .primary"),
      key = page.locator("#tour-key"),
      yes = page.locator("#tour-yes"),
      roll = page.locator("#tour-roll");
    if ((await end.isVisible()) && (await end.isEnabled())) await end.click({ timeout: 1000 });
    else if (await read.isVisible()) {
      // A golden key is shown before it takes effect; other dialogs ask to buy, build or travel.
      if (await page.locator("dialog .key-card").count()) keys++;
      await read.click({ timeout: 1000 });
    } else if ((await key.isVisible()) && (await key.isEnabled())) await key.click({ timeout: 1000 });
    else if ((await yes.isVisible()) && (await yes.isEnabled())) await yes.click({ timeout: 1000 });
    else if ((await roll.isVisible()) && (await roll.isEnabled())) await roll.click({ timeout: 1000 });
    await expect(moves(page)).toHaveText(/^[3-9] \//, { timeout: 600 });
  }).toPass({ timeout: 160000, intervals: [150] });
  expect(keys).toBeGreaterThanOrEqual(0);
  await page.screenshot({ path: `test-results/${info.project.name}-tour.png`, fullPage: true });
  expect(errors).toEqual([]);
});
