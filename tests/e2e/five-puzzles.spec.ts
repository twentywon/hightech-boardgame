import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as tower from "../../src/games/hanoi/rules";
import * as jugs from "../../src/games/pour/rules";
import * as queenRules from "../../src/games/queens/rules";
import * as tourRules from "../../src/games/knight/rules";
import { QUEEN_TOP, cellAt as queenAt, queensSubject } from "../../src/games/queens/view";
import { selectGame } from "./library";

/**
 * The five puzzles the user asked to have upgraded (water pouring, the Amazons, queens on the board, the knight tour,
 * the tower of Hanoi): their new stages, modes and help, played in the browser.
 */
const count = (page: Page) => page.locator("#move-count");
const rest = async (page: Page) => {
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(260);
};
/** Sits down at a puzzle for one and picks the stage card that says `stage`. */
async function sit(page: Page, name: string, stage: string, cards: number) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, name);
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(cards);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: stage }).first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  return errors;
}
/** The platform's random numbers replaced by a known sequence; the same sequence, for the test to lay the same puzzles. */
async function seeded(page: Page, start: number) {
  await page.addInitScript((first) => {
    let seed = first;
    crypto.getRandomValues = ((buffer: Uint32Array) => {
      for (let i = 0; i < buffer.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        buffer[i] = seed * 2;
      }
      return buffer;
    }) as typeof crypto.getRandomValues;
  }, start);
  let seed = start;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed * 2) / 4294967296;
  };
}
/** Walks the keyboard over a board of `cols` columns: `home` goes to its first point, `go` to a point and presses it. */
function walker(page: Page, cols: number, rows: number) {
  let cursor = 0;
  return {
    home: async () => {
      await page.locator("canvas").focus();
      for (let i = 0; i <= cols; i++) await page.keyboard.press("ArrowLeft");
      for (let i = 0; i <= rows; i++) await page.keyboard.press("ArrowUp");
      cursor = 0;
    },
    go: async (to: number) => {
      const dc = (to % cols) - (cursor % cols),
        dr = Math.floor(to / cols) - Math.floor(cursor / cols);
      for (let i = 0; i < Math.abs(dc); i++) await page.keyboard.press(dc > 0 ? "ArrowRight" : "ArrowLeft");
      for (let i = 0; i < Math.abs(dr); i++) await page.keyboard.press(dr > 0 ? "ArrowDown" : "ArrowUp");
      cursor = to;
      await page.keyboard.press("Enter");
    },
  };
}

test("water pouring: four vessels are poured among to the goal, the hint shows the way, and a pour is taken back", async ({ page }) => {
  test.setTimeout(150000);
  const random = await seeded(page, 91),
    errors = await sit(page, "물 나누기", "그릇 4개 · 보통", 5);
  // A puzzle was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  jugs.createGame(1, random);
  const puzzle = jugs.createGame(4, random),
    way = jugs.solve(puzzle)!,
    panel = page.locator(".puzzle-panel");
  expect(puzzle.caps).toHaveLength(4);
  expect(way.length).toBe(puzzle.best);
  await expect(panel.locator("#pz-stage")).toHaveText("그릇 4개 · 보통 · 스테이지 1");
  await expect(page.locator("#turn")).toContainText("목표:");
  await panel.getByRole("button", { name: "힌트", exact: true }).click();
  await expect(page.locator("#turn")).toContainText("화살표");
  const vessels = walker(page, 4, 0);
  await vessels.home();
  for (const [n, move] of way.entries()) {
    await vessels.go(move.from);
    await vessels.go(move.to);
    await expect(count(page)).toHaveText(`${n + 1}수`, { timeout: 20000 });
    await rest(page);
    if (n === 0) {
      await panel.getByRole("button", { name: "무르기", exact: true }).click();
      await expect(count(page)).toHaveText("0수");
      await vessels.home();
      await vessels.go(move.from);
      await vessels.go(move.to);
      await expect(count(page)).toHaveText("1수", { timeout: 20000 });
      await rest(page);
    }
  }
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(panel.locator("#pz-next")).toBeVisible();
  expect(errors).toEqual([]);
});

