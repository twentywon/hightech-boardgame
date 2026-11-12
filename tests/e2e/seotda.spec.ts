import { test, expect } from "@playwright/test";
import { selectGame } from "./library";
import { PerspectiveCamera, Vector3 } from "three";
import {
  button,
  handOver,
  loadShuffles,
  myTurn,
  playOut,
  prompt,
  seat,
  settled,
  sit,
  turn,
} from "./betting-helpers";
import { FOV, SUBJECTS, cameraDistance } from "../../src/engine/camera";
import { stackValues } from "../card-fixtures";
import { createDeck } from "../../src/games/seotda/rules";
import { cardText } from "../../src/games/seotda/game";

/** One shuffle that deals `order`: every seat's first card, then the second cards. */
const deal = (order: string[]) => stackValues(createDeck(), cardText, order);

test("seotda opens inline; a hand is dealt, bet and shown down with hidden cards kept hidden", async ({
  page,
}, info) => {
  const errors: string[] = [],
    foreign: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("request", (r) => {
    if (!/^(http:\/\/127\.0\.0\.1:4174|data:|blob:)/.test(r.url())) foreign.push(r.url());
  });
  // Hand 1: I hold 38광땡, the computer 장땡. Hand 2: I hold 망통, the computer 9땡.
  await loadShuffles(page, [...deal(["3광", "10열", "8광", "10"]), ...deal(["9열", "2열", "9", "8열"])]);
  await page.goto("/");
  const card = page.getByRole("button", { name: "섯다 살펴보기", exact: true });
  await expect(card).toHaveAttribute("aria-expanded", "false");
  const url = page.url();
  await card.click();
  await expect(page.getByRole("region", { name: "섯다 대국 설정" })).toBeVisible();
  await expect(page.getByRole("img", { name: "섯다 테이블 미리보기" })).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(page.url()).toBe(url);
  await page.getByLabel("상대 수").selectOption("1");
  await page.screenshot({ path: `test-results/${info.project.name}-seotda-setup.png`, fullPage: true });
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  await expect(page.locator("#bg-chips")).toHaveText("1,000");
  await expect(page.locator("#move-count")).toHaveText("0판");
  await expect(button(page, "체크")).toBeHidden();
  // A double click deals once and takes one ante from each seat.
  await button(page, "패 받기").dblclick();
  await settled(page);
  await myTurn(page);
  await expect(page.locator("#move-count")).toHaveText("1판");
  await expect(page.locator("#bg-chips")).toHaveText("990");
  await expect(page.locator("#bg-pot")).toHaveText("20");
  await expect(seat(page, 0)).toContainText("3광");
  await expect(seat(page, 0)).toContainText("38광땡");
  await expect(seat(page, 0)).toHaveAttribute("aria-current", "true");
  // The other hand is described only as hidden, anywhere in the page.
  await expect(seat(page, 1).locator(".bj-card.hidden")).toHaveCount(2);
  const html = await page.content();
  expect(html).not.toContain("장땡");
  expect(html).not.toContain("10열");
  await page.screenshot({ path: `test-results/${info.project.name}-seotda-turn.png`, fullPage: true });
  // Raise with the keyboard; the computer answers by itself.
  await expect(button(page, "하프 (10)")).toBeEnabled();
  await button(page, "하프 (10)").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#bg-chips")).toHaveText("980");
  // Whatever it answers, keep calling until the hand ends.
  await playOut(page);
  const total = async () =>
    Number((await page.locator("#bg-chips").textContent())!.replace(/,/g, "")) +
    Number((await seat(page, 1).locator(".bg-stack").textContent())!.match(/칩 ([\d,]+)/)![1].replace(/,/g, ""));
  expect(await total()).toBe(2000);
  expect(Number((await page.locator("#bg-chips").textContent())!.replace(/,/g, ""))).toBeGreaterThan(1000);
  await expect(page.locator("#bg-outcome")).toContainText("나");
  await page.screenshot({ path: `test-results/${info.project.name}-seotda-result.png`, fullPage: true });
  // Next hand: fold a hopeless hand; the computer's cards stay hidden.
  await button(page, "다음 판").click();
  await settled(page);
  await expect(page.locator("#move-count")).toHaveText("2판");
  await playOut(page, "fold");
  await expect(seat(page, 0)).toContainText("다이");
  await expect(page.locator("#bg-outcome")).toContainText("나 · 다이");
  expect(await page.content()).not.toContain("9땡");
  expect(await total()).toBe(2000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Nothing is stored; a reload starts over.
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => /seotda|bg-|poker/i.test(k)))).toEqual([]);
  await page.reload();
  await expect(page.locator(".featured")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(foreign).toEqual([]);
});

