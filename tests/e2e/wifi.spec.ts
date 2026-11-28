import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { cellPos, tttSubject } from "../../src/games/tictactoe/layout";
import { selectGame } from "./library";

/*
 * 와이파이 여럿이: two or three pages of one browser, each its own device, joined by WebRTC with the pairing codes
 * pasted (no camera). One page hosts the room, the others join it; each then plays only its own seat.
 */
test.setTimeout(300000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);

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
  return { page, errors };
}
/** Enters a game in the Wi-Fi mode: the room's window opens with my name typed. */
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
/** Where a cell of tic-tac-toe is on the screen, through the same camera as the table's. */
async function cellAt(page: Page, cell: number) {
  const box = (await page.locator("main.game-layout canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = tttSubject("classic", aspect),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    distance = cameraDistance(aspect, false, subject),
    flat = Math.cos(subject.tilt) * distance;
  camera.position.set(0, Math.sin(subject.tilt) * distance, flat);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const p = cellPos("classic", cell),
    v = new Vector3(p.x, p.y + 0.05, p.z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
async function tap(page: Page, cell: number) {
  const at = await cellAt(page, cell);
  await page.mouse.click(at.x, at.y);
}
/** Waits until every page shows `count` moves and the table rests. */
async function agree(pages: Page[], count: number) {
  for (const page of pages) {
    await expect.poll(() => moves(page), { timeout: 30000 }).toBe(count);
    await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  }
}

test("tic-tac-toe on two devices: each moves in turn, both boards agree, a move out of turn is refused, an undo is asked and accepted", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, "틱택토", "방장");
  await host.locator("#net-host").click();
  await pair(host, guest, "틱택토", "민수");
  // The host sits at X and the guest took O; the host starts.
  await expect(host.locator(".net-seat").nth(0)).toContainText("나");
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(page.locator("main.game-layout canvas")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(guest.locator("#turn")).toContainText("방장 (X) 차례입니다");

  // X moves first: the guest's tap is refused with words and nothing is played anywhere.
  await tap(guest, 0);
  await expect(guest.locator("#turn")).toContainText("상대 차례입니다");
  expect(await moves(host)).toBe(0);

  await tap(host, 4);
  await agree([host, guest], 1);
  await expect(guest.locator("#turn")).toContainText("나 (O) 차례");
  await tap(guest, 0);
  await agree([host, guest], 2);
  await expect(host.locator("#turn")).toContainText("나 (X) 차례");
  // It is X's turn again: another tap of the guest's is refused.
  await tap(guest, 8);
  await expect(guest.locator("#turn")).toContainText("상대 차례입니다");
  expect(await moves(host)).toBe(2);

  // The guest asks to take its O back; the host accepts; both are back at one move.
  await guest.locator("#pg-undo").click();
  await expect(host.locator("#net-ask")).toBeVisible({ timeout: 15000 });
  await expect(host.locator("#net-ask")).toContainText("민수 님이 무르기를 요청했습니다");
  await host.locator("#net-ask .net-yes").click();
  await agree([host, guest], 1);
  await expect(guest.locator("#turn")).toContainText("나 (O) 차례");

  // And again, played the other way, to the same board.
  await tap(guest, 2);
  await agree([host, guest], 2);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("hex conquest for three on three devices: one nation each, the map and every move the same everywhere", async ({ browser }, info) => {
  const devices = [await device(browser, info), await device(browser, info), await device(browser, info)],
    [host, g1, g2] = devices.map((d) => d.page);
  await lobby(host, "헥스 정복전", "방장");
  await host.locator("#net-host").click();
  await pair(host, g1, "헥스 정복전", "민수");
  await pair(host, g2, "헥스 정복전", "지아");
  // 청국 the host, 홍국 and 황국 the guests; 흑국 stays empty (a corner of plain land).
  await expect(host.locator(".net-seat").nth(1)).toContainText("민수");
  await expect(host.locator(".net-seat").nth(2)).toContainText("지아");
  await host.locator("#net-start").click();
  const canvases = [host, g1, g2].map((p) => p.locator("main.game-layout canvas"));
  for (const c of canvases) await expect(c).toHaveAttribute("data-phase", "setup", { timeout: 60000 });
  // The map is the same on every device: laid from the room's seed.
  const places = await canvases[0].getAttribute("data-places");
  for (const c of canvases) expect(await c.getAttribute("data-places")).toBe(places);
  await expect(g1.locator("#turn")).toContainText("방장이 지도를 보고 시작합니다");
  // Only the host starts.
  await host.getByRole("button", { name: "시작", exact: true }).click();
  for (const c of canvases) await expect(c).toHaveAttribute("data-phase", "play", { timeout: 30000 });

  // 청국 (the host) moves first; a guest pressing E is refused.
  await canvases[1].focus();
  await g1.keyboard.press("e");
  await expect(g1.locator("#turn")).toContainText("상대 차례입니다");
  // Each nation ends its turn from its own device, in the order of play 청국, 홍국, 황국.
  const order = [host, g1, g2];
  for (const [turn, page] of order.entries()) {
    const before = await moves(host);
    await canvases[turn].focus();
    await page.keyboard.press("e");
    for (const p of order) await expect.poll(() => moves(p), { timeout: 30000 }).toBeGreaterThan(before);
  }
  const armies = await canvases[0].getAttribute("data-armies");
  for (const c of canvases) await expect(c).toHaveAttribute("data-armies", armies!, { timeout: 30000 });
  for (const d of devices) expect(d.errors).toEqual([]);
});
