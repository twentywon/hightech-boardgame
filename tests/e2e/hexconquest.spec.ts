import { test, expect, type Page } from "@playwright/test";
import { selectGame } from "./library";

/** What the canvas tells of the table: every hex's place on the screen, the armies (with where each stands), whose turn. */
interface Table {
  places: [number, number][];
  armies: { h: number; n: number; c: number; m: number; moved: boolean; at: [number, number] }[];
  seat: number;
  me: number;
  phase: string;
  land: string;
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
    me: Number(c.dataset.me),
    phase: c.dataset.phase!,
    land: c.dataset.land!,
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
/** Waits until it is my turn again (I play 청국, nation 1) and the table rests. */
async function myTurn(page: Page) {
  await expect(canvas(page)).toHaveAttribute("data-seat", "1", { timeout: 90000 });
  await settled(page);
  await expect(page.locator("#turn")).toContainText("나 (청국) 차례");
}
/** Picks up an army of mine that may move and sends it to a hex it may go to that holds no army. */
async function moveOne(page: Page, mobile: boolean) {
  const before = await table(page),
    army = before.armies.find((a) => a.n === before.me && !a.moved)!;
  await tap(page, army.at, mobile);
  await expect(page.locator("#turn")).toContainText("갈 곳을 고르세요");
  const picked = await table(page);
  expect(picked.targets.length).toBeGreaterThan(0);
  const to = picked.targets.find((h) => !picked.armies.some((a) => a.h === h)) ?? picked.targets[0];
  await tap(page, picked.places[to], mobile);
  await expect(canvas(page)).toHaveAttribute("data-ply", String(before.ply + 1), { timeout: 20000 });
  return { from: army.h, to };
}

test("hex conquest: another map and an empire chosen before the start, an army moved by taps, the turn ended and the computer moving", async ({ page }, info) => {
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
  // Setup: the map shown with its capitals; nothing moves before 시작.
  const setup = await table(page);
  expect(setup.phase).toBe("setup");
  await expect(page.locator("#turn")).toContainText("맵을 고르고, 수도를 눌러 제국을 고른 뒤 시작을 누르세요");
  await page.getByRole("button", { name: "다른 맵" }).click();
  await expect(canvas(page)).toHaveAttribute("data-ply", String(setup.ply + 1), { timeout: 20000 });
  await settled(page);
  expect((await table(page)).land).not.toBe(setup.land);
  // 청국 (upper left) is mine, chosen by a tap on its capital (no buttons are shown for the empires); with one
  // computer it takes the diagonal corner, 흑국.
  await expect(page.locator(".pg-tool:not(.sr-only):not([hidden])", { hasText: "청국" })).toHaveCount(0);
  const corners = (await canvas(page).getAttribute("data-corners"))!.split(",").map(Number);
  // (The screen pauses input for a moment after a move: 다른 맵 was one.)
  await page.waitForTimeout(500);
  await tap(page, (await table(page)).places[corners[1]], mobile);
  await expect(canvas(page)).toHaveAttribute("data-me", "1", { timeout: 20000 });
  await settled(page);
  await expect(page.locator("#turn")).toContainText("나 (청국) 차례");
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(canvas(page)).toHaveAttribute("data-phase", "play", { timeout: 20000 });
  await settled(page);
  // (Input waits a moment after a move: 시작 was one.)
  await page.waitForTimeout(500);
  const start = await table(page);
  expect(start.places).toHaveLength(220);
  expect(start.armies.map((a) => [a.n, a.c, a.m])).toEqual(expect.arrayContaining([[1, 10, 10], [3, 10, 10]]));
  expect(start.armies).toHaveLength(2);
  expect(start.seat).toBe(1);
  await expect(page.locator("#turn")).toContainText("남은 이동 1/1");
  // My only army moves; with that the turn passes to the computer, which moves, and it comes back to me.
  const first = await moveOne(page, mobile);
  await myTurn(page);
  const second = await table(page);
  expect(second.armies.some((a) => a.n === 1 && a.h === first.to)).toBe(true);
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
  await expect(page.locator(".game-layout.hud aside.game-sidebar")).toContainText("흑국");
  await expect(page.locator(".game-layout.hud aside.game-sidebar")).toContainText("청국 (나)");
  expect(errors).toEqual([]);
});

test("hex conquest at one screen: two people take capitals in turn, then each moves once", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "헥스 정복전");
  await page.locator("dialog.entry").getByLabel("로컬 2–4인", { exact: true }).check({ force: true });
  await page.locator("dialog.entry .choice[data-value='2']:visible").click();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(canvas(page)).toHaveAttribute("data-people", "2");
  await settled(page);
  await expect(page.locator("#turn")).toContainText("1번 플레이어: 수도를 눌러 제국을 고르세요");
  const corners = (await canvas(page).getAttribute("data-corners"))!.split(",").map(Number);
  // Player 1 takes 흑국 (lower right), player 2 청국 (upper left).
  await tap(page, (await table(page)).places[corners[3]], mobile);
  await expect(canvas(page)).toHaveAttribute("data-picked", "1", { timeout: 20000 });
  await settled(page);
  await expect(page.locator("#turn")).toContainText("2번 플레이어: 수도를 눌러 제국을 고르세요");
  await page.waitForTimeout(500);
  await tap(page, (await table(page)).places[corners[1]], mobile);
  await expect(canvas(page)).toHaveAttribute("data-picked", "2", { timeout: 20000 });
  await expect(canvas(page)).toHaveAttribute("data-humans", "3,1");
  await settled(page);
  await expect(page.locator("#turn")).toContainText("모두 골랐습니다");
  await page.getByRole("button", { name: "시작", exact: true }).click();
  await expect(canvas(page)).toHaveAttribute("data-phase", "play", { timeout: 20000 });
  await settled(page);
  await page.waitForTimeout(500);
  // 청국 moves first, whoever chose it; its one army moves and the turn passes to 흑국, a person too.
  expect((await table(page)).seat).toBe(1);
  await expect(page.locator("#turn")).toContainText("청국 차례");
  await expect(page.locator("#turn")).not.toContainText("(나)");
  const moveOf = async (nation: number) => {
    const before = await table(page),
      army = before.armies.find((a) => a.n === nation && !a.moved)!;
    await tap(page, army.at, mobile);
    await expect(page.locator("#turn")).toContainText("갈 곳을 고르세요");
    const picked = await table(page),
      to = picked.targets.find((h) => !picked.armies.some((a) => a.h === h)) ?? picked.targets[0];
    await tap(page, picked.places[to], mobile);
    await expect(canvas(page)).toHaveAttribute("data-ply", String(before.ply + 1), { timeout: 20000 });
    await settled(page);
    await page.waitForTimeout(500);
  };
  await moveOf(1);
  await expect(canvas(page)).toHaveAttribute("data-seat", "3");
  await expect(page.locator("#turn")).toContainText("흑국 차례");
  await moveOf(3);
  await expect(canvas(page)).toHaveAttribute("data-seat", "1");
  await expect(page.locator("#turn")).toContainText("청국 차례");
  await expect(page.locator(".game-layout.hud aside.game-sidebar")).toContainText("흑국 (1번)");
  await expect(page.locator(".game-layout.hud aside.game-sidebar")).toContainText("청국 (2번)");
  expect(errors).toEqual([]);
});
