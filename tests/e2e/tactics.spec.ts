import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { tacticsSubject, tilePoint } from "../../src/games/tactics/layout";

const canvas = (page: Page) => page.locator("canvas");
const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 60000 });
const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const data = async (page: Page, name: string) => (await canvas(page).getAttribute(`data-${name}`)) ?? "";

/** Where the top of a tile is on the screen, through the same camera as the view's, the field turned as it is shown. */
async function tileAt(page: Page, cell: number) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    subject = tacticsSubject(aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const p = tilePoint(await data(page, "field"), cell, Number(await data(page, "quarter"))),
    v = new Vector3(p.x, p.y + 0.05, p.z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
async function tap(page: Page, at: { x: number; y: number }, mobile: boolean) {
  if (mobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}

test("tactical battle: my unit walks to a blue tile and waits, the queue moves on and the computer acts", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "전술 대전");
  const dialog = page.locator("dialog.entry");
  await dialog.getByLabel("컴퓨터 대전", { exact: true }).check();
  await dialog.locator(".choice[data-label='숲 속 공터']").click();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  // My assassin is fastest and acts first: it heads the queue, and the ring of commands stands by it.
  await expect(page.locator("#turn")).toContainText("나 (청군) 차례", { timeout: 20000 });
  const active = await data(page, "active"),
    from = Number(await data(page, "cell"));
  expect((await data(page, "queue")).split(",")).toHaveLength(8);
  expect((await data(page, "queue")).split(",")[0]).toBe(active);
  await expect(page.locator(".tx-queue .tx-chip.now")).toBeVisible();
  const ring = page.locator(".tx-ring");
  await expect(ring.locator("[data-cmd=move]")).toBeVisible();
  await expect(ring.locator("[data-cmd=wait]")).toBeEnabled();
  // Nobody is within its reach yet, and there is nothing to take back.
  await expect(ring.locator("[data-cmd=act]")).toBeDisabled();
  await expect(ring.locator("[data-cmd=undo]")).toBeDisabled();
  // Its card stands at the lower right.
  await expect(page.locator(".tx-card.now")).toContainText("그림자 암살자");
  // 이동 shows the blue tiles; a tap on one near the middle of the screen walks there.
  await ring.locator("[data-cmd=move]").click();
  await expect(canvas(page)).toHaveAttribute("data-aim", "move");
  await expect(page.locator("#turn")).toContainText("파란 칸");
  expect(await moves(page)).toBe(0);
  const targets = (await data(page, "targets")).split(",").map(Number),
    box = (await canvas(page).boundingBox())!,
    middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  let to = targets[0],
    best = Infinity;
  for (const cell of targets) {
    const at = await tileAt(page, cell),
      d = Math.hypot(at.x - middle.x, at.y - middle.y);
    if (d < best) {
      best = d;
      to = cell;
    }
  }
  await tap(page, await tileAt(page, to), mobile);
  await expect(canvas(page)).toHaveAttribute("data-cell", String(to), { timeout: 20000 });
  await settled(page);
  expect(to).not.toBe(from);
  expect(await moves(page)).toBe(1);
  await expect(canvas(page)).toHaveAttribute("data-active", active);
  // Having walked, it may take the walk back; 대기 ends its turn instead.
  await expect(ring.locator("[data-cmd=undo]")).toBeEnabled();
  await expect(ring.locator("[data-cmd=move]")).toBeDisabled();
  await ring.locator("[data-cmd=wait]").click();
  // The queue moves on to the computer's units, which act by themselves.
  await expect(canvas(page)).not.toHaveAttribute("data-active", active, { timeout: 20000 });
  await expect.poll(async () => Number(await data(page, "turns")), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
  await expect.poll(() => moves(page), { timeout: 60000 }).toBeGreaterThan(2);
  await expect(page.locator("#turn")).toContainText("나 (청군) 차례", { timeout: 90000 });
  await settled(page);
  // It stands where it went (unless the computer has felled it there).
  expect([`${to}`, "-1"]).toContain((await data(page, "units")).split(",").find((u) => u.startsWith(`${active}:`))!.split(":")[1]);
  // The field turns a quarter at a time, and 시점 전환 brings it back.
  await page.getByRole("button", { name: "시점을 오른쪽으로 돌리기" }).click();
  await expect(canvas(page)).toHaveAttribute("data-quarter", "1");
  await settled(page);
  await page.locator("#camera").click();
  await expect(canvas(page)).toHaveAttribute("data-quarter", "0");
  expect(errors).toEqual([]);
});

test("tactical battle: two at one screen, the keyboard's commands and a choice cancelled by a tap off the tiles", async ({ page }, info) => {
  const mobile = info.project.name === "mobile";
  await page.goto("/");
  await selectGame(page, "전술 대전");
  const dialog = page.locator("dialog.entry");
  await dialog.getByLabel("로컬 2인", { exact: true }).check();
  await dialog.locator(".choice[data-label='강가 다리']").click();
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  await expect(page.locator("#turn")).toContainText("청군 (플레이어 1) 차례");
  // The hidden buttons serve the keyboard and readers (one pixel each, laid on one another): 이동, then 취소.
  await page.getByRole("button", { name: "이동", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(canvas(page)).toHaveAttribute("data-aim", "move");
  await page.getByRole("button", { name: "취소", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(canvas(page)).toHaveAttribute("data-aim", "");
  // A tap on a tile that is not offered (the water of the river) gives the choice up.
  await page.locator(".tx-ring [data-cmd=move]").click();
  await expect(canvas(page)).toHaveAttribute("data-aim", "move");
  const targets = (await data(page, "targets")).split(",").map(Number),
    water = [41, 43, 44, 45, 54, 55, 56, 58].find((c) => !targets.includes(c))!;
  await tap(page, await tileAt(page, water), mobile);
  await expect(canvas(page)).toHaveAttribute("data-aim", "");
  // 대기 by the keyboard's W hands the turn to the other side's fastest.
  await canvas(page).focus();
  await page.keyboard.press("w");
  await expect(page.locator("#turn")).toContainText("홍군 (플레이어 2) 차례", { timeout: 20000 });
  expect(await moves(page)).toBe(1);
});

test("tactical battle: the dungeon is the default, the active unit's card is always shown and a tapped unit's card goes after a moment", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "전술 대전");
  await page.locator("dialog.entry").getByLabel("로컬 2인", { exact: true }).check();
  await page.locator(".game-stage button.primary").click();
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  await expect(canvas(page)).toHaveAttribute("data-field", "dungeon");
  // 현재 차례: the blue assassin, whose turn it is, with its health.
  const now = page.locator(".tx-card.now"),
    picked = page.locator(".tx-card.picked"),
    active = await data(page, "active");
  await expect(now).toBeVisible();
  await expect(now).toHaveAttribute("data-unit", active);
  await expect(now).toContainText("현재 차례");
  await expect(now).toContainText("그림자 암살자");
  await expect(now).toContainText("30/30");
  await expect(picked).toBeHidden();
  // A tap on a unit of the other side (the one nearest the middle of the view) shows its card beside, for a moment.
  const units = (await data(page, "units")).split(",").map((u) => u.split(":").map(Number)),
    box = (await canvas(page).boundingBox())!;
  let chosen = -1,
    at = { x: 0, y: 0 },
    best = Infinity;
  for (const [id, cell] of units) {
    if (String(id) === active || id % 2 === 0 || cell < 0) continue;
    const p = await tileAt(page, cell),
      d = Math.hypot(p.x - box.x - box.width / 2, p.y - box.y - box.height / 2);
    if (d < best) {
      best = d;
      chosen = id;
      at = p;
    }
  }
  await tap(page, at, mobile);
  await expect(picked).toBeVisible();
  await expect(picked).toHaveAttribute("data-unit", String(chosen));
  await expect(picked).toContainText("선택한 유닛");
  await expect(picked).toContainText("홍군");
  await expect(picked).toBeHidden({ timeout: 6000 });
  await expect(now).toBeVisible();
  // 상태 pins it until pressed again.
  await tap(page, at, mobile);
  await expect(picked).toBeVisible();
  await page.locator(".tx-ring [data-cmd=info]").click();
  await page.waitForTimeout(3600);
  await expect(picked).toBeVisible();
  await page.locator(".tx-ring [data-cmd=info]").click();
  await expect(picked).toBeHidden({ timeout: 6000 });
  // When the turn passes, the card names the next to act.
  await canvas(page).focus();
  await page.keyboard.press("w");
  await expect(canvas(page)).not.toHaveAttribute("data-active", active, { timeout: 20000 });
  await settled(page);
  await expect(now).toHaveAttribute("data-unit", await data(page, "active"));
  await expect(now).toContainText("홍군");
  expect(errors).toEqual([]);
});
