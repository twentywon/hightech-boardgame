import type { Random } from "../core/random";

/**
 * Chance shared by every device of a room: the host draws one seed when a game starts (sent in `start`), and every
 * draw a game makes comes from a stream fixed by that seed and by where in the game it is made, so two devices that
 * play the same moves draw the same numbers in the same order. Stream 0 is the game's creation (a hex conquest map),
 * stream k the k-th move. Rebuilding a game from its move list (a resync, an undo) draws the same again.
 *
 * The seed alone would let anyone who reads the code foresee every roll, so each move's stream also depends on a
 * salt the host draws (`newSeed`) when it accepts the move and sends with it (`NetMove.salt`): nobody can know a
 * roll before the host has taken the move. The salts stay in the move list, so a replay draws the same again.
 */
export function newSeed(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0];
}

/** A 32-bit mix of the seed and the stream's number (two rounds of murmur3's finaliser). */
function mix(seed: number, index: number) {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b9)) >>> 0;
  for (let k = 0; k < 2; k++) {
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}

/** Stream `index` of `seed` under `salt` (0: none, as at a game's creation): mulberry32, a number in [0, 1) a call. */
export function streamFor(seed: number, index: number, salt = 0): Random {
  let a = mix(seed >>> 0, index);
  if (salt) a = mix((a ^ salt) >>> 0, index ^ 0x5a17);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
