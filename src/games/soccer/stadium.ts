import * as T from "three";
import { capable } from "../../engine/scene-utils";
import { TEAM_COLORS } from "./roster";
import { FLAT, GRAVITY } from "./sim";

/**
 * The two small stadiums of 축구, our own (nothing taken from any other game's look), built in code:
 *
 *  평면 축구: a mown grass pitch with its white lines seen from above at a tilt, low blue boards round it with our own
 *  lettering, white round posts, crossbars and nets at both ends, a dark apron, a stand with its crowd along the far
 *  side and terraces behind the goals, and floodlight masts at the corners (the masts and end terraces only where a
 *  graphics card draws).
 *
 *  중력 축구: the pitch seen from the side, a strip of grass on its soil, the goals standing on it at the ends (posts,
 *  crossbar, roof and net), the end walls and the roof truss that keep the ball in, and the crowd in the stands
 *  behind under an evening sky.
 *
 * Rooms are Lambert (cheap under software drawing); only the players and the ball are lit more finely (the view's).
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The stadium's moving parts the view keeps: the crowd (it jumps at a goal) and each goal's net (it shakes). */
export interface Stadium {
  crowd: T.Object3D[];
  nets: [T.Object3D, T.Object3D];
}
/** A small seeded stream, so that the crowd is painted alike every time (thumbnails, tests). */
function stream(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function canvasTexture(own: Own, c: HTMLCanvasElement, repeat?: [number, number]) {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
const lambert = (own: Own, options: T.MeshLambertMaterialParameters) => own(new T.MeshLambertMaterial(options));
function mesh(own: Own, parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0, shadow = false) {
  const m = new T.Mesh(own(geometry), material);
  m.position.set(x, y, z);
  m.receiveShadow = shadow;
  parent.add(m);
  return m;
}
/** A crowd on a terrace: rows of people as dots of shirts and heads in many colours, flags of both teams here and there. */
function crowdTexture(own: Own, seed: number, rows: number, across: number) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 256;
  const ctx = c.getContext("2d")!,
    random = stream(seed),
    rowH = c.height / rows,
    shirts = ["#e3343a", "#e3343a", "#2b6fe3", "#2b6fe3", "#f3f1ea", "#1b1d22", "#f2c230", "#3f8f4a", "#9a5ad0", "#ef8a2c"],
    skins = ["#f1c9a5", "#d9a982", "#b07a52", "#7a5236", "#e6b893"];
  ctx.fillStyle = "#2b2f38";
  ctx.fillRect(0, 0, c.width, c.height);
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    // The step of the terrace, lighter at its edge.
    ctx.fillStyle = r % 2 ? "#363b46" : "#323743";
    ctx.fillRect(0, y, c.width, rowH);
    ctx.fillStyle = "#4a505d";
    ctx.fillRect(0, y + rowH - 2, c.width, 2);
    const n = across;
    for (let k = 0; k < n; k++) {
      if (random() < 0.08) continue;
      const x = ((k + random() * 0.5) / n) * c.width,
        w = (c.width / n) * 0.7,
        body = rowH * 0.5;
      ctx.fillStyle = shirts[Math.floor(random() * shirts.length)];
      ctx.beginPath();
      ctx.roundRect(x - w / 2, y + rowH - body - 2, w, body, w * 0.4);
      ctx.fill();
      ctx.fillStyle = skins[Math.floor(random() * skins.length)];
      ctx.beginPath();
      ctx.arc(x, y + rowH - body - w * 0.42, w * 0.38, 0, Math.PI * 2);
      ctx.fill();
      // A flag or a scarf held up, in a team's colours.
      if (random() < 0.05) {
        ctx.fillStyle = TEAM_COLORS[random() < 0.5 ? 0 : 1];
        ctx.fillRect(x - w * 0.1, y + 2, w * 1.4, rowH * 0.34);
        ctx.fillStyle = "#f3f1ea";
        ctx.fillRect(x - w * 0.1, y + 2 + rowH * 0.15, w * 1.4, rowH * 0.06);
      }
    }
  }
  return canvasTexture(own, c);
}
/** The advertising boards' face: deep blue with a white rule and our own words, repeated. */
function boardTexture(own: Own, words: string[]) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 64;
  const ctx = c.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, "#1d3f8f");
  g.addColorStop(1, "#122a63");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 64);
  ctx.fillStyle = "#f3f1ea";
  ctx.fillRect(0, 0, 1024, 5);
  ctx.font = '800 30px "Inter", "Noto Sans KR", Arial, sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  words.forEach((word, k) => {
    ctx.fillStyle = k % 2 ? "#ffd45a" : "#f3f1ea";
    ctx.fillText(word, ((k + 0.5) / words.length) * 1024, 36);
  });
  return canvasTexture(own, c, [1, 1]);
}
/** A goal's net: white cords in a square mesh over nothing (cut out by `alphaTest`). */
function netTexture(own: Own, across: number, down: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.lineWidth = 5;
  ctx.strokeRect(0, 0, 64, 64);
  const t = canvasTexture(own, c, [across, down]);
  t.anisotropy = 2;
  return t;
}
/**
 * The flat pitch's grass and lines, painted once: mown stripes across its length, the touch and goal lines, the
 * halfway line and the centre circle, a goal area and a spot before each goal, the corner arcs; the band between the
 * lines and the boards a darker green.
 */
