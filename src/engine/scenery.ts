import * as T from "three";
import { wood } from "./scene-utils";

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
      map: own(speckled("#5f8a45", ["rgba(34,70,24,0.35)", "rgba(150,190,96,0.3)", "rgba(88,120,52,0.4)"], 13, 22, 5200)),
      roughness: 1,
    }),
    gravel = standard({
      map: own(speckled("#b9ad98", ["rgba(70,62,50,0.28)", "rgba(255,250,238,0.3)", "rgba(120,108,90,0.3)"], 29, 18, 4200)),
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
      roughness: 1,
    }),
    carpet = standard({
      map: own(speckled("#3c4654", ["rgba(16,20,28,0.4)", "rgba(110,124,148,0.3)"], 23, 26, 4200)),
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
    map: own(speckled("#c2a071", ["rgba(92,66,36,0.18)", "rgba(255,240,205,0.16)", "rgba(120,96,60,0.2)"], 31, 14)),
    roughness: 1,
  });
  add(new T.PlaneGeometry(90, 90), earth, 0, -0.03, 0, false).rotation.x = -Math.PI / 2;
  // The house: a stone footing, the wooden porch on it, a step stone and posts.
  const stone = standard({
    map: own(speckled("#9c968a", ["rgba(40,40,40,0.16)", "rgba(255,255,255,0.14)"], 77, 2)),
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
