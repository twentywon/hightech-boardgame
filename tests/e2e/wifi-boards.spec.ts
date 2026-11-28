import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import type { Square } from "chess.js";
import { FOV, OVERHEAD, SUBJECTS, TILT, cameraDistance } from "../../src/engine/camera";
import { toWorld as chessWorld } from "../../src/games/chess/coordinates";
import { toWorld as janggiWorld } from "../../src/games/janggi/view";
import { selectGame } from "./library";

/*
 * 와이파이 여럿이 on the four games with their own screens (chess, gomoku, Reversi, janggi): two pages of one
 * browser, each its own device, joined by WebRTC with the pairing codes pasted. The host sits at the side that moves
 * first, the guest at the other; each moves only its own side, and both boards agree after every move.
 */
test.setTimeout(300000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("main.game-layout canvas");

/** A page of its own (a device), with the project's screen and the page errors it hears. */
async function device(browser: Browser, info: TestInfo) {
  const use = info.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
  });
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  return { page, errors, context };
}
/** Enters a game in the Wi-Fi mode: the room's window opens with my name typed. */
async function lobby(page: Page, game: string, name: string) {
  await selectGame(page, game);
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
/** Two devices in one room of `game`, the host at the first side and the guest at the second, the game begun. */
async function table(browser: Browser, info: TestInfo, game: string) {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, game, "방장");
  await host.locator("#net-host").click();
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  await lobby(guest, game, "민수");
  await guest.locator("#net-join").click();
  await guest.locator("#net-offer-in").fill(await offer.inputValue());
  await guest.locator("#net-accept").click();
  const answer = guest.locator("#net-answer");
  await expect(answer).toBeVisible({ timeout: 20000 });
  await host.locator("#net-answer-in").fill(await answer.inputValue());
  await host.locator("#net-connect").click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 30000 });
  await expect(host.locator(".net-seat").nth(0)).toContainText("나");
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvas(page)).toBeVisible({ timeout: 30000 });
  return {
    host,
    guest,
    done: async () => {
      expect(a.errors).toEqual([]);
      expect(b.errors).toEqual([]);
      await a.context.close();
      await b.context.close();
    },
  };
}
/** Waits until both pages show `count` moves and their tables rest. */
async function agree(pages: Page[], count: number) {
  for (const page of pages) {
    await expect.poll(() => moves(page), { timeout: 30000 }).toBe(count);
    await expect(page.locator("#board")).not.toHaveAttribute("data-animating", "true", { timeout: 30000 });
  }
}
async function press(page: Page, at: { x: number; y: number }, info: TestInfo) {
  if (info.project.name === "mobile") await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}
/** Keys on the table's canvas, again until the move is made (a table still settling takes none). */
async function keyed(page: Page, keys: string[], count: number) {
  await expect(async () => {
    await canvas(page).focus();
    for (const key of keys) await page.keyboard.press(key);
    await expect.poll(() => moves(page), { timeout: 2000 }).toBe(count);
  }).toPass({ timeout: 30000 });
}

