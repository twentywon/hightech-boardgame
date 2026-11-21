/**
 * Numbers of the shooting game that the view, the simulations and the browser tests share, free of Three.js, the
 * DOM and Vite-only imports: the three places (the arcade booth, the clay range, the forest), where the gun turns
 * and where the eye is at rest and behind the sights, how a drag turns the gun, how the rear sight wanders while the
 * gun is held up, and how the misalignment of rear and front sight becomes the shot's error.
 *
 * World: metres, y up, the shooter looking down −z. A gun turns about its `pivot`, a point on its sight line; aimed,
 * the eye is on that line `back` metres behind the pivot, so that the front sight, the pivot and the point aimed at
 * are on one line through the middle of the screen. Every shot leaves from the pivot.
 */
export type Mode = "bb" | "clay" | "hunt";
export const MODES: { value: Mode; label: string }[] = [
  { value: "clay", label: "클레이 사격" },
  { value: "bb", label: "비비탄 사격" },
  { value: "hunt", label: "사냥" },
];
export const modeOf = (variant: string): Mode => (variant === "clay" || variant === "hunt" ? variant : "bb");
export interface Vec {
  x: number;
  y: number;
  z: number;
}
/** Where the gun points: turned to the right (`yaw`, radians) and up (`pitch`). */
export interface Aim {
  yaw: number;
  pitch: number;
}
/** How far the rear sight stands off the line of the front sight, as the eye sees it (milliradians, x right, y up). */
export interface Offset {
  x: number;
  y: number;
}
export interface Rig {
  /** The point on the sight line the gun turns about, and where every shot leaves from. */
  pivot: Vec;
  /** The eye at rest and the point it looks at. */
  head: Vec;
  look: Vec;
  /** How far behind the pivot the eye is when aimed; how far before the eye the rear and the front sight stand. */
  back: number;
  rear: number;
  front: number;
  /** The vertical field of view at rest and aimed (degrees). */
  restFov: number;
  aimFov: number;
  /** The field the gun itself is drawn with when aimed (it is drawn over the place by a camera of its own, so that a
   *  narrow field on the place does not blow the gun up). */
  gunFov: number;
  /** How far a press on nothing in particular aims (m). */
  reach: number;
  /** The rear sight's widest wander (mrad as the eye sees it), the mean time between two moments of alignment (s). */
  wander: number;
  period: number;
  /** The shot's error for a milliradian of misalignment. */
  gain: number;
  /** How far the gun may turn either way and down and up (radians). */
  yaws: number;
  pitches: [number, number];
}
export const RIGS: Record<Mode, Rig> = {
  // The rifle on its swivel at the booth's counter; the eye at rest stands behind and above it.
  bb: {
    pivot: { x: 0, y: 1.3, z: 0.18 },
    head: { x: 0, y: 1.62, z: 1.05 },
    look: { x: 0, y: 1.22, z: -4 },
    back: 0.4,
    rear: 0.5,
    front: 1.0,
    restFov: 44,
    aimFov: 22,
    gunFov: 30,
    reach: 4.3,
    wander: 30,
    period: 2.4,
    gain: 0.22,
    yaws: 0.42,
    pitches: [-0.22, 0.16],
  },
  // The over-and-under shotgun held at the ready; aimed, the rib's end and the bead are the two sights.
  clay: {
    pivot: { x: 0, y: 1.52, z: -0.28 },
    head: { x: 0, y: 1.66, z: 0 },
    look: { x: 0, y: 3.2, z: -40 },
    back: 0.3,
    rear: 0.55,
    front: 1.02,
    restFov: 56,
    aimFov: 30,
    gunFov: 34,
    reach: 30,
    wander: 34,
    period: 1.8,
    gain: 0.3,
    yaws: 1.25,
    pitches: [-0.12, 0.8],
  },
  // The hunting rifle with open sights, from a raised stand at the edge of the wood above the meadow and the lake.
  hunt: {
    pivot: { x: 0, y: 5.86, z: -0.28 },
    head: { x: 0, y: 6, z: 0 },
    look: { x: 0, y: 0.6, z: -36 },
    back: 0.3,
    rear: 0.55,
    front: 1.05,
    restFov: 50,
    aimFov: 17,
    gunFov: 30,
    reach: 40,
    wander: 28,
    period: 2.6,
    gain: 0.2,
    yaws: 1.05,
    pitches: [-0.6, 0.55],
  },
};
/** How long the gun takes to come up to the eye after a press (ms): let go sooner and it is lowered without a shot. */
export const RAISE = 260;
/** How long the eye stays at the sights after a shot before it draws back (ms); a press meanwhile carries on from there. */
export const FOLLOW = 520;
/** A unit vector along an aim. */
export function direction(aim: Aim): Vec {
  const c = Math.cos(aim.pitch);
  return { x: c * Math.sin(aim.yaw), y: Math.sin(aim.pitch), z: -c * Math.cos(aim.yaw) };
}
/** The aim that points along `d` (any length). */
export function aimAlong(d: Vec): Aim {
  const flat = Math.hypot(d.x, d.z);
  return { yaw: Math.atan2(d.x, -d.z), pitch: Math.atan2(d.y, flat) };
}
/** The aim from the pivot of `mode` at the point `at`, kept within the gun's reach. */
export function aimAt(mode: Mode, at: Vec): Aim {
  const p = RIGS[mode].pivot;
  return clampAim(mode, aimAlong({ x: at.x - p.x, y: at.y - p.y, z: at.z - p.z }));
}
export function clampAim(mode: Mode, aim: Aim): Aim {
  const rig = RIGS[mode];
  return { yaw: Math.max(-rig.yaws, Math.min(rig.yaws, aim.yaw)), pitch: Math.max(rig.pitches[0], Math.min(rig.pitches[1], aim.pitch)) };
}
/** The screen's right and up for a line of sight along `d` (the world's up kept upright). */
export function basis(d: Vec) {
  let rx = -d.z,
    rz = d.x;
  const n = Math.hypot(rx, rz) || 1;
  rx /= n;
  rz /= n;
  // up = right × d
  const ux = -rz * d.y,
    uy = rz * d.x - rx * d.z,
    uz = rx * d.y;
  return { right: { x: rx, y: 0, z: rz }, up: { x: ux, y: uy, z: uz } };
}
/** Where the eye is when the gun is aimed along `aim`: on the sight line, `back` behind the pivot. */
export function sightEye(mode: Mode, aim: Aim): Vec {
  const rig = RIGS[mode],
    d = direction(aim);
  return { x: rig.pivot.x - d.x * rig.back, y: rig.pivot.y - d.y * rig.back, z: rig.pivot.z - d.z * rig.back };
}
/**
 * The shot's error from the sights as they stood (mrad, x right, y up): the front sight's place against the rear
 * sight's, times the gun's `gain`. The front sight stays where I aim and the rear sight wanders off it by `offset`,
 * so the front stands at −offset from the rear: a rear sight sunk low leaves the front sight high in it, and the shot
 * goes high. Aligned (no offset), the shot goes exactly where the front sight points.
 */
