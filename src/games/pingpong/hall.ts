import * as T from "three";
import { block, glossy, stuff, wood } from "../../engine/scene-utils";
import { FLOOR, HALF_L, HALF_W, NET_H, NET_OUT } from "./sim";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A tiny fixed sequence, so that the painted pictures and the hall come out the same every time. */
function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(own: Own, c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
const mesh = (own: Own, geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, parent: T.Object3D, shadow = true) => {
  const m = new T.Mesh(own(geometry), material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};
/** The playing surface: matt blue with the white side and end lines and the thin centre line for doubles. */
function topPicture(own: Own) {
  const W = 512,
    H = Math.round((W * HALF_L) / HALF_W),
    { c, ctx } = canvas(W, H),
    random = sequence(5),
    line = (0.02 / (HALF_W * 2)) * W;
  ctx.fillStyle = "#1d4f96";
  ctx.fillRect(0, 0, W, H);
  // The faint grain of the painted board.
  for (let k = 0; k < 2600; k++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(255,255,255,0.025)" : "rgba(0,0,20,0.035)";
    ctx.fillRect(random() * W, random() * H, 1 + random() * 3, 1);
  }
  ctx.fillStyle = "#f6f7f2";
  ctx.fillRect(0, 0, W, line);
  ctx.fillRect(0, H - line, W, line);
  ctx.fillRect(0, 0, line, H);
  ctx.fillRect(W - line, 0, line, H);
  ctx.fillRect(W / 2 - 1.2, 0, 2.4, H);
  return texture(own, c);
}
/** The net's mesh: dark cord in small squares on nothing. */
function netPicture(own: Own) {
  const { c, ctx } = canvas(512, 64);
  ctx.strokeStyle = "rgba(18,24,38,0.9)";
  ctx.lineWidth = 1.4;
  for (let x = 0; x <= 512; x += 6) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 64);
    ctx.stroke();
  }
  for (let y = 0; y <= 64; y += 6) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(512, y);
    ctx.stroke();
  }
  return texture(own, c);
}
/**
 * A table tennis table with its top at y = 0 and the net over z = 0: the blue top on a dark frame, two folding
 * halves' undercarriage on wheeled legs, the net in its posts with their clamps. `simple` leaves out the small parts
 * (for the tables further off in the hall).
 */
