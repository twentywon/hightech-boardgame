import { REDS } from "./sim";

/**
 * The betting layout, free of Three.js: every place a chip can go (a spot), what it covers and pays, where it lies on
 * the felt, and which spot a tap at a place of the felt means.
 *
 * The felt in its own coordinates (the view lays it on the table): x along the layout's length, z toward the player.
 * The numbers stand in 12 columns of 3 (column c holds 3c+1 nearest the player, 3c+3 farthest), each cell `W` wide and
 * `H` deep, the grid centred on the origin; 0 at the left end, the three 2 to 1 boxes at the right end; under the grid
 * (toward the player) the dozens, and under them the six even-money boxes.
 */
export const W = 0.3,
  H = 0.36,
  /** The depth of the dozens' row and of the even-money row. */
  ROW = 0.3,
  /** How near a line or a corner a tap must be (each way) to bet on it rather than on the number under it. */
  NEAR = 0.065;
export type Kind = "straight" | "split" | "street" | "corner" | "line" | "column" | "dozen" | "red" | "black" | "even" | "odd" | "low" | "high";
export interface Spot {
  kind: Kind;
  /** The numbers it wins on. */
  numbers: number[];
  /** Where its chips lie on the felt. */
  x: number;
  z: number;
  /** Its name, for the status line and the guide. */
  name: string;
}
/** Paid to one: by how many numbers a bet covers (a straight up 35, a split 17, … an even chance 1). */
export const payoutOf = (count: number) => 36 / count - 1;
/** Bets on the numbers themselves and the lines between them ("inside"), and the boxes round them ("outside"). */
export const inside = (kind: Kind) => kind === "straight" || kind === "split" || kind === "street" || kind === "corner" || kind === "line";
/** The table's limits: the most on one inside spot and on one outside box. */
export const INSIDE_MOST = 100,
  OUTSIDE_MOST = 500;
export const limitOf = (spot: Spot) => (inside(spot.kind) ? INSIDE_MOST : OUTSIDE_MOST);

const left = -6 * W,
  far = -1.5 * H,
  near = 1.5 * H;
/** The middle of the number's cell (0 is the tall cell left of the grid). */
export function cellOf(n: number) {
  if (n === 0) return { x: left - W / 2, z: 0 };
  const c = Math.floor((n - 1) / 3),
    r = 2 - ((n - 1) % 3);
  return { x: left + (c + 0.5) * W, z: far + (r + 0.5) * H };
}
const at = (c: number, r: number) => 3 * c + (3 - r);
const sorted = (list: number[]) => [...list].sort((a, b) => a - b);

function build() {
  const list: Spot[] = [];
  const add = (kind: Kind, numbers: number[], x: number, z: number, name: string) => list.push({ kind, numbers: sorted(numbers), x, z, name });
  for (let n = 0; n <= 36; n++) add("straight", [n], cellOf(n).x, cellOf(n).z, `${n}`);
  // Splits across a column's cells, then along a row, then with 0.
  for (let c = 0; c < 12; c++)
    for (let r = 0; r < 2; r++) add("split", [at(c, r), at(c, r + 1)], left + (c + 0.5) * W, far + (r + 1) * H, `${at(c, r + 1)}·${at(c, r)} 스플릿`);
  for (let c = 0; c < 11; c++)
    for (let r = 0; r < 3; r++) add("split", [at(c, r), at(c + 1, r)], left + (c + 1) * W, far + (r + 0.5) * H, `${at(c, r)}·${at(c + 1, r)} 스플릿`);
  for (let r = 0; r < 3; r++) add("split", [0, at(0, r)], left, far + (r + 0.5) * H, `0·${at(0, r)} 스플릿`);
  // Streets on the near edge of a column; the trios with 0 at its corners with the first column.
  for (let c = 0; c < 12; c++) add("street", [at(c, 0), at(c, 1), at(c, 2)], left + (c + 0.5) * W, near, `${at(c, 2)}~${at(c, 0)} 스트리트`);
  add("street", [0, 1, 2], left, far + 2 * H, "0·1·2 트리오");
  add("street", [0, 2, 3], left, far + H, "0·2·3 트리오");
  // Corners where four cells meet, and 0·1·2·3 at the near corner of 0 and the first column.
  for (let c = 0; c < 11; c++)
    for (let r = 0; r < 2; r++) add("corner", [at(c, r), at(c, r + 1), at(c + 1, r), at(c + 1, r + 1)], left + (c + 1) * W, far + (r + 1) * H, `${at(c, r + 1)}·${at(c + 1, r)} 코너`);
  add("corner", [0, 1, 2, 3], left, near, "0·1·2·3 코너");
  // Six lines where a column's near edge meets the next.
  for (let c = 0; c < 11; c++) add("line", [at(c, 0), at(c, 1), at(c, 2), at(c + 1, 0), at(c + 1, 1), at(c + 1, 2)], left + (c + 1) * W, near, `${at(c, 2)}~${at(c + 1, 0)} 식스 라인`);
  // The three columns (2 to 1) at the right end, the far one holding 3, 6, … 36.
  for (let r = 0; r < 3; r++) {
    const numbers = Array.from({ length: 12 }, (_, c) => at(c, r));
    add("column", numbers, -left + W / 2, far + (r + 0.5) * H, `${3 - r}번째 줄`);
  }
  for (let d = 0; d < 3; d++) add("dozen", Array.from({ length: 12 }, (_, k) => 12 * d + k + 1), left + (4 * d + 2) * W, near + ROW / 2, `${12 * d + 1}~${12 * d + 12}`);
  const all = Array.from({ length: 36 }, (_, k) => k + 1),
    even: [Kind, number[], string][] = [
      ["low", all.filter((n) => n <= 18), "1~18"],
      ["even", all.filter((n) => n % 2 === 0), "짝수"],
      ["red", REDS, "빨강"],
      ["black", all.filter((n) => !REDS.includes(n)), "검정"],
      ["odd", all.filter((n) => n % 2 === 1), "홀수"],
      ["high", all.filter((n) => n > 18), "19~36"],
    ];
  even.forEach(([kind, numbers, name], k) => add(kind, numbers, left + (2 * k + 1) * W, near + ROW * 1.5, name));
  return list;
}
export const SPOTS: Spot[] = build();
const KEY = new Map(SPOTS.map((spot, id) => [`${spot.kind}:${spot.numbers.join(",")}`, id]));
const find = (kind: Kind, numbers: number[]) => KEY.get(`${kind}:${sorted(numbers).join(",")}`) ?? -1;
/** The spot that wins on exactly `numbers` as `kind`, or -1. */
export const spotOf = find;
/** The whole felt the layout covers: from 0's left edge to the 2 to 1 boxes, from the far row to the even chances. */
export const FELT = { left: left - W, right: -left + W, far, near: near + 2 * ROW };