test("seotda with three computers: the table plays on without me, and leaving drops it", async ({
  page,
}) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await sit(page, "섯다", 3);
  // The computer seats have one fixed strength: no level is offered.
  await expect(page.getByLabel("AI 난이도")).toHaveCount(0);
  await expect(page.locator("#bg-seats li")).toHaveCount(4);
  await button(page, "패 받기").click();
  await settled(page);
  await expect(page.locator("#bg-pot")).toHaveText("40");
  // Fold as soon as it is my turn; the computers finish the hand among themselves.
  await myTurn(page);
  await button(page, "다이").click();
  await expect(button(page, "다이")).toBeDisabled();
  await handOver(page);
  const stacks = await page.locator("#bg-seats .bg-stack").allTextContents();
  const sum = stacks.reduce((n, t) => n + Number(t.match(/칩 ([\d,]+)/)![1].replace(/,/g, "")), 0);
  // After a replay the pot is still on the table.
  const kept = (await page.locator("#bg-deal").textContent()) === "재경기"
    ? Number((await page.locator("#bg-pot").textContent())!.replace(/,/g, ""))
    : 0;
  expect(sum + kept).toBe(4000);
  // Deal again and leave while the computers are still acting.
  await page.locator("#bg-deal").click();
  await button(page, "World Table Games 홈").click();
  await expect(page.locator("canvas")).toHaveCount(0);
  await page.waitForTimeout(2500);
  await selectGame(page, "블랙잭");
  await button(page, /테이블에 앉기/).click();
  await expect(page.locator("#bj-chips")).toHaveText("1,000");
  await button(page, "World Table Games 홈").click();
  // The choices are remembered for this page; the session is new.
  await selectGame(page, "섯다");
  await expect(page.getByLabel("상대 수")).toHaveValue("3");
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  await expect(page.locator("#bg-chips")).toHaveText("1,000");
  await expect(page.locator("#move-count")).toHaveText("0판");
  // A new session in the middle of a hand discards it.
  await button(page, "패 받기").click();
  await settled(page);
  await page.locator(".side-setup").getByRole("button", { name: "새 게임 시작" }).click();
  await settled(page);
  await expect(page.locator("#bg-chips")).toHaveText("1,000");
  await expect(page.locator("#bg-pot")).toHaveText("0");
  await expect(turn(page)).toContainText("덱이나 패 받기 버튼을 눌러 시작하세요");
  expect(errors).toEqual([]);
});

