import { expect, test, type Page } from "@playwright/test";
import { selectGame } from "./library";
import { loadShuffles } from "./betting-helpers";
import * as K from "../../src/games/klondike/rules";
import * as F from "../../src/games/freecell/rules";
import { klondikeLayout, stockSpot } from "../../src/games/klondike/layout";
import { freecellLayout } from "../../src/games/freecell/layout";
import { screenOf, type PatienceLayout } from "../../src/games/patience/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 20000 });
const moves = (page: Page) => page.locator("#move-count");
const turn = (page: Page) => page.locator("#turn");
/** The page's `crypto.getRandomValues` answers its highest value every time (see `loadShuffles`), so a shuffle leaves the pack in order. */
const highest = () => 4294967295 / 4294967296;
/** Where a point of the table shows on the page. */
async function point<S>(page: Page, layout: PatienceLayout<S>, x: number, z: number, y = 0.05) {
  return screenOf(layout.subject, (await page.locator("#board canvas").boundingBox())!, x, z, y);
}
/** The last card of a pile, or its empty place. */
function placeOf<S>(layout: PatienceLayout<S>, state: S, pile: number) {
  const spots = layout.spots(state)[pile],
    slot = layout.slots.find((s) => s.pile === pile)!;
  return spots[spots.length - 1] ?? { x: slot.x, y: 0, z: slot.z };
}
/**
 * Drags the run of `from` starting at `index` onto `to`: picked up by the band of the card that shows in a column,
 * let go so that the card lands below the last card of a column, or on a squared pile.
 */
async function drag<S>(page: Page, layout: PatienceLayout<S>, state: S, m: { from: number; index: number; to: number }) {
  const spot = layout.spots(state)[m.from][m.index],
    target = placeOf(layout, state, m.to),
    below = layout.fanned(m.to) && layout.piles(state)[m.to].length ? 0.5 : 0,
    a = await point(page, layout, spot.x, spot.z - 0.55, spot.y),
    b = await point(page, layout, target.x, target.z + below - 0.55);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  await settled(page);
}
async function sit(page: Page, name: string) {
  await page.goto("/");
  await selectGame(page, name);
}
async function start(page: Page) {
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("#board canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  await page.locator("#board canvas").scrollIntoViewIfNeeded();
}

test("klondike: the stock turns at a tap, a card the hint names is dragged, a double tap sends one home, undo", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const mobile = info.project.name === "mobile";
  await loadShuffles(page, []);
  await sit(page, "클론다이크");
  await expect(page.locator("#kl-draw")).toHaveValue("1");
  await start(page);
  // The same deal as the page's: the pack in order.
  let state = K.createGame("1", highest);
  await expect(moves(page)).toHaveText("0수");
  await expect(page.locator("#pc-stat-1")).toHaveText("24장");
  await expect(page.locator("#pc-undo")).toBeDisabled();
  // A tap on the stock turns a card onto the waste.
  const stock = await point(page, klondikeLayout, stockSpot.x, stockSpot.z, 0.12);
  if (mobile) await page.touchscreen.tap(stock.x, stock.y);
  else await page.mouse.click(stock.x, stock.y);
  await settled(page);
  state = K.turn(state)!;
  await expect(moves(page)).toHaveText("1수");
  await expect(page.locator("#pc-stat-1")).toHaveText("23장");
  // The hint names a card and where it goes: drag it there.
  await page.locator("#pc-hint").click();
  const advice = K.hint(state)!;
  expect(advice).not.toBeNull();
  await expect(turn(page)).toHaveText(K.hintText(state, advice));
  expect("turn" in advice).toBe(false);
  if ("turn" in advice) return;
  await drag(page, klondikeLayout, state, advice);
  state = K.play(state, advice)!;
  await expect(moves(page)).toHaveText(`${state.moves}수`);
  // A click without a drag moves nothing.
  const still = placeOf(klondikeLayout, state, K.TABLEAU + 1),
    lone = await point(page, klondikeLayout, still.x, still.z, still.y);
  await page.mouse.click(lone.x, lone.y);
  await page.waitForTimeout(600);
  await expect(moves(page)).toHaveText(`${state.moves}수`);
  // A double tap on a card that may go home sends it there.
  const pile = [K.WASTE, ...[0, 1, 2, 3, 4, 5, 6].map((c) => K.TABLEAU + c)].find((p) => state.piles[p].length && K.autoTarget(state, p, state.piles[p].length - 1) !== null)!;
  expect(pile).toBeDefined();
  const index = state.piles[pile].length - 1,
    spot = klondikeLayout.spots(state)[pile][index],
    card = await point(page, klondikeLayout, spot.x, spot.z, spot.y);
  await page.mouse.dblclick(card.x, card.y);
  await settled(page);
  state = K.move(state, pile, index, K.autoTarget(state, pile, index)!)!;
  await expect(moves(page)).toHaveText(`${state.moves}수`);
  await expect(page.locator("#pc-stat-0")).toHaveText(`${state.piles.slice(K.FOUNDATION, K.TABLEAU).flat().length} / 52`);
  // Undo takes it back.
  await page.locator("#pc-undo").click();
  await expect(moves(page)).toHaveText(`${state.moves - 1}수`);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-klondike.png`, fullPage: true });
  expect(errors).toEqual([]);
});

test("freecell: a numbered deal, a card the hint names is dragged, a double tap fills a free cell, undo", async ({ page }, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sit(page, "프리셀");
  await page.locator("#fc-deal").selectOption("number");
  await expect(page.locator("#fc-number")).toBeVisible();
  await page.locator("#fc-number").fill("1");
  await start(page);
  let state = F.createGame(1);
  await expect(page.locator("#pc-stat-0")).toHaveText("#1");
  await expect(moves(page)).toHaveText("0수");
  // The hint names a card on the way to a win: drag it there.
  await page.locator("#pc-hint").click();
  const advice = F.hint(state)!;
  await expect(turn(page)).toHaveText(F.hintText(state, advice));
  await drag(page, freecellLayout, state, advice);
  state = F.play(state, advice)!;
  await expect(moves(page)).toHaveText("1수");
  // A double tap on a card that cannot go home puts it in a free cell.
  const pile = [0, 1, 2, 3, 4, 5, 6, 7].map((c) => F.COLUMN + c).find((p) => state.piles[p].length && F.autoTarget(state, p, state.piles[p].length - 1) !== null)!;
  const index = state.piles[pile].length - 1,
    to = F.autoTarget(state, pile, index)!,
    spot = freecellLayout.spots(state)[pile][index],
    card = await point(page, freecellLayout, spot.x, spot.z, spot.y);
  await page.mouse.dblclick(card.x, card.y);
  await settled(page);
  state = F.move(state, pile, index, to)!;
  await expect(moves(page)).toHaveText("2수");
  await expect(page.locator("#pc-stat-1")).toHaveText(`${state.piles.slice(F.FOUNDATION, F.COLUMN).flat().length} / 52`);
  // Undo takes it back.
  await page.locator("#pc-undo").click();
  await expect(moves(page)).toHaveText("1수");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-freecell.png`, fullPage: true });
  expect(errors).toEqual([]);
});
