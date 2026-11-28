import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { fastClock, selectGame } from "./library";

/*
 * 와이파이 여럿이 for the card games with hidden hands (`src/net/hidden.ts`, `src/games/deck/blind.ts`): two pages of
 * one browser, each its own device, joined by pasted pairing codes. Each device shows only its own seat: in one card
 * its own hand near and the other's blind (`data-blind`, `data-open` on the canvas: the cards lying blind, and the
 * other's cards known, none before the end); in Indian poker the other's card on the figure's forehead and never its
 * own until the round is shown (`data-theirs`, `data-mine`).
 */
test.setTimeout(300000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("main.game-layout canvas");
const turn = (page: Page) => page.locator("#turn");

async function device(browser: Browser, info: TestInfo) {
  const use = info.project.use,
    context: BrowserContext = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport, deviceScaleFactor: use.deviceScaleFactor, isMobile: use.isMobile, hasTouch: use.hasTouch, userAgent: use.userAgent }),
    page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await fastClock(page);
  await page.goto("/");
  return { page, errors };
}
async function lobby(page: Page, game: string, name: string) {
  await selectGame(page, game);
  // A game against the computer only offers no table for two, but each person has a device over Wi-Fi.
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
/** The host makes a room and invites, the guest answers, the host takes the answer: both see the room. */
async function pair(host: Page, guest: Page, game: string, name: string) {
  await lobby(host, game, "방장");
  await host.locator("#net-host").click();
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
async function start(host: Page, pages: Page[]) {
  await host.locator("#net-start").click();
  for (const page of pages) await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
}
/** Every page shows `count` moves and rests. */
async function agree(pages: Page[], count: number) {
  for (const page of pages) {
    await expect.poll(() => moves(page), { timeout: 30000 }).toBe(count);
    await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  }
}
/** The page whose own seat is to move: its status line names it 나. */
async function mover(pages: Page[]) {
  let found: Page | undefined;
  await expect
    .poll(
      async () => {
        for (const page of pages)
          if (/나 \(/.test(await turn(page).innerText()) && (await page.locator("#board").getAttribute("data-animating")) === "false") return (found = page), true;
        return false;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  return found!;
}
const tool = (page: Page, label: string) => page.locator(".board-area .pg-tools").getByRole("button", { name: label });
async function press(page: Page, label: string) {
  await expect(tool(page, label)).toBeEnabled({ timeout: 20000 });
  await tool(page, label).dispatchEvent("click");
}
async function keys(page: Page, list: string[]) {
  await canvas(page).focus();
  for (const key of list) {
    if (key === "Enter") {
      await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
      await expect(turn(page)).not.toContainText("보내는 중", { timeout: 30000 });
    }
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  }
}
/**
 * Tries `attempt` (its number given) until the page's move count goes up; the new count. A try counts as refused only
 * once the page has come to rest with its own seat still to move: a move taken shows its count only after its cards
 * have flown (and a guest's after the host's answer), which on a slow machine can take far longer than a few seconds,
 * and a second try then would be made out of turn.
 */
async function moveOnce(page: Page, attempt: (tries: number) => Promise<void>) {
  const before = await moves(page);
  for (let tries = 0; tries < 10; tries++) {
    await attempt(tries);
    const from = Date.now();
    while (Date.now() - from < 90000) {
      if ((await moves(page)) > before) return moves(page);
      const text = await turn(page).innerText(),
        still = (await page.locator("#board").getAttribute("data-animating")) === "false";
      if (still && /나 \(/.test(text) && !text.includes("보내는 중") && Date.now() - from > 3000) break;
      await page.waitForTimeout(250);
    }
  }
  throw new Error("no move was made");
}
/** The number of cards in my own hand and in the others', from the unseen panel ("카드 7장", "카드 7 · 파산 · 파산장"). */
const counts = async (page: Page) => [Number(/\d+/.exec(await page.locator("#pg-count-0").innerText())![0]), Number(/\d+/.exec(await page.locator("#pg-count-1").innerText())![0])];

test("one card by codes: each holds its own hand, the other's lies blind; they play and draw in turn", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await pair(host, guest, "원카드", "민수");
  // Two people: the empty seats 3번 and 4번 are closed when the game begins.
  await start(host, pages);
  await expect(turn(host)).toContainText("나 (1번) 차례");
  await expect(turn(guest)).toContainText("방장 (1번) 차례입니다");
  for (const page of pages) {
    await expect(page.locator("#pg-count-0")).toHaveText("카드 7장");
    // The other's seven and the pile (54 less fourteen dealt and the card turned up) lie blind; none of the other's is known.
    await expect(canvas(page)).toHaveAttribute("data-blind", String(7 + 54 - 14 - 1));
    await expect(canvas(page)).toHaveAttribute("data-open", "0");
  }
  // Out of turn: the guest may not draw.
  await expect(tool(guest, "한 장 받기")).toBeDisabled();
  for (let step = 0; step < 6; step++) {
    const page = await mover(pages),
      count = await moveOnce(page, async (tries) => {
        // A 7 played asks for the suit to follow.
        if (await tool(page, "스페이드").isVisible()) return press(page, "스페이드");
        // A card of my hand that fits, walked along by the keyboard; else a card from the pile.
        if (tries < 4) return keys(page, [...Array<string>(tries + 1).fill("ArrowRight"), "Enter"]);
        await press(page, "한 장 받기");
      });
    await agree(pages, count);
    // One device's hand is the other's count of the other hand; neither knows a card of the other's.
    const [hostMine, hostTheirs] = await counts(host),
      [guestMine, guestTheirs] = await counts(guest);
    expect(hostMine).toBe(guestTheirs);
    expect(guestMine).toBe(hostTheirs);
    for (const p of pages) await expect(canvas(p)).toHaveAttribute("data-open", "0");
  }
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("Indian poker by codes: each sees the other's card and never its own until the round is shown", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await pair(host, guest, "인디언 포커", "민수");
  await start(host, pages);
  // Dealt face down: nothing is known before the cards are raised.
  for (const page of pages) {
    await expect(canvas(page)).toHaveAttribute("data-theirs", "");
    await expect(canvas(page)).toHaveAttribute("data-mine", "");
  }
  await expect(turn(guest)).toContainText("상대가 카드를 이마에 얹기를 기다립니다");
  await expect(tool(guest, "이마에 얹기")).toBeDisabled();
  await press(host, "이마에 얹기");
  await agree(pages, 1);
  // Each sees the other's card on the figure's forehead, and not its own.
  for (const page of pages) {
    await expect(canvas(page)).toHaveAttribute("data-theirs", /^\d+$/);
    await expect(canvas(page)).toHaveAttribute("data-mine", "");
  }
  const hostSees = await canvas(host).getAttribute("data-theirs"),
    guestSees = await canvas(guest).getAttribute("data-theirs");
  await expect(turn(host)).toContainText(`나 (1번) 차례 — 1/10판 · 상대 카드는 ${hostSees}입니다`);
  await expect(turn(guest)).toContainText("방장 (1번) 차례입니다");
  // The host checks, the guest checks: the round is shown to both.
  await press(host, "결정");
  await agree(pages, 2);
  await expect(turn(guest)).toContainText(`나 (2번) 차례 — 1/10판 · 상대 카드는 ${guestSees}입니다`);
  await press(guest, "결정");
  await agree(pages, 3);
  // Now each knows its own card: the one the other saw.
  await expect(canvas(host)).toHaveAttribute("data-mine", guestSees!);
  await expect(canvas(guest)).toHaveAttribute("data-mine", hostSees!);
  await expect(turn(host)).toContainText(`내 카드 ${guestSees}, 상대 카드 ${hostSees}`);
  await expect(turn(guest)).toContainText(`내 카드 ${hostSees}, 상대 카드 ${guestSees}. 상대가 다음 판을 받기를 기다립니다`);
  // The host deals the next round; 2번 raises its cards and bets first.
  await press(host, "다음 판");
  await agree(pages, 4);
  for (const page of pages) await expect(canvas(page)).toHaveAttribute("data-mine", "");
  await expect(turn(host)).toContainText("상대가 카드를 이마에 얹기를 기다립니다");
  await press(guest, "이마에 얹기");
  await agree(pages, 5);
  await expect(turn(guest)).toContainText("나 (2번) 차례 — 2/10판");
  for (const page of pages) await expect(canvas(page)).toHaveAttribute("data-mine", "");
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("hula by codes: each holds its own hand, the other's and the stock lie blind; cards are picked on the device alone, drawn and discarded in turn", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await pair(host, guest, "훌라", "민수");
  await start(host, pages);
  await expect(turn(host)).toContainText("나 (1번) 차례");
  await expect(turn(guest)).toContainText("방장 (1번) 차례입니다");
  for (const page of pages) {
    // The other's seven and the stock (52 less fourteen dealt and the card turned up) lie blind; none of the other's is known.
    await expect(canvas(page)).toHaveAttribute("data-blind", String(7 + 52 - 14 - 1));
    await expect(canvas(page)).toHaveAttribute("data-known", "0");
    await expect(canvas(page)).toHaveAttribute("data-hands", "7,7");
  }
  // Out of turn: the guest may not draw.
  await expect(tool(guest, "한 장 가져오기")).toBeDisabled();
  for (let step = 0; step < 4; step++) {
    const page = await mover(pages),
      other = pages.find((p) => p !== page)!;
    // Drawn from the stock.
    let count = await moveOnce(page, () => press(page, "한 장 가져오기"));
    await agree(pages, count);
    await expect(canvas(page)).toHaveAttribute("data-phase", "meld");
    // A card picked up rises on this device alone: nothing is sent, the count stands.
    await keys(page, ["ArrowRight", "Enter"]);
    await expect(canvas(page)).toHaveAttribute("data-picked", "1");
    await expect(canvas(other)).toHaveAttribute("data-picked", "0");
    expect(await moves(page)).toBe(count);
    expect(await moves(other)).toBe(count);
    // Discarded: the card picked is the one the other device sees on the discard pile.
    const mine = (await canvas(page).getAttribute("data-mine"))!.split(",");
    count = await moveOnce(page, () => press(page, "버리기"));
    await agree(pages, count);
    const top = await canvas(other).getAttribute("data-top");
    expect(mine).toContain(top);
    expect(await canvas(page).getAttribute("data-top")).toBe(top);
    for (const p of pages) await expect(canvas(p)).toHaveAttribute("data-known", "0");
  }
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
