import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

const board = (page: Page) => page.locator("#board");
const settled = (page: Page) => expect(board(page)).toHaveAttribute("data-animating", "false", { timeout: 30000 });
/** What everyone at the table can see, as the canvas tells it: who holds what, how many, where on the screen, and the neighbours. */
async function table(page: Page) {
  return page.evaluate(() => {
    const canvas = document.querySelector("canvas")!;
    return {
      owners: canvas.dataset.owners!.split(",").map(Number),
      armies: canvas.dataset.armies!.split(",").map(Number),
      places: JSON.parse(canvas.dataset.places!) as [number, number][],
      neighbours: JSON.parse(canvas.dataset.neighbours!) as number[][],
    };
  });
}
/** A tap where a territory's armies stand. */
async function tap(page: Page, at: [number, number], mobile: boolean) {
  const box = (await page.locator("canvas").boundingBox())!;
  if (mobile) await page.touchscreen.tap(box.x + at[0], box.y + at[1]);
  else await page.mouse.click(box.x + at[0], box.y + at[1]);
}

test("continent conquest: against two computers on a small map, reinforce, attack by taps, end the turn and watch the computers play", async ({ page }, info) => {
  test.setTimeout(240000);
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "대륙 쟁탈전");
  const dialog = page.locator("dialog.entry");
  // One person against two computers on a small map is what the window opens on.
  await expect(dialog.locator("#cq-humans")).toHaveValue("1");
  await expect(dialog.locator("#cq-opponents")).toHaveValue("2");
  await expect(dialog.locator("#cq-size")).toHaveValue("small");
  await expect(dialog.locator("#cq-mode")).toHaveValue("conquest");
  await dialog.locator(".cq-name").fill("<장군>");
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await settled(page);
  await expect(page.locator("#cq-players li")).toHaveCount(3);
  // A name is text, never markup.
  await expect(page.locator("#cq-players")).toContainText("<장군>");
  await expect(board(page)).toHaveAttribute("data-phase", "reinforce");
  await expect(board(page)).toHaveAttribute("data-turn", "0");

  // Reinforce a territory of mine that faces an enemy: one fewer than all by the stepper, then the last by a second tap.
  let t = await table(page);
  const front = t.owners.findIndex((o, i) => o === 0 && t.neighbours[i].some((n) => t.owners[n] !== 0)),
    before = t.armies[front];
  await tap(page, t.places[front], mobile);
  await expect(board(page)).toHaveAttribute("data-selected", String(front));
  const reserve = Number(await page.locator("#cq-count").textContent());
  expect(reserve).toBeGreaterThanOrEqual(3);
  await page.locator("#cq-less").click();
  await expect(page.locator("#cq-place")).toHaveText(`배치 ${reserve - 1}`);
  await page.locator("#cq-place").click();
  await settled(page);
  t = await table(page);
  expect(t.armies[front]).toBe(before + reserve - 1);
  await expect(board(page)).toHaveAttribute("data-phase", "reinforce");
  await tap(page, t.places[front], mobile);
  await settled(page);
  await expect(board(page)).toHaveAttribute("data-phase", "attack");
  t = await table(page);
  expect(t.armies[front]).toBe(before + reserve);

  // Attack once by taps: the reinforced territory is still picked, and a tap on an enemy neighbour rolls the dice once.
  await expect(board(page)).toHaveAttribute("data-selected", String(front));
  const enemy = t.neighbours[front].find((n) => t.owners[n] !== 0)!,
    total = t.armies[front] + t.armies[enemy];
  await tap(page, t.places[enemy], mobile);
  await settled(page);
  t = await table(page);
  // One roll compares one or two pairs of dice: that many armies are lost between the two, whoever won.
  expect(total - t.armies[front] - t.armies[enemy]).toBeGreaterThanOrEqual(1);
  expect(total - t.armies[front] - t.armies[enemy]).toBeLessThanOrEqual(2);
  await expect(page.locator("#turn")).toContainText(" 대 ");
  if ((await board(page).getAttribute("data-phase")) === "occupy") {
    await page.locator("#cq-move").click();
    await settled(page);
  }

  // The cards open from the corner.
  await page.locator("#cq-hand").click();
  await expect(page.locator("dialog[open]")).toContainText("내 카드");
  await page.locator("dialog[open] .dialog-actions button").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);

  // End the turn: no more attacks, no move.
  await page.locator("#cq-next").click();
  await expect(board(page)).toHaveAttribute("data-phase", "fortify");
  await expect(page.locator("#cq-next")).toHaveText("턴 종료");
  await page.locator("#cq-next").click();

  // The computers play their turns, and the turn comes back to me in the second round.
  await expect(board(page)).toHaveAttribute("data-turn", "1", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("컴퓨터 1");
  await expect(board(page)).toHaveAttribute("data-turn", "2", { timeout: 120000 });
  await expect(board(page)).toHaveAttribute("data-turn", "0", { timeout: 120000 });
  await settled(page);
  await expect(board(page)).toHaveAttribute("data-phase", "reinforce");
  await expect(page.locator("#move-count")).toContainText("2라운드");
  // The map can be looked at closer and shown whole again.
  if (!mobile) {
    await page.locator("canvas").hover();
    await page.mouse.wheel(0, -360);
    await expect.poll(async () => Number(await page.locator("canvas").getAttribute("data-zoom"))).toBeGreaterThan(1.2);
    await page.locator("#cq-fit").click();
    await expect(page.locator("canvas")).toHaveAttribute("data-zoom", "1.00");
  }
  expect(errors).toEqual([]);
});
