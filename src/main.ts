import "./style.css";
import "./ui/app";
import { music } from "./engine/music";
import { EDITION } from "./core/catalog";
import { confirmLeave } from "./ui/dialog";

if (EDITION === "student") document.title = "World Table Games 학생용";

// Fit the table below the actual header and wrapping game controls.
const root = document.querySelector<HTMLElement>("#app")!;
let layoutFrame = 0;
const fitBoard = () => {
  cancelAnimationFrame(layoutFrame);
  layoutFrame = requestAnimationFrame(() => {
    const board = document.getElementById("board");
    if (!board) return;
    const top = board.getBoundingClientRect().top + window.scrollY;
    const height = window.visualViewport?.height ?? window.innerHeight;
    root.style.setProperty("--available-board-height", `${Math.max(80, Math.floor(height - top - 16))}px`);
  });
};
const layoutObserver = new ResizeObserver(fitBoard);
const watchLayout = () => {
  layoutObserver.disconnect();
  root.querySelectorAll("header, .game-top").forEach((el) => layoutObserver.observe(el));
  fitBoard();
};
new MutationObserver(watchLayout).observe(root, { childList: true });
window.addEventListener("resize", fitBoard);
window.visualViewport?.addEventListener("resize", fitBoard);
watchLayout();

// Phones play in landscape. A page cannot turn the screen by itself except in full screen, and not on every phone:
// the button tries that, and where it is refused the notice asks for the phone to be turned.
document.getElementById("rotate-go")?.addEventListener("click", async () => {
  const help = document.getElementById("rotate-help")!;
  try {
    await document.documentElement.requestFullscreen({ navigationUI: "hide" });
    await (screen.orientation as ScreenOrientation & { lock(orientation: string): Promise<void> }).lock("landscape");
  } catch {
    help.textContent = "이 브라우저는 화면을 대신 돌려 주지 못합니다. 화면 회전 잠금을 풀고 휴대폰을 가로로 돌려 주세요.";
  }
});

// The browser's (or the phone's) back button leaves a table for the collection instead of leaving the page.
// Sitting down adds one history entry; going back from it presses the table's own ← 컬렉션.
// The window a game is entered through counts as the table: its page behind is the game's own.
const atTable = () => !!root.querySelector(":scope > main.game-layout, :scope > main.entry-backdrop");
// The page puts the collection where it belongs itself (at the game just left): the browser must not scroll it back
// to where the page stood when the table's history entry was made.
try {
  history.scrollRestoration = "manual";
} catch {
  // A viewer that forbids it keeps the browser's own behaviour.
}
const remember = () => {
  try {
    if (!history.state?.table) history.pushState({ table: true }, "");
  } catch {
    // A page that may not touch its history (some embedded viewers) keeps the browser's own behaviour.
  }
};
new MutationObserver(() => {
  // The collection and a table have each their own music.
  music.scene(atTable() ? "table" : "lobby");
  if (atTable()) remember();
  // Left by the table's own button: the entry that stood for the table is used up.
  else if (history.state?.table) history.back();
}).observe(root, { childList: true });
window.addEventListener("popstate", () => {
  if (!atTable() || history.state?.table) return;
  // The topmost window first: the 게임 방법 opened over the window a game is entered through is closed before it.
  const open = [...document.querySelectorAll<HTMLDialogElement>("dialog[open]")].pop();
  // Back from the window a game is entered through is back to the collection.
  if (open?.classList.contains("entry")) {
    open.querySelector<HTMLButtonElement>("#setup-cancel")?.click();
    return;
  }
  if (open) {
    // A window over the table is closed first; the table stays.
    open.close();
    open.remove();
    remember();
    return;
  }
  // A game in play asks first (the user asked); kept, the table's history entry is made again.
  if (inPlay()) confirmLeave(leaveTable, remember);
  else leaveTable();
});
// Leaving a game in play, by 나가기 or the back button, asks first (the user asked). A table whose game has ended (its
// finale shown) and the window a game is entered through are left at once.
const inPlay = () => !!root.querySelector(":scope > main.game-layout") && !document.querySelector("#board .board-finale") && !document.querySelector("dialog.entry[open]");
let leaving = false;
const leaveTable = () => {
  leaving = true;
  try {
    document.getElementById("back")?.click();
  } finally {
    leaving = false;
  }
};
document.addEventListener(
  "click",
  (event) => {
    // Only a press of the person's own asks: the app's own presses (the room gone, a game chosen from a room code) leave
    // at once.
    if (leaving || !event.isTrusted || !(event.target instanceof Element) || !event.target.closest("#back") || !inPlay()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    confirmLeave(leaveTable);
  },
  true,
);
