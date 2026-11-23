import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { cellPos, tttSubject } from "../../src/games/tictactoe/layout";
import { APP_VERSION } from "../../src/net/protocol";
import { selectGame } from "./library";
import { FAKE_PORT, FakeWifi } from "./fake-app";

/*
 * 와이파이 여럿이 inside the Android app, with no QR code: each page is a phone whose `window.wtgNet` is a test-only
 * stand-in for the app (fake-app.ts), all joined by one simulated Wi-Fi. The host's room is announced and shows its
 * address; the guest sees the list (rooms of another version or game greyed), joins with one tap, plays, drops and
 * comes back to its seat by tapping the room again.
 */
test.setTimeout(300000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);

/** A phone of its own on the fake Wi-Fi at `ip`, with the project's screen and the page errors it hears. */
async function phone(browser: Browser, info: TestInfo, wifi: FakeWifi, ip: string) {
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

  // The guest's Wi-Fi drops while the host is to move: both are told, the room stays announced.
  wifi.drop(guest);
  await expect(guest.locator("#turn")).toContainText("방장과의 연결이 끊겼습니다", { timeout: 15000 });
  await expect(host.locator("#turn")).toContainText("민수 님의 연결이 끊겼습니다", { timeout: 15000 });

  // The room's window lists the room again, marked as mine; a tap brings the guest back to its seat.
  await guest.locator("#net-room").click();
  const mine = guest.locator(".net-room.mine");
  await expect(mine).toContainText("내가 있던 방", { timeout: 15000 });
  await expect(mine).toContainText("게임 중");
  await mine.click();
  await expect(guest.locator(".net-status")).toContainText("게임 중입니다", { timeout: 15000 });
  await guest.locator("#net-cancel").click();
  await expect(guest.locator("#turn")).toContainText("방장 (X) 차례");
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
