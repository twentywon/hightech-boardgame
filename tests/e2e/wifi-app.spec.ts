import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { cellPos, tttSubject } from "../../src/games/tictactoe/layout";
import { APP_VERSION } from "../../src/net/protocol";
import { selectGame } from "./library";
import { roomCode } from "../../src/net/lan";
import { FAKE_PORT, FakeWifi, aimCamera, attachCamera } from "./fake-app";

/*
 * 와이파이 여럿이 inside the Android app, with no QR code: each page is a phone whose `window.wtgNet` is a test-only
 * stand-in for the app (fake-app.ts), all joined by one simulated Wi-Fi. The host's room is announced and shows its
 * address; the guest sees the list (rooms of another version or game greyed), joins with one tap, plays, drops and
 * comes back to its seat by itself once its Wi-Fi is back. A guest may instead read the host's room QR code with QR 찍기
 * (the fake camera is shown the code as the host's page draws it).
 */
test.setTimeout(300000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);

/** A phone of its own on the fake Wi-Fi at `ip`, with the project's screen and the page errors it hears. */
async function phone(browser: Browser, info: TestInfo, wifi: FakeWifi, ip: string, camera = false) {
  const use = info.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
  });
  await wifi.attach(context, ip);
  if (camera) await attachCamera(context);
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
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
async function agree(pages: Page[], count: number) {
  for (const page of pages) {
    await expect.poll(() => moves(page), { timeout: 30000 }).toBe(count);
    await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  }
}