function flatPitchTexture(own: Own, halfX: number, halfY: number) {
  const W = 2048,
    H = Math.round((W * halfY) / halfX),
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    unit = W / (halfX * 2),
    px = (x: number) => W / 2 + x * unit,
    py = (y: number) => H / 2 - y * unit,
    { HX, HY, GOAL, CIRCLE } = FLAT;
  ctx.fillStyle = "#2f7a35";
  ctx.fillRect(0, 0, W, H);
  // Mown stripes, light and dark, across the length of the pitch.
  const stripes = 14,
    span = (HX * 2) / stripes;
  for (let k = 0; k < stripes; k++) {
    ctx.fillStyle = k % 2 ? "#3b8f40" : "#43a047";
    ctx.fillRect(px(-HX + k * span), py(HY), span * unit + 1, HY * 2 * unit);
  }
  // A little texture in the grass.
  const random = stream(11);
  for (let k = 0; k < 9000; k++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
    ctx.fillRect(random() * W, random() * H, 2, 2);
  }
  // Outside the lines, a darker band to the boards.
  ctx.fillStyle = "rgba(10,40,14,0.28)";
  ctx.fillRect(0, 0, W, py(HY));
  ctx.fillRect(0, py(-HY), W, H - py(-HY));
  ctx.fillRect(0, py(HY), px(-HX), HY * 2 * unit);
  ctx.fillRect(px(HX), py(HY), W - px(HX), HY * 2 * unit);
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.lineWidth = unit * 0.07;
  ctx.strokeRect(px(-HX), py(HY), HX * 2 * unit, HY * 2 * unit);
  ctx.beginPath();
  ctx.moveTo(px(0), py(HY));
  ctx.lineTo(px(0), py(-HY));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px(0), py(0), CIRCLE * unit, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  for (const x of [0, -HX + 1.9, HX - 1.9]) {
    ctx.beginPath();
    ctx.arc(px(x), py(0), unit * 0.1, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const s of [-1, 1]) {
    // The goal area, and the arc of the penalty area round it.
    const line = s * HX,
      deep = 1.1,
      wide = GOAL + 0.55;
    ctx.strokeRect(Math.min(px(line), px(line - s * deep)), py(wide), deep * unit, wide * 2 * unit);
    ctx.beginPath();
    ctx.arc(px(line), py(0), 2.2 * unit, s < 0 ? -Math.PI / 2 : Math.PI / 2, s < 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
    ctx.stroke();
    // The corner arcs, a quarter each, inside the lines.
    for (const t of [-1, 1]) {
      const a = Math.atan2(t > 0 ? 1 : -1, -s),
        from = a - Math.PI / 4,
        to = a + Math.PI / 4;
      ctx.beginPath();
      ctx.arc(px(line), py(t * HY), unit * 0.45, from, to);
      ctx.stroke();
    }
  }
  const tex = canvasTexture(own, c);
  tex.anisotropy = 8;
  return tex;
}
/** A goal of the flat pitch at end `s` (−1 the left): round white posts and crossbar, a back frame, nets on three sides and the top. */
function flatGoal(own: Own, scene: T.Scene, s: number, white: T.Material, net: T.Material): T.Object3D {
  const { HX, GOAL, DEPTH, POST } = FLAT,
    tall = 0.52,
    g = new T.Group(),
    holder = new T.Group();
  holder.position.set(s * HX, 0, 0);
  scene.add(holder);
  holder.add(g);
  for (const z of [-GOAL, GOAL]) {
    const post = mesh(own, holder, new T.CylinderGeometry(POST, POST, tall, 20), white, 0, tall / 2, z);
    post.castShadow = true;
    // The back frame and the bar along the ground.
    mesh(own, holder, new T.CylinderGeometry(0.035, 0.035, tall * 0.8, 8), white, s * DEPTH, tall * 0.4, z);
    const side = mesh(own, holder, new T.CylinderGeometry(0.03, 0.03, DEPTH, 8), white, (s * DEPTH) / 2, tall * 0.8, z);
    side.rotation.z = Math.PI / 2;
  }
  const bar = mesh(own, holder, new T.CylinderGeometry(POST * 0.55, POST * 0.55, GOAL * 2, 20), white, 0, tall, 0);
  bar.rotation.x = Math.PI / 2;
  bar.castShadow = true;
  // The net: its back, sides and roof, on the group that shakes.
  const back = mesh(own, g, new T.PlaneGeometry(GOAL * 2, tall * 0.8), net, s * DEPTH, tall * 0.4, 0);
  back.rotation.y = Math.PI / 2;
  for (const z of [-GOAL, GOAL]) mesh(own, g, new T.PlaneGeometry(DEPTH, tall * 0.8), net, (s * DEPTH) / 2, tall * 0.4, z);
  const roofLen = Math.hypot(DEPTH, tall * 0.2),
    roof = mesh(own, g, new T.PlaneGeometry(roofLen, GOAL * 2), net, (s * DEPTH) / 2, tall * 0.9, 0);
  roof.rotation.set(-Math.PI / 2, 0, 0);
  roof.rotation.order = "YXZ";
  roof.rotation.y = s * Math.atan2(tall * 0.2, DEPTH);
  return g;
}
export function flatStadium(scene: T.Scene, own: Own): Stadium {
  const { HX, HY, BX, BY } = FLAT,
    rich = capable(),
    apronX = BX + 1.7,
    apronY = BY + 1.5;
  // The apron round the pitch, then the grass (the pitch and the band to the boards).
  const apron = mesh(own, scene, new T.PlaneGeometry(apronX * 2 + 6, apronY * 2 + 6), lambert(own, { color: "#4a4f57" }), 0, -0.02, 0, true);
  apron.rotation.x = -Math.PI / 2;
  const grass = mesh(own, scene, new T.PlaneGeometry(BX * 2, BY * 2), lambert(own, { map: flatPitchTexture(own, BX, BY) }), 0, 0, 0, true);
  grass.rotation.x = -Math.PI / 2;
  // A running track's red band just outside the boards.
  for (const z of [-1, 1]) {
    const band = mesh(own, scene, new T.PlaneGeometry(BX * 2 + 1.4, 0.55), lambert(own, { color: "#9c3b30" }), 0, -0.01, z * (BY + 0.5));
    band.rotation.x = -Math.PI / 2;
  }
  // The boards: low, deep blue, our own words on their faces, a white rail on top.
  const face = lambert(own, { map: boardTexture(own, ["WORLD TABLE CUP", "축구", "FAIR PLAY", "월드 테이블 게임"]) }),
    edge = lambert(own, { color: "#16306b" }),
    rail = lambert(own, { color: "#f3f1ea" }),
    tall = 0.34,
    thick = 0.12;
  const wall = (w: number, x: number, z: number, turn: number) => {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = turn;
    scene.add(g);
    mesh(own, g, new T.BoxGeometry(w, tall, thick), [edge, edge, edge, edge, face, face] as unknown as T.Material, 0, tall / 2, 0);
    mesh(own, g, new T.BoxGeometry(w, 0.03, thick + 0.02), rail, 0, tall + 0.015, 0);
  };
  wall(BX * 2 + thick * 2, 0, -BY - thick / 2, 0);
  wall(BX * 2 + thick * 2, 0, BY + thick / 2, Math.PI);
  wall(BY * 2, -BX - thick / 2, 0, Math.PI / 2);
  wall(BY * 2, BX + thick / 2, 0, -Math.PI / 2);
  // The goals.
  const white = lambert(own, { color: "#f6f6f2" }),
    netMaterial = own(new T.MeshBasicMaterial({ map: netTexture(own, 6, 3), transparent: true, alphaTest: 0.3, side: T.DoubleSide, depthWrite: false })),
    nets: [T.Object3D, T.Object3D] = [flatGoal(own, scene, -1, white, netMaterial), flatGoal(own, scene, 1, white, netMaterial)];
  // The stand along the far side: terraces rising away, a crowd on them, a roof edge over them.
  const crowd: T.Object3D[] = [],
    crowdMat = lambert(own, { map: crowdTexture(own, 3, 6, 58) }),
    concrete = lambert(own, { color: "#5b606a" });
  const stand = (length: number, x: number, z: number, turn: number, steps: number) => {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = turn;
    scene.add(g);
    const rise = 0.55,
      deep = 0.7,
      slope = Math.hypot(rise, deep) * steps;
    // A low wall at its foot, the terraces rising away with the crowd on them, a back wall and a roof's edge.
    mesh(own, g, new T.BoxGeometry(length, 0.4, 0.15), concrete, 0, 0.2, 0);
    const people = new T.Group();
    g.add(people);
    const face = mesh(own, people, new T.PlaneGeometry(length, slope), crowdMat, 0, (rise * steps) / 2 + 0.1, (-deep * steps) / 2 - 0.1);
    face.rotation.x = -Math.atan2(deep, rise);
    crowd.push(people);
    mesh(own, g, new T.BoxGeometry(length, 0.9, 0.2), concrete, 0, rise * steps + 0.45, -deep * steps - 0.2);
    return g;
  };
  stand(BX * 2 + 3, 0, -apronY - 0.3, 0, 5);
  if (rich) {
    stand(BY * 2 + 1, -apronX - 0.6, 0, Math.PI / 2, 3);
    stand(BY * 2 + 1, apronX + 0.6, 0, -Math.PI / 2, 3);
    // Floodlight masts at the corners, each with a bank of lamps turned to the pitch.
    const steel = lambert(own, { color: "#8d939c" }),
      lamp = own(new T.MeshBasicMaterial({ color: "#fff6d6" }));
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) {
        const x = sx * (apronX + 0.4),
          z = sz * (apronY + 0.2);
        mesh(own, scene, new T.CylinderGeometry(0.07, 0.1, 4.2, 8), steel, x, 2.1, z);
        const head = mesh(own, scene, new T.BoxGeometry(0.9, 0.5, 0.1), steel, x, 4.25, z);
        head.lookAt(0, 0, 0);
        const glow = mesh(own, head, new T.PlaneGeometry(0.8, 0.4), lamp, 0, 0, 0.06);
        glow.rotation.y = 0;
      }
  }
  void HX;
  void HY;
  return { crowd, nets };
}
/** The side view's ground: a band of mown grass on soil, with the halfway line and the centre spot on its top. */
function sideGrassTexture(own: Own) {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 128;
  const ctx = c.getContext("2d")!,
    { W } = GRAVITY,
    stripes = 12;
  for (let k = 0; k < stripes; k++) {
    ctx.fillStyle = k % 2 ? "#3b8f40" : "#45a249";
    ctx.fillRect((k / stripes) * 1024, 0, 1024 / stripes + 1, 128);
  }
  const random = stream(5);
  for (let k = 0; k < 3000; k++) {
    ctx.fillStyle = random() < 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)";
    ctx.fillRect(random() * 1024, random() * 128, 2, 2);
  }
  ctx.fillStyle = "rgba(255,255,255,0.9)";
  // The halfway line across the strip, the goal lines, and the touch line along its near edge.
  const px = (x: number) => ((x + W + 1) / ((W + 1) * 2)) * 1024;
  ctx.fillRect(px(0) - 3, 0, 6, 128);
  for (const s of [-1, 1]) ctx.fillRect(px(s * GRAVITY.GL) - 3, 0, 6, 128);
  ctx.fillRect(0, 112, 1024, 6);
  return canvasTexture(own, c);
}
/** A goal of the side view at end `s`: posts at the goal line, a crossbar, a roof back to the wall, nets. */
function sideGoal(own: Own, scene: T.Scene, s: number, white: T.Material, net: T.Material): T.Object3D {
  const { W, GL, GH, BAR } = GRAVITY,
    deep = W - GL,
    half = 0.75,
    holder = new T.Group(),
    g = new T.Group();
  scene.add(holder);
  holder.add(g);
  for (const z of [-half, half]) {
    const post = mesh(own, holder, new T.CylinderGeometry(BAR, BAR, GH, 16), white, s * GL, GH / 2, z);
    post.castShadow = true;
    // The roof's side bar back to the wall (the one the ball bounces on), and the back post.
    const roof = mesh(own, holder, new T.CylinderGeometry(BAR, BAR, deep, 12), white, s * (GL + deep / 2), GH, z);
    roof.rotation.z = Math.PI / 2;
    mesh(own, holder, new T.CylinderGeometry(BAR * 0.6, BAR * 0.6, GH, 10), white, s * W, GH / 2, z);
  }
  const bar = mesh(own, holder, new T.CylinderGeometry(BAR * 1.1, BAR * 1.1, half * 2, 16), white, s * GL, GH, 0);
  bar.rotation.x = Math.PI / 2;
  // The nets: the roof, the back and the far side (the near side open to the camera, so that the ball shows inside).
  const roofNet = mesh(own, g, new T.PlaneGeometry(deep, half * 2), net, s * (GL + deep / 2), GH, 0);
  roofNet.rotation.x = -Math.PI / 2;
  const back = mesh(own, g, new T.PlaneGeometry(half * 2, GH), net, s * W - s * 0.02, GH / 2, 0);
  back.rotation.y = Math.PI / 2;
  mesh(own, g, new T.PlaneGeometry(deep, GH), net, s * (GL + deep / 2), GH / 2, -half);
  return g;
}
export function gravityStadium(scene: T.Scene, own: Own): Stadium {
  const { W, H } = GRAVITY,
    rich = capable(),
    front = 1.1,
    back = -1.4;
  // The ground: grass on top, soil on its face.
  const soil = lambert(own, { color: "#6b4a2f" }),
    top = lambert(own, { map: sideGrassTexture(own) }),
    ground = mesh(own, scene, new T.BoxGeometry((W + 1) * 2, 0.7, front - back), [soil, soil, top, soil, soil, soil] as unknown as T.Material, 0, -0.35, (front + back) / 2, true);
  ground.receiveShadow = true;
  // A strip of grass painted brighter along the face's top, so that the edge reads.
  mesh(own, scene, new T.BoxGeometry((W + 1) * 2, 0.06, 0.02), lambert(own, { color: "#58b85c" }), 0, -0.03, front + 0.01);
  // The end walls that keep the ball in, deep blue boards with our words, from the ground to the roof.
  const face = lambert(own, { map: boardTexture(own, ["WORLD TABLE CUP", "중력 축구"]) }),
    edge = lambert(own, { color: "#16306b" });
  for (const s of [-1, 1]) {
    const wall = mesh(own, scene, new T.BoxGeometry(0.2, H + 0.3, front - back + 0.2), [edge, edge, edge, edge, face, face] as unknown as T.Material, s * (W + 0.1), (H + 0.3) / 2, (front + back) / 2);
    wall.rotation.y = 0;
  }
  // The roof truss over the pitch (its ceiling), with lamps under it.
  const steel = lambert(own, { color: "#3d434d" }),
    lamp = own(new T.MeshBasicMaterial({ color: "#fff3cf" }));
  mesh(own, scene, new T.BoxGeometry(W * 2 + 0.4, 0.14, 0.3), steel, 0, H + 0.07, 0.1);
  mesh(own, scene, new T.BoxGeometry(W * 2 + 0.4, 0.06, 0.06), steel, 0, H + 0.3, 0.1);
  for (let k = -5; k <= 5; k++) {
    const strut = mesh(own, scene, new T.BoxGeometry(0.04, 0.3, 0.04), steel, k * ((W * 2) / 11), H + 0.18, 0.1);
    strut.rotation.z = k % 2 ? 0.6 : -0.6;
    if (k % 2 === 0) mesh(own, scene, new T.BoxGeometry(0.34, 0.05, 0.18), lamp, k * ((W * 2) / 11), H - 0.01, 0.1);
  }
  // The goals.
  const white = lambert(own, { color: "#f6f6f2" }),
    netMaterial = own(new T.MeshBasicMaterial({ map: netTexture(own, 4, 7), transparent: true, alphaTest: 0.3, side: T.DoubleSide, depthWrite: false })),
    nets: [T.Object3D, T.Object3D] = [sideGoal(own, scene, -1, white, netMaterial), sideGoal(own, scene, 1, white, netMaterial)];
  // The stands behind: terraces rising away under the sky, the crowd on them.
  const crowd: T.Object3D[] = [],
    concrete = lambert(own, { color: "#4c515b" }),
    crowdMat = lambert(own, { map: crowdTexture(own, 9, 7, 64) }),
    g = new T.Group();
  g.position.set(0, 0, back - 0.6);
  scene.add(g);
  mesh(own, g, new T.BoxGeometry(W * 2 + 6, 0.5, 0.4), concrete, 0, 0.25, 0);
  const people = new T.Group();
  g.add(people);
  const face2 = mesh(own, people, new T.PlaneGeometry(W * 2 + 5.6, 4.8), crowdMat, 0, 3.0, -2.2);
  face2.rotation.x = -0.5;
  crowd.push(people);
  mesh(own, g, new T.BoxGeometry(W * 2 + 6, 0.3, 4.2), concrete, 0, 5.45, -4.2);
  if (rich) {
    // Floodlight towers over the stand's ends.
    const mast = lambert(own, { color: "#8d939c" });
    for (const s of [-1, 1]) {
      mesh(own, g, new T.CylinderGeometry(0.1, 0.14, 7, 8), mast, s * (W + 2.2), 3.5, -3);
      const head = mesh(own, g, new T.BoxGeometry(1.4, 0.7, 0.12), mast, s * (W + 2.2), 7, -2.9);
      mesh(own, head, new T.PlaneGeometry(1.25, 0.55), lamp, 0, 0, 0.07);
    }
  }
  return { crowd, nets };
}
/** A football: white with black patches, painted on a sphere's map (`equirectangular`). */
export function ballTexture(own: Own) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#f7f7f4";
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = "#1b1d22";
  // Twelve patches spread over the sphere (a dodecahedron's faces), each drawn as a pentagon in the map's terms.
  const phi = (1 + Math.sqrt(5)) / 2,
    centres: [number, number, number][] = [];
  for (const a of [-1, 1]) for (const b of [-1, 1]) centres.push([0, a, b * phi], [a, b * phi, 0], [b * phi, 0, a]);
  for (const [x, y, z] of centres) {
    const len = Math.hypot(x, y, z),
      lat = Math.asin(y / len),
      lon = Math.atan2(z, x),
      u = ((lon + Math.PI) / (Math.PI * 2)) * 256,
      v = ((Math.PI / 2 - lat) / Math.PI) * 128,
      squeeze = 1 / Math.max(0.35, Math.cos(lat)),
      r = 11;
    for (const shift of [-256, 0, 256]) {
      ctx.beginPath();
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
        ctx.lineTo(u + shift + Math.cos(a) * r * squeeze, v + Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  return canvasTexture(own, c);
}
/** A player's face: its team's colour, a white ring, its number large and who plays it (나, 2P, 컴, a seat) small. */
export function shirtTexture(own: Own, color: string, number: number, word: string, ink = "#ffffff") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(52, 46, 6, 64, 64, 64);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(1, color);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(64, 64, 56, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 58px "Inter", Arial, sans-serif';
  ctx.fillText(String(number), 64, word ? 56 : 66);
  if (word) {
    ctx.font = '800 22px "Pretendard", "Noto Sans KR", sans-serif';
    ctx.fillText(word, 64, 96);
  }
  return canvasTexture(own, c);
}
/** A colour lightened by `k` (0 … 1). */
function shade(hex: string, k: number) {
  const c = new T.Color(hex);
  c.lerp(new T.Color("#ffffff"), k);
  return `#${c.getHexString()}`;
}
/** A tag floating over a player (나, 2P): a rounded label in its colour with a point under it, seen through everything. */
export function tagTexture(own: Own, color: string, word: string) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 96;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(8, 6, 112, 64, 18);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(48, 68);
  ctx.lineTo(64, 90);
  ctx.lineTo(80, 68);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#1b1d22";
  ctx.font = '900 42px "Pretendard", "Noto Sans KR", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(word, 64, 40);
  return canvasTexture(own, c);
}
