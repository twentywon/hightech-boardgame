import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { hexaBoard } from "../../src/games/hexa/board";
import { at as cell } from "../../src/games/hexa/rules";
import { morrisBoard } from "../../src/games/morris/board";
import { gonuBoard } from "../../src/games/gonu/board";
import type { BoardSpec } from "../../src/games/points/view";

const settled = (page: Page) =>
  expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 20000 });
const turn = (page: Page) => page.locator("#turn");
const moves = (page: Page) => page.locator("#move-count");
async function sit(page: Page, game: string, mode: "local" | "ai", variant?: string) {
  await page.goto("/");
  await selectGame(page, game);
  await page.locator(`input[name=pg-mode][value=${mode}]`).check();
  if (variant) await page.getByLabel("종류").selectOption(variant);
  await page.getByRole("button", { name: /앉기/ }).click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  await page.locator("canvas").scrollIntoViewIfNeeded();
}
/** Taps a point of the board where the view's camera shows it. */
async function tap(page: Page, spec: BoardSpec, point: number, mobile: boolean) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    d = cameraDistance(aspect, false, spec.subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 90);
  camera.position.set(0, Math.sin(spec.subject.tilt) * d, Math.cos(spec.subject.tilt) * d);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const p = spec.points[point],
    v = new Vector3(p.x, 0, p.z + spec.centreZ).project(camera),
    x = box.x + ((v.x + 1) * box.width) / 2,
    y = box.y + ((1 - v.y) * box.height) / 2;
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test("hexa germ war: a neighbouring cell copies, two cells away jumps, neighbours turn", async ({ page }, info) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mobile = info.project.name === "mobile",
    board = hexaBoard(),
    go = (q: number, r: number) => tap(page, board, cell(q, r), mobile);
  await sit(page, "헥사 세균전", "local");
  await expect(page.locator(".board-hint")).toContainText("파랑 (플레이어 1) 차례");
  await expect(page.locator("#pg-count-0")).toHaveText("3칸");
  await expect(page.locator("#pg-undo")).toBeDisabled();
  // Blue copies from the corner (4,0) into (3,0).
  await go(4, 0);
  await expect(turn(page)).toContainText("갈 곳을 고르세요");
  await go(3, 0);
  await expect(moves(page)).toHaveText("1수");
  await settled(page);
  await expect(page.locator("#pg-count-0")).toHaveText("4칸");
  await expect(turn(page)).toContainText("빨강 (플레이어 2) 차례");
  // Red jumps from its corner (4,-4) two cells to (3,-2), leaving the corner empty.
  await go(4, -4);
  await go(3, -2);
  await expect(moves(page)).toHaveText("2수");
  await settled(page);
  // The jump kept red at three germs; blue's (3,0) is two cells away and stays blue.
  await expect(page.locator("#pg-count-1")).toHaveText("3칸");
  await expect(page.locator("#pg-count-0")).toHaveText("4칸");
  // Blue copies next to the jumper: it turns.
  await go(3, 0);
  await go(3, -1);
  await settled(page);
  await expect(page.locator("#pg-count-0")).toHaveText("6칸");
  await expect(page.locator("#pg-count-1")).toHaveText("2칸");
  await page.screenshot({ path: `test-results/${info.project.name}-hexa.png`, fullPage: true });
  // Undo takes the last move back.
  await page.locator("#pg-undo").click();
  await expect(moves(page)).toHaveText("2수");
  await expect(page.locator("#pg-count-0")).toHaveText("4칸");
  // The keyboard walks the cells: down the left edge to blue's corner, Enter, up, Enter.
  await page.locator("canvas").focus();
  for (const key of ["ArrowRight", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "Enter", "ArrowUp", "Enter"])
    await page.keyboard.press(key);
  await expect(moves(page)).toHaveText("3수");
  await settled(page);
  await expect(page.locator("#pg-count-0")).toHaveText("5칸");
  expect(errors).toEqual([]);
});

