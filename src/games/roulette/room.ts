import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { grain, grainUV } from "../../engine/grain";
import { block, weave } from "../../engine/scene-utils";
import { FELT_AT, TABLE } from "./layout";
import { lacquer, metal } from "./wheel";

/**
 * The room round the roulette table: a casino's floor at night. A patterned carpet, walls hung with dark damask over
 * wooden panelling, brass sconces, a row of gaming cabinets glowing along the far wall, and over the table a long lamp
 * in a brass frame. The table itself: green baize, a padded leather arm rest on a rail of real wood, a wooden body and
 * the croupier's chip float (where lost chips go and won chips come from). Still parts are merged by their material.
 */
type Keep = <R extends { dispose(): void }>(r: R) => R;
const flat = (list: T.BufferGeometry[]) => mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)))!;
function picture(keep: Keep, w: number, h: number, paint: (pen: CanvasRenderingContext2D) => void, repeat?: [number, number]) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const texture = keep(new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  if (repeat) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(repeat[0], repeat[1]);
  }
  return texture;
}
/** The carpet: deep red, a lattice of gold and teal motifs, as casino floors are. */
function carpet(keep: Keep) {
  return picture(
    keep,
    256,
    256,
    (pen) => {
      pen.fillStyle = "#30090f";
      pen.fillRect(0, 0, 256, 256);
      pen.strokeStyle = "#3b0c14";
      pen.lineWidth = 6;
      for (const [x, y] of [
        [0, 0],
        [256, 0],
        [0, 256],
        [256, 256],
        [128, 128],
      ]) {
        pen.beginPath();
        pen.arc(x, y, 70, 0, Math.PI * 2);
        pen.stroke();
      }
      const star = (x: number, y: number, r: number, fill: string) => {
        pen.fillStyle = fill;
        pen.beginPath();
        for (let k = 0; k < 16; k++) {
          const a = (k * Math.PI) / 8,
            d = k % 2 ? r * 0.45 : r;
          pen.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
        }
        pen.closePath();
        pen.fill();
      };
      star(128, 128, 26, "#4d3818");
      star(128, 128, 10, "#14302f");
      for (const [x, y] of [
        [0, 0],
        [256, 0],
        [0, 256],
        [256, 256],
      ])
        star(x, y, 22, "#14302f");
      star(0, 128, 10, "#433016");
      star(256, 128, 10, "#433016");
      star(128, 0, 10, "#433016");
      star(128, 256, 10, "#433016");
    },
    [44, 34],
  );
}
/** Damask on the walls: a dark wine ground with a paler, repeated ornament. */
function damask(keep: Keep) {
  return picture(
    keep,
    256,
    256,
    (pen) => {
      pen.fillStyle = "#3b1116";
      pen.fillRect(0, 0, 256, 256);
      pen.fillStyle = "#56202a";
      const leaf = (x: number, y: number, s: number) => {
        pen.beginPath();
        pen.moveTo(x, y - 60 * s);
        pen.bezierCurveTo(x + 46 * s, y - 30 * s, x + 30 * s, y + 30 * s, x, y + 60 * s);
        pen.bezierCurveTo(x - 30 * s, y + 30 * s, x - 46 * s, y - 30 * s, x, y - 60 * s);
        pen.fill();
      };
      leaf(128, 128, 1);
      leaf(0, 0, 0.8);
      leaf(256, 0, 0.8);
      leaf(0, 256, 0.8);
      leaf(256, 256, 0.8);
      pen.fillStyle = "#3b1116";
      leaf(128, 128, 0.45);
      pen.fillStyle = "#6b2a33";
      for (const [x, y] of [
        [128, 40],
        [128, 216],
        [40, 128],
        [216, 128],
      ]) {
        pen.beginPath();
        pen.arc(x, y, 7, 0, Math.PI * 2);
        pen.fill();
      }
    },
    [16, 3],
  );
}
/** The cabinets' screens: bright reels and lights, blurred a little as from across the room. */
function screens(keep: Keep) {
  return picture(keep, 512, 128, (pen) => {
    const colours = ["#ff5a7a", "#ffd34d", "#4dd2ff", "#8cff6b", "#c77dff", "#ff9b4d"];
    for (let k = 0; k < 8; k++) {
      const x = k * 64,
        top = pen.createLinearGradient(0, 0, 0, 128);
      top.addColorStop(0, colours[k % 6]);
      top.addColorStop(0.5, "#1a1030");
      top.addColorStop(1, colours[(k + 2) % 6]);
      pen.fillStyle = top;
      pen.fillRect(x + 4, 4, 56, 120);
      pen.fillStyle = "rgba(255,255,255,0.85)";
      for (let r = 0; r < 3; r++) pen.fillRect(x + 10 + r * 16, 52, 12, 22);
    }
  });
}