/**
 * The spot a tap at (x, z) of the felt means, or -1 off the layout. On the grid: near a corner where four cells meet
 * a corner bet, near a line between two cells a split, on the near edge a street (a six line where two meet);
 * along 0's edge a split with 0 (a trio at a corner, 0·1·2·3 at the near end); otherwise the number itself.
 */
export function spotAt(x: number, z: number): number {
  if (x < FELT.left || x > FELT.right || z < FELT.far || z > FELT.near) return -1;
  const u = (x - left) / W,
    v = (z - far) / H,
    iu = Math.round(u),
    iv = Math.round(v),
    du = Math.abs(u - iu) * W,
    dv = Math.abs(v - iv) * H,
    onV = du <= NEAR && iu >= 0 && iu <= 12,
    onH = dv <= NEAR && iv >= 0 && iv <= 3;
  const inGrid = u >= 0 && u <= 12 && v >= 0 && v <= 3;
  // The near edge of the grid (and just past it): streets and six lines (and 0·1·2·3 at 0's corner).
  if (onH && iv === 3 && u > -NEAR / W && u < 12 + NEAR / W) {
    if (onV && iu === 0) return find("corner", [0, 1, 2, 3]);
    if (onV && iu >= 1 && iu <= 11) return find("line", [...[0, 1, 2].map((r) => at(iu - 1, r)), ...[0, 1, 2].map((r) => at(iu, r))]);
    if (u >= 0 && u <= 12) {
      const c = Math.min(11, Math.floor(u));
      return find("street", [at(c, 0), at(c, 1), at(c, 2)]);
    }
  }
  if (v >= -NEAR / H && v <= 3) {
    // Along 0's edge.
    if (onV && iu === 0 && v >= 0) {
      if (onH && iv === 1) return find("street", [0, 2, 3]);
      if (onH && iv === 2) return find("street", [0, 1, 2]);
      const r = Math.min(2, Math.max(0, Math.floor(v)));
      return find("split", [0, at(0, r)]);
    }
    if (inGrid) {
      const c = Math.min(11, Math.max(0, Math.floor(u))),
        r = Math.min(2, Math.max(0, Math.floor(v)));
      if (onV && onH && iu >= 1 && iu <= 11 && iv >= 1 && iv <= 2) return find("corner", [at(iu - 1, iv - 1), at(iu - 1, iv), at(iu, iv - 1), at(iu, iv)]);
      if (onV && iu >= 1 && iu <= 11) return find("split", [at(iu - 1, r), at(iu, r)]);
      if (onH && iv >= 1 && iv <= 2) return find("split", [at(c, iv - 1), at(c, iv)]);
      return find("straight", [at(c, r)]);
    }
    if (u < 0 && v >= 0) return find("straight", [0]);
    if (u > 12 && v >= 0) return find("column", Array.from({ length: 12 }, (_, c) => at(c, Math.min(2, Math.floor(v)))));
  }
  if (z > near && z <= near + ROW && u >= 0 && u < 12) {
    const d = Math.floor(u / 4);
    return find("dozen", Array.from({ length: 12 }, (_, k) => 12 * d + k + 1));
  }
  if (z > near + ROW && u >= 0 && u < 12) return SPOTS.length - 6 + Math.floor(u / 2);
  return -1;
}
/** What a spot pays on `number`: its winnings (not counting the stake), or 0 when it loses. */
export const winsOn = (spot: Spot, number: number) => (spot.numbers.includes(number) ? payoutOf(spot.numbers.length) : 0);
