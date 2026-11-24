import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { selectGame } from "./library";

/*
 * 와이파이 여럿이 on yut nori: two pages of one browser, each its own device, joined by WebRTC with the pairing codes pasted. The host
 * sits at the first seat, the guest at the second; each moves only in its own turn, and both tables agree after every
 * move, dice included. Buttons are pressed through the page (several are a pixel on the table, `sr-only`).
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
  await page.goto("/");
  return { page, errors, context };
}
async function lobby(page: Page, game: string, name: string) {
  await selectGame(page, game);
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
/** Two devices in one room of `game`; `prepare` may change the seats on the host before the start. */
async function table(browser: Browser, info: TestInfo, game: string, prepare?: (host: Page) => Promise<void>) {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, game, "방장");
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
  await prepare?.(host);
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
const resting = (page: Page) => expect(page.locator("#board")).not.toHaveAttribute("data-animating", "true", { timeout: 60000 });


/** What both devices must agree on: whose turn, the throws waiting to be used, each side's pieces and the move count. */
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const text = (id: string) => document.getElementById(id)?.textContent ?? "";
    const board = document.getElementById("board")!;
    return [board.dataset.turn, text("yut-pending"), text("yut-count-0"), text("yut-count-1"), text("move-count")].join(" | ");
  });

test("yut nori over Wi-Fi: two devices take turns throwing and moving, only the mover acts, and both yards agree after every step", async ({ browser }, info) => {
  const { host, guest, done } = await table(browser, info, "윷놀이");
  await expect(host.locator(".yut-sides li")).toHaveCount(2);
  let throws = 0,
    moves = 0,
    refused = 0;
  for (let step = 0; step < 24 && (throws < 6 || moves < 4); step++) {
    await resting(host);
    await resting(guest);
    // Both devices show the same yard before anyone acts.
    await expect.poll(() => snapshot(guest), { timeout: 30000 }).toBe(await snapshot(host));
    if (await host.locator("#yut-result").isVisible()) break;
    const turn = await host.locator("#board").getAttribute("data-turn"),
      mover = turn === "0" ? host : guest,
      other = turn === "0" ? guest : host,
      before = await snapshot(host);
    // The other device cannot throw or move for the mover.
    if (step % 3 === 0) {
      await press(other, "#yut-throw");
      const choice = other.locator("#yut-moves button:not([disabled])");
      if (await choice.count()) await choice.first().evaluate((b) => (b as HTMLButtonElement).click());
      await other.waitForTimeout(600);
      expect(await snapshot(host)).toBe(before);
      refused++;
    }
    const choice = mover.locator("#yut-moves button:not([disabled])");
    if (await choice.count()) {
      await choice.first().evaluate((b) => (b as HTMLButtonElement).click());
      moves++;
    } else {
      await expect(mover.locator("#yut-throw")).toBeEnabled({ timeout: 60000 });
      await press(mover, "#yut-throw");
      throws++;
    }
    await expect.poll(() => snapshot(host), { timeout: 60000 }).not.toBe(before);
  }
  await resting(host);
  await resting(guest);
  await expect.poll(() => snapshot(guest), { timeout: 30000 }).toBe(await snapshot(host));
  info.annotations.push({ type: "yut", description: `throws ${throws}, moves ${moves}, refused ${refused}, last ${await snapshot(host)}` });
  expect(throws).toBeGreaterThanOrEqual(4);
  expect(moves).toBeGreaterThanOrEqual(2);
  await done();
});
