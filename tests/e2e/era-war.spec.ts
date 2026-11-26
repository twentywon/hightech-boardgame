import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { selectGame } from "./library";

/*
 * 시대 전쟁 in the browser: against the computer (soldiers trained by the buttons and the keys, a turret built and sold,
 * the powers waiting, the eye moved by a drag, a pause), and over Wi-Fi on two devices (the guest's orders carried out
 * on the host's lane, each seeing its own base at the left). The page is drawn by the processor here, a frame or two a
 * second: everything is waited for by what the canvas tells, never by the clock.
 */
test.setTimeout(300_000);
const canvas = (page: Page) => page.locator("#board canvas");
const told = async (page: Page, what: string) => ((await canvas(page).getAttribute(`data-${what}`)) ?? "").split(",").map(Number);
/** A button pressed as a finger or a click would, without waiting for a slow page's frames to settle. */
const press = (page: Page, selector: string) => page.locator(selector).dispatchEvent("click");
const key = (page: Page, code: string, shift = false) => page.evaluate(([c, s]) => void document.dispatchEvent(new KeyboardEvent("keydown", { code: c as string, shiftKey: s as boolean, bubbles: true })), [code, shift] as const);

async function sit(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "시대 전쟁");
  await page.locator("#pg-level").selectOption("easy");
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute("data-phase", "play");
  return errors;
}

