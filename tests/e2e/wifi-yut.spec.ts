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

/** The host invites, the guest answers, the host takes the answer: both see the room. */
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
  await expect(host.locator(".net-people li", { hasText: name })).toBeVisible({ timeout: 30000 });
}

test("yut nori for four on four devices: the host starts, every device lays the yard and stays alive, and the first throws go round", async ({ browser }, info) => {
  const devices = [await device(browser, info), await device(browser, info), await device(browser, info), await device(browser, info)],
    pages = devices.map((d) => d.page),
    [host] = pages;
  await lobby(host, "윷놀이", "방장");
  await host.locator("#net-host").click();
  for (const [k, name] of ["민수", "지아", "하늘"].entries()) await pair(host, pages[k + 1], "윷놀이", name);
  for (const [k, name] of ["민수", "지아", "하늘"].entries()) await expect(host.locator(".net-seat").nth(k + 1)).toContainText(name);
  await host.locator("#net-start").click({ noWaitAfter: true, timeout: 120000 });
  for (const page of pages) await expect(page.locator("main.game-layout canvas")).toBeVisible({ timeout: 120000 });
  // The host's page still answers (it froze here: the user's tablet went down when the game began).
  await expect.poll(() => host.evaluate(() => document.querySelectorAll(".yut-sides li").length), { timeout: 60000 }).toBe(4);
  for (const page of pages) await resting(page);
  // Each of the four throws in turn from its own device; every device agrees after each.
  for (let k = 0; k < 4; k++) {
    const turn = Number(await host.locator("#board").getAttribute("data-turn")),
      mover = pages[turn],
      before = await snapshot(host);
    const choice = mover.locator("#yut-moves button:not([disabled])");
    if (await choice.count()) await choice.first().evaluate((b) => (b as HTMLButtonElement).click());
    else {
      await expect(mover.locator("#yut-throw")).toBeEnabled({ timeout: 60000 });
      await press(mover, "#yut-throw");
    }
    await expect.poll(() => snapshot(host), { timeout: 60000 }).not.toBe(before);
    for (const page of pages) await resting(page);
  }
  for (const d of devices) expect(d.errors).toEqual([]);
});

/** The yard as a device shows it, for three players: whose turn, the throws waiting and each side's pieces. */
const snapshot3 = (page: Page) =>
  page.evaluate(() => {
    const text = (id: string) => document.getElementById(id)?.textContent ?? "";
    return [document.getElementById("board")!.dataset.turn, text("yut-pending"), text("yut-count-0"), text("yut-count-1"), text("yut-count-2"), text("move-count")].join(" | ");
  });

