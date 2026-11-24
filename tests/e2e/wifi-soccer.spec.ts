import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { selectGame } from "./library";

/*
 * 와이파이 여럿이 on the soccer pitch: two pages of one browser, each its own device, joined by WebRTC with the pairing
 * codes pasted. The host's device runs the one match; the guest sends its hand and draws what the host tells it. The
 * real clock is kept (no `fastClock`): the stream is timed by it. The match is to one goal.
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
/** The waiting room with a mode and a score limit, then its Wi-Fi room's window with my name. */
async function lobby(page: Page, name: string, mode: "flat" | "gravity", goals: string) {
  await selectGame(page, "축구");
  const dialog = page.locator("dialog[open]");
  await dialog.locator(`#so-mode + .choice-group .choice[data-value="${mode}"]`).click();
  await dialog.locator(`#so-goals + .choice-group .choice[data-value="${goals}"]`).click();
  await dialog.locator("#so-wifi").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
async function pair(host: Page, guest: Page, name: string) {
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  // The guest chose the other pitch and another limit: the host's choice is the room's.
  await lobby(guest, name, "gravity", "5");
  await guest.locator("#net-join").click();
  await guest.locator("#net-offer-in").fill(await offer.inputValue());
  await guest.locator("#net-accept").click();
  const answer = guest.locator("#net-answer");
  await expect(answer).toBeVisible({ timeout: 20000 });
  await host.locator("#net-answer-in").fill(await answer.inputValue());
  await host.locator("#net-connect").click();
  await expect(guest.locator(".net-camps")).toBeVisible({ timeout: 30000 });
  await expect(host.locator(".net-camps .so-row", { hasText: name })).toBeVisible();
}
const canvasOf = (page: Page) => page.locator("main.game-layout canvas");
async function men(page: Page) {
  return ((await canvasOf(page).getAttribute("data-men")) ?? "").split(";").map((p) => p.split(",").map(Number));
}
const rows = (page: Page, camp: string) => page.locator(`.net-camps .so-camp.${camp} .so-row`).allInnerTexts();

test("soccer on two devices: the camps of the room, the guest's hand moving its player on both screens, a pause on both, and the same result @alone", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, "방장", "flat", "1");
  await host.locator("#net-host").click();
  await expect(host.locator(".net-camps .so-camp-head")).toHaveText([/레드/, /관전/, /블루/]);
  await expect(host.locator(".net-camps .so-room-title small")).toContainText("평면 축구 · 한 팀 최대 3명");
  await pair(host, guest, "민수");
  // The host in red, the guest in blue (people fill the teams in turn); each sees itself as 나.
  expect(await rows(host, "t0")).toEqual(["나 방장"]);
  expect(await rows(host, "t1")).toEqual(["민수"]);
  expect(await rows(guest, "t1")).toEqual(["나"]);
  // The guest goes to watch, then back to blue by the heads of the camps.
  await guest.locator('.net-camps .so-camp-head[data-camp="wait"]').click();
  await expect(host.locator(".net-camps .so-camp.wait .so-row")).toHaveText(["민수"]);
  await expect(host.locator(".net-camps .so-room-note")).toContainText("블루 팀에 한 명 이상");
  await expect(host.locator("#net-start")).toBeDisabled();
  await guest.locator('.net-camps .so-camp-head[data-camp="1"]').click();
  await expect(host.locator(".net-camps .so-camp.t1 .so-row")).toHaveText(["민수"]);
  // The host puts a computer beside the guest in blue.
  await host.locator(".net-camps .so-camp.t1 .so-add").first().click();
  await expect(guest.locator(".net-camps .so-camp.t1 .so-row")).toHaveText(["나", "컴퓨터"]);
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvasOf(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });

  // The host's pitch on both; each its own player (the guest is blue's first, player 1).
  for (const page of [host, guest]) await expect(canvasOf(page)).toHaveAttribute("data-mode", "flat");
  await expect(canvasOf(host)).toHaveAttribute("data-mine", "0");
  await expect(canvasOf(guest)).toHaveAttribute("data-mine", "1");
  await expect(guest.locator(".so-side.mine")).toContainText("블루");

  // The guest holds ↑: its player goes up the pitch on the host's match and on its own screen.
  const start = await men(host);
  await canvasOf(guest).focus();
  await guest.keyboard.down("ArrowUp");
  await expect.poll(async () => (await men(host))[1][1], { timeout: 20000 }).toBeGreaterThan(start[1][1] + 0.8);
  await expect.poll(async () => (await men(guest))[1][1], { timeout: 10000 }).toBeGreaterThan(start[1][1] + 0.6);
  await guest.keyboard.up("ArrowUp");
  expect((await men(host))[0]).toEqual(start[0]);

  // A pause on the guest's device stops the match on both; the host lets it run again.
  await guest.keyboard.press("p");
  for (const page of [host, guest]) await expect(page.locator("#board")).toHaveAttribute("data-paused", "true", { timeout: 10000 });
  const held = await canvasOf(host).getAttribute("data-men");
  await host.waitForTimeout(1000);
  expect(await canvasOf(host).getAttribute("data-men")).toBe(held);
  await canvasOf(host).focus();
  await host.keyboard.press("p");
  for (const page of [host, guest]) await expect(page.locator("#board")).toHaveAttribute("data-paused", "false", { timeout: 10000 });

  // Nobody kicks off: the kickoff opens after its wait and blue's computer scores the one goal. Blue wins on both.
  for (const page of [host, guest]) await expect(page.locator(".board-finale")).toBeVisible({ timeout: 200000 });
  await expect(guest.locator(".board-finale")).toContainText("승리");
  await expect(host.locator(".board-finale")).toContainText("패배");
  await expect(host.locator("#pg-final")).toContainText("블루 팀이 1 대 0으로 이겼습니다.");
  await expect(guest.locator("#pg-final")).toContainText("이겼습니다! 블루 팀이 1 대 0으로 이겼습니다.");

  // The host leaves: the room is gone for the guest too.
  await host.locator("main.game-layout #back").click();
  const gone = guest.locator("dialog[open]", { hasText: "방이 없어졌습니다" });
  await expect(gone).toBeVisible({ timeout: 15000 });
  await gone.getByRole("button", { name: "확인" }).click();
  await expect(guest.locator("#join-room")).toBeVisible();
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
