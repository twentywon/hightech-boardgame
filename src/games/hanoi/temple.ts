import * as T from "three";
import { block, capable, glossy, stuff, wood } from "../../engine/scene-utils";

/**
 * The hall the tower of Hanoi stands in (the user asked for the five puzzles to be upgraded): an old temple hall at
 * night, all made in code and of our own design. The stand rests on a long lacquered offering table (its top at
 * y 0) on a stone floor; behind it a plastered wall with timber posts and beams, a round moon window between two
 * glowing lattice screens, red pillars at the sides and paper lanterns hung from the beam; brass candlesticks and a
 * bronze censer stand at the ends of the table, clear of the pegs. Nothing stands between the camera and the pegs.
 */
type Keep = <R extends { dispose(): void }>(resource: R) => R;
export interface Temple {
  /** Candle flames and the lanterns' skin, for the view's own frames to flicker; smoke curls that rise. */
  flames: T.Mesh[];
  lantern: T.MeshStandardMaterial;
  smoke: T.Mesh[];
  /** The warm light the candles give, flickered with the flames. */
  glow: T.PointLight[];
}
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
function painted(keep: Keep, width: number, height: number, paint: (pen: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d")!, width, height);
  const texture = keep(new T.CanvasTexture(c));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(...repeat);
  }
  return texture;
}
/** A night sky seen through the round window: deep blue, a few stars, a full moon with its seas, a branch of pine across it. */
function moonSky(keep: Keep) {
  return painted(keep, 512, 512, (pen, w, h) => {
    const sky = pen.createRadialGradient(w * 0.62, h * 0.38, 10, w / 2, h / 2, w * 0.75);
    sky.addColorStop(0, "#36507a");
    sky.addColorStop(0.5, "#1b2a4a");
    sky.addColorStop(1, "#0b1226");
    pen.fillStyle = sky;
    pen.fillRect(0, 0, w, h);
    const random = sequence(43);
    for (let i = 0; i < 90; i++) {
      pen.fillStyle = `rgba(255,255,240,${0.3 + random() * 0.6})`;
      pen.beginPath();
      pen.arc(random() * w, random() * h, 0.6 + random() * 1.4, 0, Math.PI * 2);
      pen.fill();
    }
    const halo = pen.createRadialGradient(w * 0.62, h * 0.38, 40, w * 0.62, h * 0.38, 150);
    halo.addColorStop(0, "rgba(255,246,214,0.55)");
    halo.addColorStop(1, "rgba(255,246,214,0)");
    pen.fillStyle = halo;
    pen.fillRect(0, 0, w, h);
    pen.fillStyle = "#fbf3d8";
    pen.beginPath();
    pen.arc(w * 0.62, h * 0.38, 62, 0, Math.PI * 2);
    pen.fill();
    pen.fillStyle = "rgba(196,184,150,0.45)";
    for (const [x, y, r] of [[0.6, 0.35, 14], [0.66, 0.42, 10], [0.58, 0.43, 8], [0.64, 0.33, 6]]) {
      pen.beginPath();
      pen.arc(w * x, h * y, r, 0, Math.PI * 2);
      pen.fill();
    }
    // A pine branch in silhouette, from the lower left.
    pen.strokeStyle = "#0a0d12";
    pen.fillStyle = "#0a0d12";
    pen.lineWidth = 9;
    pen.lineCap = "round";
    pen.beginPath();
    pen.moveTo(-10, h * 0.86);
    pen.quadraticCurveTo(w * 0.3, h * 0.7, w * 0.52, h * 0.74);
    pen.stroke();
    pen.lineWidth = 2;
    for (const [cx, cy] of [[0.18, 0.76], [0.33, 0.71], [0.47, 0.73], [0.08, 0.82]]) {
      for (let k = 0; k < 26; k++) {
        const a = -Math.PI + (k / 25) * Math.PI;
        pen.beginPath();
        pen.moveTo(w * cx, h * cy);
        pen.lineTo(w * cx + Math.cos(a) * 34, h * cy + Math.sin(a) * 22 - 6);
        pen.stroke();
      }
    }
  });
}
/** A lattice screen lit from behind: warm paper behind a grid of dark slats with a border. */
function lattice(keep: Keep) {
  return painted(keep, 256, 512, (pen, w, h) => {
    const paper = pen.createLinearGradient(0, 0, 0, h);
    paper.addColorStop(0, "#ffdc9a");
    paper.addColorStop(0.55, "#ffcf82");
    paper.addColorStop(1, "#e9a95a");
    pen.fillStyle = paper;
    pen.fillRect(0, 0, w, h);
    pen.strokeStyle = "#3b2014";
    pen.lineWidth = 7;
    for (let x = 0; x <= w; x += w / 5) {
      pen.beginPath();
      pen.moveTo(x, 0);
      pen.lineTo(x, h);
      pen.stroke();
    }
    for (let y = 0; y <= h; y += h / 9) {
      pen.beginPath();
      pen.moveTo(0, y);
      pen.lineTo(w, y);
      pen.stroke();
    }
    pen.lineWidth = 18;
    pen.strokeRect(0, 0, w, h);
  });
}
/** Old lime plaster, warm and a little stained. */
function plaster(keep: Keep) {
  return painted(
    keep,
    512,
    512,
    (pen, w, h) => {
      pen.fillStyle = "#cdb892";
      pen.fillRect(0, 0, w, h);
      const random = sequence(97);
      for (let i = 0; i < 900; i++) {
        pen.fillStyle = random() < 0.5 ? `rgba(120,92,58,${random() * 0.07})` : `rgba(255,244,220,${random() * 0.08})`;
        pen.beginPath();
        pen.arc(random() * w, random() * h, 4 + random() * 26, 0, Math.PI * 2);
        pen.fill();
      }
    },
    [3, 1.5],
  );
}
/** A paper lantern's skin: red with ribs of bamboo, lit from within. */
function lanternSkin(keep: Keep) {
  return painted(keep, 256, 128, (pen, w, h) => {
    const glow = pen.createLinearGradient(0, 0, 0, h);
    glow.addColorStop(0, "#b0261a");
    glow.addColorStop(0.5, "#f05a32");
    glow.addColorStop(1, "#b0261a");
    pen.fillStyle = glow;
    pen.fillRect(0, 0, w, h);
    pen.strokeStyle = "rgba(90,20,10,0.6)";
    pen.lineWidth = 2;
    for (let y = 8; y < h; y += 12) {
      pen.beginPath();
      pen.moveTo(0, y);
      pen.lineTo(w, y);
      pen.stroke();
    }
  });
}
/**
 * Builds the hall round a stand `half` wide (from its middle to its end) into `scene`. `paint` makes a material the
 * view owns. The table top is at y 0 and reaches 4 toward the camera and 3.6 away from it.
 */
