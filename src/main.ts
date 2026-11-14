import "./style.css";
import "./ui/app";

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
const atTable = () => !!root.querySelector(":scope > main.game-layout");
const remember = () => {
  try {
    if (!history.state?.table) history.pushState({ table: true }, "");
  } catch {
    // A page that may not touch its history (some embedded viewers) keeps the browser's own behaviour.
  }
};
new MutationObserver(() => {
  if (atTable()) remember();
  // Left by the table's own button: the entry that stood for the table is used up.
  else if (history.state?.table) history.back();
}).observe(root, { childList: true });
window.addEventListener("popstate", () => {
  if (!atTable() || history.state?.table) return;
  const open = document.querySelector<HTMLDialogElement>("dialog[open]");
  if (open) {
    // A window over the table is closed first; the table stays.
    open.close();
    open.remove();
    remember();
    return;
  }
  document.getElementById("back")?.click();
});
