import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { selectGame, leaveTable } from "./library";

/*
 * 와이파이 여럿이 on the 땅따먹기 field: two pages of one browser, each its own device, joined by WebRTC with the pairing
 * codes pasted. The host's device runs the one round (and a computer's mover on a third seat); the guest sends the
 * heading it wants and draws what the host tells it, the field laid from the host's slices. The real clock is kept.
 * The round is the shortest (one minute).
 */
test.setTimeout(360_000);

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
async function lobby(page: Page, name: string, variant: string) {
  await selectGame(page, "땅따먹기");
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator("dialog[open] #pg-variant").selectOption(variant);
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
async function pair(host: Page, guest: Page, name: string) {
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  // The guest chose a longer round: the host's is the room's.
  await lobby(guest, name, "300");
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
const canvasOf = (page: Page) => page.locator("main.game-layout #board canvas");
const list = async (page: Page, what: string) => ((await canvasOf(page).getAttribute(`data-${what}`)) ?? "").split(",").map(Number);
const key = (page: Page, code: string, down: boolean) => page.evaluate(([c, d]) => void document.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { code: c as string, bubbles: true })), [code, down] as const);
const near = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

test("territory on two devices: the guest steers its own mover on both screens, the field is alike on both, a pause stops both, and the round ends alike @alone", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, "방장", "60");
  await host.locator("#net-host").click();
  await pair(host, guest, "민수");
  // Four seats: the host at red, the guest at blue; the host makes yellow the computer's, green stays out.
  await expect(host.locator(".net-seat")).toHaveCount(4);
  await expect(host.locator(".net-seat").nth(0)).toContainText("나");
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  await host.locator('.net-kind[data-seat="2"][data-kind="computer"]').click();
  await expect(guest.locator(".net-seat").nth(2)).toContainText("컴퓨터");
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvasOf(page)).toHaveAttribute("data-ready", "true", { timeout: 60000 });

  // Three movers on both; each device's own is 나 on its board; the host's round (one minute).
  for (const page of [host, guest]) {
    await expect(canvasOf(page)).toHaveAttribute("data-movers", "3");
    await expect(page.locator(".ld-board li")).toHaveCount(3);
    await expect(page.locator(".ld-board li.ld-me")).toContainText("나");
  }
  await expect(canvasOf(host)).toHaveAttribute("data-mine", "0");
  await expect(canvasOf(guest)).toHaveAttribute("data-mine", "1");
  await expect(guest.locator(".ld-board")).toContainText("빨강");
  await expect(host.locator(".ld-board")).toContainText("파랑");
  for (const page of [host, guest]) await expect(canvasOf(page)).toHaveAttribute("data-phase", "play", { timeout: 60000 });
  await expect.poll(async () => Number(await canvasOf(guest).getAttribute("data-left")), { timeout: 30000 }).toBeLessThanOrEqual(60);

  // The guest holds ← : its blue mover turns left on the host's round and on its own screen; the host's red does not.
  await key(guest, "ArrowLeft", true);
  await expect.poll(async () => near((await list(host, "heading"))[1], Math.PI), { timeout: 30000 }).toBeLessThan(0.15);
  await expect.poll(async () => near((await list(guest, "heading"))[1], Math.PI), { timeout: 15000 }).toBeLessThan(0.15);
  await key(guest, "ArrowLeft", false);
  // The guest's field and board come to what the host's are (the computer's mover takes land meanwhile).
  await expect
    .poll(
      async () => {
        const [h, g] = [await list(host, "shares"), await list(guest, "shares")];
        return h.every((v, k) => Math.abs(v - g[k]) < 0.6);
      },
      { timeout: 30000 },
    )
    .toBe(true);
  expect(Math.max(...(await list(host, "shares")))).toBeGreaterThan(0.5);

  // A pause on the guest's device stops the round on both; the host lets it run again.
  await canvasOf(guest).focus();
  await guest.keyboard.press("p");
  for (const page of [host, guest]) await expect(page.locator("#board")).toHaveAttribute("data-paused", "true", { timeout: 10000 });
  const held = await canvasOf(host).getAttribute("data-pos");
  await host.waitForTimeout(1200);
  expect(await canvasOf(host).getAttribute("data-pos")).toBe(held);
  await canvasOf(host).focus();
  await host.keyboard.press("p");
  for (const page of [host, guest]) await expect(page.locator("#board")).toHaveAttribute("data-paused", "false", { timeout: 10000 });

  // The minute runs out: the same order and shares on both devices.
  for (const page of [host, guest]) await expect(page.locator(".board-finale")).toBeVisible({ timeout: 240000 });
  const final = await host.locator("#pg-final").innerText();
  expect(final).toMatch(/1위 (빨강|파랑|노랑) \d+\.\d%/);
  await expect(guest.locator("#pg-final")).toHaveText(final);
  for (const page of [host, guest]) await expect(canvasOf(page)).toHaveAttribute("data-phase", "over");

  // The host leaves: the room is gone for the guest too.
  await leaveTable(host);
  const gone = guest.locator("dialog[open]", { hasText: "방이 없어졌습니다" });
  await expect(gone).toBeVisible({ timeout: 15000 });
  await gone.getByRole("button", { name: "확인" }).click();
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
