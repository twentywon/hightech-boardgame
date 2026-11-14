import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { CENTRE, HOLES, SIZE, holeAt } from "../../src/games/peg/rules";
import { W as TRAY_W, createGame as layTray, solve as solveTray } from "../../src/games/marble/rules";
import { createGame as layJugs, solve as solveJugs } from "../../src/games/pour/rules";
import { createGame as gather, solve as ferry } from "../../src/games/river/rules";
import * as tower from "../../src/games/hanoi/rules";
import * as lamps from "../../src/games/lights/rules";
import * as field from "../../src/games/mines/rules";
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
  // 레벨 선택 (where other games say 새 게임) asks which level to begin at; from the fifth, rubble comes up from the floor.
  await expect(page.getByRole("button", { name: "새 게임", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "레벨 선택", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("레벨 선택");
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
  // 레벨 선택 shows the ten walls; a later one may be begun at once.
  await page.getByRole("button", { name: "레벨 선택", exact: true }).click();
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
  await expect(page.locator("#turn")).toContainText("화살표");
  // The panel does not count the marbles.
  await expect(page.locator(".solo-stat")).toHaveCount(0);
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

test("water pouring: the level is asked, pours are counted against the fewest, and the solved puzzle offers the next", async ({ page }) => {
  // The puzzle is drawn at random; with the platform's generator replaced by a known one, the test can draw the same.
  await page.addInitScript(() => {
    let seed = 77;
    crypto.getRandomValues = ((buffer: Uint32Array) => {
      for (let i = 0; i < buffer.length; i++) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        buffer[i] = seed * 2;
      }
      return buffer;
    }) as typeof crypto.getRandomValues;
  });
  let seed = 77;
  const random = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed * 2) / 4294967296;
  };
  const errors = await sit(page, "물 나누기");
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(3);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "쉬움" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  // Puzzles were drawn when the game was looked at and when sitting down; the third is the one chosen.
  layJugs(1, random);
  layJugs(1, random);
  const puzzle = layJugs(1, random),
    way = solveJugs(puzzle)!;
  await expect(page.locator("#turn")).toContainText(`최소 ${puzzle.best}번`);
  await expect(page.locator("#turn")).toContainText("목표:");
  await expect(page.locator(".solo-stat")).toHaveCount(2);
  await expect(page.locator(".solo-stat").nth(1)).toContainText(String(puzzle.best));
  const panel = page.locator(".puzzle-panel");
  await panel.getByRole("button", { name: "힌트", exact: true }).click();
  await expect(page.locator("#turn")).toContainText("화살표");
  // The vessels are walked by the arrow keys: the first press stands on the first, then one step a vessel.
  let cursor = 0;
  const go = async (to: number) => {
    for (let i = 0; i < Math.abs(to - cursor); i++) await page.keyboard.press(to > cursor ? "ArrowRight" : "ArrowLeft");
    cursor = to;
    await page.keyboard.press("Enter");
  };
  await page.locator("canvas").focus();
  await page.keyboard.press("ArrowRight");
  for (const [n, move] of way.entries()) {
    await go(move.from);
    await go(move.to);
    await expect(count(page)).toHaveText(`${n + 1}수`, { timeout: 20000 });
    await rest(page);
    if (n === 0) {
      // One pour can be taken back.
      await panel.getByRole("button", { name: "무르기", exact: true }).click();
      await expect(count(page)).toHaveText("0수");
      await page.locator("canvas").focus();
      await go(move.from);
      await go(move.to);
      await expect(count(page)).toHaveText("1수", { timeout: 20000 });
      await rest(page);
    }
  }
  // Solved in the fewest pours: said so, no window, and the next stage is offered.
  await expect(page.locator("#turn")).toContainText(`${puzzle.best}번 만에`);
  await expect(page.locator("#turn")).toContainText("가장 적게");
  await page.waitForTimeout(1600);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await panel.locator("#pz-next").click();
  await expect(panel.locator("#pz-stage")).toHaveText("쉬움 · 스테이지 2");
  await expect(count(page)).toHaveText("0수");
  expect(errors).toEqual([]);
});


