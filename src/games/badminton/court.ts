import * as T from "three";
import { block, planks, stuff } from "../../engine/scene-utils";
import { DOUBLES_LONG, DOUBLES_W, HALF_L, HALF_W, NET_H, POST, SHORT } from "./sim";

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
/** How far the green mat reaches round the doubles court's lines. */
export const MAT_X = DOUBLES_W + 1.1,
  MAT_Z = HALF_L + 1.6;
/**
 * The court's mat: green synthetic with a faint grain, and every line of a real court in white 4 cm wide (inside its
 * area): the doubles and singles side lines, the back lines, the doubles long service lines, the short service lines
 * and the centre lines. Only the singles court counts here (the rules say so).
 */
function matPicture(own: Own) {
  const W = 820,
    H = Math.round((W * MAT_Z) / MAT_X),
    { c, ctx } = canvas(W, H),
    random = sequence(11),
    px = W / (MAT_X * 2),
    X = (x: number) => W / 2 + x * px,
    Z = (z: number) => H / 2 + z * px,
    line = 0.04 * px;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#1f6f52");
  g.addColorStop(0.5, "#237a5a");
  g.addColorStop(1, "#1e6b4f");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 9000; k++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,20,10,0.05)";
    ctx.fillRect(random() * W, random() * H, 1 + random() * 2.5, 1);
  }
  ctx.fillStyle = "#f4f6f0";
  const across = (z: number, inward: number, from = -DOUBLES_W, to = DOUBLES_W) => ctx.fillRect(X(from), Z(z) - (inward > 0 ? 0 : line), X(to) - X(from), line),
    along = (x: number, inward: number, from: number, to: number) => ctx.fillRect(X(x) - (inward > 0 ? 0 : line), Z(from), line, Z(to) - Z(from));
  for (const s of [-1, 1]) {
    across(s * HALF_L, -s);
    across(s * DOUBLES_LONG, -s);
    across(s * SHORT, s);
    along(s * DOUBLES_W, -s, -HALF_L, HALF_L);
    along(s * HALF_W, -s, -HALF_L, HALF_L);
    // The centre line from the short service line to the back line, half on each service court.
    ctx.fillRect(X(0) - line / 2, Z(s > 0 ? SHORT : -HALF_L), line, Z(s > 0 ? HALF_L : -SHORT) - Z(s > 0 ? SHORT : -HALF_L));
  }
  return texture(own, c);
}
/** The net's mesh: dark cord in squares on nothing. */
function netPicture(own: Own) {
  const { c, ctx } = canvas(1024, 128);
  ctx.strokeStyle = "rgba(14,16,22,0.92)";
  ctx.lineWidth = 1.6;
  for (let x = 0; x <= 1024; x += 9) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 128);
    ctx.stroke();
  }
  for (let y = 0; y <= 128; y += 9) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1024, y);
    ctx.stroke();
  }
  return texture(own, c);
}
/** A banner on the hall's wall: bold letters on a colour, with a thin light rule above and below. */
function bannerPicture(own: Own, text: string, ground: string, ink: string) {
  const { c, ctx } = canvas(1024, 160);
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, 1024, 160);
  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.fillRect(0, 12, 1024, 4);
  ctx.fillRect(0, 144, 1024, 4);
  ctx.fillStyle = ink;
  ctx.font = '900 78px "Inter", "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 82, 980);
  return texture(own, c);
}
/** A shuttlecock's feathers: white vanes with their quills and a faint shadow between them, the edge cut in scallops. */
export function featherPicture(own: Own) {
  const { c, ctx } = canvas(512, 128);
  ctx.clearRect(0, 0, 512, 128);
  const vanes = 16,
    w = 512 / vanes;
  for (let k = 0; k < vanes; k++) {
    const x = k * w;
    ctx.fillStyle = "#fbfbf6";
    ctx.beginPath();
    ctx.moveTo(x + 1, 128);
    ctx.lineTo(x + 1, 22);
    ctx.quadraticCurveTo(x + w / 2, 2, x + w - 1, 22);
    ctx.lineTo(x + w - 1, 128);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(120,120,110,0.25)";
    ctx.fillRect(x + w - 3, 20, 2, 108);
    ctx.fillStyle = "rgba(190,180,160,0.9)";
    ctx.fillRect(x + w / 2 - 0.8, 14, 1.6, 114);
  }
  // The thread bands that hold the feathers together.
  ctx.fillStyle = "rgba(40,40,46,0.75)";
  ctx.fillRect(0, 74, 512, 3);
  ctx.fillRect(0, 98, 512, 3);
  return texture(own, c);
}

/**
 * The hall: a wooden sports floor with the court's green mat, the net between its posts, the umpire's high chair and
 * the line judges' seats, benches with shuttle tubes, a stand of seats along one side, banners on the walls and the
 * rows of lamps under the roof.
 */
