// Captures the table of every game (the canvas alone, without captions,
// buttons or panels) for the collection's thumbnails.
//
//   npm run build && npx vite preview --port 4175 &
//   node scripts/capture-thumbs.mjs <output directory>
//
// The PNGs are then reduced to WebP under src/assets/thumbs/ (see README).
import { createRequire } from "module";
import { games } from "../src/core/catalog.ts";
import { atTheWheel, driver } from "../tests/valet-driver.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const out = process.argv[2] ?? ".";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
// THUMB_WIDTH widens the window for a table beside a wide side panel (a puzzle's), so that the canvas itself is 4:3.
const page = await browser.newPage({ viewport: { width: Number(process.env.THUMB_WIDTH) || 1280, height: 1000 }, deviceScaleFactor: 2 });
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
/**
 * A puzzle for one is entered through its stage window: a card sits down at that stage, and with none given the
 * window's start sits down at the stage laid.
 */
const stage = async (n) => {
  await (n === undefined ? page.locator("dialog[open] [data-entry-action]") : page.locator("dialog[open] .stage-card").nth(n)).click();
  await page.locator("canvas").waitFor();
  await wait(1800);
};
/** A few moves so that the table shows a game under way. */
const play = {
  gomoku: async () => {
    for (const walk of [["Enter"], ["ArrowRight", "Enter"], ["ArrowUp", "Enter"], ["ArrowLeft", "ArrowLeft", "Enter"], ["ArrowDown", "ArrowDown", "Enter"], ["ArrowRight", "ArrowRight", "ArrowRight", "Enter"]]) {
      await keys(walk);
      await wait(700);
    }
  },
  // A few discs turned, so that the table shows a game under way (each Enter plays the first legal square).
  reversi: async () => {
    for (let i = 0; i < 4; i++) {
      await keys(["Enter"]);
      await wait(1400);
    }
  },
  blackjack: async () => {
    await press("#bj-add-100");
    // The stake's chip slides in first; the deal button may wait for it.
    await wait(900);
    await page.locator("#bj-deal").first().click({ timeout: 5000 }).catch(() => {});
    await wait(3500);
  },
  "yacht-dice": async () => {
    await press("#yd-roll");
    await wait(2200);
  },
  // The deal button is a pixel (a tap on the deck deals), so it is pressed from the page.
  seotda: async () => {
    await page.evaluate(() => document.querySelector("#bg-deal")?.click());
    await wait(3500);
  },
  "seven-poker": async () => {
    await page.evaluate(() => document.querySelector("#bg-deal")?.click());
    await wait(3500);
    // The card to show is tapped on the table, so its button is a pixel too.
    await page.evaluate(() => document.querySelector("#bg-prompt button")?.click());
    for (let i = 0; i < 10; i++) {
      await wait(1200);
      await press("#bg-call");
    }
  },
  // The deal button is a pixel (a tap on the deck deals), so it is pressed from the page; a few calls bring out
  // the flop and more.
  "texas-holdem": async () => {
    await page.evaluate(() => document.querySelector("#bg-deal")?.click());
    for (let i = 0; i < 30; i++) {
      await wait(1000);
      const flop = (await page.locator("#bg-board .bj-card").count()) >= 3;
      if (flop && (await page.locator("#board").getAttribute("data-animating")) === "false") break;
      if (!flop) await press("#bg-call");
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
      // A climb or a ride down a snake takes up to about three and a half seconds.
      await wait(4000);
    }
  },
  spider: async () => {
    for (let i = 0; i < 3; i++) {
      await press("#sp-deal");
      // A row is flicked out one column after another: let it land before the next.
      await wait(1400);
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
  "number-baseball": async () => {
    for (const walk of [["ArrowRight", "ArrowRight", "Enter"], ["ArrowRight", "ArrowRight", "Enter"], ["ArrowRight", "ArrowRight", "Enter"], Array(6).fill("ArrowRight").concat("Enter"), Array(9).fill("ArrowLeft").concat("Enter"), ["ArrowRight", "Enter"], ["ArrowRight", "Enter"], Array(9).fill("ArrowRight").concat("Enter"), Array(8).fill("ArrowLeft").concat("Enter"), ["ArrowRight", "ArrowRight", "Enter"], ["ArrowRight", "ArrowRight", "Enter"], Array(6).fill("ArrowRight").concat("Enter")]) {
      await keys(walk, 60);
      await wait(700);
      // A throw is lit on the scoreboard digit by digit, and the computer's answer after it: let both come on.
      if (walk.length > 4)
        for (let k = 0; k < 2; k++) {
          await page.waitForFunction(() => document.querySelector("#board")?.dataset.animating === "false", null, { timeout: 10000 }).catch(() => {});
          await wait(900);
        }
    }
    await wait(1500);
  },
  "wall-race": async () => {
    for (const walk of [["ArrowUp", "ArrowUp", "ArrowUp", "Enter"], ["ArrowUp", "ArrowUp", "Enter"], ["ArrowLeft", "Enter"], ["ArrowUp", "Enter"]]) {
      await keys(walk);
      await wait(2200);
    }
  },
  dominoes: async () => {
    for (let i = 0; i < 5; i++) {
      await keys(["ArrowRight", "ArrowLeft", "Enter"]);
      await wait(600);
      await keys(["ArrowUp", "Enter"]);
      await press("#pg-tool-0");
      await wait(2200);
    }
  },
  alkkagi: async () => {
    await press("#pg-tool-0");
    await wait(6500);
  },
  "tile-rummy": async () => {
    for (let i = 0; i < 9; i++) {
      await press("#pg-tool-1");
      await wait(3200);
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
  ludo: async () => {
    for (let i = 0; i < 40; i++) {
      await press("#pg-tool-0");
      await wait(900);
    }
  },
  "indian-poker": async () => {
    // The cards are raised before the picture is taken.
    await wait(600);
    await page.evaluate(() => [...document.querySelectorAll(".pg-tools button")].find((b) => b.textContent.includes("이마에 얹기"))?.click());
    await wait(1800);
  },
  "go-stop": async () => {
    // A few cards played, so that something has been taken on both sides.
    for (let i = 0; i < 4; i++) {
      await keys(["ArrowRight", "Enter"]);
      await wait(3200);
    }
  },
  "table-soccer": async () => {
    await wait(2600);
  },
  "falling-blocks": async () => {
    await keys(["ArrowLeft", "ArrowLeft", "ArrowLeft", " ", "ArrowRight", "ArrowRight", "ArrowUp", " ", "ArrowUp", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", " ", "ArrowLeft", " ", "ArrowUp"], 90);
    await wait(900);
  },
  2048: async () => {
    await keys(["ArrowLeft", "ArrowDown", "ArrowLeft", "ArrowDown", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowDown", "ArrowLeft", "ArrowDown", "ArrowRight", "ArrowDown", "ArrowLeft", "ArrowDown"], 330);
  },
  // Sat down at the stage laid (the whole board).
  "peg-solitaire": async () => {
    await stage();
  },
  "tower-of-hanoi": async () => {
    await stage(2);
    await wait(500);
    await page.locator("canvas").focus();
    await keys(["ArrowLeft", "ArrowLeft", "Enter", "ArrowRight", "ArrowRight", "Enter"], 260);
    await wait(700);
    await keys(["ArrowLeft", "ArrowLeft", "Enter", "ArrowRight", "Enter"], 260);
    await wait(700);
  },
  "queens-on-the-board": async () => {
    // The 8×8 board with its three given queens.
    await stage(3);
    await wait(900);
  },
  "knight-tour": async () => {
    // The 5×5 board, a few hops along the hinted way.
    await stage(3);
    await wait(800);
  },
  "turning-maze": async () => {
    await stage(1);
    await wait(800);
  },
  "haunted-mirrors": async () => {
    // The 5×5 board with a few monsters set.
    await stage(2);
    await wait(800);
    await keys(["Enter", "ArrowRight", "Enter", "Enter", "ArrowDown", "Enter", "Enter", "Enter", "ArrowDown", "ArrowLeft", "Enter", "Enter"], 320);
    await wait(700);
  },
  "building-puzzle": async () => {
    // The 5×5 block with a few buildings up.
    await stage(2);
    await wait(800);
    await keys(["ArrowRight", "Enter", "Enter", "ArrowRight", "Enter", "ArrowRight", "ArrowDown", "Enter", "Enter", "Enter", "Enter", "ArrowDown", "ArrowLeft", "ArrowLeft", "Enter", "Enter", "Enter", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "Enter", "Enter", "Enter", "Enter", "Enter"], 260);
    await wait(700);
  },
  // The 5×5 garden as it is laid: some pipes run full from the tank, the rest lie turned wrong.
  pipes: async () => {
    await stage(1);
  },
  // The 8×8 sea and its islands, before any bridge is laid.
  hashi: async () => {
    await stage(1);
  },
  // A lot of the second stage as it is laid, the red car hemmed in.
  "parking-escape": async () => {
    await stage(1);
  },
  // The 4×4 picture (the pavilion by the lake in spring) as it is shuffled.
  "sliding-puzzle": async () => {
    await stage(4);
  },
  // The row of seven stumps (어려움) as it is laid, its frogs out of place.
  "frog-hop": async () => {
    await stage(2);
  },
  // The 어려움 answer set out by the hint's moves and the laser fired (H plays them, the firing too, while capturing):
  // the beam split and bent, two targets lit.
  "laser-reflection": async () => {
    await stage(2);
    await page.evaluate(() => (document.documentElement.dataset.capture = "1"));
    await wait(800);
    for (let k = 0; k < 14; k++) {
      await keys(["h"], 100);
      await wait(700);
    }
    await wait(1600);
  },
  // The 6×6 baseboard with part of the railway laid from the tunnel by the hint's moves (H plays them while capturing).
  "train-tracks": async () => {
    await stage(1);
    await page.evaluate(() => (document.documentElement.dataset.capture = "1"));
    await wait(800);
    await keys(Array(9).fill("h"), 320);
    await wait(900);
  },
  // A 고수 board (turners, ice and a pair of portals) after two pushes of the hint's way (H plays it while capturing).
  "glide-cube": async () => {
    await stage(3);
    await page.evaluate(() => (document.documentElement.dataset.capture = "1"));
    await wait(800);
    await keys(["h"], 100);
    await wait(1400);
    await keys(["h"], 100);
    await wait(1600);
  },
  // A 보통 field with four pots of flowers set by the hint's blocks (H plays them while capturing), the cat on its way.
  "trap-the-cat": async () => {
    await stage(1);
    await page.evaluate(() => (document.documentElement.dataset.capture = "1"));
    await wait(800);
    for (let k = 0; k < 4; k++) {
      await keys(["h"], 100);
      await wait(1200);
    }
  },
  // A 어려움 board (7×7 with two boxes) with six bulbs lit along the hint's way (H plays it while capturing).
  "bulb-link": async () => {
    await stage(2);
    await page.evaluate(() => (document.documentElement.dataset.capture = "1"));
    await wait(800);
    for (let k = 0; k < 6; k++) {
      await keys(["h"], 100);
      await wait(1100);
    }
    await wait(800);
  },
  // A 고수 board (colour rings and coloured posts) with the cable wrapped round the first few posts of the hint's way
  // (H plays it while capturing), a post or two lit and the cable turned a colour by a ring.
  "light-cable": async () => {
    await stage(3);
    await page.evaluate(() => (document.documentElement.dataset.capture = "1"));
    await wait(800);
    for (let k = 0; k < 4; k++) {
      await keys(["h"], 60);
      await wait(500);
    }
    await wait(1200);
  },
  // A 어려움 board (8×8) after three presses of the hint's way (H plays it while capturing): tubes drawn out, the ball moved.
  // The 거북 탑 (the whole set of 144) after five pairs of the hint's way (H plays it while capturing), drifted into the tray.
  "mahjong-solitaire": async () => {
    await stage(4);
    await page.evaluate(() => (document.documentElement.dataset.capture = "1"));
    await wait(800);
    for (let k = 0; k < 5; k++) {
      await keys(["h"], 100);
      await wait(1300);
    }
  },
  "telescope-push": async () => {
    await stage(2);
    await page.evaluate(() => (document.documentElement.dataset.capture = "1"));
    await wait(800);
    for (let k = 0; k < 3; k++) {
      await keys(["h"], 100);
      await wait(1100);
    }
  },
  // Two darts thrown by the keyboard (at the treble twenty, then a little left of it), their scores faded away.
  darts: async () => {
    await keys(["Enter"]);
    await wait(1800);
    await keys(["ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "Enter"], 60);
    await wait(1800);
  },
  // Two arrows of mine by the keyboard (Space held draws the bow, let go it shoots), each answered by the computer,
  // so that the scoreboard on the field shows a set under way.
  archery: async () => {
    await page.locator("canvas").focus();
    for (let k = 0; k < 2; k++) {
      await page.keyboard.down(" ");
      await wait(1300);
      await page.keyboard.up(" ");
      await wait(9000);
    }
  },
  // Three arrows of mine by the keyboard (Enter throws at the mouth; the last one a little long, so that it lies on
  // the mat), each answered by the computer: arrows stand in the pot and the board shows a round under way.
  tuho: async () => {
    for (const aim of [[], ["ArrowLeft"], ["ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp"]]) {
      await keys([...aim, "Enter"], 80);
      // The arrow flies, rattles down and settles (about two and a half seconds), then the computer does the same.
      await wait(8000);
    }
  },
  // 구슬 밀기: three rows of three of mine moved forward against the computer, each chosen by a tap on its two ends
  // (`data-places`, canvas pixels by cell) and moved by a tap on an arrow (`data-arrow-places`, by direction; north-east
  // or north-west if open, else any open one), the computer answering each, so that the lines have met in the middle.
  "marble-push": async () => {
    const canvas = page.locator("#board canvas");
    const tap = async ([x, y]) => {
      const box = await canvas.boundingBox();
      await page.mouse.click(box.x + x, box.y + y);
      await wait(400);
    };
    for (const [a, b] of [[45, 47], [38, 40], [52, 54]]) {
      await page.waitForFunction(() => document.querySelector("#board")?.dataset.animating === "false" && document.querySelector("#board")?.dataset.turn === "0", null, { timeout: 30000 }).catch(() => {});
      const places = JSON.parse((await canvas.getAttribute("data-places")) || "[]");
      if (!places.length) break;
      await tap(places[a]);
      await tap(places[b]);
      const open = ((await canvas.getAttribute("data-arrows")) || "").split(",").filter(Boolean).map(Number),
        arrows = JSON.parse((await canvas.getAttribute("data-arrow-places")) || "[]"),
        dir = [1, 2].find((d) => open.includes(d)) ?? open[0];
      if (dir === undefined || !arrows[dir]) {
        await page.keyboard.press("Escape");
        continue;
      }
      await tap(arrows[dir]);
      await wait(3500);
    }
  },
  // A few stones on the 19×19 board, the computer answering each.
  go: async () => {
    await keys(["ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "ArrowUp", "Enter"], 60);
    await wait(3500);
    await keys(["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Enter"], 60);
    await wait(3500);
    await keys(["ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowDown", "Enter"], 60);
    await wait(3500);
  },
  "star-battle": async () => {
    await stage(2);
    await wait(800);
    await keys(["Enter", "ArrowRight", "ArrowRight", "Enter", "Enter", "ArrowDown", "ArrowDown", "Enter", "ArrowRight", "ArrowDown", "Enter", "Enter"], 260);
    await wait(700);
  },
  backgammon: async () => {
    await page.evaluate(() => document.querySelector("#pg-tool-0")?.click());
    await wait(2400);
  },
  "one-card": async () => {
    await wait(1200);
  },
  hula: async () => {
    // A few turns of mine (draw, discard my first card, pass any 땡큐) so that the computers' melds lie on the table.
    for (let k = 0; k < 4; k++) {
      await page
        .waitForFunction(() => document.querySelector("canvas")?.dataset.seat === "0" && document.querySelector("#board")?.dataset.animating === "false", null, { timeout: 30000 })
        .catch(() => {});
      const phase = await page.locator("canvas").getAttribute("data-phase");
      if (phase === "scored") break;
      if (phase === "claim") await press("#pg-tool-4");
      else if (phase === "draw") await press("#pg-tool-7");
      else {
        await keys(["ArrowLeft", "Enter"]);
        await press("#pg-tool-2");
      }
    }
    await wait(1600);
  },
  "old-maid": async () => {
    await keys(["ArrowRight", "Enter"], 200);
    await wait(4000);
  },
  tents: async () => {
    // The 7×7 field with a few tents and grass marks.
    await stage(2);
    await wait(800);
    await keys(["ArrowRight", "Enter", "ArrowDown", "ArrowDown", "Enter", "Enter", "ArrowRight", "ArrowRight", "ArrowRight", "Enter", "ArrowDown", "ArrowDown", "ArrowLeft", "Enter"], 260);
    await wait(700);
  },
  "royal-game-of-ur": async () => {
    // A few throws and moves, so that pieces stand on the board.
    for (let i = 0; i < 6; i++) {
      await page.evaluate(() => document.querySelector("#pg-tool-0")?.click());
      await wait(1500);
      await keys(["ArrowRight", "ArrowLeft", "Enter"], 120);
      await wait(2600);
    }
  },
  hnefatafl: async () => {
    await wait(2500);
  },
  "lights-on": async () => {
    await stage(2);
    await wait(500);
  },
  minesweeper: async () => {
    await page.locator("canvas").focus();
    await keys(["ArrowRight", "ArrowDown", "ArrowDown", "ArrowDown", "ArrowRight", "ArrowRight", "ArrowRight", "Enter"], 120);
    await wait(400);
  },
  "meat-grill": async () => {
    await page.locator("canvas").focus();
    // A piece from each plate, a wrap begun on the large plate, the first pieces turned once they have browned.
    await keys(["ArrowRight", "Enter", "ArrowRight", "Enter", "Enter", "ArrowRight", "Enter", "ArrowRight", "Enter", "ArrowRight", "Enter", "l", "1", "2"], 80);
    await wait(6500);
    await keys(["ArrowRight", "Enter", "ArrowRight", "ArrowRight", "ArrowRight", "Enter", "ArrowLeft", "s"], 80);
    await wait(2200);
    await page.locator("canvas").blur();
  },
  "fruit-merge": async () => {
    await page.locator("canvas").focus();
    for (let i = 0; i < 22; i++) {
      const way = i % 3 === 0 ? "ArrowLeft" : "ArrowRight";
      await page.keyboard.down(way);
      await wait(110 + (i % 4) * 90);
      await page.keyboard.up(way);
      await page.keyboard.press(" ");
      await wait(700);
    }
  },
  "balance-quiz": async () => {
    // The weights' stage: the parcel on its pan and a weight put up beside it, so that the beam leans.
    await stage(1);
    await wait(1500);
    await keys(["Enter"], 300);
    await wait(1200);
  },
  "river-crossing": async () => {
    await stage();
  },
  "water-pouring": async () => {
    await stage();
  },
  "marble-shot": async () => {
    await stage();
  },
  "brick-breaker": async () => {
    await keys([" "]);
    await wait(2300);
  },
  // Moles let come up for a while, a few knocked on the way, so that some are up, dazed or ducking when the picture is taken.
  "whack-a-mole": async () => {
    await page.locator("canvas").focus();
    await wait(2400);
    for (const key of ["4", "1", "6"]) {
      await page.keyboard.press(key);
      await wait(260);
    }
    await wait(150);
  },
  // 낚시: the float cast to the middle; a steady hand in the page strikes at the bite and reels while the fish does
  // not run (casting again after a miss), and the lake is paused as a fish (not junk) is held up out of the water.
  fishing: async () => {
    await page.locator("canvas").focus();
    await page.evaluate(() => {
      const board = document.querySelector("#board canvas");
      let held = false;
      const key = (type) => board.dispatchEvent(new KeyboardEvent(type, { key: " ", bubbles: true, cancelable: true }));
      const loop = () => {
        const d = board.dataset;
        if (!board.isConnected) return;
        const want = d.phase === "bite" || (d.phase === "fight" && d.surge !== "1" && Number(d.tension) < 0.8);
        if (d.phase === "ready" && !held) {
          key("keydown");
          key("keyup");
        } else if (want !== held) {
          key(want ? "keydown" : "keyup");
          held = want;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });
    await page.waitForFunction(() => {
      const d = document.querySelector("#board canvas")?.dataset;
      return d?.phase === "land" && Number(d.landed) < 5;
    }, null, { timeout: 85000, polling: 50 });
    await wait(650);
    await page.keyboard.press("p");
  },
  // 주차 요원: the tests' careful driver at the wheel in the page (by keys) parks three cars; the lot is paused as
  // the fourth is driven up the aisle, with its owner waiting by the booth.
  "valet-parking": async () => {
    await page.locator("canvas").focus();
    await page.evaluate(atTheWheel, driver.toString());
    await page.waitForFunction(() => {
      const d = document.querySelector("#board canvas")?.dataset;
      if (!d || d.phase !== "drive" || d.job !== "waiting" || Number(d.counts.split(",")[0]) < 3) return false;
      const [x, , , v] = d.car.split(",").map(Number);
      return x > -5 && v > 1.5;
    }, null, { timeout: 600000, polling: 50 });
    await page.keyboard.press("p");
  },
  // The claw run over the middle of the pit with the lever held, and let down: the picture is taken as it closes on a toy.
  "claw-machine": async () => {
    await page.locator("canvas").focus();
    for (const [key, hold] of [["ArrowRight", 1300], ["ArrowUp", 700]]) {
      await page.keyboard.down(key);
      await wait(hold);
      await page.keyboard.up(key);
    }
    await wait(1600);
    await page.keyboard.press(" ");
    await wait(1250);
    await page.keyboard.press("p");
  },
  // Space held a while drops a run of coins (some in the air as the picture is taken); a few have come out into the tray.
  "coin-pusher": async () => {
    await page.locator("canvas").focus();
    await page.keyboard.down(" ");
    await wait(2600);
    await page.keyboard.up(" ");
    await wait(3200);
    await page.keyboard.down(" ");
    await wait(450);
    await page.keyboard.up(" ");
    await page.keyboard.press("p");
  },
  // 슬롯머신: one spin let run to its end (the reels at rest, the credits shown), then the lever pulled again and the
  // picture taken with the reels turning.
  "slot-machine": async () => {
    await page.locator("canvas").focus();
    await page.keyboard.press(" ");
    await wait(3600);
    await page.keyboard.press(" ");
    await wait(700);
    await page.keyboard.press("p");
  },
  // 룰렛: a few chips laid by the keyboard (25s round 17, 100s on a corner and a street), the wheel beside the layout.
  roulette: async () => {
    await page.locator("canvas").focus();
    await keys(["3", "Enter", "ArrowRight", "ArrowRight", "Enter", "ArrowUp", "Enter", "4", "ArrowLeft", "Enter", "ArrowDown", "ArrowDown", "Enter"], 160);
    await wait(600);
  },
  // 사격 (the BB booth, the default): a few lit targets shot by hand, each press held until the sights are near a line and
  // let go on the target, so that the displays show a score and other targets are lit; then paused at rest.
  shooting: async () => {
    const canvas = page.locator("#board canvas");
    for (let n = 0; n < 4; n++) {
      await page.waitForFunction(() => { const c = document.querySelector("#board canvas"); return c.dataset.zoom === "0.00" && c.dataset.loaded === "true" && JSON.parse(c.dataset.targets || "[]").length > 0; }, null, { timeout: 20000 }).catch(() => {});
      const box = await canvas.boundingBox(),
        t = JSON.parse((await canvas.getAttribute("data-targets")) || "[]")[0];
      if (!t) break;
      const at = { x: box.x + t.x, y: box.y + t.y };
      await page.mouse.move(at.x, at.y);
      await page.mouse.down();
      await page.evaluate(({ at, height }) => new Promise((done) => {
        const c = document.querySelector("#board canvas"), start = performance.now();
        const look = () => {
          const [ox, oy] = (c.dataset.offset || "99,99").split(",").map(Number), [yaw, pitch] = c.dataset.aim.split(",").map(Number),
            t = JSON.parse(c.dataset.targets || "[]").sort((p, q) => Math.hypot(p.yaw - yaw, p.pitch - pitch) - Math.hypot(q.yaw - yaw, q.pitch - pitch))[0];
          if ((!t || c.dataset.zoom !== "1.00" || Math.hypot(ox, oy) > 5) && performance.now() - start < 8000) return setTimeout(look, 15);
          // The BB booth's aimed field is 22°: a drag of a pixel turns the gun by that over the canvas's height.
          const k = (22 * Math.PI) / 180 / height, x = at.x + (t ? (t.yaw - yaw) / 1000 / k : 0), y = at.y - (t ? (t.pitch - pitch) / 1000 / k : 0);
          c.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, pointerType: "mouse", clientX: x, clientY: y, bubbles: true }));
          c.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, pointerType: "mouse", button: 0, clientX: x, clientY: y, bubbles: true }));
          done();
        };
        look();
      }), { at, height: box.height });
      await page.mouse.up();
      await wait(900);
    }
    await wait(1200);
    await canvas.focus();
    await page.keyboard.press("p");
  },
  // Marks laid by the keyboard (the computer answers each), so that the board shows a game under way.
  "tic-tac-toe": async () => {
    await page.locator("canvas").focus();
    // The first arrow only brings the cursor to the middle; then up and right to the corner, then left along the top.
    for (const path of [["ArrowUp"], ["ArrowUp", "ArrowRight"], ["ArrowLeft"]]) {
      for (const key of path) await page.keyboard.press(key);
      await page.keyboard.press("Enter");
      await wait(1400);
    }
    await page.keyboard.press("Escape");
  },
  // Two takes of mine (three rings, then two), each answered by the computer, so that both trays hold rings.
  nim: async () => {
    for (const tool of [2, 1]) {
      await page.evaluate((i) => document.getElementById(`pg-tool-${i}`)?.click(), tool);
      await wait(4500);
    }
  },
  // A black tile drawn from the pool (held at the end of my row), the computer's tiles still standing.
  "number-code": async () => {
    await page.evaluate(() => document.getElementById("pg-tool-0")?.click());
    await wait(1800);
  },
  // The world map: the setting up left to the computer (자동 배치), so that every territory has its pieces; then the
  // first turn's reinforcements all on my strongest front (a cannon among them) and its weakest neighbour attacked
  // to the end, so that the dice lie in the tray; the front is let go at the end so that nothing is picked out.
  "continent-conquest": async () => {
    await press("#cq-auto");
    await page.waitForFunction(() => document.querySelector("#board")?.dataset.phase === "reinforce" && document.querySelector("#board")?.dataset.turn === "0", null, { timeout: 240000 });
    await wait(1500);
    const table = () =>
      page.evaluate(() => {
        const c = document.querySelector("canvas");
        return { owners: c.dataset.owners.split(",").map(Number), armies: c.dataset.armies.split(",").map(Number), places: JSON.parse(c.dataset.places), neighbours: JSON.parse(c.dataset.neighbours) };
      });
    const tap = async ([x, y]) => {
      const box = await page.locator("canvas").boundingBox();
      await page.mouse.click(box.x + x, box.y + y);
      await wait(500);
    };
    let t = await table();
    const front = t.owners.map((_, i) => i).filter((i) => t.owners[i] === 0 && t.neighbours[i].some((n) => t.owners[n] !== 0)).sort((a, b) => t.armies[b] - t.armies[a])[0];
    await tap(t.places[front]);
    await press("#cq-place");
    await wait(1200);
    t = await table();
    const enemy = t.neighbours[front].filter((n) => t.owners[n] !== 0).sort((a, b) => t.armies[a] - t.armies[b])[0];
    await tap(t.places[enemy]);
    await wait(1500);
    await press("#cq-blitz");
    await wait(3500);
    await press("#cq-move");
    await wait(1200);
    if ((await page.locator("#board").getAttribute("data-selected")) !== "-1") {
      t = await table();
      await tap(t.places[Number(await page.locator("#board").getAttribute("data-selected"))]);
    }
  },
  // Two at one screen, six moves by the keyboard: at the last, gold's laser, bent down column 2 by its turned home
  // mirror, takes a silver deflector; the table has turned back to silver and the picture keeps the red beam lit.
  "laser-chess": async () => {
    await press("#restart");
    // The window opens with an animation: its start is pressed once it has come to rest.
    await page.locator("dialog[open]").getByLabel("로컬 2인", { exact: true }).check();
    await wait(900);
    await page.locator("dialog[open] .setup-host button.primary").click();
    await page.locator("dialog[open]").waitFor({ state: "detached" });
    await wait(1800);
    // The cursor walks squares as the one to move sees them (gold's view is turned half round); Enter presses it.
    let at = 65;
    const go = async (to, gold) => {
      const s = gold ? -1 : 1,
        dc = (to % 10) - (at % 10),
        dr = Math.floor(to / 10) - Math.floor(at / 10),
        walk = [];
      for (let i = 0; i < Math.abs(dc); i++) walk.push(dc * s > 0 ? "ArrowRight" : "ArrowLeft");
      for (let i = 0; i < Math.abs(dr); i++) walk.push(dr * s > 0 ? "ArrowDown" : "ArrowUp");
      await keys([...walk, "Enter"], 60);
      at = to;
    };
    // The turns are the hidden tools: 0 against the clock, 1 with it.
    const turn = async (i) => {
      await page.evaluate((i) => document.getElementById(`pg-tool-${i}`)?.click(), i);
      await wait(5200);
    };
    // The first arrow only puts the cursor on its starting square, (6, 5).
    await keys(["ArrowUp"]);
    await go(79, false);
    await turn(0);
    await go(12, true);
    await go(13, true);
    await wait(5200);
    await go(79, false);
    await turn(1);
    await go(2, true);
    await turn(0);
    await go(79, false);
    await turn(0);
    await go(0, true);
    await turn(0);
  },
  // My mallet swept from my goal (at the left) into the puck, and the table paused while the puck is on its way.
  "air-hockey": async () => {
    const box = await page.locator("canvas").boundingBox();
    await page.mouse.move(box.x + box.width * 0.16, box.y + box.height * 0.56);
    await page.mouse.down();
    for (let k = 1; k <= 10; k++) {
      await page.mouse.move(box.x + box.width * (0.16 + k * 0.03), box.y + box.height * 0.55);
      await wait(25);
    }
    await page.mouse.up();
    // A frame of the capture takes over a second: wait for the strike to be drawn.
    await wait(1500);
    await page.keyboard.press("p");
  },
  // The computer's serve on its way over the net toward me, and the hall paused there.
  "table-tennis": async () => {
    const canvas = page.locator("canvas");
    for (let k = 0; k < 300; k++) {
      const ball = ((await canvas.getAttribute("data-ball")) ?? "").split(",").map(Number);
      if ((await canvas.getAttribute("data-phase")) === "rally" && ball[2] > 0.15) break;
      await wait(30);
    }
    await canvas.focus();
    await page.keyboard.press("p");
  },
  // My long serve high over the net, and the hall paused while the shuttle is in the air.
  badminton: async () => {
    const canvas = page.locator("canvas");
    await canvas.focus();
    await page.keyboard.press("ArrowUp");
    for (let k = 0; k < 200; k++) {
      const at = ((await canvas.getAttribute("data-shuttle")) ?? "").split(",").map(Number);
      if ((await canvas.getAttribute("data-phase")) === "flying" && at[2] < -0.5) break;
      await wait(30);
    }
    await page.keyboard.press("p");
  },
  // A ball thrown up the lane, and the machine paused while it comes down toward the hoop.
  basketball: async () => {
    const box = await page.locator("canvas").boundingBox(),
      x = box.x + box.width / 2,
      y = box.y + box.height * 0.85,
      length = 0.55 * 0.5 * box.height;
    await page.mouse.move(x, y);
    await page.mouse.down();
    for (let k = 1; k <= 8; k++) await page.mouse.move(x, y - (length * k) / 8);
    await page.mouse.up();
    await wait(760);
    await page.locator("canvas").focus();
    await page.keyboard.press("p");
  },
  // 헥스 정복전: five of my turns, each army sent toward a town, a port or land not yet mine (by its place on the
  // canvas, `data-places`), so that every nation's land has spread when the picture is taken.
  "hex-conquest": async () => {
    const table = () =>
      page.evaluate(() => {
        const c = document.querySelector("#board canvas");
        return { places: JSON.parse(c.dataset.places), armies: JSON.parse(c.dataset.armies), seat: c.dataset.seat, me: Number(c.dataset.me), phase: c.dataset.phase, targets: c.dataset.targets ? c.dataset.targets.split(",").map(Number) : [], estates: c.dataset.estates, owners: c.dataset.owners.split(",").map(Number) };
      });
    const tap = async ([x, y]) => {
      const box = await page.locator("canvas").boundingBox();
      await page.mouse.click(box.x + x, box.y + y);
      await wait(250);
    };
    const mine = () =>
      page.waitForFunction(
        () => {
          const c = document.querySelector("#board canvas");
          return c?.dataset.seat === c?.dataset.me && document.querySelector("#board")?.dataset.animating === "false";
        },
        null,
        { timeout: 120000 },
      );
    // Setup: the map and 홍국 as laid; 시작 (tool 6) begins.
    await page.waitForFunction(() => document.querySelector("#board canvas")?.dataset.phase === "setup", null, { timeout: 20000 });
    await press("#pg-tool-6");
    await wait(600);
    for (let turn = 0; turn < 5; turn++) {
      await mine();
      // An offer of an alliance waiting: 수락 (tool 9).
      if ((await table()).phase === "offer") {
        await press("#pg-tool-9");
        await wait(600);
      }
      for (let k = 0; k < 5; k++) {
        let t = await table();
        const army = t.armies.find((a) => a.n === t.me && !a.moved);
        if (!army || t.seat !== String(t.me) || t.phase !== "play") break;
        await tap(army.at);
        t = await table();
        const free = t.targets.filter((h) => !t.armies.some((a) => a.h === h) && t.owners[h] !== t.me);
        const to = free.find((h) => t.estates[h] !== "0") ?? free[0];
        if (to === undefined) {
          await tap(army.at);
          break;
        }
        await tap(t.places[to]);
        // The turn may pass to the computers at once (a nation of one army has one move): `mine` waits for them.
        await page.waitForFunction(
          () => {
            const c = document.querySelector("#board canvas");
            return document.querySelector("#board")?.dataset.animating === "false" || c?.dataset.seat !== c?.dataset.me;
          },
          null,
          { timeout: 30000 },
        );
      }
      if ((await table()).seat === String((await table()).me)) await press("#pg-tool-0");
    }
    await mine();
  },
  // 슬롯 카: the lights go green, my pedal is held a little (Space) and the computer's cars spread round the eight;
  // paused while they are strung out along the track.
  "slot-car": async () => {
    await page.waitForFunction(() => document.querySelector("#board canvas")?.dataset.phase === "race", null, { timeout: 60000 });
    await page.locator("canvas").focus();
    await page.keyboard.down("Space");
    await wait(1400);
    await page.keyboard.up("Space");
    await wait(1600);
    await page.keyboard.press("p");
  },
  // 축구 (the flat pitch, me against the computer): I run at the ball and kick off, the computer comes for it; paused
  // with the ball between us.
  soccer: async () => {
    await page.locator("canvas").focus();
    await page.keyboard.down("KeyD");
    await page.keyboard.down("Space");
    await wait(2600);
    await page.keyboard.up("Space");
    await page.keyboard.up("KeyD");
    await wait(1400);
    await page.keyboard.press("p");
  },
  // 금화 쟁탈전: I run out from my castle (the eye follows me along the long valley) and jump; paused in the air with
  // gold falling and lying on the ledges ahead. (The thumbnail is cut from the middle of this picture.)
  "gold-raid": async () => {
    await page.locator("canvas").focus();
    await page.keyboard.down("KeyD");
    await wait(4200);
    await page.keyboard.press("KeyW");
    await wait(350);
    await page.keyboard.up("KeyD");
    await page.keyboard.press("p");
  },
  // One arrow of mine by the keyboard (short, standing in the grass), the computer's answer, then my archer drawn
  // again a little higher and harder, the camera back on it.
  "archer-duel": async () => {
    await page.locator("canvas").focus();
    await page.keyboard.press("Space");
    await wait(14000);
    await keys(["ArrowUp", "ArrowUp", "ArrowUp", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight"], 60);
    await wait(1500);
  },
  // The snake (near the right fence by now) turned up, back left along the top and down, then paused there so that
  // the picture is not taken after it has run into a fence (the capture style below undoes the paused dimming).
  snake: async () => {
    await page.locator("canvas").focus();
    for (const [key, pause] of [["ArrowUp", 550], ["ArrowLeft", 1150], ["ArrowDown", 450]]) {
      await page.keyboard.press(key);
      await wait(pause);
    }
    await page.keyboard.press("p");
  },
};
const only = process.argv[3];
for (const game of games) {
  if (only && game.en.toLowerCase().replaceAll(" ", "-") !== only) continue;
  const id = game.en.toLowerCase().replaceAll(" ", "-");
  // THUMB_QUERY=?reflect=1 builds the table as a graphics card draws it (props and lacquer that are left out under
  // software drawing, which `data-capture` set after sitting down comes too late to ask for).
  await page.goto(`http://localhost:4175/${process.env.THUMB_QUERY ?? ""}`);
  await page.getByRole("button", { name: `${game.name} 살펴보기`, exact: true }).click();
  await page.locator("dialog.entry[open]").waitFor();
  await wait(800);
  // A puzzle entered through its stage window sits down in its own step (`stage`).
  if (!(await page.locator("dialog[open] .stage-entry").count())) {
    await page.locator(".game-stage button.primary").first().click();
    await page.locator("canvas").waitFor();
    await wait(1800);
  }
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
  await page.addStyleTag({ content: ".board-label, .board-nav, .board-controls, .board-pause, .board-bottom, .board-hint, .bg-acting, .pg-tools, .tour-end, .tour-toast { display: none !important; } html[data-capture] .game-layout .board-area > .board-hint { display: none !important; } #board[data-paused] canvas { filter: none !important; }" });
  await wait(200);
  await page.locator("canvas").screenshot({ path: `${out}/${id}.png` });
  console.log(id);
}
await browser.close();
