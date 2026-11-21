import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

/** What the canvas tells of the table: every hex's place on the screen, the armies (with where each stands), whose turn. */
interface Table {
  places: [number, number][];
  armies: { h: number; n: number; c: number; m: number; moved: boolean; at: [number, number] }[];
  seat: number;
  left: number;
  ply: number;
  targets: number[];
}
const canvas = (page: Page) => page.locator("#board canvas");
const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 60000 });
async function table(page: Page): Promise<Table> {
  return canvas(page).evaluate((c: HTMLCanvasElement) => ({
    places: JSON.parse(c.dataset.places!),
    armies: JSON.parse(c.dataset.armies!),
    seat: Number(c.dataset.seat),
    left: Number(c.dataset.left),
    ply: Number(c.dataset.ply),
    targets: c.dataset.targets ? c.dataset.targets.split(",").map(Number) : [],
  }));
}
async function tap(page: Page, [x, y]: [number, number], mobile: boolean) {
  const box = (await canvas(page).boundingBox())!;
  if (mobile) await page.touchscreen.tap(box.x + x, box.y + y);
  else await page.mouse.click(box.x + x, box.y + y);
}
/** Waits until it is my turn again and the table rests. */
async function myTurn(page: Page) {
  await expect(canvas(page)).toHaveAttribute("data-seat", "0", { timeout: 90000 });
  await settled(page);
  await expect(page.locator("#turn")).toContainText("나 (홍국) 차례");
}
/** Picks up an army of mine that may move and sends it to a hex it may go to that holds no army. */
async function moveOne(page: Page, mobile: boolean) {
  const before = await table(page),
    army = before.armies.find((a) => a.n === 0 && !a.moved)!;
  await tap(page, army.at, mobile);
  await expect(page.locator("#turn")).toContainText("갈 곳을 고르세요");
  const picked = await table(page);
  expect(picked.targets.length).toBeGreaterThan(0);
  const to = picked.targets.find((h) => !picked.armies.some((a) => a.h === h)) ?? picked.targets[0];
  await tap(page, picked.places[to], mobile);
  await expect(canvas(page)).toHaveAttribute("data-ply", String(before.ply + 1), { timeout: 20000 });
  return { from: army.h, to };
}

test("hex conquest: an army moved by taps, the moves left counted down, the turn ended and the computers moving", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "헥스 정복전");
  // One computer: two nations on the map.
  await page.locator("dialog.entry .choice[data-value='1']").click();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  const start = await table(page);
  expect(start.places).toHaveLength(220);
  expect(start.armies.map((a) => [a.n, a.c, a.m])).toEqual(expect.arrayContaining([[0, 10, 10], [2, 10, 10]]));
  expect(start.armies).toHaveLength(2);
  await expect(page.locator("#turn")).toContainText("남은 이동 1/1");
  // My only army moves; with that the turn passes to the computer, which moves, and it comes back to me.
  const first = await moveOne(page, mobile);
  await myTurn(page);
  const second = await table(page);
  expect(second.armies.some((a) => a.n === 0 && a.h === first.to)).toBe(true);
  expect(second.ply).toBeGreaterThanOrEqual(2);
  // The capital raised a new army: two armies, two moves.
  await expect(page.locator("#turn")).toContainText("남은 이동 2/2");
  await moveOne(page, mobile);
  await settled(page);
  await expect(page.locator("#turn")).toContainText("남은 이동 1/2");
  expect((await table(page)).left).toBe(1);
  // 턴 종료 in the table's corner hands the turn over; the computer moves and the turn comes back.
  const ply = (await table(page)).ply;
  await page.getByRole("button", { name: "턴 종료" }).click();
  await expect.poll(async () => (await table(page)).ply, { timeout: 60000 }).toBeGreaterThan(ply + 1);
  await myTurn(page);
  await expect(page.locator(".game-layout.hud aside.game-sidebar")).toContainText("황국");
  expect(errors).toEqual([]);
});
