/**
 * The screen kept on while a Wi-Fi room is open on this page (the Screen Wake Lock of the browser). A phone whose
 * screen goes off stops answering: after a while the host takes it for gone and its seat goes to the computer, and on
 * the QR way it can come back only by a new invite. Yut nori in particular waits long between one's turns. The app
 * keeps its own screen on (`FLAG_KEEP_SCREEN_ON`); a browser that has no wake lock, or refuses it, is left as it is.
 * The browser lets the lock go whenever the page is hidden: it is taken again when the page is shown.
 */
interface Sentinel {
  released: boolean;
  release(): Promise<void>;
}
interface WakeLock {
  request(type: "screen"): Promise<Sentinel>;
}
const holders = new Set<object>();
let sentinel: Sentinel | null = null,
  asking = false,
  listening = false;

function lock(): WakeLock | null {
  return typeof navigator !== "undefined" ? ((navigator as unknown as { wakeLock?: WakeLock }).wakeLock ?? null) : null;
}
function take() {
  const wake = lock();
  if (!wake || asking || !holders.size || (sentinel && !sentinel.released) || (typeof document !== "undefined" && document.hidden)) return;
  asking = true;
  wake.request("screen").then(
    (s) => {
      asking = false;
      sentinel = s;
      // Let go meanwhile (every room left): given back at once.
      if (!holders.size) void s.release().catch(() => {});
    },
    () => {
      asking = false;
    },
  );
}
/** `holder` (a room) wants the screen kept on until `letGo`. */
export function keepAwake(holder: object) {
  if (!lock()) return;
  holders.add(holder);
  if (!listening && typeof document !== "undefined") {
    listening = true;
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) take();
    });
  }
  take();
}
export function letGo(holder: object) {
  if (!holders.delete(holder) || holders.size) return;
  const s = sentinel;
  sentinel = null;
  if (s && !s.released) void s.release().catch(() => {});
}
