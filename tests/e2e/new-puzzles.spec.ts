import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance, type Subject } from "../../src/engine/camera";
import * as pipeRules from "../../src/games/pipes/rules";
import { TILE_TOP, cellAt as pipeCell, pipesSubject } from "../../src/games/pipes/view";
import * as bridgeRules from "../../src/games/bridges/rules";
import { ISLAND_TOP, bridgesSubject, cellAt as islandCell } from "../../src/games/bridges/view";
import * as parkingRules from "../../src/games/parking/rules";
import { goSubject, pointAt as goPoint, stoneLift } from "../../src/games/go/layout";
import { GRAB_HEIGHT, cellAt as lotCell, parkingSubject } from "../../src/games/parking/view";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");

/** Stubs the random numbers so that the puzzle laid can be laid here too. */
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
/** Enters a puzzle for one through its stage window and sits down at the first stage by its card. */
async function sit(page: Page, name: string, stages = 5) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, name);
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(stages);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  return errors;
}
/** Where the point (x, y, z) is on the screen, as the view's camera shows it. */
async function screen(page: Page, subject: Subject & { tilt: number }, x: number, y: number, z: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
/** Taps the point (x, y, z) as the view's camera shows it. */
async function tap(page: Page, subject: Subject & { tilt: number }, x: number, y: number, z: number, mobile: boolean) {
  const p = await screen(page, subject, x, y, z);
  if (mobile) await page.touchscreen.tap(p.x, p.y);
  else await page.mouse.click(p.x, p.y);
}

test("pipes: each piece is turned by taps until the water reaches every house", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 71),
    errors = await sit(page, "파이프 잇기");
  // A garden was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  pipeRules.createGame(1, random);
  const state = pipeRules.createGame(1, random),
    box = (await page.locator("canvas").boundingBox())!,
    subject = pipesSubject(state.size, box.width / box.height);
  let taps = 0;
  for (let i = 0; i < state.tiles.length; i++) {
    const turns = pipeRules.turnsBetween(state.tiles[i], state.answer[i]);
    for (let k = 0; k < turns; k++) {
      const p = pipeCell(state.size, i);
      await tap(page, subject, p.x, TILE_TOP, p.z, mobile);
      taps++;
      await expect(moves(page)).toHaveText(`${taps}수`, { timeout: 20000 });
      await settled(page);
    }
  }
  expect(taps).toBeGreaterThan(0);
  await expect(page.locator("#turn")).toContainText("성공!");
  expect(errors).toEqual([]);
});

test("bridges: an island and then its neighbour lay a bridge, and every number is met", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 73),
    errors = await sit(page, "하시");
  // A sea was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  bridgeRules.createGame(1, random);
  const state = bridgeRules.createGame(1, random),
    box = (await page.locator("canvas").boundingBox())!,
    subject = bridgesSubject(state.size, box.width / box.height),
    at = async (cell: number) => {
      const p = islandCell(state.size, cell);
      await tap(page, subject, p.x, ISLAND_TOP, p.z, mobile);
    };
  let laid = 0;
  for (const [k, edge] of state.edges.entries())
    for (let n = 0; n < state.answer[k]; n++) {
      await at(edge.a);
      await at(edge.b);
      laid++;
      await expect(moves(page)).toHaveText(`${laid}수`, { timeout: 20000 });
      await settled(page);
    }
  expect(laid).toBeGreaterThan(0);
  await expect(page.locator("#turn")).toContainText("성공!");
  expect(errors).toEqual([]);
});

test("parking escape: each car is dragged along its line, and the red car drives out", async ({ page }) => {
  const random = await seeded(page, 72),
    errors = await sit(page, "주차장 탈출", 4);
  // A lot was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  parkingRules.createGame(1, random);
  let state = parkingRules.createGame(1, random);
  const box = (await page.locator("canvas").boundingBox())!,
    subject = parkingSubject(box.width / box.height),
    plan = parkingRules.solve(state)!;
  expect(plan.length).toBeGreaterThan(0);
  // A bare tap on a car moves nothing.
  const first = lotCell(plan[0].from);
  const still = await screen(page, subject, first.x, GRAB_HEIGHT, first.z);
  await page.mouse.click(still.x, still.y);
  await page.waitForTimeout(400);
  await expect(moves(page)).toHaveText("0수");
  for (const [n, move] of plan.entries()) {
    const from = lotCell(move.from),
      to = lotCell(move.to),
      a = await screen(page, subject, from.x, GRAB_HEIGHT, from.z),
      b = await screen(page, subject, to.x, GRAB_HEIGHT, to.z);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
    await expect(moves(page)).toHaveText(`${n + 1}수`, { timeout: 20000 });
    await settled(page);
    state = parkingRules.play(state, move)!;
  }
  expect(state.winner).toBe(0);
  await expect(page.locator("#turn")).toContainText("성공!");
  expect(errors).toEqual([]);
});

test("go: a tap lays a stone, the computer answers, a pass is offered, and resigning ends the game", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "바둑");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await page.getByLabel("컴퓨터 대전", { exact: true }).check();
  await page.locator("#pg-variant").selectOption("9");
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  const box = (await page.locator("canvas").boundingBox())!,
    subject = goSubject(9, box.width / box.height),
    // The 3-3 point of the near right corner: row 6, column 6.
    p = goPoint(9, 6 * 9 + 6);
  await tap(page, subject, p.x, stoneLift(9), p.z, mobile);
  await expect(moves(page)).toHaveText("1수", { timeout: 20000 });
  // The computer answers with a stone of its own (or a pass).
  await expect(moves(page)).toHaveText("2수", { timeout: 30000 });
  await settled(page);
  await expect(page.getByRole("button", { name: "한 수 쉬기" })).toBeVisible();
  await page.getByRole("button", { name: "기권" }).click();
  await expect(page.locator("#turn")).toContainText("불계승", { timeout: 20000 });
  expect(errors).toEqual([]);
});
