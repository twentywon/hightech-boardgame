import { test, expect, type Page, type Locator } from "@playwright/test";
import { selectGame } from "./library";
import { STAGES } from "../../src/games/mahjong/rules";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
/** The screen pauses input for a moment after each move: wait it out before the next tap. */
const rest = async (page: Page) => {
  await settled(page);
  await page.waitForTimeout(260);
};
const list = async (canvas: Locator, name: string) =>
  ((await canvas.getAttribute(`data-${name}`)) ?? "")
    .split(" ")
    .filter(Boolean)
    .map(Number);
/** Where each tile that can be seen may be tapped, from the view's `data-places` ("slot:x,y" in CSS pixels). */
async function places(canvas: Locator) {
  const out = new Map<number, [number, number]>();
  for (const entry of ((await canvas.getAttribute("data-places")) ?? "").split(" ").filter(Boolean)) {
    const [slot, at] = entry.split(":"),
      [x, y] = at.split(",").map(Number);
    out.set(Number(slot), [x, y]);
  }
  return out;
}
/** A tap (a touch on the phone) on a tile where the view says it can be struck. */
async function tapTile(page: Page, canvas: Locator, tile: number, mobile: boolean) {
  // The view writes the places as it draws; right after a pair has flown (or under a slow software frame) a tile's
  // place may come a frame later, so it is waited for rather than read once.
  await expect.poll(async () => (await places(canvas)).has(tile), { message: `a place for tile ${tile}`, timeout: 8000 }).toBe(true);
  const box = (await canvas.boundingBox())!,
    at = (await places(canvas)).get(tile);
  const x = box.x + at![0],
    y = box.y + at![1];
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test("mahjong solitaire: entered through its stage window, a small layout is cleared by following hints, with a refusal and an undo", async ({ page }, info) => {
  test.setTimeout(180000);
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "마작 솔리테어");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, a card for each layout, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(STAGES.length);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await rest(page);
  expect((await list(canvas, "present")).length).toBe(STAGES[0].slots.length);
  // A tap on a tile that cannot be chosen (blocked, or with no free partner) is refused with words; nothing is played.
  const pickable = await list(canvas, "pickable"),
    seen = await places(canvas),
    blocked = (await list(canvas, "present")).find((tile) => !pickable.includes(tile) && seen.has(tile))!;
  expect(blocked).toBeDefined();
  await tapTile(page, canvas, blocked, mobile);
  await expect(page.locator("#turn")).toContainText(/집을 수 없습니다|짝이 되는 패가 아직/);
  await expect(page.locator("#move-count")).toHaveText("0수");
  await expect(canvas).toHaveAttribute("data-selected", "-1");
  // The hints, each pair tapped where the view shows it, clear the layout; one pair is taken back on the way.
  let undone = false;
  for (let k = 0; k < 40 && (await page.locator("#pz-next").isHidden()); k++) {
    await page.locator("#pz-hint").click();
    await expect(canvas).toHaveAttribute("data-hint", /^\d+ \d+$/);
    const [a, b] = await list(canvas, "hint"),
      left = (await list(canvas, "present")).length;
    await tapTile(page, canvas, a, mobile);
    await expect(canvas).toHaveAttribute("data-selected", String(a));
    await tapTile(page, canvas, b, mobile);
    await rest(page);
    expect((await list(canvas, "present")).length).toBe(left - 2);
    if (!undone && left - 2 === STAGES[0].slots.length - 4) {
      undone = true;
      await page.locator("#pg-undo").click();
      await rest(page);
      expect((await list(canvas, "present")).length).toBe(left);
      await expect(page.locator("#move-count")).toHaveText("1수");
    }
  }
  expect(undone).toBe(true);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-present", "");
  expect(errors).toEqual([]);
});

test("mahjong solitaire: the keyboard walks the free tiles and Enter picks one", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "마작 솔리테어");
  await page.getByRole("dialog").locator(".stage-card").nth(1).click();
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 30000 });
  await rest(page);
  await canvas.focus();
  const free = await list(canvas, "free");
  for (const key of ["ArrowRight", "ArrowRight", "ArrowDown", "ArrowLeft"]) {
    await page.keyboard.press(key);
    expect(free).toContain(Number(await canvas.getAttribute("data-cursor")));
  }
  // Walk until the cursor stands on a tile that can be picked, then Enter picks it.
  const pickable = await list(canvas, "pickable");
  for (let k = 0; k < 30 && !pickable.includes(Number(await canvas.getAttribute("data-cursor"))); k++) await page.keyboard.press(k % 8 < 4 ? "ArrowRight" : "ArrowDown");
  const cursor = Number(await canvas.getAttribute("data-cursor"));
  if (pickable.includes(cursor)) {
    await page.keyboard.press("Enter");
    await expect(canvas).toHaveAttribute("data-selected", String(cursor));
  }
  expect(errors).toEqual([]);
});
