import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as rules from "../../src/games/bulblink/rules";
import { BOARD_TOP, BULB_Y, bulbSubject, cellAt } from "../../src/games/bulblink/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");
/** The screen pauses input for a moment after each move: wait it out before the next tap. */
const rest = async (page: Page) => {
  await settled(page);
  await page.waitForTimeout(260);
};

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
/** A tap (a touch on the phone) on a cell where the table's camera shows it: a bulb at its glass, anything else at the board. */
async function tapCell(page: Page, state: rules.State, cell: number, mobile: boolean) {
  const box = (await page.locator("#board canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = bulbSubject(state.size, aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const at = cellAt(state.size, cell),
    v = new Vector3(at.x, state.cells[cell] === rules.BULB ? BULB_Y : BOARD_TOP, at.z).project(camera),
    x = box.x + ((v.x + 1) * box.width) / 2,
    y = box.y + ((1 - v.y) * box.height) / 2;
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test("bulb link: entered through its stage window, a seeded board is lit by following hints, with a refusal and an undo", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 211),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "전구 잇기");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(rules.STAGES.length);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  // A board was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  rules.createGame(1, random);
  const start = rules.createGame(1, random);
  await expect(canvas).toHaveAttribute("data-bulbs", rules.bulbsOf(start).join(" "));
  await expect(canvas).toHaveAttribute("data-head", "-1");
  // A tap on an empty socket (one with nothing standing in front of it) is refused with words, and nothing is played.
  const n = start.size,
    empty = start.cells.findIndex((kind, i) => kind === rules.EMPTY && (i + n >= n * n || start.cells[i + n] === rules.EMPTY));
  await tapCell(page, start, empty, mobile);
  await expect(page.locator("#turn")).toContainText("빈 소켓입니다.");
  await expect(moves(page)).toHaveText("0수");
  // The hints, each tapped where its gold ring stands, light every bulb; one is taken back on the way and laid again.
  let state = start,
    undone = false;
  for (let k = 0; k < 40 && state.winner === null; k++) {
    await page.locator("#pz-hint").click();
    const m = rules.hint(state)!;
    await expect(canvas).toHaveAttribute("data-hint", String(m.to));
    await tapCell(page, state, m.to, mobile);
    const next = rules.play(state, m)!;
    await expect(moves(page)).toHaveText(`${next.ply}수`, { timeout: 20000 });
    await rest(page);
    await expect(canvas).toHaveAttribute("data-head", String(m.to));
    if (!undone && next.ply === 2) {
      undone = true;
      await page.locator("#pg-undo").click();
      await expect(moves(page)).toHaveText("1수", { timeout: 20000 });
      await rest(page);
      await expect(canvas).toHaveAttribute("data-lit", String(state.path[0]));
      continue;
    }
    state = next;
  }
  expect(undone).toBe(true);
  expect(state.winner).toBe(0);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  await expect(canvas).toHaveAttribute("data-lit", state.path.join(" "));
  expect(errors).toEqual([]);
});

test("bulb link: quick taps given while a wire is laid are kept and played in order; a refused one drops the rest", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 307),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "전구 잇기");
  await page.getByRole("dialog").locator(".stage-card").nth(1).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  rules.createGame(1, random);
  const start = rules.createGame(2, random);
  await expect(canvas).toHaveAttribute("data-bulbs", rules.bulbsOf(start).join(" "));
  const way = rules.solve(start)!;
  // Five taps in a row, none waiting for the wire before it: every one is played, in the order given.
  for (const cell of way.slice(0, 5)) await tapCell(page, start, cell, mobile);
  await expect(moves(page)).toHaveText("5수", { timeout: 20000 });
  await rest(page);
  await expect(canvas).toHaveAttribute("data-lit", way.slice(0, 5).join(" "));
  // A tap that is not legal when its turn comes is refused with its words, and what was tapped after it is dropped.
  let state = start;
  for (const cell of way.slice(0, 5)) state = rules.play(state, { from: -1, to: cell, extra: -1 })!;
  const n = state.size,
    empty = state.cells.findIndex((kind, i) => kind === rules.EMPTY && (i + n >= n * n || state.cells[i + n] === rules.EMPTY));
  // (By the mouse on both screens: on the emulated phone a touch waits for frames and is too slow to land while the
  // wire before it still runs, and this part tests the queue, not the touch.)
  await tapCell(page, state, way[5], false);
  await tapCell(page, state, empty, false);
  await tapCell(page, state, way[6], false);
  await expect(page.locator("#turn")).toContainText("빈 소켓입니다.", { timeout: 20000 });
  await rest(page);
  await expect(moves(page)).toHaveText("6수");
  await expect(canvas).toHaveAttribute("data-lit", way.slice(0, 6).join(" "));
  // Undo takes the last back as before.
  await page.locator("#pg-undo").click();
  await expect(moves(page)).toHaveText("5수", { timeout: 20000 });
  expect(errors).toEqual([]);
});
