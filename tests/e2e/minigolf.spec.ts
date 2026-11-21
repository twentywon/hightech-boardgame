import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera } from "three";
import { selectGame } from "./library";
import { FOV } from "../../src/engine/camera";
import { HOLES } from "../../src/games/minigolf/course";
import { ballWorld, golferCamera, pullFor, pullShot } from "../../src/games/minigolf/layout";
import { createGame, play, shotMove } from "../../src/games/minigolf/rules";
import { yawOf } from "../../src/games/minigolf/sim";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 90000 });
/**
 * A pull from the ball on the first tee that holes it: tried through the same physics the rules use, after the pull
 * has been put on whole pixels of the page and read back the way the view reads it, through the golfer's eye as the
 * view sets it.
 */
async function holingPull(page: Page) {
  const box = (await page.locator("canvas").boundingBox())!,
    camera = new PerspectiveCamera(FOV, box.width / box.height, 0.1, 400),
    hole = HOLES[0],
    tee = hole.tee;
  golferCamera(camera, 0, tee);
  const ball = ballWorld(0, tee),
    straight = yawOf(hole.cup.x - tee.x, hole.cup.z - tee.z);
  for (const speed of [2.6, 2.55, 2.65, 2.5, 2.7, 2.45, 2.75, 2.4, 2.8])
    for (const turn of [0, 0.002, -0.002, 0.004, -0.004]) {
      const pull = pullFor(camera, ball, straight + turn, speed, box.width, box.height),
        from = { x: Math.round(box.x + pull.start.x), y: Math.round(box.y + pull.start.y) },
        to = { x: Math.round(box.x + pull.start.x + pull.dx), y: Math.round(box.y + pull.start.y + pull.dy) },
        shot = pullShot(camera, { x: from.x - box.x, y: from.y - box.y }, { x: to.x - box.x, y: to.y - box.y }, box.width, box.height, ball.y);
      if (shot && play(createGame(false), shotMove({ angle: shot.angle, speed: shot.speed, phase: 0 }))?.last?.result === "cup") return { from, to };
    }
  throw new Error("no pull holes the first hole");
}

test("mini golf: alone, a putt pulled back from the ball holes the first hole and the card counts it", async ({ page }) => {
  // A putt takes a few seconds to roll and the eye then flies to the next tee; the course is a large scene to draw
  // under software rendering, more so with three browsers at once.
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "미니골프");
  // Alone, so that every putt is mine.
  await page.locator("#pg-variant").selectOption("solo");
  await page.locator(".game-stage button.primary").click();
  const canvas = page.locator("canvas");
  await expect(canvas).toHaveAttribute("data-ready", "true", { timeout: 90000 });
  await settled(page);
  await expect(canvas).toHaveAttribute("data-camera", "aim");
  await expect(canvas).toHaveAttribute("data-hole", "1");
  await expect(page.locator(".board-hint")).toContainText("1번 홀");
  await expect(page.locator('.mg-card td[data-hole="0"][data-side="0"]')).toHaveText("");
  const { from, to } = await holingPull(page);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(from.x + ((to.x - from.x) * k) / 10, from.y + ((to.y - from.y) * k) / 10);
  // The last step lands on whole pixels, as the pull was worked out.
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  await expect(page.locator("#move-count")).toHaveText("1수", { timeout: 30000 });
  // The ball rolls into the cup, the card counts a hole in one, and the eye flies on to the second tee.
  await settled(page);
  await expect(page.locator('.mg-card td[data-hole="0"][data-side="0"]')).toHaveText("1");
  await expect(page.locator('.mg-card td.sum[data-side="0"]')).toContainText("1");
  await expect(canvas).toHaveAttribute("data-hole", "2");
  await expect(page.locator(".board-hint")).toContainText("2번 홀");
  await expect(canvas).toHaveAttribute("data-camera", "aim", { timeout: 30000 });
  // The whole hole can be looked over and the eye brought back behind the ball.
  await page.getByRole("button", { name: "홀 전체 보기" }).click();
  await expect(canvas).toHaveAttribute("data-camera", "overview", { timeout: 30000 });
  await page.getByRole("button", { name: "공 뒤에서 보기" }).click();
  await expect(canvas).toHaveAttribute("data-camera", "aim", { timeout: 30000 });
  expect(errors).toEqual([]);
});
