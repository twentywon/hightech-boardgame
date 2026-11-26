import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { cellPos, tttSubject } from "../../src/games/tictactoe/layout";
import { APP_VERSION } from "../../src/net/protocol";
import { roomCode } from "../../src/net/lan";
import { selectGame, leaveTable } from "./library";
import { FAKE_PORT, FakeWifi, aimCamera, attachCamera } from "./fake-app";

/*
 * The collection's 참가하기 (src/ui/net-join.ts): whatever game the host chose, the guest scans its QR code or taps
 * its room from the main screen and lands at that game's table in Wi-Fi mode, with no setup window between. Inside
 * the app (the test-only fake app and camera of fake-app.ts) by a scan and by the list, in two games in turn; in a
 * plain browser by the host's two-way invite, which names its game.
 */
test.setTimeout(300000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("main.game-layout canvas");

/** A device of its own with the project's screen (a phone on the fake Wi-Fi at `ip`, or a plain browser). */
async function device(browser: Browser, info: TestInfo, wifi: FakeWifi | null, ip = "", camera = false) {
  const use = info.project.use;
  const context = await browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
  });
  if (wifi) await wifi.attach(context, ip);
  if (camera) await attachCamera(context);
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  return { page, errors };
}
/** The host opens a room of `game` from its setup, as before. */
async function hostRoom(page: Page, game: string) {
  await selectGame(page, game);
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill("방장");
  await page.locator("#net-host").click();
}
/** The collection's 참가하기 window, my name typed. */
async function joinWindow(page: Page, name: string) {
  await page.locator("#join-room").click();
  await expect(page.locator("dialog.net-join[open]")).toBeVisible();
  await page.locator("dialog.net-join #net-name").fill(name);
}
async function cellAt(page: Page, cell: number) {
  const box = (await canvas(page).boundingBox())!,
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
    await expect(page.locator("#board")).not.toHaveAttribute("data-animating", "true", { timeout: 30000 });
  }
}
/** Keys on the table's canvas, again until the move is made (a table still settling takes none). */
async function keyed(page: Page, keys: string[], count: number) {
  await expect(async () => {
    await canvas(page).focus();
    for (const key of keys) await page.keyboard.press(key);
    await expect.poll(() => moves(page), { timeout: 2000 }).toBe(count);
  }).toPass({ timeout: 30000 });
}

