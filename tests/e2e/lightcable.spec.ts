import { test, expect, type Locator, type Page } from "@playwright/test";
import { selectGame } from "./library";
import * as rules from "../../src/games/lightcable/rules";
import { reachFor, toScreen } from "../../src/games/lightcable/layout";

const moves = (page: Page) => page.locator("#move-count");
const kindsOf = (state: rules.State) => state.posts.map((p) => `${p.kind}:${p.colour}:${p.need}`).join(" ");
const wrapsOf = (state: rules.State) => state.wraps.map((w) => `${w.post}:${w.side}`).join(" ");

/** Stubs the random numbers so that the puzzle laid can be laid here too. */
async function seeded(page: Page, start: number) {
  await page.addInitScript((first) => {
    let seed = first;
    crypto.getRandomValues = ((buffer: Uint32Array) => {
      for (let i = 0; i < buffer.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        buffer[i] = seed * 2;
      }
      return buffer;
    }) as typeof crypto.getRandomValues;
  }, start);
  let seed = start;
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed * 2) / 4294967296;
  };
}
/** The posts' kinds as the canvas tells them (its `data-posts` also carries their places on the canvas). */
async function kindsShown(canvas: Locator) {
  return ((await canvas.getAttribute("data-posts")) ?? "")
    .split(" ")
    .map((p) => p.split(":").slice(0, 3).join(":"))
    .join(" ");
}
/** Where the free end lies on the board now. */
async function endOf(canvas: Locator) {
  const [x, z] = ((await canvas.getAttribute("data-end")) ?? "0,0").split(",").map(Number);
  return { x, z };
}
/**
 * Draws the free end with the mouse (the phone's emulation takes mouse gestures too) so that the cable makes `move`:
 * pressed on the end, carried along the places `reachFor` gives, let go at the last.
 */
async function drawFor(page: Page, canvas: Locator, state: rules.State, move: ReturnType<typeof rules.wrapMove>) {
  const box = (await canvas.boundingBox())!,
    at = (p: rules.Pt) => {
      const s = toScreen(box.width, box.height, p);
      return { x: box.x + s.x, y: box.y + s.y };
    },
    end = await endOf(canvas),
    from = at(end);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (const p of reachFor(state, end, move)) {
    const to = at(p);
    await page.mouse.move(to.x, to.y, { steps: 2 });
  }
  await page.mouse.up();
}

test("light cable: entered through its stage window, a seeded board is wired by dragging the cable round the hinted posts, with a refused plug and an undo", async ({ page }) => {
  test.setTimeout(180000);
  const random = await seeded(page, 419),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "빛 케이블");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(rules.STAGES.length);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").nth(1).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  // A board was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  rules.createGame(1, random);
  let state = rules.createGame(2, random);
  await expect.poll(() => kindsShown(canvas)).toBe(kindsOf(state));
  await expect(canvas).toHaveAttribute("data-wraps", "");
  // Plugging in with every post dark is refused with words, and nothing is played.
  await canvas.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#turn")).toContainText("아직 불이 들어오지 않은 기둥이");
  await expect(moves(page)).toHaveText("0수");
  // The hint lights the post to wrap and names the side.
  await page.locator("#pz-hint").click();
  const first = rules.hint(state)!,
    m = rules.decode(first, state.posts.length)!;
  expect(m.kind).toBe("wrap");
  if (m.kind === "wrap") await expect(canvas).toHaveAttribute("data-hint", `${m.post}:${m.side}`);
  await expect(page.locator("#turn")).toContainText("힌트 — 금빛");
  let undone = false;
  for (let k = 0; k < 40 && state.winner === null; k++) {
    const move = rules.hint(state)!;
    await drawFor(page, canvas, state, move);
    state = rules.play(state, move)!;
    await expect(canvas).toHaveAttribute("data-wraps", wrapsOf(state));
    await expect(moves(page)).toHaveText(`${state.ply}수`);
    // Once, after the second wrap: undo frees it again, and the end comes to rest by the post before.
    if (!undone && state.wraps.length === 2) {
      undone = true;
      await page.locator("#pg-undo").click();
      state = rules.undo(state);
      await expect(canvas).toHaveAttribute("data-wraps", wrapsOf(state));
    }
  }
  expect(state.winner).toBe(0);
  await expect(canvas).toHaveAttribute("data-lit", state.posts.map((_, i) => i).join(" "));
  await expect(page.locator("#turn")).toContainText("성공!", { timeout: 20000 });
  await expect(page.locator("#pz-next")).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
});

test("light cable: arrows draw the free end, Backspace with nothing wrapped and Enter with posts dark are refused", async ({ page }) => {
  const random = await seeded(page, 523),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "빛 케이블");
  await page.getByRole("dialog").locator(".stage-card").first().click();
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  rules.createGame(1, random);
  const state = rules.createGame(1, random);
  await expect.poll(() => kindsShown(canvas)).toBe(kindsOf(state));
  await canvas.focus();
  const before = await endOf(canvas);
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await endOf(canvas)).z).toBeLessThan(before.z - 0.2);
  await page.keyboard.press("Backspace");
  await expect(page.locator("#turn")).toContainText("감긴 기둥이 없습니다.");
  await page.keyboard.press("Enter");
  await expect(page.locator("#turn")).toContainText("아직 불이 들어오지 않은 기둥이");
  await expect(moves(page)).toHaveText("0수");
  expect(errors).toEqual([]);
});
