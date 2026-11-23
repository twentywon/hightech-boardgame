import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { ORBIT, airHockeySubject } from "../../src/games/airhockey/layout";
import { selectGame } from "./library";

/*
 * 와이파이 여럿이 on a table that runs in real time: two pages of one browser, each its own device, joined by WebRTC
 * with the pairing codes pasted. The host's device runs the one table; the guest sends its hand and draws what the
 * host tells it. The real clock is kept (no `fastClock`): the stream is timed by it.
 */
test.setTimeout(300000);

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
async function lobby(page: Page, game: string, name: string) {
  await selectGame(page, game);
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
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
const canvasOf = (page: Page) => page.locator("main.game-layout canvas");
const pair2 = (text: string | null) => (text ?? "").split(",").map(Number);
/** Both mallets as the canvas tells them (red;blue), each [x, z]. */
async function mallets(page: Page) {
  return ((await canvasOf(page).getAttribute("data-mallets")) ?? "").split(";").map(pair2);
}
/**
 * Where a point of the table is on a device's screen: through the same camera as the view's, which looks from the
 * long side of its own seat (seat 1 from the other long side, its goal at the left too).
 */
async function spot(page: Page, seat: 0 | 1, x: number, z: number) {
  const box = (await canvasOf(page).boundingBox())!,
    aspect = box.width / box.height,
    subject = airHockeySubject(aspect),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120),
    distance = cameraDistance(aspect, false, subject),
    flat = Math.cos(subject.tilt) * distance,
    orbit = ORBIT + (seat ? Math.PI : 0);
  camera.position.set(Math.sin(orbit) * flat, Math.sin(subject.tilt) * distance, Math.cos(orbit) * flat);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, 0, z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
/** Hovers the mouse over a point of the table (a mouse drives its mallet without a button). */
async function hover(page: Page, seat: 0 | 1, x: number, z: number, steps = 1) {
  const at = await spot(page, seat, x, z);
  await page.mouse.move(at.x, at.y, { steps });
}
const goals = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);

test("air hockey on two devices: the guest's hand moves its mallet on the host, each sees the table from its own side, and a goal shows on both", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, "에어하키", "방장");
  await host.locator("#net-host").click();
  await pair(host, guest, "에어하키", "민수");
  await expect(host.locator(".net-seat").nth(0)).toContainText("나");
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvasOf(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  // Each device names its own seat 나, by the mallets' colours, and says which mallet is its own.
  await expect(host.locator("#pg-side-0")).toContainText("나 (빨강)");
  await expect(host.locator("#pg-side-1")).toContainText("민수 (파랑)");
  await expect(guest.locator("#pg-side-1")).toContainText("나 (파랑)");
  await expect(guest.locator("#turn")).toContainText("내 말렛은 파랑입니다");

  // The guest's mouse over its own half (seen from its side) sends its blue mallet there on the host's table.
  await hover(guest, 1, 1.4, -2.2);
  await expect.poll(async () => (await mallets(host))[1][0], { timeout: 15000 }).toBeGreaterThan(1.1);
  const [, blue] = await mallets(host);
  expect(blue[1]).toBeLessThan(-1.8);
  // And its own screen has it there too, at once.
  await expect.poll(async () => (await mallets(guest))[1][0], { timeout: 5000 }).toBeGreaterThan(1.1);
  // The host's red mallet goes where the host's mouse is, and the guest sees it there.
  await hover(host, 0, -1.2, 3.2);
  await expect.poll(async () => (await mallets(guest))[0][0], { timeout: 15000 }).toBeLessThan(-0.9);

  // A goal: whoever has the puck in their half drives their mallet through it toward the other goal, until one goes in.
  for (let attempt = 0; attempt < 8 && (await goals(host)) === 0; attempt++) {
    const [px, pz] = pair2(await canvasOf(host).getAttribute("data-puck")),
      seat: 0 | 1 = pz >= 0 ? 0 : 1,
      page = seat === 0 ? host : guest,
      ahead = seat === 0 ? -1 : 1,
      x = Math.max(-1.6, Math.min(1.6, px));
    // Behind the puck (from my own end), away from it first, then straight through it at speed.
    await hover(page, seat, x, -ahead * 3.6);
    await page.waitForTimeout(250);
    await hover(page, seat, x, pz - ahead * 0.9);
    await page.waitForTimeout(350);
    await hover(page, seat, x, pz + ahead * 1.3, 3);
    await expect.poll(() => goals(host), { timeout: 4000 }).toBeGreaterThan(0).catch(() => {});
  }
  // The goal is on both scoreboards (the puck stays in play: the two agree whatever else goes in meanwhile).
  const board = async (page: Page) => `${await goals(page)}:${(await page.locator(".ah-points").allInnerTexts()).join("-")}`;
  await expect.poll(async () => (await board(guest)) === (await board(host)) && (await goals(host)) >= 1, { timeout: 15000 }).toBe(true);
  expect((await host.locator(".ah-points").allInnerTexts()).map(Number).reduce((x, y) => x + y)).toBeGreaterThanOrEqual(1);
  // A pause on the guest's device stops the table on both.
  await canvasOf(guest).focus();
  await guest.keyboard.press("p");
  for (const page of [host, guest]) await expect(page.locator("#board")).toHaveAttribute("data-paused", "true", { timeout: 10000 });
  // The canvas tells the table every few frames (seconds apart on a slow emulated phone): once what it tells has
  // stopped changing, the paused table stays so, and the guest's hand moves nothing on it.
  const told = async () => `${await canvasOf(host).getAttribute("data-puck")}|${await canvasOf(host).getAttribute("data-mallets")}`;
  let held = "";
  await expect
    .poll(
      async () => {
        const before = await told();
        await host.waitForTimeout(1500);
        held = await told();
        return held === before;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  await hover(guest, 1, -1.2, -3);
  await host.waitForTimeout(2500);
  expect(await told()).toBe(held);
  await canvasOf(host).focus();
  await host.keyboard.press("p");
  for (const page of [host, guest]) await expect(page.locator("#board")).toHaveAttribute("data-paused", "false", { timeout: 10000 });
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
