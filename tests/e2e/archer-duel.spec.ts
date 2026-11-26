import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { fastClock, selectGame } from "./library";
import { pullFor } from "../../src/games/bowduel/layout";
import { powerFor, type Land } from "../../src/games/bowduel/rules";

/*
 * 활잡이 결투: a pull back on the table draws the bow (the angle and draw shown in numbers, no line of flight), letting
 * go looses; the arrow flies its arc and strikes. Shots here are reckoned from the field the canvas tells
 * (`data-land`, `data-wind`) as the computer reckons its own, then made as a person's pull. The pages run on a fast
 * clock (`fastClock`) so that a whole duel's flights pass quickly.
 */
const moves = async (page: Page) => Number(/(\d+)/.exec((await page.locator("#move-count").textContent()) ?? "")?.[1] ?? 0);
const canvas = (page: Page) => page.locator("main.game-layout canvas");
const resting = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 90000 });
const turnOf = async (page: Page) => Number(await page.locator("#board").getAttribute("data-turn"));

/** A pull from the middle of the table by (dx, dy) pixels, in a few steps. */
async function pull(page: Page, dx: number, dy: number, release = true) {
  const box = (await canvas(page).boundingBox())!,
    from = { x: box.x + box.width * 0.55, y: box.y + box.height * 0.4 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(from.x + (dx * k) / 6, from.y + (dy * k) / 6);
  if (release) await page.mouse.up();
}
/** The shot that brings an arrow down on the foe at `angle`, as a pull of this page's archer to move (`side` in the rules). */
async function reckoned(page: Page, side: 0 | 1, angle = 45) {
  const el = canvas(page),
    land = JSON.parse((await el.getAttribute("data-land"))!) as Land,
    wind = Number(await el.getAttribute("data-wind")),
    face = Number(await el.getAttribute("data-face")) as 1 | -1,
    power = Math.round(powerFor(land, side, angle, wind) * 10) / 10,
    box = (await el.boundingBox())!;
  return { power, ...pullFor(angle, power, box.width, box.height, face) };
}
async function sit(page: Page, mode: "ai" | "local", variant = "calm") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fastClock(page);
  await page.goto("/");
  await selectGame(page, "활잡이 결투");
  await page.getByLabel(mode === "ai" ? "컴퓨터 대전" : "로컬 2인", { exact: true }).check();
  await page.locator("#pg-variant").selectOption(variant);
  if (mode === "ai") await page.locator("#pg-level").selectOption("easy");
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await resting(page);
  return errors;
}

test("archer duel: a pull draws and shows the numbers, a short one shoots nothing, and against the computer the duel is fought to its end", async ({ page }) => {
  test.setTimeout(420000);
  const errors = await sit(page, "ai");
  const el = canvas(page);
  await expect(el).toHaveAttribute("data-health", "100,100");
  await expect(el).toHaveAttribute("data-face", "1");
  await expect(page.locator(".ad-bar.ad-l .ad-name")).toHaveText("나");
  await expect(page.locator(".ad-bar.ad-r .ad-name")).toHaveText("컴퓨터");
  // A calm field shows no wind.
  await expect(page.locator(".ad-wind")).toBeHidden();
  // Held, the pull shows the angle and the draw in numbers, and the archer draws; a pull too short looses nothing.
  await pull(page, -80, 80, false);
  await expect(el).toHaveAttribute("data-drawn", "true");
  await expect(page.locator(".ad-aim")).toBeVisible();
  await expect(page.locator(".ad-angle")).toHaveText(/^45\.0°$/);
  await expect(el).toHaveAttribute("data-aim", /^45,\d+(\.\d)?$/);
  const box = (await el.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.55 + 2, box.y + box.height * 0.4 + 2);
  await page.mouse.up();
  await page.waitForTimeout(500);
  expect(await moves(page)).toBe(0);
  await expect(el).toHaveAttribute("data-drawn", "false");
  await expect(page.locator(".ad-aim")).toBeHidden();
  // The duel: my arrows reckoned true, the computer's as it learns, until one falls.
  for (let k = 0; k < 30 && !(await page.locator(".board-finale").count()); k++) {
    await resting(page);
    if (await page.locator(".board-finale").count()) break;
    if ((await turnOf(page)) !== 0) {
      await expect.poll(() => turnOf(page), { timeout: 90000 }).toBe(0);
      continue;
    }
    const before = await moves(page),
      shot = await reckoned(page, 0);
    await pull(page, shot.dx, shot.dy);
    // (On the fast clock the computer's answer may have come too before this is read: then only the count is seen.)
    await expect.poll(() => moves(page), { timeout: 30000 }).toBeGreaterThanOrEqual(before + 1);
    // The count and the last arrow read together, so that the computer's answer cannot come between them.
    const [count, told] = await page.evaluate(() => [
      Number(/(\d+)/.exec(document.querySelector("#move-count")?.textContent ?? "")?.[1] ?? 0),
      document.querySelector<HTMLCanvasElement>("main.game-layout canvas")?.dataset.last ?? "",
    ]);
    if (count !== before + 1) continue;
    // My arrow was the reckoned one, and it struck the computer's archer.
    const last = String(told).split(",");
    expect(last[0]).toBe("0");
    expect(["head", "body", "legs"]).toContain(last[1]);
  }
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 90000 });
  const health = ((await el.getAttribute("data-health")) ?? "").split(",").map(Number);
  expect(Math.min(...health)).toBe(0);
  expect(errors).toEqual([]);
});