test("queens on the board: a repair board is mended by carrying the misplaced queens along their rows", async ({ page }) => {
  test.setTimeout(240000);
  const random = await seeded(page, 61),
    errors = await sit(page, "체스판의 퀸", "8×8 · 고쳐 놓기", 10);
  // A puzzle was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  queenRules.createGame(1, random);
  const value = queenRules.STAGES.length + 2,
    state = queenRules.createGame(value, random),
    size = state.size,
    // The answer that keeps the most of the queens as they stand; the others are carried to it within their rows.
    near = queenRules.answers(size).reduce((a, b) => (state.queens.filter((q, i) => q && b[Math.floor(i / size)] === i % size).length > state.queens.filter((q, i) => q && a[Math.floor(i / size)] === i % size).length ? b : a)),
    wrong = state.queens.flatMap((q, i) => (q && near[Math.floor(i / size)] !== i % size ? [i] : []));
  expect(size).toBe(8);
  expect(wrong.length).toBeGreaterThan(0);
  await expect(page.locator("#turn")).toContainText("빨간 퀸을 옮겨");
  const box = (await page.locator("#board canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = queensSubject(size, aspect),
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const square = (cell: number) => {
      const p = queenAt(size, cell),
        v = new Vector3(p.x, QUEEN_TOP, p.z).project(camera);
      return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
    },
    drag = async (from: { x: number; y: number }, to: { x: number; y: number }) => {
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
      await page.mouse.up();
    };
  // A board full of queens takes no more: a tap on an empty square sets nothing.
  const empty = state.queens.findIndex((q) => !q);
  await page.mouse.click(square(empty).x, square(empty).y);
  await page.waitForTimeout(300);
  await expect(count(page)).toHaveText("0수");
  for (const [n, cell] of wrong.entries()) {
    const row = Math.floor(cell / size);
    await drag(square(cell), square(row * size + near[row]));
    await expect(count(page)).toHaveText(`${n + 1}수`, { timeout: 20000 });
    await rest(page);
  }
  await expect(page.locator("#turn")).toContainText("성공!");
  // Taken back, the last queen stands where it was again, and is carried once more.
  const panel = page.locator(".puzzle-panel");
  await panel.getByRole("button", { name: "무르기", exact: true }).click();
  await expect(count(page)).toHaveText(`${wrong.length - 1}수`);
  await rest(page);
  const last = wrong[wrong.length - 1],
    row = Math.floor(last / size);
  await drag(square(last), square(row * size + near[row]));
  await expect(count(page)).toHaveText(`${wrong.length}수`, { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("성공!");
  expect(errors).toEqual([]);
});

test("knight tour: a closed journey is travelled square by square, home is refused until the end, and the last jump goes home", async ({ page }) => {
  test.setTimeout(200000);
  const random = await seeded(page, 29),
    errors = await sit(page, "나이트의 여행", "5×6 · 돌아오기", 10);
  // A board was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  tourRules.createGame(1, random);
  const state = tourRules.createGame(tourRules.STAGES.length + 1, random),
    way = tourRules.solve(state)!,
    board = walker(page, state.cols, state.rows),
    start = state.path[0];
  expect(state.closed).toBe(true);
  expect(way[way.length - 1]).toBe(start);
  await expect(page.locator("#turn")).toContainText("출발점으로 돌아오세요");
  await board.home();
  for (const [n, cell] of way.entries()) {
    // Once the knight stands a jump from home with squares still to tread, home is refused.
    if (n < way.length - 1 && n > 0 && tourRules.jumps(state.cols, state.rows, way[n - 1]).includes(start)) {
      await board.go(start);
      await page.waitForTimeout(250);
      await expect(count(page)).toHaveText(`${n}수`);
    }
    await board.go(cell);
    await expect(count(page)).toHaveText(`${n + 1}수`, { timeout: 20000 });
    await rest(page);
  }
  await expect(page.locator("#turn")).toContainText("성공! 모든 칸을 밟고 출발점으로 돌아왔습니다.");
  await expect(page.locator(".puzzle-panel #pz-next")).toBeVisible();
  expect(errors).toEqual([]);
});

test("tower of Hanoi: a tower on four pegs is moved in the fewest with the hint, and the next stage is offered", async ({ page }) => {
  test.setTimeout(150000);
  const errors = await sit(page, "하노이의 탑", "기둥 4개 · 원판 5개", 10);
  const panel = page.locator(".puzzle-panel"),
    pegs = walker(page, 4, 0);
  await expect(panel.locator("#pz-stage")).toHaveText("기둥 4개 · 원판 5개 · 스테이지 1");
  let state = tower.createGame(5, 4);
  expect(state.best).toBe(13);
  await panel.getByRole("button", { name: "힌트", exact: true }).click();
  await expect(page.locator("#turn")).toContainText("화살표");
  await pegs.home();
  for (let n = 0; state.winner === null; n++) {
    const move = tower.hint(state)!;
    await pegs.go(move.from);
    await pegs.go(move.to);
    await expect(count(page)).toHaveText(`${n + 1}수`, { timeout: 20000 });
    await rest(page);
    state = tower.play(state, move)!;
  }
  expect(state.ply).toBe(13);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(panel.locator("#pz-next")).toBeVisible();
  await panel.locator("#pz-next").click();
  await expect(panel.locator("#pz-stage")).toHaveText("기둥 4개 · 원판 5개 · 스테이지 2");
  await expect(count(page)).toHaveText("0수");
  expect(errors).toEqual([]);
});
