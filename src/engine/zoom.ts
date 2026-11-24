import type * as T from "three";

/**
 * Zooming into the game's table (the user asked), for every view that draws through a `zoomable` renderer:
 *  - with a mouse wheel (or a trackpad's pinch, which comes as a wheel with Ctrl), the view zooms about the pointer and
 *    stays where it was left;
 *  - with two fingers on the canvas (the app, a phone), it zooms about the fingers and follows them, and once they are
 *    lifted it glides back to the usual view.
 *
 * It is the camera's view offset (`setViewOffset`) that does it: the picture is drawn sharp at any zoom, and because
 * the offset is part of the camera's projection, a tap turned into a ray (`setFromCamera`) or a point projected onto
 * the screen lands where it is seen, with no change to any game. At the usual view nothing is set on the camera at all.
 *
 * A game whose canvas takes two fingers itself (two players at one screen, a map with its own zoom) says so with
 * `noZoom(canvas)`.
 */
interface Zoom {
  /** How many times larger than the usual view. */
  z: number;
  /** Top-left corner of the part shown, as shares of the whole picture. */
  x: number;
  y: number;
  renderer: T.WebGLRenderer;
  render: (scene: T.Object3D, camera: T.Camera) => void;
  scene?: T.Object3D;
  camera?: T.Camera;
  drawn: number;
  /** The glide back after the fingers let go. */
  back?: { from: { z: number; x: number; y: number }; start: number };
}
const MAX = 4,
  WHEEL_MIN = 0.75,
  PINCH_MIN = 0.8,
  BACK_MS = 320;
const zooms = new Map<HTMLCanvasElement, Zoom>();
const offset = new WeakSet<T.Camera>();
let ticking = false;

/** Keeps the part shown inside the picture when zoomed in; centred when zoomed out. */
function hold(zoom: Zoom) {
  const s = 1 / zoom.z;
  if (s >= 1) zoom.x = zoom.y = (1 - s) / 2;
  else {
    zoom.x = Math.min(1 - s, Math.max(0, zoom.x));
    zoom.y = Math.min(1 - s, Math.max(0, zoom.y));
  }
}
/** Zooms to `z`, keeping the picture's point under (u, v) (shares of the canvas) where it is. */
function about(zoom: Zoom, z: number, u: number, v: number, min: number) {
  const s = 1 / zoom.z,
    px = zoom.x + u * s,
    py = zoom.y + v * s;
  zoom.z = Math.min(MAX, Math.max(min, z));
  const t = 1 / zoom.z;
  zoom.x = px - u * t;
  zoom.y = py - v * t;
  hold(zoom);
}
const usual = (zoom: Zoom) => Math.abs(zoom.z - 1) < 1e-3;

function apply(zoom: Zoom, camera: T.Camera) {
  const lens = camera as T.PerspectiveCamera | T.OrthographicCamera;
  if (typeof lens.setViewOffset !== "function") return;
  if (usual(zoom)) {
    if (offset.has(camera)) {
      offset.delete(camera);
      lens.clearViewOffset();
    }
    return;
  }
  // A perspective camera takes its aspect from the full size given here, so the full size is its own aspect.
  const canvas = zoom.renderer.domElement,
    w = "isPerspectiveCamera" in lens && lens.isPerspectiveCamera ? lens.aspect : canvas.clientWidth || 1,
    h = "isPerspectiveCamera" in lens && lens.isPerspectiveCamera ? 1 : canvas.clientHeight || 1,
    s = 1 / zoom.z;
  lens.setViewOffset(w, h, zoom.x * w, zoom.y * h, s * w, s * h);
  offset.add(camera);
}

/** Draws again a view that only draws when something moved, so that the zoom is seen at once. */
function tick() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(function frame(now) {
    let more = false;
    for (const [canvas, zoom] of zooms) {
      if (!canvas.isConnected) {
        zooms.delete(canvas);
        continue;
      }
      if (zoom.back) {
        const t = Math.min(1, (now - zoom.back.start) / BACK_MS),
          ease = 1 - (1 - t) ** 3,
          { from } = zoom.back;
        // From the zoom held to the usual view: the scale and the corner ease back together.
        zoom.z = from.z + (1 - from.z) * ease;
        zoom.x = from.x * (1 - ease);
        zoom.y = from.y * (1 - ease);
        hold(zoom);
        if (t >= 1) {
          zoom.z = 1;
          zoom.x = zoom.y = 0;
          zoom.back = undefined;
        } else more = true;
      }
      if (zoom.scene && zoom.camera && now - zoom.drawn > 24 && zoom.renderer.getRenderTarget() === null)
        zoom.renderer.render(zoom.scene, zoom.camera);
    }
    if (more) requestAnimationFrame(frame);
    else ticking = false;
  });
}