test("yut nori for three: a device that leaves mid-game has its seat played by the host's computer, and comes back to it", async ({ browser }, info) => {
  const devices = [await device(browser, info), await device(browser, info), await device(browser, info)],
    pages = devices.map((d) => d.page),
    [host, minsu, jia] = pages;
  await lobby(host, "윷놀이", "방장");
  await host.locator("#net-host").click();
  await pair(host, minsu, "윷놀이", "민수");
  await pair(host, jia, "윷놀이", "지아");
  // The fourth seat is left open: it is closed when the game begins, a game of three.
  await host.locator("#net-start").click({ noWaitAfter: true, timeout: 120000 });
  for (const page of pages) await expect(page.locator("main.game-layout canvas")).toBeVisible({ timeout: 120000 });
  for (const page of pages) await expect(page.locator(".yut-sides li")).toHaveCount(3);
  for (const page of pages) await resting(page);
  // 지아's page goes away (the app closed): the others are told, and the host's computer throws for 지아's seat.
  await jia.evaluate(() => dispatchEvent(new Event("wtg-exit")));
  await devices[2].context.close();
  const played = async (turns: number) => {
    for (let k = 0; k < turns; k++) {
      await resting(host);
      await resting(minsu);
      const turn = Number(await host.locator("#board").getAttribute("data-turn")),
        before = await snapshot3(host);
      if (turn === 2) {
        // Nobody acts: the host's computer plays the seat whose device went away.
        await expect.poll(() => snapshot3(host), { timeout: 90000 }).not.toBe(before);
        continue;
      }
      const mover = turn === 0 ? host : minsu,
        choice = mover.locator("#yut-moves button:not([disabled])");
      if (await choice.count()) await choice.first().evaluate((b) => (b as HTMLButtonElement).click());
      else {
        await expect(mover.locator("#yut-throw")).toBeEnabled({ timeout: 60000 });
        await press(mover, "#yut-throw");
      }
      await expect.poll(() => snapshot3(host), { timeout: 60000 }).not.toBe(before);
    }
    await resting(host);
    await resting(minsu);
    // The host's computer may move on for the seat that left while this is read, so both are read on every try.
    await expect.poll(async () => (await snapshot3(minsu)) === (await snapshot3(host)), { timeout: 60000 }).toBe(true);
  };
  await played(8);
  const seen = Number(/(\d+)/.exec(await host.locator("#move-count").innerText())![1]);
  // 지아 comes back on a new page by a new invite, under the same name: the same seat, the game as it stands.
  const back = await device(browser, info);
  await host.locator("#net-room").click();
  await expect(host.locator("dialog.net-lobby[open]")).toBeVisible();
  await host.locator("#net-invite").click();
  const offer = host.locator("#net-offer");
  await expect(offer).toBeVisible({ timeout: 20000 });
  await lobby(back.page, "윷놀이", "지아");
  await back.page.locator("#net-join").click();
  await back.page.locator("#net-offer-in").fill(await offer.inputValue());
  await back.page.locator("#net-accept").click();
  const answer = back.page.locator("#net-answer");
  await expect(answer).toBeVisible({ timeout: 20000 });
  await host.locator("#net-answer-in").fill(await answer.inputValue());
  await host.locator("#net-connect").click();
  // The host's room says 지아 is back on the third seat; its window is closed again.
  await expect(host.locator(".net-seat").nth(2)).toContainText("지아", { timeout: 30000 });
  await expect(host.locator(".net-seat").nth(2)).not.toContainText("연결 끊김");
  await host.locator("#net-cancel").click();
  await expect(back.page.locator("main.game-layout canvas")).toBeVisible({ timeout: 120000 });
  await expect(back.page.locator(".yut-sides li")).toHaveCount(3);
  await resting(back.page);
  await expect.poll(() => snapshot3(back.page), { timeout: 60000 }).toBe(await snapshot3(host));
  expect(Number(/(\d+)/.exec(await back.page.locator("#move-count").innerText())![1])).toBeGreaterThanOrEqual(seen);
  for (const d of [devices[0], devices[1], back]) expect(d.errors).toEqual([]);
});

test("yut nori with the third seat closed: the one on the fourth seat plays as 황 (yellow) on every device, as the room said", async ({ browser }, info) => {
  const devices = [await device(browser, info), await device(browser, info), await device(browser, info)],
    pages = devices.map((d) => d.page),
    [host, minsu, jia] = pages;
  await lobby(host, "윷놀이", "방장");
  await host.locator("#net-host").click();
  await pair(host, minsu, "윷놀이", "민수");
  // The third seat (녹) closed before 지아 comes: 지아 sits on the fourth (황).
  await host.locator('.net-kind[data-seat="2"][data-kind="closed"]').click();
  await pair(host, jia, "윷놀이", "지아");
  await expect(host.locator(".net-seat").nth(3)).toContainText("지아");
  await host.locator("#net-start").click({ noWaitAfter: true, timeout: 120000 });
  for (const page of pages) await expect(page.locator("main.game-layout canvas")).toBeVisible({ timeout: 120000 });
  for (const page of pages) {
    await expect(page.locator(".yut-sides li")).toHaveCount(3);
    // The third player is 지아 (나 on 지아's own device), in the fourth seat's colour and name: 황, never 녹.
    await expect(page.locator("#yut-side-2")).toContainText(page === jia ? "나 (황)" : "지아 (황)");
    await expect(page.locator("#yut-side-2 .yut-dot")).toHaveClass(/\bp3\b/);
    await expect(page.locator("#yut-side-1 .yut-dot")).toHaveClass(/\bp1\b/);
  }
  for (const d of devices) expect(d.errors).toEqual([]);
});

/** A page put away (another app over it, its tab in the background): hidden, and no animation frames come. */
const hide = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { shownFrame?: typeof requestAnimationFrame };
    w.shownFrame = window.requestAnimationFrame;
    window.requestAnimationFrame = () => 0;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
const show = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { shownFrame?: typeof requestAnimationFrame };
    if (w.shownFrame) window.requestAnimationFrame = w.shownFrame;
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
/** One step of the player to move on `page`: a move where one is offered, else a throw. */
async function step(page: Page) {
  const choice = page.locator("#yut-moves button:not([disabled])");
  if (await choice.count()) await choice.first().evaluate((b) => (b as HTMLButtonElement).click());
  else {
    await expect(page.locator("#yut-throw")).toBeEnabled({ timeout: 60000 });
    await press(page, "#yut-throw");
  }
}

