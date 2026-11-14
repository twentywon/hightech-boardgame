import { inside, type Point } from "./rules";
export const SPACING = 0.42;
export const toWorld = ({ row, col }: Point) => ({
  x: (col - 7) * SPACING,
  z: (row - 7) * SPACING,
});
export function fromWorld(x: number, z: number): Point | null {
  const p = {
    row: Math.round(z / SPACING + 7),
    col: Math.round(x / SPACING + 7),
  };
  return inside(p) &&
    Math.abs(x - (p.col - 7) * SPACING) <= SPACING * 0.48 &&
    Math.abs(z - (p.row - 7) * SPACING) <= SPACING * 0.48
    ? p
    : null;
}
