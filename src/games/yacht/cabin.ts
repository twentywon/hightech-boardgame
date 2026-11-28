import * as T from "three";
import { block, glossy, planks, weave } from "../../engine/scene-utils";
import { speckled } from "../../engine/scenery";

/**
 * A seat in an aircraft's front cabin, round the dice tray: a wide table of walnut, the seat in front with its screen
 * (a flight map of our own) and its pocket, the curved wall at the left with three windows over the clouds and a
 * wing, a side console at the right with a reading lamp and a glass of juice, a cup of coffee on its saucer. All in
 * code. The table's far strip, between the tray and the seat in front, is kept clear for the dice cup and the score
 * pad (`FAR`).
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The table's surface. */
export const TOP = -0.12;
/** The table's far strip: where the dice cup rests and the score pad lies. */
export const FAR = { cupX: 3.5, padX: -2.3, z: -4.2 };
const EDGE = { left: -4.75, right: 6.1, near: 4.9, far: -5.32 };

function canvas(width: number, height = width) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement, own: Own) {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function random(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/** A cabin window in its moulded surround: sky over a sea of cloud, the shade pulled a third down, a wing below. */
function windowPicture(own: Own, seed: number, wing: boolean) {
  const W = 256,
    H = 360,
    { c, ctx } = canvas(W, H),
    rnd = random(seed);
  ctx.fillStyle = "#e3e1da";
  ctx.fillRect(0, 0, W, H);
  const x = 52,
    y = 54,
    w = W - 104,
    h = H - 108;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 64);
  ctx.clip();
  const sky = ctx.createLinearGradient(0, y, 0, y + h);
  sky.addColorStop(0, "#2b63b8");
  sky.addColorStop(0.55, "#88bdec");
  sky.addColorStop(0.62, "#dfeefa");
  sky.addColorStop(1, "#f6f8fb");
  ctx.fillStyle = sky;
  ctx.fillRect(x, y, w, h);
  // The sea of cloud.
  for (let i = 0; i < 26; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.7 + rnd() * 0.3})`;
    ctx.beginPath();
    ctx.ellipse(x + rnd() * w, y + h * (0.6 + rnd() * 0.4), 20 + rnd() * 40, 10 + rnd() * 16, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (wing) {
    ctx.fillStyle = "#c3c9d1";
    ctx.beginPath();
    ctx.moveTo(x + w, y + h * 0.5);
    ctx.lineTo(x + w * 0.15, y + h * 0.66);
    ctx.lineTo(x + w * 0.2, y + h * 0.7);
    ctx.lineTo(x + w, y + h * 0.64);
    ctx.fill();
    ctx.fillStyle = "#8f98a4";
    ctx.fillRect(x + w * 0.15, y + h * 0.655, 8, 22);
    ctx.fillStyle = "#d2453a";
    ctx.beginPath();
    ctx.arc(x + w * 0.17, y + h * 0.66, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // The shade, a third of the way down, with its grip.
  ctx.fillStyle = "#d8d5cc";
  ctx.fillRect(x, y, w, h * 0.3);
  ctx.fillStyle = "#b9b5aa";
  ctx.fillRect(x + w * 0.35, y + h * 0.3 - 10, w * 0.3, 8);
  ctx.restore();
  ctx.strokeStyle = "rgba(120,118,110,0.6)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 3, w + 6, h + 6, 66);
  ctx.stroke();
  return texture(c, own);
}
/**
 * The screen in the seat in front: a flight map of our own (sea, coasts made up, the way flown dashed in an arc, the
 * aeroplane on it) with the time left and the height under it.
 */
function flightMap(own: Own) {
  const W = 512,
    H = 288,
    { c, ctx } = canvas(W, H),
    rnd = random(3);
  const sea = ctx.createLinearGradient(0, 0, 0, H);
  sea.addColorStop(0, "#0c2a4f");
  sea.addColorStop(1, "#123d6b");
  ctx.fillStyle = sea;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "rgba(120,170,220,0.15)";
  ctx.lineWidth = 1;
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // Two coasts, made up.
  for (const [cx, cy, s] of [[60, 120, 1.2], [470, 170, 1]] as const) {
    ctx.fillStyle = "#3f6b4a";
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2,
        r = (70 + rnd() * 30) * s;
      ctx.lineTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r);
    }
    ctx.fill();
  }
  const from = [96, 112],
    to = [430, 160],
    bend = [260, 40],
    at = (t: number) => [
      (1 - t) ** 2 * from[0] + 2 * (1 - t) * t * bend[0] + t * t * to[0],
      (1 - t) ** 2 * from[1] + 2 * (1 - t) * t * bend[1] + t * t * to[1],
    ];
  ctx.strokeStyle = "#f2c14e";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let t = 0; t <= 0.62; t += 0.02) ctx.lineTo(...(at(t) as [number, number]));
  ctx.stroke();
  ctx.setLineDash([6, 6]);
  ctx.strokeStyle = "rgba(242,193,78,0.6)";
  ctx.beginPath();
  for (let t = 0.62; t <= 1.001; t += 0.02) ctx.lineTo(...(at(t) as [number, number]));
  ctx.stroke();
  ctx.setLineDash([]);
  for (const p of [from, to]) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // The aeroplane, pointing along the way.
  const [px, py] = at(0.62),
    [qx, qy] = at(0.64);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.atan2(qy - py, qx - px));
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(14, 0);
  ctx.lineTo(-10, -3);
  ctx.lineTo(-12, 0);
  ctx.lineTo(-10, 3);
  ctx.fill();
  ctx.fillRect(-4, -12, 6, 24);
  ctx.fillRect(-12, -6, 4, 12);
  ctx.restore();
  ctx.fillStyle = "rgba(4,16,32,0.7)";
  ctx.fillRect(0, H - 46, W, 46);
  ctx.fillStyle = "#e8eef6";
  ctx.font = '600 20px "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
  ctx.textBaseline = "middle";
  ctx.fillText("도착까지 3:42", 18, H - 23);
  ctx.textAlign = "right";
  ctx.fillText("고도 11,280 m", W - 18, H - 23);
  return texture(c, own);
}
/** Cream leather quilted in diamonds, for the seat's headrest band and the console's pad. */
function quilted(own: Own) {
  const { c, ctx } = canvas(256);
  ctx.fillStyle = "#e6dccb";
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = "rgba(120,100,76,0.45)";
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  for (let i = -256; i < 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }
  const t = texture(c, own);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
const lathe = (points: [number, number][], segments: number) =>
  new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);

/** Builds the cabin into `scene`. Where no graphics card draws, the things beyond the table are kept few. */
export function suite(scene: T.Object3D, own: Own, rich: boolean) {
  const std = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...o }));
  const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = false, parent: T.Object3D = scene) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  // The table: walnut with a rounded edge and a thin brushed rim.
  const walnut = std({ ...planks(1.6, own), roughness: 0.55 }),
    width = EDGE.right - EDGE.left,
    depth = EDGE.near - EDGE.far;
  const table = add(block(width, 0.2, depth, 0.07), walnut, (EDGE.left + EDGE.right) / 2, TOP - 0.1, (EDGE.near + EDGE.far) / 2, false);
  // Drawn before the floor and the seat below it; without a graphics card, without costly slanted filtering.
  table.renderOrder = -1;
  if (!rich && walnut.map) walnut.map.anisotropy = 1;
  const metal = own(new T.MeshStandardMaterial({ color: "#9aa0a6", metalness: 0.85, roughness: 0.32 }));
  add(new T.BoxGeometry(width - 0.2, 0.05, 0.05), metal, (EDGE.left + EDGE.right) / 2, TOP - 0.15, EDGE.near + 0.01);
  // The seat in front: navy cloth, a band of quilted cream leather, the screen and the pocket.
  const cloth = std({ map: own(speckled("#25365c", ["rgba(10,18,40,0.4)", "rgba(90,116,170,0.28)", "rgba(196,160,90,0.12)"], 17, 10, 4200)), ...weave(8, 8, own), roughness: 1 }),
    leather = std({ map: quilted(own), roughness: 0.6 }),
    dark = std({ color: "#2c3036", roughness: 0.55 }),
    back = EDGE.far - 0.62;
  add(new T.BoxGeometry(width + 2, 9, 1.2), cloth, (EDGE.left + EDGE.right) / 2, TOP + 3.3, back, true);
  const band = add(new T.PlaneGeometry(width + 2, 0.5), leather, (EDGE.left + EDGE.right) / 2, TOP + 0.24, back + 0.605);
  (band.material as T.MeshStandardMaterial).map!.repeat.set(10, 0.5);
  const screen = std({ map: flightMap(own), emissive: "#ffffff", emissiveMap: undefined, emissiveIntensity: 0, roughness: 0.25, metalness: 0.1 });
  screen.emissiveMap = screen.map;
  screen.emissiveIntensity = 0.75;
  add(block(3.2, 1.95, 0.12, 0.05), dark, 0.25, TOP + 1.55, back + 0.62);
  add(new T.PlaneGeometry(2.96, 1.66), screen, 0.25, TOP + 1.55, back + 0.69);
  // The tray table's latch and a small coat hook either side of the screen.
  add(block(0.7, 0.12, 0.1, 0.04), dark, 0.25, TOP + 0.66, back + 0.64);
  // The cabin wall at the left leans in over the seat; its windows face the seat.
  const hull = new T.Group(),
    wall = std({ map: own(speckled("#dedbd2", ["rgba(120,120,112,0.12)", "rgba(255,255,255,0.3)"], 5, 6, 1800)), roughness: 0.6 });
  hull.position.set(EDGE.left - 0.55, TOP - 2.2, 0);
  hull.rotation.z = 0.38;
  scene.add(hull);
  add(new T.BoxGeometry(0.5, 9, 60), wall, 0, 4, 0, false, hull);
  [-3.6, 0.2, 4.0].forEach((z, i) => {
    const pane = add(new T.PlaneGeometry(2.3, 3.25), std({ map: windowPicture(own, 7 + i, i === 1), roughness: 0.5, emissive: "#ffffff", emissiveIntensity: 0 }), 0.26, 3.3, z, false, hull);
    const m = pane.material as T.MeshStandardMaterial;
    m.emissiveMap = m.map;
    m.emissiveIntensity = 0.35;
    pane.rotation.y = Math.PI / 2;
  });
  // A coffee on its saucer at the far right of the table.
  const china = own(glossy({ color: "#f5f3ee", roughness: 0.25 }, 1)),
    coffee = std({ color: "#3b2214", roughness: 0.15 });
  add(lathe([[0, 0], [0.5, 0], [0.56, 0.05], [0.5, 0.06], [0, 0.04]], 28), china, 5.45, TOP, -4.7, true);
  add(lathe([[0, 0.04], [0.24, 0.04], [0.3, 0.12], [0.36, 0.48], [0.33, 0.48], [0.27, 0.14], [0, 0.1]], 28), china, 5.45, TOP, -4.7, true);
  const surface = add(new T.CircleGeometry(0.31, 24), coffee, 5.45, TOP + 0.4, -4.7);
  surface.rotation.x = -Math.PI / 2;
  const handle = add(new T.TorusGeometry(0.1, 0.03, 8, 14), china, 5.45 + 0.4, TOP + 0.3, -4.7, true);
  handle.rotation.y = Math.PI / 2;
  // The carpet far below.
  const carpet = std({ map: own(speckled("#3c4654", ["rgba(16,20,28,0.4)", "rgba(110,124,148,0.3)"], 23, 26, 4200)), ...weave(40, 40, own), roughness: 1 }),
    floor = add(new T.PlaneGeometry(120, 120), carpet, 0, TOP - 5.4, 0);
  floor.rotation.x = -Math.PI / 2;
  // The armrest and console at the right, with a reading lamp and a glass of juice.
  add(block(1.5, 0.9, 12, 0.1), std({ color: "#4a3426", roughness: 0.55 }), EDGE.right + 0.85, TOP - 0.15, 0, true);
  add(new T.BoxGeometry(0.08, 0.05, 12), metal, EDGE.right + 0.12, TOP + 0.31, 0);
  if (!rich) return;
  const glass = own(new T.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.05, transmission: 0.9, thickness: 0.1, transparent: true, opacity: 0.35 })),
    juice = std({ color: "#f0a12a", roughness: 0.2 });
  add(lathe([[0, 0], [0.24, 0], [0.27, 0.7], [0.25, 0.7], [0.22, 0.04], [0, 0.04]], 24), glass, EDGE.right + 0.8, TOP + 0.3, -2.6);
  add(new T.CylinderGeometry(0.22, 0.215, 0.42, 20), juice, EDGE.right + 0.8, TOP + 0.3 + 0.25, -2.6);
  const lamp = new T.Group();
  lamp.position.set(EDGE.right + 1.1, TOP + 0.3, -4.4);
  scene.add(lamp);
  add(new T.CylinderGeometry(0.22, 0.26, 0.08, 20), metal, 0, 0.04, 0, true, lamp);
  const neck = add(
    new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0, 1.2, 0), new T.Vector3(-0.3, 1.9, 0.2), new T.Vector3(-0.9, 2.1, 0.6)]), 16, 0.04, 8),
    metal,
    0,
    0.05,
    0,
    true,
    lamp,
  );
  neck.castShadow = true;
  const head = add(new T.CylinderGeometry(0.12, 0.2, 0.32, 18, 1, true), metal, -0.95, 2.05, 0.65, true, lamp);
  head.rotation.z = 0.9;
  add(new T.SphereGeometry(0.1, 12, 10), std({ color: "#fff6dd", emissive: "#ffe9b0", emissiveIntensity: 2 }), -0.98, 1.98, 0.66, false, lamp);
}
