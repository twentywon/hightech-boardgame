import { inside, type Point } from "./rules";
export const SPACING = 0.72;
export const toWorld = ({ row, col }: Point) => ({
  x: (col - 3.5) * SPACING,
  z: (row - 3.5) * SPACING,
});
export function fromWorld(x: number, z: number): Point | null {
  const p = {
    row: Math.floor(z / SPACING + 4),
    col: Math.floor(x / SPACING + 4),
  };
  return inside(p) ? p : null;
}
