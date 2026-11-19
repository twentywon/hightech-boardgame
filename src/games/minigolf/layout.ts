import { Plane, Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import { cameraDistance } from "../../engine/camera";
import { HOLES, boxOf, heightAt, type P } from "./course";
import { R, SPEED_MAX, SPEED_MIN, along, aimYaw, yawOf } from "./sim";

/**
 * Numbers of the course that the view and browser tests share, free of Vite-only imports. The nine holes lie side by
 * side across the garden, each played toward −z (toward the sea), hole 1 at the left; `ORIGINS` is where each
 * hole's own coordinates begin.
 */
export const GAP = 1.6;
export const ORIGINS: P[] = (() => {
  const out: P[] = [];
  let right = 0;
  HOLES.forEach((hole, k) => {
    const box = boxOf(hole.outline),
      x = k ? right + GAP - box.x0 : 0;
    out.push({ x, z: 0 });
    right = x + box.x1;
  });
  return out;
})();
/** Where the course begins and ends across the garden. */
export const COURSE = { x0: boxOf(HOLES[0].outline).x0, x1: ORIGINS[8].x + boxOf(HOLES[8].outline).x1 };
/** The middle of a ball lying at a place of hole `k`, in the garden. */
export function ballWorld(k: number, at: P) {
  return new Vector3(ORIGINS[k].x + at.x, heightAt(HOLES[k], at.x, at.z) + R, ORIGINS[k].z + at.z);
}
/** The golfer's eye: behind the ball and above it, looking along the way to play (`yaw`), a little ahead of the ball. */
export const EYE = { back: 1.5, height: 0.95, ahead: 0.8 };
export interface Pose {
  eye: Vector3;
  look: Vector3;
}
export function aimPose(k: number, at: P, yaw = aimYaw(HOLES[k], at)): Pose {
  const ball = ballWorld(k, at),
    d = along(yaw);
  return {
    eye: new Vector3(ball.x - d.x * EYE.back, ball.y + EYE.height, ball.z - d.z * EYE.back),
    look: new Vector3(ball.x + d.x * EYE.ahead, ball.y - R, ball.z + d.z * EYE.ahead),
  };
}
/** The whole hole from above and a little behind its tee, fitted to the canvas by the shared camera distance. */
export function overviewPose(k: number, aspect: number): Pose {
  const box = boxOf(HOLES[k].outline),
    tilt = 1.12,
    subject = { half: (box.x1 - box.x0) / 2 + 0.35, halfZ: (box.z1 - box.z0) / 2 + 0.35, height: 0.5, lookY: 0, tilt },
    distance = cameraDistance(aspect, false, subject),
    cx = ORIGINS[k].x + (box.x0 + box.x1) / 2,
    cz = ORIGINS[k].z + (box.z0 + box.z1) / 2;
  return { eye: new Vector3(cx, Math.sin(tilt) * distance, cz + Math.cos(tilt) * distance), look: new Vector3(cx, 0, cz) };
}
export function setPose(camera: PerspectiveCamera, pose: Pose) {
  camera.position.copy(pose.eye);
  camera.lookAt(pose.look);
  camera.updateMatrixWorld();
}
/** Sets a camera at the golfer's eye over the ball at `at` of hole `k`, as the view does when the ball rests there. */
export function golferCamera(camera: PerspectiveCamera, k: number, at: P) {
  setPose(camera, aimPose(k, at));
}
/**
 * A pull back from the ball strikes it the other way: the length of the pull on the screen, over the canvas's
 * height, is the strength (all of it at `FULL`, nothing for the first `DEAD` pixels), and its direction is taken
 * on the ground, so that the shot goes where the pull points through the ball whatever the eye.
 */
export const FULL = 0.27,
  DEAD = 6,
  /** Weaker than this, a pull strikes nothing. */
  LEAST = 0.015,
  /** Strength rises gently at first, so that short putts can be judged finely. */
  CURVE = 1.6;
export const speedOf = (power: number) => SPEED_MIN + (SPEED_MAX - SPEED_MIN) * Math.pow(Math.max(0, Math.min(1, power)), CURVE);
export const powerOf = (speed: number) => Math.pow(Math.max(0, Math.min(1, (speed - SPEED_MIN) / (SPEED_MAX - SPEED_MIN))), 1 / CURVE);
/** How strong a pull of `length` pixels is on a canvas `height` pixels tall. */
export const pullPower = (length: number, height: number) => Math.max(0, Math.min(1, (length - DEAD) / (FULL * height)));
const ray = new Raycaster(),
  ndc = new Vector2(),
  hit = new Vector3();
/** Where the line of sight through a point of the canvas (pixels from its top left) meets the level plane at height `y`. */
export function planeAt(camera: PerspectiveCamera, x: number, y: number, width: number, height: number, level: number) {
  ndc.set((x / width) * 2 - 1, 1 - (y / height) * 2);
  ray.setFromCamera(ndc, camera);
  return ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -level), hit) ? { x: hit.x, z: hit.z } : null;
}
/** The putt a pull from `from` to `to` (canvas pixels) makes, for a ball whose middle is at height `level`; null for none. */
export function pullShot(camera: PerspectiveCamera, from: { x: number; y: number }, to: { x: number; y: number }, width: number, height: number, level: number) {
  const power = pullPower(Math.hypot(to.x - from.x, to.y - from.y), height);
  if (power < LEAST) return null;
  const a = planeAt(camera, from.x, from.y, width, height, level),
    b = planeAt(camera, to.x, to.y, width, height, level);
  if (!a) return null;
  // Pulled above the horizon, the pull's direction on the screen stands for it.
  const dx = b ? a.x - b.x : -(to.x - from.x),
    dz = b ? a.z - b.z : -(to.y - from.y);
  if (Math.hypot(dx, dz) < 1e-6) return null;
  return { angle: ((yawOf(dx, dz) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), speed: speedOf(power), power };
}
/** Where a point of the garden is on the canvas, in pixels from its top left. */
export function onCanvas(camera: PerspectiveCamera, p: Vector3, width: number, height: number) {
  const v = p.clone().project(camera);
  return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
}
/**
 * The pull, in pixels from the ball's place on the canvas, that strikes the ball at `ball` with `speed` toward
 * `angle` (for browser tests): a point on the ground behind the ball along that line, as far back as makes the
 * pull's length on the screen.
 */
export function pullFor(camera: PerspectiveCamera, ball: Vector3, angle: number, speed: number, width: number, height: number) {
  const start = onCanvas(camera, ball, width, height),
    want = DEAD + FULL * height * powerOf(speed),
    d = along(angle),
    at = (s: number) => onCanvas(camera, new Vector3(ball.x - d.x * s, ball.y, ball.z - d.z * s), width, height);
  let lo = 0,
    hi = 0.05;
  while (hi < 6 && Math.hypot(at(hi).x - start.x, at(hi).y - start.y) < want) hi *= 1.6;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2,
      p = at(mid);
    if (Math.hypot(p.x - start.x, p.y - start.y) < want) lo = mid;
    else hi = mid;
  }
  const end = at((lo + hi) / 2);
  return { start, dx: end.x - start.x, dy: end.y - start.y };
}