/** Where a chess square is on the screen, through the camera of the side the board faces. */
async function square(page: Page, s: Square) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    top = (await page.locator("#board").getAttribute("data-top")) === "true",
    black = (await page.locator("#board").getAttribute("data-facing")) === "b",
    d = cameraDistance(aspect, top, SUBJECTS.chess),
    a = top ? Math.PI / 2 - 0.001 : (55 * Math.PI) / 180,
    camera = new PerspectiveCamera(38, aspect, 0.1, 80);
  camera.position.set(0, Math.sin(a) * d, Math.cos(a) * d * (black ? -1 : 1));
  camera.lookAt(0, 0.1, 0);
  camera.updateMatrixWorld();
  const p = chessWorld(s),
    v = new Vector3(p.x, 0.21, p.z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
async function chessMove(page: Page, from: Square, to: Square, info: TestInfo) {
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await press(page, await square(page, from), info);
  await press(page, await square(page, to), info);
}
/** Where a janggi point is on the screen, through the camera of the side the board faces. */
async function point(page: Page, index: number) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    top = (await page.locator("#board").getAttribute("data-top")) === "true",
    han = (await page.locator("#board").getAttribute("data-facing")) === "han",
    d = cameraDistance(aspect, top, SUBJECTS.janggi),
    a = top ? OVERHEAD : TILT,
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 80);
  camera.position.set(0, Math.sin(a) * d, Math.cos(a) * d * (han ? -1 : 1));
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const w = janggiWorld(index),
    v = new Vector3(w.x, 0.26, w.z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
const at = (x: number, y: number) => y * 9 + x;

test("chess on two devices: the guest faces black, both boards agree, a move out of turn is refused, an undo is asked and accepted", async ({ browser }, info) => {
  const { host, guest, done } = await table(browser, info, "체스");
  await expect(host.locator("#board")).toHaveAttribute("data-facing", "w");
  await expect(guest.locator("#board")).toHaveAttribute("data-facing", "b");
  await expect(guest.locator("#turn")).toContainText("방장 (백) 차례입니다");
  // White moves first: the guest's tap on its own pawn is refused with words.
  await chessMove(guest, "e7", "e5", info);
  await expect(guest.locator("#turn")).toContainText("상대 차례입니다");
  expect(await moves(host)).toBe(0);

  await chessMove(host, "e2", "e4", info);
  await agree([host, guest], 1);
  await expect(guest.locator("#turn")).toContainText("나 (흑) 차례");
  // The guest aims from black's side of the table.
  await chessMove(guest, "e7", "e5", info);
  await agree([host, guest], 2);
  await chessMove(host, "g1", "f3", info);
  await agree([host, guest], 3);
  await chessMove(guest, "b8", "c6", info);
  await agree([host, guest], 4);
  await expect(host.locator("#turn")).toContainText("나 (백) 차례");

  // The guest asks to take its knight back; the host accepts; both are back at three moves, black to move.
  await guest.locator("#undo").click({ force: true });
  await expect(host.locator("#net-ask")).toBeVisible({ timeout: 15000 });
  await expect(host.locator("#net-ask")).toContainText("민수 님이 무르기를 요청했습니다");
  await host.locator("#net-ask .net-yes").click();
  await agree([host, guest], 3);
  await expect(guest.locator("#turn")).toContainText("나 (흑) 차례");
  // Played the other way, to the same board.
  await chessMove(guest, "g8", "f6", info);
  await agree([host, guest], 4);
  await done();
});

test("gomoku and Reversi on two devices: stones and discs in turn, both boards agree", async ({ browser }, info) => {
  {
    const { host, guest, done } = await table(browser, info, "오목");
    await expect(guest.locator("#turn")).toContainText("방장 (흑돌) 차례입니다");
    // A stone placed out of turn is refused.
    await canvas(guest).focus();
    await guest.keyboard.press("Enter");
    expect(await moves(host)).toBe(0);
    await keyed(host, ["Enter"], 1);
    await agree([host, guest], 1);
    await keyed(guest, ["ArrowRight", "Enter"], 2);
    await agree([host, guest], 2);
    await keyed(host, ["ArrowDown", "Enter"], 3);
    await agree([host, guest], 3);
    await expect(guest.locator("#turn")).toContainText("나 (백돌) 차례");
    await done();
  }
  {
    const { host, guest, done } = await table(browser, info, "리버시");
    await keyed(host, ["Enter"], 1);
    await agree([host, guest], 1);
    await keyed(guest, ["Enter"], 2);
    await agree([host, guest], 2);
    await keyed(host, ["Enter"], 3);
    await agree([host, guest], 3);
    for (const id of ["#black-count", "#white-count"]) await expect(guest.locator(id)).toHaveText((await host.locator(id).textContent())!);
    await expect(host.locator("#turn")).toContainText("민수 (백돌) 차례입니다");
    await done();
  }
});

test("janggi on two devices: each faces its own side, moves and a pass agree on both", async ({ browser }, info) => {
  const { host, guest, done } = await table(browser, info, "장기");
  await expect(host.locator("#board")).toHaveAttribute("data-facing", "cho");
  await expect(guest.locator("#board")).toHaveAttribute("data-facing", "han");
  // The formations are chosen from each device's setup first; then 초 (the host) moves.
  await expect(host.locator("#turn")).toContainText("나 (초) 차례", { timeout: 30000 });
  await expect(canvas(host)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await press(host, await point(host, at(0, 6)), info);
  await press(host, await point(host, at(0, 5)), info);
  await agree([host, guest], 1);
  await expect(guest.locator("#turn")).toContainText("나 (한) 차례");
  await guest.locator("#jg-pass").click({ force: true });
  await agree([host, guest], 2);
  await press(host, await point(host, at(2, 6)), info);
  await press(host, await point(host, at(2, 5)), info);
  await agree([host, guest], 3);
  await expect(guest.locator("#turn")).toContainText("나 (한) 차례");
  await done();
});