test("river crossing: a wrong crossing is shown as a failure and taken back, and the company is brought over in the fewest", async ({ page }) => {
  // Eleven crossings, each rowed across in full.
  test.setTimeout(120000);
  const errors = await sit(page, "강 건너기");
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(4);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "양과 늑대" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await rest(page);
  // This stage is always the same company: three sheep, three wolves, two to the boat.
  const puzzle = gather(2, Math.random),
    way = ferry(puzzle)!,
    sheep = puzzle.actors.findIndex((actor) => actor.role === "sheep");
  expect(way).toHaveLength(puzzle.best);
  await expect(page.locator("#turn")).toContainText(`최소 ${puzzle.best}번`);
  const panel = page.locator(".puzzle-panel"),
    launch = page.locator("#pg-tool-0");
  // An empty boat does not cross.
  await expect(launch).toBeDisabled();
  let cursor = 0;
  const board = async (to: number) => {
    for (let i = 0; i < Math.abs(to - cursor); i++) await page.keyboard.press(to > cursor ? "ArrowRight" : "ArrowLeft");
    cursor = to;
    await page.keyboard.press("Enter");
    // Stepping into the boat takes a moment, and nothing else is heard meanwhile.
    await page.waitForTimeout(120);
    await rest(page);
  };
  // The company stands in a line for the keyboard: going left to the end is the first of it, wherever the place was.
  const home = async () => {
    await page.locator("canvas").focus();
    for (let i = 0; i <= puzzle.actors.length; i++) await page.keyboard.press("ArrowLeft");
    cursor = 0;
  };
  await home();
  // One sheep alone leaves two with three wolves: a failure, told, with no window; it is taken back and play goes on.
  await board(sheep);
  await expect(launch).toBeEnabled();
  await launch.click();
  await expect(page.locator("#turn")).toContainText("실패!", { timeout: 20000 });
  await expect(page.locator("#turn")).toContainText("무르기");
  await rest(page);
  await page.waitForTimeout(1600);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await panel.locator("#pz-restart").click();
  await expect(page.locator("#turn")).toContainText("0번 건넘");
  await rest(page);
  await home();
  for (const [n, crew] of way.entries()) {
    for (const rider of crew) await board(rider);
    await launch.click();
    // The press took the keyboard to the button: give it back to the table.
    await page.locator("canvas").focus();
    await expect(page.locator(".solo-stat").first()).toContainText(String(n + 1), { timeout: 20000 });
    await rest(page);
  }
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#turn")).toContainText(`${puzzle.best}번 만에`);
  await page.waitForTimeout(1600);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await panel.locator("#pz-next").click();
  await expect(panel.locator("#pz-stage")).toHaveText("양과 늑대 · 스테이지 2");
  expect(errors).toEqual([]);
});