test("era war against the computer: soldiers trained by the buttons and the keys, a turret built and sold, the powers waiting, the eye moved, a pause", async ({ page }, info) => {
  const errors = await sit(page);
  // The board: both bases in the stone age at full strength, me at the left, the computer at the right.
  await expect(page.locator(".ew-left b")).toHaveText("나");
  await expect(page.locator(".ew-right b")).toHaveText("컴퓨터");
  await expect(page.locator(".ew-left .ew-era")).toHaveText("석기");
  await expect(page.locator(".ew-left .ew-hp em")).toHaveText("600");
  await expect(page.locator(".ew-unit")).toHaveCount(3);
  await expect(page.locator(".ew-unit").first()).toContainText("몽둥이 전사");
  await expect(page.locator(".ew-unit").first()).toContainText("15");
  // The bar stands inside the canvas, under the board.
  const bar = (await page.locator(".ew-bar").boundingBox())!,
    board = (await page.locator(".ew-hud").boundingBox())!,
    area = (await canvas(page).boundingBox())!;
  expect(bar.y + bar.height).toBeLessThanOrEqual(area.y + area.height + 1);
  expect(bar.x).toBeGreaterThanOrEqual(area.x - 1);
  expect(bar.x + bar.width).toBeLessThanOrEqual(area.x + area.width + 1);
  expect(board.y + board.height).toBeLessThan(bar.y);
  // The special attack and the next era wait at the start.
  await expect(page.locator(".ew-ability")).toBeDisabled();
  await expect(page.locator(".ew-era-up")).toBeDisabled();
  await expect(page.locator(".ew-ability em")).toHaveText(/초$/);

  // A fighter trained by its button: paid for at once, out of my door after its training, walking to the right.
  const [gold] = await told(page, "gold");
  await press(page, '.ew-unit[data-unit="0"]');
  await expect.poll(async () => (await told(page, "gold"))[0], { timeout: 30_000 }).toBeLessThan(gold);
  await expect.poll(async () => (await told(page, "trained"))[0], { timeout: 60_000 }).toBe(1);
  // A turret in slot 1 (to the left of the stone age's 150): built, then pressed twice to sell it for half.
  await expect.poll(async () => (await told(page, "gold"))[0], { timeout: 60_000 }).toBeGreaterThanOrEqual(150);
  await press(page, '.ew-slot[data-slot="0"]');
  await expect.poll(async () => (await canvas(page).getAttribute("data-turrets"))!.split(",")[0], { timeout: 30_000 }).toBe("0 -1 -1");
  await expect(page.locator('.ew-slot[data-slot="0"]')).toHaveClass(/built/);
  await press(page, '.ew-slot[data-slot="0"]');
  await expect(page.locator('.ew-slot[data-slot="0"] b')).toHaveText("다시 눌러 팔기");
  const before = (await told(page, "gold"))[0];
  await press(page, '.ew-slot[data-slot="0"]');
  await expect.poll(async () => (await canvas(page).getAttribute("data-turrets"))!.split(",")[0], { timeout: 30_000 }).toBe("-1 -1 -1");
  expect((await told(page, "gold"))[0]).toBeGreaterThanOrEqual(before + 75);
  // A shooter by the key 2.
  await key(page, "Digit2");
  await expect.poll(async () => (await told(page, "trained"))[0], { timeout: 60_000 }).toBe(2);
  // The eye: a drag across the canvas (a phone: a tap on the strip of the lane) looks elsewhere along the lane.
  const eye = (await told(page, "eye"))[0],
    middle = { x: area.x + area.width / 2, y: area.y + area.height * 0.45 };
  if (info.project.name !== "mobile") {
    await page.mouse.move(middle.x, middle.y);
    await page.mouse.down();
    await page.mouse.move(middle.x - area.width * 0.3, middle.y, { steps: 3 });
    await page.mouse.up();
  } else {
    // A finger on the strip of the whole lane, near its right end, looks there.
    const map = (await page.locator(".ew-map").boundingBox())!;
    await page.touchscreen.tap(map.x + map.width * 0.92, map.y + map.height / 2);
  }
  await expect.poll(async () => (await told(page, "eye"))[0], { timeout: 20_000 }).toBeGreaterThan(eye + 1);
  // A pause stops the lane's clock.
  await page.locator("#pg-pause").click();
  await expect(canvas(page)).toHaveAttribute("data-phase", "paused");
  const at = (await told(page, "time"))[0];
  await page.waitForTimeout(1500);
  expect((await told(page, "time"))[0]).toBe(at);
  await page.locator("#pg-pause").click();
  await expect.poll(async () => (await told(page, "time"))[0], { timeout: 20_000 }).toBeGreaterThan(at);
  // The computer plays its side.
  await expect.poll(async () => (await told(page, "trained"))[1], { timeout: 60_000 }).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

/* ── Over Wi-Fi: two devices, pairing codes pasted (as wifi-live.spec.ts does). ── */
const open: { close(): Promise<void> }[] = [];
test.afterEach(async () => {
  for (const context of open.splice(0)) await context.close();
});
async function device(browser: Browser, info: TestInfo) {
  const use = info.project.use;
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent });
  open.push(context);
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  return { page, errors };
}
async function lobby(page: Page, name: string) {
  await selectGame(page, "시대 전쟁");
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
async function pair(host: Page, guest: Page, name: string) {
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  await lobby(guest, name);
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

test("era war on two devices: each sees its own base at the left, and the guest's orders are carried out on the host's lane", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, "방장");
  await host.locator("#net-host").click();
  await pair(host, guest, "민수");
  await host.locator("#net-start").click();
  for (const page of [host, guest]) await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 60000 });
  await expect(canvas(host)).toHaveAttribute("data-mine", "0");
  await expect(canvas(guest)).toHaveAttribute("data-mine", "1");
  // Each names itself 나 at the left, in its own colour (the guest's picture is mirrored: its blue base at the left).
  for (const page of [host, guest]) {
    await expect(page.locator(".ew-left b")).toHaveText("나");
    await expect(page.locator(".ew-right b")).toHaveText("상대");
  }
  expect(await guest.locator(".ew-left").getAttribute("style")).toContain("#2f6ed0");
  expect(await host.locator(".ew-left").getAttribute("style")).toContain("#d2452b");
  // The guest's picture comes from the host: its gold is the host's count of side 1.
  await expect.poll(async () => (await told(guest, "gold"))[1], { timeout: 30000 }).toBeGreaterThan(0);
  // The guest trains a fighter: the host's lane trains it for side 1, and both see it come out.
  await press(guest, '.ew-unit[data-unit="0"]');
  await expect.poll(async () => (await told(host, "trained"))[1], { timeout: 60000 }).toBe(1);
  await expect.poll(async () => (await told(guest, "units"))[1], { timeout: 60000 }).toBeGreaterThanOrEqual(1);
  // The host trains one: the guest sees side 0's soldier.
  await press(host, '.ew-unit[data-unit="0"]');
  await expect.poll(async () => (await told(guest, "units"))[0], { timeout: 60000 }).toBeGreaterThanOrEqual(1);
  // A turret built by the guest stands on the guest's base (side 1) on both screens.
  await expect.poll(async () => (await told(host, "gold"))[1], { timeout: 60000 }).toBeGreaterThanOrEqual(150);
  await press(guest, '.ew-slot[data-slot="2"]');
  await expect.poll(async () => (await canvas(host).getAttribute("data-turrets"))!.split(",")[1], { timeout: 30000 }).toBe("-1 -1 0");
  await expect.poll(async () => (await canvas(guest).getAttribute("data-turrets"))!.split(",")[1], { timeout: 30000 }).toBe("-1 -1 0");
  // Each order once: the guest's one fighter is still one on the host.
  expect((await told(host, "trained"))[1]).toBe(1);
  // A pause by the guest pauses the host's lane.
  await guest.locator("#pg-pause").click();
  await expect(canvas(host)).toHaveAttribute("data-phase", "paused", { timeout: 20000 });
  await guest.locator("#pg-pause").click();
  await expect(canvas(host)).toHaveAttribute("data-phase", "play", { timeout: 20000 });
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
