import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { BG_SUBJECT, DICE_AT } from "../../src/games/backgammon/view";
import { CLOCKWISE, type State as LudoState } from "../../src/games/ludo/rules";
import { LUDO_SUBJECT, dieAt, tokenAt } from "../../src/games/ludo/view";
import { DICE as UR_DICE, UR_SUBJECT, pieceAt } from "../../src/games/ur/view";
import type { TableSubject } from "../../src/games/table/view";
import { selectGame } from "./library";
import { FakeWifi } from "./fake-app";

/*
 * 와이파이 여럿이 for the games of dice and for tactical battle: pages of one browser, each its own device, joined by
 * pasted pairing codes (the QR way) or by the app's room list on a simulated Wi-Fi (fake-app.ts). The player to move
 * throws on their own device; the throw is decided on the host when it takes it, and every device shows the same
 * dice and the same board (the canvases carry them as data attributes).
 */
test.setTimeout(400000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("main.game-layout canvas");

async function open(context: BrowserContext) {
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  return { page, errors };
}
function contextOf(browser: Browser, info: TestInfo) {
  const use = info.project.use;
  return browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
  });
}
/** A device paired by codes. */
const device = async (browser: Browser, info: TestInfo) => open(await contextOf(browser, info));
/** A phone of the app on the fake Wi-Fi at `ip`. */
async function phone(browser: Browser, info: TestInfo, wifi: FakeWifi, ip: string) {
  const context = await contextOf(browser, info);
  await wifi.attach(context, ip);
  return open(context);
}
async function lobby(page: Page, game: string, name: string) {
  await selectGame(page, game);
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
/** The host invites, the guest answers, the host takes the answer: both see the room. */
async function pair(host: Page, guest: Page, game: string, name: string) {
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  await lobby(guest, game, name);
  await guest.locator("#net-join").click();
  await guest.locator("#net-offer-in").fill(await offer.inputValue());
  await guest.locator("#net-accept").click();
  const answer = guest.locator("#net-answer");
  await expect(answer).toBeVisible({ timeout: 20000 });
  await host.locator("#net-answer-in").fill(await answer.inputValue());
  await host.locator("#net-connect").click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 30000 });
  await expect(host.locator(".net-people li", { hasText: name })).toBeVisible();
}
/** The guest joins the host's room from the app's list with one tap. */
async function joinListed(guest: Page, game: string, name: string) {
  await lobby(guest, game, name);
  await guest.locator("#net-join").click();
  await guest.locator(".net-room:not(.other)").click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 15000 });
}
async function start(host: Page, pages: Page[]) {
  await host.locator("#net-start").click();
  for (const page of pages) await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
}
/** Every page shows `count` moves, rests, and its canvas carries the same `attrs`. */
async function agree(pages: Page[], count: number, attrs: string[] = []) {
  for (const page of pages) {
    await expect.poll(() => moves(page), { timeout: 30000 }).toBe(count);
    await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  }
  for (const name of attrs) {
    const seen = await Promise.all(pages.map((p) => canvas(p).getAttribute(`data-${name}`)));
    expect(seen[0], name).not.toBeNull();
    expect(new Set(seen).size, `${name}: ${seen.join(" | ")}`).toBe(1);
  }
}
/** The page whose own seat is to move: its status line names it 나. */
async function mover(pages: Page[]) {
  let found: Page | undefined;
  await expect
    .poll(
      async () => {
        for (const page of pages) if (/나 \(/.test(await page.locator("#turn").innerText())) return (found = page), true;
        return false;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  return found!;
}
/** Where a point of the table is on the screen, through the same camera as the table's. */
async function onScreen(page: Page, subject: TableSubject, p: { x: number; y?: number; z: number }) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    flat = Math.cos(subject.tilt) * distance;
  camera.position.set(0, Math.sin(subject.tilt) * distance, flat);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(p.x, p.y ?? 0.3, p.z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
/** The table's tool (the dice, a command), pressed; it is greyed on a device whose seat is not to move. */
const tool = (page: Page, label: string) => page.locator(".board-area .pg-tools").getByRole("button", { name: label });
/** The tools lie one over another, out of sight (the table is tapped instead): pressed as a keyboard would. */
async function roll(page: Page, label: string) {
  await expect(tool(page, label)).toBeEnabled();
  await tool(page, label).dispatchEvent("click");
}
/** A tap on the table where the dice lie, on a device whose seat is not to move: refused with words. */
async function refusedAt(page: Page, subject: TableSubject, place: { x: number; z: number }) {
  await expect(tool(page, subject === UR_SUBJECT ? "주사위 던지기" : "주사위 굴리기")).toBeDisabled();
  const at = await onScreen(page, subject, place);
  await page.mouse.click(at.x, at.y);
  await expect(page.locator("#turn")).toContainText("상대 차례입니다");
}
/** Waits until a person is to move (the host's computer may play on meanwhile) with every page at rest on one move. */
async function settled(pages: Page[]) {
  await expect
    .poll(
      async () => {
        const counts = await Promise.all(pages.map(moves)),
          resting = await Promise.all(pages.map((p) => p.locator("#board").getAttribute("data-animating"))),
          turns = await Promise.all(pages.map((p) => p.locator("#turn").innerText()));
        return new Set(counts).size === 1 && resting.every((r) => r === "false") && turns.some((t) => /나 \(|승리|이겼습니다/.test(t));
      },
      { timeout: 40000 },
    )
    .toBe(true);
  return moves(pages[0]);
}
/** Taps the places given, one after another, until a move is made (a wrong tap only changes the choice). */
async function tapUntilMoved(page: Page, subject: TableSubject, places: { x: number; y?: number; z: number }[]) {
  const count = await moves(page);
  for (const place of places) {
    const at = await onScreen(page, subject, place);
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(400);
    if ((await moves(page)) > count || !/말을 고르세요/.test(await page.locator("#turn").innerText())) return;
  }
}

test("snakes and ladders for three by codes: each throws on its own device, the same rolls everywhere, out of turn refused", async ({ browser }, info) => {
  const devices = [await device(browser, info), await device(browser, info), await device(browser, info)],
    pages = devices.map((d) => d.page),
    [host, g1, g2] = pages;
  await lobby(host, "뱀과 사다리", "방장");
  await host.locator("#net-host").click();
  await pair(host, g1, "뱀과 사다리", "민수");
  await pair(host, g2, "뱀과 사다리", "지아");
  // 빨강 the host, 파랑 and 초록 the guests; 노랑 is left out.
  await host.locator('.net-kind[data-seat="3"][data-kind="closed"]').click();
  await expect(g2.locator(".net-seat").nth(2)).toContainText("나");
  await start(host, pages);
  await expect(g1.locator("#turn")).toContainText("방장 (빨강) 차례입니다");
  // A throw out of turn is refused with words; nothing is played anywhere.
  await canvas(g2).click();
  await expect(g2.locator("#turn")).toContainText("상대 차례입니다");
  expect(await moves(host)).toBe(0);
  for (let n = 1; n <= 8; n++) {
    const page = await mover(pages);
    await canvas(page).click();
    await agree(pages, n, ["die", "squares"]);
  }
  // Three tokens on the board, never a fourth.
  expect((await canvas(host).getAttribute("data-squares"))!.split(",")).toHaveLength(3);
  for (const d of devices) expect(d.errors).toEqual([]);
});

test("ludo in the app: two phones and the host's computer as yellow, the road's order, the same die and tokens on both", async ({ browser }, info) => {
  const wifi = new FakeWifi();
  const a = await phone(browser, info, wifi, "192.168.0.12"),
    b = await phone(browser, info, wifi, "192.168.0.23"),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await lobby(host, "루도", "방장");
  await host.locator("#net-host").click();
  await joinListed(guest, "루도", "민수");
  // 빨강 the host, 초록 the guest; 노랑 the host's computer, 파랑 left out.
  await host.locator('.net-kind[data-seat="2"][data-kind="computer"]').click();
  await host.locator('.net-kind[data-seat="3"][data-kind="closed"]').click();
  await start(host, pages);
  const colors = CLOCKWISE.filter((c) => c !== 3);
  await expect(guest.locator("#turn")).toContainText("방장 (빨강) 차례입니다");
  // With blue left out the die lies in blue's empty yard.
  await refusedAt(guest, LUDO_SUBJECT, dieAt({ colors, turn: 0 } as LudoState));
  let count = 0;
  for (let step = 0; step < 40 && count < 12; step++) {
    const page = await mover(pages);
    if (/말을 고르세요/.test(await page.locator("#turn").innerText())) {
      const tokens: number[][] = JSON.parse((await canvas(page).getAttribute("data-tokens"))!),
        side = page === host ? 0 : colors.indexOf(1),
        color = colors[side];
      await tapUntilMoved(page, LUDO_SUBJECT, tokens[side].map((progress, k) => tokenAt(color, progress, k)));
    } else await roll(page, "주사위 굴리기");
    // The computer's yellow may follow at once: wait until a person is to move, both at rest on the same move.
    await expect.poll(() => moves(host), { timeout: 30000 }).toBeGreaterThan(count);
    count = await settled(pages);
    await agree(pages, count, ["die", "tokens"]);
  }
  expect(count).toBeGreaterThanOrEqual(8);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("the Royal Game of Ur by codes: throws and pieces on two devices, the same dice on both", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await lobby(host, "우르 왕실 게임", "방장");
  await host.locator("#net-host").click();
  await pair(host, guest, "우르 왕실 게임", "민수");
  await start(host, pages);
  await refusedAt(guest, UR_SUBJECT, UR_DICE);
  let count = 0;
  for (let step = 0; step < 30 && count < 10; step++) {
    const page = await mover(pages);
    if (/말을 고르세요/.test(await page.locator("#turn").innerText())) {
      const pieces: number[][] = JSON.parse((await canvas(page).getAttribute("data-pieces"))!),
        side = page === host ? 0 : 1;
      await tapUntilMoved(page, UR_SUBJECT, pieces[side].map((progress, k) => pieceAt(side, progress, k)));
    } else await roll(page, "주사위 던지기");
    await expect.poll(() => moves(host), { timeout: 30000 }).toBeGreaterThan(count);
    count = await moves(host);
    await agree(pages, count, ["dice", "pieces"]);
  }
  expect(count).toBeGreaterThanOrEqual(6);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("backgammon in the app: white throws on the host's phone and the guest's phone shows the same two dice", async ({ browser }, info) => {
  const wifi = new FakeWifi();
  const a = await phone(browser, info, wifi, "192.168.0.12"),
    b = await phone(browser, info, wifi, "192.168.0.23"),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await lobby(host, "백개먼", "방장");
  await host.locator("#net-host").click();
  await joinListed(guest, "백개먼", "민수");
  await start(host, pages);
  await refusedAt(guest, BG_SUBJECT, DICE_AT);
  await roll(host, "주사위 굴리기");
  await agree(pages, 1, ["dice", "pieces"]);
  expect((await canvas(guest).getAttribute("data-dice"))!).toMatch(/^[1-6],[1-6]$/);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("tactical battle by codes: the side of the unit to act moves on its own device, the other is refused", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page];
  await lobby(a.page, "전술 대전", "방장");
  await a.page.locator("#net-host").click();
  await pair(a.page, b.page, "전술 대전", "민수");
  await start(a.page, pages);
  for (let n = 1; n <= 6; n++) {
    const page = await mover(pages),
      other = page === a.page ? b.page : a.page;
    // The other army's commands are greyed on its device, and its status line names whose unit acts.
    await expect(tool(other, "대기")).toBeDisabled();
    await expect(other.locator("#turn")).toContainText("차례");
    await roll(page, "대기");
    await agree(pages, n);
  }
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