export function temple(scene: T.Scene, keep: Keep, paint: (options: T.MeshStandardMaterialParameters) => T.MeshStandardMaterial, half: number): Temple {
  const rich = capable(),
    add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = false) => {
      const mesh = new T.Mesh(keep(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    },
    lathe = (points: number[][], segments = 24) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments),
    flames: T.Mesh[] = [],
    smoke: T.Mesh[] = [],
    glow: T.PointLight[] = [];
  scene.fog = new T.Fog("#1a1410", 26, 60);
  // The offering table: a long top of red-brown lacquer with a gilt line round its edge, an apron and stout legs.
  const reach = half + 3.4,
    lacquerMap = keep(wood(true));
  lacquerMap.repeat.set(4, 1);
  const lacquer = keep(glossy({ map: lacquerMap, color: "#a04a32", roughness: 0.32 })),
    gilt = paint({ color: "#d4a94a", roughness: 0.3, metalness: 0.85 }),
    dark = paint({ map: keep(wood(true)), color: "#6a3a26", roughness: 0.55 });
  add(block(reach * 2, 0.3, 7.6, 0.08), lacquer, 0, -0.15, 0.2).castShadow = false;
  add(new T.BoxGeometry(reach * 2 + 0.02, 0.04, 0.04), gilt, 0, -0.08, 4.02);
  add(new T.BoxGeometry(reach * 2 - 0.6, 0.55, 0.12), dark, 0, -0.58, 3.78);
  for (const x of [-reach + 0.5, reach - 0.5]) add(block(0.5, 2.3, 0.5, 0.06), dark, x, -1.45, 3.5);
  // The stone floor of the hall, far below.
  const floor = add(new T.PlaneGeometry(80, 50).rotateX(-Math.PI / 2), paint({ ...stuff("stone", "#5e5850", 10, keep), roughness: 0.9 }), 0, -2.6, 0);
  floor.castShadow = false;
  // The back wall: plaster between timber posts, a beam over it all and a sill below.
  const wallZ = -7.5,
    timber = paint({ map: keep(wood(true)), color: "#7a4a30", roughness: 0.6 });
  add(new T.PlaneGeometry(60, 20), paint({ map: plaster(keep), roughness: 0.95 }), 0, 6, wallZ - 0.05);
  add(new T.BoxGeometry(60, 0.7, 0.5), timber, 0, 10.2, wallZ + 0.1);
  add(new T.BoxGeometry(60, 0.5, 0.4), timber, 0, -0.9, wallZ + 0.1);
  // The round moon window in the middle, in a thick ring of dark wood.
  const moonY = 5.8,
    moonR = 3.1;
  add(new T.CircleGeometry(moonR, 56), keep(new T.MeshBasicMaterial({ map: moonSky(keep), fog: false })), 0, moonY, wallZ);
  add(new T.TorusGeometry(moonR + 0.12, 0.26, 12, 64), timber, 0, moonY, wallZ + 0.08);
  // Lattice screens lit warm from behind, either side of it, between posts.
  const screens = keep(new T.MeshBasicMaterial({ map: lattice(keep) }));
  for (const x of [-7.6, 7.6]) {
    add(new T.PlaneGeometry(3.6, 6.4), screens, x, 5.2, wallZ);
    for (const dx of [-2.0, 2.0]) add(new T.BoxGeometry(0.42, 10.6, 0.42), timber, x + dx, 4.8, wallZ + 0.2);
    add(new T.BoxGeometry(4.4, 0.3, 0.3), timber, x, 8.55, wallZ + 0.15);
    add(new T.BoxGeometry(4.4, 0.3, 0.3), timber, x, 1.85, wallZ + 0.15);
  }
  // Red lacquered pillars at the sides of the hall, on stone bases.
  const red = keep(glossy({ color: "#9a2418", roughness: 0.4 })),
    base = paint({ ...stuff("stone", "#8a8476", 1, keep), roughness: 0.9 });
  for (const x of [-(half + 7.2), half + 7.2]) {
    add(new T.CylinderGeometry(0.55, 0.6, 14, 24), red, x, 4.4, -5.2);
    add(lathe([[0, 0], [0.95, 0], [0.95, 0.3], [0.7, 0.55], [0, 0.55]]), base, x, -2.6, -5.2);
  }
  // Paper lanterns hung from the beam on cords, each with a glow of its own.
  const skin = paint({ map: lanternSkin(keep), emissive: "#ff6a30", emissiveIntensity: 0.55, roughness: 0.8 }),
    cap = paint({ color: "#2a1a10", roughness: 0.6 }),
    cord = paint({ color: "#2a1a10" }),
    bulge = keep(new T.SphereGeometry(0.62, 20, 14).scale(1, 1.25, 1));
  for (const x of [-4.6, 4.6]) {
    const y = 8.4;
    add(bulge.clone(), skin, x, y, -6.4);
    add(new T.CylinderGeometry(0.34, 0.34, 0.14, 16), cap, x, y + 0.8, -6.4);
    add(new T.CylinderGeometry(0.34, 0.34, 0.14, 16), cap, x, y - 0.8, -6.4);
    add(new T.CylinderGeometry(0.018, 0.018, 1.6, 6), cord, x, y + 1.6, -6.4);
    if (rich) {
      const light = new T.PointLight("#ff9a58", 6, 9, 2);
      light.position.set(x, y, -5.8);
      scene.add(light);
      glow.push(light);
    }
  }
  // Brass candlesticks with lit candles at both ends of the table, and a bronze censer with smoke rising before one.
  const brass = paint({ color: "#c9a44a", roughness: 0.28, metalness: 0.85 }),
    wax = paint({ color: "#f4ead2", roughness: 0.7, emissive: "#ffb060", emissiveIntensity: 0.08 }),
    stick = keep(lathe([[0, 0], [0.42, 0], [0.44, 0.06], [0.3, 0.14], [0.12, 0.3], [0.09, 0.9], [0.14, 1.0], [0.1, 1.06], [0.09, 1.5], [0.26, 1.58], [0.28, 1.64], [0, 1.64]])),
    candle = keep(new T.CylinderGeometry(0.11, 0.11, 0.9, 16)),
    flame = keep(new T.SphereGeometry(0.07, 12, 10).scale(1, 2.4, 1).translate(0, 0.12, 0)),
    fire = keep(new T.MeshBasicMaterial({ color: "#ffd27a", transparent: true, opacity: 0.92, fog: false }));
  for (const x of [-(half + 1.7), half + 1.7]) {
    for (const z of [-1.4, 1.2]) {
      const tall = z < 0 ? 1 : 0.72,
        holder = new T.Mesh(stick, brass);
      holder.scale.set(1, tall, 1);
      holder.position.set(x, 0, z);
      holder.castShadow = true;
      scene.add(holder);
      add(candle.clone(), wax, x, 1.64 * tall + 0.45, z, true);
      const wick = new T.Mesh(flame, fire);
      wick.position.set(x, 1.64 * tall + 0.92, z);
      scene.add(wick);
      flames.push(wick);
    }
    if (rich) {
      const light = new T.PointLight("#ffb46a", 3.5, 7, 2);
      light.position.set(x, 2.6, 0);
      scene.add(light);
      glow.push(light);
    }
  }
  // The censer: a bronze bowl on three feet with a pierced lid, before the left candles.
  const bronze = paint({ color: "#6b5634", roughness: 0.45, metalness: 0.7 }),
    cx = -(half + 1.7),
    cz = 2.9;
  add(lathe([[0, 0.12], [0.5, 0.14], [0.62, 0.34], [0.58, 0.56], [0.48, 0.6], [0, 0.6]]), bronze, cx, 0.1, cz, true);
  add(lathe([[0.5, 0], [0.4, 0.2], [0.18, 0.34], [0.08, 0.48], [0, 0.5]]), bronze, cx, 0.68, cz, true);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.4;
    add(new T.CylinderGeometry(0.05, 0.03, 0.26, 8), bronze, cx + Math.cos(a) * 0.36, 0.1, cz + Math.sin(a) * 0.36, true);
  }
  const puff = keep(new T.PlaneGeometry(0.5, 0.5)),
    wisp = painted(keep, 64, 64, (pen, w, h) => {
      const g = pen.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgba(235,230,220,0.55)");
      g.addColorStop(1, "rgba(235,230,220,0)");
      pen.fillStyle = g;
      pen.fillRect(0, 0, w, h);
    });
  for (let k = 0; k < 6; k++) {
    const curl = new T.Mesh(puff, keep(new T.MeshBasicMaterial({ map: wisp, transparent: true, depthWrite: false, opacity: 0.5 })));
    curl.position.set(cx, 1.3 + k * 0.45, cz);
    curl.userData.phase = k / 6;
    curl.renderOrder = 6;
    scene.add(curl);
    smoke.push(curl);
  }
  return { flames, lantern: skin, smoke, glow };
}
/** The flames flicker, the lanterns breathe and the smoke rises and fades, `t` seconds on; `camera` turns the smoke to face it. */
export function flicker(temple: Temple, t: number, camera: T.Camera) {
  temple.flames.forEach((flame, i) => {
    const wave = Math.sin(t * 9.3 + i * 1.7) * 0.5 + Math.sin(t * 15.1 + i * 2.3) * 0.3;
    flame.scale.set(1 + wave * 0.08, 1 + wave * 0.16, 1 + wave * 0.08);
  });
  temple.lantern.emissiveIntensity = 0.5 + 0.06 * Math.sin(t * 2.1);
  temple.glow.forEach((light, i) => (light.intensity = (i < 2 ? 6 : 3.5) * (0.9 + 0.1 * Math.sin(t * 11 + i * 2.1) * Math.sin(t * 6.3 + i))));
  temple.smoke.forEach((curl) => {
    const p = (t * 0.12 + (curl.userData.phase as number)) % 1;
    curl.position.y = 1.3 + p * 2.8;
    curl.position.x = (curl.userData.x ??= curl.position.x) + Math.sin(p * 7 + (curl.userData.phase as number) * 9) * 0.22 * p;
    curl.scale.setScalar(0.6 + p * 1.6);
    (curl.material as T.MeshBasicMaterial).opacity = 0.45 * Math.sin(Math.PI * p);
    curl.quaternion.copy(camera.quaternion);
  });
}
