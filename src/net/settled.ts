/**
 * The host's word on where a shot ended (와이파이 여럿이 for the shot games: curling, pool, bowling, golf …).
 *
 * A room keeps a game as a list of moves that every device plays through `play`. A shot game's `play` runs its
 * physics in floating point, with `Math.hypot`, `Math.sin`, `Math.atan2` and the like, which two browsers or two
 * phones need not round alike: a replay could end a hair apart, and the next shot from there far apart. So for such a
 * game (`NetRules.settled`) the host sends its own state after each move along with it (and with a resync), and every
 * other device takes that state over its own (`adopt`). A device still plays the move itself first, to show the shot
 * as it goes; where its result is the host's to the last bit (nearly always) nothing changes, and where it is not, the
 * parts that differ are replaced by the host's, so every device goes on from the host's very numbers.
 */

/** Whether two values read alike as JSON (a key holding `undefined` is a key missing; -0 is 0). */
export function alike(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number") return a === b || (Number.isNaN(a) && Number.isNaN(b));
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return a === undefined ? b === undefined : false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((x, i) => alike(x, other[i]));
  }
  const x = a as Record<string, unknown>,
    y = b as Record<string, unknown>;
  for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) if (!alike(x[key], y[key])) return false;
  return true;
}

/**
 * `mine` with every part that differs from `told` replaced by `told`'s: what agrees keeps its own objects (so a view
 * that asks whether something is the same object as before still can), what does not is the host's.
 */
export function merge<T>(mine: T, told: unknown): T {
  if (alike(mine, told)) return mine;
  if (!mine || !told || typeof mine !== "object" || typeof told !== "object" || Array.isArray(mine) !== Array.isArray(told)) return told as T;
  if (Array.isArray(told)) {
    const own = mine as unknown[];
    return told.map((x, i) => (i < own.length ? merge(own[i], x) : x)) as T;
  }
  const own = mine as Record<string, unknown>,
    theirs = told as Record<string, unknown>,
    out: Record<string, unknown> = {};
  for (const key of Object.keys(theirs)) out[key] = key in own ? merge(own[key], theirs[key]) : theirs[key];
  return out as T;
}

/** Whether `told` could be a state of the same game as `like`: an object with the same top-level fields. */
export function shaped(like: unknown, told: unknown): boolean {
  if (!like || !told || typeof like !== "object" || typeof told !== "object" || Array.isArray(told)) return false;
  const own = like as Record<string, unknown>,
    theirs = told as Record<string, unknown>;
  return Object.keys(own).every((key) => own[key] === undefined || key in theirs);
}

/**
 * The state a device goes on from after a move the host settled: its own result `mine` (null when its own play
 * refused the move) with the host's `told` over it. A `told` that is no state of the game (`before` shows what one
 * looks like) is not taken: the device keeps its own.
 */
export function adopt<S>(mine: S | null, told: unknown, before: S): S | null {
  if (told === undefined || !shaped(before, told)) return mine;
  return mine === null ? (told as S) : merge(mine, told);
}

/** A short digest of a state as JSON (FNV-1a, 32 bits, in hex): two devices that show the same state show the same. */
export function digest(state: unknown): string {
  const text = JSON.stringify(state) ?? "";
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}