test("tic-tac-toe in the app: the room is listed and joined with one tap, played, and a dropped guest returns to its seat", async ({ browser }, info) => {
  const wifi = new FakeWifi();
  const a = await phone(browser, info, wifi, "192.168.0.12"),
    b = await phone(browser, info, wifi, "192.168.0.23"),
    host = a.page,
    guest = b.page;
  await lobby(host, "틱택토", "방장");
  // No code to show: the room opens at once with its address for typing, and the QR way is a link.
  await host.locator("#net-host").click();
  await expect(host.locator("#net-address")).toHaveText(`192.168.0.12:${FAKE_PORT}`);
  await expect(host.locator("#net-qr")).toBeVisible();
  await expect(host.locator("#net-invite")).toHaveCount(0);

  // Two rooms the guest may not join: another version's and another game's.
  const base = { wtg: "1", ed: "full", p: "1", s: "2", on: "0" };
  wifi.announce({ name: "old", address: "192.168.0.40", port: FAKE_PORT, attrs: { ...base, app: "2025.01-old", g: "tic-tac-toe", t: "틱택토", n: "지아", id: "old" } });
  wifi.announce({ name: "go", address: "192.168.0.41", port: FAKE_PORT, attrs: { ...base, app: APP_VERSION, g: "gomoku", t: "오목", n: "하늘", id: "go" } });

  await lobby(guest, "틱택토", "민수");
  await guest.locator("#net-join").click();
  const room = guest.locator(".net-room:not(.other)");
  await expect(room).toHaveCount(1);
  await expect(room).toContainText("방장의 방");
  await expect(room).toContainText("틱택토 · 1/2명");
  await expect(guest.locator(".net-room.other", { hasText: "지아의 방" })).toContainText("버전이 다릅니다");
  await expect(guest.locator(".net-room.other", { hasText: "하늘의 방" })).toContainText("다른 게임: 오목");
  await expect(guest.locator(".net-room.other").first()).toBeDisabled();

  // One tap: in the room, in the open seat; the host's announcement counts two people.
  await room.click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 15000 });
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await expect(host.locator(".net-people li", { hasText: "민수" })).toBeVisible();
  await expect.poll(() => wifi.services.get([...wifi.services.keys()].find((k) => k.startsWith("wtg-"))!)?.attrs.p).toBe("2");

  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(page.locator("main.game-layout canvas")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await tap(host, 4);
  await agree([host, guest], 1);
  await tap(guest, 0);
  await agree([host, guest], 2);

  // The guest's Wi-Fi drops while the host is to move, for a while: both are told, the room stays announced, and
  // the guest tries again by itself.
  wifi.drop(guest, true);
  await expect(guest.locator("#turn")).toContainText("방장과의 연결이 끊겼습니다. 다시 연결하는 중", { timeout: 15000 });
  await expect(host.locator("#turn")).toContainText("민수 님의 연결이 끊겼습니다", { timeout: 15000 });

  // The room's window lists the room meanwhile, marked as mine (a tap there also brings the guest back).
  await guest.locator("#net-room").click();
  const mine = guest.locator(".net-room.mine");
  await expect(mine).toContainText("내가 있던 방", { timeout: 15000 });
  await expect(mine).toContainText("게임 중");
  await guest.locator("#net-cancel").click();

  // The Wi-Fi is back: the guest is in its seat again with no tap.
  wifi.restore(guest);
  await expect(guest.locator("#turn")).toContainText("방장 (X) 차례", { timeout: 20000 });
  await expect(host.locator("#turn")).not.toContainText("연결이 끊겼습니다", { timeout: 15000 });
  expect(await moves(guest)).toBe(2);

  await tap(host, 8);
  await agree([host, guest], 3);
  await expect(guest.locator("#turn")).toContainText("나 (O) 차례");
  await tap(guest, 2);
  await agree([host, guest], 4);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("a typed address joins where the list stays empty, and a wrong one is answered with words", async ({ browser }, info) => {
  const wifi = new FakeWifi();
  const a = await phone(browser, info, wifi, "192.168.0.12"),
    b = await phone(browser, info, wifi, "192.168.0.23");
  await lobby(a.page, "틱택토", "방장");
  await a.page.locator("#net-host").click();
  await expect(a.page.locator("#net-address")).toHaveText(`192.168.0.12:${FAKE_PORT}`);
  await lobby(b.page, "틱택토", "민수");
  await b.page.locator("#net-join").click();
  await b.page.locator("#net-address-in").fill("192.168.0.99");
  await b.page.locator("#net-dial").click();
  await expect(b.page.locator(".net-pair-note")).toContainText("연결하지 못했습니다", { timeout: 15000 });
  // The address as the host shows it, port left out (the default one).
  await b.page.locator("#net-address-in").fill("192.168.0.12");
  await b.page.locator("#net-dial").click();
  await expect(b.page.locator(".net-seats")).toBeVisible({ timeout: 15000 });
  // The QR way is still there in the app: the host's invite code comes up behind its link.
  await a.page.locator("#net-qr").click();
  await expect(a.page.locator("#net-offer")).toBeVisible({ timeout: 20000 });
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("QR 찍기: the guest reads the host's room code once and is in; a refused camera and other rooms' codes are answered with words", async ({ browser }, info) => {
  const wifi = new FakeWifi();
  const a = await phone(browser, info, wifi, "192.168.0.12"),
    b = await phone(browser, info, wifi, "192.168.0.23", true),
    host = a.page,
    guest = b.page;
  await lobby(host, "틱택토", "방장");
  await host.locator("#net-host").click();
  await expect(host.locator("#net-address")).toHaveText(`192.168.0.12:${FAKE_PORT}`);
  const code = host.locator("#net-room-code");
  await expect(code.locator("svg")).toBeVisible();
  await expect(code).toHaveAttribute("data-code", roomCode(`192.168.0.12:${FAKE_PORT}`, { app: APP_VERSION, edition: "full" }, "tic-tac-toe"));
  await expect(host.locator(".net-room-code-line")).toContainText("'방장 QR 찍기'로 찍으면 바로 들어옵니다");
  const picture = await code.locator("svg").screenshot();

  await lobby(guest, "틱택토", "민수");
  await guest.locator("#net-join").click();
  // Nothing held up to the camera: refused, and the window points to the list and the address field.
  await guest.locator("#net-scan-room").click();
  await expect(guest.locator(".net-pair-note")).toContainText("카메라 사용이 허락되지 않았습니다", { timeout: 15000 });
  await expect(guest.locator(".net-pair-note")).toContainText("주소 입력");
  await expect(guest.locator(".net-room-scan")).toHaveCount(0);
  // Codes of another game and of another version, pasted into the address field, are refused as a scan would be.
  await guest.locator("#net-address-in").fill(roomCode(`192.168.0.12:${FAKE_PORT}`, { app: APP_VERSION, edition: "full" }, "gomoku"));
  await guest.locator("#net-dial").click();
  await expect(guest.locator(".net-pair-note")).toContainText("다른 게임의 방입니다: 오목");
  await guest.locator("#net-address-in").fill(roomCode(`192.168.0.12:${FAKE_PORT}`, { app: "2025.01-old", edition: "full" }, "tic-tac-toe"));
  await guest.locator("#net-dial").click();
  await expect(guest.locator(".net-pair-note")).toContainText("버전이 다릅니다");
  await guest.locator("#net-address-in").fill("");

  // The host's code held up: one scan and the guest is in its seat.
  await aimCamera(guest, picture);
  await guest.locator("#net-scan-room").click();
  await expect(guest.locator(".net-room-scan video")).toBeVisible();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 20000 });
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await expect(host.locator(".net-people li", { hasText: "민수" })).toBeVisible();

  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(page.locator("main.game-layout canvas")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await tap(host, 4);
  await agree([host, guest], 1);

  // During the game the host's room window still shows the code; a guest that dropped scans it again to return.
  await host.locator("#net-room").click();
  await expect(host.locator("#net-room-code svg")).toBeVisible();
  await host.locator("#net-cancel").click();
  // (Off the Wi-Fi a while, so that it does not come back by itself before it scans.)
  wifi.drop(guest, true);
  await expect(guest.locator("#turn")).toContainText("방장과의 연결이 끊겼습니다", { timeout: 15000 });
  await guest.locator("#net-room").click();
  await guest.locator("#net-scan-room").click();
  wifi.restore(guest);
  await expect(guest.locator(".net-status")).toContainText("게임 중입니다", { timeout: 20000 });
  await guest.locator("#net-cancel").click();
  // While the guest was away, the host's computer played its O (a guest who drops is stood in for); X is to move.
  await agree([host, guest], 2);
  await expect(guest.locator("#turn")).toContainText("방장 (X) 차례");
  // The host moves on (into the first cell still open), and both boards agree with the returned guest.
  for (const cell of [0, 1, 2, 3, 5, 6, 7, 8]) {
    await tap(host, cell);
    await host.waitForTimeout(400);
    if ((await moves(host)) === 3) break;
  }
  await agree([host, guest], 3);
  await expect(guest.locator("#turn")).toContainText("나 (O) 차례");
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("QR로 연결 in the app: its 방장 QR 찍기 reads the host's room code too", async ({ browser }, info) => {
  const wifi = new FakeWifi();
  const a = await phone(browser, info, wifi, "192.168.0.12"),
    b = await phone(browser, info, wifi, "192.168.0.23", true),
    host = a.page,
    guest = b.page;
  await lobby(host, "틱택토", "방장");
  await host.locator("#net-host").click();
  const code = host.locator("#net-room-code");
  await expect(code.locator("svg")).toBeVisible();
  const picture = await code.locator("svg").screenshot();
  await lobby(guest, "틱택토", "민수");
  await guest.locator("#net-join").click();
  // The guest chose the QR way; the host still shows its room code. The camera there reads it and the guest is in.
  await guest.locator("#net-qr").click();
  await aimCamera(guest, picture);
  await guest.locator(".net-scan-start").click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 20000 });
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await expect(host.locator(".net-people li", { hasText: "민수" })).toBeVisible();
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("table tennis in the app: the guest's finger moves its blue paddle on the host and its tap tosses its serve", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile", "fingers are the phone's");
  const wifi = new FakeWifi();
  const a = await phone(browser, info, wifi, "192.168.0.12"),
    b = await phone(browser, info, wifi, "192.168.0.23"),
    host = a.page,
    guest = b.page;
  await lobby(host, "탁구", "방장");
  await host.locator("#net-host").click();
  await lobby(guest, "탁구", "민수");
  await guest.locator("#net-join").click();
  await guest.locator(".net-room:not(.other)").click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 15000 });
  await host.locator("#net-start").click();
  const canvasOf = (page: Page) => page.locator("main.game-layout canvas");
  for (const page of [host, guest]) await expect(canvasOf(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(guest.locator("#turn")).toContainText("내 서브");
  const paddles = async () => ((await canvasOf(host).getAttribute("data-paddles")) ?? "NaN,NaN;NaN,NaN").split(";").map((p) => p.split(",").map(Number));
  const box = (await canvasOf(guest).boundingBox())!,
    cdp = await guest.context().newCDPSession(guest),
    from = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.75 },
    to = { x: box.x + box.width * 0.62, y: box.y + box.height * 0.75 };
  const before = (await paddles())[1][0];
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: from.x, y: from.y, id: 1 }] });
  for (let k = 1; k <= 6; k++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: from.x + ((to.x - from.x) * k) / 6, y: to.y, id: 1 }] });
  await expect.poll(async () => Math.abs((await paddles())[1][0] - before), { timeout: 15000 }).toBeGreaterThan(0.15);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const tossed = host.waitForFunction(() => document.querySelector<HTMLCanvasElement>("main.game-layout canvas")?.dataset.phase === "toss", null, { polling: "raf", timeout: 20000 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: to.x, y: to.y, id: 2 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await tossed;
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("yut nori for four in the app: the host starts the game with three guests and every phone lays the yard and plays on", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile", "the app is the phone's");
  const wifi = new FakeWifi();
  const phones = [await phone(browser, info, wifi, "192.168.0.12"), await phone(browser, info, wifi, "192.168.0.23"), await phone(browser, info, wifi, "192.168.0.34"), await phone(browser, info, wifi, "192.168.0.45")],
    pages = phones.map((p) => p.page),
    [host] = pages;
  await lobby(host, "윷놀이", "방장");
  await host.locator("#net-host").click();
  for (const [k, name] of ["민수", "지아", "하늘"].entries()) {
    const guest = pages[k + 1];
    await lobby(guest, "윷놀이", name);
    await guest.locator("#net-join").click();
    await guest.locator(".net-room:not(.other)").first().click();
    await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 15000 });
    await expect(host.locator(".net-people li", { hasText: name })).toBeVisible({ timeout: 15000 });
  }
  await host.locator("#net-start").click({ noWaitAfter: true, timeout: 120000 });
  for (const page of pages) await expect(page.locator("main.game-layout canvas")).toBeVisible({ timeout: 120000 });
  await expect.poll(() => host.evaluate(() => document.querySelectorAll(".yut-sides li").length), { timeout: 60000 }).toBe(4);
  const turnOf = () => host.locator("#board").getAttribute("data-turn");
  for (let k = 0; k < 4; k++) {
    for (const page of pages) await expect(page.locator("#board")).not.toHaveAttribute("data-animating", "true", { timeout: 60000 });
    // What every phone must agree on: whose turn, the throws waiting to be used and the move count (a throw moves no piece).
    const yard = (page: Page) => page.evaluate(() => [document.getElementById("board")!.dataset.turn, document.getElementById("yut-pending")?.textContent, document.getElementById("move-count")?.textContent].join(" | "));
    const mover = pages[Number(await turnOf())],
      before = await yard(host);
    const choice = mover.locator("#yut-moves button:not([disabled])");
    if (await choice.count()) await choice.first().evaluate((b) => (b as HTMLButtonElement).click());
    else {
      await expect(mover.locator("#yut-throw")).toBeEnabled({ timeout: 60000 });
      await mover.locator("#yut-throw").first().evaluate((el) => (el as HTMLElement).click());
    }
    await expect.poll(() => yard(host), { timeout: 60000 }).not.toBe(before);
    for (const page of pages) await expect.poll(() => yard(page), { timeout: 30000 }).toBe(await yard(host));
  }
  for (const p of phones) expect(p.errors).toEqual([]);
});

