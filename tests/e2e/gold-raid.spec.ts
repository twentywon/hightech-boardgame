import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

const canvas = (page: Page) => page.locator("#board canvas");
/** Each bandit's place in the valley (x, y), as the canvas tells it. */
async function men(page: Page) {
  return ((await canvas(page).getAttribute("data-men")) ?? "").split(";").map((p) => p.split(",").map(Number));
}
/** The heights a bandit stands at: the road and the ledges (in the short valley a bandit near its gate may stand under one). */
const LANDS = [0, 1.6, 3.2];
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
  // (Long: against the computer my bandit may be struck down on the way, and gets up and runs on.)
  await expect.poll(async () => ((await men(page))[who][0] - from) * way, { timeout: 60_000 }).toBeGreaterThan(far);
  await key(page, code, false);
  await settle(page);
}

test("gold raid: against the computer the keys run, jump and strike my bandit, and the board shows both castles", async ({ page }, info) => {
  test.setTimeout(240_000);
  const phone = info.project.name === "mobile";
  const errors = await sit(page, "ai");
  await expect(page.locator(".gr-hud .gr-side")).toHaveCount(2);
  await expect(page.locator(".gr-hud .gr-s0 b")).toHaveText("나");
  await expect(page.locator(".gr-hud .gr-s1 b")).toHaveText("컴퓨터");
  await expect(page.locator(".gr-gold-0")).toHaveText("0/100");
  await expect(canvas(page)).toHaveAttribute("data-two", "false");
  const [start] = await men(page);
  expect(start[0]).toBeLessThan(-7);
  // The valley is long: the eye is on my bandit at my end of it, and the strip under the board shows all of it.
  const eye = async () => (await canvas(page).getAttribute("data-eye"))!.split(",").map(Number);
  await expect(canvas(page)).toHaveAttribute("data-split", "false");
  // (A phone held sideways sees near all of the 20 m valley at once, so its eye hardly moves; a desktop window less.)
  expect((await eye())[0]).toBeLessThan(phone ? 0.01 : -3);
  await expect(page.locator(".gr-map .gr-map-man")).toHaveCount(2);
  await expect(page.locator(".gr-map .gr-map-castle")).toHaveCount(2);
  await expect(page.locator(".gr-map .gr-map-eye:not([hidden])")).toHaveCount(1);
  // D runs to the right, A back to the left; the arrows are mine too against the computer.
  const looked = (await eye())[0];
  await run(page, "KeyD", 1, 9);
  // The eye has followed it (out from the valley's end, where it stood at the castle).
  if (!phone) expect((await eye())[0]).toBeGreaterThan(looked + 0.5);
  else expect((await eye())[0]).toBeGreaterThanOrEqual(looked);
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
  // (In the short valley the computer may come and club mine first: a press while down is lost, so it is asked again.)
  await expect(async () => {
    await press(page, "KeyS");
    await settle(page);
    expect((await counts(page, "swings"))[0]).toBeGreaterThan(swings);
  }).toPass({ timeout: 30_000 });
  const swung = (await counts(page, "swings"))[0];
  // F strikes too, once the club is ready again (a press while it is not is lost: the page here is slow, so it is asked again).
  await expect(async () => {
    await press(page, "KeyF");
    await settle(page);
    expect((await counts(page, "swings"))[0]).toBeGreaterThan(swung);
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
  test.setTimeout(480_000);
  // Two at one screen, the other bandit left standing: the computer robs a laden bandit before anything else, and
  // would take every pouch off mine on the way home.
  const errors = await sit(page, "local");
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
          if (treasury > 0 || Date.now() - began > 420_000) {
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
            to = carry > 0 ? -10 : bomb ? x - 3 : near ? near.x : -10,
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

/**
 * A finger on a lever (or on a side's 치기) in the page, by synthetic pointers: put down at the lever's middle leaned
 * by (x, y) of its reach (y upward), moved, or lifted.
 */
const lever = (page: Page, type: "pointerdown" | "pointermove" | "pointerup", id: number, x = 0, y = 0, side = 0) =>
  page.evaluate(
    ([t, i, lx, ly, s]) => {
      const el = document.querySelector<HTMLElement>(`.gr-pad .gr-stick[data-side="${s}"]`)!,
        r = el.getBoundingClientRect(),
        reach = r.width * 0.3;
      el.dispatchEvent(new PointerEvent(t as string, { pointerId: i as number, pointerType: "touch", bubbles: true, cancelable: true, clientX: r.x + r.width / 2 + (lx as number) * reach, clientY: r.y + r.height / 2 - (ly as number) * reach }));
    },
    [type, id, x, y, side] as const,
  );
const tap = (page: Page, side: number, id: number) =>
  page.evaluate(
    ([s, i]) => {
      const b = document.querySelector<HTMLElement>(`.gr-pad .gr-btn[data-act="strike"][data-side="${s}"]`)!,
        r = b.getBoundingClientRect();
      for (const type of ["pointerdown", "pointerup"]) b.dispatchEvent(new PointerEvent(type, { pointerId: i as number, pointerType: "touch", bubbles: true, cancelable: true, clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 }));
    },
    [side, id] as const,
  );

test("gold raid: on a touch screen the lever runs (the further the faster) and jumps when leaned up, and 치기 strikes", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "the lever is a touch screen's");
  const errors = await sit(page, "ai");
  await expect(page.locator(".gr-pad .gr-stick")).toHaveCount(1);
  await expect(page.locator(".gr-pad .gr-btn")).toHaveCount(1);
  await expect(page.locator('.gr-pad .gr-btn[data-act="strike"]')).toHaveCount(1);
  const [start] = await men(page);
  // Leaned right: it runs right, and the knob and its arrow show it.
  await lever(page, "pointerdown", 11, 0.95, 0);
  await expect(page.locator(".gr-stick")).toHaveClass(/on/);
  await expect(page.locator(".gr-stick")).toHaveClass(/gr-go-r/);
  await expect.poll(async () => (await men(page))[0][0], { timeout: 20_000 }).toBeGreaterThan(start[0] + 0.8);
  expect((await counts(page, "face"))[0]).toBe(1);
  // In its dead middle it stands.
  await lever(page, "pointermove", 11, 0.1, 0);
  await settle(page);
  const stood = (await men(page))[0][0];
  await settle(page);
  expect((await men(page))[0][0]).toBeCloseTo(stood, 1);
  // Leaned up: it jumps at once, and held up there it jumps again on each landing (the user asked for it).
  const jumps = (await counts(page, "jumps"))[0],
    swings = (await counts(page, "swings"))[0];
  await lever(page, "pointermove", 11, 0, 0.9);
  await expect(page.locator(".gr-stick")).toHaveClass(/gr-go-u/);
  await expect.poll(async () => (await counts(page, "jumps"))[0]).toBeGreaterThanOrEqual(jumps + 1);
  await expect.poll(async () => (await counts(page, "jumps"))[0], { timeout: 30_000 }).toBeGreaterThanOrEqual(jumps + 3);
  // Let down: it lands (on the road, or on a low ledge if it stood under one) and jumps no more.
  await lever(page, "pointermove", 11, 0, 0);
  await expect.poll(async () => LANDS.includes((await men(page))[0][1]), { timeout: 20_000 }).toBe(true);
  await settle(page);
  const landed = (await counts(page, "jumps"))[0];
  await settle(page);
  expect((await counts(page, "jumps"))[0]).toBe(landed);
  // Up again: another at once.
  await lever(page, "pointermove", 11, 0, 0.9);
  await expect.poll(async () => (await counts(page, "jumps"))[0]).toBeGreaterThanOrEqual(landed + 1);
  await lever(page, "pointermove", 11, 0, 0);
  // 치기 with another finger while the lever is held.
  await tap(page, 0, 12);
  await expect.poll(async () => (await counts(page, "swings"))[0]).toBe(swings + 1);
  // Lifted, the knob goes home and the bandit stands; leaned left it turns back.
  await lever(page, "pointerup", 11);
  await expect(page.locator(".gr-stick")).not.toHaveClass(/on/);
  await expect.poll(async () => LANDS.includes((await men(page))[0][1]), { timeout: 20_000 }).toBe(true);
  await settle(page);
  const after = (await men(page))[0][0];
  await lever(page, "pointerdown", 13, -0.95, 0);
  await expect.poll(async () => (await men(page))[0][0], { timeout: 20_000 }).toBeLessThan(after - 0.3);
  await lever(page, "pointerup", 13);
  expect((await counts(page, "face"))[0]).toBe(-1);
  // A half lean runs slower than a full one.
  const pace = async (lean: number) => {
    await settle(page);
    const from = (await men(page))[0][0],
      t0 = await page.evaluate(() => performance.now());
    await lever(page, "pointerdown", 14, lean, 0);
    await expect.poll(async () => (await men(page))[0][0] - from, { timeout: 20_000 }).toBeGreaterThan(0.6);
    const ran = (await men(page))[0][0] - from,
      t1 = await page.evaluate(() => performance.now());
    await lever(page, "pointerup", 14);
    return ran / (t1 - t0);
  };
  const half = await pace(0.45),
    full = await pace(0.95);
  expect(half).toBeLessThan(full);
  // The controls stand clear of the board over the valley, inside the table.
  const box = await page.locator(".gr-hud").boundingBox(),
    stick = await page.locator(".gr-stick").boundingBox();
  expect(stick!.y).toBeGreaterThan(box!.y + box!.height);
  expect(errors).toEqual([]);
});

test("gold raid: a blow throws the other up into the air (no stun), and it is struck on while it is up", async ({ page }) => {
  test.setTimeout(240_000);
  const errors = await sit(page, "local");
  // The second walks to the middle, the first up to it (facing it).
  await run(page, "ArrowLeft", -1, 6.5, 1);
  const bx = (await men(page))[1][0];
  await run(page, "KeyD", 1, bx - 0.95 - (await men(page))[0][0]);
  const [a, b] = await men(page);
  expect(b[0] - a[0]).toBeGreaterThan(0.2);
  expect(b[0] - a[0]).toBeLessThan(1.2);
  // Every number the canvas tells of the second's being flung, kept.
  await page.evaluate(() => {
    const el = document.querySelector<HTMLCanvasElement>("#board canvas")!;
    const w = window as unknown as { flungMost: number };
    w.flungMost = 0;
    new MutationObserver(() => (w.flungMost = Math.max(w.flungMost, Number((el.dataset.flung ?? "0,0").split(",")[1])))).observe(el, { attributes: true, attributeFilter: ["data-flung"] });
  });
  // The first strikes again and again as fast as its sword allows.
  for (let k = 0; k < 10; k++) await press(page, "KeyF");
  await expect.poll(() => page.evaluate(() => (window as unknown as { flungMost: number }).flungMost), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  await expect(canvas(page)).toHaveAttribute("data-stun", "0,0");
  // It comes down again.
  await expect(canvas(page)).toHaveAttribute("data-flung", "0,0", { timeout: 20_000 });
  expect(errors).toEqual([]);
});

test("gold raid: two at one screen each move their own bandit with their own keys", async ({ page }, info) => {
  const errors = await sit(page, "local");
  await expect(canvas(page)).toHaveAttribute("data-two", "true");
  await expect(page.locator(".gr-hud .gr-s0 b")).toHaveText("1P");
  await expect(page.locator(".gr-hud .gr-s1 b")).toHaveText("2P");
  const [a, b] = await men(page);
  expect(a[0]).toBeLessThan(-7);
  expect(b[0]).toBeGreaterThan(7);
  // The valley is short: a phone held sideways holds both at their gates in one view, drawn back; a narrower desktop
  // window may split the screen, and then the strip shows a window for each half.
  if (info.project.name === "mobile") await expect(canvas(page)).toHaveAttribute("data-split", "false");
  const split = (await canvas(page).getAttribute("data-split")) === "true";
  await expect(page.locator(".gr-map .gr-map-eye:not([hidden])")).toHaveCount(split ? 2 : 1);
  if (!split) expect(Number(await canvas(page).getAttribute("data-zoom"))).toBeGreaterThanOrEqual(1);
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
  // A touch screen gives each a lever at its own edge and 치기 beside it; both levers work at once.
  if (info.project.name === "mobile") {
    await expect(page.locator('.gr-pad .gr-stick[data-side="0"]')).toHaveCount(1);
    await expect(page.locator('.gr-pad .gr-stick[data-side="1"]')).toHaveCount(1);
    await expect(page.locator('.gr-pad .gr-btn[data-side="0"]')).toHaveCount(1);
    await expect(page.locator('.gr-pad .gr-btn[data-side="1"]')).toHaveCount(1);
    const left = await page.locator('.gr-stick[data-side="0"]').boundingBox(),
      leftStrike = await page.locator('.gr-btn[data-side="0"]').boundingBox(),
      right = await page.locator('.gr-stick[data-side="1"]').boundingBox(),
      rightStrike = await page.locator('.gr-btn[data-side="1"]').boundingBox();
    expect(left!.x).toBeLessThan(leftStrike!.x);
    expect(leftStrike!.x + leftStrike!.width).toBeLessThan(rightStrike!.x);
    expect(rightStrike!.x + rightStrike!.width).toBeLessThan(right!.x + 1);
    // A jump hangs in the air over a second now: both are first let come down from the last.
    await expect.poll(async () => (await men(page)).every((m) => LANDS.includes(m[1]))).toBe(true);
    // In the short valley the two may stand together after the keys above, and a club may have downed one: let it stand.
    await page.waitForTimeout(2200);
    await settle(page);
    const [p, q] = await men(page),
      before = await counts(page, "jumps"),
      swung = await counts(page, "swings");
    // Red leans left and blue leans right, at once, each toward its own gate (away from the other's club).
    await lever(page, "pointerdown", 21, -0.95, 0, 0);
    await lever(page, "pointerdown", 22, 0.95, 0, 1);
    await expect.poll(async () => (await men(page))[0][0], { timeout: 20_000 }).toBeLessThan(p[0] - 0.6);
    await expect.poll(async () => (await men(page))[1][0], { timeout: 20_000 }).toBeGreaterThan(q[0] + 0.6);
    // Blue leans up while red still runs: blue alone jumps.
    await lever(page, "pointermove", 22, 0, 0.9, 1);
    await expect.poll(() => counts(page, "jumps")).toEqual([before[0], before[1] + 1]);
    await lever(page, "pointerup", 21, 0, 0, 0);
    await lever(page, "pointerup", 22, 0, 0, 1);
    await tap(page, 1, 23);
    await expect.poll(() => counts(page, "swings")).toEqual([swung[0], swung[1] + 1]);
  }
  expect(errors).toEqual([]);
});
