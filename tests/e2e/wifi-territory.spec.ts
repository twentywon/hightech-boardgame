import { test, expect, type Browser, type Page, type TestInfo } from "@playwright/test";
import { selectGame, leaveTable } from "./library";

/*
 * 와이파이 여럿이 on the 땅따먹기 field: two pages of one browser, each its own device, joined by WebRTC with the pairing
 * codes pasted. The host's device runs the one round (and a computer's mover on a third seat); the guest sends the
 * heading it wants and draws what the host tells it, the field laid from the host's slices. The real clock is kept.
 * The round is a 데스매치 (no clock; a timed round would outlast the test on a software-drawn page): the host and the
 * guest each run their mover across its own trail, and with no person left in, it ends alike on both.
 */
test.setTimeout(480_000);

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
/**
 * Mover `k`, steered by this page's keys, runs off its land toward the middle, then round a small square back across
 * its own trail: out (read off this page's canvas, the host's round as this device shows it).
 */
const fall = (page: Page, k: number) =>
  page.evaluate(
    (k) =>
      new Promise<{ outs: number; leg: number }>((done) => {
        const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
          read = () => {
            const d = el.dataset,
              [x, y] = d.pos!.split(";")[k].split(",").map(Number);
            return { x, y, outs: Number(d.outs!.split(",")[k]), trail: Number(d.trails!.split(",")[k]), phase: d.phase };
          },
          key = (code: string, down: boolean) => document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true })),
          first = read(),
          hx = first.x < 32 ? 1 : -1,
          vy = first.y < 32 ? 1 : -1,
          H = (s: number) => (s > 0 ? "ArrowRight" : "ArrowLeft"),
          V = (s: number) => (s > 0 ? "ArrowDown" : "ArrowUp"),
          began = performance.now();
        let from = first,
          leg = 0;
        const legs: [string, (p: ReturnType<typeof read>) => boolean][] = [
          // Off my land toward the middle, until a trail lies behind.
          [H(hx), (p) => p.trail > 8],
          [V(vy), (p) => Math.abs(p.y - from.y) > 2.5],
          [H(-hx), (p) => (p.x - from.x) * hx < -1.5],
          // Back across the first leg's trail.
          [V(-vy), () => false],
        ];
        key(legs[0][0], true);
        const tick = () => {
          const p = read();
          if (p.outs > first.outs || p.phase === "over" || performance.now() - began > 150_000) {
            key(legs[leg][0], false);
            return done({ outs: p.outs - first.outs, leg });
          }
          if (legs[leg][1](p)) {
            key(legs[leg][0], false);
            if (leg === 0) from = p;
            key(legs[++leg][0], true);
          }
          requestAnimationFrame(tick);
        };
        tick();
      }),
    k,
  );

test("territory on two devices: the guest steers its own mover on both screens, the field is alike on both, a pause stops both, and the round ends alike @alone", async ({ browser }, info) => {
  const a = await device(browser, info),
    b = await device(browser, info),
    host = a.page,
    guest = b.page;
  await lobby(host, "방장", "death");
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

  // Three movers on both; each device's own is 나 on its board; the host's round: a deathmatch, no clock on either.
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
  for (const page of [host, guest]) {
    await expect(canvasOf(page)).toHaveAttribute("data-mode", "death");
    await expect(canvasOf(page)).toHaveAttribute("data-left", "");
    await expect(page.locator(".ld-clock b")).toHaveText("생존 3");
  }

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

  // The host runs across its own trail: out for good, shown out on both; the round goes on for the guest.
  expect(await fall(host, 0)).toMatchObject({ outs: 1, leg: 3 });
  for (const page of [host, guest]) {
    await expect.poll(async () => (await list(page, "alive"))[0], { timeout: 30000 }).toBe(0);
    await expect(page.locator(".ld-board li.ld-out").first()).toBeVisible({ timeout: 30000 });
  }
  // (The computer's yellow is most likely still in: then it goes on, and the clock says who is.)
  if ((await canvasOf(host).getAttribute("data-phase")) === "play") {
    const left = (await list(host, "alive")).filter(Boolean).length;
    await expect(host.locator(".ld-clock b")).toHaveText(`생존 ${left}`);
    await host.waitForTimeout(4000);
    // Long past the timed rounds' wait to come back, the host is still out.
    expect((await list(host, "alive"))[0]).toBe(0);
    // Then the guest falls too: no person is left in, and the round ends alike on both devices.
    if ((await canvasOf(host).getAttribute("data-phase")) === "play") expect(await fall(guest, 1)).toMatchObject({ outs: 1 });
  }
  for (const page of [host, guest]) await expect(page.locator(".board-finale")).toBeVisible({ timeout: 60000 });
  // Each device words the outcome its own way (이겼습니다! or whose win); the order and shares after it are the same.
  const order = (text: string) => text.slice(text.indexOf("1위")),
    final = order(await host.locator("#pg-final").innerText());
  // The host, out first, is not first; the order is the same on both (checked below).
  expect(final).toMatch(/^1위 (파랑|노랑) \d+\.\d% · 2위 .* · 3위 /);
  await expect.poll(async () => order(await guest.locator("#pg-final").innerText())).toBe(final);
  for (const page of [host, guest]) await expect(canvasOf(page)).toHaveAttribute("data-phase", "over");

  // The host leaves: the room is gone for the guest too.
  await leaveTable(host);
  const gone = guest.locator("dialog[open]", { hasText: "방이 없어졌습니다" });
  await expect(gone).toBeVisible({ timeout: 15000 });
  await gone.getByRole("button", { name: "확인" }).click();
  expect(a.errors).toEqual([]);
  expect(b.errors).toEqual([]);
});
