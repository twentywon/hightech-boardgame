import { test, expect, type Browser, type BrowserContext, type Page, type TestInfo } from "@playwright/test";
import { selectGame } from "./library";
import { FakeWifi } from "./fake-app";

/*
 * 와이파이 여럿이 for the games with hidden things (`src/net/hidden.ts`): two pages of one browser, each its own device,
 * joined by pasted pairing codes (the QR way) or by the app's room list on a simulated Wi-Fi (fake-app.ts). Each device
 * shows only its own seat: its own fleet, number or hand. Secrets are chosen on each device at the same time; the
 * game begins once both have chosen. The canvases carry what they show as data attributes (`data-shown`, the ships
 * in sight of each side; `data-mine`, `data-theirs`, `data-entry`, the numbers on the scoreboard).
 */
test.setTimeout(300000);

const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("main.game-layout canvas");
const turn = (page: Page) => page.locator("#turn");

async function open(context: BrowserContext) {
  const page = await context.newPage(),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  return { page, errors };
}
function contextOf(browser: Browser, info: TestInfo) {
  const use = info.project.use;
  return browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    userAgent: use.userAgent,
  });
}
const device = async (browser: Browser, info: TestInfo) => open(await contextOf(browser, info));
async function phone(browser: Browser, info: TestInfo, wifi: FakeWifi, ip: string) {
  const context = await contextOf(browser, info);
  await wifi.attach(context, ip);
  return open(context);
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
/** The table's tool, pressed as a keyboard would (the tools lie on the table). */
const tool = (page: Page, label: string) => page.locator(".board-area .pg-tools").getByRole("button", { name: label });
async function press(page: Page, label: string) {
  await expect(tool(page, label)).toBeEnabled();
  await tool(page, label).dispatchEvent("click");
}
/** Keys pressed on the table one after another, each given a moment. */
async function keys(page: Page, list: string[]) {
  await canvas(page).focus();
  for (const key of list) {
    // A tap is taken only once the table rests and the last move has come back from the host.
    if (key === "Enter") {
      await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
      await expect(turn(page)).not.toContainText("보내는 중", { timeout: 30000 });
    }
    await page.keyboard.press(key);
    await page.waitForTimeout(60);
  }
}
/** Tries `attempt` (its number given) until the page's move count goes up, waiting a while after each; the new count. */
async function moveOnce(page: Page, attempt: (tries: number) => Promise<void>) {
  const before = await moves(page);
  for (let tries = 0; tries < 10; tries++) {
    await attempt(tries);
    const moved = await expect
      .poll(() => moves(page), { timeout: 4000 })
      .toBeGreaterThan(before)
      .then(
        () => true,
        () => false,
      );
    if (moved) return moves(page);
  }
  throw new Error("no move was made");
}

test("battleship by codes: both lay their fleets at once, each sees only its own, then 선공 fires first", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await lobby(host, "배틀십", "방장");
  await host.locator("#net-host").click();
  await pair(host, guest, "배틀십", "민수");
  await start(host, pages);
  // Both lay at once: each device is told to lay its own carrier.
  for (const page of pages) await expect(turn(page)).toContainText("항공모함(5칸)을 내 해역에 놓으세요");
  // The guest lays its carrier from the keyboard and the rest at random; the host has laid nothing yet.
  await keys(guest, ["ArrowRight", "ArrowLeft", "Enter"]);
  await expect(guest.locator("#pg-count-0 .fleet-count")).toHaveText("배 1 / 5척 배치", { timeout: 20000 });
  await expect(host.locator("#pg-count-1 .fleet-count")).toHaveText("배 1 / 5척 배치", { timeout: 20000 });
  await press(guest, "남은 배 무작위로 놓기");
  await expect(turn(guest)).toContainText("상대가 배를 놓는 중입니다", { timeout: 20000 });
  // The guest's ships are in sight on its own chart only.
  await expect(canvas(guest)).toHaveAttribute("data-shown", "5,0");
  await expect(canvas(host)).toHaveAttribute("data-shown", "0,0");
  await press(host, "남은 배 무작위로 놓기");
  await expect(turn(host)).toContainText("나 (선공) 차례", { timeout: 20000 });
  await expect(turn(guest)).toContainText("방장 (선공) 차례입니다");
  for (const page of pages) await expect(canvas(page)).toHaveAttribute("data-shown", "5,0");
  // Out of turn: the guest's tap is refused with words.
  await keys(guest, ["ArrowRight", "Enter"]);
  await expect(turn(guest)).toContainText("상대 차례입니다");
  // A few shots, each by the device whose turn it is (a hit fires again); every device counts the same.
  for (let shot = 0; shot < 6; shot++) {
    const page = await mover(pages),
      count = await moveOnce(page, (tries) => keys(page, [tries % 2 ? "ArrowDown" : "ArrowRight", "Enter"]));
    await agree(pages, count);
    // What one device says of its fleet the other says of the other's.
    expect(await host.locator("#pg-count-0").innerText()).toBe(await guest.locator("#pg-count-1").innerText());
    expect(await host.locator("#pg-count-1").innerText()).toBe(await guest.locator("#pg-count-0").innerText());
  }
  // A ship of the other's is in sight only once it is sunk.
  const shown = (await canvas(guest).getAttribute("data-shown"))!.split(",").map(Number);
  expect(shown[0]).toBe(5);
  expect(shown[1]).toBeLessThan(5);
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("number baseball by codes: both key their numbers at once, neither sees the other's until the end", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await lobby(host, "숫자야구", "방장");
  await host.locator("#net-host").click();
  await pair(host, guest, "숫자야구", "민수");
  await start(host, pages);
  // Each page walks the keys with its own cursor: point 0–9 the digits, 11 the 확인.
  const cursor = new Map<Page, number>();
  async function key(page: Page, to: number) {
    let at = cursor.get(page);
    const walk: string[] = [];
    if (at === undefined) {
      walk.push("ArrowRight", "ArrowLeft");
      at = 0;
    }
    for (; at < to; at++) walk.push("ArrowRight");
    for (; at > to; at--) walk.push("ArrowLeft");
    cursor.set(page, to);
    await keys(page, [...walk, "Enter"]);
  }
  /** Keys a number, each key once the last has come back from the host. */
  async function number(page: Page, digits: number[]) {
    for (let i = 0; i < digits.length; i++) {
      await key(page, digits[i]);
      await expect(canvas(page)).toHaveAttribute("data-entry", digits.slice(0, i + 1).join(""), { timeout: 20000 });
    }
    await key(page, 11);
  }
  for (const page of pages) await expect(turn(page)).toContainText("내 숫자 3자리를 정하세요");
  // The two key at once.
  await Promise.all([number(host, [1, 2, 3]), number(guest, [4, 5, 6])]);
  await expect(canvas(host)).toHaveAttribute("data-mine", "123", { timeout: 20000 });
  await expect(canvas(guest)).toHaveAttribute("data-mine", "456", { timeout: 20000 });
  for (const page of pages) await expect(canvas(page)).toHaveAttribute("data-theirs", "");
  await expect(turn(host)).toContainText("나 (선공) 차례", { timeout: 20000 });
  await expect(turn(guest)).toContainText("방장 (선공) 차례입니다");
  // The host throws a miss; the guest throws the host's number and wins the round.
  await number(host, [7, 8, 9]);
  await agree(pages, 1);
  await expect(turn(guest)).toContainText("나 (후공) 차례");
  await number(guest, [1, 2, 3]);
  await agree(pages, 2);
  await expect(guest.locator("#pg-final")).toContainText("이겼습니다! 상대의 숫자는 123, 내 숫자는 456였습니다.", { timeout: 20000 });
  await expect(host.locator("#pg-final")).toContainText("민수 (후공) 승리! 상대의 숫자는 456, 내 숫자는 123였습니다.");
  await expect(canvas(host)).toHaveAttribute("data-theirs", "456");
  await expect(canvas(guest)).toHaveAttribute("data-theirs", "123");
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("dominoes in the app: each phone holds its own hand, the two lay in turn and count the same", async ({ browser }, info) => {
  const wifi = new FakeWifi();
  const a = await phone(browser, info, wifi, "192.168.0.12"),
    b = await phone(browser, info, wifi, "192.168.0.23"),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await lobby(host, "도미노", "방장");
  await host.locator("#net-host").click();
  await lobby(guest, "도미노", "민수");
  await guest.locator("#net-join").click();
  await guest.locator(".net-room:not(.other)").click();
  await expect(guest.locator(".net-seats")).toBeVisible({ timeout: 15000 });
  await start(host, pages);
  for (const page of pages) await expect(page.locator("#pg-count-0")).toHaveText("패 7장");
  await expect(turn(guest)).toContainText("방장 (선공) 차례입니다");
  for (let step = 0; step < 6; step++) {
    const page = await mover(pages),
      count = await moveOnce(page, async (tries) => {
        if (await tool(page, "더미에서 가져오기").isVisible()) return press(page, "더미에서 가져오기");
        if (await tool(page, "차례 넘기기").isVisible()) return press(page, "차례 넘기기");
        // A tile that fits both ends waits for an end: the ring above my hand.
        if (/갈 곳을 고르세요/.test(await turn(page).innerText())) return keys(page, ["ArrowUp", "Enter"]);
        // The keyboard walks my hand: to its left end, then a tile further right at each try, until one fits.
        await keys(page, ["ArrowDown", ...Array<string>(10).fill("ArrowLeft"), ...Array<string>(tries).fill("ArrowRight"), "Enter"]);
      });
    await agree(pages, count);
    // My hand on one phone is the other's hand on the other.
    expect(await host.locator("#pg-count-0").innerText()).toBe(await guest.locator("#pg-count-1").innerText());
    expect(await host.locator("#pg-count-1").innerText()).toBe(await guest.locator("#pg-count-0").innerText());
  }
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});

test("number code by codes: both arrange their rows at once (a joker placed or not), neither sees the other's row until both say 배열 완료", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    pages = [a.page, b.page],
    [host, guest] = pages;
  await lobby(host, "숫자 코드", "방장");
  await host.locator("#net-host").click();
  await pair(host, guest, "숫자 코드", "민수");
  await start(host, pages);
  const data = (page: Page) => page.evaluate(() => ({ ...document.querySelector<HTMLCanvasElement>("main.game-layout canvas")!.dataset }));
  // Each arranges its own row (the jokers are in by default): a joker to place, or only 배열 완료 to say; the other's
  // row is not on its table meanwhile, and nothing on it says who has a joker.
  for (const page of pages) {
    await expect.poll(async () => (await data(page)).phase, { timeout: 30000 }).toMatch(/^(joker|arrange)$/);
    expect((await data(page)).rows!.split(",")[1]).toBe("0");
  }
  const count = await moves(host);
  // The host places any joker dealt to it (the keyboard at a gap of its row), then says it is done.
  while ((await data(host)).phase === "joker") {
    const before = (await data(host)).rows;
    await keys(host, ["ArrowLeft", "Enter"]);
    await expect.poll(async () => (await data(host)).rows, { timeout: 15000 }).not.toBe(before);
  }
  // A joker placed is no move, for either device.
  for (const page of pages) expect(await moves(page)).toBe(count);
  await expect(host.locator(".nc-ready")).toBeVisible();
  await host.locator(".nc-ready").click();
  await expect(turn(host)).toContainText("다른 사람이 패를 정리하는 중입니다", { timeout: 15000 });
  await agree(pages, count + 1);
  // The guest still arranging still sees no row of the host's.
  expect((await data(guest)).rows!.split(",")[1]).toBe("0");
  while ((await data(guest)).phase === "joker") {
    const before = (await data(guest)).rows;
    await keys(guest, ["ArrowLeft", "Enter"]);
    await expect.poll(async () => (await data(guest)).rows, { timeout: 15000 }).not.toBe(before);
  }
  await guest.locator(".nc-ready").click();
  await agree(pages, count + 2);
  // Both rows come out together, and 1번 (the host) draws first.
  for (const page of pages) {
    await expect.poll(async () => (await data(page)).rows!.split(",").every((n) => Number(n) >= 4), { timeout: 15000 }).toBe(true);
    await expect.poll(async () => (await data(page)).phase, { timeout: 15000 }).toBe("draw");
  }
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
