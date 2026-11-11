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
