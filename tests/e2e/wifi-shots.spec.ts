import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV } from "../../src/engine/camera";
import { fastClock, selectGame } from "./library";
import { HACK } from "../../src/games/curling/rules";
import { throwerCamera } from "../../src/games/curling/view";
import { swipeFor as dartSwipe } from "../../src/games/darts/layout";
import { BALL_Z, START_X, bowlerCamera, swipeFor as laneSwipe } from "../../src/games/bowling/layout";
import { BALL_R } from "../../src/games/bowling/sim";

/*
 * 와이파이 여럿이 for the shot games: two pages of one browser, each its own device, paired by pasted codes. Each
 * shoots its own side on its own device; the other device sees the shot play out (a curling stone even as it goes,
 * swept as it is swept), and both come to the same state: the host's after each shot, which goes with it
 * (`#board[data-state]` is a digest of the state shown). The pages run on a fast clock (`fastClock`).
 */
test.setTimeout(400000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("main.game-layout canvas");

async function device(browser: Browser, info: TestInfo) {
  const use = info.project.use,
    context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent }),
    page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fastClock(page);
  await page.goto("/");
  return { page, errors };
}
async function lobby(page: Page, game: string, name: string) {
  await selectGame(page, game);
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
/** The host makes a room and invites, the guest answers, the host takes the answer, and the game begins. */
async function begin(host: Page, guest: Page, game: string) {
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
  await expect(host.locator(".net-people li", { hasText: "민수" })).toBeVisible();
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
}
/** Both pages show `count` moves, at rest, with the same state. */
async function agree(pages: Page[], count: number) {
  for (const page of pages) {
    await expect.poll(() => moves(page), { timeout: 60000 }).toBe(count);
    await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 60000 });
  }
  await expect
    .poll(async () => new Set(await Promise.all(pages.map((p) => p.locator("#board").getAttribute("data-state")))).size, { timeout: 20000 })
    .toBe(1);
  expect(await pages[0].locator("#board").getAttribute("data-state")).toMatch(/^[0-9a-f]{8}$/);
}
/** The side to move, as every page has it. */
const turnOf = async (page: Page) => Number(await page.locator("#board").getAttribute("data-turn"));
/** A drag on the page from `a` to `b` in a few steps. */
async function drag(page: Page, a: { x: number; y: number }, b: { x: number; y: number }, steps = 8) {
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= steps; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / steps, a.y + ((b.y - a.y) * k) / steps);
  await page.mouse.up();
}

test("curling by codes: each slides its own stones, the other watches each stone as it goes, a swept stone agrees on both", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await begin(host, guest, "컬링");
  await agree(pages, 0);
  await expect(host.locator(".board-hint")).toContainText("나 (빨강) 차례");
  await expect(guest.locator(".board-hint")).toContainText("방장 (빨강) 차례입니다");
  // Seen from behind the hack on both devices: a stone is pulled straight back toward the eye.
  const pull = async (page: Page) => {
    const box = (await canvas(page).boundingBox())!,
      camera = new PerspectiveCamera(FOV, box.width / box.height, 0.1, 120);
    throwerCamera(camera);
    const at = (x: number, y: number, z: number) => {
      const v = new Vector3(x, y, z).project(camera);
      return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
    };
    await drag(page, at(HACK.x, 0.1, HACK.z), at(HACK.x - 0.75, 0, HACK.z));
  };
  // Out of turn the guest's pull slides nothing.
  await pull(guest);
  await guest.waitForTimeout(500);
  expect(await moves(host)).toBe(0);
  expect(await moves(guest)).toBe(0);
  for (let n = 1; n <= 4; n++) {
    const shooter = pages[await turnOf(host)],
      watcher = shooter === host ? guest : host;
    // Whether the watcher's table runs the stone before its throw is told (the canvas's data-watching turns true).
    await watcher.evaluate(() => {
      const el = document.querySelector("main.game-layout canvas")!,
        w = window as unknown as { watched: boolean; moveAtWatch: string | null };
      w.watched = false;
      new MutationObserver((_, observer) => {
        if (el.getAttribute("data-watching") !== "true") return;
        w.watched = true;
        w.moveAtWatch = document.querySelector("#move-count")!.textContent;
        observer.disconnect();
      }).observe(el, { attributes: true, attributeFilter: ["data-watching"] });
    });
    await pull(shooter);
    // The shooter sweeps its stone on its way (quick taps on the button); the other device watches it go.
    if (n <= 2) {
      const sweep = shooter.locator(".cu-sweep");
      await expect(sweep).toBeVisible({ timeout: 10000 });
      for (let k = 0; k < 12 && (await sweep.isVisible()); k++) await sweep.click({ timeout: 2000 }).catch(() => {});
    }
    await agree(pages, n);
    // The watcher ran the stone while its throw was still being made: before the move was told there.
    const seen = await watcher.evaluate(() => {
      const w = window as unknown as { watched: boolean; moveAtWatch: string | null };
      return { watched: w.watched, moveAtWatch: w.moveAtWatch };
    });
    expect(seen.watched).toBe(true);
    expect(seen.moveAtWatch).toBe(`${n - 1}수`);
    await expect(canvas(watcher)).toHaveAttribute("data-watching", "false");
  }
  // Two stones each, by turns.
  await expect(host.locator(".board-hint")).toContainText("스톤 3/4");
  for (const d of [a, b]) expect(d.errors).toEqual([]);
});

