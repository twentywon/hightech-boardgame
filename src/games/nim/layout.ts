import type { TableSubject } from "../table/view";

/*
 * Where everything of 님 and 아이스크림 31 stands, in table units, free of Vite-only imports so that browser tests can
 * aim with the same numbers as the views. The table top is at y = 0.
 *
 * 님: a rack along x (the open end of its rod at the left), its rod at z = `RACK_Z`; my tray in front of it (z
 * greater), the other side's behind. Ring `j` counts from the right end of the rod (0 is the last ring to be taken),
 * so the ring at place `k` from the open end of a rod with `left` rings is `j = left - 1 - k`.
 *
 * 아이스크림 31: the scoops in four rows of eight on the counter, read left to right from the back row to the front
 * one; my bowl in front of them, the other side's behind.
 */
/** A ring: its outer and inner radius, and its width along the rod. */
export const RING = { outer: 0.46, inner: 0.2, width: 0.15 };
/** From one ring's middle to the next along the rod. */
export const PITCH = 0.162;
/** The base: its height and depth; the end boards' thickness and height; the rod's radius. */
export const BASE = { height: 0.16, depth: 1.25 },
  END = { thickness: 0.14, height: 1.3 },
  ROD_RADIUS = 0.12;
/** The rings hang on the rod a little above the base: their middle, and the rod's. */
export const RING_Y = BASE.height + 0.06 + RING.outer,
  ROD_Y = RING_Y + RING.inner - ROD_RADIUS;
/** The rack stands a little toward the near side, so that the far edge of the view is clear for the lettering laid over it. */
export const RACK_Z = 0.42;
/** Between the rod's open tip and the left end board, wide enough for a ring to slip off. */
export const GAP = 0.36;
/** The trays: how far their middles are in front of and behind the rod, their inside depth, and a stack of five lying rings a place. */
export const TRAY = { offset: 1.34, depth: 1.12, floor: 0.045, rim: 0.2 },
  STACK = 0.98;
/** How long the bare part of the rod is at the start. */
export const bareOf = (total: number) => 1.4 + total * 0.02;
/** The rack's span along x: the rod's open tip, the inner face of the right end board, and the outer faces of the two end boards. */
export function rackOf(total: number) {
  const rod = bareOf(total) + total * PITCH,
    whole = END.thickness + GAP + rod + END.thickness,
    leftBoard = -whole / 2,
    tip = leftBoard + END.thickness + GAP,
    right = tip + rod;
  return { leftBoard, tip, right, rightBoard: right + END.thickness };
}
/** The middle of ring `j` (counted from the right end) on the rod. */
export function ringAt(total: number, j: number) {
  return { x: rackOf(total).right - 0.03 - (j + 0.5) * PITCH, y: RING_Y, z: RACK_Z };
}
/**
 * A point on the outer rim of ring `j` as it is seen from the camera (above it and toward the near side), where a tap
 * strikes that ring and no other: the rims of the rings side by side make one round surface.
 */
export function ringRim(total: number, j: number) {
  const at = ringAt(total, j);
  return { x: at.x, y: at.y + RING.outer * 0.72, z: at.z + RING.outer * 0.66 };
}
/**
 * How many stacks of five a tray has: enough for six rings in ten, which is more than either side takes in all but
 * the most lopsided games; past that the rings lie a second layer deep on the stacks.
 */
export const stacksOf = (total: number) => Math.max(2, Math.ceil((total * 0.6) / 5));
/**
 * Where a tray lies along x: the other side's behind the rack from its left end, where the rings slip off; mine in
 * front of the middle of the rack, so that the table's lower corners stay clear for the lettering laid over the left
 * one and the buttons in the right one.
 */
