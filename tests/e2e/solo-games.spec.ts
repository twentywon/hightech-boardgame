import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { CENTRE, HOLES, SIZE, holeAt } from "../../src/games/peg/rules";
import { W as TRAY_W, createGame as layTray, solve as solveTray } from "../../src/games/marble/rules";
import { selectGame } from "./library";

const count = (page: Page) => page.locator("#move-count");
const rest = async (page: Page) => {
  await expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
  await page.waitForTimeout(260);
};
/** Sits down at a game for one: there is no other side to choose and no level. */
async function sit(page: Page, name: string) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, name);
  await expect(page.getByLabel("로컬 2인", { exact: true })).toBeHidden();
  await expect(page.locator("#pg-level-field")).toBeHidden();
  await page.locator(".game-stage button.primary").click();
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(page.locator("#pg-side-1")).toBeHidden();
  return errors;
}
const score = async (page: Page) => Number(/점수 (\d+)/.exec(await page.locator("#turn").innerText())?.[1] ?? -1);

test("peg solitaire: a marble jumps into the middle, and the jump is taken back", async ({ page }) => {
  const errors = await sit(page, "페그 솔리테어");
  // The stages come up in a window over the board; the whole board is the first card.
  const cards = page.getByRole("dialog").locator(".stage-card");
  await expect(cards).toHaveCount(6);
  await cards.filter({ hasText: "기본" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  const subject = { half: 3.7, halfZ: 3.7, height: 0.7, lookY: 0, tilt: (58 * Math.PI) / 180 },
    at = async (hole: number) => {
      const box = (await page.locator("canvas").boundingBox())!,
        aspect = box.width / box.height,
        distance = cameraDistance(aspect, false, subject),
        camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
      camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const v = new Vector3((HOLES[hole].x - (SIZE - 1) / 2) * 0.86, 0.3, (HOLES[hole].z - (SIZE - 1) / 2) * 0.86).project(camera);
      return { x: box.x + ((v.x + 1) / 2) * box.width, y: box.y + ((1 - v.y) / 2) * box.height };
    };
  await expect(page.locator("#turn")).toContainText("구슬 32개");
  for (const hole of [holeAt(3, 1), CENTRE]) {
    const p = await at(hole);
    await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(300);
  }
  await expect(count(page)).toHaveText("1수", { timeout: 20000 });
  await rest(page);
  await expect(page.locator("#turn")).toContainText("구슬 31개");
  await page.locator(".board-controls").getByRole("button", { name: "무르기", exact: true }).click();
  await expect(count(page)).toHaveText("0수");
  await expect(page.locator("#turn")).toContainText("구슬 32개");
  expect(errors).toEqual([]);
});

test("peg solitaire: the stage is chosen from pictures in a window after sitting down", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "페그 솔리테어");
  // Nothing is chosen in the collection: no list of stages there.
  await expect(page.locator("#pg-variant")).toHaveCount(0);
  await page.locator(".game-stage button.primary").click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("스테이지 선택");
  // A card for each stage, with its picture, name and number of marbles.
  await expect(dialog.locator(".stage-card")).toHaveCount(6);
  await expect(dialog.locator(".stage-card svg")).toHaveCount(6);
  await expect(dialog.locator(".stage-card").filter({ hasText: "십자가" })).toContainText("구슬 6개");
  await dialog.locator(".stage-card").filter({ hasText: "십자가" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("구슬 6개");
  // 새 게임 brings the same window; the stage being played is marked, and closing it keeps the game.
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".stage-card.current")).toContainText("십자가");
  await page.getByRole("dialog").getByRole("button", { name: "계속하기" }).click();
  await expect(page.locator("#turn")).toContainText("구슬 6개");
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "다이아몬드" }).click();
  await expect(page.locator("#turn")).toContainText("구슬 24개", { timeout: 20000 });
  expect(errors).toEqual([]);
});

test("2048: the arrow keys and a swipe slide the tiles", async ({ page }) => {
  const errors = await sit(page, "2048");
  // No panel beside the table; the figures stay in the page for readers.
  await expect(page.locator(".game-layout")).toHaveClass(/no-panel/);
  await expect(page.locator(".solo-stat")).toHaveCount(2);
  expect((await page.locator(".game-sidebar").boundingBox())!.width).toBeLessThanOrEqual(1);
  await expect(page.getByRole("button", { name: "무르기", exact: true })).toBeHidden();
  // Two tiles on sixteen squares: at least one of the four ways moves something.
  for (const key of ["ArrowLeft", "ArrowDown", "ArrowRight", "ArrowUp"]) {
    await page.keyboard.press(key);
    await rest(page);
  }
  await expect(count(page)).not.toHaveText("0수");
  const before = await count(page).innerText(),
    box = (await page.locator("canvas").boundingBox())!,
    mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  // Swiped left, then down: one of the two always moves a tile after the keys above.
  for (const [dx, dy] of [[-box.width * 0.2, 0], [0, box.height * 0.2]]) {
    await page.mouse.move(mid.x, mid.y);
    await page.mouse.down();
    await page.mouse.move(mid.x + dx / 2, mid.y + dy / 2, { steps: 3 });
    await page.mouse.move(mid.x + dx, mid.y + dy, { steps: 3 });
    await page.mouse.up();
    await rest(page);
  }
  await expect(count(page)).not.toHaveText(before);
  await expect(page.locator("#turn")).toContainText("같은 수끼리 합치세요");
  await expect(page.locator("#pg-count-0")).toContainText("가장 큰 수");
  expect(errors).toEqual([]);
});

