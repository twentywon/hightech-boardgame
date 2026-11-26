import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

const canvas = (page: Page) => page.locator("#board canvas");
/** Each bandit's place in the valley (x, y), as the canvas tells it. */
async function men(page: Page) {
  return ((await canvas(page).getAttribute("data-men")) ?? "").split(";").map((p) => p.split(",").map(Number));
}
const counts = async (page: Page, what: string) => ((await canvas(page).getAttribute(`data-${what}`)) ?? "").split(",").map(Number);
async function sit(page: Page, mode: "ai" | "local", level = "easy", variant = "100") {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "금화 쟁탈전");
  await page.locator(`dialog[open] input[name=pg-mode][value=${mode}]`).check();
  await page.locator("#pg-variant").selectOption(variant);
  if (mode === "ai") await page.locator("#pg-level").selectOption(level);
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(canvas(page)).toHaveAttribute("data-phase", "play");
  return errors;
}
/** A key held on the page for a while (the software-drawn page is slow: the hold is counted by the page's own clock). */
const hold = (page: Page, code: string, ms: number) =>
  page.evaluate(
    ([c, t]) =>
      new Promise<void>((done) => {
        document.dispatchEvent(new KeyboardEvent("keydown", { code: c as string, bubbles: true }));
        setTimeout(() => {
          document.dispatchEvent(new KeyboardEvent("keyup", { code: c as string, bubbles: true }));
          done();
        }, t as number);
      }),
    [code, ms],
  );
const press = (page: Page, code: string) => hold(page, code, 60);
/** A key put down or let go on the page (held across what the test waits for: the software-drawn page has few frames a second). */
const key = (page: Page, code: string, down: boolean) => page.evaluate(([c, d]) => void document.dispatchEvent(new KeyboardEvent(d ? "keydown" : "keyup", { code: c as string, bubbles: true })), [code, down] as const);
/** The valley as it is two frames on: what the canvas tells is then of now. */
const settle = (page: Page) => page.evaluate(() => new Promise<void>((done) => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(() => done())), 350)));
/** Holds a key until my (or `who`'s) bandit has run `far` that way, then lets go and waits for it to stand. */
async function run(page: Page, code: string, way: 1 | -1, far = 0.8, who = 0) {
  const from = (await men(page))[who][0];
  await key(page, code, true);
  await expect.poll(async () => ((await men(page))[who][0] - from) * way, { timeout: 20_000 }).toBeGreaterThan(far);
  await key(page, code, false);
  await settle(page);
}

