import * as T from "three";
import { block, glossy } from "../../engine/scene-utils";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The edges of what stands on the table (the breadboard and the tray): its least and greatest x, and its far and near z. */
export interface Bounds {
  left: number;
  right: number;
  back: number;
  front: number;
}
const canvasOf = (w: number, h = w) => {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return { canvas, pen: canvas.getContext("2d")! };
};
/** The optical table's steel top: brushed, with a tapped hole every quarter unit (one tile is one unit). */
function tableTexture() {
  const { canvas, pen } = canvasOf(256);
  pen.fillStyle = "#8f969d";
  pen.fillRect(0, 0, 256, 256);
  // Brushing: faint streaks along the table.
  for (let k = 0; k < 160; k++) {
    const y = (k * 97) % 256,
      shade = 120 + ((k * 53) % 40);
    pen.strokeStyle = `rgba(${shade}, ${shade + 6}, ${shade + 12}, 0.18)`;
    pen.lineWidth = 1;
    pen.beginPath();
    pen.moveTo(0, y + 0.5);
    pen.lineTo(256, y + 0.5);
    pen.stroke();
  }
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      const x = 32 + c * 64,
        y = 32 + r * 64;
      pen.fillStyle = "rgba(255, 255, 255, 0.35)";
      pen.beginPath();
      pen.arc(x, y + 1, 9, 0, Math.PI * 2);
      pen.fill();
      pen.fillStyle = "#2a2d31";
      pen.beginPath();
      pen.arc(x, y, 8, 0, Math.PI * 2);
      pen.fill();
    }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
