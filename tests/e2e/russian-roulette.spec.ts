import { test, expect, type Page } from "@playwright/test";
import { fastClock, selectGame } from "./library";

/*
 * 러시안 룰렛 (the user asked): a toy cap revolver passed round a party table, me against one to three computers. The
 * canvas tells the table (`data-seat` holding the toy, `data-left` chambers unfired since a spin, `data-out` who is
 * out, `data-spins`, `data-last` "seat,spun,bang,odds", `data-champion`, `data-toy` where my toy is on the canvas).
 */
test.setTimeout(240000);

const canvas = (page: Page) => page.locator("main.game-layout canvas");
const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const tool = (page: Page, label: string) => page.locator(".board-area .pg-tools").getByRole("button", { name: label });
const data = (page: Page, key: string) => canvas(page).getAttribute(`data-${key}`);

async function sit(page: Page, set?: (page: Page) => Promise<void>) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "러시안 룰렛");
  if (set) await set(page);
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 60000 });
  return errors;
}
/** Waits until it is my turn with the table at rest, or the game is over; true when it is my turn. */
async function myTurn(page: Page) {
  await expect
    .poll(
      async () => {
        if ((await page.locator("#pg-result").isVisible()) || (await data(page, "champion")) || (await page.locator(".board-finale").count())) return "over";
        const still = (await page.locator("#board").getAttribute("data-animating")) === "false";
        return still && (await data(page, "seat")) === "0" && (await tool(page, "그냥 당기기").isEnabled().catch(() => false)) ? "mine" : "wait";
      },
      { timeout: 120000 },
    )
    .not.toBe("wait");
  return !(await page.locator("#pg-result").isVisible()) && !(await page.locator(".board-finale").count()) && !(await data(page, "champion"));
}

test("russian roulette: four round the party table, the toy held up before me; a pull clicks or pops and the toy goes round", async ({ page }) => {
  const errors = await sit(page);
  await expect(canvas(page)).toHaveAttribute("data-seat", "0");
  await expect(canvas(page)).toHaveAttribute("data-left", "6");
  await expect(canvas(page)).toHaveAttribute("data-out", "0000");
  await expect(canvas(page)).toHaveAttribute("data-spins", "2,2,2,2");
  await expect(tool(page, "그냥 당기기")).toBeVisible();
  await expect(tool(page, "원통 돌리기 (2)")).toBeVisible();
  await expect(page.locator("#turn")).toContainText("펑 확률 1/6");
  await tool(page, "그냥 당기기").click();
  await expect.poll(async () => ((await data(page, "shots")) ?? "").length, { timeout: 60000 }).toBeGreaterThan(0);
  // The computers go on meanwhile: my pull is the first of the shots shown.
  const last = (await data(page, "shots"))!.split(";")[0].split(",").map(Number);
  expect(last.slice(0, 2)).toEqual([0, 0]);
  expect(last[3]).toBe(6);
  if (last[2] === 0) {
    // A click: the next pull (my left's) had one chamber fewer, unless it spun.
    await expect.poll(async () => ((await data(page, "shots")) ?? "").split(";").length, { timeout: 60000 }).toBeGreaterThan(1);
    const next = (await data(page, "shots"))!.split(";")[1].split(",").map(Number);
    expect(next[0]).toBe(1);
    expect(next[3]).toBe(next[1] ? 6 : 5);
  } else {
    // A 펑 on my first pull: out, and against the computer that is the end.
    await expect(canvas(page)).toHaveAttribute("data-out", /^1/);
    await expect(page.locator(".board-finale")).toBeVisible({ timeout: 30000 });
  }
  expect(errors).toEqual([]);
});

test("russian roulette: held down, the toy's trigger comes back and goes off; let go early, nothing happens; S spins", async ({ page }) => {
  const errors = await sit(page);
  const at = (await data(page, "toy"))!.split(",").map(Number),
    box = (await canvas(page).boundingBox())!,
    x = box.x + at[0],
    y = box.y + at[1];
  // A short press (a fifth of a second), by the real pointer: the trigger starts back and returns; no pull.
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(200);
  await page.mouse.up();
  await expect.poll(async () => Number(await data(page, "squeeze")), { timeout: 10000 }).toBe(0);
  await page.waitForTimeout(1500);
  expect(await moves(page)).toBe(0);
  // Held: all the way in, and it goes off.
  await page.mouse.down();
  await expect.poll(() => moves(page), { timeout: 30000 }).toBe(1);
  await page.mouse.up();
  await expect.poll(async () => ((await data(page, "shots")) ?? "").length, { timeout: 60000 }).toBeGreaterThan(0);
  expect((await data(page, "shots"))!.startsWith("0,0,")).toBe(true);
  // When it is my turn again, S spins before the pull (a spin used).
  if (await myTurn(page)) {
    const before = await moves(page);
    await canvas(page).focus();
    await page.keyboard.press("s");
    await expect.poll(() => moves(page), { timeout: 30000 }).toBe(before + 1);
    await expect.poll(async () => (await data(page, "spins"))!.split(",")[0], { timeout: 30000 }).toBe("1");
    await expect.poll(async () => ((await data(page, "shots")) ?? "").split(";").length, { timeout: 60000 }).toBeGreaterThan(before);
    expect((await data(page, "shots"))!.split(";")[before].startsWith("0,1,")).toBe(true);
  }
  expect(errors).toEqual([]);
});

test("russian roulette: one computer across, no spins; played to the end, the last one left wins @alone", async ({ page }) => {
  await fastClock(page);
  const errors = await sit(page, async (p) => {
    await p.locator("#pg-set-rivals").selectOption("1");
    await p.locator("#pg-set-spins").fill("0");
  });
  await expect(canvas(page)).toHaveAttribute("data-out", "0101");
  await expect(canvas(page)).toHaveAttribute("data-spins", "0,0,0,0");
  await expect(tool(page, "그냥 당기기")).toBeVisible();
  await expect(page.locator(".board-area .pg-tools button", { hasText: "원통 돌리기" })).toBeHidden();
  let pulls = 0;
  while (await myTurn(page)) {
    await tool(page, "그냥 당기기").click();
    pulls++;
    expect(pulls).toBeLessThan(20);
    await expect.poll(() => moves(page), { timeout: 60000 }).toBeGreaterThanOrEqual(pulls);
  }
  await expect(page.locator(".board-finale")).toBeVisible({ timeout: 60000 });
  const out = (await data(page, "out"))!;
  // Me or the one across is out; with no spins at most six pulls were made.
  expect(out === "1101" || out === "0111").toBe(true);
  expect(await moves(page)).toBeLessThanOrEqual(6);
  expect(errors).toEqual([]);
});
