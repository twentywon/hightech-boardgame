import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as rules from "../../src/games/lightcable/rules";
import { BOARD_TOP, cableSubject, cellAt } from "../../src/games/lightcable/layout";

const moves = (page: Page) => page.locator("#move-count");
const postsOf = (state: rules.State) => state.posts.map((p) => `${p.cell}:${p.colour}:${p.need}`).join(" ");

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
/** Where the middle of a cell is on the page, as the table's camera shows it. */
async function cellPoint(page: Page, state: rules.State, cell: number) {
  const box = (await page.locator("#board canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = cableSubject(state.size, aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const at = cellAt(state.size, cell),
    v = new Vector3(at.x, BOARD_TOP, at.z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
/** A tap (a touch on the phone) on a cell. */
async function tapCell(page: Page, state: rules.State, cell: number, mobile: boolean) {
  const { x, y } = await cellPoint(page, state, cell);
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test("light cable: entered through its stage window, a seeded board is lit by following hints, by a drag and by taps, with a refusal and an undo", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 419),
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
  const start = rules.createGame(2, random);
  await expect(canvas).toHaveAttribute("data-posts", postsOf(start));
  await expect(canvas).toHaveAttribute("data-path", String(start.start.cell));
  await expect(canvas).toHaveAttribute("data-exit", String(start.exit!.cell));
  // A tap on a post is refused with words, and nothing is played.
  await tapCell(page, start, start.posts[0].cell, mobile);
  await expect(page.locator("#turn")).toContainText("기둥이 선 칸입니다.");
  await expect(moves(page)).toHaveText("0수");
  let state = start;
  // The first four cells of the hint's way, drawn in one drag from the cable's end (a mouse; the phone taps them).
  const first: number[] = [];
  for (let k = 0; k < 4; k++) {
    const m = rules.hint(state)!;
    first.push(m.to);
    state = rules.play(state, m)!;
  }
  if (mobile) for (const cell of first) await tapCell(page, start, cell, true);
  else {
    const from = await cellPoint(page, start, start.start.cell);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (const cell of first) {
      const to = await cellPoint(page, start, cell);
      await page.mouse.move(to.x, to.y, { steps: 8 });
    }
    await page.mouse.up();
  }
  await expect(moves(page)).toHaveText("4수");
  await expect(canvas).toHaveAttribute("data-path", state.path.join(" "));
  // Undo winds the last step back; the hint then points at it again.
  await page.locator("#pg-undo").click();
  await expect(moves(page)).toHaveText("3수");
  await expect(canvas).toHaveAttribute("data-path", state.path.slice(0, -1).join(" "));
  state = rules.undo(state);
  // The rest by the hints, each tapped where its gold glow stands.
  for (let k = 0; k < 80 && state.winner === null; k++) {
    await page.locator("#pz-hint").click();
    const m = rules.hint(state)!;
    await expect(canvas).toHaveAttribute("data-hint", String(m.to));
    await tapCell(page, state, m.to, mobile);
    state = rules.play(state, m)!;
    await expect(canvas).toHaveAttribute("data-path", state.path.join(" "));
  }
  expect(state.winner).toBe(0);
  await expect(canvas).toHaveAttribute("data-lit", start.posts.map((p) => p.cell).join(" "));
  await expect(page.locator("#turn")).toContainText("성공!", { timeout: 20000 });
  await expect(page.locator("#pz-next")).toBeVisible({ timeout: 20000 });
  expect(errors).toEqual([]);
});

test("light cable: the keyboard draws the cable by arrows, winds it back with Backspace and is refused at the edge", async ({ page }) => {
  const random = await seeded(page, 523),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "빛 케이블");
  await page.getByRole("dialog").locator(".stage-card").first().click();
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  rules.createGame(1, random);
  const start = rules.createGame(1, random);
  await expect(canvas).toHaveAttribute("data-posts", postsOf(start));
  await canvas.focus();
  // The start socket stands by an edge: an arrow toward it is a step off the board.
  const outKey = { [rules.N]: "ArrowUp", [rules.E]: "ArrowRight", [rules.S]: "ArrowDown", [rules.W]: "ArrowLeft" }[start.start.bit]!;
  await page.keyboard.press(outKey);
  await expect(page.locator("#turn")).toContainText("판 밖으로는 케이블을 끌 수 없습니다.");
  // The plan's first step by its arrow, then wound back.
  const next = start.plan[1],
    bit = rules.sideTo(start.size, start.start.cell, next),
    key = { [rules.N]: "ArrowUp", [rules.E]: "ArrowRight", [rules.S]: "ArrowDown", [rules.W]: "ArrowLeft" }[bit]!;
  await page.keyboard.press(key);
  await expect(canvas).toHaveAttribute("data-path", `${start.start.cell} ${next}`);
  await page.keyboard.press("Backspace");
  await expect(canvas).toHaveAttribute("data-path", String(start.start.cell));
  await expect(moves(page)).toHaveText("2수");
  expect(errors).toEqual([]);
});
