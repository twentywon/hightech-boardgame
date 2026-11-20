import { test, expect, type Page } from "@playwright/test";
import { PerspectiveCamera, Vector3 } from "three";
import { selectGame } from "./library";
import { FOV, cameraDistance } from "../../src/engine/camera";
import * as rules from "../../src/games/laser/rules";
import { CARRY, cellAt, gripAt, laserSubject, trayPlaces } from "../../src/games/laser/layout";

const settled = (page: Page) => expect(page.locator("#board")).toHaveAttribute("data-animating", "false", { timeout: 30000 });
const moves = (page: Page) => page.locator("#move-count");
const { CELLS, GO } = rules;

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
/** Enters the game through its stage window and sits down at a stage by its card. */
async function sit(page: Page, stage: number) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await selectGame(page, "레이저 반사 퍼즐");
  const dialog = page.getByRole("dialog");
  // The window it is entered through is its stage window, with its 게임 방법.
  await expect(dialog.locator(".stage-card")).toHaveCount(rules.STAGES.length);
  await expect(dialog.getByRole("button", { name: "게임 방법" })).toBeVisible();
  await dialog.locator(".stage-card").nth(stage - 1).click();
  await expect(page.locator("dialog[open]")).toHaveCount(0);
  await expect(page.locator("canvas")).toHaveAttribute("data-ready", "true", { timeout: 20000 });
  await settled(page);
  return errors;
}
/** The bench as its camera shows it, and the hand's gestures on it. */
async function bench(page: Page, mobile: boolean) {
  const box = (await page.locator("#board canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = laserSubject(aspect),
    distance = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 120);
  camera.position.set(0, Math.sin(subject.tilt) * distance, Math.cos(subject.tilt) * distance);
  camera.lookAt(0, subject.lookY, 0);
  camera.updateMatrixWorld();
  const screen = (x: number, y: number, z: number) => {
    const v = new Vector3(x, y, z).project(camera);
    return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
  };
  const tap = async (p: { x: number; y: number }) => {
    if (mobile) await page.touchscreen.tap(p.x, p.y);
    else await page.mouse.click(p.x, p.y);
  };
  const drag = async (a: { x: number; y: number }, b: { x: number; y: number }) => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 4 });
    await page.mouse.up();
  };
  /** Where a hand takes a piece on the board, or tray piece j in the tray. */
  const onBoard = (kind: rules.Kind, cell: number) => {
    const g = gripAt(kind, cellAt(cell, aspect), false);
    return screen(g.x, g.y, g.z);
  };
  const inTray = (state: rules.State, j: number) => {
    const g = gripAt(state.tray[j].kind, trayPlaces(state.tray.length, aspect)[j], true);
    return screen(g.x, g.y, g.z);
  };
  /** A carried piece hovers over the cell it is let go above. */
  const over = (cell: number) => {
    const c = cellAt(cell, aspect);
    return screen(c.x, CARRY, c.z);
  };
  return {
    /** Drags tray piece j onto `cell`. */
    put: (state: rules.State, j: number, cell: number) => drag(inTray(state, j), over(cell)),
    /** Drags placed tray piece j back over its place in the tray (off the board). */
    away: (state: rules.State, j: number) => {
      const p = trayPlaces(state.tray.length, aspect)[j];
      return drag(onBoard(state.tray[j].kind, state.tray[j].at), screen(p.x, CARRY, p.z));
    },
    /** Taps the piece on `cell` (it turns; the laser fires). */
    tap: (kind: rules.Kind, cell: number) => tap(onBoard(kind, cell)),
  };
}
const counted = async (page: Page, made: number) => {
  await expect(moves(page)).toHaveText(`${made}수`, { timeout: 30000 });
  await settled(page);
};

