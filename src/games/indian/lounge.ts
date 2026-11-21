import * as T from "three";
import { block, glossy, planks, stuff, weave, wood } from "../../engine/scene-utils";
import { FELT, PILES } from "./coins";

/**
 * The card room round the table, all painted and modelled in code: a long
 * table of dark wood with a padded leather rail, green felt with a stitched
 * seam and gold printed lines, a leather wing chair for the figure, and a
 * panelled room with green damask paper, two paintings, wall lamps, curtains,
 * a cabinet of bottles and a plant.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
export const TABLE = 2.3;
function canvasTexture(own: Own, size: [number, number], paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number], color = true) {
  const canvas = document.createElement("canvas");
  [canvas.width, canvas.height] = size;
  paint(canvas.getContext("2d")!, size[0], size[1]);
  const texture = own(new T.CanvasTexture(canvas));
  if (color) texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}
/** A fixed sequence of numbers between 0 and 1, so that the room is laid out alike every time. */
function sequence(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Green felt: a fine mottle of fibres. */
function feltPicture(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#1d5c44";
  ctx.fillRect(0, 0, w, h);
  const r = sequence(11);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = r() < 0.5 ? "rgba(10,40,28,0.16)" : "rgba(80,150,110,0.12)";
    ctx.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}
/** Damask paper: an ogee lattice of leaves on deep green, with a fleck of old gold at each crossing. */
function damask(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#1c362f";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#284a40";
  ctx.lineWidth = 5;
  for (const dx of [0, w]) {
    ctx.beginPath();
    ctx.moveTo(dx - w / 2, 0);
    ctx.bezierCurveTo(dx - w / 2 + w * 0.35, h * 0.25, dx - w / 2 + w * 0.35, h * 0.25, dx, h / 2);
    ctx.bezierCurveTo(dx - w * 0.35, h * 0.75, dx - w * 0.35, h * 0.75, dx - w / 2, h);
    ctx.moveTo(dx + w / 2, 0);
    ctx.bezierCurveTo(dx + w / 2 - w * 0.35, h * 0.25, dx + w / 2 - w * 0.35, h * 0.25, dx, h / 2);
    ctx.bezierCurveTo(dx + w * 0.35, h * 0.75, dx + w * 0.35, h * 0.75, dx + w / 2, h);
    ctx.stroke();
  }
  // A leaf spray in each cell.
  const spray = (x: number, y: number) => {
    ctx.fillStyle = "#264438";
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x, y + 30);
      ctx.quadraticCurveTo(x + s * 34, y + 6, x + s * 6, y - 34);
      ctx.quadraticCurveTo(x + s * 10, y + 4, x, y + 30);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.ellipse(x, y - 10, 8, 26, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  spray(w / 2, h * 0.25);
  spray(0, h * 0.75);
  spray(w, h * 0.75);
  ctx.fillStyle = "#6f6743";
  for (const [x, y] of [
    [w / 2, h / 2],
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}
/** Tufted leather: oxblood with a diamond of creases and a button at each crossing. */
function tufted(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#5e2119");
  g.addColorStop(1, "#4a1712");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const r = sequence(5);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${r() < 0.5 ? "20,5,3" : "140,70,55"},0.08)`;
    ctx.fillRect(r() * w, r() * h, 2, 2);
  }
  ctx.strokeStyle = "rgba(25,6,4,0.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  ctx.lineTo(w / 2, 0);
  ctx.lineTo(w, h / 2);
  ctx.lineTo(w / 2, h);
  ctx.closePath();
  ctx.stroke();
  // Light on the swell of each diamond.
  const swell = ctx.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w * 0.4);
  swell.addColorStop(0, "rgba(200,120,95,0.22)");
  swell.addColorStop(1, "rgba(200,120,95,0)");
  ctx.fillStyle = swell;
  ctx.fillRect(0, 0, w, h);
  for (const [x, y] of [
    [0, h / 2],
    [w, h / 2],
    [w / 2, 0],
    [w / 2, h],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fillStyle = "#2a0b08";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 2, y - 2, 3, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(220,150,120,0.5)";
    ctx.fill();
  }
}
/** A painted landscape at dusk: sky, a low sun, hills going blue into the distance, a lake. */
function landscape(ctx: CanvasRenderingContext2D, w: number, h: number, warm: boolean) {
  const sky = ctx.createLinearGradient(0, 0, 0, h * 0.6);
  sky.addColorStop(0, warm ? "#3b4d6b" : "#2c3e57");
  sky.addColorStop(1, warm ? "#e9a466" : "#c9b48c");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = warm ? "#ffd59a" : "#f4e7c2";
  ctx.beginPath();
  ctx.arc(w * (warm ? 0.68 : 0.3), h * 0.5, w * 0.06, 0, Math.PI * 2);
  ctx.fill();
  const r = sequence(warm ? 3 : 8),
    hills = warm ? ["#7d6a72", "#5a4d5c", "#3c3443", "#262130"] : ["#7f8c86", "#5c6c66", "#3e4c47", "#26302d"];
  hills.forEach((color, i) => {
    const base = h * (0.52 + i * 0.1);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 12) ctx.lineTo(x, base - Math.sin(x / w * (3 + i) + r() * 2) * h * 0.06 - r() * h * 0.03);
    ctx.lineTo(w, h);
    ctx.fill();
  });
  // Brush marks over everything.
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${r() * 0.05})`;
    ctx.fillRect(r() * w, r() * h, 4 + r() * 10, 1 + r() * 2);
  }
}
/** Builds the room and the table into `scene`; returns the warm lights of the wall lamps. */
export function lounge(scene: T.Scene, own: Own, rich: boolean) {
  const mesh = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, parent: T.Object3D = scene, cast = false) => {
    const m = new T.Mesh(own(geometry), material);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    m.castShadow = cast;
    parent.add(m);
    return m;
  };
  const std = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...o })),
    shiny = (o: T.MeshStandardMaterialParameters, coat = 0.6) => own(glossy(o, coat)),
    darkWood = std({ map: own(wood(true)), roughness: 0.55 }),
    brass = std({ color: "#b98d43", metalness: rich ? 0.85 : 0.4, roughness: 0.35 });
  darkWood.map!.wrapS = darkWood.map!.wrapT = T.RepeatWrapping;

  // ---- The table: a dark wooden top that runs on past the bottom of the view, felt on it, and a padded rail.
  mesh(block(11, 0.3, 24), std(planks(1.4, own, 2.9)), 0, TABLE - 0.15, 7.7);
  const felt = std({ map: canvasTexture(own, [256, 256], feltPicture, [5, 12]), roughness: 0.95, ...weave(10, 24, own, 0.5) });
  mesh(new T.PlaneGeometry(9.9, 23.4), felt, 0, TABLE + 0.002, -3.75 + 11.7).rotation.x = -Math.PI / 2;
  const leather = shiny({ color: "#3b1d14", roughness: 0.42 }, 0.4);
  for (const s of [-1, 1]) mesh(block(0.66, 0.24, 24.2, 0.11), leather, s * 5.18, TABLE + 0.12, 7.75);
  mesh(block(11, 0.24, 0.66, 0.11), leather, 0, TABLE + 0.12, -3.97);
  // A brass bead where the rail meets the felt.
  for (const s of [-1, 1]) mesh(new T.CylinderGeometry(0.025, 0.025, 23.6, 8), brass, s * 4.84, FELT + 0.01, 7.95).rotation.x = Math.PI / 2;
  mesh(new T.CylinderGeometry(0.025, 0.025, 9.7, 8), brass, 0, FELT + 0.01, -3.63).rotation.z = Math.PI / 2;
  // The seam stitched round the felt.
  const stitch = own(new T.BoxGeometry(0.075, 0.006, 0.016)),
    spots: [number, number, number][] = [];
  for (let x = -4.66; x <= 4.66; x += 0.13) spots.push([x, -3.48, 0]);
  for (const s of [-1, 1]) for (let z = -3.4; z <= 19; z += 0.13) spots.push([s * 4.7, z, Math.PI / 2]);
  const seam = new T.InstancedMesh(stitch, std({ color: "#d8c690", roughness: 0.7 }), spots.length),
    m = new T.Matrix4(),
    q = new T.Quaternion(),
    up = new T.Vector3(0, 1, 0),
    one = new T.Vector3(1, 1, 1);
  spots.forEach(([x, z, turn], i) => seam.setMatrixAt(i, m.compose(new T.Vector3(x, FELT, z), q.setFromAxisAngle(up, turn), one)));
  seam.receiveShadow = true;
  scene.add(seam);
  // Gold lines printed on the felt: a double ring round the pot, one round where my bet is set.
  const print = std({ color: "#c7a24c", roughness: 0.6, metalness: 0.2 }),
    ring = (x: number, z: number, r: number) => (mesh(new T.RingGeometry(r - 0.022, r + 0.022, 72), print, x, FELT + 0.001, z).rotation.x = -Math.PI / 2);
  ring(PILES.pot.x, PILES.pot.z, 1.12);
  ring(PILES.pot.x, PILES.pot.z, 1.2);
  ring(PILES.bet.x, PILES.bet.z, 0.95);
  // Under the top: an apron and two turned legs at the far end.
  for (const s of [-1, 1]) {
    mesh(block(0.14, 0.34, 23, 0.04), darkWood, s * 5.2, TABLE - 0.45, 8.2);
    mesh(
      new T.LatheGeometry(
        [[0.24, 0], [0.3, 0.12], [0.18, 0.4], [0.16, 1.0], [0.24, 1.35], [0.18, 1.55], [0.22, 1.98]].map(([r, y]) => new T.Vector2(r, y)),
        24,
      ),
      darkWood,
      s * 4.85,
      0,
      -3.85,
    );
  }
  mesh(block(10.2, 0.34, 0.14, 0.04), darkWood, 0, TABLE - 0.45, -4.0);

  // ---- The figure's chair: a wing chair of tufted leather behind it.
  const tuft = shiny({ map: canvasTexture(own, [128, 128], tufted, [4, 5]), roughness: 0.48 }, 0.35);
  const chair = new T.Group();
  chair.position.set(0, 0, -5.55);
  scene.add(chair);
  mesh(block(2.9, 4.4, 0.5, 0.2), tuft, 0, 3.9, 0, chair);
  // The rounded top roll of the back.
  mesh(new T.CapsuleGeometry(0.3, 2.4, 6, 16), tuft, 0, 6.05, 0.05, chair).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) {
    const wing = mesh(block(0.42, 3.3, 1.2, 0.18), tuft, s * 1.52, 4.2, 0.45, chair);
    wing.rotation.y = s * 0.28;
    mesh(new T.CapsuleGeometry(0.26, 0.9, 6, 12), tuft, s * 1.58, 2.7, 0.9, chair).rotation.x = Math.PI / 2;
  }

  // ---- The room: panelled below, damask above, a ceiling.
  const W = 14,
    BACK = -11,
    paper = std({ map: canvasTexture(own, [256, 256], damask, [11, 5.5]), roughness: 0.9 }),
    sidePaper = std({ map: canvasTexture(own, [256, 256], damask, [13, 5.5]), roughness: 0.9 }),
    panelWood = std({ ...planks(2.2, own, 0.5), roughness: 0.6 });
  mesh(new T.PlaneGeometry(2 * W, 12), paper, 0, 10, BACK);
  for (const s of [-1, 1]) {
    const wall = mesh(new T.PlaneGeometry(34, 12), sidePaper, s * W, 10, 6);
    wall.rotation.y = -s * (Math.PI / 2);
  }
  // Wainscot: boards with raised frames, and a rail along the top.
  mesh(new T.PlaneGeometry(2 * W, 4), panelWood, 0, 2, BACK + 0.01);
  for (const s of [-1, 1]) {
    const lower = mesh(new T.PlaneGeometry(34, 4), panelWood, s * (W - 0.01), 2, 6);
    lower.rotation.y = -s * (Math.PI / 2);
  }
  const frame = std({ map: own(wood(true, 0.6)), roughness: 0.5 });
  for (let x = -W + 1.4; x < W; x += 2.8) mesh(block(2.2, 2.9, 0.08, 0.03), frame, x, 1.95, BACK + 0.05);
  mesh(block(2 * W, 0.22, 0.22, 0.06), frame, 0, 4.05, BACK + 0.1);
  mesh(block(2 * W, 0.4, 0.3, 0.08), frame, 0, 15.8, BACK + 0.12);
  for (const s of [-1, 1]) {
    mesh(block(0.22, 0.22, 34, 0.06), frame, s * (W - 0.1), 4.05, 6);
    mesh(block(0.3, 0.4, 34, 0.08), frame, s * (W - 0.12), 15.8, 6);
  }
  mesh(new T.PlaneGeometry(2 * W, 34), std({ color: "#2a2420", roughness: 1 }), 0, 16, 6).rotation.x = Math.PI / 2;
  // The floor: dark boards, and a rug under the table.
  mesh(new T.PlaneGeometry(2 * W, 34), std({ ...stuff("boards", "#4a2e1f", 4, own, 5), roughness: 0.7 }), 0, 0, 6).rotation.x = -Math.PI / 2;
  mesh(new T.PlaneGeometry(16, 20), std({ color: "#5a1d22", roughness: 1 }), 0, 0.01, 4).rotation.x = -Math.PI / 2;

  // ---- Two paintings in gilt frames.
  const gilt = std({ color: "#b48b3e", metalness: rich ? 0.75 : 0.35, roughness: 0.38 });
  for (const s of [-1, 1]) {
    const x = s * 5.6;
    mesh(block(3.5, 2.7, 0.16, 0.06), gilt, x, 9.4, BACK + 0.1);
    mesh(new T.PlaneGeometry(3.0, 2.2), std({ map: canvasTexture(own, [384, 288], (c, w, h) => landscape(c, w, h, s > 0)), roughness: 0.85 }), x, 9.4, BACK + 0.19);
  }
  // ---- Wall lamps: a brass arm and a pleated cream shade that glows.
  const shade = std({ color: "#f6e3bb", emissive: "#ffcf86", emissiveIntensity: 0.9, roughness: 0.9, side: T.DoubleSide }),
    lights: T.PointLight[] = [];
  for (const s of [-1, 1]) {
    const x = s * 9.3;
    mesh(new T.CylinderGeometry(0.16, 0.16, 0.06, 20), brass, x, 8.6, BACK + 0.03).rotation.x = Math.PI / 2;
    mesh(new T.CylinderGeometry(0.035, 0.035, 0.7, 8), brass, x, 8.75, BACK + 0.35).rotation.x = Math.PI / 2 - 0.4;
    mesh(new T.CylinderGeometry(0.28, 0.42, 0.55, 16, 1, true), shade, x, 9.25, BACK + 0.62);
    const light = new T.PointLight("#ffbf73", rich ? 9 : 7, 9, 1.6);
    light.position.set(x, 9.1, BACK + 0.8);
    scene.add(light);
    lights.push(light);
  }
  // ---- Heavy curtains in the corners.
  const velvet = std({ color: "#6b1820", roughness: 0.85, side: T.DoubleSide });
  for (const s of [-1, 1]) {
    const folds = new T.PlaneGeometry(3.2, 15.6, 40, 1),
      at = folds.getAttribute("position");
    for (let i = 0; i < at.count; i++) at.setZ(i, Math.sin(at.getX(i) * 7) * 0.12);
    folds.computeVertexNormals();
    mesh(folds, velvet, s * (W - 1.8), 7.9, BACK + 0.3);
  }
  // ---- A cabinet of bottles on the left, a plant on the right.
  const r = sequence(21);
  mesh(block(3.4, 3.3, 1.2, 0.08), darkWood, -9.4, 1.65, BACK + 0.62);
  mesh(block(3.6, 0.12, 1.35, 0.04), frame, -9.4, 3.36, BACK + 0.66);
  const glass = ["#3d5a2c", "#7a4a1a", "#c9d6d8", "#5b1d1d", "#a87b2c"];
  for (let i = 0; i < 6; i++) {
    const tall = 0.8 + r() * 0.55,
      bottle = mesh(
        new T.LatheGeometry(
          [[0.001, 0], [0.17, 0.0], [0.18, tall * 0.62], [0.06, tall * 0.8], [0.05, tall], [0.001, tall]].map(([rr, y]) => new T.Vector2(rr, y)),
          18,
        ),
        shiny({ color: glass[i % glass.length], roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }, 1),
        -10.7 + i * 0.5,
        3.42,
        BACK + 0.6 + (i % 2) * 0.25,
      );
    bottle.castShadow = false;
  }
  // A shelf above with a few more and two glasses.
  mesh(block(3.0, 0.1, 0.5, 0.03), frame, -9.4, 6.0, BACK + 0.25);
  for (let i = 0; i < 4; i++)
    mesh(
      new T.LatheGeometry([[0.001, 0], [0.14, 0], [0.15, 0.6], [0.05, 0.8], [0.045, 1.0], [0.001, 1.0]].map(([rr, y]) => new T.Vector2(rr, y)), 16),
      shiny({ color: glass[(i + 2) % glass.length], roughness: 0.15, transparent: true, opacity: 0.85 }, 1),
      -10.5 + i * 0.6,
      6.05,
      BACK + 0.25,
    );
  // The plant: a glazed pot and long leaves fanning out of it.
  mesh(
    new T.LatheGeometry([[0.001, 0], [0.55, 0], [0.75, 1.3], [0.82, 1.45], [0.001, 1.45]].map(([rr, y]) => new T.Vector2(rr, y)), 28),
    shiny({ color: "#2f4a5e", roughness: 0.3 }, 0.8),
    9.6,
    0,
    BACK + 1.4,
  );
  const leaf = std({ color: "#2e5b2e", roughness: 0.7, side: T.DoubleSide });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + r() * 0.3,
      length = 2.2 + r() * 1.6,
      blade = new T.PlaneGeometry(0.42, length, 1, 8),
      at = blade.getAttribute("position");
    // Each leaf narrows to a point and arches over.
    for (let k = 0; k < at.count; k++) {
      const t = (at.getY(k) + length / 2) / length;
      at.setX(k, at.getX(k) * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)));
      at.setZ(k, -t * t * length * 0.45);
    }
    blade.translate(0, length / 2, 0);
    blade.computeVertexNormals();
    const it = mesh(blade, leaf, 9.6, 1.4, BACK + 1.4);
    it.rotation.set(-0.35 - r() * 0.3, a, 0, "YXZ");
  }
  return lights;
}
