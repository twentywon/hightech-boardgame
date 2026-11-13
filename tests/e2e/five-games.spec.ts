import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { HOLES, createGame, moves } from "../../src/games/starhop/rules";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const rest = async (page: Page) => {
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(260);
};
async function sit(page: Page, name: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, name);
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  await page.locator("canvas").focus();
  return errors;
}
type Subject = { half: number; halfZ: number; height: number; lookY: number; tilt: number };
async function onScreen(page: Page, subject: Subject, x: number, y: number, z: number, orbit = 0) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  const flat = Math.cos(subject.tilt) * distance;
  camera.position.set(Math.sin(orbit) * flat, Math.sin(subject.tilt) * distance, Math.cos(orbit) * flat);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, y, z).project(camera);
  return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
}

test("chinese checkers: a marble is picked up and set down, and the computer answers", async ({ page }) => {
  const errors = await sit(page, "차이니즈 체커");
  const subject = { half: 5.6, halfZ: 5.6, height: 0.8, lookY: 0, tilt: 1.08 },
    at = (i: number) => onScreen(page, subject, (HOLES[i].q + HOLES[i].r / 2) * 0.62, 0.1, HOLES[i].r * 0.62 * 0.866),
    move = moves(createGame())[0];
  for (const hole of [move.from, move.to]) {
    const p = await at(hole);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
  }
  await expect(count(page)).toHaveText("2수", { timeout: 30000 });
  expect(errors).toEqual([]);
});

test("ludo: the die is rolled from the button on the board", async ({ page }) => {
  const errors = await sit(page, "루도");
  await page.locator(".board-area .pg-tools").getByRole("button", { name: "주사위 굴리기" }).click();
  await expect(count(page)).not.toHaveText("0수", { timeout: 30000 });
  await rest(page);
  expect(errors).toEqual([]);
});

test("pocket ball: the cue ball is pulled back and let go", async ({ page }) => {
  const errors = await sit(page, "포켓볼");
  // The table is seen from its long side (a quarter turn round it).
  const subject = { half: 6.3, halfZ: 4.1, height: 0.6, lookY: 0, tilt: 1.02 },
    from = await onScreen(page, subject, 0, 0.15, 2.9, Math.PI / 2),
    to = await onScreen(page, subject, 0, 0, 4.4, Math.PI / 2);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  await expect(count(page)).not.toHaveText("0수", { timeout: 30000 });
  expect(errors).toEqual([]);
});

test("indian poker: I see only the other card, and a call ends the round", async ({ page }) => {
  const errors = await sit(page, "인디언 포커");
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  // The round begins when I raise my card to my forehead; until then the other card is not told.
  await expect(page.locator("#turn")).toContainText("이마에 얹기");
  await expect(page.locator("#turn")).not.toContainText("상대 카드는");
  await page.locator(".board-area .pg-tools").getByRole("button", { name: "이마에 얹기" }).click();
  await expect(page.locator("#turn")).toContainText("상대 카드는", { timeout: 20000 });
  // My own card is nowhere in the page while the betting lasts.
  expect(await page.locator("#turn").innerHTML()).not.toContain("내 카드");
  expect(await page.locator(".yut-sides").innerHTML()).not.toContain("내 카드");
  await expect(page.getByRole("button", { name: "무르기", exact: true })).toBeHidden();
  // The bet is set up and down, and nothing is made of it until 결정 is pressed.
  const tools = page.locator(".board-area .pg-tools"),
    decide = tools.getByRole("button", { name: /^결정/ }),
    moved = await count(page).innerText();
  await expect(decide).toHaveText("결정 · 체크");
  await expect(tools.getByRole("button", { name: "− 내리기" })).toBeDisabled();
  for (let i = 0; i < 3; i++) await tools.getByRole("button", { name: "+ 올리기" }).click();
  await tools.getByRole("button", { name: "− 내리기" }).click();
  await expect(decide).toHaveText("결정 · 베팅 2");
  await expect(page.locator("#turn")).toContainText("내 베팅 2");
  await expect(count(page)).toHaveText(moved);
  await decide.click();
  await expect(count(page)).not.toHaveText(moved, { timeout: 30000 });
  await rest(page);
  expect(errors).toEqual([]);
});

