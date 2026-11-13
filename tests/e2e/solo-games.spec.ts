import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { FOV, cameraDistance } from "../../src/engine/camera";
import { CENTRE, HOLES, SIZE, holeAt } from "../../src/games/peg/rules";
import { W as TRAY_W, createGame as layTray, moves as trayMoves } from "../../src/games/marble/rules";
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

test("mouse maze: the mouse runs where it is sent, the arrows steer it, and it can be paused", async ({ page }) => {
  const errors = await sit(page, "생쥐 미로");
  await expect(page.locator(".solo-stat")).toHaveCount(3);
  await expect(page.locator("#turn")).toContainText("남은 목숨 3");
  // It stands until it is sent somewhere; then it picks up crumbs as it goes.
  await page.waitForTimeout(600);
  expect(await score(page)).toBe(0);
  for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight"]) {
    await page.keyboard.press(key);
    await page.waitForTimeout(500);
  }
  await expect.poll(() => score(page), { timeout: 15000 }).toBeGreaterThan(0);
  const tools = page.locator(".board-area .pg-tools");
  await expect(tools.getByRole("button", { name: "위로" })).toBeVisible();
  await tools.getByRole("button", { name: "왼쪽으로" }).click();
  // Paused, nothing moves and nothing is scored.
  await page.locator("#pg-pause").click();
  await expect(page.locator("#turn")).toContainText("일시정지");
  const held = await count(page).innerText();
  await page.waitForTimeout(1500);
  await expect(count(page)).toHaveText(held);
  await page.locator("#pg-pause").click();
  // 새 게임 shows the five mazes.
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".stage-card svg")).toHaveCount(5);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "3단계" }).click();
  await expect(page.locator("#turn")).toContainText("3/5단계", { timeout: 20000 });
  expect(errors).toEqual([]);
});

test("marble shooting: a marble is shot from the keyboard, the shot is taken back, and 새 게임 asks how many", async ({ page }) => {
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
  await rest(page);
  await expect(page.locator("#turn")).toContainText("구슬 6개");
  // One tray is laid when the game is looked at in the collection, and the one played when sitting down.
  layTray(6, random);
  const tray = layTray(6, random),
    shot = trayMoves(tray)[0],
    walk = async (from: number, to: number) => {
      const dx = (to % TRAY_W) - (from % TRAY_W),
        dy = Math.floor(to / TRAY_W) - Math.floor(from / TRAY_W);
      for (let i = 0; i < Math.abs(dx); i++) await page.keyboard.press(dx > 0 ? "ArrowRight" : "ArrowLeft");
      for (let i = 0; i < Math.abs(dy); i++) await page.keyboard.press(dy > 0 ? "ArrowDown" : "ArrowUp");
    };
  await page.locator("canvas").focus();
  // The first arrow puts the keyboard on the first hollow; from there it walks to the marble, then to the one it strikes.
  await page.keyboard.press("ArrowRight");
  await walk(0, shot.from);
  await page.keyboard.press("Enter");
  await walk(shot.from, shot.to);
  await page.keyboard.press("Enter");
  await expect(count(page)).toHaveText("1수", { timeout: 20000 });
  await rest(page);
  await expect(page.locator("#turn")).toContainText("구슬 5개");
  await page.locator(".board-controls").getByRole("button", { name: "무르기", exact: true }).click();
  await expect(page.locator("#turn")).toContainText("구슬 6개");
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await expect(page.getByRole("dialog").locator(".stage-card")).toHaveCount(5);
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "구슬 10개" }).click();
  await expect(page.locator("#turn")).toContainText("구슬 10개", { timeout: 20000 });
  expect(errors).toEqual([]);
});

test("warehouse keeper: the keeper walks by key and by button, a step is taken back, and 새 게임 asks how many crates", async ({ page }) => {
  const errors = await sit(page, "창고지기");
  await expect(page.locator("#turn")).toContainText("상자 3개");
  // One of the four ways is always open at the start of a warehouse that can be solved.
  for (const key of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) {
    await page.keyboard.press(key);
    await rest(page);
  }
  await expect(count(page)).not.toHaveText("0수");
  const steps = Number.parseInt(await count(page).innerText());
  await page.locator(".board-controls").getByRole("button", { name: "무르기", exact: true }).click();
  await expect(count(page)).toHaveText(`${steps - 1}수`);
  // The arrow buttons stand at the lower left; whichever is open takes a step.
  const tools = page.locator(".board-area .pg-tools");
  for (const name of ["위로", "왼쪽으로", "아래로", "오른쪽으로"]) {
    const button = tools.getByRole("button", { name });
    if (await button.isEnabled()) {
      await button.click();
      break;
    }
  }
  await expect(count(page)).toHaveText(`${steps}수`);
  await page.getByRole("button", { name: "새 게임", exact: true }).click();
  await page.getByRole("dialog").locator(".stage-card").filter({ hasText: "상자 5개" }).click();
  await expect(page.locator("#turn")).toContainText("상자 5개", { timeout: 20000 });
  await expect(count(page)).toHaveText("0수");
  expect(errors).toEqual([]);
});
