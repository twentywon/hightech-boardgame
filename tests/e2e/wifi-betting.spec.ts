import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { fastClock, selectGame } from "./library";

/*
 * 와이파이 여럿이 on the betting card games: two pages of one browser, each its own device, joined by WebRTC with the
 * pairing codes pasted. The host sits at the first seat, the guest at the second, the other seats closed. The host's
 * device deals; each device bets only in its own turn; each sees only its own cards until the showdown, which shows
 * both hands alike on both devices, and the chips agree. Buttons are pressed through the page (the deal is a pixel).
 */
test.setTimeout(420000);

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
  // The deals and the computer's pauses pass quickly; the game itself is unchanged.
  await fastClock(page, 3);
  await page.goto("/");
  return { page, errors, context };
}
async function lobby(page: Page, game: string, name: string, variant?: string) {
  await selectGame(page, game);
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  // Over Wi-Fi the computers are chosen in the room, not here.
  await expect(page.locator("#bg-opponents-field")).toBeHidden();
  if (variant) await page.getByLabel("방식").selectOption(variant);
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
async function table(browser: Browser, info: TestInfo, game: string, variant?: string) {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, game, "방장", variant);
  await host.locator("#net-host").click();
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  await lobby(guest, game, "민수");
  await guest.locator("#net-join").click();
  await guest.locator("#net-offer-in").fill(await offer.inputValue());
  await guest.locator("#net-accept").click();
  const answer = guest.locator("#net-answer");
  await expect(answer).toBeVisible({ timeout: 20000 });
  await host.locator("#net-answer-in").fill(await answer.inputValue());
  await host.locator("#net-connect").click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 30000 });
  await expect(guest.locator(".net-seat").nth(1)).toContainText("나");
  // The first table is drawn on the click: a software-drawn page may be busy a while.
  await host.locator("#net-start").click({ noWaitAfter: true, timeout: 120000 });
  for (const page of [host, guest]) await expect(page.locator("main.game-layout canvas")).toBeVisible({ timeout: 120000 });
  return {
    host,
    guest,
    done: async () => {
      expect(a.errors).toEqual([]);
      expect(b.errors).toEqual([]);
      await a.context.close();
      await b.context.close();
    },
  };
}
const press = (page: Page, selector: string) => page.locator(selector).first().evaluate((el) => (el as HTMLElement).click());
const resting = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 60000 });
/** The cards of a seat's row in the panel as that device sees them: their names, or 비공개 for one face down. */
const cards = (page: Page, row: number) => page.locator("#bg-seats li").nth(row).locator(".bj-card").allTextContents();
const usable = (page: Page, selector: string) =>
  page.locator(selector).evaluate((b) => !(b as HTMLButtonElement).disabled && !(b as HTMLElement).closest("[hidden]"));
const over = async (page: Page) => !(await page.locator("#bg-between").evaluate((el) => (el as HTMLElement).hidden)) && (await page.locator("#bg-outcome li").count()) > 0;

/**
 * One hand from the host's deal to its end. Before the showdown each device shows its own cards and only the backs
 * of the other's; the betting moves from device to device, each acting only in its own turn (checking or calling).
 */
async function hand(host: Page, guest: Page) {
  for (const page of [host, guest]) await resting(page);
  await expect(host.locator("#turn")).toContainText("덱을 눌러 시작하세요");
  await expect(guest.locator("#turn")).toContainText("방장이 패를 나누기를 기다리는 중");
  // Only the host's device deals.
  await expect(guest.locator("#bg-deal")).toBeHidden();
  for (let deal = 0; deal < 4; deal++) {
    await press(host, "#bg-deal");
    for (const page of [host, guest]) {
      await expect(page.locator("#move-count")).not.toHaveText("0판", { timeout: 60000 });
      await resting(page);
    }
    // Each device: my own cards face up in the first row, the other's face down in the second.
    const mine = await cards(host, 0),
      theirs = await cards(guest, 0);
    expect(mine.length).toBeGreaterThanOrEqual(2);
    expect(mine.every((c) => c !== "비공개")).toBe(true);
    expect(theirs.every((c) => c !== "비공개")).toBe(true);
    expect(await cards(host, 1)).toEqual(theirs.map(() => "비공개"));
    expect(await cards(guest, 1)).toEqual(mine.map(() => "비공개"));
    await expect(host.locator("#bg-seats li").nth(1)).toContainText("민수");
    await expect(guest.locator("#bg-seats li").nth(1)).toContainText("방장");
    // The betting, each on its own device in its own turn.
    for (let step = 0; step < 40 && !(await over(host)); step++) {
      const moving = (await usable(host, "#bg-call")) ? host : (await usable(guest, "#bg-call")) ? guest : null;
      if (!moving) {
        await host.waitForTimeout(300);
        continue;
      }
      const waiting = moving === host ? guest : host;
      // The other device may not act meanwhile.
      await expect(waiting.locator("#bg-call")).toBeDisabled();
      await press(moving, "#bg-call");
      await expect(moving.locator("#bg-call")).toBeDisabled({ timeout: 30000 });
      for (const page of [host, guest]) await resting(page);
    }
    await expect.poll(() => over(guest), { timeout: 60000 }).toBe(true);
    await expect.poll(() => over(host), { timeout: 60000 }).toBe(true);
    // A tie (or seotda's 구사) leaves the pot for a replay, dealt again by the host.
    if ((await host.locator("#bg-deal").textContent()) === "재경기") continue;
    // The showdown: each device now shows the other's hand as the other held it, and the same outcome.
    await expect.poll(() => cards(guest, 1), { timeout: 30000 }).toEqual(mine);
    await expect.poll(() => cards(host, 1), { timeout: 30000 }).toEqual(theirs);
    await expect(guest.locator("#bg-outcome")).toContainText("방장");
    const net = async (page: Page) => (await page.locator("#bg-outcome li").allTextContents()).map((row) => row.replace("나 ·", "").replace(/^(방장|민수) ·/, "")).sort();
    expect(await net(guest)).toEqual(await net(host));
    // The chips agree: what the host holds is what the guest's panel says it holds.
    const held = (await host.locator("#bg-chips").textContent())!;
    await expect(guest.locator("#bg-seats li").nth(1)).toContainText(`칩 ${held}`);
    await expect(guest.locator("#bg-deal")).toBeHidden();
    return;
  }
  throw new Error("no hand reached its showdown");
}

test("seotda over Wi-Fi: the host deals, each bets on its own device, each sees only its own cards until the showdown", async ({ browser }, info) => {
  const { host, guest, done } = await table(browser, info, "섯다");
  await expect(host.locator("#bg-seats li")).toHaveCount(2);
  await expect(host.locator("#net-room")).toBeVisible();
  await hand(host, guest);
  await done();
});

test("Texas hold'em over Wi-Fi: a hand to the showdown, the board shared and the hole cards each device's own", async ({ browser }, info) => {
  const { host, guest, done } = await table(browser, info, "텍사스 홀덤");
  await expect(host.locator("#bg-seats li")).toHaveCount(2);
  await hand(host, guest);
  // The community cards are the same on both devices.
  await expect(guest.locator("#bg-board")).toHaveText((await host.locator("#bg-board").textContent())!);
  await expect(host.locator("#bg-board .bj-card")).toHaveCount(5);
  await done();
});