test("falling blocks: the clock brings the piece down, a key drops it, and an open window stops the clock", async ({ page }) => {
  const errors = await sit(page, "블록 내리기");
  await expect(page.locator(".solo-stat")).toHaveCount(3);
  // Nothing is pressed: the piece falls by itself.
  await expect(count(page)).not.toHaveText("0수", { timeout: 10000 });
  expect(await score(page)).toBe(0);
  await page.keyboard.press(" ");
  await expect.poll(() => score(page), { timeout: 10000 }).toBeGreaterThan(0);
  // The buttons on the table move the piece too.
  const tools = page.locator(".board-area .pg-tools");
  // They stand as the arrow keys do, at the lower left, with the drop beside them.
  const right = tools.getByRole("button", { name: "오른쪽", exact: true }),
    turn = tools.getByRole("button", { name: "돌리기" }),
    drop = tools.getByRole("button", { name: "떨어뜨리기" });
  await right.click();
  await turn.click();
  await drop.click();
  const [up, side, fall, board] = await Promise.all([turn.boundingBox(), right.boundingBox(), drop.boundingBox(), page.locator(".board-area").boundingBox()]);
  expect(up!.y).toBeLessThan(side!.y);
  expect(fall!.x).toBeGreaterThan(side!.x);
  expect(side!.x + side!.width).toBeLessThan(board!.x + board!.width / 2);
  const dropped = await score(page);
  expect(dropped).toBeGreaterThan(0);
  // While the rules are open nothing falls.
  await page.getByRole("button", { name: "게임 방법" }).click();
  await expect(page.locator("dialog[open]")).toBeVisible();
  const held = await count(page).innerText();
  await page.waitForTimeout(2200);
  await expect(count(page)).toHaveText(held);
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(count(page)).not.toHaveText(held, { timeout: 10000 });
  // The pause button stops the clock and the keys; pressed again, the game goes on.
  // Two bars in the table's upper right corner.
  const pause = page.locator("#pg-pause");
  await expect(pause).toHaveAttribute("aria-label", "일시정지");
  const corner = (await pause.boundingBox())!,
    area = (await page.locator(".board-area").boundingBox())!;
  expect(corner.x).toBeGreaterThan(area.x + area.width * 0.8);
  expect(corner.y).toBeLessThan(area.y + area.height * 0.2);
  await pause.click();
  await expect(page.locator("#board")).toHaveAttribute("data-paused", "true");
  await expect(page.locator("#turn")).toContainText("일시정지");
  const stopped = await count(page).innerText();
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press(" ");
  await page.waitForTimeout(2200);
  await expect(count(page)).toHaveText(stopped);
  await expect(pause).toHaveAttribute("aria-label", "계속하기");
  await pause.click();
  await expect(page.locator("#board")).toHaveAttribute("data-paused", "false");
  await expect(count(page)).not.toHaveText(stopped, { timeout: 10000 });
  // The P key does the same.
  await page.keyboard.press("p");
  await expect(pause).toHaveAttribute("aria-label", "계속하기");
  await page.keyboard.press("p");
  await expect(pause).toHaveAttribute("aria-label", "일시정지");
  // 새 게임 asks which level to begin at; from the fifth, rubble comes up from the floor.
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(8);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "레벨 5" }).click();
  await expect(page.locator("#turn")).toContainText("레벨 5", { timeout: 20000 });
  expect(errors).toEqual([]);
});

test("brick breaker: the ball is sent off and knocks a brick out", async ({ page }) => {
  const errors = await sit(page, "벽돌깨기");
  await expect(page.locator(".solo-stat")).toHaveCount(3);
  await expect(page.locator("#turn")).toContainText("남은 공 3");
  // The ball rests on the bat: nothing happens until it is sent off.
  await page.waitForTimeout(1200);
  await expect(count(page)).toHaveText("0수");
  await page.locator("canvas").focus();
  // Paused, the ball cannot even be sent off.
  const pause = page.locator("#pg-pause");
  await pause.click();
  await expect(page.locator("#turn")).toContainText("일시정지");
  await page.locator("canvas").focus();
  await page.keyboard.press(" ");
  await page.waitForTimeout(2500);
  await expect(count(page)).toHaveText("0수");
  await pause.click();
  await page.keyboard.press(" ");
  await expect.poll(() => score(page), { timeout: 20000 }).toBeGreaterThan(0);
  // 새 게임 shows the ten walls; a later one may be begun at once.
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  const walls = page.getByRole("dialog").locator(".stage-card");
  await expect(walls).toHaveCount(10);
  await expect(page.getByRole("dialog").locator(".stage-card svg")).toHaveCount(10);
  await walls.filter({ hasText: "7단계" }).click();
  await expect(page.locator("#turn")).toContainText("7/10단계", { timeout: 20000 });
  expect(errors).toEqual([]);
});