test("nine men's morris: placing three in a row asks for a man to take", async ({ page }, info) => {
  test.setTimeout(90000);
  const mobile = info.project.name === "mobile",
    board = morrisBoard(),
    go = async (point: number) => {
      await tap(page, board, point, mobile);
      await settled(page);
    };
  await sit(page, "나인 멘스 모리스", "local");
  await expect(turn(page)).toContainText("빈 점에 말을 놓으세요 (남은 말 9개)");
  for (const point of [0, 8, 1, 9]) await go(point);
  await expect(moves(page)).toHaveText("4수");
  // Black closes 0-1-2 and must choose a white man.
  await go(2);
  await expect(moves(page)).toHaveText("4수");
  await expect(turn(page)).toContainText("떼어낼 상대 말을 고르세요");
  await go(9);
  await expect(moves(page)).toHaveText("5수");
  await expect(page.locator("#pg-count-1")).toHaveText("판 위 1 · 남은 말 7");
  await expect(page.locator("#pg-count-0")).toHaveText("판 위 3 · 남은 말 6");
  await page.screenshot({ path: `test-results/${info.project.name}-morris.png`, fullPage: true });
});

test("gonu: three boards in the yard, each with its own rules", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mobile = info.project.name === "mobile";
  // Well gonu: the opening move that would shut white in is not offered.
  let board = gonuBoard("well");
  await sit(page, "고누", "local", "well");
  await expect(page.locator(".board-label")).toContainText("우물고누");
  await tap(page, board, 3, mobile);
  await tap(page, board, 4, mobile);
  await expect(moves(page)).toHaveText("0수");
  await tap(page, board, 2, mobile);
  await tap(page, board, 4, mobile);
  await expect(moves(page)).toHaveText("1수");
  await settled(page);
  await page.screenshot({ path: `test-results/${info.project.name}-gonu-well.png`, fullPage: true });
  // Line gonu: a step forward.
  board = gonuBoard("line");
  await sit(page, "고누", "local", "line");
  await expect(page.locator(".board-label")).toContainText("네줄고누");
  await expect(page.locator("#pg-count-0")).toHaveText("말 4개");
  await tap(page, board, 13, mobile);
  await tap(page, board, 9, mobile);
  await expect(moves(page)).toHaveText("1수");
  // Pumpkin gonu: only the middle piece can leave home first.
  board = gonuBoard("pumpkin");
  await sit(page, "고누", "local", "pumpkin");
  await expect(page.locator(".board-label")).toContainText("호박고누");
  await tap(page, board, 8, mobile);
  await tap(page, board, 9, mobile);
  await expect(moves(page)).toHaveText("0수");
  // The second tap chose the middle piece; it steps out to the south point.
  await tap(page, board, 5, mobile);
  await expect(moves(page)).toHaveText("1수");
  expect(errors).toEqual([]);
});

test("point games against the computer: it answers, undo returns to my turn, the screen fits", async ({ page }, info) => {
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mobile = info.project.name === "mobile";
  const games: [string, string | undefined, BoardSpec, number[]][] = [
    ["헥사 세균전", undefined, hexaBoard(), [cell(4, 0), cell(3, 0)]],
    ["나인 멘스 모리스", undefined, morrisBoard(), [0]],
    ["고누", "line", gonuBoard("line"), [13, 9]],
  ];
  for (const [game, variant, board, taps] of games) {
    await sit(page, game, "ai", variant);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = (await page.locator("canvas").boundingBox())!;
    expect(box.width).toBeGreaterThan(mobile ? 300 : 600);
    for (const point of taps) await tap(page, board, point, mobile);
    // The computer answers my move.
    await expect(moves(page)).toHaveText("2수", { timeout: 20000 });
    await settled(page);
    await expect(turn(page)).toContainText(/나 \(/);
    // Undo against the computer takes back its answer and my move.
    await page.locator("#pg-undo").click();
    await expect(moves(page)).toHaveText("0수");
    await expect(turn(page)).toContainText(/나 \(/);
  }
  expect(errors).toEqual([]);
});
