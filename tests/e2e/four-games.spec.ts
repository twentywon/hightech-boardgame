import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance, type Subject } from "../../src/engine/camera";
import { FOX_SUBJECT, pointAt } from "../../src/games/foxgeese/view";
import { indexOf } from "../../src/games/foxgeese/rules";
import { taflBoard } from "../../src/games/tafl/board";
import { UR_SUBJECT, DICE } from "../../src/games/ur/view";
import * as tentsRules from "../../src/games/tents/rules";
import { cellAt, tentsSubject } from "../../src/games/tents/view";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");
async function sit(page: Page, game: string, mode: "local" | "ai", variant?: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, game);
  if (await page.locator(`input[name=pg-mode][value=${mode}]`).count()) await page.locator(`input[name=pg-mode][value=${mode}]`).check();
  if (variant) await page.locator("#pg-variant").selectOption(variant);
  await page.locator(".game-stage button.primary").click();
  return errors;
}
async function ready(page: Page) {
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
}
/** Taps the point (x, y, z) as the view's camera shows it. */
async function tap(page: Page, subject: Subject & { tilt: number }, x: number, z: number, mobile: boolean, y = 0) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(camera),
    px = box.x + ((v.x + 1) * box.width) / 2,
    py = box.y + ((1 - v.y) * box.height) / 2;
  if (mobile) await page.touchscreen.tap(px, py);
  else await page.mouse.click(px, py);
}

test("fox and geese: a goose steps forward and the computer's fox answers", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await sit(page, "여우와 거위", "ai", "geese");
  await ready(page);
  const go = async (point: number) => {
    await tap(page, FOX_SUBJECT, pointAt(point).x, pointAt(point).z, mobile, 0.3);
    await page.waitForTimeout(150);
  };
  // The goose at the left end of the middle row's lower line steps up.
  await go(indexOf(0, 4));
  await go(indexOf(0, 3));
  await expect(moves(page)).toHaveText("2수", { timeout: 20000 });
  await settled(page);
  await expect(page.locator(".board-hint")).toContainText("거위");
  expect(errors).toEqual([]);
});

test("hnefatafl: the computer attacks first, and a defender slides like a rook", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    board = taflBoard("defenders"),
    errors = await sit(page, "바이킹 체스", "ai", "defenders");
  await ready(page);
  await expect(moves(page)).toHaveText("1수", { timeout: 20000 });
  await settled(page);
  // The defender above the king's row (5, 3) slides left along row 3 to (2, 3), unless the computer's move stands in the way.
  const at = (c: number, r: number) => r * 11 + c,
    go = async (square: number) => {
      await tap(page, board.subject, board.points[square].x, board.points[square].z, mobile);
      await page.waitForTimeout(150);
    };
  // A defender steps one square aside; the computer's first move may stand in the way of one, so a few are tried.
  for (const [from, to] of [[at(5, 3), at(4, 3)], [at(5, 7), at(4, 7)], [at(3, 5), at(3, 4)], [at(7, 5), at(7, 6)]]) {
    await go(from);
    await go(to);
    await page.waitForTimeout(500);
    if ((await moves(page).innerText()) !== "1수") break;
  }
  await expect(moves(page)).toHaveText(/^[3-9]수$/, { timeout: 30000 });
  expect(errors).toEqual([]);
});

test("royal game of Ur: the dice are thrown by a tap and a piece goes on", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await sit(page, "우르 왕실 게임", "ai");
  await ready(page);
  // Throws until one can be used (a throw of 0 passes the dice to the computer, which then answers).
  for (let i = 0; i < 12; i++) {
    await settled(page);
    const hint = await page.locator(".board-hint").innerText();
    if (/움직일 말을 고르세요/.test(hint)) break;
    if (/주사위를 던지세요/.test(hint)) await tap(page, UR_SUBJECT, DICE.x, DICE.z, mobile, 0.2);
    await page.waitForTimeout(400);
  }
  await expect(page.locator(".board-hint")).toContainText("움직일 말을 고르세요");
  const before = Number((await moves(page).innerText()).replace("수", ""));
  // Every piece is waiting: the first of them goes on.
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await expect(moves(page)).not.toHaveText(`${before}수`, { timeout: 20000 });
  expect(errors).toEqual([]);
});

/** Stubs the shuffle so the puzzle laid can be known here. */
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
test("tents: every tent is pitched by taps and the puzzle is solved", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 83),
    errors = await sit(page, "텐트 치기", "ai");
  await page.getByRole("dialog").locator(".stage-card").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await ready(page);
  // Puzzles were laid when the game was looked at and when sitting down; the third is the one chosen.
  tentsRules.createGame(1, random);
  tentsRules.createGame(1, random);
  const state = tentsRules.createGame(1, random),
    box = (await page.locator("canvas").boundingBox())!,
    subject = tentsSubject(state.size, box.width / box.height);
  let taps = 0;
  for (let i = 0; i < state.answer.length; i++) {
    if (!state.answer[i]) continue;
    const p = cellAt(state.size, i);
    await tap(page, subject, p.x, p.z, mobile, 0.12);
    taps++;
    await expect(moves(page)).toHaveText(`${taps}수`, { timeout: 20000 });
    await settled(page);
  }
  await expect(page.locator("#turn")).toContainText("성공!");
  expect(errors).toEqual([]);
});