/** Lets the table drawn by `renderer` be zoomed into. */
export function zoomable(renderer: T.WebGLRenderer) {
  const canvas = renderer.domElement,
    render = renderer.render.bind(renderer);
  const zoom: Zoom = { z: 1, x: 0, y: 0, renderer, render, drawn: 0 };
  zooms.set(canvas, zoom);
  renderer.render = (scene, camera) => {
    if (renderer.getRenderTarget() === null) {
      zoom.scene = scene;
      zoom.camera = camera;
      zoom.drawn = performance.now();
      apply(zoom, camera);
    }
    render(scene, camera);
  };
  canvas.addEventListener(
    "wheel",
    (e) => {
      if (canvas.dataset.zoom === "off") return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect(),
        lines = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1,
        delta = Math.max(-120, Math.min(120, e.deltaY * lines));
      zoom.back = undefined;
      about(zoom, zoom.z * Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0022)), (e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height, WHEEL_MIN);
      if (Math.abs(zoom.z - 1) < 0.03) {
        zoom.z = 1;
        zoom.x = zoom.y = 0;
      }
      tick();
    },
    { passive: false },
  );
  listen();
  return renderer;
}

/** A canvas whose two fingers belong to the game. */
export function noZoom(canvas: HTMLCanvasElement) {
  canvas.dataset.zoom = "off";
}

// Two fingers, watched before the game sees them: once a second finger is down on the same canvas, the game is told
// the first one was cancelled and sees neither again until both are lifted.
const fingers = new Map<number, { canvas: HTMLCanvasElement; x: number; y: number }>();
let pinch: {
  canvas: HTMLCanvasElement;
  zoom: Zoom;
  ids: [number, number];
  /** Spread of the fingers, the zoom and the picture's point under their middle, at the start. */
  spread: number;
  z: number;
  px: number;
  py: number;
} | null = null;
/** Fingers of a pinch still down once it has ended (the one left must not become a tap). */
const swallowed = new Set<number>();
let quietUntil = 0;
let listening = false;

function listen() {
  if (listening) return;
  listening = true;
  const share = (canvas: HTMLCanvasElement, x: number, y: number) => {
    const rect = canvas.getBoundingClientRect();
    return { u: (x - rect.left) / rect.width, v: (y - rect.top) / rect.height };
  };
  const middle = () => {
    const [a, b] = pinch!.ids.map((id) => fingers.get(id)!);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, spread: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  };
  window.addEventListener(
    "pointerdown",
    (e) => {
      if (e.pointerType !== "touch" || !e.isTrusted) return;
      const canvas = e.target as HTMLCanvasElement;
      const zoom = zooms.get(canvas);
      if (!zoom || canvas.dataset.zoom === "off") return;
      fingers.set(e.pointerId, { canvas, x: e.clientX, y: e.clientY });
      if (pinch) {
        e.stopImmediatePropagation();
        swallowed.add(e.pointerId);
        return;
      }
      const other = [...fingers].find(([id, f]) => id !== e.pointerId && f.canvas === canvas && !swallowed.has(id));
      if (!other) return;
      // The second finger: the pinch begins, and the first finger's press is taken back from the game.
      e.stopImmediatePropagation();
      const [first] = other;
      if (canvas.hasPointerCapture(first)) canvas.releasePointerCapture(first);
      const f = fingers.get(first)!;
      canvas.dispatchEvent(new PointerEvent("pointercancel", { pointerId: first, pointerType: "touch", isPrimary: true, clientX: f.x, clientY: f.y, bubbles: true }));
      swallowed.add(first);
      swallowed.add(e.pointerId);
      zoom.back = undefined;
      pinch = { canvas, zoom, ids: [first, e.pointerId], spread: 1, z: zoom.z, px: 0, py: 0 };
      const m = middle(),
        { u, v } = share(canvas, m.x, m.y),
        s = 1 / zoom.z;
      pinch.spread = m.spread;
      pinch.px = zoom.x + u * s;
      pinch.py = zoom.y + v * s;
    },
    true,
  );
  window.addEventListener(
    "pointermove",
    (e) => {
      if (!swallowed.has(e.pointerId)) return;
      e.stopImmediatePropagation();
      const f = fingers.get(e.pointerId);
      if (f) {
        f.x = e.clientX;
        f.y = e.clientY;
      }
      if (!pinch || !pinch.ids.includes(e.pointerId)) return;
      const m = middle(),
        { u, v } = share(pinch.canvas, m.x, m.y),
        zoom = pinch.zoom;
      zoom.z = Math.min(MAX, Math.max(PINCH_MIN, (pinch.z * m.spread) / pinch.spread));
      const s = 1 / zoom.z;
      // The point first under the fingers' middle stays under it as they move.
      zoom.x = pinch.px - u * s;
      zoom.y = pinch.py - v * s;
      hold(zoom);
      tick();
    },
    true,
  );
  const up = (e: PointerEvent) => {
    if (!e.isTrusted) return;
    fingers.delete(e.pointerId);
    if (!swallowed.has(e.pointerId)) return;
    e.stopImmediatePropagation();
    swallowed.delete(e.pointerId);
    quietUntil = performance.now() + 450;
    if (pinch && pinch.ids.includes(e.pointerId)) {
      const zoom = pinch.zoom;
      pinch = null;
      // Let go: back to the usual view, smoothly.
      zoom.back = { from: { z: zoom.z, x: zoom.x, y: zoom.y }, start: performance.now() };
      tick();
    }
  };
  window.addEventListener("pointerup", up, true);
  window.addEventListener("pointercancel", up, true);
  // A pinch is not a tap: a click the browser makes from its fingers is not passed on.
  window.addEventListener(
    "click",
    (e) => {
      if (performance.now() < quietUntil && zooms.has(e.target as HTMLCanvasElement)) e.stopImmediatePropagation();
    },
    true,
  );
}
