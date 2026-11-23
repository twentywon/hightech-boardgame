import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { selectGame } from "./library";

/*
 * 와이파이 여럿이 on the slot car track: two pages of one browser, each its own device, joined by WebRTC with the
 * pairing codes pasted. The host's device runs the one race; the guest sends its pedal and draws what the host tells
 * it. The real clock is kept (no `fastClock`): the stream is timed by it. The race is the shortest (3 laps of the bank).
 */
test.setTimeout(300000);

const open: { close(): Promise<void> }[] = [];
test.afterEach(async () => {
  for (const context of open.splice(0)) await context.close();
});
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
  open.push(context);
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  return { page, errors };
}
/** The setup with 와이파이 여럿이, a course and laps chosen, and the room window opened with my name. */
async function lobby(page: Page, name: string, course: string, laps: number) {
  await selectGame(page, "슬롯 카");
  const dialog = page.locator("dialog[open]");
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await dialog.locator("#pg-variant").selectOption(course);
  await dialog.locator("#pg-set-laps").selectOption(String(laps));
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
async function pair(host: Page, guest: Page, name: string) {
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  // The guest chose another course and more laps: the host's choice is the room's.
  await lobby(guest, name, "grand", 10);
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
const numbers = async (page: Page, name: string) => ((await canvasOf(page).getAttribute(`data-${name}`)) ?? "").split(",").map(Number);
/** The board's rows, top to bottom: each car's place and name. */
const board = (page: Page) => page.locator(".sc-board li span").allInnerTexts();

test("slot car on two devices: the guest's pedal drives its car on both screens, each marks its own car, and the race ends alike on both", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, "방장", "bank", 3);
  await host.locator("#net-host").click();
  await pair(host, guest, "민수");
  // Four seats, one a lane: the host at red, the guest at blue; the host makes yellow the computer's, green stays out.
  await expect(host.locator(".net-seat")).toHaveCount(4);
  await expect(host.locator(".net-seat").nth(0)).toContainText("나");
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await host.locator('.net-kind[data-seat="2"][data-kind="computer"]').click();
  await expect(guest.locator(".net-seat").nth(2)).toContainText("컴퓨터");
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvasOf(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });

  // The host's course and laps on both: three lanes of the bank, three laps.
  for (const page of [host, guest]) {
    await expect(canvasOf(page)).toHaveAttribute("data-lanes", "3");
    // One pedal, this device's own car's, and its car is 나 on the board.
    await expect(page.locator(".sc-pedal")).toHaveCount(1);
    await expect(page.locator(".sc-board li.me")).toHaveCount(1);
    await expect(page.locator(".sc-board li.me")).toContainText("나");
  }
  await expect(canvasOf(host)).toHaveAttribute("data-mine", "0");
  await expect(canvasOf(guest)).toHaveAttribute("data-mine", "1");
  expect(await board(guest)).toEqual(expect.arrayContaining(["빨강", "나", "노랑"]));
  expect(await board(host)).toEqual(expect.arrayContaining(["나", "파랑", "노랑"]));
  await expect(guest.locator("#pg-side-1")).toContainText("나 (파랑)");

  // The guest holds its pedal: its blue car goes, on the host's race and on its own screen; the host's red stays.
  for (const page of [host, guest]) {
    await expect(canvasOf(page)).toHaveAttribute("data-phase", "race", { timeout: 30000 });
    await expect(page.locator(".sc-board .sc-head")).toContainText("LAP 1/3");
  }
  const pedal = guest.getByRole("button", { name: "가속 페달", exact: true }),
    box = (await pedal.boundingBox())!;
  await guest.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await guest.mouse.down();
  await expect(pedal).toHaveClass(/\bon\b/);
  await expect.poll(async () => (await numbers(host, "progress"))[1], { timeout: 30000 }).toBeGreaterThan(2);
  await expect.poll(async () => (await numbers(guest, "progress"))[1], { timeout: 15000 }).toBeGreaterThan(2);
  await guest.mouse.up();
  await expect(pedal).not.toHaveClass(/\bon\b/);
  expect((await numbers(host, "progress"))[0]).toBeLessThan(0.3);
  // Let go, it slows to a stop on the host too.
  await expect.poll(async () => (await numbers(host, "speeds"))[1], { timeout: 20000 }).toBeLessThan(0.05);

  // A pause on the guest's device stops the race on both, and the host lets it run again.
  await canvasOf(guest).focus();
  await guest.keyboard.press("p");
  for (const page of [host, guest]) await expect(page.locator("#board")).toHaveAttribute("data-paused", "true", { timeout: 10000 });
  const held = await numbers(host, "progress");
  await host.waitForTimeout(1200);
  expect(await numbers(host, "progress")).toEqual(held);
  await canvasOf(host).focus();
  await host.keyboard.press("p");
  for (const page of [host, guest]) await expect(page.locator("#board")).toHaveAttribute("data-paused", "false", { timeout: 10000 });

  // The computer's yellow car laps the bank three times; then the race closes, with the same order on both devices.
  for (const page of [host, guest]) await expect(page.locator(".board-finale")).toBeVisible({ timeout: 150000 });
  await expect(guest.locator(".sc-board")).toContainText("결승 순위", { timeout: 10000 });
  const final = await host.locator("#pg-final").innerText();
  expect(final).toContain("1위 노랑");
  expect(final).toMatch(/2위 파랑\(완주 못 함\) · 3위 빨강\(완주 못 함\)/);
  await expect(guest.locator("#pg-final")).toHaveText(final);
  expect(await numbers(guest, "laps")).toEqual(await numbers(host, "laps"));
  expect(await board(guest)).toEqual((await board(host)).map((name) => (name === "나" ? "빨강" : name === "파랑" ? "나" : name)));

  // The host leaves: the room is gone for the guest too.
  await host.locator("main.game-layout #back").click();
  const gone = guest.locator("dialog[open]", { hasText: "방이 없어졌습니다" });
  await expect(gone).toBeVisible({ timeout: 15000 });
  await gone.getByRole("button", { name: "확인" }).click();
  await expect(guest.locator("#join-room")).toBeVisible();
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