test("pocket ball: after the white ball goes down the next player sets it where they like", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "포켓볼");
  await page.getByLabel("로컬 2인", { exact: true }).check({ force: true });
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  const subject = { half: 6.3, halfZ: 4.1, height: 0.6, lookY: 0, tilt: 1.02 },
    drag = async (from: [number, number], to: [number, number]) => {
      const a = await onScreen(page, subject, from[0], 0, from[1], Math.PI / 2),
        b = await onScreen(page, subject, to[0], 0, to[1], Math.PI / 2);
      await page.mouse.move(a.x, a.y);
      await page.mouse.down();
      await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
      await page.mouse.move(b.x, b.y, { steps: 4 });
      await page.mouse.up();
    },
    // Straight at the near right corner pocket: the pull goes the other way.
    dx = 2.54,
    dz = 4.94 - 2.9,
    d = Math.hypot(dx, dz);
  await drag([0, 2.9], [(-dx / d) * 1.4, 2.9 - (dz / d) * 1.4]);
  await expect(count(page)).toHaveText("1수", { timeout: 30000 });
  await rest(page);
  await expect(page.locator("#turn")).toContainText("흰 공을 끌어 원하는 곳에 놓으세요");
  // Carried from the head spot to the middle; it is no shot, and the turn stays.
  await drag([0, 2.9], [-1.2, 0.6]);
  await expect(page.locator("#turn")).toContainText("다른 곳을 누르면 다시 놓습니다");
  await expect(count(page)).toHaveText("1수");
  // A tap elsewhere sets it down again, and a pull on it there is a shot.
  const again = await onScreen(page, subject, 1, 0, 1.5, Math.PI / 2);
  await page.mouse.click(again.x, again.y);
  await page.waitForTimeout(300);
  await expect(count(page)).toHaveText("1수");
  await drag([1, 1.5], [1, 2.8]);
  await expect(count(page)).toHaveText("2수", { timeout: 30000 });
  await rest(page);
  await expect(page.locator("#turn")).not.toContainText("다시 놓습니다");
  expect(errors).toEqual([]);
});

test("table soccer: the ball runs by itself and my rods follow the keys", async ({ page }) => {
  const errors = await sit(page, "테이블 사커");
  const canvas = page.locator("canvas");
  await expect(page.getByRole("button", { name: "무르기", exact: true })).toBeHidden();
  await expect(canvas).toHaveAttribute("data-ball", /,/, { timeout: 10000 });
  const before = await canvas.getAttribute("data-ball");
  await page.keyboard.down("ArrowDown");
  await page.waitForTimeout(900);
  await page.keyboard.press(" ");
  await page.keyboard.up("ArrowDown");
  await expect.poll(async () => Number(await canvas.getAttribute("data-slide")), { timeout: 10000 }).toBeGreaterThan(0.5);
  await expect.poll(() => canvas.getAttribute("data-ball"), { timeout: 10000 }).not.toBe(before);
  // The pause button stops the table where it is; pressed again, the ball runs on.
  const pause = page.locator("#pg-pause");
  await pause.click();
  await expect(page.locator("#turn")).toContainText("일시정지");
  await page.waitForTimeout(300);
  const stopped = await canvas.getAttribute("data-ball");
  await page.waitForTimeout(1200);
  expect(await canvas.getAttribute("data-ball")).toBe(stopped);
  await expect(pause).toHaveAttribute("aria-label", "계속하기");
  await pause.click();
  await expect.poll(() => canvas.getAttribute("data-ball"), { timeout: 10000 }).not.toBe(stopped);
  await page.getByRole("button", { name: "게임 방법" }).click();
  await expect(page.locator("dialog[open]")).toContainText("골키퍼");
  expect(errors).toEqual([]);
});
