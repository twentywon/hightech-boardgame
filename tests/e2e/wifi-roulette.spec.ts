import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { fastClock, selectGame } from "./library";

/*
 * 러시안 룰렛 over 와이파이 여럿이: two pages of one browser, each its own device, joined by pasted pairing codes. Each
 * device sees the party table turned so that it sits near (`data-out`, `data-spins`, `data-last` in its own seat
 * order), only the device holding the toy may pull, and every pull (drawn by the host as it takes the move) comes out
 * the same on both.
 */
test.setTimeout(300000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("main.game-layout canvas");
const turn = (page: Page) => page.locator("#turn");
const data = (page: Page, key: string) => canvas(page).getAttribute(`data-${key}`);
const tool = (page: Page, label: string) => page.locator(".board-area .pg-tools").getByRole("button", { name: label });

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
async function lobby(page: Page, name: string) {
  await selectGame(page, "러시안 룰렛");
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await page.getByLabel("와이파이 여럿이", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog.net-lobby[open]")).toBeVisible();
  await page.locator("#net-name").fill(name);
}
async function pair(host: Page, guest: Page, name: string) {
  await lobby(host, "방장");
  await host.locator("#net-host").click();
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
/** Every page shows `count` pulls and rests. */
async function agree(pages: Page[], count: number) {
  for (const page of pages) {
    await expect.poll(() => moves(page), { timeout: 60000 }).toBe(count);
    await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 60000 });
  }
}
/** A list in seat order as the device of `seat` sees it (its own first). */
const turned = (list: string[], seat: number) => list.map((_, i) => list[(i + seat) % list.length]);

test("russian roulette by codes: the toy goes round two devices, each sees the table from its own seat, and every pull agrees", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await pair(host, guest, "민수");
  await host.locator("#net-start").click();
  for (const page of pages) await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await expect(turn(host)).toContainText("나 (1번) 차례");
  await expect(turn(guest)).toContainText("방장 (1번) 차례");
  // Two people: seats 3번 and 4번 are closed, out from the start; each device sits near.
  await expect(canvas(host)).toHaveAttribute("data-out", "0011");
  await expect(canvas(guest)).toHaveAttribute("data-out", "0110");
  await expect(canvas(host)).toHaveAttribute("data-seat", "0");
  await expect(canvas(guest)).toHaveAttribute("data-seat", "3");
  // Not the guest's turn: no tools of its own.
  await expect(tool(guest, "그냥 당기기")).toBeHidden();
  let count = 0;
  for (let step = 0; step < 6; step++) {
    const mover = step % 2 ? guest : host,
      seat = step % 2;
    await expect(tool(mover, "그냥 당기기")).toBeEnabled({ timeout: 60000 });
    // The guest spins on its first turn (a spin used), else both pull.
    if (step === 1) await tool(mover, "원통 돌리기 (2)").dispatchEvent("click");
    else await tool(mover, "그냥 당기기").dispatchEvent("click");
    count++;
    await agree(pages, count);
    // Both devices tell the same pull, each in its own seat order.
    const last = (await data(host, "last"))!.split(","),
      seen = (await data(guest, "last"))!.split(",");
    expect(Number(last[0])).toBe(seat);
    expect(Number(seen[0])).toBe((seat - 1 + 4) % 4);
    expect(seen.slice(1)).toEqual(last.slice(1));
    expect(await data(guest, "left")).toBe(await data(host, "left"));
    const out = (await data(host, "out"))!.split(""),
      spins = (await data(host, "spins"))!.split(",");
    expect(await data(guest, "out")).toBe(turned(out, 1).join(""));
    expect(await data(guest, "spins")).toBe(turned(spins, 1).join(","));
    if (step === 1) expect(spins).toEqual(["2", "1", "0", "0"]);
    if (last[2] === "1") {
      // A 펑 with two at the table: the other one has won, on both devices.
      const winner = 1 - seat;
      await expect(canvas(host)).toHaveAttribute("data-champion", String(winner === 0 ? 0 : 1));
      await expect(canvas(guest)).toHaveAttribute("data-champion", String(winner === 1 ? 0 : 3));
      for (const page of pages) await expect(page.locator(".board-finale")).toBeVisible({ timeout: 30000 });
      await expect(page(host, winner === 0)).toBeVisible();
      break;
    }
  }
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
/** The finale of a page: the win word for the winner's device. */
const page = (p: Page, won: boolean) => p.locator(".board-finale", { hasText: won ? "승리" : "패배" });