export function hall(scene: T.Scene, own: Own) {
  const group = new T.Group(),
    random = sequence(3);
  scene.add(group);
  // The floor: polished boards; the mat over it, a little raised.
  const floor = own(new T.MeshStandardMaterial({ ...planks(10, own, 12), color: "#d9b48a", roughness: 0.55 }));
  mesh(own, new T.PlaneGeometry(26, 40).rotateX(-Math.PI / 2), floor, 0, -0.002, 0, group, false);
  const mat = own(new T.MeshStandardMaterial({ map: matPicture(own), roughness: 0.82 }));
  mesh(own, new T.BoxGeometry(MAT_X * 2, 0.006, MAT_Z * 2), [floor, floor, mat, floor, floor, floor], 0, 0.001 - 0.003, 0, group, false).receiveShadow = true;
  // The net: its mesh 76 cm deep under a white tape, the cords to the posts, and the posts on their weighted feet.
  const netPaint = own(new T.MeshStandardMaterial({ map: netPicture(own), transparent: true, alphaTest: 0.2, side: T.DoubleSide, roughness: 0.9 })),
    tape = own(new T.MeshStandardMaterial({ color: "#f6f6f0", roughness: 0.6 })),
    steel = own(new T.MeshStandardMaterial({ color: "#2d3a4a", roughness: 0.4, metalness: 0.6 })),
    cap = own(new T.MeshStandardMaterial({ color: "#d7dde4", roughness: 0.3, metalness: 0.8 })),
    deep = 0.76;
  const netMesh = mesh(own, new T.PlaneGeometry(POST * 2, deep), netPaint, 0, NET_H - deep / 2 - 0.035, 0, group, false);
  netMesh.renderOrder = 1;
  mesh(own, new T.BoxGeometry(POST * 2, 0.075, 0.012), tape, 0, NET_H - 0.037, 0, group, false);
  for (const sx of [-1, 1]) {
    mesh(own, new T.CylinderGeometry(0.022, 0.026, 1.55, 14), steel, sx * POST, 0.775, 0, group);
    mesh(own, new T.SphereGeometry(0.03, 12, 8), cap, sx * POST, 1.56, 0, group);
    mesh(own, block(0.5, 0.08, 0.32, 0.03), steel, sx * (POST + 0.12), 0.04, 0, group);
    mesh(own, new T.CylinderGeometry(0.004, 0.004, 0.8, 6), tape, sx * POST, 1.12, 0.012, group, false);
  }
  // The umpire's high chair beside the net, with its steps, and a line judge's chair at each end.
  const chairPaint = own(new T.MeshStandardMaterial({ color: "#1d4c8c", roughness: 0.5, metalness: 0.2 })),
    seatPaint = own(new T.MeshStandardMaterial({ color: "#20232a", roughness: 0.7 })),
    chair = new T.Group();
  chair.position.set(POST + 1.0, 0, 0);
  group.add(chair);
  for (const [x, z] of [[-0.3, -0.3], [0.3, -0.3], [-0.3, 0.3], [0.3, 0.3]]) mesh(own, new T.BoxGeometry(0.05, 1.6, 0.05), chairPaint, x, 0.8, z, chair);
  mesh(own, new T.BoxGeometry(0.7, 0.06, 0.7), seatPaint, 0, 1.62, 0, chair);
  mesh(own, new T.BoxGeometry(0.66, 0.5, 0.06), chairPaint, 0.32, 1.9, 0, chair).rotation.y = Math.PI / 2;
  for (let k = 0; k < 5; k++) mesh(own, new T.BoxGeometry(0.4, 0.04, 0.18), seatPaint, 0.55, 0.28 + k * 0.3, 0, chair);
  for (const sz of [-1, 1]) {
    const judge = new T.Group();
    judge.position.set(DOUBLES_W + 1.3, 0, sz * (HALF_L + 0.9));
    group.add(judge);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) mesh(own, new T.CylinderGeometry(0.015, 0.015, 0.45, 8), steel, x, 0.225, z, judge);
    mesh(own, new T.BoxGeometry(0.45, 0.05, 0.45), chairPaint, 0, 0.46, 0, judge);
    mesh(own, new T.BoxGeometry(0.45, 0.42, 0.04), chairPaint, 0, 0.68, sz * 0.21, judge);
  }
  // Benches at the far side with the players' bags and tubes of shuttles.
  const benchWood = own(new T.MeshStandardMaterial({ ...stuff("boards", "#a8743f", 2, own), roughness: 0.6 })),
    tubePaint = [own(new T.MeshStandardMaterial({ color: "#1b5fb0", roughness: 0.45 })), own(new T.MeshStandardMaterial({ color: "#d8382a", roughness: 0.45 }))],
    bagPaint = [own(new T.MeshStandardMaterial({ color: "#2a2f3a", roughness: 0.8 })), own(new T.MeshStandardMaterial({ color: "#b8312a", roughness: 0.8 }))];
  for (const sz of [-1, 1]) {
    const x = -(DOUBLES_W + 1.6),
      z = sz * 3.4;
    mesh(own, block(0.42, 0.05, 2.2, 0.02), benchWood, x, 0.45, z, group);
    for (const dz of [-0.9, 0.9]) mesh(own, new T.BoxGeometry(0.36, 0.45, 0.05), steel, x, 0.225, z + dz, group);
    const side = sz > 0 ? 0 : 1;
    mesh(own, new T.CapsuleGeometry(0.16, 0.6, 4, 10).rotateX(Math.PI / 2), bagPaint[side], x, 0.66, z - 0.4, group);
    for (let k = 0; k < 3; k++) mesh(own, new T.CylinderGeometry(0.045, 0.045, 0.82, 14).rotateX(Math.PI / 2).rotateY(0.2 * k), tubePaint[side], x + 0.06 - k * 0.05, 0.52 + k * 0.09, z + 0.55, group);
  }
  // A stand of seats along the far wall's side: rows rising, in blocks of colour.
  const stand = new T.Group(),
    seatColours = ["#c8352a", "#1f5fb8", "#f2b62a"].map((c) => own(new T.MeshStandardMaterial({ color: c, roughness: 0.55 }))),
    stepPaint = own(new T.MeshStandardMaterial({ color: "#5b6270", roughness: 0.85 })),
    seat = own(block(0.42, 0.08, 0.38, 0.03)),
    back = own(block(0.42, 0.32, 0.05, 0.02));
  stand.position.set(9.6, 0, 0);
  group.add(stand);
  // The seats are drawn together, a pair of instanced meshes for each colour (hundreds of them, few draw calls).
  const places: [number, T.Matrix4, T.Matrix4][] = [],
    turn = new T.Matrix4().makeRotationY(Math.PI / 2);
  for (let row = 0; row < 7; row++) {
    const x = row * 0.8,
      y = 0.5 + row * 0.45;
    mesh(own, new T.BoxGeometry(0.8, y, 30), stepPaint, x, y / 2, 0, stand);
    for (let k = -18; k <= 18; k++)
      places.push([Math.abs(k + row * 2) % 3 === 0 ? 2 : k < 0 ? 0 : 1, new T.Matrix4().makeTranslation(x - 0.05, y + 0.25, k * 0.78), new T.Matrix4().makeTranslation(x + 0.2, y + 0.44, k * 0.78).multiply(turn)]);
  }
  seatColours.forEach((paint, colour) => {
    const mine = places.filter(([c]) => c === colour),
      seats = new T.InstancedMesh(seat, paint, mine.length),
      backs = new T.InstancedMesh(back, paint, mine.length);
    mine.forEach(([, s, b], i) => {
      seats.setMatrixAt(i, s);
      backs.setMatrixAt(i, b);
    });
    seats.receiveShadow = backs.receiveShadow = true;
    stand.add(seats, backs);
  });
  // The walls: a dark band low, light panels above, and the banners; the roof's lamp rows.
  const lowWall = own(new T.MeshStandardMaterial({ color: "#20345a", roughness: 0.7 })),
    highWall = own(new T.MeshStandardMaterial({ color: "#cfd6df", roughness: 0.9 })),
    roof = own(new T.MeshStandardMaterial({ color: "#3a4048", roughness: 0.9 })),
    lamp = own(new T.MeshStandardMaterial({ color: "#ffffff", emissive: "#fff6e2", emissiveIntensity: 1.6 })),
    truss = own(new T.MeshStandardMaterial({ color: "#59616c", roughness: 0.6, metalness: 0.5 }));
  const wall = (w: number, x: number, z: number, turn: number) => {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = turn;
    group.add(g);
    mesh(own, new T.PlaneGeometry(w, 2.4), lowWall, 0, 1.2, 0, g, false);
    mesh(own, new T.PlaneGeometry(w, 9.6), highWall, 0, 7.2, 0, g, false);
    return g;
  };
  const far = wall(26, 0, -18, 0),
    near = wall(26, 0, 18, Math.PI);
  wall(36, -12, 0, Math.PI / 2);
  wall(36, 15.5, 0, -Math.PI / 2);
  const banners: [string, string, string][] = [
    ["WORLD TABLE GAMES · BADMINTON", "#c8302a", "#ffffff"],
    ["배드민턴 오픈", "#16408a", "#ffe27a"],
  ];
  banners.forEach(([text, ground, ink], k) => {
    const paint = own(new T.MeshStandardMaterial({ map: bannerPicture(own, text, ground, ink), roughness: 0.7, emissive: "#ffffff", emissiveIntensity: 0.06 }));
    mesh(own, new T.PlaneGeometry(10.5, 1.64), paint, (k ? -1 : 1) * 6.2, 4.3, 0.02, far, false);
    mesh(own, new T.PlaneGeometry(10.5, 1.64), paint, (k ? 1 : -1) * 6.2, 4.3, 0.02, near, false);
  });
  mesh(own, new T.PlaneGeometry(30, 40).rotateX(Math.PI / 2), roof, 0, 12, 0, group, false);
  for (let r = -2; r <= 2; r++) {
    mesh(own, new T.BoxGeometry(28, 0.18, 0.18), truss, 0, 11.4, r * 7, group, false);
    for (let k = -2; k <= 2; k++) mesh(own, new T.BoxGeometry(1.4, 0.12, 0.7), lamp, k * 4.6 + (random() - 0.5) * 0.2, 11.2, r * 7, group, false);
  }
  return group;
}