test("darts by codes: three darts a visit on the thrower's own device, the score the same on both", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await begin(host, guest, "다트");
  await agree(pages, 0);
  const throwAt = async (page: Page, x: number, y: number) => {
    const box = (await canvas(page).boundingBox())!,
      swipe = dartSwipe(x, y, box.height),
      from = { x: box.x + box.width / 2, y: box.y + box.height * 0.88 };
    await drag(page, from, { x: from.x + swipe.dx, y: from.y + swipe.dy });
  };
  // The guest's swipe on the host's visit throws nothing.
  await throwAt(guest, 0, 0);
  await guest.waitForTimeout(500);
  expect(await moves(host)).toBe(0);
  for (let n = 1; n <= 6; n++) {
    // Darts 1–3 the host's visit, 4–6 the guest's.
    expect(await turnOf(host)).toBe(n <= 3 ? 0 : 1);
    await throwAt(pages[n <= 3 ? 0 : 1], 0, 60);
    await agree(pages, n);
  }
  // Both sides scored on both devices alike.
  for (const side of [0, 1]) expect(await host.locator(`#pg-count-${side}`).innerText()).toBe(await guest.locator(`#pg-count-${side}`).innerText());
  expect(await turnOf(guest)).toBe(0);
  for (const d of [a, b]) expect(d.errors).toEqual([]);
});

test("bowling by codes: each bowls its own frame, the pins fall the same on both devices", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await begin(host, guest, "볼링");
  await agree(pages, 0);
  const bowl = async (page: Page) => {
    const box = (await canvas(page).boundingBox())!,
      camera = new PerspectiveCamera(FOV, box.width / box.height, 0.1, 120);
    bowlerCamera(camera, 0);
    const v = new Vector3(START_X, BALL_R, BALL_Z).project(camera),
      at = { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 },
      swipe = laneSwipe(8, 0, box.height);
    await drag(page, at, { x: at.x + swipe.dx, y: at.y + swipe.dy }, 10);
  };
  // The guest's swipe on the host's frame rolls nothing.
  await bowl(guest);
  await guest.waitForTimeout(500);
  expect(await moves(host)).toBe(0);
  let count = 0;
  const sides = new Set<number>();
  for (let step = 0; step < 6 && sides.size < 2; step++) {
    const turn = await turnOf(host);
    sides.add(turn);
    await bowl(pages[turn]);
    await agree(pages, ++count);
  }
  // Both bowled (a frame of one ball or two each).
  expect(sides).toEqual(new Set([0, 1]));
  for (const d of [a, b]) expect(d.errors).toEqual([]);
});