/** Builds the room and the table into `scene`. Returns the parts the view keeps: where the chip float's stacks stand. */
export function buildRoom(scene: T.Scene, keep: Keep, rich: boolean) {
  const brass = metal(keep, rich, "#c9a04a", 0.28);
  // ── The floor and the walls.
  const floor = new T.Mesh(keep(new T.PlaneGeometry(44, 34)), keep(new T.MeshStandardMaterial({ map: carpet(keep), roughness: 0.95 })));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.0;
  floor.receiveShadow = true;
  scene.add(floor);
  const wallPaper = keep(new T.MeshStandardMaterial({ map: damask(keep), roughness: 0.9 })),
    walls = new T.Mesh(keep(flat([new T.PlaneGeometry(44, 9).translate(0, 4.5, -8), new T.PlaneGeometry(34, 9).rotateY(Math.PI / 2).translate(-14, 4.5, 4)])), wallPaper);
  walls.position.y = -1;
  scene.add(walls);
  // Panelling under the damask, a brass rail along its top.
  const panelWood = keep(new T.MeshStandardMaterial({ ...grain(keep, "#3a1c10", { kind: "dark", contrast: 1.3, rich: false }), roughness: 0.6 })),
    panels: T.BufferGeometry[] = [grainUV(new T.BoxGeometry(44, 1.5, 0.12).translate(0, -0.25, -7.94), 1.2)];
  for (let x = -21; x <= 21; x += 3) panels.push(grainUV(new T.BoxGeometry(2.6, 1.05, 0.06).translate(x, -0.25, -7.86), 1.2));
  scene.add(new T.Mesh(keep(flat(panels)), panelWood));
  const trims: T.BufferGeometry[] = [new T.BoxGeometry(44, 0.06, 0.08).translate(0, 0.52, -7.88)];
  // Sconces on the wall: a brass back and arm.
  for (const x of [-11, -5, 5, 11]) trims.push(new T.CylinderGeometry(0.08, 0.08, 0.3, 12).translate(x, 2.6, -7.9), new T.BoxGeometry(0.05, 0.05, 0.3).translate(x, 2.7, -7.75));
  // ── The lamp over the table: a long box in a brass frame, its underside alight, hung on two rods.
  const lampX = (TABLE.left + TABLE.right) / 2 - 0.3,
    lampZ = -0.2;
  trims.push(
    new T.BoxGeometry(7.4, 0.06, 1.5).translate(lampX, 4.55, lampZ),
    new T.BoxGeometry(7.4, 0.06, 1.5).translate(lampX, 4.2, lampZ),
    new T.CylinderGeometry(0.02, 0.02, 3, 8).translate(lampX - 2.8, 6.1, lampZ),
    new T.CylinderGeometry(0.02, 0.02, 3, 8).translate(lampX + 2.8, 6.1, lampZ),
  );
  scene.add(new T.Mesh(keep(flat(trims)), brass));
  const shadeWood = keep(new T.MeshStandardMaterial({ ...grain(keep, "#2a140b", { kind: "dark", contrast: 1.2, rich: false }), roughness: 0.5 }));
  scene.add(new T.Mesh(keep(grainUV(new T.BoxGeometry(7.3, 0.32, 1.42).translate(lampX, 4.38, lampZ), 1.4)), shadeWood));
  const glowing = keep(new T.MeshBasicMaterial({ color: "#ffe6b8" })),
    glows: T.BufferGeometry[] = [new T.PlaneGeometry(7.1, 1.25).rotateX(Math.PI / 2).translate(lampX, 4.215, lampZ)];
  for (const x of [-11, -5, 5, 11]) glows.push(new T.SphereGeometry(0.13, 12, 8).translate(x, 2.95, -7.62));
  scene.add(new T.Mesh(keep(flat(glows)), glowing));
  // ── Gaming cabinets along the far wall, glowing.
  const cabinetBody = keep(new T.MeshStandardMaterial({ color: "#1b1720", roughness: 0.45, metalness: 0.3 })),
    cabinetGlow = keep(new T.MeshBasicMaterial({ map: screens(keep) })),
    bodies: T.BufferGeometry[] = [],
    faces: T.BufferGeometry[] = [];
  for (let k = -6; k <= 6; k++) {
    const x = k * 1.35;
    if (Math.abs(x) < 0.5) continue;
    bodies.push(new T.BoxGeometry(1.05, 2.3, 0.8).translate(x, 0.15, -7.1), new T.BoxGeometry(1.1, 0.25, 0.95).translate(x, -0.4, -6.95));
    const screen = new T.PlaneGeometry(0.85, 1.25),
      uv = screen.attributes.uv as T.BufferAttribute,
      slice = ((k + 6) % 8) / 8;
    for (let i = 0; i < uv.count; i++) uv.setX(i, slice + uv.getX(i) / 8);
    faces.push(screen.translate(x, 0.6, -6.69));
  }
  scene.add(new T.Mesh(keep(flat(bodies)), cabinetBody), new T.Mesh(keep(flat(faces)), cabinetGlow));

  // ── The table.
  const w = TABLE.right - TABLE.left,
    d = TABLE.near - TABLE.far,
    cx = (TABLE.left + TABLE.right) / 2,
    cz = (TABLE.far + TABLE.near) / 2;
  const baize = new T.Mesh(keep(new T.BoxGeometry(w, 0.2, d)), keep(new T.MeshStandardMaterial({ color: "#0e5634", roughness: 0.95, ...weave(w / 2, d / 2, keep, 0.6) })));
  baize.position.set(cx, -0.1, cz);
  baize.receiveShadow = true;
  scene.add(baize);
  // The rail: real wood under a padded leather arm rest, its corners rounded.
  const railWood = keep(new T.MeshStandardMaterial({ ...grain(keep, "#4c2410", { kind: "dark", contrast: 1.4, rich }), roughness: 0.35 })),
    leather = lacquer(keep, rich, { color: "#2a1410", roughness: 0.42 }, 0.5),
    rails: T.BufferGeometry[] = [],
    pads: T.BufferGeometry[] = [];
  const side = (sx: number, sz: number, x: number, z: number) => {
    rails.push(grainUV(block(sx, 0.12, sz, 0.04).translate(x, -0.02, z), 0.8));
    pads.push(block(sx - 0.06, 0.1, sz - 0.06, 0.045).translate(x, 0.08, z));
  };
  side(w + 0.56, 0.3, cx, TABLE.near + 0.14);
  side(w + 0.56, 0.3, cx, TABLE.far - 0.14);
  side(0.3, d, TABLE.left - 0.14, cz);
  side(0.3, d, TABLE.right + 0.14, cz);
  const railMesh = new T.Mesh(keep(flat(rails)), railWood),
    padMesh = new T.Mesh(keep(flat(pads)), leather);
  railMesh.castShadow = padMesh.castShadow = rich;
  railMesh.receiveShadow = padMesh.receiveShadow = true;
  scene.add(railMesh, padMesh);
  // The body under it: wood with a brass kick at its foot.
  const bodyWood = keep(new T.MeshStandardMaterial({ ...grain(keep, "#3d1d0e", { kind: "dark", contrast: 1.3, rich: false }), roughness: 0.55 }));
  scene.add(new T.Mesh(keep(grainUV(new T.BoxGeometry(w + 0.4, 0.82, d + 0.4).translate(cx, -0.61, cz), 1.0)), bodyWood));
  // ── The chip float: a wooden tray let into the baize on the croupier's side, between the wheel and the layout.
  const float = { x: FELT_AT.x - 0.55, z: TABLE.far + 0.3, w: 1.9, d: 0.32 };
  const trayParts = [grainUV(new T.BoxGeometry(float.w + 0.08, 0.035, float.d + 0.08).translate(float.x, 0.012, float.z), 0.5)];
  for (let k = 0; k <= 8; k++) trayParts.push(grainUV(new T.BoxGeometry(0.012, 0.05, float.d).translate(float.x - float.w / 2 + (k * float.w) / 8, 0.035, float.z), 0.3));
  const tray = new T.Mesh(keep(flat(trayParts)), railWood);
  tray.receiveShadow = true;
  scene.add(tray);
  // The columns of chips standing in it are laid by the view, with the bets' chips.
  const columns: { x: number; z: number }[] = [];
  for (let k = 0; k < 8; k++) columns.push({ x: float.x - float.w / 2 + ((k + 0.5) * float.w) / 8, z: float.z });
  return { float, columns };
}
