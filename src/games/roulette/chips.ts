import * as T from "three";
import { CHIPS } from "./rules";

/**
 * Casino chips as they are made: a clay disc in its colour, six inserts let into its edge that run over onto both faces,
 * a ring of fine dashes, and a white inlay with its value. Every chip of a value is one instance of one mesh, so a
 * table full of stacks costs three draws a value (its edge and its two faces) however many chips lie on it.
 */
type Keep = <R extends { dispose(): void }>(r: R) => R;
export const CHIP_R = 0.105,
  CHIP_H = 0.026;
export const CHIP_PAINT: Record<number, { body: string; insert: string; ink: string }> = {
  1: { body: "#f1ede2", insert: "#2a5fc2", ink: "#244f9e" },
  5: { body: "#c4271f", insert: "#f6f0e1", ink: "#a51e18" },
  25: { body: "#1f8448", insert: "#f6f0e1", ink: "#176b3a" },
  100: { body: "#18181c", insert: "#e6bf55", ink: "#18181c" },
};
const INSERTS = 6;
function picture(keep: Keep, w: number, h: number, paint: (pen: CanvasRenderingContext2D) => void, fine = true) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const texture = keep(new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = fine ? 8 : 1;
  return texture;
}
/** A chip's edge, all the way round: its colour, the six inserts, and the faint lines of the moulding. */
function edge(keep: Keep, value: number, fine: boolean) {
  const p = CHIP_PAINT[value];
  return picture(keep, 512, 32, (pen) => {
    pen.fillStyle = p.body;
    pen.fillRect(0, 0, 512, 32);
    pen.fillStyle = p.insert;
    for (let k = 0; k < INSERTS; k++) pen.fillRect(((k + 0.5) / INSERTS) * 512 - 15, 0, 30, 32);
    pen.fillStyle = "rgba(0,0,0,0.18)";
    pen.fillRect(0, 0, 512, 2);
    pen.fillRect(0, 30, 512, 2);
  }, fine);
}
/** A chip's face: the inserts over its rim, a ring of dashes, a white inlay with a fine ring and its value. */
function face(keep: Keep, value: number, fine: boolean) {
  const p = CHIP_PAINT[value];
  return picture(keep, 256, 256, (pen) => {
    const c = 128;
    pen.fillStyle = p.body;
    pen.beginPath();
    pen.arc(c, c, 128, 0, Math.PI * 2);
    pen.fill();
    // The inserts: wedges at the rim, lined up with those on the edge (the cylinder's seam is at angle 0).
    pen.fillStyle = p.insert;
    for (let k = 0; k < INSERTS; k++) {
      const a = ((k + 0.5) / INSERTS) * Math.PI * 2 - Math.PI / 2,
        half = 0.13;
      pen.beginPath();
      pen.arc(c, c, 128, a - half, a + half);
      pen.arc(c, c, 98, a + half * 1.1, a - half * 1.1, true);
      pen.closePath();
      pen.fill();
    }
    // The dashes round the inlay.
    pen.strokeStyle = p.insert;
    pen.lineWidth = 6;
    pen.setLineDash([5, 7]);
    pen.beginPath();
    pen.arc(c, c, 86, 0, Math.PI * 2);
    pen.stroke();
    pen.setLineDash([]);
    const inlay = pen.createRadialGradient(c, c - 20, 10, c, c, 74);
    inlay.addColorStop(0, "#fffdf7");
    inlay.addColorStop(1, "#ece5d3");
    pen.fillStyle = inlay;
    pen.beginPath();
    pen.arc(c, c, 72, 0, Math.PI * 2);
    pen.fill();
    pen.strokeStyle = p.ink;
    pen.lineWidth = 2.5;
    pen.beginPath();
    pen.arc(c, c, 64, 0, Math.PI * 2);
    pen.stroke();
    pen.fillStyle = p.ink;
    pen.font = `700 ${value >= 100 ? 54 : 66}px "Georgia", "Times New Roman", serif`;
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText(String(value), c, c + 3);
    pen.font = `700 11px "Inter", sans-serif`;
    pen.fillText("WORLD TABLE", c, c - 42);
    pen.fillText("CASINO", c, c + 44);
  }, fine);
}
/** The chips' shapes and paints, made once for a table. */
export class ChipKit {
  readonly geometry: T.BufferGeometry;
  readonly materials = new Map<number, T.Material[]>();
  constructor(keep: Keep, rich: boolean) {
    const g = keep(new T.CylinderGeometry(CHIP_R, CHIP_R, CHIP_H, rich ? 48 : 18, 1));
    this.geometry = g;
    for (const value of CHIPS) {
      const side = keep(new T.MeshStandardMaterial({ map: edge(keep, value, rich), roughness: 0.55 })),
        top = keep(rich ? new T.MeshPhysicalMaterial({ map: face(keep, value, rich), roughness: 0.42, clearcoat: 0.3, clearcoatRoughness: 0.3 }) : new T.MeshStandardMaterial({ map: face(keep, value, rich), roughness: 0.45 }));
      this.materials.set(value, [side, top, top]);
    }
  }
}
/** Chips laid anywhere: each value one instanced mesh, filled afresh with `begin`, `put` and `end`. */
export class ChipPile {
  readonly group = new T.Group();
  private meshes = new Map<number, T.InstancedMesh>();
  private counts = new Map<number, number>();
  private matrix = new T.Matrix4();
  private q = new T.Quaternion();
  private e = new T.Euler();
  private s = new T.Vector3(1, 1, 1);
  constructor(kit: ChipKit, keep: Keep, rich: boolean, most = 240) {
    for (const value of CHIPS) {
      const mesh = keep(new T.InstancedMesh(kit.geometry, kit.materials.get(value)!, most) as T.InstancedMesh & { dispose(): void });
      mesh.count = 0;
      mesh.castShadow = rich;
      mesh.receiveShadow = rich;
      mesh.frustumCulled = false;
      this.meshes.set(value, mesh);
      this.group.add(mesh);
    }
  }
  begin() {
    for (const value of CHIPS) this.counts.set(value, 0);
  }
  /** A chip of `value` with its middle at (x, y, z), turned `turn` about the upright and tipped `tip` (radians) about x; `scale` shrinks it as it goes. */
  put(value: number, x: number, y: number, z: number, turn = 0, tip = 0, scale = 1) {
    const mesh = this.meshes.get(value)!,
      n = this.counts.get(value)!;
    if (n >= mesh.instanceMatrix.count) return;
    this.e.set(tip, turn, 0);
    this.q.setFromEuler(this.e);
    this.s.setScalar(scale);
    this.matrix.compose(new T.Vector3(x, y, z), this.q, this.s);
    mesh.setMatrixAt(n, this.matrix);
    this.counts.set(value, n + 1);
  }
  end() {
    for (const [value, mesh] of this.meshes) {
      mesh.count = this.counts.get(value) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
