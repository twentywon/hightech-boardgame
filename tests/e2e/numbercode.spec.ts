import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as R from "../../src/games/numbercode/rules";
import { codeSubject, poolAt, standAt } from "../../src/games/numbercode/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = async (page: Page) => Number(/(\d+)/.exec(await page.locator("#move-count").innerText())?.[1] ?? 0);
const canvas = (page: Page) => page.locator("canvas");

/** Stubs the random numbers, so that the tiles dealt can be dealt here too. */
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
/** Where a point of the table is on the screen, through the same camera as the view's. */
async function screenAt(page: Page, seats: number, p: [number, number, number]) {
  const box = (await canvas(page).boundingBox())!,
    aspect = box.width / box.height,
    subject = codeSubject(seats, aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(...p).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}
async function tapAt(page: Page, at: { x: number; y: number }, mobile: boolean) {
  if (mobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
}
/** A tap in the middle of something over the table (the picker's numbers, the bubble's buttons), as a finger would. */
async function tapOn(page: Page, selector: string, mobile: boolean) {
  const target = page.locator(selector);
  await expect(target).toBeVisible();
  const box = (await target.boundingBox())!;
  await tapAt(page, { x: box.x + box.width / 2, y: box.y + box.height / 2 }, mobile);
}

test("number code: against one computer with the tiles fixed, a right guess and a wrong one by taps and the picker", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 4242),
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "숫자 코드");
  const dialog = page.locator("dialog.entry");
  // Only against the computer; one to three of them, the jokers in or out, the helper off to begin with.
  await expect(dialog.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await expect(dialog.locator("#pg-set-rivals")).toHaveValue("1");
  await expect(dialog.getByLabel("추리 도우미")).not.toBeChecked();
  await dialog.getByLabel("조커 넣기").uncheck();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(canvas(page)).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  // The screen dealt once as it was set up (with the jokers) and again as the game began.
  R.createGame({ rivals: "1", jokers: true, helper: false }, random);
  let state = R.createGame({ rivals: "1", jokers: false, helper: false }, random);
  await expect(canvas(page)).toHaveAttribute("data-rows", "4,4");
  await expect(canvas(page)).toHaveAttribute("data-phase", "draw");
  // The canvas tells only what everyone at the table can see.
  expect(await canvas(page).getAttribute("data-open")).toBe("0,0");

  // The helper, switched on over the table, writes what each hidden tile of the computer may still be.
  await page.getByRole("button", { name: "추리 도우미" }).click();
  await expect(page.locator(".nc-cand:visible")).toHaveCount(4);
  await page.getByRole("button", { name: "도우미 끄기" }).click();
  await expect(page.locator(".nc-cand:visible")).toHaveCount(0);

  // A tap on the pool draws that tile.
  const slot = poolAt(0, state.pool.length);
  await tapAt(page, await screenAt(page, 2, [slot.x, slot.y, slot.z]), mobile);
  await expect(canvas(page)).toHaveAttribute("data-phase", "guess", { timeout: 20000 });
  state = R.play(state, { from: -1, to: R.POOL, extra: -1 })!;
  await settled(page);
  await expect(page.locator("#turn")).toContainText("숨은 타일을 누르고");

  // A tap on the computer's first tile brings up the picker; the right number lays it face up.
  const first = state.rows[1][0];
  await tapAt(page, await screenAt(page, 2, standAt(2, 1, 0, 4).p), mobile);
  await expect(page.locator(".nc-pick")).toBeVisible();
  await expect(page.locator("#turn")).toContainText("숫자를 고르세요");
  await tapOn(page, `.nc-pick button[data-n='${R.numberOf(first)}']`, mobile);
  await expect(page.locator(".board-shout")).toHaveText(`정답! ${R.numberOf(first)}`);
  await expect(canvas(page)).toHaveAttribute("data-open", "0,1", { timeout: 20000 });
  await settled(page);
  // Go on or stop: the bubble over the table asks.
  await expect(page.locator("#turn")).toContainText("계속 맞히거나 멈추세요");
  await tapOn(page, ".nc-ask button.go", mobile);
  await expect(canvas(page)).toHaveAttribute("data-phase", "guess", { timeout: 20000 });
  await expect(page.locator(".nc-ask")).toBeHidden();

  // A wrong number for the second: my drawn tile goes into my row face up and the computer's turn begins.
  const second = state.rows[1][1],
    wrong = (R.numberOf(second) + 1) % 12,
    before = await moves(page);
  await tapAt(page, await screenAt(page, 2, standAt(2, 1, 1, 4).p), mobile);
  await tapOn(page, `.nc-pick button[data-n='${wrong}']`, mobile);
  await expect(page.locator(".board-shout")).toHaveText("땡!");
  await expect(canvas(page)).toHaveAttribute("data-rows", "5,4");
  await expect.poll(async () => (await canvas(page).getAttribute("data-open"))!.split(",")[0]).not.toBe("0");
  // The computer draws, guesses and hands the turn back (or ends the game).
  await expect.poll(() => moves(page), { timeout: 30000 }).toBeGreaterThan(before + 1);
  await expect
    .poll(async () => (await page.locator(".board-finale").count()) > 0 || (await canvas(page).getAttribute("data-seat")) === "0", { timeout: 40000 })
    .toBe(true);
  expect(errors).toEqual([]);
});