test("in the app: from the main screen the guest joins a tic-tac-toe room by its QR and a gomoku room from the list, plays, and goes back", async ({ browser }, info) => {
  const wifi = new FakeWifi();
  const a = await device(browser, info, wifi, "192.168.0.12"),
    b = await device(browser, info, wifi, "192.168.0.23", true),
    host = a.page,
    guest = b.page;
  await hostRoom(host, "틱택토");
  const code = host.locator("#net-room-code");
  await expect(code.locator("svg")).toBeVisible();
  const picture = await code.locator("svg").screenshot();

  // Rooms the guest may not join are listed greyed with the reason.
  const base = { wtg: "1", ed: "full", p: "1", s: "2", on: "0" };
  wifi.announce({ name: "old", address: "192.168.0.40", port: FAKE_PORT, attrs: { ...base, app: "2025.01-old", g: "chess", t: "체스", n: "지아", id: "old" } });
  wifi.announce({ name: "mine", address: "192.168.0.41", port: FAKE_PORT, attrs: { ...base, app: APP_VERSION, g: "minesweeper", t: "지뢰찾기", n: "하늘", id: "mine" } });
  await expect(guest.locator("#join-room")).toBeVisible();
  await joinWindow(guest, "민수");
  await expect(guest.locator("dialog.net-join .net-room:not(.other)")).toContainText("틱택토");
  await expect(guest.locator(".net-room.other", { hasText: "지아의 방" })).toContainText("버전이 다릅니다");
  await expect(guest.locator(".net-room.other", { hasText: "하늘의 방" })).toContainText("와이파이 여럿이가 없는 게임");
  // A typed address no room of the list has does not tell its game; a code of a game without Wi-Fi play is refused.
  await guest.locator("dialog.net-join #net-address-in").fill("192.168.0.99");
  await guest.locator("dialog.net-join #net-dial").click();
  await expect(guest.locator("dialog.net-join .net-pair-note")).toContainText("어떤 게임의 방인지 알 수 없습니다");
  await guest.locator("dialog.net-join #net-address-in").fill(roomCode(`192.168.0.12:${FAKE_PORT}`, { app: APP_VERSION, edition: "full" }, "minesweeper"));
  await guest.locator("dialog.net-join #net-dial").click();
  await expect(guest.locator("dialog.net-join .net-pair-note")).toContainText("지뢰찾기는 와이파이 여럿이가 없는 게임입니다");
  await guest.locator("dialog.net-join #net-address-in").fill("");

  // One scan of the host's code: tic-tac-toe's room window opens as a guest, already in its seat.
  await aimCamera(guest, picture);
  await guest.locator("dialog.net-join #net-scan-room").click();
  await expect(guest.locator("dialog.net-lobby:not(.net-join) .net-seats")).toBeVisible({ timeout: 20000 });
  await expect(guest.locator("dialog.net-lobby h2")).toHaveText("틱택토");
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await expect(guest.locator("dialog.entry")).toHaveCount(0);
  await expect(host.locator(".net-people li", { hasText: "민수" })).toBeVisible();
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await tap(host, 4);
  await agree([host, guest], 1);
  await expect(guest.locator("#turn")).toContainText("나 (O) 차례");
  await tap(guest, 0);
  await agree([host, guest], 2);

  // Back: the collection again, and the host is told the guest left.
  await leaveTable(guest);
  await expect(guest.locator("#join-room")).toBeVisible();
  await expect(host.locator("#turn")).toContainText("민수 님이 나갔습니다", { timeout: 15000 });

  // Now a gomoku room, joined by a tap in the main screen's list.
  await leaveTable(host);
  await hostRoom(host, "오목");
  await expect(host.locator("#net-room-code svg")).toBeVisible();
  await joinWindow(guest, "민수");
  const room = guest.locator("dialog.net-join .net-room:not(.other)", { hasText: "오목" });
  await expect(room).toContainText("방장의 방 · 1/2명");
  await room.click();
  await expect(guest.locator("dialog.net-lobby:not(.net-join) .net-seats")).toBeVisible({ timeout: 20000 });
  await expect(guest.locator("dialog.net-lobby h2")).toHaveText("오목");
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvas(page)).toBeVisible({ timeout: 30000 });
  await expect(guest.locator("#turn")).toContainText("방장 (흑돌) 차례입니다");
  await keyed(host, ["Enter"], 1);
  await agree([host, guest], 1);
  await keyed(guest, ["ArrowRight", "Enter"], 2);
  await agree([host, guest], 2);
  await leaveTable(guest);
  await expect(guest.locator("#join-room")).toBeVisible();
  // In its own turn gomoku's status line asks for the move: the room window tells who left.
  await host.locator("#net-room").click();
  await expect(host.locator(".net-seat").nth(1)).toContainText("민수 (연결 끊김)", { timeout: 15000 });
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("in a browser: the guest pastes the host's invite on the main screen and lands in that game's room; an old invite asks to open the game first", async ({ browser }, info) => {
  const a = await device(browser, info, null),
    b = await device(browser, info, null),
    host = a.page,
    guest = b.page;
  await hostRoom(host, "틱택토");
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  const invite = await offer.inputValue();
  expect(invite).toMatch(/^WTGG:TIC-TAC-TOE\/WTG1/);

  await joinWindow(guest, "민수");
  // The same code without its game (as an older device makes it) cannot say where to go.
  await guest.locator("dialog.net-join #net-offer-in").fill(invite.replace(/^WTGG:[^/]*\//, ""));
  await guest.locator("dialog.net-join #net-accept").click();
  await expect(guest.locator("dialog.net-join .net-pair-note")).toContainText("게임이 적혀 있지 않습니다");
  await guest.locator("dialog.net-join #net-offer-in").fill(invite);
  await guest.locator("dialog.net-join #net-accept").click();
  const answer = guest.locator("#net-answer");
  await expect(answer).toBeVisible({ timeout: 20000 });
  await expect(guest.locator("dialog.net-lobby h2")).toHaveText("틱택토");
  await host.locator("#net-answer-in").fill(await answer.inputValue());
  await host.locator("#net-connect").click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 30000 });
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await tap(host, 4);
  await agree([host, guest], 1);
  await tap(guest, 0);
  await agree([host, guest], 2);
  await leaveTable(guest);
  await expect(guest.locator("#join-room")).toBeVisible();
  await expect(host.locator("#turn")).toContainText("민수 님이 나갔습니다", { timeout: 15000 });
  // The seat of the guest who left is played by the host's computer (the user asked).
  await tap(host, 8);
  await agree([host], 4);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("in the app: the host leaving ends the room for everyone, and the guest is taken back to the collection", async ({ browser }, info) => {
  const wifi = new FakeWifi();
  const a = await device(browser, info, wifi, "192.168.0.12"),
    b = await device(browser, info, wifi, "192.168.0.23"),
    host = a.page,
    guest = b.page;
  await hostRoom(host, "틱택토");
  await joinWindow(guest, "민수");
  const room = guest.locator("dialog.net-join .net-room:not(.other)", { hasText: "틱택토" });
  await expect(room).toContainText("방장의 방 · 1/2명");
  await room.click();
  await expect(guest.locator("dialog.net-lobby:not(.net-join) .net-seats")).toBeVisible({ timeout: 20000 });
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await tap(host, 4);
  await agree([host, guest], 1);
  await leaveTable(host);
  const gone = guest.locator("dialog[open]", { hasText: "방이 없어졌습니다" });
  await expect(gone).toBeVisible({ timeout: 15000 });
  await expect(gone).toContainText("방장이 방을 나가서 이 방은 끝났습니다");
  await gone.getByRole("button", { name: "확인" }).click();
  await expect(guest.locator("#join-room")).toBeVisible();
  // The room is gone from the list too.
  await joinWindow(guest, "민수");
  await expect(guest.locator("dialog.net-join .net-room:not(.other)")).toHaveCount(0);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