test("laser reflection: the tray's pieces are dragged to their mounts, turned by taps, and the laser fired lights the targets", async ({ page }, info) => {
  test.setTimeout(180000);
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 86),
    errors = await sit(page, 3);
  // A puzzle was laid as the screen was set up; the card pressed in the window lays the third stage's, the one chosen.
  rules.createGame(1, random);
  let state = rules.createGame(3, random);
  expect(state.need).toBe(2);
  const hand = await bench(page, mobile);
  let made = 0;
  /** Taps the piece on `cell` until it stands turned to `dir`. */
  const turnTo = async (cell: number, dir: number) => {
    const piece = [...state.given, ...state.tray].find((p) => p.at === cell)!;
    while (rules.norm(piece.kind, [...state.given, ...state.tray].find((p) => p.at === cell)!.dir) !== dir) {
      await hand.tap(piece.kind, cell);
      state = rules.play(state, { from: cell, to: cell, extra: -1 })!;
      await counted(page, ++made);
    }
  };
  for (let guard = 0; guard < 4 * CELLS; guard++) {
    const move = rules.hint(state)!;
    if (move.to === GO) break;
    const cell = Math.floor((move.to - rules.PUT) / 4),
      dir = (move.to - rules.PUT) % 4;
    if (move.from >= CELLS) {
      // From the tray, dragged to its mount.
      const j = move.from - CELLS;
      await hand.put(state, j, cell);
      state = rules.play(state, { from: move.from, to: cell, extra: -1 })!;
      await counted(page, ++made);
    } else expect(move.from).toBe(cell);
    await turnTo(cell, dir);
  }
  expect(state.tray.every((p) => p.at >= 0)).toBe(true);
  expect(rules.hint(state)).toEqual({ from: -1, to: GO, extra: -1 });
  // A tap on the laser fires it: the beam lights both targets.
  await hand.tap("laser", state.given[0].at);
  await counted(page, ++made);
  await expect(page.locator("#turn")).toContainText("성공!");
  await expect(page.locator("#board canvas")).toHaveAttribute("data-fired", "true");
  await expect(page.locator("#board canvas")).toHaveAttribute("data-lit", String(state.need));
  await expect(page.locator("#pz-next")).toBeVisible();
  expect(errors).toEqual([]);
});

test("laser reflection: a refused place, a piece back to the tray, a firing that only shows the beam, and undo", async ({ page }, info) => {
  test.setTimeout(150000);
  const mobile = info.project.name === "mobile",
    random = await seeded(page, 87),
    errors = await sit(page, 2);
  rules.createGame(1, random);
  let state = rules.createGame(2, random);
  const hand = await bench(page, mobile),
    laser = state.given[0];
  // Onto the laser's mount: refused, the reason in the status line, nothing made.
  await hand.put(state, 0, laser.at);
  await settled(page);
  await expect(page.locator("#turn")).toContainText("이미 부품이 놓인 자리입니다.");
  await expect(moves(page)).toHaveText("0수");
  // The piece glides back to the tray (the table takes no press meanwhile).
  await page.waitForTimeout(500);
  // A given piece whose turn is fixed says so when tapped.
  const fixed = state.given.find((p, g) => g > 0 && p.locked && p.kind !== "blocker");
  if (fixed) {
    await hand.tap(fixed.kind, fixed.at);
    await settled(page);
    await expect(page.locator("#turn")).toContainText("방향이 정해진 부품이라 돌릴 수 없습니다.");
    await expect(moves(page)).toHaveText("0수");
  }
  // Set on a free mount, then dragged off the board: back in the tray.
  const occupied = rules.occupancy(state),
    free = [24, 23, 22, 21, 20, 19, 18, 17, 16, 15].find((c) => occupied[c] < 0)!;
  await hand.put(state, 0, free);
  state = rules.play(state, { from: CELLS, to: free, extra: -1 })!;
  await counted(page, 1);
  await hand.away(state, 0);
  state = rules.play(state, { from: free, to: CELLS, extra: -1 })!;
  await counted(page, 2);
  expect(state.tray[0].at).toBe(-1);
  // Fired with the tray still full: no failure, the beam is shown and the status line says what it lit.
  await hand.tap("laser", laser.at);
  await counted(page, 3);
  await expect(page.locator("#board canvas")).toHaveAttribute("data-fired", "true");
  await expect(page.locator("#turn")).toContainText("쟁반에 아직 부품이 남아 있습니다.");
  await expect(page.locator("#turn")).not.toContainText("실패");
  // A shot that does not solve it begins the bench again by itself after a moment, and the beam goes.
  await expect(moves(page)).toHaveText("0수", { timeout: 20000 });
  await expect(page.locator("#pg-note")).toContainText("처음부터 다시 시작했습니다");
  await expect(page.locator("#board canvas")).toHaveAttribute("data-fired", "false");
  expect(errors).toEqual([]);
});