/** Replaces the platform's generator with a known one, and gives the same numbers to the test. */
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
/** Walks the keyboard over a board of `cols` columns: `home` goes to its first point, `go` to a point and presses it. */
function walker(page: Page, cols: number, rows: number) {
  let cursor = 0;
  return {
    home: async () => {
      await page.locator("canvas").focus();
      for (let i = 0; i <= cols; i++) await page.keyboard.press("ArrowLeft");
      for (let i = 0; i <= rows; i++) await page.keyboard.press("ArrowUp");
      cursor = 0;
    },
    go: async (to: number) => {
      const dc = (to % cols) - (cursor % cols),
        dr = Math.floor(to / cols) - Math.floor(cursor / cols);
      for (let i = 0; i < Math.abs(dc); i++) await page.keyboard.press(dc > 0 ? "ArrowRight" : "ArrowLeft");
      for (let i = 0; i < Math.abs(dr); i++) await page.keyboard.press(dr > 0 ? "ArrowDown" : "ArrowUp");
      cursor = to;
      await page.keyboard.press("Enter");
    },
  };
}
test("tower of Hanoi: discs are chosen, a move is taken back, and the tower is moved in the fewest", async ({ page }) => {
  const errors = await sit(page, "하노이의 탑");
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(6);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "원판 3개" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await rest(page);
  await expect(page.locator("#turn")).toContainText("최소 7번");
  const panel = page.locator(".puzzle-panel"),
    pegs = walker(page, 3, 0);
  let state = tower.createGame(3);
  await panel.getByRole("button", { name: "힌트", exact: true }).click();
  await expect(page.locator("#turn")).toContainText("화살표");
  await pegs.home();
  for (let n = 0; state.winner === null; n++) {
    const move = tower.hint(state)!;
    await pegs.go(move.from);
    await pegs.go(move.to);
    await expect(count(page)).toHaveText(`${n + 1}수`, { timeout: 20000 });
    await rest(page);
    if (n === 0) {
      await panel.getByRole("button", { name: "무르기", exact: true }).click();
      await expect(count(page)).toHaveText("0수");
      await pegs.home();
      await pegs.go(move.from);
      await pegs.go(move.to);
      await expect(count(page)).toHaveText("1수", { timeout: 20000 });
      await rest(page);
    }
    state = tower.play(state, move)!;
  }
  await expect(page.locator("#turn")).toContainText("7번 만에");
  await expect(page.locator("#turn")).toContainText("가장 적게");
  await page.waitForTimeout(1600);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(panel.locator("#pz-next")).toBeVisible();
  expect(errors).toEqual([]);
});
test("lights off: a board laid at random is put out in the fewest presses", async ({ page }) => {
  const random = await seeded(page, 31),
    errors = await sit(page, "불 끄기");
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(5);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "4×4" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await rest(page);
  // Boards were laid when the game was looked at and when sitting down; the third is the one chosen.
  lamps.createGame(1, random);
  lamps.createGame(1, random);
  let state = lamps.createGame(2, random);
  const way = lamps.solve(state.size, state.on)!,
    board = walker(page, 4, 4);
  await expect(page.locator("#turn")).toContainText(`최소 ${state.best}번`);
  await expect(page.locator("#turn")).toContainText(`켜진 불 ${state.on.filter(Boolean).length}개`);
  await board.home();
  for (const [n, cell] of way.entries()) {
    await board.go(cell);
    await expect(count(page)).toHaveText(`${n + 1}수`, { timeout: 20000 });
    await rest(page);
    state = lamps.play(state, { from: -1, to: cell, extra: -1 })!;
    if (state.winner === null) await expect(page.locator("#turn")).toContainText(`켜진 불 ${state.on.filter(Boolean).length}개`);
  }
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#turn")).toContainText("가장 적게");
  await page.waitForTimeout(1600);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await page.locator(".puzzle-panel #pz-next").click();
  await expect(page.locator("#pz-stage")).toHaveText("4×4 · 스테이지 2");
  expect(errors).toEqual([]);
});
test("minesweeper: the first square is safe, a flag guards a mine, and the cleared field is told in a window", async ({ page }) => {
  const random = await seeded(page, 57),
    errors = await sit(page, "지뢰찾기");
  await rest(page);
  await expect(page.locator("#turn")).toContainText("첫 칸은 안전합니다");
  const board = walker(page, 8, 8),
    first = 27;
  await board.home();
  await board.go(first);
  await expect(count(page)).toHaveText("1수");
  await rest(page);
  // The mines are laid by the first square opened, from the generator the test shares.
  let state = field.play(field.createGame(1), { from: -1, to: first, extra: -1 }, random)!;
  const safe = state.rows * state.cols - state.mines,
    mined = state.mine!.findIndex(Boolean);
  await expect(page.locator(".solo-stat").nth(1)).toContainText(`${field.opened(state)}/${safe}`);
  // Nothing of where the mines lie is written into the page.
  expect(await page.locator("main").innerHTML()).not.toMatch(/data-mine|mine=/);
  // F turns to flagging: a flag on a mine counts it off, and the square cannot then be opened.
  await page.keyboard.press("f");
  await expect(page.locator("#turn")).toContainText("깃발 꽂기");
  await expect(page.locator("#pg-tool-0")).toHaveText("깃발 끄기");
  await board.go(mined);
  await expect(page.locator(".solo-stat").first()).toContainText(String(state.mines - 1));
  await rest(page);
  await page.keyboard.press("f");
  await expect(page.locator("#pg-tool-0")).toHaveText("깃발 꽂기");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(300);
  await expect(page.locator("#turn")).not.toContainText("밟았습니다");
  // Every other safe square is opened; ground that opens by itself is skipped.
  for (let cell = 0; cell < state.open.length; cell++) {
    if (state.open[cell] || state.mine![cell]) continue;
    await board.go(cell);
    state = field.play(state, { from: -1, to: cell, extra: -1 })!;
    await expect(page.locator(".solo-stat").nth(1)).toContainText(`${field.opened(state)}/${safe}`, { timeout: 20000 });
    await rest(page);
  }
  expect(state.winner).toBe(0);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("성공!", { timeout: 20000 });
  await dialog.getByRole("button", { name: "확인" }).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  // 새 게임 offers the three fields.
  await page.locator("#restart").click();
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(3);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "어려움" }).click();
  await expect(page.locator(".solo-stat").first()).toContainText("40");
  expect(errors).toEqual([]);
});
test("fruit merge: fruit is dropped, the box can be stopped, and nothing drops while it is", async ({ page }) => {
  const errors = await sit(page, "과일 합치기"),
    drops = page.locator(".solo-stat").nth(2).locator("b"),
    // The hand needs a moment (of the box's own time, which runs slow on a busy machine) before it holds the next fruit: the key is pressed until it lets go.
    dropTo = (total: number) =>
      expect(async () => {
        await page.keyboard.press(" ");
        await expect(drops).toHaveText(String(total), { timeout: 400 });
      }).toPass({ timeout: 20000 });
  await expect(drops).toHaveText("0");
  await page.locator("canvas").focus();
  await dropTo(1);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(300);
  await page.keyboard.up("ArrowRight");
  await dropTo(2);
  // Stopped: the key drops nothing, however often it is pressed.
  await page.locator("#pg-pause").click();
  await expect(page.locator("#pg-pause")).toHaveAttribute("aria-label", "계속하기");
  await page.locator("canvas").focus();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press(" ");
    await page.waitForTimeout(300);
  }
  await expect(drops).toHaveText("2");
  await page.keyboard.press("p");
  await expect(page.locator("#pg-pause")).toHaveAttribute("aria-label", "일시정지");
  await dropTo(3);
  // A tap on the box drops too.
  const box = (await page.locator("canvas").boundingBox())!;
  await expect(async () => {
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.5);
    await expect(drops).toHaveText("4", { timeout: 400 });
  }).toPass({ timeout: 20000 });
  expect(errors).toEqual([]);
});

