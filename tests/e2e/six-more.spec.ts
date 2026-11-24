import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance, type Subject } from "../../src/engine/camera";
import { AMAZON_SUBJECT, squareAt } from "../../src/games/amazons/view";
import * as bgRules from "../../src/games/backgammon/rules";
import { BG_SUBJECT, DICE_AT, spotOf } from "../../src/games/backgammon/view";
import { ONECARD } from "../../src/games/onecard/layout";
import { throwerCamera } from "../../src/games/curling/view";
import { HACK } from "../../src/games/curling/rules";
import * as starRules from "../../src/games/starbattle/rules";
import { squareOf, starSubject } from "../../src/games/starbattle/view";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");
async function sit(page: Page, game: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, game);
  // A puzzle for one is entered through its stage window: the test picks its card there.
  if (await page.locator("dialog[open] .stage-entry").count()) return errors;
  await page.locator(".game-stage button.primary").click();
  return errors;
}
async function ready(page: Page) {
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
}
async function screen(page: Page, subject: Subject & { tilt: number }, x: number, y: number, z: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}
async function tap(page: Page, subject: Subject & { tilt: number }, x: number, z: number, mobile: boolean, y = 0) {
  const at = await screen(page, subject, x, y, z);
  if (mobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await page.waitForTimeout(150);
}

test("game of the amazons: an amazon moves, shoots, and the computer answers", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await sit(page, "아마존스");
  await ready(page);
  // The white amazon at d1 steps up to d2 and shoots back onto d1.
  const from = 93,
    to = 83;
  for (const s of [from, to, from]) await tap(page, AMAZON_SUBJECT, squareAt(s).x, squareAt(s).z, mobile, 0.05);
  await expect(moves(page)).toHaveText("2수", { timeout: 30000 });
  expect(errors).toEqual([]);
});

test("backgammon: the dice are thrown by a tap and a checker moves", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await sit(page, "백개먼");
  await ready(page);
  await tap(page, BG_SUBJECT, DICE_AT.x, DICE_AT.z, mobile, 0.3);
  await expect(moves(page)).toHaveText("1수", { timeout: 20000 });
  await settled(page);
  // The roll is read from the status line, and a legal first move found for it from the opening position.
  const hint = await page.locator(".board-hint").innerText(),
    dice = (hint.match(/(\d), (\d)/) ?? []).slice(1).map(Number),
    start = { ...bgRules.createGame(), phase: "move" as const, dice, left: dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice },
    first = bgRules.moves(start)[0];
  for (const p of [first.from, first.to]) {
    const at = spotOf(p, 0);
    await tap(page, BG_SUBJECT, at.x, at.z, mobile, 0.1);
  }
  await expect(moves(page)).toHaveText("2수", { timeout: 20000 });
  expect(errors).toEqual([]);
});

test("backgammon with the cube: a double is offered by its button, the computer answers, and the cube and checkers are told on the canvas", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "백개먼");
  await page.selectOption("#pg-variant", "cube");
  await page.locator(".game-stage button.primary").click();
  await ready(page);
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-cube", "1:-");
  await expect(canvas).toHaveAttribute("data-pieces", /^0,0,0,0,0,5,0,3,/);
  // At the opening the computer is no worse off than I am: it takes, and owns the cube at 2.
  await page.getByRole("button", { name: /더블 제안/ }).click();
  await expect(canvas).toHaveAttribute("data-cube", "2:1", { timeout: 20000 });
  await settled(page);
  await expect(page.getByRole("button", { name: /더블 제안/ })).toBeHidden();
  // The dice are thrown by a tap as ever, and a checker moved.
  await tap(page, BG_SUBJECT, DICE_AT.x, DICE_AT.z, mobile, 0.3);
  await expect(moves(page)).toHaveText("3수", { timeout: 20000 });
  await settled(page);
  expect(errors).toEqual([]);
});

test("one card: a card is drawn from the pile and the computer answers", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    errors = await sit(page, "원카드");
  await ready(page);
  await tap(page, ONECARD.SUBJECT, ONECARD.PILE.x, ONECARD.PILE.z, mobile, 0.2);
  await expect(moves(page)).not.toHaveText(/^[01]수$/, { timeout: 30000 });
  await expect(page.locator(".board-hint")).toContainText(/낼 카드|공격|바꿀 무늬|이겼/, { timeout: 30000 });
  expect(errors).toEqual([]);
});

test("old maid: a card is drawn from the left hand and the computers play on to my turn", async ({ page }) => {
  const errors = await sit(page, "도둑잡기");
  await ready(page);
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(moves(page)).not.toHaveText("0수", { timeout: 20000 });
  await expect(page.locator(".board-hint")).toContainText(/뽑으세요|도둑|이겼/, { timeout: 30000 });
  expect(errors).toEqual([]);
});

test("curling: a stone is pulled back from the hack and let go", async ({ page }, info) => {
  test.skip(info.project.name === "mobile", "the mouse pulls here");
  const errors = await sit(page, "컬링");
  await ready(page);
  // Three ends unless five were chosen, and the scoreboard counts them.
  await expect(page.locator(".board-hint")).toContainText("1/3엔드");
  // Seen from behind the hack: the stone is pulled straight back toward the eye.
  const box = (await page.locator("canvas").boundingBox())!,
    camera = new PerspectiveCamera(FOV, box.width / box.height, 0.1, 120);
  throwerCamera(camera);
  const at = (x: number, y: number, z: number) => {
      const v = new Vector3(x, y, z).project(camera);
      return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
    },
    a = at(HACK.x, 0.1, HACK.z),
    b = at(HACK.x - 0.75, 0, HACK.z);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(a.x + ((b.x - a.x) * i) / 8, a.y + ((b.y - a.y) * i) / 8);
  await page.mouse.up();
  await expect(moves(page)).toHaveText(/^[12]수$/, { timeout: 30000 });
  await expect(page.locator(".board-hint")).toContainText("스톤 2/4", { timeout: 60000 });
  expect(errors).toEqual([]);
});

/** Stubs the shuffle so the puzzle laid can be known here. */
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
test("star battle: every star is set by a tap and the puzzle is solved", async ({ page }, info) => {
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 91),
    errors = await sit(page, "스타 배틀");
  await page.getByRole("dialog").locator(".stage-card").first().click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await ready(page);
  starRules.createGame(1, random);
  const state = starRules.createGame(1, random),
    box = (await page.locator("canvas").boundingBox())!,
    subject = starSubject(state.size, box.width / box.height);
  for (let r = 0; r < state.size; r++) {
    const at = squareOf(state.size, r * state.size + state.answer[r]);
    await tap(page, subject, at.x, at.z, mobile, 0.12);
    await expect(moves(page)).toHaveText(`${r + 1}수`, { timeout: 20000 });
    await settled(page);
  }
  await expect(page.locator("#turn")).toContainText("성공!");
  expect(errors).toEqual([]);
});
