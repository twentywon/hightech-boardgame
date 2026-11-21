import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as rules from "../../src/games/telescope/rules";
import { scopePoint, telescopeSubject } from "../../src/games/telescope/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");
/** Waits for the table to rest (presses given while it moves would be kept and played in order, which is not tested here). */
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
/** A tap (a touch on the phone) on telescope `t` where the table's camera shows its base. */
async function tapScope(page: Page, state: rules.State, t: number, mobile: boolean) {
  const box = (await page.locator("#board canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = telescopeSubject(state.size, aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const at = scopePoint(state.size, state.scopes[t].cell),
    v = new Vector3(at.x, at.y, at.z).project(camera),
    x = box.x + ((v.x + 1) * box.width) / 2,
    y = box.y + ((1 - v.y) * box.height) / 2;
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
const press = (t: number) => ({ from: -1, to: t, extra: -1 });

test("telescope push: entered through its stage window, a seeded board is solved by following hints, with a refusal and an undo", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 4129),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "망원경 퍼즐");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(rules.STAGES.length);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").nth(1).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  const canvas = page.locator("#board canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  // A board was laid as the screen was set up; the card pressed in the window lays the second, the one chosen.
  rules.createGame(1, random);
  const start = rules.createGame(2, random);
  await expect(canvas).toHaveAttribute("data-scopes", start.scopes.map((s) => `${s.cell}/${s.dir}`).join(" "));
  await expect(canvas).toHaveAttribute("data-ball", String(start.ball));
  await expect(canvas).toHaveAttribute("data-hole", String(start.hole));
  // The hints, each tapped on the telescope under the gold ring, bring the ball into the hole. On the way: the first
  // press is taken back once and made again, and a telescope that cannot be drawn out is pressed once and refused.
  let state = start,
    undone = false,
    refused = false;
  for (let k = 0; k < 40 && state.winner === null; k++) {
    if (!refused) {
      const stuck = state.scopes.findIndex((_, t) => !rules.play(state, press(t)));
      if (stuck >= 0) {
        refused = true;
        await tapScope(page, state, stuck, mobile);
        await expect(page.locator("#turn")).toContainText(rules.refusal(state, press(stuck))!);
        await expect(moves(page)).toHaveText(`${state.ply}수`);
        await expect(canvas).toHaveAttribute("data-lens", state.lens.join(" "));
      }
    }
    await page.locator("#pz-hint").click();
    const m = rules.hint(state)!;
    await expect(canvas).toHaveAttribute("data-hint", String(m.to));
    await tapScope(page, state, m.to, mobile);
    const next = rules.play(state, m)!;
    await expect(moves(page)).toHaveText(`${next.ply}수`, { timeout: 20000 });
    await rest(page);
    await expect(canvas).toHaveAttribute("data-lens", next.lens.join(" "));
    if (next.winner === null) await expect(canvas).toHaveAttribute("data-ball", String(next.ball));
    if (!undone) {
      undone = true;
      await page.locator("#pg-undo").click();
      await expect(moves(page)).toHaveText(`${state.ply}수`, { timeout: 20000 });
      await rest(page);
      await expect(canvas).toHaveAttribute("data-lens", state.lens.join(" "));
      await expect(canvas).toHaveAttribute("data-ball", String(state.ball));
      continue;
    }
    state = next;
  }
  expect(undone).toBe(true);
  expect(refused).toBe(true);
  expect(state.winner).toBe(0);
  await expect(canvas).toHaveAttribute("data-won", "true");
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#pz-next")).toBeVisible();
  expect(errors).toEqual([]);
});