test("gold raid: against the computer the keys run, jump and strike my bandit, and the board shows both castles", async ({ page }) => {
  const errors = await sit(page, "ai");
  await expect(page.locator(".gr-hud .gr-side")).toHaveCount(2);
  await expect(page.locator(".gr-hud .gr-s0 b")).toHaveText("나");
  await expect(page.locator(".gr-hud .gr-s1 b")).toHaveText("컴퓨터");
  await expect(page.locator(".gr-gold-0")).toHaveText("0/100");
  await expect(canvas(page)).toHaveAttribute("data-two", "false");
  const [start] = await men(page);
  expect(start[0]).toBeLessThan(-20);
  // The valley is long: the eye is on my bandit at my end of it, and the strip under the board shows all of it.
  const eye = async () => (await canvas(page).getAttribute("data-eye"))!.split(",").map(Number);
  await expect(canvas(page)).toHaveAttribute("data-split", "false");
  expect((await eye())[0]).toBeLessThan(-10);
  await expect(page.locator(".gr-map .gr-map-man")).toHaveCount(2);
  await expect(page.locator(".gr-map .gr-map-castle")).toHaveCount(2);
  await expect(page.locator(".gr-map .gr-map-eye:not([hidden])")).toHaveCount(1);
  // D runs to the right, A back to the left; the arrows are mine too against the computer.
  const looked = (await eye())[0];
  await run(page, "KeyD", 1, 9);
  // The eye has followed it (out from the valley's end, where it stood at the castle).
  expect((await eye())[0]).toBeGreaterThan(looked + 0.5);
  const [right] = await men(page);
  expect(right[0]).toBeGreaterThan(start[0] + 0.8);
  expect((await counts(page, "face"))[0]).toBe(1);
  await run(page, "KeyA", -1, 0.3);
  expect((await counts(page, "face"))[0]).toBe(-1);
  expect((await men(page))[0][0]).toBeLessThan(right[0]);
  await run(page, "ArrowRight", 1, 0.3);
  expect((await counts(page, "face"))[0]).toBe(1);
  // Let go, it stands where it is.
  const stood = (await men(page))[0][0];
  await settle(page);
  expect((await men(page))[0][0]).toBeCloseTo(stood, 1);
  // W jumps (once for a press, however long it is held), S and F strike.
  const jumps = (await counts(page, "jumps"))[0];
  await press(page, "KeyW");
  await expect.poll(async () => (await counts(page, "jumps"))[0]).toBe(jumps + 1);
  const swings = (await counts(page, "swings"))[0];
  await press(page, "KeyS");
  await expect.poll(async () => (await counts(page, "swings"))[0]).toBe(swings + 1);
  // F strikes too, once the club is ready again (a press while it is not is lost: the page here is slow, so it is asked again).
  await expect(async () => {
    await press(page, "KeyF");
    await settle(page);
    expect((await counts(page, "swings"))[0]).toBeGreaterThan(swings + 1);
  }).toPass({ timeout: 30_000 });
  // The computer plays its own bandit: it leaves its gate for the loot.
  await expect.poll(async () => (await men(page))[1][0], { timeout: 30_000 }).toBeLessThan(21);
  // P pauses the valley: nothing moves.
  await page.keyboard.press("p");
  await expect(canvas(page)).toHaveAttribute("data-phase", "paused");
  await settle(page);
  const time = await canvas(page).getAttribute("data-time");
  await settle(page);
  expect(await canvas(page).getAttribute("data-time")).toBe(time);
  await page.keyboard.press("p");
  await expect(canvas(page)).toHaveAttribute("data-phase", "play");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("gold raid: gold picked up and brought to my gate raises my treasury on the board", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await sit(page, "ai");
  // Played in the page by what the canvas tells: to the nearest gold lying on the road, then home with it.
  const gold = await page.evaluate(
    () =>
      new Promise<number>((done) => {
        const el = document.querySelector<HTMLCanvasElement>("#board canvas")!,
          held = new Set<string>(),
          key = (code: string, down: boolean) => {
            if (down === held.has(code)) return;
            if (down) held.add(code);
            else held.delete(code);
            document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
          },
          began = Date.now();
        const tick = () => {
          const d = el.dataset,
            x = Number(d.men!.split(";")[0].split(",")[0]),
            carry = Number(d.carry!.split(",")[0]),
            treasury = Number(d.gold!.split(",")[0]);
          if (treasury > 0 || Date.now() - began > 200_000) {
            key("KeyA", false);
            key("KeyD", false);
            return done(treasury);
          }
          const loot = (d.loot ?? "")
            .split(";")
            .filter(Boolean)
            .map((t) => t.split(":"))
            .map(([kind, lx, ly, rest]) => ({ kind, x: Number(lx), y: Number(ly), rest: rest === "1" }));
          const bomb = loot.some((i) => i.kind === "bomb" && Math.abs(i.x - x) < 2.6 && i.y < 5),
            near = loot.filter((i) => i.kind !== "bomb" && i.rest && i.y < 0.5).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0],
            // Home with anything in the sack; away from a bomb; else to the gold; else wait near my side's middle.
            to = carry > 0 ? -25 : bomb ? x - 3 : near ? near.x : -14,
            way = Math.abs(to - x) < 0.15 ? 0 : Math.sign(to - x);
          key("KeyD", way > 0);
          key("KeyA", way < 0);
          requestAnimationFrame(tick);
        };
        tick();
      }),
  );
  expect(gold).toBeGreaterThan(0);
  await expect(page.locator(".gr-gold-0")).toHaveText(`${(await counts(page, "gold"))[0]}/100`);
  expect(Number((await page.locator(".gr-gold-0").innerText()).split("/")[0])).toBeGreaterThan(0);
  expect((await counts(page, "deposits"))[0]).toBeGreaterThan(0);
  // The bar of my castle has grown with it.
  expect(await page.locator(".gr-s0 .gr-bar i").evaluate((el) => parseFloat((el as HTMLElement).style.width))).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test("gold raid: the buttons on a touch screen run, jump and strike", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "the buttons are a touch screen's");
  const errors = await sit(page, "ai");
  await expect(page.locator(".gr-pad .gr-btn")).toHaveCount(4);
  // Synthetic pointers in the page (several at once): ▶ held while 점프 and 치기 are pressed.
  const finger = (act: string, type: "pointerdown" | "pointerup", id: number, side = 0) =>
    page.evaluate(
      ([a, t, i, s]) => {
        const b = document.querySelector<HTMLElement>(`.gr-pad .gr-btn[data-act="${a}"][data-side="${s}"]`)!,
          r = b.getBoundingClientRect();
        b.dispatchEvent(new PointerEvent(t as string, { pointerId: i as number, pointerType: "touch", isPrimary: i === 11, bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
      },
      [act, type, id, side] as const,
    );
  const [start] = await men(page);
  await finger("right", "pointerdown", 11);
  await expect(page.locator('.gr-btn[data-act="right"]')).toHaveClass(/on/);
  await expect.poll(async () => (await men(page))[0][0], { timeout: 20_000 }).toBeGreaterThan(start[0] + 0.8);
  const jumps = (await counts(page, "jumps"))[0],
    swings = (await counts(page, "swings"))[0];
  await finger("jump", "pointerdown", 12);
  await finger("jump", "pointerup", 12);
  await expect.poll(async () => (await counts(page, "jumps"))[0]).toBe(jumps + 1);
  await finger("strike", "pointerdown", 13);
  await finger("strike", "pointerup", 13);
  await expect.poll(async () => (await counts(page, "swings"))[0]).toBe(swings + 1);
  await finger("right", "pointerup", 11);
  await expect(page.locator('.gr-btn[data-act="right"]')).not.toHaveClass(/on/);
  await settle(page);
  const [after] = await men(page);
  expect(after[0]).toBeGreaterThan(start[0] + 0.8);
  // Let go, it stands; ◀ turns it back.
  await settle(page);
  expect((await men(page))[0][0]).toBeCloseTo(after[0], 1);
  await finger("left", "pointerdown", 14);
  await expect.poll(async () => (await men(page))[0][0], { timeout: 20_000 }).toBeLessThan(after[0] - 0.3);
  await finger("left", "pointerup", 14);
  expect((await counts(page, "face"))[0]).toBe(-1);
  // The buttons stand clear of the board over the valley, inside the table.
  const box = await page.locator(".gr-hud").boundingBox(),
    button = await page.locator('.gr-btn[data-act="jump"]').boundingBox();
  expect(button!.y).toBeGreaterThan(box!.y + box!.height);
  expect(errors).toEqual([]);
});

test("gold raid: two at one screen each move their own bandit with their own keys", async ({ page }, info) => {
  const errors = await sit(page, "local");
  await expect(canvas(page)).toHaveAttribute("data-two", "true");
  await expect(page.locator(".gr-hud .gr-s0 b")).toHaveText("1P");
  await expect(page.locator(".gr-hud .gr-s1 b")).toHaveText("2P");
  const [a, b] = await men(page);
  expect(a[0]).toBeLessThan(-20);
  expect(b[0]).toBeGreaterThan(20);
  // So far apart at their gates, the screen is split: each half follows one, and the strip shows two windows.
  await expect(canvas(page)).toHaveAttribute("data-split", "true");
  await expect(page.locator(".gr-seam.on")).toBeVisible();
  await expect(page.locator(".gr-map .gr-map-eye:not([hidden])")).toHaveCount(2);
  const halves = (await canvas(page).getAttribute("data-eye"))!.split(",").map(Number);
  expect(halves[0]).toBeLessThan(-10);
  expect(halves[1]).toBeGreaterThan(10);
  // The first person's D moves red alone; the second's ← moves blue alone.
  await run(page, "KeyD", 1);
  const [a1, b1] = await men(page);
  expect(a1[0]).toBeGreaterThan(a[0] + 0.8);
  expect(b1[0]).toBeCloseTo(b[0], 1);
  await run(page, "ArrowLeft", -1, 0.8, 1);
  const [a2, b2] = await men(page);
  expect(b2[0]).toBeLessThan(b[0] - 0.8);
  expect(a2[0]).toBeCloseTo(a1[0], 1);
  // Each one's jump and strike are their own.
  const jumps = await counts(page, "jumps"),
    swings = await counts(page, "swings");
  await press(page, "ArrowUp");
  await expect.poll(() => counts(page, "jumps")).toEqual([jumps[0], jumps[1] + 1]);
  await press(page, "KeyW");
  await expect.poll(() => counts(page, "jumps")).toEqual([jumps[0] + 1, jumps[1] + 1]);
  await press(page, "Slash");
  await expect.poll(() => counts(page, "swings")).toEqual([swings[0], swings[1] + 1]);
  await press(page, "KeyF");
  await expect.poll(() => counts(page, "swings")).toEqual([swings[0] + 1, swings[1] + 1]);
  // A touch screen gives each a set of four buttons at their own side.
  if (info.project.name === "mobile") {
    await expect(page.locator('.gr-pad .gr-btn[data-side="0"]')).toHaveCount(4);
    await expect(page.locator('.gr-pad .gr-btn[data-side="1"]')).toHaveCount(4);
    const left = await page.locator('.gr-btn[data-side="0"][data-act="jump"]').boundingBox(),
      right = await page.locator('.gr-btn[data-side="1"][data-act="left"]').boundingBox();
    expect(left!.x + left!.width).toBeLessThan(right!.x);
    // A jump hangs in the air over a second now: blue is first let come down from the last.
    await expect.poll(async () => (await men(page))[1][1]).toBe(0);
    await settle(page);
    const before = (await counts(page, "jumps"))[1];
    await page.evaluate(() => {
      const b = document.querySelector<HTMLElement>('.gr-pad .gr-btn[data-act="jump"][data-side="1"]')!;
      for (const type of ["pointerdown", "pointerup"]) b.dispatchEvent(new PointerEvent(type, { pointerId: 21, pointerType: "touch", bubbles: true, cancelable: true }));
    });
    await expect.poll(async () => (await counts(page, "jumps"))[1]).toBe(before + 1);
  }
  expect(errors).toEqual([]);
});