export function shotError(mode: Mode, offset: Offset): Offset {
  const g = RIGS[mode].gain;
  return { x: -offset.x * g + 0, y: -offset.y * g + 0 };
}
/** The way a shot goes: along the aim, turned off it by the error of the sights (mrad on the screen's axes). */
export function shotDirection(aim: Aim, error: Offset): Vec {
  const d = direction(aim),
    { right, up } = basis(d),
    ex = error.x / 1000,
    ey = error.y / 1000,
    v = { x: d.x + right.x * ex + up.x * ey, y: d.y + right.y * ex + up.y * ey, z: d.z + right.z * ex + up.z * ey },
    n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
}
/**
 * The rear sight's wander `t` seconds after the gun came up (mrad as the eye sees it): a slow swell that comes down
 * to nothing every `period` seconds or so (the moments when rear and front sight line up) and up again to `wander`,
 * its way turning slowly round. Smooth at every moment; `seed` (any number) starts each hold somewhere else in it,
 * always well off the line. While the gun comes up (the first `RAISE` ms) the rear sight also rises into place.
 */
export function wander(mode: Mode, t: number, seed: number): Offset {
  const rig = RIGS[mode];
  let s = (Math.abs(Math.floor(seed * 7919)) % 2147483646) + 1;
  const next = () => (s = (s * 16807) % 2147483647) / 2147483647,
    a = next(),
    b = next(),
    c = next(),
    d = next(),
    // The swell: it starts near its widest and comes down to nothing once each period, a little irregularly.
    theta = Math.PI * (0.85 + 0.3 * a) + (2 * Math.PI * t) / rig.period + 0.55 * Math.sin((2 * Math.PI * t) / (rig.period * 2.3) + 6.28 * b),
    swell = 0.5 - 0.5 * Math.cos(theta),
    // Its way round: slowly turning, now quicker, now slower.
    phi = 6.28 * c + 0.7 * t + 0.9 * Math.sin(2 * Math.PI * 0.19 * t + 6.28 * d),
    size = rig.wander * swell,
    rise = t * 1000 < RAISE ? (1 - (t * 1000) / RAISE) ** 2 * rig.wander * 2.2 : 0;
  return { x: size * Math.cos(phi) + 0, y: size * Math.sin(phi) - rise + 0 };
}
/** The misalignment in one number (mrad). */
export const misalignment = (o: Offset) => Math.hypot(o.x, o.y);
/** Within this (mrad), the sights glow as lined up. */
export const LINED_UP = 2.5;
/**
 * The turn of the gun for a drag of `dx`, `dy` CSS pixels (y down) on a canvas `height` pixels tall: the world under
 * the sights moves as far as the finger does, at the aimed field of view.
 */
export function dragTurn(mode: Mode, dx: number, dy: number, height: number): Aim {
  const k = ((RIGS[mode].aimFov * Math.PI) / 180) / Math.max(1, height);
  return { yaw: dx * k, pitch: -dy * k };
}
/** The drag (pixels) that turns the gun by `turn`, the inverse of `dragTurn`. */
export function dragFor(mode: Mode, turn: Aim, height: number) {
  const k = ((RIGS[mode].aimFov * Math.PI) / 180) / Math.max(1, height);
  return { dx: turn.yaw / k, dy: -turn.pitch / k };
}
/** The turn from one aim to another, the shorter way round. */
export function turnBetween(from: Aim, to: Aim): Aim {
  return { yaw: to.yaw - from.yaw, pitch: to.pitch - from.pitch };
}
/** Reads an aim or an offset written as "a,b" into a data attribute. */
export const pair = (text: string | null | undefined) => {
  const [a, b] = (text ?? "").split(",").map(Number);
  return { a: a || 0, b: b || 0 };
};
/** What the camera keeps in view before the eye takes over (the table view's own framing is not used). */
export const SHOOT_SUBJECT = { half: 2, halfZ: 2, height: 1, lookY: 1.2, tilt: 0.1 };
