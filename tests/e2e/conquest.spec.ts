import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

const board = (page: Page) => page.locator("#board");
const settled = (page: Page) => expect(board(page)).toHaveAttribute("data-animating", "false", { timeout: 60000 });
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
/** Waits until it is my turn to claim, at rest. */
async function myClaim(page: Page) {
  await expect(board(page)).toHaveAttribute("data-phase", "claim", { timeout: 60000 });
  await expect(board(page)).toHaveAttribute("data-turn", "0", { timeout: 60000 });
  await settled(page);
}
/** Starts the game the entry window shows, once it has drawn its table. */
async function begin(page: Page) {
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await settled(page);
}
/** Reinforces the front of mine that faces an enemy, attacks a neighbour once by a tap, and ends the turn. */
async function oneTurn(page: Page, mobile: boolean) {
  await expect(board(page)).toHaveAttribute("data-phase", "reinforce");
  let t = await table(page);
  const front = t.owners.findIndex((o, i) => o === 0 && t.armies[i] >= 1 && t.neighbours[i].some((n) => t.owners[n] !== 0)),
    before = t.armies[front];
  await tap(page, t.places[front], mobile);
  await expect(board(page)).toHaveAttribute("data-selected", String(front));
  const reserve = Number(await page.locator("#cq-count").textContent());
  expect(reserve).toBeGreaterThanOrEqual(3);
  await page.locator("#cq-place").click();
  await settled(page);
  await expect(board(page)).toHaveAttribute("data-phase", "attack");
  t = await table(page);
  expect(t.armies[front]).toBe(before + reserve);
  // The reinforced territory is still picked: a tap on an enemy neighbour rolls the dice once.
  await expect(board(page)).toHaveAttribute("data-selected", String(front));
  const enemy = t.neighbours[front].find((n) => t.owners[n] !== 0)!,
    total = t.armies[front] + t.armies[enemy];
  await tap(page, t.places[enemy], mobile);
  await settled(page);
  t = await table(page);
  expect(total - t.armies[front] - t.armies[enemy]).toBeGreaterThanOrEqual(1);
  expect(total - t.armies[front] - t.armies[enemy]).toBeLessThanOrEqual(2);
  await expect(page.locator("#turn")).toContainText(" 대 ");
  if ((await board(page).getAttribute("data-phase")) === "occupy") {
    await page.locator("#cq-move").click();
    await settled(page);
  }
  await page.locator("#cq-next").click();
  await expect(board(page)).toHaveAttribute("data-phase", "fortify");
  await expect(page.locator("#cq-next")).toHaveText("턴 종료");
  await page.locator("#cq-next").click();
}

test("continent conquest: on the world map against two computers, claim by taps, reinforce, attack, end the turn and watch the computers play", async ({ page }, info) => {
  test.setTimeout(300000);
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "주사위 대륙 쟁탈전");
  const dialog = page.locator("dialog.entry");
  // One person against two computers on the world map, claiming by turns, is what the window opens on.
  await expect(dialog.locator("#cq-humans")).toHaveValue("1");
  await expect(dialog.locator("#cq-opponents")).toHaveValue("2");
  await expect(dialog.locator("#cq-map")).toHaveValue("world");
  await expect(dialog.locator("#cq-size")).toHaveCount(0);
  await expect(dialog.locator("#cq-setup")).toHaveValue("claim");
  await expect(dialog.locator("#cq-move")).toHaveValue("adjacent");
  await expect(dialog.locator("#cq-mode")).toHaveValue("conquest");
  await dialog.locator(".cq-name").fill("<장군>");
  await begin(page);
  await expect(page.locator("#cq-players li")).toHaveCount(3);
  // A name is text, never markup.
  await expect(page.locator("#cq-players")).toContainText("<장군>");

  // Claiming: a tap on an empty territory takes it with one army; the computers claim theirs in between.
  for (let k = 0; k < 2; k++) {
    await myClaim(page);
    const t = await table(page),
      free = t.owners.flatMap((o, i) => (o < 0 ? [i] : []));
    await tap(page, t.places[free[Math.floor(free.length / 2)]], mobile);
    await expect.poll(async () => (await table(page)).owners.filter((o) => o === 0).length, { timeout: 20000 }).toBe(k + 1);
  }
  // The rest of the setting up is left to the computer.
  await myClaim(page);
  await page.locator("#cq-auto").click();
  await expect(board(page)).toHaveAttribute("data-phase", "reinforce", { timeout: 180000 });
  await expect(board(page)).toHaveAttribute("data-turn", "0");
  await settled(page);
  const ready = await table(page);
  for (const p of [0, 1, 2]) expect(ready.owners.reduce((n, o, i) => n + (o === p ? ready.armies[i] : 0), 0)).toBe(35);
  expect(ready.owners.every((o) => o >= 0 && o <= 2)).toBe(true);

  await oneTurn(page, mobile);
  // The computers play their turns, and the turn comes back to me in the second round.
  await expect(board(page)).toHaveAttribute("data-turn", "1", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("컴퓨터 1");
  await expect(board(page)).toHaveAttribute("data-turn", "2", { timeout: 120000 });
  await expect(board(page)).toHaveAttribute("data-turn", "0", { timeout: 120000 });
  await settled(page);
  await expect(board(page)).toHaveAttribute("data-phase", "reinforce");
  await expect(page.locator("#move-count")).toContainText("2라운드");
  // The cards open from the corner; each names its territory.
  await page.locator("#cq-hand").click();
  await expect(page.locator("dialog[open]")).toContainText("내 카드");
  await page.locator("dialog[open] .dialog-actions button").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
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

test("continent conquest: a small random map dealt at random, with a secret mission shown only to me", async ({ page }, info) => {
  test.setTimeout(240000);
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "주사위 대륙 쟁탈전");
  const dialog = page.locator("dialog.entry");
  await dialog.locator("#cq-map").selectOption("random", { force: true });
  await expect(dialog.locator("#cq-size")).toHaveCount(1);
  await dialog.locator("#cq-size").selectOption("small", { force: true });
  await dialog.locator("#cq-setup").selectOption("random", { force: true });
  await dialog.locator("#cq-mode").selectOption("missions", { force: true });
  await begin(page);
  await expect(board(page)).toHaveAttribute("data-phase", "reinforce");
  // My mission, behind its own button; the others' never reach the page.
  await expect(page.locator("#cq-mission")).toBeVisible();
  await expect(page.locator("main")).not.toContainText("탈락시키세요");
  await page.locator("#cq-mission").click();
  await expect(page.locator("dialog[open]")).toContainText("내 비밀 임무");
  await expect(page.locator("dialog[open] .cq-mission-text")).toContainText(/세요\./);
  await page.locator("dialog[open] .dialog-actions button").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await oneTurn(page, mobile);
  await expect(board(page)).toHaveAttribute("data-turn", "1", { timeout: 20000 });
  expect(errors).toEqual([]);
});
