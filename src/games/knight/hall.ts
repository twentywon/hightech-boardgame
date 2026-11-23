import * as T from "three";
import { capable, glossy, planks } from "../../engine/scene-utils";

/**
 * The table 나이트의 여행 is played on (the user asked for the five puzzles to be upgraded): an oak table in a
 * castle hall, seen from above, all made in code and of our own design. Round the board, clear of every size of it,
 * lie a steel helm with a slit visor and a red plume, a heater shield painted with our own arms (a gold chevron and
 * three stars on blue), a parchment map of an invented country weighed down at one corner, and an iron candlestick.
 */
type Keep = <R extends { dispose(): void }>(resource: R) => R;
type Paint = (options: T.MeshStandardMaterialParameters) => T.MeshStandardMaterial;
function painted(keep: Keep, width: number, height: number, paint: (pen: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d")!, width, height);
  const texture = keep(new T.CanvasTexture(c));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** A map of an invented land on old parchment: a coast, a river, hills, a forest, a castle and a dotted road (no real place). */
function map(keep: Keep) {
  return painted(keep, 512, 384, (pen, w, h) => {
    const random = sequence(77),
      paper = pen.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, w * 0.7);
    paper.addColorStop(0, "#eedcb0");
    paper.addColorStop(1, "#c9a66a");
    pen.fillStyle = paper;
    pen.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) {
      pen.fillStyle = `rgba(110,70,30,${random() * 0.06})`;
      pen.beginPath();
      pen.arc(random() * w, random() * h, 2 + random() * 14, 0, Math.PI * 2);
      pen.fill();
    }
    // The sea to the right, behind a wandering coast.
    pen.fillStyle = "rgba(70,110,130,0.35)";
    pen.beginPath();
    pen.moveTo(w, 0);
    let x = w * 0.72;
    for (let y = 0; y <= h; y += 16) pen.lineTo((x += (random() - 0.5) * 26), y);
    pen.lineTo(w, h);
    pen.fill();
    pen.strokeStyle = "#5a3a1a";
    pen.lineWidth = 2;
    pen.stroke();
    // A river from the hills to the sea.
    pen.strokeStyle = "rgba(50,90,120,0.7)";
    pen.lineWidth = 3;
    pen.beginPath();
    pen.moveTo(w * 0.12, h * 0.2);
    pen.bezierCurveTo(w * 0.35, h * 0.3, w * 0.4, h * 0.7, w * 0.7, h * 0.62);
    pen.stroke();
    // Hills, trees and a castle in ink.
    pen.strokeStyle = "#4a2e14";
    pen.lineWidth = 2;
    for (let k = 0; k < 7; k++) {
      const hx = w * (0.08 + random() * 0.25),
        hy = h * (0.12 + random() * 0.25);
      pen.beginPath();
      pen.moveTo(hx - 14, hy + 6);
      pen.quadraticCurveTo(hx, hy - 14, hx + 14, hy + 6);
      pen.stroke();
    }
    pen.fillStyle = "#4a5a2a";
    for (let k = 0; k < 26; k++) {
      const tx = w * (0.15 + random() * 0.25),
        ty = h * (0.62 + random() * 0.25);
      pen.beginPath();
      pen.moveTo(tx, ty - 10);
      pen.lineTo(tx - 5, ty + 4);
      pen.lineTo(tx + 5, ty + 4);
      pen.fill();
    }
    const cx = w * 0.5,
      cy = h * 0.42;
    pen.fillStyle = "#5a3a1a";
    pen.fillRect(cx - 14, cy - 10, 28, 18);
    for (const dx of [-16, 10]) pen.fillRect(cx + dx, cy - 20, 6, 28);
    pen.fillRect(cx - 3, cy - 26, 6, 16);
    // A road of dashes, as a knight's way would wind.
    pen.setLineDash([6, 6]);
    pen.strokeStyle = "#7a2a1a";
    pen.beginPath();
    pen.moveTo(w * 0.05, h * 0.9);
    pen.lineTo(w * 0.25, h * 0.7);
    pen.lineTo(cx, cy + 12);
    pen.lineTo(w * 0.62, h * 0.18);
    pen.stroke();
    pen.setLineDash([]);
    // A compass star in a corner.
    pen.translate(w * 0.86, h * 0.84);
    pen.fillStyle = "#5a3a1a";
    for (let k = 0; k < 4; k++) {
      pen.rotate(Math.PI / 2);
      pen.beginPath();
      pen.moveTo(0, -26);
      pen.lineTo(5, 0);
      pen.lineTo(-5, 0);
      pen.fill();
    }
    pen.setTransform(1, 0, 0, 1, 0, 0);
    pen.strokeStyle = "rgba(90,58,26,0.6)";
    pen.lineWidth = 6;
    pen.strokeRect(10, 10, w - 20, h - 20);
  });
}
/** The shield's face: blue, a gold chevron, three gold stars, an iron rim drawn round it. */
function arms(keep: Keep) {
  return painted(keep, 256, 256, (pen, w, h) => {
    pen.fillStyle = "#1f3f7a";
    pen.fillRect(0, 0, w, h);
    pen.fillStyle = "#d9b04a";
    pen.beginPath();
    pen.moveTo(0, h * 0.78);
    pen.lineTo(w / 2, h * 0.38);
    pen.lineTo(w, h * 0.78);
    pen.lineTo(w, h * 0.96);
    pen.lineTo(w / 2, h * 0.56);
    pen.lineTo(0, h * 0.96);
    pen.fill();
    const star = (x: number, y: number, r: number) => {
      pen.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5,
          rr = k % 2 ? r * 0.45 : r;
        pen.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      pen.fill();
    };
    star(w * 0.25, h * 0.2, 22);
    star(w * 0.75, h * 0.2, 22);
    star(w * 0.5, h * 0.8, 20);
  });
}
/** A heater shield's outline: a flat top, sides that curve to a point. */
function heater() {
  const s = new T.Shape();
  s.moveTo(-0.7, 0.8);
  s.lineTo(0.7, 0.8);
  s.lineTo(0.7, 0.1);
  s.quadraticCurveTo(0.66, -0.55, 0, -0.95);
  s.quadraticCurveTo(-0.66, -0.55, -0.7, 0.1);
  s.closePath();
  return s;
}
export interface Hall {
  flames: T.Mesh[];
}
/** Builds the table and what lies on it round a board whose rim reaches `halfX` and `halfZ` from its middle; the rim's foot is at `foot`. */
export function hall(scene: T.Object3D, keep: Keep, paint: Paint, halfX: number, halfZ: number, foot: number): Hall {
  const flames: T.Mesh[] = [],
    add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = scene) => {
      const mesh = new T.Mesh(keep(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
  // The oak table, and a woven runner of green wool under the board.
  const table = add(new T.BoxGeometry(60, 0.2, 60), paint({ ...planks(10, keep), color: "#c8a888" }), 0, foot - 0.1, 0);
  table.castShadow = false;
  const runner = add(new T.BoxGeometry(halfX * 2 + 1.4, 0.02, 60), paint({ color: "#2f5a3a", roughness: 0.95 }), 0, foot + 0.01, 0);
  runner.castShadow = false;
  for (const x of [-(halfX + 0.66), halfX + 0.66]) add(new T.BoxGeometry(0.08, 0.025, 60), paint({ color: "#c9a44a", roughness: 0.6 }), x, foot + 0.012, 0).castShadow = false;
  // The helm: a steel barrel with a flat top, a slit visor, breaths, and a red plume; lying on its side at the left.
  const steel = paint({ color: "#aab2ba", roughness: 0.3, metalness: 0.9 }),
    dark = paint({ color: "#1a1c1f", roughness: 0.6 }),
    helm = new T.Group();
  add(new T.CylinderGeometry(0.55, 0.6, 1.2, 28, 1, true), keep(new T.MeshStandardMaterial({ color: "#aab2ba", roughness: 0.3, metalness: 0.9, side: T.DoubleSide })), 0, 0, 0, helm);
  add(new T.CylinderGeometry(0.55, 0.55, 0.06, 28), steel, 0, 0.6, 0, helm);
  add(new T.BoxGeometry(0.9, 0.06, 0.08), dark, 0, 0.18, 0.56, helm);
  for (const x of [-0.25, -0.12, 0.12, 0.25]) add(new T.BoxGeometry(0.04, 0.16, 0.06), dark, x, -0.2, 0.58, helm);
  add(new T.BoxGeometry(0.06, 1.2, 0.08), steel, 0, 0, 0.6, helm);
  const plume = paint({ color: "#a81e1e", roughness: 0.9 });
  for (let k = 0; k < 5; k++) add(new T.SphereGeometry(0.16, 10, 8).scale(1, 0.6, 2.2), plume, 0, 0.72 + k * 0.03, -0.1 - k * 0.12, helm).rotation.x = -0.3 - k * 0.12;
  helm.rotation.set(0, 0.6, Math.PI / 2);
  helm.position.set(-(halfX + 1.75), foot + 0.6, -halfZ * 0.35);
  scene.add(helm);
  // The shield, lying flat at the near left.
  const shield = new T.Mesh(keep(new T.ExtrudeGeometry(heater(), { depth: 0.08, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.03, bevelSegments: 2 })), [
    keep(glossy({ map: arms(keep), roughness: 0.4 })),
    paint({ color: "#6a6e72", roughness: 0.35, metalness: 0.8 }),
  ]);
  // The face's picture is laid by x and y; the extrusion maps its caps with the shape's own coordinates.
  const uv = shield.geometry.getAttribute("uv");
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) + 0.7) / 1.4, (uv.getY(k) + 0.95) / 1.75);
  shield.rotation.set(-Math.PI / 2, 0, 0.35);
  shield.position.set(-(halfX + 1.6), foot + 0.04, halfZ * 0.55);
  shield.castShadow = shield.receiveShadow = true;
  scene.add(shield);
  // The map, its corner held down by a pebble, at the right; the candlestick behind it.
  const sheet = add(new T.PlaneGeometry(2.2, 1.65, 8, 1).rotateX(-Math.PI / 2), paint({ map: map(keep), roughness: 0.9, side: T.DoubleSide }), halfX + 1.75, foot + 0.03, halfZ * 0.35);
  sheet.rotation.y = -0.3;
  // Its ends curl up a little, as old parchment does.
  const pos = sheet.geometry.getAttribute("position");
  for (let k = 0; k < pos.count; k++) {
    const x = pos.getX(k);
    pos.setY(k, Math.max(0, Math.abs(x) - 0.8) ** 2 * 0.6);
  }
  sheet.geometry.computeVertexNormals();
  add(new T.SphereGeometry(0.16, 12, 8).scale(1, 0.6, 1), paint({ color: "#6a6460", roughness: 0.9 }), halfX + 0.95, foot + 0.1, halfZ * 0.35 + 0.55);
  const iron = paint({ color: "#2c2a28", roughness: 0.5, metalness: 0.6 }),
    wax = paint({ color: "#f0e6cc", roughness: 0.7, emissive: "#ffb060", emissiveIntensity: 0.06 }),
    sx = halfX + 1.6,
    sz = -halfZ * 0.55;
  add(new T.LatheGeometry([[0, 0], [0.45, 0], [0.46, 0.05], [0.12, 0.12], [0.08, 0.8], [0.22, 0.86], [0.24, 0.9], [0, 0.9]].map(([r, y]) => new T.Vector2(r, y)), 24), iron, sx, foot, sz);
  add(new T.CylinderGeometry(0.11, 0.11, 0.8, 16), wax, sx, foot + 1.3, sz);
  const flame = new T.Mesh(keep(new T.SphereGeometry(0.06, 10, 8).scale(1, 2.4, 1)), keep(new T.MeshBasicMaterial({ color: "#ffd27a" })));
  flame.position.set(sx, foot + 1.82, sz);
  scene.add(flame);
  flames.push(flame);
  if (capable()) {
    const glow = new T.PointLight("#ffbe78", 2, 6, 2);
    glow.position.set(sx, foot + 2.3, sz);
    scene.add(glow);
  }
  return { flames };
}