/** The controller's front panel: a red read-out, a key switch, a knob's scale and the lamp's ring. */
function panelTexture() {
  const { canvas, pen } = canvasOf(512, 192);
  pen.fillStyle = "#c9ccd0";
  pen.fillRect(0, 0, 512, 192);
  pen.fillStyle = "#1a1c1f";
  pen.fillRect(28, 40, 220, 84);
  pen.fillStyle = "#ff3a2a";
  pen.font = "700 58px 'Courier New', monospace";
  pen.textBaseline = "middle";
  pen.fillText("5.00", 44, 84);
  pen.font = "700 26px Inter, Arial, sans-serif";
  pen.fillText("mW", 192, 92);
  pen.fillStyle = "#2a2d31";
  pen.font = "700 20px Inter, Arial, sans-serif";
  pen.fillText("LASER CONTROL", 28, 22);
  pen.fillText("POWER", 290, 160);
  pen.fillText("KEY", 420, 160);
  // The knob's scale.
  pen.strokeStyle = "#2a2d31";
  pen.lineWidth = 3;
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (0.75 + (k / 10) * 1.5);
    pen.beginPath();
    pen.moveTo(318 + Math.cos(a) * 46, 90 + Math.sin(a) * 46);
    pen.lineTo(318 + Math.cos(a) * 56, 90 + Math.sin(a) * 56);
    pen.stroke();
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** A page of the lab book: ruled lines, a little sketch of a beam turning at a mirror, and writing. */
function pageTexture() {
  const { canvas, pen } = canvasOf(256, 340);
  pen.fillStyle = "#f8f6ef";
  pen.fillRect(0, 0, 256, 340);
  pen.strokeStyle = "rgba(90, 130, 190, 0.45)";
  pen.lineWidth = 1.5;
  for (let y = 40; y < 340; y += 18) {
    pen.beginPath();
    pen.moveTo(10, y);
    pen.lineTo(246, y);
    pen.stroke();
  }
  pen.strokeStyle = "rgba(200, 60, 60, 0.5)";
  pen.beginPath();
  pen.moveTo(34, 0);
  pen.lineTo(34, 340);
  pen.stroke();
  // Handwriting, as wavy strokes.
  pen.strokeStyle = "#2b3a66";
  pen.lineWidth = 2;
  for (let line = 0; line < 6; line++) {
    const y = 56 + line * 18,
      length = 120 + ((line * 61) % 90);
    pen.beginPath();
    for (let x = 42; x < 42 + length; x += 3) {
      const yy = y - 4 + Math.sin(x * 0.55 + line) * 3 + Math.sin(x * 0.21) * 1.5;
      if (x === 42) pen.moveTo(x, yy);
      else pen.lineTo(x, yy);
    }
    pen.stroke();
  }
  // The sketch: a beam bent at a mirror into a target.
  pen.strokeStyle = "#c8302a";
  pen.lineWidth = 3;
  pen.beginPath();
  pen.moveTo(50, 250);
  pen.lineTo(150, 250);
  pen.lineTo(150, 180);
  pen.stroke();
  pen.strokeStyle = "#2b3a66";
  pen.lineWidth = 3;
  pen.beginPath();
  pen.moveTo(132, 268);
  pen.lineTo(168, 232);
  pen.moveTo(130, 178);
  pen.lineTo(170, 178);
  pen.stroke();
  pen.beginPath();
  pen.arc(150, 170, 9, 0, Math.PI * 2);
  pen.stroke();
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/**
 * An optics laboratory round the breadboard, all modelled in code: a steel optical table with its grid of tapped
 * holes, and on it, clear of the board, the tray and the camera's view of them, the laser's controller with its red
 * read-out, a pair of amber safety goggles, a power meter's sensor on a post, a lab book with a pen, a box of spare
 * posts and a fan of hex keys. Behind the table a dark wall with a red lamp lit over it. `place` sets the props for
 * where the board and the tray lie.
 */
export function bench(scene: T.Object3D, own: Own) {
  const props: { thing: T.Object3D; at: (b: Bounds) => [number, number, number?] }[] = [],
    mesh = (geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) => {
      const m = new T.Mesh(own(geometry), material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    },
    paint = (color: string, roughness = 0.5, metalness = 0) => own(new T.MeshStandardMaterial({ color, roughness, metalness })),
    black = paint("#24272c", 0.45, 0.3),
    grey = paint("#c4c8cc", 0.45, 0.2),
    steel = paint("#c9cfd6", 0.3, 0.55),
    add = (thing: T.Object3D, at: (b: Bounds) => [number, number, number?]) => {
      scene.add(thing);
      props.push({ thing, at });
    };
  // The optical table: a slab of brushed steel with holes, its edge banded in dark grey.
  const top = own(tableTexture());
  top.repeat.set(18, 14);
  const slab = mesh(new T.BoxGeometry(18, 0.5, 14), own(new T.MeshStandardMaterial({ map: top, roughness: 0.55, metalness: 0.15 })), scene, 0, -0.25, 0);
  slab.castShadow = false;
  // A wall far behind, and a red lamp on it saying the laser is on.
  const wall = mesh(new T.PlaneGeometry(40, 12), paint("#2c333d", 0.95), scene, 0, 4, -8);
  wall.castShadow = false;
  const lamp = new T.Group();
  mesh(new T.CylinderGeometry(0.22, 0.26, 0.12, 24).rotateX(Math.PI / 2), black, lamp, 0, 0, 0.06);
  mesh(new T.SphereGeometry(0.2, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2), own(new T.MeshBasicMaterial({ color: "#ff3b2a" })), lamp, 0, 0, 0.12);
  lamp.position.set(-2.5, 3.2, -7.95);
  scene.add(lamp);
  // The controller: a grey box, its panel toward the board, a knob, a key and a lamp.
  const box = new T.Group();
  const panel = own(new T.MeshStandardMaterial({ map: own(panelTexture()), roughness: 0.5 }));
  mesh(block(1.5, 0.52, 0.95, 0.04), grey, box, 0, 0.26, 0);
  const face = mesh(new T.PlaneGeometry(1.4, 0.48), panel, box, 0, 0.27, 0.476);
  face.castShadow = false;
  mesh(new T.CylinderGeometry(0.09, 0.1, 0.07, 24).rotateX(Math.PI / 2), black, box, 0.18, 0.3, 0.51);
  mesh(new T.CylinderGeometry(0.05, 0.05, 0.05, 16).rotateX(Math.PI / 2), steel, box, 0.5, 0.3, 0.5);
  mesh(new T.BoxGeometry(0.02, 0.07, 0.02), steel, box, 0.5, 0.3, 0.53);
  mesh(new T.BoxGeometry(1.3, 0.03, 0.04), black, box, 0, 0.53, 0.3);
  box.rotation.y = 0.35;
  add(box, (b) => [b.left - 1.15, b.back + 0.4, 0.35]);
  // Safety goggles: an amber visor on a black frame, its strap trailing.
  const goggles = new T.Group(),
    amber = own(glossy({ color: "#ff9a1f", roughness: 0.1, transparent: true, opacity: 0.72 }));
  for (const x of [-0.17, 0.17]) {
    const lens = mesh(new T.SphereGeometry(0.16, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.6).scale(1, 0.55, 0.9), amber, goggles, x, 0.05, 0);
    lens.rotation.x = -Math.PI / 2 + 0.25;
    mesh(new T.TorusGeometry(0.155, 0.02, 8, 30).scale(1, 0.62, 1).rotateX(-Math.PI / 2 + 0.25), black, goggles, x, 0.05, 0.02);
  }
  mesh(new T.BoxGeometry(0.06, 0.03, 0.05), black, goggles, 0, 0.08, 0.02);
  mesh(new T.TorusGeometry(0.42, 0.018, 6, 40, Math.PI).rotateX(-Math.PI / 2).scale(1, 1, 0.8), black, goggles, 0, 0.02, -0.02);
  goggles.rotation.y = -0.5;
  add(goggles, (b) => [b.right + 0.95, b.front - 0.55, -0.5]);
  // A power meter: a round sensor head on a post, its cable coiled away.
  const meter = new T.Group();
  mesh(new T.CylinderGeometry(0.2, 0.22, 0.05, 28), black, meter, 0, 0.025, 0);
  mesh(new T.CylinderGeometry(0.03, 0.03, 0.5, 12), steel, meter, 0, 0.3, 0);
  const head = mesh(new T.CylinderGeometry(0.2, 0.2, 0.1, 32).rotateX(Math.PI / 2), black, meter, 0, 0.6, 0);
  head.castShadow = true;
  mesh(new T.CircleGeometry(0.15, 32), paint("#14161a", 0.9), meter, 0, 0.6, 0.051);
  mesh(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0.6, -0.08), new T.Vector3(0.1, 0.4, -0.3), new T.Vector3(0.4, 0.03, -0.4), new T.Vector3(0.9, 0.03, -0.2), new T.Vector3(1.1, 0.03, 0.2)]), 30, 0.02, 8), black, meter);
  meter.rotation.y = 0.7;
  add(meter, (b) => [b.right + 0.9, b.back + 0.6, 0.7]);
  // The lab book, open, with a pen lying on it.
  const book = new T.Group(),
    page = own(new T.MeshStandardMaterial({ map: own(pageTexture()), roughness: 0.9 }));
  mesh(block(1.32, 0.035, 0.92, 0.012), paint("#1f3d6b", 0.7), book, 0, 0.018, 0);
  for (const x of [-0.32, 0.32]) {
    const sheet = mesh(new T.PlaneGeometry(0.6, 0.86).rotateX(-Math.PI / 2), page, book, x, 0.041, 0);
    sheet.castShadow = false;
  }
  mesh(new T.CylinderGeometry(0.018, 0.018, 0.62, 12).rotateZ(Math.PI / 2), own(glossy({ color: "#c0392b", roughness: 0.3 })), book, 0.3, 0.065, 0.12).rotation.y = 0.4;
  book.rotation.y = 0.18;
  add(book, (b) => [b.left - 1.05, b.front - 0.7, 0.18]);
  // A box of spare posts and a fan of hex keys.
  const spares = new T.Group();
  mesh(block(0.8, 0.16, 0.5, 0.02), paint("#3b4250", 0.6), spares, 0, 0.08, 0);
  for (let k = 0; k < 5; k++) {
    const post = mesh(new T.CylinderGeometry(0.03, 0.03, 0.7, 12).rotateZ(Math.PI / 2), steel, spares, 0, 0.19, -0.18 + k * 0.09);
    post.rotation.y = 0.05 * (k - 2);
  }
  add(spares, (b) => [b.left - 1.0, (b.back + b.front) / 2 + 0.3, -0.3]);
  const keys = new T.Group();
  for (let k = 0; k < 5; k++) {
    const key = new T.Group(),
      long = 0.32 + k * 0.05;
    mesh(new T.BoxGeometry(long, 0.022, 0.022), black, key, long / 2, 0.011, 0);
    mesh(new T.BoxGeometry(0.022, 0.022, 0.09), black, key, long, 0.011, 0.045);
    key.rotation.y = 0.18 * k - 0.4;
    keys.add(key);
  }
  add(keys, (b) => [b.right + 0.55, (b.back + b.front) / 2 + 0.2, 2.6]);
  return {
    place(b: Bounds) {
      for (const { thing, at } of props) {
        const [x, z, turn] = at(b);
        thing.position.set(x, 0, z);
        if (turn !== undefined) thing.rotation.y = turn;
      }
    },
  };
}