test("marble shooting: the difficulty is asked on sitting down, and the panel hints, undoes, starts over, lays another and goes on", async ({ page }) => {
  // The tray is laid at random; with the platform's generator replaced by a known one, the test can lay the same tray.
  await page.addInitScript(() => {
    let seed = 2024;
    crypto.getRandomValues = ((buffer: Uint32Array) => {
      for (let i = 0; i < buffer.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        buffer[i] = seed * 2;
      }
      return buffer;
    }) as typeof crypto.getRandomValues;
  });
  let seed = 2024;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed * 2) / 4294967296;
  };
  const errors = await sit(page, "구슬치기");
  // The difficulties come up in a window as soon as one sits down.
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator(".stage-card")).toHaveCount(5);
  await dialog.locator(".stage-card").filter({ hasText: "아주 쉬움" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  await expect(page.locator("#turn")).toContainText("구슬 4개");
  // The panel: which stage this is, the difficulties, and the four buttons.
  const panel = page.locator(".puzzle-panel");
  await expect(panel.locator("#pz-stage")).toHaveText("아주 쉬움 · 스테이지 1");
  await expect(panel.locator(".puzzle-level")).toHaveCount(5);
  await expect(panel.locator('.puzzle-level[aria-pressed="true"]')).toContainText("아주 쉬움");
  for (const name of ["힌트", "무르기", "처음부터", "다른 퍼즐"]) await expect(panel.getByRole("button", { name, exact: true })).toBeVisible();
  await expect(panel.locator("#pz-next")).toBeHidden();
  // Trays were laid when the game was looked at in the collection and when sitting down; the third is the one chosen.
  layTray(6, random);
  layTray(6, random);
  let tray = layTray(4, random),
    cursor = 0;
  const way = solveTray(tray)!,
    walk = async (to: number) => {
      const dx = (to % TRAY_W) - (cursor % TRAY_W),
        dy = Math.floor(to / TRAY_W) - Math.floor(cursor / TRAY_W);
      for (let i = 0; i < Math.abs(dx); i++) await page.keyboard.press(dx > 0 ? "ArrowRight" : "ArrowLeft");
      for (let i = 0; i < Math.abs(dy); i++) await page.keyboard.press(dy > 0 ? "ArrowDown" : "ArrowUp");
      cursor = to;
    },
    shoot = async (shot: { from: number; to: number }) => {
      await walk(shot.from);
      await page.keyboard.press("Enter");
      await walk(shot.to);
      await page.keyboard.press("Enter");
    };
  // A hint says what to do and a shot is made; undo and 처음부터 both bring the tray back.
  await panel.getByRole("button", { name: "힌트", exact: true }).click();
  await expect(page.locator("#turn")).toContainText("힌트");
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  await shoot(way[0]);
  await expect(count(page)).toHaveText("1수", { timeout: 20000 });
  await rest(page);
  await expect(page.locator("#turn")).toContainText("구슬 3개");
  await panel.getByRole("button", { name: "무르기", exact: true }).click();
  await expect(page.locator("#turn")).toContainText("구슬 4개");
  await page.locator("canvas").focus();
  await shoot(way[0]);
  await expect(count(page)).toHaveText("1수", { timeout: 20000 });
  await rest(page);
  await panel.getByRole("button", { name: "처음부터", exact: true }).click();
  await expect(count(page)).toHaveText("0수");
  await expect(page.locator("#turn")).toContainText("구슬 4개");
  // Solved: no window comes up; the panel offers the next stage.
  await page.locator("canvas").focus();
  for (const shot of way) {
    const before = await count(page).innerText();
    await shoot(shot);
    await expect(count(page)).not.toHaveText(before, { timeout: 20000 });
    await rest(page);
  }
  await expect(page.locator("#turn")).toContainText("성공");
  await expect(panel.locator("#pz-next")).toBeVisible();
  await page.waitForTimeout(1600);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await panel.locator("#pz-next").click();
  await expect(panel.locator("#pz-stage")).toHaveText("아주 쉬움 · 스테이지 2");
  await expect(page.locator("#turn")).toContainText("구슬 4개", { timeout: 20000 });
  await expect(panel.locator("#pz-next")).toBeHidden();
  // Another tray of the same stage, and another difficulty from the panel.
  await panel.getByRole("button", { name: "다른 퍼즐", exact: true }).click();
  await expect(panel.locator("#pz-stage")).toHaveText("아주 쉬움 · 스테이지 2");
  await panel.locator(".puzzle-level").filter({ hasText: "어려움" }).first().click();
  await expect(page.locator("#turn")).toContainText("구슬 10개", { timeout: 20000 });
  await expect(panel.locator("#pz-stage")).toHaveText("어려움 · 스테이지 1");
  expect(errors).toEqual([]);
});
