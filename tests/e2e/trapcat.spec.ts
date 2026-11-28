import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as rules from "../../src/games/trapcat/rules";
import { TILE_TOP, hexAt, trapSubject } from "../../src/games/trapcat/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");
const block = (to: number) => ({ from: -1, to, extra: -1 });

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
/** A tap (a touch on the phone) on the middle of a hex, where the table's camera shows it. */
async function tapHex(page: Page, cell: number, mobile: boolean) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = trapSubject(aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const at = hexAt(cell),
    v = new Vector3(at.x, TILE_TOP, at.z).project(camera),
    x = box.x + ((v.x + 1) * box.width) / 2,
    y = box.y + ((1 - v.y) * box.height) / 2;
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

test("trap the cat: entered through its stage window, a seeded field is won by following hints, and a loss is undone", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 95),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "고양이 가두기");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(rules.STAGES.length);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  // A field was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  rules.createGame(1, random);
  const start = rules.createGame(1, random);
  await expect(page.locator("canvas")).toHaveAttribute("data-cat", String(start.cat));
  // A tap on a bush is refused with words, and nothing is played.
  await tapHex(page, start.given[0], mobile);
  await expect(page.locator("#turn")).toContainText("이미 막힌 칸입니다.");
  await expect(moves(page)).toHaveText("0수");
  // The hints, each tapped where its gold ring stands, shut the cat in and trap it.
  let state = start;
  for (let k = 0; k < 60 && state.winner === null; k++) {
    await page.locator("#pz-hint").click();
    const m = rules.hint(state)!;
    await expect(page.locator("canvas")).toHaveAttribute("data-hint", String(m.to));
    await tapHex(page, m.to, mobile);
    state = rules.play(state, m)!;
    await expect(moves(page)).toHaveText(`${k + 1}수`, { timeout: 20000 });
    await settled(page);
    await expect(page.locator("canvas")).toHaveAttribute("data-cat", String(state.cat));
  }
  expect(state.winner).toBe(0);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  // Back to the field as it was laid; blocks in the far corners let the cat out, and undo takes the last back.
  await page.locator("#pz-restart").click();
  await expect(moves(page)).toHaveText("0수", { timeout: 20000 });
  await settled(page);
  state = start;
  let before = start;
  for (const corner of [0, 10, 110, 120, 1, 9, 111, 119, 2, 8, 112, 118, 3, 7]) {
    if (state.winner !== null) break;
    const next = rules.play(state, block(corner));
    if (!next) continue;
    await tapHex(page, corner, mobile);
    before = state;
    state = next;
    await expect(moves(page)).toHaveText(`${state.ply}수`, { timeout: 20000 });
    await settled(page);
  }
  expect(state.winner).toBe(1);
  await expect(page.locator("#turn")).toContainText("실패!");
  await page.locator("#pg-undo").click();
  await expect(moves(page)).toHaveText(`${before.ply}수`, { timeout: 20000 });
  await settled(page);
  await expect(page.locator("#turn")).not.toContainText("실패!");
  await expect(page.locator("canvas")).toHaveAttribute("data-cat", String(before.cat));
  expect(errors).toEqual([]);
});