test("meat grill: pieces are laid, turned, eaten and wrapped; nothing happens while it is stopped; a meal may be without a clock", async ({ page }) => {
  const errors = await sit(page, "고기 굽기"),
    figure = (n: number) => page.locator(".solo-stat").nth(n).locator("b"),
    keys = async (...list: string[]) => {
      for (const key of list) await page.keyboard.press(key);
    };
  await expect(figure(1)).toHaveText("120초");
  await expect(figure(2)).toHaveText("0");
  // A tap on a plate lays nothing: a piece must be carried to the grill.
  const box = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.12, box.y + box.height * 0.5);
  await page.waitForTimeout(400);
  await page.locator("canvas").focus();
  // The keyboard stands on the first plate, then the next: a piece from each of two plates is laid.
  await keys("ArrowRight", "Enter", "ArrowRight", "Enter");
  // The clock runs.
  await expect(figure(1)).not.toHaveText("120초", { timeout: 20000 });
  // After the five plates come the seven places: every place is turned, then taken off; the two that lay there are eaten (raw, for nothing), and no more.
  await keys("ArrowRight", "ArrowRight", "ArrowRight");
  for (let slot = 0; slot < 7; slot++) await keys("ArrowRight", "Enter");
  for (let slot = 0; slot < 7; slot++) await keys("ArrowLeft", " ");
  await keys(" ");
  await expect(figure(2)).toHaveText("2");
  await expect(figure(0)).toHaveText("0");
  // Stopped: nothing is laid and the clock stands.
  await page.locator("#pg-pause").click();
  await expect(page.locator("#pg-pause")).toHaveAttribute("aria-label", "계속하기");
  const before = await count(page).innerText();
  await page.locator("canvas").focus();
  await keys("ArrowLeft", "ArrowLeft", "Enter", "Enter");
  await page.waitForTimeout(1500);
  await expect(count(page)).toHaveText(before);
  await page.keyboard.press("p");
  await expect(page.locator("#pg-pause")).toHaveAttribute("aria-label", "일시정지");
  await expect(count(page)).not.toHaveText(before, { timeout: 20000 });
  // A wrap: a leaf and a relish on the large plate, a piece from the grill onto it, and the plate eaten.
  await keys("Enter", "ArrowRight", "ArrowRight", "ArrowRight", "l", "2", "s");
  for (let i = 0; i < 6; i++) await keys("ArrowRight");
  await expect(figure(3)).toHaveText("0");
  await keys("Enter");
  await expect(figure(3)).toHaveText("1");
  await expect(figure(2)).toHaveText("2");
  // 새 게임 offers the two kinds of meal; without a clock the time counts up.
  await page.locator("#restart").click();
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(2);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "무제한" }).click();
  await expect(page.locator(".solo-stat").nth(1)).toContainText("지난 시간");
  await expect(figure(1)).toHaveText("0:00");
  await expect(figure(1)).not.toHaveText("0:00", { timeout: 20000 });
  await expect(figure(3)).toHaveText("0");
  expect(errors).toEqual([]);
});
