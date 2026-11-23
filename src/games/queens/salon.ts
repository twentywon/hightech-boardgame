import * as T from "three";
import { block, capable, glossy, weave } from "../../engine/scene-utils";

/**
 * The room 체스판의 퀸 is played in (the user asked for the five puzzles to be upgraded): a palace drawing room seen
 * from above, all made in code and of our own design. The board lies on a table draped in crimson velvet with a
 * woven damask figure and a gold braid; round it, clear of the board, stand a gold crown on a tasselled cushion, a
 * silver candelabrum with three lit candles, a porcelain cup on its saucer and a closed book bound in leather.
 * Everything is placed from the board's half width, so that it stays clear of every size of board.
 */
type Keep = <R extends { dispose(): void }>(resource: R) => R;
type Paint = (options: T.MeshStandardMaterialParameters) => T.MeshStandardMaterial;
function painted(keep: Keep, size: number, paint: (pen: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d")!, size);
  const texture = keep(new T.CanvasTexture(c));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  return texture;
}
/** Crimson velvet with a damask figure woven a shade darker: a lily in a lozenge, repeated. */
function damask(keep: Keep) {
  return painted(
    keep,
    256,
    (pen, s) => {
      pen.fillStyle = "#7c1622";
      pen.fillRect(0, 0, s, s);
      pen.strokeStyle = "rgba(40,4,10,0.35)";
      pen.fillStyle = "rgba(40,4,10,0.28)";
      pen.lineWidth = 3;
      // The lozenge.
      pen.beginPath();
      pen.moveTo(s / 2, 6);
      pen.lineTo(s - 6, s / 2);
      pen.lineTo(s / 2, s - 6);
      pen.lineTo(6, s / 2);
      pen.closePath();
      pen.stroke();
      // A lily: three petals and a band, in the middle; quarter lilies at the corners.
      const lily = (x: number, y: number, k: number) => {
        pen.beginPath();
        pen.ellipse(x, y - 22 * k, 9 * k, 26 * k, 0, 0, Math.PI * 2);
        pen.ellipse(x - 20 * k, y - 4 * k, 7 * k, 20 * k, -0.7, 0, Math.PI * 2);
        pen.ellipse(x + 20 * k, y - 4 * k, 7 * k, 20 * k, 0.7, 0, Math.PI * 2);
        pen.fill();
        pen.fillRect(x - 18 * k, y + 8 * k, 36 * k, 7 * k);
        pen.beginPath();
        pen.moveTo(x - 10 * k, y + 15 * k);
        pen.lineTo(x, y + 34 * k);
        pen.lineTo(x + 10 * k, y + 15 * k);
        pen.fill();
      };
      lily(s / 2, s / 2, 1.3);
      for (const [x, y] of [[0, 0], [s, 0], [0, s], [s, s]]) lily(x, y, 0.8);
      // The pile catches the light unevenly.
      let seed = 5;
      const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
      for (let i = 0; i < 1400; i++) {
        pen.fillStyle = random() < 0.5 ? "rgba(255,190,190,0.05)" : "rgba(0,0,0,0.06)";
        pen.fillRect(random() * s, random() * s, 2, 2);
      }
    },
    28,
  );
}
/** A leather binding: dark red with a tooled gold frame, for the book's covers. */
function leather(keep: Keep) {
  return painted(keep, 256, (pen, s) => {
    pen.fillStyle = "#4a2416";
    pen.fillRect(0, 0, s, s);
    let seed = 9;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let i = 0; i < 900; i++) {
      pen.fillStyle = `rgba(${random() < 0.5 ? "0,0,0" : "120,70,40"},${random() * 0.12})`;
      pen.fillRect(random() * s, random() * s, 3, 3);
    }
    pen.strokeStyle = "#c9a44a";
    pen.lineWidth = 5;
    pen.strokeRect(20, 20, s - 40, s - 40);
    pen.lineWidth = 2;
    pen.strokeRect(32, 32, s - 64, s - 64);
    pen.beginPath();
    pen.arc(s / 2, s / 2, 34, 0, Math.PI * 2);
    pen.stroke();
  });
}
export interface Salon {
  /** The candle flames, for a view that makes them flicker. */
  flames: T.Mesh[];
}
/** Builds the table and the things on it round a board of half width `half` (to the outside of its rim); its rim's foot is at y `foot`. */
export function salon(scene: T.Object3D, keep: Keep, paint: Paint, half: number, foot: number): Salon {
  const rich = capable(),
    flames: T.Mesh[] = [],
    add = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number, parent: T.Object3D = scene) => {
      const mesh = new T.Mesh(keep(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
    lathe = (points: number[][], segments = 32) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
  // The velvet cloth, and a gold braid laid round the board a little way out.
  const velvet = paint({ map: damask(keep), ...weave(18, 18, keep, 0.6), color: "#ffffff", roughness: 0.92 }),
    cloth = add(new T.PlaneGeometry(70, 70).rotateX(-Math.PI / 2), velvet, 0, foot, 0);
  cloth.castShadow = false;
  const gold = paint({ color: "#d4ac4c", roughness: 0.3, metalness: 0.9 }),
    braid = half + 0.45;
  for (const [x, z, w, d] of [[0, -braid, braid * 2 + 0.08, 0.06], [0, braid, braid * 2 + 0.08, 0.06], [-braid, 0, 0.06, braid * 2], [braid, 0, 0.06, braid * 2]])
    add(new T.BoxGeometry(w, 0.025, d), gold, x, foot + 0.012, z).castShadow = false;
  // A gold crown on a crimson cushion with tassels, at the left.
  const cushion = paint({ color: "#9a1e2c", roughness: 0.85, ...weave(2, 2, keep, 0.5) }),
    crown = new T.Group(),
    cx = -(half + 1.75),
    cz = -0.6;
  add(block(1.7, 0.36, 1.7, 0.16), cushion, cx, foot + 0.18, cz);
  for (const [dx, dz] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) {
    add(new T.SphereGeometry(0.07, 10, 8), gold, cx + dx, foot + 0.28, cz + dz);
    add(new T.ConeGeometry(0.06, 0.22, 8), gold, cx + dx * 1.04, foot + 0.15, cz + dz * 1.04);
  }
  const band = keep(new T.CylinderGeometry(0.42, 0.4, 0.22, 40, 1, true)),
    point = keep(new T.ConeGeometry(0.07, 0.3, 4)),
    pearl = keep(new T.SphereGeometry(0.045, 10, 8)),
    ruby = keep(glossy({ color: "#b3122a", roughness: 0.15 })),
    sapphire = keep(glossy({ color: "#1f3c9a", roughness: 0.15 })),
    goldSides = keep(new T.MeshStandardMaterial({ color: "#d4ac4c", roughness: 0.28, metalness: 0.9, side: T.DoubleSide }));
  add(band.clone(), goldSides, 0, 0.11, 0, crown);
  const cap = add(new T.SphereGeometry(0.38, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint({ color: "#7a1020", roughness: 0.9 }), 0, 0.12, 0, crown);
  cap.scale.y = 0.75;
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2,
      x = Math.cos(a) * 0.41,
      z = Math.sin(a) * 0.41;
    add(point.clone(), gold, x, 0.36, z, crown).rotation.y = -a;
    add(pearl.clone(), paint({ color: "#f4efe4", roughness: 0.3 }), x, 0.53, z, crown);
    add(new T.SphereGeometry(0.05, 10, 8), k % 2 ? sapphire : ruby, Math.cos(a) * 0.425, 0.11, Math.sin(a) * 0.425, crown);
  }
  add(new T.SphereGeometry(0.07, 12, 10), gold, 0, 0.44, 0, crown);
  const cross = paint({ color: "#d4ac4c", roughness: 0.3, metalness: 0.9 });
  add(new T.BoxGeometry(0.04, 0.18, 0.04), cross, 0, 0.56, 0, crown);
  add(new T.BoxGeometry(0.12, 0.04, 0.04), cross, 0, 0.58, 0, crown);
  crown.position.set(cx, foot + 0.33, cz);
  crown.rotation.set(0.12, 0.4, 0.05);
  scene.add(crown);
  // A closed book bound in leather, its pages showing at the edge, at the near left.
  const cover = paint({ map: leather(keep), roughness: 0.7 }),
    pages = paint({ color: "#efe6cf", roughness: 0.9 }),
    book = new T.Group();
  add(new T.BoxGeometry(1.3, 0.05, 1.75), cover, 0, 0.025, 0, book);
  add(new T.BoxGeometry(1.22, 0.16, 1.65), pages, 0.02, 0.13, 0, book);
  add(new T.BoxGeometry(1.3, 0.05, 1.75), cover, 0, 0.235, 0, book);
  add(new T.BoxGeometry(0.08, 0.26, 1.75), cover, -0.63, 0.13, 0, book);
  book.position.set(-(half + 1.55), foot, 1.75);
  book.rotation.y = 0.35;
  scene.add(book);
  // A silver candelabrum with three candles, at the far right.
  const silver = paint({ color: "#d9dde0", roughness: 0.22, metalness: 0.95 }),
    wax = paint({ color: "#f5ecd8", roughness: 0.7, emissive: "#ffb060", emissiveIntensity: 0.06 }),
    fire = keep(new T.MeshBasicMaterial({ color: "#ffd27a" })),
    sx = half + 1.65,
    sz = -1.4,
    stand = new T.Group();
  add(lathe([[0, 0], [0.42, 0], [0.44, 0.05], [0.3, 0.12], [0.1, 0.24], [0.07, 0.9], [0.12, 0.98], [0.07, 1.05], [0.06, 1.5], [0, 1.5]]), silver, 0, 0, 0, stand);
  for (const side of [-1, 1]) {
    const arm = new T.CatmullRomCurve3([new T.Vector3(0, 1.1, 0), new T.Vector3(side * 0.3, 1.0, 0), new T.Vector3(side * 0.55, 1.2, 0), new T.Vector3(side * 0.6, 1.42, 0)]);
    add(new T.TubeGeometry(arm, 16, 0.03, 6), silver, 0, 0, 0, stand);
  }
  for (const x of [-0.6, 0, 0.6]) {
    const top = x === 0 ? 1.5 : 1.42;
    add(lathe([[0, 0], [0.12, 0], [0.15, 0.08], [0.1, 0.1], [0, 0.1]]), silver, x, top, 0, stand);
    add(new T.CylinderGeometry(0.07, 0.07, 0.62, 14), wax, x, top + 0.38, 0, stand);
    const flame = new T.Mesh(keep(new T.SphereGeometry(0.05, 10, 8).scale(1, 2.4, 1)), fire);
    flame.position.set(x, top + 0.78, 0);
    stand.add(flame);
    flames.push(flame);
  }
  stand.position.set(sx, foot, sz);
  stand.rotation.y = 0.5;
  scene.add(stand);
  if (rich) {
    const glow = new T.PointLight("#ffbe78", 2.2, 6, 2);
    glow.position.set(sx, foot + 2.3, sz);
    scene.add(glow);
  }
  // A porcelain cup on its saucer, with a gilt rim, at the near right.
  const china = keep(glossy({ color: "#fbfaf6", roughness: 0.25 })),
    rim = paint({ color: "#d4ac4c", roughness: 0.3, metalness: 0.9 }),
    tea = paint({ color: "#7a3c14", roughness: 0.15 }),
    px = half + 1.5,
    pz = 1.6;
  add(lathe([[0, 0], [0.5, 0.02], [0.62, 0.08], [0.64, 0.1], [0.5, 0.06], [0, 0.06]], 40), china, px, foot, pz);
  add(lathe([[0, 0.06], [0.18, 0.06], [0.2, 0.1], [0.32, 0.2], [0.38, 0.42], [0.39, 0.46], [0.36, 0.46], [0.35, 0.42], [0.28, 0.22], [0, 0.18]], 40), china, px, foot, pz);
  add(new T.TorusGeometry(0.385, 0.01, 6, 40).rotateX(Math.PI / 2), rim, px, foot + 0.465, pz).castShadow = false;
  add(new T.CircleGeometry(0.34, 32).rotateX(-Math.PI / 2), tea, px, foot + 0.38, pz).castShadow = false;
  const handle = add(new T.TorusGeometry(0.12, 0.025, 8, 20, Math.PI * 1.3), china, px + 0.42, foot + 0.3, pz);
  handle.rotation.z = -Math.PI * 0.65;
  return { flames };
}
