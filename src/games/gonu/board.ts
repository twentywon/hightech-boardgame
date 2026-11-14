import { strokeLines, type BoardSpec } from "../points/view";
import { LINES, type Variant } from "./rules";

const POINTS: Record<Variant, { x: number; z: number }[]> = {
  well: [[-2.8, -2.8], [2.8, -2.8], [-2.8, 2.8], [2.8, 2.8], [0, 0]].map(([x, z]) => ({ x, z })),
  line: Array.from({ length: 16 }, (_, i) => ({ x: ((i % 4) - 1.5) * 2, z: (Math.floor(i / 4) - 1.5) * 2 })),
  pumpkin: [
    [-2.1, -3.9], [0, -3.9], [2.1, -3.9],
    [0, -2.2], [2.2, 0], [0, 2.2], [-2.2, 0], [0, 0],
    [-2.1, 3.9], [0, 3.9], [2.1, 3.9],
  ].map(([x, z]) => ({ x, z })),
  // The loops round the corners need room: the grid is drawn smaller.
  car: Array.from({ length: 16 }, (_, i) => ({ x: ((i % 4) - 1.5) * 1.5, z: (Math.floor(i / 4) - 1.5) * 1.5 })),
  // Corners and side middles of three squares, clockwise from the top left.
  cham: [3.9, 2.6, 1.3].flatMap((reach) =>
    [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]].map(([x, z]) => ({ x: x * reach, z: z * reach })),
  ),
};
/** A gonu board scratched into the earth of the yard, with pebbles for pieces. */
export const gonuBoard = (variant: string): BoardSpec => {
  const v = (variant in POINTS ? variant : "well") as Variant,
    points = POINTS[v];
  return {
    points,
    half: 4.4,
    centreZ: 0.55,
    theme: "yard",
    radius: v === "well" ? 0.56 : v === "cham" ? 0.34 : v === "car" ? 0.4 : 0.48,
    colors: ["#2f3438", "#efe7d6"],
    // The same view of the yard as yut nori.
    subject: { half: 4.3, halfZ: 5.6, height: 0.5, lookY: 0, tilt: 0.98 },
    paint(ctx, px, unit) {
      // The ring of pumpkin gonu is drawn as a circle, not as four chords.
      const ring = v === "pumpkin" ? [3, 4, 5, 6] : [];
      strokeLines(
        ctx,
        px,
        points,
        LINES[v].filter(([a, b]) => !(ring.includes(a) && ring.includes(b))),
      );
      if (v === "pumpkin") {
        ctx.beginPath();
        ctx.arc(...px(0, 0), unit * 2.2, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (v === "car") {
        // A loop round each corner joins the ends of the two lines next to it.
        const turns: [number, number, number][] = [
          [0, Math.PI / 2, Math.PI * 2],
          [3, Math.PI, Math.PI / 2],
          [15, Math.PI * 1.5, Math.PI],
          [12, 0, Math.PI * 1.5],
        ];
        for (const [corner, from, to] of turns) {
          ctx.beginPath();
          ctx.arc(...px(points[corner].x, points[corner].z), unit * 1.5, from, to);
          ctx.stroke();
        }
      }
      if (v === "well") {
        // The well closes the side that has no line.
        ctx.beginPath();
        ctx.arc(...px(3.35, 0), unit * 0.75, 0, Math.PI * 2);
        ctx.stroke();
      }
      for (const p of points) {
        ctx.beginPath();
        ctx.arc(...px(p.x, p.z), unit * 0.16, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  };
};