test("archer duel at one screen: each archer draws by its own pull (the right one facing left) and the keys draw too", async ({ page }) => {
  test.setTimeout(240000);
  const errors = await sit(page, "local", "wind");
  const el = canvas(page);
  await expect(page.locator(".ad-bar.ad-l .ad-name")).toHaveText("플레이어 1");
  await expect(page.locator(".ad-wind")).toBeVisible();
  // Player 1 pulls down and to the left.
  let shot = await reckoned(page, 0);
  await pull(page, shot.dx, shot.dy);
  await expect.poll(() => moves(page), { timeout: 30000 }).toBe(1);
  await resting(page);
  // Player 2 faces left: its pull goes down and to the right.
  await expect(el).toHaveAttribute("data-face", "-1");
  shot = await reckoned(page, 1);
  expect(shot.dx).toBeGreaterThan(0);
  await pull(page, shot.dx, shot.dy);
  await expect.poll(() => moves(page), { timeout: 30000 }).toBe(2);
  await resting(page);
  expect(((await el.getAttribute("data-last")) ?? "").split(",")[0]).toBe("1");
  // The keys: ↑↓ the angle, ←→ the draw, Space looses.
  await el.focus();
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowRight");
  await expect(el).toHaveAttribute("data-drawn", "true");
  await expect(page.locator(".ad-aim")).toBeVisible();
  const aim = ((await el.getAttribute("data-aim")) ?? "").split(",").map(Number);
  expect(aim[0]).toBeGreaterThan(45);
  await page.keyboard.press("Space");
  await expect.poll(() => moves(page), { timeout: 30000 }).toBe(3);
  expect(errors).toEqual([]);
});

/* ── 와이파이 여럿이: two pages of one browser, each its own device, paired by pasted codes. ── */
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
async function lobby(page: Page, name: string) {
  await selectGame(page, "활잡이 결투");
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
async function begin(host: Page, guest: Page) {
  await lobby(host, "방장");
  await host.locator("#net-host").click();
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  await lobby(guest, "민수");
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
async function agree(pages: Page[], count: number) {
  for (const page of pages) {
    await expect.poll(() => moves(page), { timeout: 90000 }).toBe(count);
    await resting(page);
  }
  await expect
    .poll(async () => new Set(await Promise.all(pages.map((p) => p.locator("#board").getAttribute("data-state")))).size, { timeout: 20000 })
    .toBe(1);
}

test("archer duel by codes: each shoots its own archer, seen on its own left, and both fields agree after every arrow", async ({ browser }, info) => {
  test.setTimeout(400000);
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await begin(host, guest);
  await agree(pages, 0);
  // The same field on both, each device's own archer on its left (the guest sees it mirrored).
  expect(await canvas(host).getAttribute("data-land")).toBe(await canvas(guest).getAttribute("data-land"));
  await expect(canvas(host)).toHaveAttribute("data-mirror", "1");
  await expect(canvas(guest)).toHaveAttribute("data-mirror", "-1");
  await expect(host.locator(".ad-bar.ad-l .ad-name")).toHaveText("나");
  await expect(guest.locator(".ad-bar.ad-l .ad-name")).toHaveText("나");
  await expect(guest.locator(".ad-bar.ad-r .ad-name")).toHaveText("방장");
  // Out of turn the guest's pull looses nothing.
  await pull(guest, 120, 120);
  await guest.waitForTimeout(600);
  expect(await moves(host)).toBe(0);
  for (let n = 1; n <= 3; n++) {
    const side = (await turnOf(host)) as 0 | 1,
      shooter = side === 0 ? host : guest;
    // Each archer faces right on its own device.
    await expect(canvas(shooter)).toHaveAttribute("data-face", "1");
    const shot = await reckoned(shooter, side, 50);
    await pull(shooter, shot.dx, shot.dy);
    await agree(pages, n);
    expect(await canvas(host).getAttribute("data-health")).toBe(await canvas(guest).getAttribute("data-health"));
    expect(((await canvas(host).getAttribute("data-last")) ?? "").split(",")[0]).toBe(String(side));
  }
  for (const d of [a, b]) expect(d.errors).toEqual([]);
});
