import * as T from "three";
import { block, wood, stuff, weave } from "./scene-utils";

/** Registers a resource with the view that must dispose it. */
type Own = <R extends { dispose(): void }>(resource: R) => R;

function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement, repeatX = 1, repeatY = repeatX) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeatX !== 1 || repeatY !== 1) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
  }
  return t;
}
function noise(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/** A flat colour broken up by small marks: grass, carpet, plastic. */
export function speckled(base: string, marks: string[], seed: number, repeat: number, count = 2600) {
  const { c, ctx } = canvas(256, 256),
    rand = noise(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = marks[Math.floor(rand() * marks.length)];
    const size = 1 + rand() * 2.4;
    ctx.fillRect(rand() * 256, rand() * 256, size, size * (1 + rand() * 2));
  }
  return texture(c, repeat);
}
function box(
  scene: T.Object3D,
  own: Own,
  size: [number, number, number],
  at: [number, number, number],
  material: T.Material,
  shadow = true,
) {
  const mesh = new T.Mesh(own(new T.BoxGeometry(...size)), material);
  mesh.position.set(...at);
  mesh.castShadow = shadow;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/**
 * A park bench under the board: the seat's planks run left to right, the
 * backrest stands behind, and the lawn and a gravel path lie below.
 * `top` is the height of the seat's surface.
 */
export function parkBench(scene: T.Object3D, own: Own, top: number) {
  const standard = (options: T.MeshStandardMaterialParameters) =>
    own(new T.MeshStandardMaterial({ roughness: 0.85, ...options }));
  const plankMap = own(wood());
  plankMap.repeat.set(6, 1);
  plankMap.wrapS = plankMap.wrapT = T.RepeatWrapping;
  // Slats in park-bench green paint.
  const plank = standard({ map: plankMap, color: "#4f8a63", roughness: 0.7 }),
    iron = standard({ color: "#2b2f33", roughness: 0.5, metalness: 0.4 }),
    DEPTH = 1.08,
    GAP = 0.12,
    ROWS = 6,
    front = ((ROWS - 1) / 2) * (DEPTH + GAP);
  for (let i = 0; i < ROWS; i++) {
    const z = (i - (ROWS - 1) / 2) * (DEPTH + GAP);
    box(scene, own, [60, 0.22, DEPTH], [0, top - 0.11, z], plank);
    // Bolts where the planks meet the frame.
    for (const x of [-9.2, -5.4, 5.4, 9.2])
      for (const dz of [-0.45, 0.45]) {
        const bolt = new T.Mesh(own(new T.CylinderGeometry(0.07, 0.07, 0.03, 12)), iron);
        bolt.position.set(x, top + 0.012, z + dz);
        scene.add(bolt);
      }
  }
  // The frame under the seat and the backrest leaning away behind it.
  for (const x of [-9.2, -5.4, 5.4, 9.2]) box(scene, own, [0.3, 0.3, front * 2 + DEPTH], [x, top - 0.38, 0], iron);
  const back = new T.Group();
  back.position.set(0, top, -front - DEPTH / 2 - 0.12);
  back.rotation.x = -0.14;
  for (let i = 0; i < 3; i++) box(back, own, [60, 1.05, 0.2], [0, 0.75 + i * 1.2, 0], plank);
  for (const x of [-5.4, 5.4]) box(back, own, [0.3, 4.6, 0.28], [x, 2.1, -0.24], iron);
  scene.add(back);
  // The ground: lawn behind and under the bench, a gravel path in front of it.
  const ground = top - 4.2,
    lawn = standard({
      ...stuff("grass", "#5f8a45", 14, own),
      roughness: 1,
    }),
    gravel = standard({
      ...stuff("gravel", "#b9ad98", 18, own),
      roughness: 1,
    });
  const grass = new T.Mesh(own(new T.PlaneGeometry(140, 140)), lawn);
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = ground;
  grass.receiveShadow = true;
  scene.add(grass);
  const path = new T.Mesh(own(new T.PlaneGeometry(140, 16)), gravel);
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, ground + 0.02, front + DEPTH / 2 + 7.2);
  path.receiveShadow = true;
  scene.add(path);
  // A few fallen leaves on the seat, clear of the board.
  const leaf = own(new T.CircleGeometry(0.2, 7)),
    colours = ["#c8642a", "#d9a12c", "#a8452f", "#8d9a3a"].map((color) =>
      standard({ color, side: T.DoubleSide, roughness: 0.9 }),
    );
  const rand = noise(41);
  for (const [x, z] of [
    [-5.6, 3.2], [-4.6, -2.4], [5.1, 2.6], [6.3, -1.2], [4.4, -3.6], [-6.8, 0.6], [7.6, 3.6], [-7.9, -3.3],
  ]) {
    const mesh = new T.Mesh(leaf, colours[Math.floor(rand() * colours.length)]);
    mesh.rotation.set(-Math.PI / 2 + (rand() - 0.5) * 0.3, 0, rand() * Math.PI * 2);
    mesh.scale.set(1, 0.62 + rand() * 0.3, 1);
    mesh.position.set(x, top + 0.02, z);
    mesh.castShadow = true;
    scene.add(mesh);
  }
}

/** The view through an aircraft window: sky, cloud tops and the tip of a wing. */
function windowTexture() {
  const { c, ctx } = canvas(256, 384),
    sky = ctx.createLinearGradient(0, 0, 0, 384);
  sky.addColorStop(0, "#2f6fc4");
  sky.addColorStop(0.6, "#8fc1ee");
  sky.addColorStop(1, "#e6f1fa");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 256, 384);
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  for (const [x, y, r] of [[50, 300, 46], [110, 320, 60], [190, 304, 52], [240, 330, 44], [20, 340, 50], [150, 350, 70]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "#c9ced4";
  ctx.beginPath();
  ctx.moveTo(256, 200);
  ctx.lineTo(96, 236);
  ctx.lineTo(104, 250);
  ctx.lineTo(256, 262);
  ctx.fill();
  return texture(c);
}
/**
 * An aircraft cabin round a seat's tray table: the table under the dice tray,
 * the seat in front, the cabin wall with a window, armrests and the carpet.
 * `half` and `depth` are the tray's half sizes; `top` is the table's surface.
 */
export function cabin(scene: T.Object3D, own: Own, half: number, depth: number, top: number) {
  const standard = (options: T.MeshStandardMaterialParameters) =>
    own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
  const plastic = standard({
      map: own(speckled("#d5d8da", ["rgba(120,126,132,0.16)", "rgba(255,255,255,0.3)"], 3, 6, 1800)),
      roughness: 0.55,
    }),
    dark = standard({ color: "#3a3f45", roughness: 0.6 }),
    fabric = standard({
      map: own(speckled("#27406b", ["rgba(12,22,44,0.4)", "rgba(92,122,176,0.3)", "rgba(190,150,70,0.16)"], 17, 10, 4200)),
      ...weave(8, 8, own),
      roughness: 1,
    }),
    carpet = standard({
      map: own(speckled("#3c4654", ["rgba(16,20,28,0.4)", "rgba(110,124,148,0.3)"], 23, 26, 4200)),
      ...weave(40, 40, own),
      roughness: 1,
    }),
    wall = standard({ color: "#e4e1d8", roughness: 0.7 });
  // The tray table, on its two arms from the seat in front.
  const farEdge = -depth - 0.8,
    nearEdge = depth + 0.45,
    side = half + 0.45;
  box(scene, own, [side * 2, 0.22, nearEdge - farEdge], [0, top - 0.11, (farEdge + nearEdge) / 2], plastic);
  for (const x of [-side + 0.5, side - 0.5]) box(scene, own, [0.3, 0.2, 1.6], [x, top - 0.3, farEdge - 0.6], dark);
  // The cup recess with a paper cup, and the latch that holds the table shut.
  const cup = new T.Mesh(own(new T.CylinderGeometry(0.34, 0.26, 0.8, 24)), standard({ color: "#f4f2ec", roughness: 0.6 }));
  cup.position.set(side - 0.75, top + 0.4, farEdge + 0.62);
  cup.castShadow = true;
  const coffee = new T.Mesh(own(new T.CircleGeometry(0.31, 24)), standard({ color: "#4a2c1a", roughness: 0.3 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(side - 0.75, top + 0.74, farEdge + 0.62);
  scene.add(cup, coffee);
  box(scene, own, [0.9, 0.08, 0.3], [0, top + 0.04, farEdge + 0.3], dark, false);
  // The seat in front: its back, a screen and the pocket below it.
  const backZ = farEdge - 1.1;
  box(scene, own, [side * 2 + 1.2, 12, 1.2], [0, top + 0.6, backZ], fabric);
  const screen = standard({ color: "#0d1117", roughness: 0.2, metalness: 0.3, emissive: "#16324f", emissiveIntensity: 0.5 });
  box(scene, own, [4.2, 2.4, 0.08], [0, top + 2.5, backZ + 0.64], screen, false);
  box(scene, own, [4.6, 2.8, 0.06], [0, top + 2.5, backZ + 0.61], dark, false);
  box(scene, own, [side * 2 - 0.6, 0.12, 0.14], [0, top + 0.72, backZ + 0.66], dark, false);
  // The cabin wall on the left leans in over the seat; its window shows the sky.
  const hull = new T.Group();
  // It leans away, as the hull curves outward at shoulder height, so the windows face the seat.
  hull.position.set(-side - 1.0, top - 2.2, 0);
  hull.rotation.z = 0.38;
  box(hull, own, [0.5, 9, 60], [0, 4, 0], wall, false);
  const glass = own(new T.MeshBasicMaterial({ map: own(windowTexture()) }));
  for (const z of [-3.3, 2.6]) {
    const pane = new T.Mesh(own(new T.PlaneGeometry(2.3, 3.3)), glass);
    pane.rotation.y = Math.PI / 2;
    pane.position.set(0.27, 3.3, z);
    const frame = new T.Mesh(own(new T.PlaneGeometry(2.9, 3.9)), standard({ color: "#cfcbc0", roughness: 0.6 }));
    frame.rotation.y = Math.PI / 2;
    frame.position.set(0.26, 3.3, z);
    hull.add(frame, pane);
  }
  scene.add(hull);
  // Armrests on both sides, the next seat on the right and the carpet below.
  for (const x of [-side - 0.75, side + 0.75]) {
    box(scene, own, [0.7, 0.5, 9], [x, top - 0.95, nearEdge + 3.2], dark);
    box(scene, own, [0.5, 0.1, 6], [x, top - 0.66, nearEdge + 3.4], plastic, false);
  }
  box(scene, own, [7, 1.4, 9], [side + 4.8, top - 2.4, nearEdge + 2.6], fabric);
  box(scene, own, [side * 2 + 0.6, 1.4, 9], [0, top - 2.9, nearEdge + 3.4], fabric);
  const floor = new T.Mesh(own(new T.PlaneGeometry(120, 120)), carpet);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = top - 5.5;
  floor.receiveShadow = true;
  scene.add(floor);
}

/**
 * The yard of a Korean house: packed earth, the porch and its posts behind,
 * a step stone with rubber shoes, jars on a stone stand and a tiled wall.
 * The playing area in front of the house, round the origin, is left clear.
 */
export function hanokYard(scene: T.Object3D, own: Own) {
  const standard = (options: T.MeshStandardMaterialParameters) =>
    own(new T.MeshStandardMaterial({ roughness: 0.85, ...options }));
  const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const earth = standard({
    ...stuff("earth", "#c2a071", 9, own),
    roughness: 1,
  });
  add(new T.PlaneGeometry(90, 90), earth, 0, -0.03, 0, false).rotation.x = -Math.PI / 2;
  // The house: a stone footing, the wooden porch on it, a step stone and posts.
  const stone = standard({
    ...stuff("stone", "#9c968a", 2, own),
  });
  const timber = standard({ map: own(wood(true)), roughness: 0.7 }),
    plank = standard({ map: own(wood()), roughness: 0.6 });
  add(new T.BoxGeometry(30, 0.5, 5), stone, 0, 0.22, -9.0);
  add(new T.BoxGeometry(26, 0.16, 3.2), plank, 0, 0.86, -8.6);
  for (const x of [-9, -3, 3, 9]) {
    add(new T.BoxGeometry(0.34, 0.36, 0.34), stone, x, 0.65, -7.2);
    add(new T.BoxGeometry(0.3, 6, 0.3), timber, x, 3.8, -7.2);
  }
  add(new T.BoxGeometry(26, 0.22, 0.24), timber, 0, 0.72, -7.05);
  add(new T.BoxGeometry(2.6, 0.3, 0.95), stone, 0, 0.13, -6.0);
  // A pair of white rubber shoes left on the step stone.
  const shoe = own(new T.SphereGeometry(0.17, 16, 10)),
    rubber = standard({ color: "#f3efe4", roughness: 0.5 });
  for (const x of [-0.22, 0.22]) {
    const mesh = new T.Mesh(shoe, rubber);
    mesh.scale.set(0.75, 0.45, 1.5);
    mesh.position.set(x + 0.5, 0.35, -6.0);
    mesh.castShadow = true;
    scene.add(mesh);
  }
  // Stepping stones from the step to the mat.
  for (const [x, z, r] of [[0.1, -5.15, 0.42], [-0.15, -4.75, 0.3]] as const) {
    const slab = add(new T.CylinderGeometry(r, r * 1.05, 0.06, 9), stone, x, 0.0, z, false);
    slab.scale.z = 0.7;
  }
  // Jars for sauces on a low stone stand, to one side of the yard.
  const glaze = standard({ color: "#4a2f22", roughness: 0.35, metalness: 0.05 }),
    profile = [
      [0.22, 0], [0.34, 0.08], [0.47, 0.34], [0.5, 0.56], [0.44, 0.82], [0.32, 0.98], [0.3, 1.04], [0.35, 1.07],
    ].map(([r, y]) => new T.Vector2(r, y)),
    jar = own(new T.LatheGeometry(profile, 22)),
    lid = own(new T.CylinderGeometry(0.2, 0.39, 0.1, 22));
  add(new T.BoxGeometry(3.6, 0.18, 2.6), stone, -6.6, 0.06, -4.6);
  for (const [x, z, s] of [[-7.3, -5.2, 1.25], [-6.2, -5.3, 1.0], [-5.5, -4.5, 0.72], [-6.6, -4.2, 0.85], [-7.5, -4.0, 0.62]]) {
    const body = new T.Mesh(jar, glaze),
      top = new T.Mesh(lid, glaze);
    body.scale.setScalar(s);
    body.position.set(x, 0.15, z);
    top.scale.setScalar(s);
    top.position.set(x, 0.15 + 1.1 * s, z);
    body.castShadow = top.castShadow = true;
    scene.add(body, top);
  }
  // A low wall of stacked stones under a tiled coping closes the far right.
  add(new T.BoxGeometry(1.1, 1.5, 9), stone, 9.2, 0.7, -2.5);
  const tile = standard({ color: "#3b3d42", roughness: 0.6 });
  add(new T.BoxGeometry(1.5, 0.22, 9.2), tile, 9.2, 1.55, -2.5);
}
/** 장판: the oiled yellow paper of an ondol floor, laid in squares whose tones differ a little, browner where it is warm. */
function jangpan() {
  const { c, ctx } = canvas(1024, 1024),
    rand = noise(17),
    cell = 128;
  for (let r = 0; r < 8; r++)
    for (let q = 0; q < 8; q++) {
      const warm = rand() * 0.12;
      ctx.fillStyle = `hsl(${40 - warm * 25}, ${44 + warm * 30}%, ${60 - warm * 50}%)`;
      ctx.fillRect(q * cell, r * cell, cell, cell);
      // A faint mottle in each square, as the varnish lies.
      for (let i = 0; i < 26; i++) {
        ctx.fillStyle = `rgba(${120 + rand() * 40}, ${70 + rand() * 30}, 20, ${0.03 + rand() * 0.04})`;
        ctx.beginPath();
        ctx.ellipse(q * cell + rand() * cell, r * cell + rand() * cell, 6 + rand() * 26, 4 + rand() * 14, rand() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  // The seams between the squares.
  ctx.strokeStyle = "rgba(110, 66, 22, 0.35)";
  ctx.lineWidth = 2;
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * cell, 0);
    ctx.lineTo(i * cell, 1024);
    ctx.moveTo(0, i * cell);
    ctx.lineTo(1024, i * cell);
    ctx.stroke();
  }
  return texture(c, 5, 4);
}
/** A sliding door of 창호: a wooden lattice over white hanji with the light behind it. */
function changho() {
  const { c, ctx } = canvas(256, 512);
  ctx.fillStyle = "#f6efdc";
  ctx.fillRect(0, 0, 256, 512);
  ctx.fillStyle = "#6b4626";
  ctx.fillRect(0, 0, 256, 14);
  ctx.fillRect(0, 498, 256, 14);
  ctx.fillRect(0, 0, 14, 512);
  ctx.fillRect(242, 0, 14, 512);
  // The lattice: thin bars across and down, the lower panel solid.
  for (let x = 14; x < 242; x += 38) ctx.fillRect(x, 14, 4, 380);
  for (let y = 14; y < 394; y += 38) ctx.fillRect(14, y, 228, 4);
  ctx.fillRect(14, 392, 228, 10);
  ctx.fillStyle = "#8a5a32";
  ctx.fillRect(14, 402, 228, 96);
  ctx.strokeStyle = "#5a391c";
  ctx.lineWidth = 4;
  ctx.strokeRect(34, 420, 188, 60);
  return texture(c);
}
/**
 * An ondol room round a blanket on the floor (the user asked): the floor of yellow oiled paper, hanji walls on a
 * wooden skirting with two sliding lattice doors at the back, a low chest of drawers with brass fittings, a pair of
 * floor cushions and a folded quilt in the corner. The blanket lies at `y` 0; everything stands clear of `half` by
 * `depth`.
 */
export function ondol(scene: T.Object3D, own: Own, half: number, depth: number) {
  const standard = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
  const floor = new T.Mesh(own(new T.PlaneGeometry(44, 34)), standard({ map: own(jangpan()), roughness: 0.45 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  floor.receiveShadow = true;
  scene.add(floor);
  const back = -depth - 1.6,
    side = half + 2.4,
    hanji = standard({ color: "#efe5cf", roughness: 0.95 }),
    timber = standard({ map: own(wood(true)), roughness: 0.6 });
  // The walls and their skirting.
  box(scene, own, [side * 2 + 1, 6, 0.2], [0, 3, back - 0.1], hanji, false);
  box(scene, own, [0.2, 6, -back * 2 + 4], [-side - 0.1, 3, 0], hanji, false);
  box(scene, own, [0.2, 6, -back * 2 + 4], [side + 0.1, 3, 0], hanji, false);
  box(scene, own, [side * 2 + 1, 0.22, 0.08], [0, 0.11, back + 0.04], timber, false);
  box(scene, own, [0.08, 0.22, -back * 2 + 4], [-side + 0.04, 0.11, 0], timber, false);
  box(scene, own, [0.08, 0.22, -back * 2 + 4], [side - 0.04, 0.11, 0], timber, false);
  // Two sliding doors in the back wall, and a post either side of them.
  const door = standard({ map: own(changho()), roughness: 0.9, emissive: "#3a2f1e", emissiveIntensity: 0.25 });
  for (const x of [-0.95, 0.95]) {
    const leaf = new T.Mesh(own(new T.PlaneGeometry(1.9, 3.8)), door);
    leaf.position.set(x, 1.9, back + 0.02);
    scene.add(leaf);
  }
  for (const x of [-2.05, 2.05]) box(scene, own, [0.22, 4.2, 0.22], [x, 2.1, back + 0.1], timber);
  box(scene, own, [4.3, 0.22, 0.22], [0, 4.0, back + 0.1], timber);
  // A low chest of drawers against the back wall at the left, with brass fittings.
  const lacquer = standard({ map: own(wood(true)), color: "#7a4a2a", roughness: 0.4 }),
    brass = standard({ color: "#c9a24a", roughness: 0.35, metalness: 0.7 });
  const chestX = -side + 2.2,
    chestZ = back + 0.75;
  box(scene, own, [3.2, 1.6, 1.2], [chestX, 0.8, chestZ], lacquer);
  for (const [x, y] of [[-0.8, 1.15], [0.8, 1.15], [-0.8, 0.55], [0.8, 0.55]]) {
    box(scene, own, [1.3, 0.48, 0.03], [chestX + x, y, chestZ + 0.61], lacquer);
    box(scene, own, [0.28, 0.12, 0.05], [chestX + x, y, chestZ + 0.64], brass);
  }
  // Floor cushions (방석) in red silk with a pale border, one at each side of the blanket.
  const silk = standard({ color: "#a8262c", roughness: 0.55 }),
    rim = standard({ color: "#e6c27a", roughness: 0.6 }),
    cushion = (x: number, z: number, turn: number) => {
      const group = new T.Group(),
        body = new T.Mesh(own(new T.BoxGeometry(1.7, 0.2, 1.7)), rim),
        top = new T.Mesh(own(new T.BoxGeometry(1.4, 0.06, 1.4)), silk);
      body.position.y = 0.1;
      top.position.y = 0.22;
      body.castShadow = body.receiveShadow = top.receiveShadow = true;
      group.add(body, top);
      group.position.set(x, 0, z);
      group.rotation.y = turn;
      scene.add(group);
    };
  cushion(half + 1.2, 0.8, 0.2);
  cushion(-half - 1.25, -1.2, -0.15);
  // A folded quilt (이불) in the far right corner: three layers of colour.
  ["#3f6fa8", "#d9a441", "#b8414a"].forEach((color, i) => box(scene, own, [2.4, 0.28, 1.6], [side - 1.6, 0.14 + i * 0.28, back + 1.1], standard({ color, roughness: 0.9 })));
}
/**
 * A pub round a games table: a dark boarded floor `drop` below the table top,
 * a brick wall at the back with a neon sign, a shelf of bottles and a
 * dartboard, and stools and a small table with glasses of beer at the sides.
 * `half` is how far the table reaches sideways; everything stands clear of it.
 */
export function pub(scene: T.Object3D, own: Own, half: number, drop: number) {
  const standard = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
  const add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, shadow = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  const boards = own(wood(true));
  boards.repeat.set(6, 6);
  add(new T.PlaneGeometry(90, 90), standard({ map: boards, color: "#6b5340", roughness: 0.65 }), 0, -drop, 0, false).rotation.x = -Math.PI / 2;
  // Bricks.
  const wallZ = -10.5;
  add(new T.PlaneGeometry(60, 26), standard({ ...stuff("brick", "#7c4a3a", 5, own, 2.2), roughness: 1 }), 0, 9 - drop, wallZ, false);
  // A neon sign: a ring and a glass, glowing.
  const neon = (color: string) => own(new T.MeshBasicMaterial({ color }));
  add(new T.TorusGeometry(1.5, 0.07, 10, 48), neon("#ff4fa0"), -5, 7.2 - drop + 3, wallZ + 0.2, false);
  add(new T.TorusGeometry(0.62, 0.06, 10, 32, Math.PI), neon("#ffd24a"), -5, 7.0 - drop + 3, wallZ + 0.22, false).rotation.z = Math.PI;
  add(new T.CylinderGeometry(0.05, 0.05, 1.0, 8), neon("#ffd24a"), -5.62, 7.5 - drop + 3, wallZ + 0.22, false);
  add(new T.CylinderGeometry(0.05, 0.05, 1.0, 8), neon("#ffd24a"), -4.38, 7.5 - drop + 3, wallZ + 0.22, false);
  add(new T.CylinderGeometry(0.05, 0.05, 1.3, 8), neon("#7fe3ff"), -5, 8.0 - drop + 3, wallZ + 0.22, false).rotation.z = Math.PI / 2;
  const glow = new T.PointLight("#ff6fb0", 30, 16, 1.8);
  glow.position.set(-5, 7.2 - drop + 3, wallZ + 1.5);
  scene.add(glow);
  // A shelf of bottles and a dartboard.
  add(new T.BoxGeometry(6.4, 0.16, 0.7), standard({ map: own(wood(true)), roughness: 0.6 }), 4.6, 9 - drop, wallZ + 0.4);
  ["#2f6b3f", "#7a4a1c", "#c9a23a", "#2f4f7a", "#7a1f2a", "#d9d2c0", "#2f6b3f", "#7a4a1c"].forEach((color, i) => {
    add(new T.CylinderGeometry(0.19, 0.21, 0.95, 14), standard({ color, roughness: 0.25, metalness: 0.2 }), 2.0 + i * 0.74, 9.55 - drop, wallZ + 0.42);
    add(new T.CylinderGeometry(0.07, 0.1, 0.4, 10), standard({ color, roughness: 0.25 }), 2.0 + i * 0.74, 10.2 - drop, wallZ + 0.42);
  });
  const board = add(new T.CylinderGeometry(1.15, 1.15, 0.12, 40), standard({ color: "#1c1c1c" }), 9.6, 9.6 - drop, wallZ + 0.2);
  board.rotation.x = Math.PI / 2;
  [["#d9d2c0", 0.95], ["#1f6a4a", 0.7], ["#c8321f", 0.42], ["#d9d2c0", 0.2], ["#c8321f", 0.08]].forEach(([color, r], i) => {
    add(new T.CylinderGeometry(r as number, r as number, 0.13 + i * 0.01, 36), standard({ color: color as string }), 9.6, 9.6 - drop, wallZ + 0.22 + i * 0.005).rotation.x = Math.PI / 2;
  });
  // Stools, and a small round table with two glasses of beer.
  const steel = standard({ color: "#2b2e33", roughness: 0.4, metalness: 0.6 }),
    leather = standard({ color: "#5a2420", roughness: 0.6 });
  for (const [x, z] of [[-half - 2.4, -3.4], [-half - 2.9, 2.6], [half + 2.6, -4.2]]) {
    add(new T.CylinderGeometry(0.7, 0.7, 0.22, 28), leather, x, 0.2 - drop + 2.2, z);
    add(new T.CylinderGeometry(0.09, 0.09, 2.2, 10), steel, x, 1.1 - drop, z);
    add(new T.CylinderGeometry(0.62, 0.7, 0.1, 24), steel, x, 0.05 - drop, z);
  }
  const tx = half + 3.1,
    tz = 1.6;
  add(new T.CylinderGeometry(1.25, 1.25, 0.14, 36), standard({ map: own(wood(true)), roughness: 0.5 }), tx, 3.0 - drop, tz);
  add(new T.CylinderGeometry(0.12, 0.12, 3, 12), steel, tx, 1.5 - drop, tz);
  add(new T.CylinderGeometry(0.8, 0.9, 0.12, 24), steel, tx, 0.06 - drop, tz);
  for (const [dx, dz] of [[-0.4, -0.2], [0.35, 0.3]]) {
    add(new T.CylinderGeometry(0.22, 0.2, 0.62, 18), own(new T.MeshStandardMaterial({ color: "#e0a020", roughness: 0.15, transparent: true, opacity: 0.85 })), tx + dx, 3.38 - drop, tz + dz);
    add(new T.CylinderGeometry(0.225, 0.225, 0.12, 18), standard({ color: "#fbf6e6", roughness: 0.9 }), tx + dx, 3.74 - drop, tz + dz);
  }
}
/** A hay bale's side: packed straw in short strokes, with two bands of twine. */
function straw() {
  const { c, ctx } = canvas(256, 128),
    rand = noise(23);
  ctx.fillStyle = "#cfae5c";
  ctx.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 1400; i++) {
    const shade = 150 + rand() * 90;
    ctx.strokeStyle = `rgba(${shade}, ${shade * 0.82}, ${shade * 0.38}, ${0.5 + rand() * 0.5})`;
    ctx.lineWidth = 0.8 + rand() * 1.4;
    const x = rand() * 256,
      y = rand() * 128,
      a = (rand() - 0.5) * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * (6 + rand() * 16), y + Math.sin(a) * (6 + rand() * 16));
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(90, 60, 30, 0.85)";
  for (const x of [72, 184]) ctx.fillRect(x, 0, 5, 128);
  return texture(c);
}
/** A five-pointed star as a flat shape, `r` to its points. */
function starShape(r: number) {
  const shape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5,
      d = i % 2 ? r * 0.42 : r;
    if (i) shape.lineTo(Math.cos(a) * d, Math.sin(a) * d);
    else shape.moveTo(Math.cos(a) * d, Math.sin(a) * d);
  }
  return shape;
}
/**
 * A Texas ranch round a picnic table (the user asked for a place like a Texas farm): the table's weathered planks
 * and its far bench, red dirt with dry grass and bluebonnets, a barbed-wire fence on cedar posts with a longhorn
 * skull on one and a wagon wheel leaning on it, stacked hay bales with a rusty barn star, a galvanised stock tank,
 * a prickly pear, a tumbleweed and a horseshoe; a felt hat, a coiled rope and an enamel cup lie on the table beside
 * the board. The table top is at `y` −0.2, `half` by `depth` round the board; everything is placed by fixed numbers.
 */
export function ranch(scene: T.Object3D, own: Own, half: number, depth: number) {
  const standard = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.85, ...options })),
    add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = scene) => {
      const mesh = new T.Mesh(own(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
    TOP = -0.2,
    GROUND = -3,
    rand = noise(97);
  // The table: four weathered planks with gaps between, on A-frame legs, and a bench along its far side.
  const grain = own(wood(false));
  grain.repeat.set(2, 0.5);
  const weathered = standard({ map: grain, color: "#b9a891", roughness: 0.95 }),
    plank = 2.1,
    gap = 0.12,
    length = half * 2;
  for (let i = 0; i < 4; i++) add(new T.BoxGeometry(length, 0.28, plank), weathered, 0, TOP - 0.14, (i - 1.5) * (plank + gap));
  const width = 4 * plank + 3 * gap;
  for (const x of [-half + 1.3, half - 1.3])
    for (const side of [-1, 1]) {
      const leg = add(new T.BoxGeometry(0.3, 3.6, 0.5), weathered, x, (TOP + GROUND) / 2 - 0.1, side * 1.7);
      leg.rotation.x = side * 0.62;
    }
  for (const z of [-(width / 2 + 1.5), width / 2 + 1.5]) add(new T.BoxGeometry(length - 0.6, 0.22, 1.5), weathered, 0, GROUND + 1.55, z);
  // Red dirt, with dry grass in tufts.
  const ground = add(new T.PlaneGeometry(90, 70), standard({ ...stuff("earth", "#a3653d", 12, own), roughness: 1 }), 0, GROUND, 0);
  ground.rotation.x = -Math.PI / 2;
  ground.castShadow = false;
  const blade = own(new T.ConeGeometry(0.05, 0.7, 4)),
    grass = new T.InstancedMesh(blade, standard({ color: "#ffffff", roughness: 1 }), 900),
    m = new T.Matrix4(),
    q = new T.Quaternion(),
    e = new T.Euler(),
    tones = ["#b39a55", "#8f8a45", "#c4a865", "#7d7a3c"].map((c) => new T.Color(c));
  let n = 0;
  for (let tuft = 0; tuft < 90; tuft++) {
    const x = (rand() - 0.5) * 34,
      z = -11 + rand() * 18;
    if (Math.abs(x) < half + 0.4 && Math.abs(z) < width / 2 + 2.4) continue;
    for (let k = 0; k < 10 && n < 900; k++, n++) {
      const s = 0.6 + rand() * 0.8;
      q.setFromEuler(e.set((rand() - 0.5) * 0.7, rand() * 6, (rand() - 0.5) * 0.7));
      grass.setMatrixAt(n, m.compose(new T.Vector3(x + (rand() - 0.5) * 0.6, GROUND + 0.3 * s, z + (rand() - 0.5) * 0.6), q, new T.Vector3(s, s, s)));
      grass.setColorAt(n, tones[Math.floor(rand() * tones.length)]);
    }
  }
  grass.count = n;
  scene.add(grass);
  // Bluebonnets: spikes of small blue florets, white at the tip, over a few leaves, in patches.
  const floret = own(new T.SphereGeometry(0.09, 6, 4)),
    leaf = own(new T.SphereGeometry(0.16, 6, 4)),
    patches: [number, number][] = [[-6.6, -5.6], [6.2, -6.0], [-7.0, 3.4], [-12.0, -1.6], [11.8, -2.2], [7.2, 3.6], [-3.2, -7.4], [12.6, 1.8], [-13.6, 3.0], [1.6, -7.6]],
    SPIKES = 8,
    STEPS = 6,
    flowers = new T.InstancedMesh(floret, standard({ color: "#ffffff", roughness: 0.7 }), patches.length * SPIKES * STEPS),
    leaves = new T.InstancedMesh(leaf, standard({ color: "#5d7a3a", roughness: 0.9 }), patches.length * SPIKES),
    blue = new T.Color("#2e4cb0"),
    white = new T.Color("#f4f2ea");
  let f = 0,
    l = 0;
  for (const [px, pz] of patches)
    for (let k = 0; k < SPIKES; k++, l++) {
      const x = px + (rand() - 0.5) * 1.5,
        z = pz + (rand() - 0.5) * 1.1,
        h = 0.55 + rand() * 0.35;
      leaves.setMatrixAt(l, m.compose(new T.Vector3(x, GROUND + 0.08, z), q.identity(), new T.Vector3(1.3, 0.35, 1.3)));
      for (let j = 0; j < STEPS; j++, f++) {
        const t = j / (STEPS - 1),
          s = 1 - t * 0.55;
        flowers.setMatrixAt(f, m.compose(new T.Vector3(x, GROUND + 0.2 + t * h, z), q.identity(), new T.Vector3(s, s * 0.9, s)));
        flowers.setColorAt(f, j === STEPS - 1 ? white : blue);
      }
    }
  for (const mesh of [flowers, leaves]) {
    mesh.castShadow = true;
    scene.add(mesh);
  }
  // A barbed-wire fence on cedar posts across the back.
  const fenceZ = -(width / 2 + 3.4),
    cedar = standard({ map: own(wood(true)), color: "#9a7a62", roughness: 0.95 }),
    wire = standard({ color: "#55585c", roughness: 0.4, metalness: 0.7 });
  for (let x = -18.2; x <= 18.2; x += 2.6) {
    const post = add(new T.CylinderGeometry(0.14, 0.17, 4.0, 8), cedar, x, GROUND + 2.0, fenceZ);
    post.rotation.z = (rand() - 0.5) * 0.06;
  }
  for (const y of [0.9, 1.7, 2.5]) {
    const strand = add(new T.CylinderGeometry(0.025, 0.025, 36.4, 5).rotateZ(Math.PI / 2), wire, 0, GROUND + y, fenceZ + 0.17);
    strand.castShadow = false;
  }
  // Barbs every little way along each strand.
  const barb = own(new T.BoxGeometry(0.03, 0.18, 0.03)),
    barbs = new T.InstancedMesh(barb, wire, 3 * 72);
  let b = 0;
  for (const y of [0.9, 1.7, 2.5])
    for (let i = 0; i < 72; i++, b++) {
      q.setFromEuler(e.set(0.8, 0, 0.8));
      barbs.setMatrixAt(b, m.compose(new T.Vector3(-18 + i * 0.5, GROUND + y, fenceZ + 0.17), q, new T.Vector3(1, 1, 1)));
    }
  scene.add(barbs);
  // A longhorn skull on a post: bone, a long snout, and horns that sweep out and turn up at the tips.
  const bone = standard({ color: "#ece3cc", roughness: 0.7 }),
    horn = standard({ color: "#d8c49a", roughness: 0.5 }),
    hornTip = standard({ color: "#3a2a1e", roughness: 0.5 }),
    skull = new T.Group();
  add(new T.SphereGeometry(0.42, 16, 12), bone, 0, 0, 0, skull).scale.set(1.15, 0.85, 0.7);
  add(new T.CylinderGeometry(0.2, 0.32, 0.9, 12), bone, 0, -0.55, 0.06, skull);
  for (const side of [-1, 1]) {
    add(new T.SphereGeometry(0.075, 8, 6), standard({ color: "#2a2018", roughness: 0.9 }), side * 0.2, -0.05, 0.27, skull);
    const curve = new T.CatmullRomCurve3([new T.Vector3(side * 0.35, 0.18, 0), new T.Vector3(side * 1.1, 0.22, 0.12), new T.Vector3(side * 1.8, 0.45, 0.1), new T.Vector3(side * 2.2, 0.85, 0)]);
    add(new T.TubeGeometry(curve, 24, 0.11, 8), horn, 0, 0, 0, skull);
    add(new T.ConeGeometry(0.1, 0.35, 8), hornTip, side * 2.27, 1.0, 0, skull).rotation.z = -side * 0.35;
  }
  skull.scale.setScalar(0.8);
  skull.position.set(-5.2, GROUND + 1.75, fenceZ + 0.38);
  scene.add(skull);
  // A wagon wheel leaning on the fence.
  const spokes = standard({ map: own(wood(true)), color: "#a07a58", roughness: 0.8 }),
    iron = standard({ color: "#3a3330", roughness: 0.5, metalness: 0.6 }),
    wheel = new T.Group(),
    R = 1.5;
  add(new T.TorusGeometry(R, 0.12, 8, 40), spokes, 0, 0, 0, wheel);
  add(new T.TorusGeometry(R + 0.1, 0.05, 6, 40), iron, 0, 0, 0, wheel);
  add(new T.CylinderGeometry(0.3, 0.3, 0.45, 14).rotateX(Math.PI / 2), spokes, 0, 0, 0, wheel);
  for (let i = 0; i < 12; i++) add(new T.CylinderGeometry(0.05, 0.06, R, 6), spokes, Math.cos((i * Math.PI) / 6) * R * 0.5, Math.sin((i * Math.PI) / 6) * R * 0.5, 0, wheel).rotation.z = (i * Math.PI) / 6 - Math.PI / 2;
  wheel.position.set(4.2, GROUND + R * 0.98, fenceZ + 0.5);
  wheel.rotation.set(-0.2, 0.25, 0);
  scene.add(wheel);
  // Hay bales stacked at the left, with a rusty barn star leaning on them.
  const hay = standard({ map: own(straw()), roughness: 1 }),
    bale = own(new T.BoxGeometry(2.4, 1.05, 1.2));
  for (const [x, y, z, turn] of [[-10.0, 0.525, -6.2, 0.08], [-7.75, 0.525, -6.05, -0.05], [-8.9, 1.575, -6.15, 0.12], [-10.6, 0.525, -3.0, 1.4], [9.6, 0.525, 2.6, 0.5]]) {
    const mesh = new T.Mesh(bale, hay);
    mesh.position.set(x, GROUND + y, z);
    mesh.rotation.y = turn;
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const rust = standard({ color: "#8a4a2a", roughness: 0.6, metalness: 0.5 }),
    star = add(new T.ExtrudeGeometry(starShape(0.62), { depth: 0.07, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 1 }), rust, -7.7, GROUND + 0.7, -5.3);
  star.rotation.set(-0.25, 0.1, 0.15);
  // A galvanised stock tank with water in it.
  const zinc = standard({ color: "#aeb5ba", roughness: 0.35, metalness: 0.75 }),
    tank = new T.Group(),
    TR = 1.6;
  add(new T.CylinderGeometry(TR, TR, 1.4, 40, 1, true), zinc, 0, 0.7, 0, tank).material = own(new T.MeshStandardMaterial({ color: "#aeb5ba", roughness: 0.35, metalness: 0.75, side: T.DoubleSide }));
  for (const y of [0.25, 0.7, 1.15]) add(new T.TorusGeometry(TR + 0.02, 0.05, 6, 48).rotateX(Math.PI / 2), zinc, 0, y, 0, tank);
  add(new T.TorusGeometry(TR, 0.08, 8, 48).rotateX(Math.PI / 2), zinc, 0, 1.4, 0, tank);
  add(new T.CircleGeometry(TR - 0.02, 40).rotateX(-Math.PI / 2), standard({ color: "#3f6b78", roughness: 0.08, metalness: 0.2 }), 0, 1.15, 0, tank).castShadow = false;
  tank.position.set(9.0, GROUND, -5.4);
  scene.add(tank);
  // A prickly pear: flat pads growing out of one another, with red fruit on their rims and a yellow flower.
  const pad = own(new T.SphereGeometry(0.5, 14, 10)),
    green = standard({ color: "#6d8f3c", roughness: 0.7 }),
    fruit = standard({ color: "#a8203f", roughness: 0.5 }),
    cactus = new T.Group();
  for (const [x, y, z, rz, ry, s] of [
    [0, 0.6, 0, 0, 0, 1.2], [-0.55, 1.45, 0.05, 0.5, 0.3, 1], [0.6, 1.4, -0.05, -0.45, -0.3, 1], [-0.95, 2.2, 0.1, 0.2, 0.6, 0.85], [0.35, 2.3, 0.1, -0.15, 0.2, 0.85], [1.05, 2.05, -0.1, -0.7, -0.5, 0.75],
  ]) {
    const p = new T.Mesh(pad, green);
    p.position.set(x, y, z);
    p.rotation.set(0, ry, rz);
    p.scale.set(0.75 * s, 1.15 * s, 0.22 * s);
    p.castShadow = p.receiveShadow = true;
    cactus.add(p);
  }
  for (const [x, y] of [[-0.9, 2.82], [-1.15, 2.7], [0.42, 2.95], [1.3, 2.6]]) add(new T.SphereGeometry(0.11, 8, 6), fruit, x, y, 0.05, cactus).scale.set(1, 1.3, 1);
  add(new T.SphereGeometry(0.16, 10, 6), standard({ color: "#f0c63a", roughness: 0.6 }), 0.1, 2.98, 0.08, cactus).scale.set(1, 0.6, 1);
  cactus.scale.setScalar(0.75);
  cactus.position.set(-7.7, GROUND, 1.8);
  scene.add(cactus);
  // A tumbleweed: a ball of dry twigs.
  const twig = own(new T.CylinderGeometry(0.015, 0.015, 0.65, 3)),
    weed = new T.InstancedMesh(twig, standard({ color: "#b8995f", roughness: 0.9 }), 160);
  for (let i = 0; i < 160; i++) {
    const u = rand() * 2 - 1,
      a = rand() * Math.PI * 2,
      r = 0.4 + rand() * 0.25,
      at = new T.Vector3(Math.sqrt(1 - u * u) * Math.cos(a) * r, u * r, Math.sqrt(1 - u * u) * Math.sin(a) * r);
    q.setFromEuler(e.set(rand() * 6, rand() * 6, rand() * 6));
    weed.setMatrixAt(i, m.compose(at.add(new T.Vector3(7.5, GROUND + 0.62, -1.2)), q, new T.Vector3(1, 1, 1)));
  }
  weed.castShadow = true;
  scene.add(weed);
  // A horseshoe in the dirt.
  add(new T.TorusGeometry(0.42, 0.08, 6, 20, Math.PI * 1.6).rotateX(-Math.PI / 2), iron, 6.4, GROUND + 0.05, 1.6).rotation.y = 2.2;
  // On the table: a felt hat with its brim curled up at the sides, a coiled rope and an enamel cup.
  const felt = standard({ color: "#b98f55", roughness: 0.9 }),
    hat = new T.Group(),
    brimShape = new T.LatheGeometry([new T.Vector2(0.4, 0), new T.Vector2(0.95, 0), new T.Vector2(1.1, 0.08)], 40),
    pos = brimShape.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + 0.32 * (pos.getX(i) / 1.1) ** 4);
  brimShape.computeVertexNormals();
  const brim = add(brimShape, own(new T.MeshStandardMaterial({ color: "#b98f55", roughness: 0.9, side: T.DoubleSide })), 0, 0.04, 0, hat);
  brim.scale.set(1, 1, 0.82);
  add(new T.CylinderGeometry(0.4, 0.47, 0.62, 24), felt, 0, 0.35, 0, hat).scale.set(1, 1, 0.82);
  add(new T.SphereGeometry(0.4, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2), felt, 0, 0.62, 0, hat).scale.set(1, 0.32, 0.82);
  add(new T.TorusGeometry(0.47, 0.045, 6, 30).rotateX(Math.PI / 2), standard({ color: "#3a2618", roughness: 0.6 }), 0, 0.1, 0, hat).scale.set(1, 1, 0.82);
  hat.position.set(half - 0.95, TOP, -depth + 0.85);
  hat.rotation.y = 0.5;
  scene.add(hat);
  const rope = standard({ color: "#cdb27e", roughness: 0.95 });
  for (let i = 0; i < 4; i++) add(new T.TorusGeometry(0.5 + i * 0.05, 0.04, 6, 32).rotateX(Math.PI / 2), rope, -half + 0.85 + i * 0.03, TOP + 0.04 + i * 0.06, depth - 0.9 - i * 0.02);
  add(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(-half + 1.3, TOP + 0.05, depth - 0.7), new T.Vector3(-half + 1.6, TOP + 0.04, depth - 0.3), new T.Vector3(-half + 1.2, TOP + 0.04, depth - 0.05)]), 12, 0.04, 6), rope, 0, 0, 0);
  const enamel = standard({ color: "#2f5fa8", roughness: 0.3, metalness: 0.1 });
  add(new T.CylinderGeometry(0.24, 0.22, 0.42, 20), enamel, half - 0.9, TOP + 0.21, depth - 0.85);
  add(new T.TorusGeometry(0.13, 0.03, 6, 14), enamel, half - 0.62, TOP + 0.22, depth - 0.85);
  add(new T.TorusGeometry(0.235, 0.02, 6, 24).rotateX(Math.PI / 2), standard({ color: "#f2efe6", roughness: 0.4 }), half - 0.9, TOP + 0.42, depth - 0.85);
}
/** A Sumerian reed mat: split reeds plaited two over two, in straw tones, with a bound edge. */
function reedMat() {
  const { c, ctx } = canvas(512, 512),
    rand = noise(31),
    cell = 32;
  ctx.fillStyle = "#b8955c";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16; i++)
    for (let j = 0; j < 16; j++) {
      const across = (i + j) % 4 < 2,
        tone = 165 + rand() * 45,
        x = i * cell,
        y = j * cell;
      const g = across ? ctx.createLinearGradient(x, y, x, y + cell) : ctx.createLinearGradient(x, y, x + cell, y);
      g.addColorStop(0, `rgb(${tone * 0.72}, ${tone * 0.56}, ${tone * 0.3})`);
      g.addColorStop(0.5, `rgb(${tone}, ${tone * 0.8}, ${tone * 0.47})`);
      g.addColorStop(1, `rgb(${tone * 0.7}, ${tone * 0.54}, ${tone * 0.28})`);
      ctx.fillStyle = g;
      ctx.fillRect(x + 1.5, y + 1.5, cell - 3, cell - 3);
      ctx.strokeStyle = "rgba(90, 60, 25, 0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      if (across) {
        ctx.moveTo(x + 2, y + cell / 2);
        ctx.lineTo(x + cell - 2, y + cell / 2);
      } else {
        ctx.moveTo(x + cell / 2, y + 2);
        ctx.lineTo(x + cell / 2, y + cell - 2);
      }
      ctx.stroke();
    }
  return texture(c, 3, 1.35);
}
/** The edge of the mat, bound with darker reed. */
function reedEdge() {
  const { c, ctx } = canvas(64, 64);
  ctx.fillStyle = "#7a5a2e";
  ctx.fillRect(0, 0, 64, 64);
  ctx.strokeStyle = "rgba(40, 26, 10, 0.5)";
  for (let y = 4; y < 64; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(64, y + 4);
    ctx.stroke();
  }
  return texture(c, 8, 1);
}
/** A pavement of square baked bricks laid in bitumen. */
function pavement() {
  const { c, ctx } = canvas(512, 512),
    rand = noise(53),
    n = 4,
    u = 512 / n;
  ctx.fillStyle = "#2c241d";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const warm = rand();
      ctx.fillStyle = `hsl(${30 + warm * 8}, ${32 + warm * 14}%, ${58 + rand() * 10}%)`;
      ctx.fillRect(i * u + 4, j * u + 4, u - 8, u - 8);
      for (let k = 0; k < 140; k++) {
        ctx.fillStyle = `rgba(${90 + rand() * 60}, ${60 + rand() * 40}, 30, ${0.08 + rand() * 0.12})`;
        ctx.fillRect(i * u + 4 + rand() * (u - 10), j * u + 4 + rand() * (u - 10), 2 + rand() * 5, 2 + rand() * 4);
      }
    }
  return texture(c, 10, 8);
}
/** A frieze inlaid in bitumen: white shell rosettes between red and lapis triangles, as on the temple walls of the time. */
function frieze() {
  const { c, ctx } = canvas(512, 64);
  ctx.fillStyle = "#1e1914";
  ctx.fillRect(0, 0, 512, 64);
  for (let k = 0; k < 8; k++) {
    const x = k * 64 + 32;
    for (let p = 0; p < 8; p++) {
      const a = (p * Math.PI) / 4;
      ctx.fillStyle = "#efe7d4";
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 11, 32 + Math.sin(a) * 11, 9, 4.5, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#c8321f";
    ctx.beginPath();
    ctx.arc(x, 32, 5, 0, Math.PI * 2);
    ctx.fill();
    for (const [y0, y1, color] of [[0, 14, "#2a4fa0"], [64, 50, "#b5482a"]] as [number, number, string][]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(x + 32 - 14, y0);
      ctx.lineTo(x + 32, y1);
      ctx.lineTo(x + 32 + 14, y0);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#c9a24a";
  ctx.fillRect(0, 0, 512, 3);
  ctx.fillRect(0, 61, 512, 3);
  return texture(c, 6, 1);
}
/** A clay tablet's face: rows of wedge-shaped marks pressed in with a reed (no real text). */
function tablet() {
  const { c, ctx } = canvas(128, 96),
    rand = noise(61);
  ctx.fillStyle = "#b99a72";
  ctx.fillRect(0, 0, 128, 96);
  ctx.fillStyle = "rgba(80, 56, 32, 0.75)";
  for (let row = 0; row < 7; row++) {
    ctx.fillRect(6, 10 + row * 12, 116, 1);
    let x = 8;
    while (x < 118) {
      const y = 13 + row * 12,
        kind = rand();
      ctx.beginPath();
      if (kind < 0.55) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + 6, y - 2);
        ctx.lineTo(x + 6, y + 2);
      } else {
        ctx.moveTo(x + 2, y - 4);
        ctx.lineTo(x, y + 4);
        ctx.lineTo(x + 4, y + 4);
      }
      ctx.fill();
      x += 4 + rand() * 8;
    }
  }
  return texture(c);
}
/**
 * A room of a Sumerian palace at Ur, where the game was found in the royal tombs (the user asked for a setting that
 * fits where the game began): a plaited reed mat on a pavement of baked bricks, a mud-plastered wall of buttresses and
 * recessed niches with an inlaid frieze and a bench before it, a lyre with a gold bull's head and a lapis beard,
 * clay jars, a bowl of dates, clay tablets and an oil lamp. The mat's top is at `y` 0, `half` by `depth`.
 */
export function sumer(scene: T.Object3D, own: Own, half: number, depth: number) {
  const standard = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.85, ...options })),
    add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, parent: T.Object3D = scene) => {
      const mesh = new T.Mesh(own(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
  const floor = add(new T.PlaneGeometry(80, 60), standard({ map: own(pavement()), roughness: 0.9 }), 0, -0.05, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  const edge = standard({ map: own(reedEdge()), roughness: 1 }),
    mat = standard({ map: own(reedMat()), roughness: 1 });
  add(new T.BoxGeometry(half * 2, 0.05, depth * 2), [edge, edge, mat, edge, edge, edge], 0, -0.025, 0).castShadow = false;
  // The wall: mud plaster over brick, buttresses with niches between, a frieze along it and a bench in front.
  const plaster = standard({ map: own(speckled("#b8926a", ["#a9845d", "#c4a079", "#9c7652"], 71, 6)), roughness: 0.95 }),
    shade = standard({ map: own(speckled("#9c7a55", ["#8d6c4a", "#a8855f"], 72, 3)), roughness: 0.95 }),
    wallZ = -depth - 1.5,
    span = 34;
  add(new T.BoxGeometry(span, 6, 0.4), shade, 0, 3, wallZ - 0.35);
  for (let x = -span / 2 + 0.6; x < span / 2; x += 2.2) {
    add(new T.BoxGeometry(1.2, 6, 0.5), plaster, x, 3, wallZ);
    // The inner step of each niche.
    add(new T.BoxGeometry(0.25, 6, 0.3), plaster, x + 0.72, 3, wallZ - 0.1);
    add(new T.BoxGeometry(0.25, 6, 0.3), plaster, x + 1.48, 3, wallZ - 0.1);
  }
  const band = add(new T.BoxGeometry(span, 0.42, 0.06), standard({ map: own(frieze()), roughness: 0.5 }), 0, 1.35, wallZ + 0.29);
  band.castShadow = false;
  add(new T.BoxGeometry(span, 0.5, 0.8), plaster, 0, 0.2, wallZ + 0.65);
  const benchTop = 0.45,
    benchZ = wallZ + 0.65;
  // Clay: jars with painted bands, on the bench and on the floor.
  const clay = standard({ color: "#b5714a", roughness: 0.8 }),
    paleClay = standard({ color: "#cfa47a", roughness: 0.8 }),
    paint = standard({ color: "#3a2a20", roughness: 0.8 }),
    jar = (x: number, y: number, z: number, height: number, body: T.Material) => {
      const profile = [[0, 0], [0.18, 0], [0.32, 0.12], [0.42, 0.42], [0.38, 0.7], [0.2, 0.86], [0.17, 0.95], [0.22, 1.0]].map(([r, h]) => new T.Vector2(r * height, h * height));
      add(new T.LatheGeometry(profile, 24), body, x, y, z);
      for (const h of [0.5, 0.62]) add(new T.TorusGeometry(0.405 * height, 0.012 * height, 4, 32).rotateX(Math.PI / 2), paint, x, y + h * height, z).castShadow = false;
    };
  jar(-3.4, benchTop, benchZ, 0.9, clay);
  jar(-2.6, benchTop, benchZ + 0.1, 0.65, paleClay);
  jar(3.8, benchTop, benchZ, 0.8, paleClay);
  jar(half + 0.7, 0, -depth + 0.15, 1.1, clay);
  jar(half + 0.85, 0, -depth + 1.25, 0.72, paleClay);
  jar(-half + 0.35, 0, depth - 1.5, 0.7, paleClay);
  // A bowl of dates on the bench.
  add(new T.LatheGeometry([[0.05, 0], [0.32, 0.03], [0.48, 0.2], [0.5, 0.24]].map(([r, h]) => new T.Vector2(r, h)), 24), own(new T.MeshStandardMaterial({ color: "#c08a5e", roughness: 0.8, side: T.DoubleSide })), 0.4, benchTop, benchZ);
  const date = own(new T.SphereGeometry(0.07, 8, 6)),
    dateBrown = standard({ color: "#6a2e14", roughness: 0.35 });
  const rand = noise(83);
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2,
      r = rand() * 0.3;
    const d = new T.Mesh(date, dateBrown);
    d.scale.set(1, 1, 1.7);
    d.rotation.y = rand() * 3;
    d.position.set(0.4 + Math.cos(a) * r, benchTop + 0.14 + (0.3 - r) * 0.25 + (i > 9 ? 0.08 : 0), benchZ + Math.sin(a) * r);
    d.castShadow = true;
    scene.add(d);
  }
  // Clay tablets lying by the mat.
  const face = standard({ map: own(tablet()), roughness: 0.9 }),
    side = standard({ color: "#a98a63", roughness: 0.9 });
  for (const [x, z, turn] of [[half - 0.6, depth - 0.65, 0.3], [half - 1.35, depth - 0.4, -0.25]]) {
    const t = add(new T.BoxGeometry(0.7, 0.14, 0.52), [side, side, face, side, side, side], x, 0.07, z);
    t.rotation.y = turn;
  }
  // An oil lamp of clay with a small flame at its spout.
  const lamp = new T.Group();
  add(new T.SphereGeometry(0.28, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), paleClay, 0, 0.2, 0, lamp).scale.set(1, 0.7, 1);
  add(new T.CylinderGeometry(0.06, 0.09, 0.32, 10).rotateZ(Math.PI / 2), paleClay, 0.34, 0.16, 0, lamp);
  add(new T.SphereGeometry(0.06, 8, 6), own(new T.MeshBasicMaterial({ color: "#ffd27a" })), 0.52, 0.22, 0, lamp).scale.set(0.8, 1.6, 0.8);
  lamp.scale.setScalar(1.7);
  lamp.position.set(-half + 0.95, 0, depth - 0.6);
  scene.add(lamp);
  // The lyre: a wooden sound box with two uprights and a yoke, strings, and on its front a bull's head of gold with a
  // beard of lapis lazuli.
  const lyre = new T.Group(),
    timber = standard({ map: own(wood(true)), roughness: 0.6 }),
    gold = standard({ color: "#d4a640", roughness: 0.3, metalness: 0.9 }),
    lapis = standard({ color: "#22408a", roughness: 0.35 }),
    shell = standard({ color: "#efe6d2", roughness: 0.5 });
  add(new T.BoxGeometry(1.7, 0.75, 0.32), timber, 0, 0.38, 0, lyre);
  add(new T.BoxGeometry(1.72, 0.08, 0.34), shell, 0, 0.12, 0, lyre);
  for (const [x, lean] of [[-0.62, 0.12], [0.55, -0.1]]) add(new T.CylinderGeometry(0.05, 0.06, 1.8, 8), timber, x, 1.6, 0, lyre).rotation.z = lean;
  add(new T.CylinderGeometry(0.05, 0.05, 1.6, 8).rotateZ(Math.PI / 2), timber, -0.03, 2.45, 0, lyre);
  for (let i = 0; i < 8; i++) {
    const s = add(new T.CylinderGeometry(0.008, 0.008, 1.7, 3), shell, -0.36 + i * 0.1, 1.6, 0.02, lyre);
    s.castShadow = false;
  }
  const head = new T.Group();
  add(new T.SphereGeometry(0.26, 16, 12), gold, 0, 0, 0, head).scale.set(0.8, 1, 0.9);
  add(new T.CylinderGeometry(0.15, 0.2, 0.3, 12), gold, 0, -0.2, 0.08, head);
  for (const side of [-1, 1]) {
    add(new T.ConeGeometry(0.05, 0.42, 8), gold, side * 0.22, 0.24, 0, head).rotation.z = -side * 0.9;
    add(new T.SphereGeometry(0.04, 8, 6), lapis, side * 0.12, 0.05, 0.2, head);
  }
  add(new T.BoxGeometry(0.24, 0.42, 0.1), lapis, 0, -0.5, 0.12, head);
  head.position.set(0.98, 0.85, 0.05);
  head.rotation.y = 1.1;
  lyre.add(head);
  lyre.position.set(-half - 0.2, 0, -depth + 0.4);
  lyre.rotation.y = 0.45;
  scene.add(lyre);
}
/** A chalkboard: dark green slate with the day's writing in chalk and a few doodles. */
function chalkboard() {
  const { c, ctx } = canvas(1024, 280),
    rand = noise(91);
  ctx.fillStyle = "#2c4a3a";
  ctx.fillRect(0, 0, 1024, 280);
  // Old chalk wiped across it.
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(230, 236, 228, ${0.02 + rand() * 0.04})`;
    ctx.beginPath();
    ctx.ellipse(rand() * 1024, rand() * 280, 40 + rand() * 120, 10 + rand() * 26, (rand() - 0.5) * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // The writing keeps to the sides: the student across the desks sits before the middle of the board.
  ctx.fillStyle = "rgba(244, 244, 236, 0.92)";
  ctx.textBaseline = "middle";
  ctx.font = '500 32px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  ctx.fillText("모둠 활동", 40, 52);
  ctx.font = '700 58px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  ctx.fillText("오늘은", 40, 130);
  ctx.fillText("도둑잡기!", 40, 205);
  ctx.font = '500 32px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
  ctx.fillText("주번: 김○○", 700, 52);
  ctx.fillStyle = "rgba(255, 214, 120, 0.9)";
  ctx.fillText("조커 조심 ☆", 760, 225);
  ctx.strokeStyle = "rgba(244, 244, 236, 0.85)";
  ctx.lineWidth = 4;
  // A smiling face and a star.
  ctx.beginPath();
  ctx.arc(880, 110, 42, 0, Math.PI * 2);
  ctx.moveTo(904, 120);
  ctx.arc(880, 120, 24, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.fillStyle = "rgba(244, 244, 236, 0.85)";
  for (const x of [866, 894]) {
    ctx.beginPath();
    ctx.arc(x, 98, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}
/** The view out of the windows: sky over the trees of the school yard. */
function schoolyard() {
  const { c, ctx } = canvas(512, 256),
    rand = noise(19);
  const sky = ctx.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#8fc4ef");
  sky.addColorStop(1, "#e4f1fb");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    const x = rand() * 512,
      y = 30 + rand() * 60;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      ctx.ellipse(x + k * 16, y + Math.sin(k) * 6, 22, 12, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  for (let i = 0; i < 26; i++) {
    const x = (i / 26) * 540 - 10,
      h = 60 + rand() * 50;
    ctx.fillStyle = ["#4f8a3f", "#5f9a46", "#3f7a36", "#6aa14c"][i % 4];
    ctx.beginPath();
    ctx.ellipse(x, 256 - h * 0.5, 26 + rand() * 12, h * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}
/** A cork notice board with pinned papers in colours. */
function noticeBoard() {
  const { c, ctx } = canvas(512, 256),
    rand = noise(43);
  ctx.fillStyle = "#b8875a";
  ctx.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${90 + rand() * 60}, ${55 + rand() * 40}, 30, 0.35)`;
    ctx.fillRect(rand() * 512, rand() * 256, 2, 2);
  }
  for (const [x, y, w, h, color] of [[30, 30, 120, 90, "#fff7d6"], [170, 20, 100, 130, "#ffffff"], [290, 40, 90, 70, "#ffd9e6"], [400, 24, 90, 110, "#d6ecff"], [60, 140, 140, 90, "#e0ffd6"], [230, 160, 110, 80, "#ffffff"], [370, 150, 120, 86, "#fff1c2"]] as [number, number, number, number, string][]) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = "rgba(60, 60, 70, 0.45)";
    for (let line = 0; line < 5; line++) ctx.fillRect(x + 10, y + 16 + line * 13, w - 20 - (line % 2) * 20, 3);
    ctx.fillStyle = ["#d23b3b", "#2f62c0", "#e0b020"][Math.floor(rand() * 3)];
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 6, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}
/**
 * A school classroom round a group of four desks pushed together (the user asked for a classroom): a wooden floor,
 * rows of other desks and chairs, a green chalkboard with its tray on the front wall, a teacher's desk, windows on the
 * schoolyard along the left wall and a notice board on the right. The desks' tops are at `y` 0 and reach `half` by
 * `depth`; `seats` are where the players sit (a chair is put behind each but the first, mine).
 */
export function classroom(scene: T.Object3D, own: Own, half: number, depth: number, seats: { x: number; z: number; fx: number; fz: number }[]) {
  const standard = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...options })),
    add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = true) => {
      const mesh = new T.Mesh(own(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = shadow;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    },
    FLOOR = -8.2;
  const floor = add(new T.PlaneGeometry(80, 80), standard({ ...stuff("boards", "#b88a5a", 9, own), roughness: 0.55 }), 0, FLOOR, -8, false);
  floor.rotation.x = -Math.PI / 2;
  // The desks: a pale laminate top with a dark edging, on grey steel legs, with a shelf for books beneath.
  const grain = own(wood(false, 0.6));
  grain.repeat.set(0.6, 0.6);
  const laminate = standard({ map: grain, color: "#f0dcb8", roughness: 0.5 }),
    edging = standard({ color: "#5a4636", roughness: 0.5 }),
    steel = standard({ color: "#8a9096", roughness: 0.4, metalness: 0.6 }),
    shelf = standard({ color: "#6f747a", roughness: 0.6, metalness: 0.4 }),
    W = half,
    D = depth;
  // The four pushed together, each with its own edging so that the seams show.
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const x = (sx * W) / 2,
        z = (sz * D) / 2;
      add(new T.BoxGeometry(W - 0.06, 0.28, D - 0.06), [edging, edging, laminate, edging, edging, edging], x, -0.14, z, false);
      add(new T.BoxGeometry(W - 0.8, 1.0, D - 1.2), shelf, x, -0.9, z, false);
      for (const [lx, lz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(new T.CylinderGeometry(0.13, 0.13, -FLOOR - 0.3, 8), steel, x + lx * (W / 2 - 0.35), (FLOOR - 0.3) / 2, z + lz * (D / 2 - 0.35));
    }
  // A chair behind each of the others.
  const chairWood = standard({ map: own(wood(false, 0.7)), color: "#d9b07a", roughness: 0.6 }),
    chair = (x: number, z: number, turn: number) => {
      const g = new T.Group(),
        part = (geometry: T.BufferGeometry, material: T.Material, px: number, py: number, pz: number) => {
          const mesh = new T.Mesh(own(geometry), material);
          mesh.position.set(px, py, pz);
          mesh.castShadow = mesh.receiveShadow = true;
          g.add(mesh);
        };
      part(new T.BoxGeometry(4.2, 0.3, 4.0), chairWood, 0, FLOOR + 4.9, 0);
      part(new T.BoxGeometry(4.2, 2.6, 0.3), chairWood, 0, FLOOR + 8.4, 2.0);
      for (const [lx, lz] of [[-1.8, -1.7], [1.8, -1.7], [-1.8, 1.8], [1.8, 1.8]]) part(new T.CylinderGeometry(0.11, 0.11, 4.9, 8), steel, lx, FLOOR + 2.45, lz);
      for (const lx of [-1.8, 1.8]) part(new T.CylinderGeometry(0.1, 0.1, 3.6, 8), steel, lx, FLOOR + 6.9, 1.9);
      g.position.set(x, 0, z);
      g.rotation.y = turn;
      scene.add(g);
    };
  seats.slice(1).forEach((s) => chair(s.x - s.fx * 0.6, s.z - s.fz * 0.6, Math.atan2(-s.fx, -s.fz)));
  // The rest of the class: single desks and chairs in rows facing the board, left as they are after a lesson.
  const spots: [number, number][] = [];
  for (const x of [-26, -18, -10, 10, 18, 26])
    for (const z of [-30, -22, -14, -6, 2, 10]) spots.push([x, z]);
  for (const x of [-4.5, 4.5]) for (const z of [-30, -22]) spots.push([x, z]);
  const tops = new T.InstancedMesh(own(new T.BoxGeometry(5.6, 0.28, 4.2)), laminate, spots.length),
    rims = new T.InstancedMesh(own(new T.BoxGeometry(5.7, 0.2, 4.3)), edging, spots.length),
    legs = new T.InstancedMesh(own(new T.CylinderGeometry(0.13, 0.13, -FLOOR, 8)), steel, spots.length * 4),
    seatsMesh = new T.InstancedMesh(own(new T.BoxGeometry(4.0, 0.3, 3.8)), chairWood, spots.length),
    backs = new T.InstancedMesh(own(new T.BoxGeometry(4.0, 2.4, 0.3)), chairWood, spots.length),
    chairLegs = new T.InstancedMesh(own(new T.CylinderGeometry(0.1, 0.1, 4.9, 6)), steel, spots.length * 4),
    m = new T.Matrix4(),
    rand = noise(5);
  spots.forEach(([x, z], i) => {
    const dx = (rand() - 0.5) * 0.8,
      dz = (rand() - 0.5) * 0.6;
    tops.setMatrixAt(i, m.makeTranslation(x + dx, -0.14, z + dz));
    rims.setMatrixAt(i, m.makeTranslation(x + dx, -0.3, z + dz));
    [[-2.4, -1.8], [2.4, -1.8], [-2.4, 1.8], [2.4, 1.8]].forEach(([lx, lz], k) => legs.setMatrixAt(i * 4 + k, m.makeTranslation(x + dx + lx, FLOOR / 2, z + dz + lz)));
    const cx = x + (rand() - 0.5) * 1.2,
      cz = z + 4.4 + rand() * 0.8;
    seatsMesh.setMatrixAt(i, m.makeTranslation(cx, FLOOR + 4.9, cz));
    backs.setMatrixAt(i, m.makeTranslation(cx, FLOOR + 8.2, cz + 1.9));
    [[-1.7, -1.6], [1.7, -1.6], [-1.7, 1.7], [1.7, 1.7]].forEach(([lx, lz], k) => chairLegs.setMatrixAt(i * 4 + k, m.makeTranslation(cx + lx, FLOOR + 2.45, cz + lz)));
  });
  for (const mesh of [tops, rims, legs, seatsMesh, backs, chairLegs]) {
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // The front wall with its chalkboard, tray and a wooden wainscot; the teacher's desk before it.
  const plaster = standard({ color: "#ece6d6", roughness: 0.95 }),
    wainscot = standard({ map: own(wood(false, 0.5)), color: "#c9a77c", roughness: 0.7 }),
    front = -38;
  add(new T.PlaneGeometry(80, 40), plaster, 0, FLOOR + 20, front, false);
  add(new T.BoxGeometry(80, 7.5, 0.3), wainscot, 0, FLOOR + 3.75, front + 0.15, false);
  add(new T.BoxGeometry(46, 13.4, 0.3), standard({ color: "#a9adb1", roughness: 0.35, metalness: 0.6 }), 0, 7.5, front + 0.3, false);
  add(new T.BoxGeometry(45, 12.6, 0.12), standard({ map: own(chalkboard()), roughness: 0.9 }), 0, 7.5, front + 0.5, false);
  add(new T.BoxGeometry(45, 0.25, 1.0), standard({ color: "#a9adb1", roughness: 0.35, metalness: 0.6 }), 0, 1.05, front + 0.9, false);
  const chalk = own(new T.CylinderGeometry(0.1, 0.1, 1.0, 8).rotateZ(Math.PI / 2));
  ["#f6f4ec", "#f6d36a", "#f08aa0", "#f6f4ec"].forEach((color, i) => add(chalk, standard({ color, roughness: 0.9 }), -14 + i * 1.6, 1.28, front + 1.0));
  add(new T.BoxGeometry(2.2, 0.6, 0.9), standard({ color: "#2b2b30", roughness: 0.9 }), 12, 1.45, front + 1.0);
  add(new T.BoxGeometry(9, 9, 5), standard({ map: own(wood(true, 0.7)), roughness: 0.6 }), 14, FLOOR + 4.5, front + 6, true);
  // Windows along the left wall, the schoolyard beyond them.
  const left = -34,
    frame = standard({ color: "#e9ece8", roughness: 0.5 });
  const yard = add(new T.PlaneGeometry(70, 22).rotateY(Math.PI / 2), own(new T.MeshBasicMaterial({ map: own(schoolyard()) })), left - 1.2, 6, -8, false);
  yard.receiveShadow = false;
  for (let z = -34; z <= 16; z += 10) {
    add(new T.BoxGeometry(0.5, 16, 8.6), own(new T.MeshStandardMaterial({ color: "#dff0ff", transparent: true, opacity: 0.12, roughness: 0.05 })), left + 0.1, 6, z, false).receiveShadow = false;
    add(new T.BoxGeometry(0.6, 16.4, 0.5), frame, left + 0.2, 6, z - 4.6, false);
    add(new T.BoxGeometry(0.6, 0.5, 9.6), frame, left + 0.2, 14.1, z, false);
    add(new T.BoxGeometry(0.6, 0.5, 9.6), frame, left + 0.2, -2.1, z, false);
  }
  add(new T.BoxGeometry(0.6, 16.4, 0.5), frame, left + 0.2, 6, 20.6, false);
  // The wall below and above the windows, and beyond them at both ends.
  add(new T.BoxGeometry(0.4, 6.2, 80), plaster, left, FLOOR + 3.1, -8, false);
  add(new T.BoxGeometry(0.4, 16.4, 9), plaster, left, 6, -43.4, false);
  add(new T.BoxGeometry(0.4, 16.4, 12), plaster, left, 6, 26.8, false);
  add(new T.BoxGeometry(0.4, 12, 80), plaster, left, 20.1, -8, false);
  // The right wall: a notice board and the door to the corridor.
  const right = 34;
  add(new T.PlaneGeometry(80, 40).rotateY(-Math.PI / 2), plaster, right, FLOOR + 20, -8, false);
  add(new T.BoxGeometry(0.3, 8, 18), standard({ map: own(noticeBoard()), roughness: 0.9 }), right - 0.2, 7, -16, false);
  add(new T.BoxGeometry(0.4, 17, 8), standard({ map: own(wood(true, 0.6)), roughness: 0.6 }), right - 0.25, FLOOR + 8.5, 2, false);
  add(new T.BoxGeometry(80, 7.5, 0.3).rotateY(Math.PI / 2), wainscot, right - 0.15, FLOOR + 3.75, -8, false);
}
/** A duvet cover: soft blue with a broad lighter check, quilting stitched across it, and the shading of loose folds. */
function duvet() {
  const { c, ctx } = canvas(1024, 1024),
    rand = noise(77);
  ctx.fillStyle = "#4a6a96";
  ctx.fillRect(0, 0, 1024, 1024);
  ctx.fillStyle = "rgba(255, 255, 255, 0.07)";
  for (let i = 0; i < 8; i += 2) {
    ctx.fillRect(i * 128, 0, 128, 1024);
    ctx.fillRect(0, i * 128, 1024, 128);
  }
  ctx.strokeStyle = "rgba(230, 238, 250, 0.35)";
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  for (let i = 0; i <= 8; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 128, 0);
    ctx.lineTo(i * 128, 1024);
    ctx.moveTo(0, i * 128);
    ctx.lineTo(1024, i * 128);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  // Little white stars scattered over it.
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  for (let i = 0; i < 70; i++) {
    const x = rand() * 1024,
      y = rand() * 1024,
      r = 5 + rand() * 6;
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = (k * Math.PI) / 5 - Math.PI / 2,
        d = k % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d);
    }
    ctx.fill();
  }
  // Loose folds: long soft bands a little darker or lighter.
  for (let i = 0; i < 9; i++) {
    const x = rand() * 1024,
      g = ctx.createLinearGradient(x - 60, 0, x + 60, 0),
      dark = i % 2 === 0;
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, dark ? "rgba(10, 20, 40, 0.12)" : "rgba(255, 255, 255, 0.045)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.translate(512, 512);
    ctx.rotate((rand() - 0.5) * 0.9);
    ctx.translate(-512, -512);
    ctx.fillStyle = g;
    ctx.fillRect(x - 60, -300, 120, 1624);
    ctx.restore();
  }
  return texture(c, 1.6, 2.2);
}
/** Wallpaper: pale cream with small sprigs. */
function wallpaper() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#f3ead8";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "rgba(150, 170, 140, 0.5)";
  for (let y = 16; y < 256; y += 48)
    for (let x = (y / 48) % 2 ? 40 : 16; x < 256; x += 48) {
      ctx.beginPath();
      ctx.ellipse(x, y, 4, 9, 0.6, 0, Math.PI * 2);
      ctx.ellipse(x + 7, y + 2, 4, 9, -0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  return texture(c, 10, 5);
}
/**
 * A bedroom round a bed whose duvet is the table (the user asked for One Card on a bed): the duvet with its cover
 * turned down at the head, two pillows, an upholstered headboard, a teddy bear, a phone and a bowl of popcorn on
 * the bed (clear of the four hands), a nightstand with a lamp and an alarm clock, a low bookshelf with a plant, slippers and a rug on a
 * wooden floor, and a papered wall. The duvet's top is at `y` 0 and covers the whole of the play.
 */
export function bedroom(scene: T.Object3D, own: Own) {
  const standard = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.85, ...options })),
    add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, parent: T.Object3D = scene) => {
      const mesh = new T.Mesh(own(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
    FLOOR = -5.7,
    HEAD = -6.6,
    W = 16.4,
    L = 23;
  // The floor, a rug and the wall behind the bed.
  const floor = add(new T.PlaneGeometry(80, 70), standard({ ...stuff("boards", "#b48658", 8, own), roughness: 0.6 }), 0, FLOOR, 0);
  floor.rotation.x = -Math.PI / 2;
  floor.castShadow = false;
  add(new T.CylinderGeometry(3.6, 3.6, 0.12, 40), standard({ color: "#e7b8c4", roughness: 1 }), 12.2, FLOOR + 0.06, 1.2).castShadow = false;
  add(new T.PlaneGeometry(80, 30), standard({ map: own(wallpaper()), roughness: 0.95 }), 0, FLOOR + 15, HEAD - 1.2).castShadow = false;
  add(new T.BoxGeometry(80, 0.8, 0.3), standard({ color: "#f6f2ea", roughness: 0.6 }), 0, FLOOR + 0.4, HEAD - 1.05);
  // The bed: a wooden frame on legs, the mattress, and the duvet over it, rounded at its edges as it falls over the sides.
  const frame = standard({ map: own(wood(false, 0.7)), color: "#d8b48a", roughness: 0.55 }),
    cover = standard({ map: own(duvet()), roughness: 0.95 }),
    sheet = standard({ color: "#f7f4ee", roughness: 0.9 });
  add(new T.BoxGeometry(W + 0.6, 1.3, L + 0.6), frame, 0, -3.6, HEAD + L / 2);
  for (const x of [-W / 2, W / 2]) for (const z of [HEAD + 0.4, HEAD + L - 0.4]) add(new T.BoxGeometry(0.6, 1.8, 0.6), frame, x, FLOOR + 0.9, z);
  add(block(W, 1.7, L, 0.35), sheet, 0, -2.0, HEAD + L / 2);
  add(block(W + 0.3, 1.25, L - 2.0, 0.55), cover, 0, -0.62, HEAD + 2.0 + (L - 2.0) / 2).castShadow = false;
  // The cover turned down at the head, showing its white lining, and the sheet beyond it.
  add(block(W + 0.35, 0.36, 1.0, 0.16), sheet, 0, -0.04, HEAD + 2.1);
  // An upholstered headboard and two pillows.
  add(block(W + 1.0, 6.5, 0.8, 0.35), standard({ color: "#8d8a84", roughness: 0.95 }), 0, FLOOR + 6.2, HEAD - 0.5);
  const pillow = own(block(6.6, 1.3, 2.6, 0.6)),
    case_ = standard({ color: "#f4efe6", roughness: 0.9 });
  for (const x of [-3.7, 3.7]) {
    const p = new T.Mesh(pillow, case_);
    p.position.set(x, 0.1, HEAD + 1.2);
    p.rotation.x = -0.12;
    p.castShadow = p.receiveShadow = true;
    scene.add(p);
  }
  // A teddy bear sitting by the pillows at the left.
  const fur = standard({ color: "#b5794a", roughness: 1 }),
    muzzle = standard({ color: "#e8c9a0", roughness: 1 }),
    eye = standard({ color: "#1b1512", roughness: 0.3 }),
    bear = new T.Group();
  add(new T.SphereGeometry(0.85, 18, 14), fur, 0, 0.75, 0, bear).scale.set(1, 1.05, 0.9);
  add(new T.SphereGeometry(0.62, 18, 14), fur, 0, 1.95, 0.05, bear);
  add(new T.SphereGeometry(0.26, 12, 10), muzzle, 0, 1.85, 0.55, bear).scale.set(1, 0.8, 0.8);
  add(new T.SphereGeometry(0.08, 8, 6), eye, 0, 1.92, 0.76, bear);
  for (const side of [-1, 1]) {
    add(new T.SphereGeometry(0.22, 12, 10), fur, side * 0.45, 2.45, 0, bear);
    add(new T.SphereGeometry(0.11, 8, 6), muzzle, side * 0.45, 2.45, 0.12, bear);
    add(new T.SphereGeometry(0.07, 8, 6), eye, side * 0.22, 2.08, 0.55, bear);
    add(new T.CapsuleGeometry(0.22, 0.5, 6, 10), fur, side * 0.85, 0.95, 0.25, bear).rotation.z = side * 0.6;
    add(new T.CapsuleGeometry(0.26, 0.5, 6, 10), fur, side * 0.42, 0.25, 0.65, bear).rotation.x = Math.PI / 2;
  }
  bear.position.set(-6.4, 0, HEAD + 2.6);
  bear.rotation.y = 0.45;
  scene.add(bear);
  // A phone lying face up on the duvet, and a bowl of popcorn.
  const phone = add(block(0.62, 0.08, 1.25, 0.08), standard({ color: "#1d1f24", roughness: 0.3, metalness: 0.4 }), -7.2, 0.04, 2.9);
  phone.rotation.y = 0.4;
  add(new T.BoxGeometry(0.52, 0.01, 1.08), own(new T.MeshStandardMaterial({ color: "#2a4a7a", emissive: "#3a6ab0", emissiveIntensity: 0.6, roughness: 0.2 })), 0, 0.045, 0, phone);
  const bowl = new T.Group();
  add(new T.LatheGeometry([[0.1, 0], [0.5, 0.03], [0.78, 0.4], [0.9, 0.85], [0.95, 0.9]].map(([r, h]) => new T.Vector2(r, h)), 28), own(new T.MeshStandardMaterial({ color: "#d94a3a", roughness: 0.5, side: T.DoubleSide })), 0, 0, 0, bowl);
  const kernel = own(new T.SphereGeometry(0.13, 8, 6)),
    pop = standard({ color: "#fbf3d8", roughness: 0.9 }),
    rand = noise(13);
  for (let i = 0; i < 40; i++) {
    const a = rand() * Math.PI * 2,
      r = rand() * 0.7,
      k = new T.Mesh(kernel, pop);
    k.position.set(Math.cos(a) * r, 0.62 + (0.7 - r) * 0.3 + rand() * 0.14, Math.sin(a) * r);
    k.scale.set(1, 0.8 + rand() * 0.4, 1);
    k.castShadow = true;
    bowl.add(k);
  }
  bowl.position.set(7.15, 0, -3.5);
  scene.add(bowl);
  // A nightstand with a lamp and an alarm clock at the left of the head.
  const stand = standard({ map: own(wood(false, 0.6)), color: "#e6cfae", roughness: 0.55 }),
    sx = -W / 2 - 1.9,
    sz = HEAD + 1.4;
  add(new T.BoxGeometry(3.0, -FLOOR - 0.2, 2.6), stand, sx, (FLOOR - 0.2) / 2, sz);
  add(new T.BoxGeometry(2.6, 1.4, 0.08), stand, sx, -1.6, sz + 1.32);
  add(new T.SphereGeometry(0.12, 10, 8), standard({ color: "#c9a24a", metalness: 0.7, roughness: 0.3 }), sx, -1.6, sz + 1.42);
  add(new T.CylinderGeometry(0.45, 0.55, 0.3, 20), standard({ color: "#efe8da", roughness: 0.4 }), sx - 0.4, 0.0, sz - 0.3);
  add(new T.CylinderGeometry(0.07, 0.07, 1.6, 10), standard({ color: "#c9a24a", metalness: 0.7, roughness: 0.3 }), sx - 0.4, 0.9, sz - 0.3);
  add(new T.CylinderGeometry(0.6, 1.05, 1.1, 24, 1, true), own(new T.MeshStandardMaterial({ color: "#fff2d6", emissive: "#ffcf80", emissiveIntensity: 0.55, roughness: 0.9, side: T.DoubleSide })), sx - 0.4, 2.0, sz - 0.3).castShadow = false;
  const clock = new T.Group();
  add(new T.CylinderGeometry(0.42, 0.42, 0.3, 24).rotateX(Math.PI / 2), standard({ color: "#d94a3a", roughness: 0.4 }), 0, 0.45, 0, clock);
  add(new T.CircleGeometry(0.34, 24), standard({ color: "#fbfaf6", roughness: 0.5 }), 0, 0.45, 0.16, clock);
  for (const side of [-1, 1]) add(new T.SphereGeometry(0.16, 10, 8), standard({ color: "#c9a24a", metalness: 0.7, roughness: 0.3 }), side * 0.3, 0.85, 0, clock);
  clock.position.set(sx + 0.65, -0.15, sz + 0.5);
  clock.rotation.y = 0.5;
  scene.add(clock);
  // A low bookshelf at the right with books and a small plant.
  const bx = W / 2 + 2.2,
    bz = HEAD + 1.8;
  add(new T.BoxGeometry(3.2, -FLOOR + 0.2, 3.4), stand, bx, (FLOOR + 0.2) / 2, bz);
  ["#c8321f", "#2f62c0", "#e0b020", "#2f8a52", "#7a4a8a", "#e8e2d4"].forEach((color, i) => {
    const book = add(new T.BoxGeometry(2.2, 0.32, 1.6 - (i % 3) * 0.2), standard({ color, roughness: 0.7 }), bx - 0.2, 0.36 + i * 0.32, bz + 0.5);
    book.rotation.y = (i % 2 ? 0.08 : -0.05) + 0.1;
  });
  add(new T.CylinderGeometry(0.42, 0.34, 0.7, 18), standard({ color: "#d9d2c0", roughness: 0.6 }), bx + 0.1, 0.55, bz - 0.9);
  const leaf = own(new T.SphereGeometry(0.3, 8, 6)),
    green = standard({ color: "#4f8a3f", roughness: 0.8 });
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2,
      l = new T.Mesh(leaf, green);
    l.position.set(bx + 0.1 + Math.cos(a) * 0.35, 1.15 + (i % 3) * 0.22, bz - 0.9 + Math.sin(a) * 0.35);
    l.scale.set(0.7, 1.2, 0.35);
    l.rotation.set(0.3, a, 0.4);
    l.castShadow = true;
    scene.add(l);
  }
  // Slippers by the bed.
  const slipper = own(block(1.1, 0.4, 2.4, 0.2)),
    plush = standard({ color: "#f0a8b8", roughness: 1 });
  for (const [x, z, turn] of [[-W / 2 - 1.8, 3.2, 0.2], [-W / 2 - 3.1, 3.6, 0.35]]) {
    const s = new T.Mesh(slipper, plush);
    s.position.set(x, FLOOR + 0.2, z);
    s.rotation.y = turn;
    s.castShadow = s.receiveShadow = true;
    scene.add(s);
  }
}