export function tennisTable(own: Own, simple = false) {
  const group = new T.Group(),
    paint = own(new T.MeshStandardMaterial({ map: topPicture(own), roughness: 0.55, metalness: 0 })),
    edge = own(new T.MeshStandardMaterial({ color: "#173f7a", roughness: 0.6 })),
    frame = own(new T.MeshStandardMaterial({ color: "#23262c", roughness: 0.55, metalness: 0.35 })),
    steel = own(new T.MeshStandardMaterial({ color: "#aab1ba", roughness: 0.3, metalness: 0.85 })),
    rubber = own(new T.MeshStandardMaterial({ color: "#111214", roughness: 0.8 })),
    thick = 0.025;
  // The top: its upper face printed, the edges plain blue.
  mesh(own, block(HALF_W * 2, thick, HALF_L * 2, 0.004, 1), [edge, edge, paint, frame, edge, edge], 0, -thick / 2, 0, group);
  // The frame under the top, and the legs: two pairs a half, with cross bars and wheels.
  const depth = 0.09;
  for (const sx of [-1, 1]) mesh(own, new T.BoxGeometry(0.04, depth, HALF_L * 2 - 0.1), frame, sx * (HALF_W - 0.06), -thick - depth / 2, 0, group);
  for (const sz of [-1, 1]) {
    mesh(own, new T.BoxGeometry(HALF_W * 2 - 0.12, depth, 0.04), frame, 0, -thick - depth / 2, sz * (HALF_L - 0.05), group);
    mesh(own, new T.BoxGeometry(HALF_W * 2 - 0.12, 0.05, 0.05), frame, 0, -thick - depth / 2, sz * 0.06, group);
    const legZ = sz * (HALF_L - 0.35),
      legH = -FLOOR - thick - 0.06;
    for (const sx of [-1, 1]) {
      mesh(own, new T.CylinderGeometry(0.022, 0.022, legH, 10), frame, sx * (HALF_W - 0.22), FLOOR + 0.06 + legH / 2, legZ, group);
      if (!simple) {
        mesh(own, new T.CylinderGeometry(0.045, 0.045, 0.035, 16).rotateZ(Math.PI / 2), rubber, sx * (HALF_W - 0.22), FLOOR + 0.045, legZ + sz * 0.04, group);
        mesh(own, new T.CylinderGeometry(0.03, 0.03, 0.045, 12).rotateZ(Math.PI / 2), steel, sx * (HALF_W - 0.22), FLOOR + 0.045, legZ + sz * 0.04, group, false);
      }
    }
    mesh(own, new T.BoxGeometry(HALF_W * 2 - 0.44, 0.035, 0.035), frame, 0, FLOOR + 0.3, legZ, group);
    if (!simple) for (const sx of [-1, 1]) mesh(own, new T.BoxGeometry(0.03, 0.03, 0.55).rotateX(sz * 0.62), frame, sx * (HALF_W - 0.22), FLOOR + 0.42, sz * (HALF_L - 0.62), group);
  }
  // The net: posts at either side with clamps over the edge, the mesh, and the white band along its top.
  const span = HALF_W + NET_OUT,
    netPaint = own(new T.MeshStandardMaterial({ map: netPicture(own), transparent: true, alphaTest: 0.25, side: T.DoubleSide, roughness: 0.9 })),
    band = own(new T.MeshStandardMaterial({ color: "#f4f4ef", roughness: 0.7 }));
  const netMesh = mesh(own, new T.PlaneGeometry(span * 2, NET_H - 0.012), netPaint, 0, (NET_H - 0.012) / 2, 0, group, false);
  netMesh.renderOrder = 1;
  mesh(own, new T.BoxGeometry(span * 2, 0.016, 0.006), band, 0, NET_H - 0.008, 0, group, false);
  for (const sx of [-1, 1]) {
    mesh(own, new T.CylinderGeometry(0.011, 0.011, NET_H + 0.01, 10), steel, sx * span, NET_H / 2, 0, group);
    mesh(own, new T.BoxGeometry(0.05, 0.03, 0.06), frame, sx * (span - 0.04), -0.004, 0, group);
    mesh(own, new T.BoxGeometry(0.03, 0.05, 0.05), frame, sx * (HALF_W + 0.02), -0.035, 0, group);
    if (!simple) mesh(own, new T.SphereGeometry(0.014, 10, 8), steel, sx * span, NET_H + 0.01, 0, group, false);
  }
  return group;
}
/** A barrier panel's print: deep blue with a white stripe and words of our own. */
function barrierPrint(own: Own, words: string, colour: string) {
  const { c, ctx } = canvas(1024, 256);
  ctx.fillStyle = colour;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(0, 200, 1024, 18);
  ctx.fillStyle = "#ffcf3d";
  ctx.fillRect(0, 222, 1024, 8);
  ctx.font = '900 104px "Inter", "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  const width = ctx.measureText(words).width;
  if (width > 940) ctx.font = `900 ${Math.floor((104 * 940) / width)}px "Inter", "Noto Sans KR", Arial, sans-serif`;
  ctx.fillText(words, 512, 104);
  return texture(own, c);
}
/** A cloth banner hung on the wall: a coloured ground, a border and two lines of words. */
function bannerPrint(own: Own, top: string, bottom: string, ground: string, ink: string) {
  const { c, ctx } = canvas(1024, 320);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, 1024, 320);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 10;
  ctx.strokeRect(18, 18, 988, 284);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = ink;
  ctx.font = '900 120px "Inter", "Noto Sans KR", Arial, sans-serif';
  ctx.fillText(top, 512, 132, 940);
  ctx.font = '700 52px "Inter", "Noto Sans KR", Arial, sans-serif';
  ctx.fillText(bottom, 512, 242, 940);
  return texture(own, c);
}
export interface FlipBoard {
  canvas: HTMLCanvasElement;
  texture: T.CanvasTexture;
}
/** Paints the flip scoreboard: each side's points on two flip cards, the games won on a small card under them. */
export function paintFlip(board: FlipBoard, points: [number, number], games: [number, number]) {
  const ctx = board.canvas.getContext("2d")!,
    W = board.canvas.width,
    H = board.canvas.height;
  ctx.fillStyle = "#20242b";
  ctx.fillRect(0, 0, W, H);
  const card = (x: number, y: number, w: number, h: number, text: string, colour: string, size: number) => {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#ffffff");
    g.addColorStop(0.5, "#e9e9e4");
    g.addColorStop(0.5, "#d9d9d3");
    g.addColorStop(1, "#f3f3ee");
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = colour;
    ctx.font = `900 ${size}px "Inter", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2 + size * 0.04);
    // The split of the card, and its two rings.
    ctx.fillStyle = "rgba(20,20,24,0.55)";
    ctx.fillRect(x, y + h / 2 - 1.5, w, 3);
    ctx.fillStyle = "#9aa0a8";
    for (const rx of [x + w * 0.28, x + w * 0.72]) ctx.fillRect(rx - 4, y - 10, 8, 18);
  };
  const colours = ["#d4321f", "#1f5fc4"];
  [0, 1].forEach((side) => {
    const x = side === 0 ? 24 : W / 2 + 12;
    const tens = Math.floor(points[side] / 10),
      ones = points[side] % 10,
      w = (W / 2 - 36 - 10) / 2;
    card(x, 34, w, 150, tens ? String(tens) : "", colours[side], 132);
    card(x + w + 10, 34, w, 150, String(ones), colours[side], 132);
    card(x + w * 0.5, 204, w + 10, 64, String(games[side]), "#1b1b1f", 54);
  });
  board.texture.needsUpdate = true;
}
/**
 * The table tennis hall round the court: a wooden floor with the court's bounds taped on it, low barriers round the court printed
 * with words of our own, two more tables in the courts beside it, the hall's walls with high windows and banners,
 * the roof's girders and rows of lamps, the umpire's table with a flip scoreboard, a chair, a towel box and a basket
 * of balls. All of it is painted and modelled here.
 */
export function hall(scene: T.Object3D, own: Own) {
  const group = new T.Group();
  scene.add(group);
  const std = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
  // The floor of boards (the courts beside have red mats).
  const boards = std({ ...stuff("boards", "#c08b55", 12, own, 12), roughness: 0.45 });
  mesh(own, new T.PlaneGeometry(40, 40).rotateX(-Math.PI / 2), boards, 0, FLOOR, -4, group, false);
  const court = { x: 3.6, near: 4.6, far: -6.6 },
    mat = std({ color: "#8a2f2b", roughness: 0.75 }),
    tape = std({ color: "#f3efe4", roughness: 0.7 });
  // The court's bounds taped on the boards.
  for (const sx of [-1, 1]) mesh(own, new T.PlaneGeometry(0.05, court.near - court.far - 0.6).rotateX(-Math.PI / 2), tape, sx * (court.x - 0.35), FLOOR + 0.002, (court.near + court.far) / 2, group, false);
  mesh(own, new T.PlaneGeometry(court.x * 2 - 0.65, 0.05).rotateX(-Math.PI / 2), tape, 0, FLOOR + 0.002, court.far + 0.35, group, false);
  // The barriers: panels two metres long round the court, their prints facing in.
  const words = ["WORLD TABLE GAMES", "WTG 탁구 클럽", "FAIR PLAY", "PING · PONG", "11 POINTS", "월드 테이블 오픈"],
    colours = ["#173a7a", "#14306a", "#1d4a8c"],
    prints = words.map((w, i) => std({ map: barrierPrint(own, w, colours[i % colours.length]), roughness: 0.6 })),
    back = std({ color: "#11264d", roughness: 0.7 }),
    feet = std({ color: "#2b2e33", roughness: 0.5, metalness: 0.4 }),
    PANEL = 2,
    TALL = 0.7;
  let n = 0;
  const panel = (x: number, z: number, turn: number) => {
    const g = new T.Group(),
      print = prints[n++ % prints.length];
    mesh(own, block(PANEL - 0.04, TALL, 0.05, 0.015, 1), [back, back, back, back, print, back], 0, TALL / 2 + 0.02, 0, g);
    for (const sx of [-1, 1]) mesh(own, new T.BoxGeometry(0.06, 0.03, 0.5), feet, sx * (PANEL / 2 - 0.25), 0.015, -0.18, g, false);
    g.position.set(x, FLOOR, z);
    g.rotation.y = turn;
    group.add(g);
  };
  for (let x = -court.x + PANEL / 2; x < court.x; x += PANEL) panel(x, court.far, 0);
  for (const side of [-1, 1])
    for (let z = court.far + PANEL / 2; z < court.near - 0.5; z += PANEL) panel(side * court.x, z, side < 0 ? Math.PI / 2 : -Math.PI / 2);
  // The courts beside: a table each, in its own barriers.
  for (const sx of [-1, 1]) {
    const other = tennisTable(own, true);
    other.position.set(sx * 7.6, 0, -2.6);
    group.add(other);
    mesh(own, new T.PlaneGeometry(6.6, 11).rotateX(-Math.PI / 2), mat, sx * 7.6, FLOOR + 0.003, -2.6, group, false);
    for (let x = -3.3 + PANEL / 2; x < 3.3; x += PANEL) panel(sx * 7.6 + x, -8.1, 0);
  }
  // The hall: walls with a dado, high windows, banners on the far wall, girders and lamps under the roof.
  const wall = std({ color: "#dfe3e6", roughness: 0.9 }),
    dado = std({ color: "#3d5f8f", roughness: 0.7 }),
    glass = std({ color: "#cfe6ff", emissive: "#cfe6ff", emissiveIntensity: 0.55, roughness: 0.2 }),
    girder = std({ color: "#3a3f47", roughness: 0.5, metalness: 0.5 }),
    lampPaint = std({ color: "#ffffff", emissive: "#fff6e0", emissiveIntensity: 1.4 }),
    ROOF = 6.4,
    FAR = -12,
    SIDE = 12.5;
  mesh(own, new T.PlaneGeometry(SIDE * 2, ROOF - FLOOR), wall, 0, (ROOF + FLOOR) / 2, FAR, group, false);
  mesh(own, new T.PlaneGeometry(SIDE * 2, 1.2), dado, 0, FLOOR + 0.6, FAR + 0.01, group, false);
  for (const sx of [-1, 1]) {
    const side = mesh(own, new T.PlaneGeometry(26, ROOF - FLOOR), wall, sx * SIDE, (ROOF + FLOOR) / 2, FAR + 13, group, false);
    side.rotation.y = -sx * (Math.PI / 2);
    const lower = mesh(own, new T.PlaneGeometry(26, 1.2), dado, sx * (SIDE - 0.01), FLOOR + 0.6, FAR + 13, group, false);
    lower.rotation.y = -sx * (Math.PI / 2);
    for (let z = FAR + 2; z < 10; z += 3.2) {
      const pane = mesh(own, new T.PlaneGeometry(2.2, 1.3), glass, sx * (SIDE - 0.02), ROOF - 1.6, z, group, false);
      pane.rotation.y = -sx * (Math.PI / 2);
    }
  }
  for (let x = -SIDE + 2.2; x < SIDE; x += 3.4) {
    const pane = mesh(own, new T.PlaneGeometry(2.2, 1.3), glass, x, ROOF - 1.6, FAR + 0.02, group, false);
    pane.renderOrder = 0;
  }
  const banners = [
    ["WTG 탁구 클럽", "WORLD TABLE GAMES · TABLE TENNIS", "#c8302a", "#ffffff"],
    ["즐겁게, 끝까지", "한 점 한 점 최선을 다합시다", "#f4f1e6", "#1d3f7a"],
    ["FIRST TO ELEVEN", "월드 테이블 오픈 · 탁구", "#1d3f7a", "#ffd34a"],
  ] as const;
  banners.forEach(([top, bottom, ground, ink], i) => {
    const cloth = std({ map: bannerPrint(own, top, bottom, ground, ink), roughness: 0.85, side: T.DoubleSide });
    mesh(own, new T.PlaneGeometry(4.2, 1.31), cloth, (i - 1) * 5.6, 1.35, FAR + 0.2, group, false);
    mesh(own, new T.CylinderGeometry(0.025, 0.025, 4.4, 8).rotateZ(Math.PI / 2), girder, (i - 1) * 5.6, 2.03, FAR + 0.22, group, false);
  });
  // Pilasters along the far wall (the banners hang in front of them), and a clock at its left.
  const pilaster = std({ color: "#d2d8dd", roughness: 0.85 });
  for (let x = -SIDE + 0.4; x < SIDE; x += 2.8) mesh(own, new T.BoxGeometry(0.36, ROOF - FLOOR - 1.2, 0.14), pilaster, x, (ROOF + FLOOR + 1.2) / 2, FAR + 0.07, group, false);
  const clock = new T.Group(),
    rim = std({ color: "#2b2f36", roughness: 0.4, metalness: 0.5 }),
    dial = std({ color: "#fbfaf5", roughness: 0.6 }),
    hands = std({ color: "#1a1b1f", roughness: 0.5 });
  clock.position.set(-9.4, 1.5, FAR + 0.16);
  group.add(clock);
  mesh(own, new T.CylinderGeometry(0.42, 0.42, 0.08, 40).rotateX(Math.PI / 2), rim, 0, 0, 0, clock, false);
  mesh(own, new T.CircleGeometry(0.37, 40), dial, 0, 0, 0.045, clock, false);
  for (let h = 0; h < 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    mesh(own, new T.BoxGeometry(h % 3 ? 0.02 : 0.035, 0.07, 0.01), hands, Math.sin(a) * 0.3, Math.cos(a) * 0.3, 0.05, clock, false).rotation.z = -a;
  }
  mesh(own, new T.BoxGeometry(0.03, 0.2, 0.01).translate(0, 0.09, 0), hands, 0, 0, 0.06, clock, false).rotation.z = -1.1;
  mesh(own, new T.BoxGeometry(0.02, 0.3, 0.01).translate(0, 0.13, 0), hands, 0, 0, 0.065, clock, false).rotation.z = 2.4;
  for (let z = FAR + 1.5; z < 8; z += 4) mesh(own, new T.BoxGeometry(SIDE * 2, 0.3, 0.14), girder, 0, ROOF - 0.2, z, group, false);
  for (let z = FAR + 3; z < 7; z += 4)
    for (const x of [-7.6, -2.2, 2.2, 7.6]) mesh(own, new T.BoxGeometry(1.4, 0.05, 0.32), lampPaint, x, ROOF - 0.4, z, group, false);
  // The umpire's table by the net with the flip scoreboard on it, and a chair.
  const tablePaint = std({ color: "#2f5ea8", roughness: 0.55 }),
    skirt = std({ color: "#1f3f78", roughness: 0.7 }),
    chairPaint = std({ color: "#c9cdd2", roughness: 0.4, metalness: 0.6 }),
    seat = std({ color: "#1d2a44", roughness: 0.7 }),
    um = { x: HALF_W + 2.25, z: -0.7 },
    umpire = new T.Group();
  umpire.position.set(um.x, FLOOR, um.z);
  umpire.rotation.y = -0.85;
  group.add(umpire);
  mesh(own, block(0.9, 0.04, 0.5, 0.01, 1), tablePaint, 0, 0.74, 0, umpire);
  mesh(own, new T.BoxGeometry(0.88, 0.5, 0.02), skirt, 0, 0.47, 0.24, umpire);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(own, new T.CylinderGeometry(0.015, 0.015, 0.72, 8), chairPaint, sx * 0.4, 0.36, sz * 0.2, umpire, false);
  const flipCanvas = document.createElement("canvas");
  flipCanvas.width = 512;
  flipCanvas.height = 290;
  const flip: FlipBoard = { canvas: flipCanvas, texture: texture(own, flipCanvas) },
    stand = std({ color: "#1b1d22", roughness: 0.5, metalness: 0.3 }),
    face = own(new T.MeshStandardMaterial({ map: flip.texture, roughness: 0.6 }));
  const board = mesh(own, new T.PlaneGeometry(0.72, 0.41), face, 0, 1.0, 0.08, umpire, false);
  board.rotation.x = -0.18;
  mesh(own, block(0.76, 0.03, 0.12, 0.01, 1), stand, 0, 0.78, 0.04, umpire);
  for (const sx of [-1, 1]) mesh(own, new T.BoxGeometry(0.02, 0.46, 0.02).rotateX(-0.18), stand, sx * 0.37, 1.0, 0.06, umpire, false);
  const chair = new T.Group();
  chair.position.set(0.15, 0, -0.55);
  umpire.add(chair);
  mesh(own, block(0.44, 0.05, 0.42, 0.015, 1), seat, 0, 0.46, 0, chair);
  mesh(own, block(0.44, 0.4, 0.04, 0.015, 1), seat, 0, 0.72, -0.2, chair);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) mesh(own, new T.CylinderGeometry(0.012, 0.012, 0.45, 8), chairPaint, sx * 0.19, 0.22, sz * 0.18, chair, false);
  paintFlip(flip, [0, 0], [0, 0]);
  // A towel box at the corner, and a basket of balls on the far side.
  const boxPaint = std({ color: "#1f4c9a", roughness: 0.6 }),
    towel = std({ color: "#f2f0ea", roughness: 0.95 }),
    towelBox = new T.Group();
  towelBox.position.set(-HALF_W - 2.1, FLOOR, -HALF_L - 1.3);
  towelBox.rotation.y = 0.4;
  group.add(towelBox);
  mesh(own, block(0.5, 0.62, 0.36, 0.02, 1), boxPaint, 0, 0.31, 0, towelBox);
  mesh(own, block(0.4, 0.06, 0.28, 0.025, 1), towel, 0.02, 0.64, 0, towelBox);
  const basket = new T.Group(),
    wire = std({ color: "#c7ccd2", roughness: 0.35, metalness: 0.8, wireframe: true }),
    spare = own(glossy({ color: "#ff8f1f", roughness: 0.35 }, 0.5)),
    spareShape = own(new T.SphereGeometry(0.022, 10, 8)),
    random = sequence(17);
  basket.position.set(HALF_W + 1.7, FLOOR, -HALF_L - 2.3);
  group.add(basket);
  mesh(own, new T.CylinderGeometry(0.26, 0.22, 0.5, 16, 3, true), wire, 0, 0.62, 0, basket, false);
  for (const sx of [-1, 1]) mesh(own, new T.CylinderGeometry(0.012, 0.012, 0.4, 6), stand, sx * 0.2, 0.2, 0, basket, false);
  for (let k = 0; k < 40; k++) {
    const ball = new T.Mesh(spareShape, spare),
      a = random() * Math.PI * 2,
      r = Math.sqrt(random()) * 0.2;
    ball.position.set(Math.cos(a) * r, 0.42 + random() * 0.3, Math.sin(a) * r);
    basket.add(ball);
  }
  // A bench along each side wall, under the windows.
  const benchTop = std({ ...{ map: own(wood(false)) }, color: "#d9b07a", roughness: 0.6 });
  for (const sx of [-1, 1]) {
    const bench = new T.Group();
    bench.position.set(sx * (SIDE - 0.6), FLOOR, -2);
    group.add(bench);
    mesh(own, block(0.4, 0.05, 6, 0.015, 1), benchTop, 0, 0.45, 0, bench);
    for (const z of [-2.6, 0, 2.6]) mesh(own, new T.BoxGeometry(0.36, 0.43, 0.05), stand, 0, 0.215, z, bench, false);
  }
  return { flip };
}
