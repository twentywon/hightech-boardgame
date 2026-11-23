import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { selectGame } from "./library";

/*
 * 와이파이 여럿이 on the dice games with screens of their own (yut nori, yacht dice, the world tour, continent
 * conquest): two pages of one browser, each its own device, joined by WebRTC with the pairing codes pasted. The host
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
const faces = (page: Page) => page.locator(".yd-die").evaluateAll((dice) => dice.map((d) => `${d.textContent}${d.getAttribute("aria-pressed") === "true" ? "*" : ""}`).join(" "));

test("yacht dice: both devices see the same throws and holds; only the mover rolls, holds and scores", async ({ browser }, info) => {
  const { host, guest, done } = await table(browser, info, "요트 다이스");
  for (const page of [host, guest]) await resting(page);
  await expect(host.locator("#turn")).toContainText("나 차례");
  await expect(guest.locator("#turn")).toContainText("방장 (선공) 차례");
  // The guest may not roll for the host.
  await press(guest, "#yd-roll");
  await expect(guest.locator("#turn")).toContainText("차례");
  await expect.poll(() => faces(host)).toBe("– – – – –");
  for (const [mover, other] of [
    [host, guest],
    [guest, host],
  ]) {
    await expect(mover.locator("#yd-roll")).toBeEnabled({ timeout: 60000 });
    await press(mover, "#yd-roll");
    await expect.poll(() => faces(mover), { timeout: 60000 }).not.toContain("–");
    await resting(mover);
    await expect.poll(() => faces(other), { timeout: 60000 }).toBe(await faces(mover));
    // A die set aside is the mover's move and is seen on the other device.
    await press(mover, "#yd-die-0");
    await expect.poll(() => faces(mover), { timeout: 30000 }).toMatch(/^\S+ \d\*/);
    await expect.poll(() => faces(other), { timeout: 30000 }).toBe(await faces(mover));
    await resting(mover);
    await press(mover, ".yd-pick");
    await expect.poll(() => faces(other), { timeout: 60000 }).toBe("– – – – –");
  }
  // Both sheets agree: each device's own column is 나, the other's its name.
  await expect(host.locator(".yd-sheet thead")).toContainText("민수");
  await expect(guest.locator(".yd-sheet thead")).toContainText("방장");
  for (const p of [0, 1]) await expect(guest.locator(`#yd-total-${p}`)).toHaveText((await host.locator(`#yd-total-${p}`).textContent())!);
  await done();
});

test("world tour: a purchase is asked on the mover's device only, the other is told; both boards agree", async ({ browser }, info) => {
  // The third seat is the host's computer.
  const { host, guest, done } = await table(browser, info, "세계 일주", (h) => h.locator('.net-kind[data-seat="2"][data-kind="computer"]').click());
  await expect(host.locator("#tour-player-2")).toContainText("컴퓨터");
  const pages = [host, guest];
  let asked = false;
  for (let step = 0; step < 80 && !asked; step++) {
    for (let i = 0; i < 2; i++) {
      const page = pages[i],
        other = pages[1 - i],
        title = await page.locator("dialog[open]:not(.net-lobby) h2").textContent({ timeout: 200 }).catch(() => null);
      if (title) {
        if (/살까요|지을까요/.test(title)) {
          asked = true;
          // Nobody else is asked; they are told what the mover is choosing.
          await expect(other.locator("dialog[open]:not(.net-lobby)")).toHaveCount(0);
          await expect(other.locator("#turn")).toContainText("고르는 중");
        }
        await page.locator("dialog[open]:not(.net-lobby) .dialog-actions button").last().evaluate((b) => (b as HTMLElement).click());
        break;
      }
      if ((await page.locator("#board").getAttribute("data-animating")) === "true") continue;
      const ready = (id: string) => page.locator(id).evaluate((b) => !(b as HTMLButtonElement).hidden && !(b as HTMLButtonElement).disabled);
      if (await ready("#tour-roll")) await press(page, "#tour-roll");
      else if (await ready("#tour-key")) await press(page, "#tour-key");
      else if (await ready("#tour-end")) await press(page, "#tour-end");
      else continue;
      break;
    }
    await host.waitForTimeout(700);
  }
  expect(asked).toBe(true);
  // At rest, both devices show the same money for every traveller.
  for (const page of pages) await resting(page);
  const money = (page: Page) => page.locator("[id^=tour-money-]").allTextContents();
  await expect.poll(async () => JSON.stringify(await money(guest)), { timeout: 30000 }).toBe(JSON.stringify(await money(host)));
  await done();
});

test("yut nori and continent conquest: the room's seats lay the same table on both devices", async ({ browser }, info) => {
  {
    const { host, guest, done } = await table(browser, info, "윷놀이");
    // Two people: the other two colours are closed, a game of two.
    await expect(host.locator(".yut-sides li")).toHaveCount(2);
    await expect(guest.locator("#yut-side-0")).toContainText("방장");
    await press(guest, "#yut-throw");
    await expect(guest.locator("#move-count")).toHaveText("0수");
    await expect(host.locator("#yut-throw")).toBeEnabled({ timeout: 60000 });
    await press(host, "#yut-throw");
    // The sticks thrown on the host are thrown alike on the guest's yard: the same results wait to be used.
    await expect(host.locator("#turn")).not.toContainText("윷가락을 눌러 던지세요", { timeout: 60000 });
    await resting(host);
    await resting(guest);
    const pending = (page: Page) => page.locator("#yut-pending").textContent();
    await expect.poll(() => pending(guest), { timeout: 30000 }).toBe(await pending(host));
    await expect.poll(async () => (await guest.locator("#yut-side-0").textContent()) === (await host.locator("#yut-side-0").textContent())).toBe(true);
    await done();
  }
  {
    const { host, guest, done } = await table(browser, info, "주사위 대륙 쟁탈전");
    const lay = (page: Page) => page.locator("main.game-layout canvas").evaluate((c) => `${(c as HTMLElement).dataset.owners}|${(c as HTMLElement).dataset.armies}`);
    await expect.poll(() => lay(guest), { timeout: 60000 }).toBe(await lay(host));
    // Each device shows only its own cards; secret missions are not offered over Wi-Fi.
    await expect(guest.locator("#cq-mission")).toBeHidden();
    await done();
  }
});
