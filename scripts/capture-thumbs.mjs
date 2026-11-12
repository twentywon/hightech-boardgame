// Captures the table of every game (the canvas alone, without captions,
// buttons or panels) for the collection's thumbnails.
//
//   npm run build && npx vite preview --port 4175 &
//   node scripts/capture-thumbs.mjs <output directory>
//
// The PNGs are then reduced to WebP under src/assets/thumbs/ (see README).
import { createRequire } from "module";
import { games } from "../src/core/catalog.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const out = process.argv[2] ?? ".";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 });
const wait = (ms) => page.waitForTimeout(ms);
const keys = async (list, pause = 110) => {
  await page.locator("canvas").focus();
  for (const key of list) {
    await page.keyboard.press(key);
    await wait(pause);
  }
};
const press = async (selector) => {
  const button = page.locator(selector).first();
  // A button may vanish between the check and the click; that is not an error here.
  if ((await button.isVisible()) && (await button.isEnabled())) await button.click({ timeout: 800 }).catch(() => {});
};
/** A few moves so that the table shows a game under way. */
const play = {
  gomoku: async () => {
    for (const walk of [["Enter"], ["ArrowRight", "Enter"], ["ArrowUp", "Enter"], ["ArrowLeft", "ArrowLeft", "Enter"], ["ArrowDown", "ArrowDown", "Enter"], ["ArrowRight", "ArrowRight", "ArrowRight", "Enter"]]) {
      await keys(walk);
      await wait(700);
    }
  },
  blackjack: async () => {
    await press("#bj-add-100");
    await press("#bj-deal");
    await wait(3000);
  },
  "yacht-dice": async () => {
    await press("#yd-roll");
    await wait(2200);
  },
  seotda: async () => {
    await press("#bg-deal");
    await wait(2500);
  },
  "seven-poker": async () => {
    await press("#bg-deal");
    await wait(3000);
    await press("#bg-prompt button");
    for (let i = 0; i < 10; i++) {
      await wait(1200);
      await press("#bg-call");
    }
  },
  "yut-nori": async () => {
    for (let i = 0; i < 12; i++) {
      await press("#yut-throw");
      await press("#yut-moves button");
      await wait(1300);
    }
  },
  "nine-men's-morris": async () => {
    for (let i = 0; i < 5; i++) {
      await keys(["ArrowRight", "Enter", "ArrowDown", "Enter", "ArrowRight", "Enter"]);
      await wait(1300);
    }
  },
  "dots-and-boxes": async () => {
    for (let i = 0; i < 6; i++) {
      await keys(["ArrowRight", "Enter", "ArrowDown", "Enter", "ArrowRight", "Enter"]);
      await wait(1300);
    }
  },
  hex: async () => {
    for (let i = 0; i < 6; i++) {
      await keys(["ArrowRight", "Enter", "ArrowDown", "Enter", "ArrowRight", "Enter"]);
      await wait(1300);
    }
  },
  "snakes-and-ladders": async () => {
    for (let i = 0; i < 8; i++) {
      await press("#pg-action");
      await wait(2600);
    }
  },
  spider: async () => {
    for (let i = 0; i < 3; i++) {
      await press("#sp-deal");
      await wait(1100);
    }
  },
  mancala: async () => {
    for (let i = 0; i < 3; i++) {
      await keys(["ArrowRight", "Enter"]);
      await wait(4500);
    }
  },
  battleship: async () => {
    await press("#pg-tool-1");
    await wait(600);
    for (const walk of [["ArrowRight", "Enter"], ["ArrowDown", "ArrowRight", "Enter"], ["ArrowLeft", "ArrowLeft", "ArrowUp", "Enter"], ["ArrowDown", "ArrowDown", "Enter"], ["ArrowRight", "ArrowRight", "ArrowRight", "Enter"], ["ArrowUp", "ArrowUp", "ArrowUp", "Enter"]]) {
      await keys(walk);
      await wait(2200);
    }
  },
  "four-in-a-row": async () => {
    for (const walk of [["ArrowRight", "ArrowLeft", "Enter"], ["ArrowLeft", "Enter"], ["ArrowRight", "ArrowRight", "Enter"], ["Enter"], ["ArrowLeft", "ArrowLeft", "ArrowLeft", "Enter"]]) {
      await keys(walk);
      await wait(2400);
    }
  },
  "twist-five": async () => {
    for (const walk of [["ArrowRight", "Enter", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Enter"], ["ArrowLeft", "ArrowLeft", "ArrowDown", "Enter", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "Enter"], ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowUp", "Enter", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Enter"]]) {
      await keys(walk);
      await wait(3200);
    }
  },
  "hare-and-hounds": async () => {
    for (const walk of [["ArrowRight", "ArrowLeft", "Enter", "ArrowRight", "Enter"], ["ArrowUp", "Enter", "ArrowRight", "Enter"]]) {
      await keys(walk);
      await wait(2600);
    }
  },
  "world-tour": async () => {
    for (let i = 0; i < 160; i++) {
      // Short of money, the offer is passed over rather than paid for by selling.
      await press("dialog:has(.tour-short) .dialog-actions button");
      await press("dialog .primary");
      await press("#tour-key");
      await press("#tour-yes");
      await press("#tour-end");
      await press("#tour-roll");
      await wait(450);
    }
    for (let i = 0; i < 6; i++) {
      await press("dialog:has(.tour-short) .dialog-actions button");
      await press("dialog .primary");
      await wait(900);
    }
    // No window may be left over the table.
    await page.evaluate(() => document.querySelectorAll("dialog").forEach((d) => d.remove()));
    await wait(600);
  },
};
const only = process.argv[3];
for (const game of games) {
  if (only && game.en.toLowerCase().replaceAll(" ", "-") !== only) continue;
  const id = game.en.toLowerCase().replaceAll(" ", "-");
  await page.goto("http://localhost:4175/");
  await page.getByRole("button", { name: `${game.name} 살펴보기`, exact: true }).click();
  await page.locator(".game-stage button.primary").first().click();
  await page.locator("canvas").waitFor();
  await wait(1800);
  await play[id]?.();
  await wait(800);
  // No selection rings or cursor: the screens leave them out while this flag is set.
  await page.evaluate(() => {
    document.documentElement.dataset.capture = "1";
    document.activeElement?.blur?.();
  });
  await page.locator("h1").first().click();
  await wait(400);
  // Only the table: captions, the status line and buttons over it are hidden.
  await page.addStyleTag({ content: ".board-label, .board-bottom, .board-hint, .bg-acting { display: none !important; }" });
  await wait(200);
  await page.locator("canvas").screenshot({ path: `${out}/${id}.png` });
  console.log(id);
}
await browser.close();