test("yut nori in the app: a phone whose Wi-Fi drops comes back to its seat by itself, without a tap, once the Wi-Fi is back", async ({ browser }, info) => {
  test.skip(info.project.name !== "mobile", "the app is the phone's");
  const wifi = new FakeWifi();
  const a = await phone(browser, info, wifi, "192.168.0.12"),
    b = await phone(browser, info, wifi, "192.168.0.23"),
    host = a.page,
    guest = b.page;
  await lobby(host, "윷놀이", "방장");
  await host.locator("#net-host").click();
  await lobby(guest, "윷놀이", "민수");
  await guest.locator("#net-join").click();
  await guest.locator(".net-room:not(.other)").first().click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 15000 });
  await host.locator("#net-start").click({ noWaitAfter: true, timeout: 120000 });
  for (const page of [host, guest]) await expect(page.locator("main.game-layout canvas")).toBeVisible({ timeout: 120000 });
  const yard = (page: Page) => page.evaluate(() => [document.getElementById("board")!.dataset.turn, document.getElementById("yut-pending")?.textContent, document.getElementById("move-count")?.textContent].join(" | "));
  const rest = (page: Page) => expect(page.locator("#board")).not.toHaveAttribute("data-animating", "true", { timeout: 60000 });
  // The guest's Wi-Fi goes for a while: both are told, and the host's computer stands in for the guest meanwhile.
  await rest(guest);
  wifi.drop(guest, true);
  await expect(guest.locator("#turn")).toContainText("방장과의 연결이 끊겼습니다", { timeout: 15000 });
  await expect(guest.locator("#turn")).toContainText("다시 연결하는 중", { timeout: 15000 });
  await expect(host.locator(".yut-sides")).toContainText("민수", { timeout: 15000 });
  await guest.waitForTimeout(4000);
  // The Wi-Fi is back: the guest returns to its own seat with no tap, and both yards agree.
  wifi.restore(guest);
  await expect(guest.locator("#turn")).not.toContainText("끊겼습니다", { timeout: 20000 });
  await expect(guest.locator("#yut-side-1")).toContainText("나 (홍)");
  await rest(host);
  await rest(guest);
  await expect.poll(async () => (await yard(guest)) === (await yard(host)), { timeout: 30000 }).toBe(true);
  // And it plays on: the next of its turns is its own again.
  for (let k = 0; k < 16 && (await host.locator("#board").getAttribute("data-turn")) !== "1"; k++) {
    await rest(host);
    const before = await yard(host),
      choice = host.locator("#yut-moves button:not([disabled])");
    if ((await host.locator("#board").getAttribute("data-turn")) !== "0") break;
    if (await choice.count()) await choice.first().evaluate((el) => (el as HTMLButtonElement).click());
    else await host.locator("#yut-throw").first().evaluate((el) => (el as HTMLElement).click());
    await expect.poll(() => yard(host), { timeout: 60000 }).not.toBe(before);
  }
  await rest(guest);
  await expect(guest.locator("#board")).toHaveAttribute("data-turn", "1", { timeout: 60000 });
  await expect(guest.locator("#yut-throw")).toBeEnabled({ timeout: 30000 });
  const before = await yard(guest);
  await guest.locator("#yut-throw").first().evaluate((el) => (el as HTMLElement).click());
  await expect.poll(() => yard(host), { timeout: 60000 }).not.toBe(before);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