export function trayOf(total: number, side: 0 | 1) {
  const rack = rackOf(total),
    length = stacksOf(total) * STACK + 0.16,
    x0 = side === 0 ? -length / 2 : rack.leftBoard - 0.06;
  return { x0, x1: x0 + length, z: RACK_Z + (side === 0 ? TRAY.offset : -TRAY.offset) };
}
/** Where the `k`-th ring `side` has taken lies in its tray: in stacks of five, lying flat, from the left. */
export function stackSpot(total: number, side: 0 | 1, k: number) {
  const tray = trayOf(total, side),
    stacks = stacksOf(total),
    stack = Math.floor(k / 5) % stacks,
    level = (k % 5) + 5 * Math.floor(k / (5 * stacks));
  return { x: tray.x0 + 0.08 + STACK / 2 + stack * STACK, y: TRAY.floor + (level + 0.5) * RING.width, z: tray.z };
}
/** Half the rack's length, from its middle to the outer face of an end board, and a little more. */
const rackHalf = (total: number) => Math.max(rackOf(total).rightBoard, -rackOf(total).leftBoard) + 0.12;
/**
 * How far the view of the rack is moved to the left on a short, wide screen (a phone held sideways), where the
 * lettering at the table's lower left would otherwise stand over the left end of the rack, where the rings slip off:
 * the rack then stands in the right part of the view, the lettering on the desk beside it.
 */
export const nimShift = (total: number, aspect: number) => (aspect >= 1.9 ? 0.25 * rackHalf(total) : 0);
/** What the camera keeps in view of the rack: the whole rod with its end boards and both trays (and room for the lettering where `nimShift` asks). */
export function nimSubject(total: number, aspect: number): TableSubject {
  return { half: rackHalf(total) + nimShift(total, aspect), halfZ: RACK_Z + TRAY.offset + TRAY.depth / 2 + 0.12, height: END.height, lookY: 0.4, tilt: aspect < 1.2 ? 0.66 : 0.6 };
}

/** The counter of scoops: eight to a row, four rows; a cup's middle, the cup's height and the scoop's radius. */
export const COLS = 8,
  ROWS = 4,
  COL_STEP = 0.96,
  ROW_STEP = 1.02;
export const CUP = { height: 0.32, top: 0.3, bottom: 0.21 },
  SCOOP_RADIUS = 0.29,
  /** The middle of a scoop sitting in its cup. */
  SCOOP_Y = CUP.height + SCOOP_RADIUS * 0.5;
/** The middle of cup `n` (1 to 31) on the counter; the 32nd place holds the card with the rule. */
export function cupAt(n: number) {
  const i = n - 1,
    row = Math.floor(i / COLS),
    col = i % COLS;
  return { x: (col - (COLS - 1) / 2) * COL_STEP, z: (row - (ROWS - 1) / 2) * ROW_STEP };
}
/** Where a tap on scoop `n` aims: the top of the scoop. */
export function scoopTop(n: number) {
  const at = cupAt(n);
  return { x: at.x, y: SCOOP_Y + SCOOP_RADIUS * 0.8, z: at.z };
}
/** The two bowls: mine in front of the scoops, the other side's behind them. */
export const BOWL = { z: 3.1, radius: 0.98, height: 0.5 };
export const bowlAt = (side: 0 | 1) => ({ x: 0, z: side === 0 ? BOWL.z : -BOWL.z });
/** A scoop in a bowl is a little smaller than in its cup. */
export const HEAP_SCALE = 0.86;
/**
 * Where the `k`-th scoop a side has eaten lies in its bowl, from the bowl's middle at the counter: a heap that rises
 * ring by ring, every ring a little narrower than the one under it.
 */
export function heapSpot(k: number) {
  const layers: [number, number, number, number][] = [
    // count, radius, height, turn: wide and low first, so that a heap in my bowl hides little of the front row
    [1, 0, 0.24, 0],
    [7, 0.56, 0.3, 0],
    [1, 0, 0.56, 0],
    [7, 0.44, 0.58, 0.45],
    [6, 0.32, 0.86, 0.1],
    [4, 0.22, 1.1, 0.8],
    [3, 0.14, 1.3, 0.3],
    [2, 0.08, 1.48, 1.2],
  ];
  let i = k;
  for (const [count, radius, height, turn] of layers) {
    if (i < count) {
      const a = turn + (i / count) * Math.PI * 2;
      return { x: Math.cos(a) * radius, y: height, z: Math.sin(a) * radius };
    }
    i -= count;
  }
  return { x: 0, y: 1.64 + i * 0.2, z: 0 };
}
/** What the camera keeps in view of the counter: every scoop and both bowls with their heaps. */
export function iceSubject(aspect: number): TableSubject {
  return { half: aspect < 1.2 ? 3.95 : 4.15, halfZ: BOWL.z + BOWL.radius + 0.1, height: 1.2, lookY: 0.25, tilt: 0.8 };
}