test("seotda dialogs wait their turn and the table fits every screen shape", async ({ page }, info) => {
  await loadShuffles(page, deal(["1광", "5", "2", "6"]));
  await sit(page, "섯다", 1);
  await button(page, "패 받기").click();
  await settled(page);
  await myTurn(page);
  await button(page, "게임 방법").click();
  await expect(page.getByRole("dialog")).toContainText("땡잡이");
  await expect(page.locator("dialog")).toHaveCount(1);
  await page.getByRole("dialog").getByRole("button", { name: "확인" }).click();
  await expect(button(page, "체크")).toBeEnabled();
  const shapes =
    info.project.name === "mobile"
      ? [{ width: 915, height: 412 }, { width: 740, height: 360 }] // phones play in landscape only
      : [{ width: 900, height: 620 }, { width: 700, height: 1000 }, { width: 1440, height: 1000 }];
  for (const size of shapes) {
    await page.setViewportSize(size);
    await settled(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(async () => {
      const canvas = (await page.locator("canvas").boundingBox())!;
      expect(canvas.width).toBeGreaterThan(200);
      expect(canvas.height).toBeGreaterThan(150);
      expect(canvas.x).toBeGreaterThanOrEqual(0);
      expect(canvas.x + canvas.width).toBeLessThanOrEqual(size.width + 1);
      expect(canvas.y + canvas.height).toBeLessThanOrEqual(size.height + 1);
    }).toPass({ timeout: 5000 });
    const call = page.locator("#bg-call");
    await call.scrollIntoViewIfNeeded();
    const box = (await call.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(size.width + 1);
    await expect(seat(page, 0)).toContainText("알리");
    await page.screenshot({ path: `test-results/${info.project.name}-seotda-${size.width}x${size.height}.png` });
  }
});

/** Screen position of a spot on the table of the compact card layout. */
async function onTable(page: import("@playwright/test").Page, x: number, z: number) {
  const box = (await page.locator("canvas").boundingBox())!,
    aspect = box.width / box.height,
    subject = aspect < 1.25 ? SUBJECTS.cardsCompactSquare : SUBJECTS.cardsCompact,
    d = cameraDistance(aspect, false, subject),
    camera = new PerspectiveCamera(FOV, aspect, 0.1, 80);
  camera.position.set(0, Math.sin(subject.tilt) * d, Math.cos(subject.tilt) * d);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const v = new Vector3(x, 0.03, z).project(camera);
  return { x: box.x + ((v.x + 1) * box.width) / 2, y: box.y + ((1 - v.y) * box.height) / 2 };
}

test("three-card seotda: show one, bet, uncover the third by sliding, bet again, pick two last", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // I hold 3광 8광 and draw 10; the computer holds 1 and 2 and draws 4.
  await loadShuffles(page, deal(["3광", "1", "8광", "2", "10", "4"]));
  await page.goto("/");
  await selectGame(page, "섯다");
  await expect(page.getByLabel("방식")).toHaveValue("two");
  await page.getByLabel("방식").selectOption("three");
  await page.getByLabel("상대 수").selectOption("1");
  await button(page, /테이블에 앉기/).click();
  await settled(page);
  const desktop = info.project.name !== "mobile",
    tap = async (x: number, z: number) => {
      const at = await onTable(page, x, z);
      await page.mouse.click(at.x, at.y);
    };
  if (desktop) {
    // The deck on the table deals as the button does (it lies at one of two spots).
    await page.locator("canvas").scrollIntoViewIfNeeded();
    await tap(3.4, 0.1);
    await tap(2.5, 0.1);
  } else await button(page, "패 받기").click();
  await expect(page.locator("#bg-between")).toBeHidden();
  await settled(page);
  // Two cards: choose the one the table may see.
  await expect(turn(page)).toContainText("상대에게 공개할 패를 고르세요");
  await expect(prompt(page)).toHaveText(["3광 공개", "8광 공개"]);
  await expect(page.locator("#bg-call")).toBeHidden();
  // On the table, the second of my two cards is the 8광.
  if (desktop) await tap(0.4725, 1.85);
  else await button(page, "8광 공개").click();
  await myTurn(page);
  await expect(turn(page)).toContainText("첫 베팅");
  await expect(seat(page, 0).locator(".bj-card.secret")).toHaveText(["3광"]);
  // The computer shows one card and hides the other.
  await expect(seat(page, 1).locator(".bj-card:not(.hidden)")).toHaveCount(1);
  await expect(seat(page, 1).locator(".bj-card.hidden")).toHaveCount(1);
  // Check or call until the third card arrives under its cover.
  await expect(async () => {
    const call = page.locator("#bg-call");
    if ((await call.isVisible()) && (await call.isEnabled())) await call.click({ timeout: 1000 });
    await expect(page.locator("#bg-peek")).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 60000 });
  await settled(page);
  await expect(turn(page)).toContainText("세 번째 패를 아래로 밀어 확인하세요");
  await expect(seat(page, 0).locator(".bj-card.hidden")).toHaveText(["확인 전"]);
  await expect(prompt(page)).toHaveCount(0);
  await expect(page.locator("#bg-call")).toBeHidden();
  await page.screenshot({ path: `test-results/${info.project.name}-seotda-covered.png`, fullPage: true });
  if (info.project.name === "mobile") await button(page, "세 번째 패 확인").click();
  else {
    // The third card lies to the right of my two. A short slide springs back …
    await page.locator("canvas").scrollIntoViewIfNeeded();
    const from = await onTable(page, 0.945, 1.85),
      near = await onTable(page, 0.945, 2.2),
      far = await onTable(page, 0.945, 3.1);
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(near.x, near.y, { steps: 5 });
    await page.mouse.up();
    await settled(page);
    await expect(page.locator("#bg-peek")).toBeVisible();
    await expect(seat(page, 0).locator(".bj-card.hidden")).toHaveCount(1);
    // … and a long slide down uncovers the card.
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(far.x, far.y, { steps: 8 });
    await page.mouse.up();
  }
  await expect(page.locator("#bg-peek")).toBeHidden();
  await expect(seat(page, 0).locator(".bj-card")).toHaveText(["3광", "8광", "10"]);
  // The second round is bet on three cards, with my best hand named at my seat.
  await expect(prompt(page)).toHaveCount(0);
  await expect(seat(page, 0)).toContainText("38광땡");
  await expect(turn(page)).toContainText(/세 번째 패 베팅|차례/);
  await expect(async () => {
    const call = page.locator("#bg-call");
    if ((await call.isVisible()) && (await call.isEnabled())) await call.click({ timeout: 1000 });
    await expect(prompt(page)).toHaveCount(3, { timeout: 1000 });
  }).toPass({ timeout: 60000 });
  // Only now, after the last bet, pick the two that make the hand.
  await expect(turn(page)).toContainText("족보로 쓸 두 장을 고르세요");
  await expect(prompt(page)).toHaveText(["3광 · 8광 — 38광땡", "3광 · 10 — 3끗", "8광 · 10 — 8끗"]);
  await page.screenshot({ path: `test-results/${info.project.name}-seotda-pick.png`, fullPage: true });
  if (desktop) {
    // Tapping two cards on the table takes the pair they make.
    await settled(page);
    await tap(-0.945, 1.85);
    await expect(page.locator("#board")).toHaveAttribute("data-picked", "1");
    await expect(prompt(page)).toHaveCount(3);
    await settled(page);
    await tap(0, 1.55);
  } else await button(page, "3광 · 8광 — 38광땡").click();
  // The pick ends the hand: the cards are shown at once.
  await handOver(page);
  expect(Number((await page.locator("#bg-chips").textContent())!.replace(/,/g, ""))).toBeGreaterThan(1000);
  await expect(page.locator("#bg-outcome")).toContainText("나");
  await expect(page.locator("#bg-pot")).toHaveText("0");
  expect(errors).toEqual([]);
});