test("yut nori with the host's page put away: the guest still plays, the host's computer still plays its seat, and the host catches up when shown", async ({ browser }, info) => {
  const { host, guest, done } = await table(browser, info, "윷놀이", (h) => h.locator('.net-kind[data-seat="2"][data-kind="computer"]').click());
  for (const page of [host, guest]) await expect(page.locator(".yut-sides li")).toHaveCount(3);
  // The host plays its own first turn.
  for (let k = 0; k < 12 && (await host.locator("#board").getAttribute("data-turn")) === "0"; k++) {
    await resting(host);
    const before = await snapshot3(host);
    await step(host);
    await expect.poll(() => snapshot3(host), { timeout: 60000 }).not.toBe(before);
  }
  for (const page of [host, guest]) {
    await expect(page.locator("#board")).toHaveAttribute("data-turn", "1", { timeout: 60000 });
    await resting(page);
  }
  // The host's tablet is put away: the guest plays its turn ...
  await hide(host);
  for (let k = 0; k < 12 && (await guest.locator("#board").getAttribute("data-turn")) === "1"; k++) {
    await resting(guest);
    const before = await snapshot3(guest);
    await step(guest);
    await expect.poll(() => snapshot3(guest), { timeout: 60000 }).not.toBe(before);
  }
  // ... and the computer's seat is played all the same: its turn passes back to the host.
  await expect(guest.locator("#board")).toHaveAttribute("data-turn", "2", { timeout: 60000 });
  await expect(guest.locator("#board")).toHaveAttribute("data-turn", "0", { timeout: 120000 });
  // Shown again, the host's yard is the guest's at once, and the host may throw.
  await show(host);
  await resting(host);
  await resting(guest);
  await expect.poll(async () => (await snapshot3(guest)) === (await snapshot3(host)), { timeout: 30000 }).toBe(true);
  await expect(host.locator("#yut-throw")).toBeEnabled({ timeout: 30000 });
  await done();
});

/** The browser's screen wake lock, counted (test-only): let go by the "browser" whenever the page is hidden. */
function countLocks() {
  const w = window as unknown as { locks: { asked: number; held: number } };
  w.locks = { asked: 0, held: 0 };
  let current: { released: boolean; release(): Promise<void> } | null = null;
  const make = () => {
    const s = {
      released: false,
      release: async () => {
        if (s.released) return;
        s.released = true;
        w.locks.held--;
      },
    };
    return s;
  };
  Object.defineProperty(navigator, "wakeLock", {
    configurable: true,
    value: {
      request: async () => {
        w.locks.asked++;
        w.locks.held++;
        current = make();
        return current;
      },
    },
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) void current?.release();
  });
}
test("yut nori over Wi-Fi keeps the screens on while in the room (a phone gone dark drops out), takes the lock again when shown, and lets it go on leaving", async ({ browser }, info) => {
  const use = info.project.use,
    devices = await Promise.all(
      [0, 1].map(async () => {
        const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent });
        await context.addInitScript(countLocks);
        const page = await context.newPage(),
          errors: string[] = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto("/");
        return { page, errors, context };
      }),
    ),
    [host, guest] = devices.map((d) => d.page);
  const locks = (page: Page) => page.evaluate(() => (window as unknown as { locks: { asked: number; held: number } }).locks);
  // Nothing is held in the collection.
  expect(await locks(host)).toEqual({ asked: 0, held: 0 });
  await lobby(host, "윷놀이", "방장");
  await host.locator("#net-host").click();
  await pair(host, guest, "윷놀이", "민수");
  for (const page of [host, guest]) await expect.poll(async () => (await locks(page)).held).toBe(1);
  await host.locator("#net-start").click({ noWaitAfter: true, timeout: 120000 });
  for (const page of [host, guest]) await expect(page.locator("main.game-layout canvas")).toBeVisible({ timeout: 120000 });
  // Put away and shown again: the browser let the lock go, and it is taken again.
  await hide(guest);
  await expect.poll(async () => (await locks(guest)).held).toBe(0);
  await show(guest);
  await expect.poll(async () => locks(guest)).toEqual({ asked: 2, held: 1 });
  // Leaving the table (and the room) lets it go.
  await guest.evaluate(() => {
    document.querySelector<HTMLButtonElement>("main.game-layout #back")?.click();
    document.querySelector<HTMLButtonElement>("dialog.leave-dialog #leave-go")?.click();
  });
  await expect.poll(async () => (await locks(guest)).held, { timeout: 15000 }).toBe(0);
  for (const d of devices) {
    expect(d.errors).toEqual([]);
    await d.context.close();
  }
});
