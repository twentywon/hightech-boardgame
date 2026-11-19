import * as T from "three";
import { block, stuff } from "../../engine/scene-utils";
import { speckled } from "../../engine/scenery";
import { LAWN, flatten, seeded } from "./greens";
import { COURSE, ORIGINS } from "./layout";
import { HOLES, boxOf } from "./course";

/**
 * The seaside garden round the course, all modelled and painted in code: a lawn inside a white picket fence, flower
 * beds between the holes, round trees and palms, a gravel walk, the kiosk where the putters are lent, a sandy
 * beach and the sea beyond with a red-and-white lighthouse on its rocks, sailing boats, clouds and the sky.
 */
type Keep = <R extends { dispose(): void }>(r: R) => R;
export interface Bloom {
  x: number;
  y: number;
  z: number;
}
/** The fence round the course, and where the beach and the sea begin. */
export const FENCE = { x0: COURSE.x0 - 3.2, x1: COURSE.x1 + 2.2, z0: -4.4, z1: 5.6 },
  SHORE = -8.1,
  /** The lighthouse stands on its rocks out in the shallows, beyond the middle of the course. */
  LIGHTHOUSE = { x: (COURSE.x0 + COURSE.x1) / 2 + 2.5, z: -9.4 };
const mesh = (geometry: T.BufferGeometry, material: T.Material | T.Material[], parent: T.Object3D, x = 0, y = 0, z = 0, shadow = true) => {
  const m = new T.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
};
const canvasTexture = (width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  draw(c.getContext("2d")!);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};
export interface Garden {
  sky: T.Mesh;
  sea: T.Texture;
  /** The lighthouse's lamp, which the view makes glow and turn. */
  lamp: T.Group;
  boats: T.Group[];
}
export function garden(scene: T.Scene, keep: Keep, blooms: Bloom[]): Garden {
  const random = seeded(2024),
    width = FENCE.x1 - FENCE.x0,
    mid = (FENCE.x0 + FENCE.x1) / 2;
  // The sky: a dome from deep blue overhead to a pale haze at the horizon.
  const domeGeometry = keep(new T.SphereGeometry(180, 32, 16)),
    colours: number[] = [],
    top = new T.Color("#4aa3e6"),
    low = new T.Color("#dff2fb"),
    positions = domeGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const c = low.clone().lerp(top, Math.pow(Math.max(0, positions.getY(i) / 180), 0.55));
    colours.push(c.r, c.g, c.b);
  }
  domeGeometry.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  const sky = new T.Mesh(domeGeometry, keep(new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false })));
  sky.renderOrder = -1;
  scene.add(sky);
  // What never moves is gathered here and joined at the end; the boats, the lamp and the sky move.
  const fixed = new T.Group();
  // The lawn, inside and round the fence.
  const lawnDepth = FENCE.z1 + 12 + 4.9,
    lawn = mesh(keep(new T.PlaneGeometry(width + 30, lawnDepth).rotateX(-Math.PI / 2)), keep(new T.MeshStandardMaterial({ color: "#7cc95a", roughness: 0.95, ...stuff("grass", "#6fc152", (width + 30) / 3, keep, lawnDepth / 3) })), fixed, mid, LAWN, -4.9 + lawnDepth / 2, false);
  lawn.receiveShadow = true;
  // A gravel walk along the near side, and one along the far fence.
  const gravel = keep(new T.MeshStandardMaterial({ color: "#e4d8bd", roughness: 1, ...stuff("gravel", "#e2d6ba", width / 2, keep, 0.6) }));
  mesh(keep(new T.PlaneGeometry(width, 1.1).rotateX(-Math.PI / 2)), gravel, fixed, mid, LAWN + 0.004, 4.55, false);
  mesh(keep(new T.PlaneGeometry(width, 0.6).rotateX(-Math.PI / 2)), gravel, fixed, mid, LAWN + 0.004, -3.95, false);
  // The beach, sloping down to the sea, and the sea itself out to the horizon.
  const sand = keep(new T.MeshStandardMaterial({ map: keep(speckled("#ecd8a8", ["#d9c08a", "#f7e9c8", "#cfb27a"], 77, 40)), roughness: 1 })),
    // From the lawn's edge down past the waterline.
    beach = mesh(keep(new T.PlaneGeometry(width + 60, 5.2, 1, 1)), sand, fixed, mid, LAWN - 0.005 - 2.6 * Math.sin(0.08), -4.9 - 2.6, false);
  beach.rotation.x = -Math.PI / 2 - 0.08;
  const waves = keep(
    canvasTexture(256, 256, (ctx) => {
      ctx.fillStyle = "#2f93c9";
      ctx.fillRect(0, 0, 256, 256);
      const r = seeded(11);
      for (let i = 0; i < 90; i++) {
        const x = r() * 256,
          y = r() * 256,
          l = 8 + r() * 24;
        ctx.strokeStyle = r() < 0.5 ? "rgba(255,255,255,0.28)" : "rgba(20,70,120,0.25)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + l / 2, y - 3, x + l, y);
        ctx.stroke();
      }
    }),
  );
  waves.wrapS = waves.wrapT = T.RepeatWrapping;
  waves.repeat.set(60, 24);
  mesh(keep(new T.PlaneGeometry(400, 160).rotateX(-Math.PI / 2)), keep(new T.MeshStandardMaterial({ map: waves, roughness: 0.25, metalness: 0.1 })), fixed, mid, -0.36, SHORE - 80 + 0.6, false);
  // A white line of surf along the shore.
  mesh(keep(new T.PlaneGeometry(width + 60, 0.28).rotateX(-Math.PI / 2)), keep(new T.MeshStandardMaterial({ color: "#f4fbff", roughness: 0.6, transparent: true, opacity: 0.8 })), fixed, mid, -0.352, SHORE + 0.12, false);
  // The picket fence: white pickets with pointed tops on two rails, with a gate by the kiosk.
  const picket = new T.Shape([new T.Vector2(-0.032, 0), new T.Vector2(0.032, 0), new T.Vector2(0.032, 0.44), new T.Vector2(0, 0.5), new T.Vector2(-0.032, 0.44)]),
    picketGeometry = keep(new T.ExtrudeGeometry(picket, { depth: 0.018, bevelEnabled: false })),
    white = keep(new T.MeshStandardMaterial({ color: "#fbfaf5", roughness: 0.55 })),
    places: { x: number; z: number; turn: number }[] = [],
    gate = { x: FENCE.x0 + 1.2, half: 0.6 };
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const length = Math.hypot(x1 - x0, z1 - z0),
      n = Math.floor(length / 0.15),
      turn = Math.atan2(-(z1 - z0), x1 - x0);
    for (let i = 0; i <= n; i++) {
      const x = x0 + ((x1 - x0) * i) / n,
        z = z0 + ((z1 - z0) * i) / n;
      if (Math.abs(z - FENCE.z1) < 0.01 && Math.abs(x - gate.x) < gate.half) continue;
      places.push({ x, z, turn });
    }
    // Two rails behind the pickets.
    for (const y of [0.13, 0.34]) {
      const rail = mesh(keep(new T.BoxGeometry(length, 0.04, 0.02)), white, fixed, (x0 + x1) / 2, LAWN + y, (z0 + z1) / 2);
      rail.rotation.y = turn;
    }
  };
  run(FENCE.x0, FENCE.z0, FENCE.x1, FENCE.z0);
  run(FENCE.x1, FENCE.z0, FENCE.x1, FENCE.z1);
  run(FENCE.x0, FENCE.z1, FENCE.x1, FENCE.z1);
  run(FENCE.x0, FENCE.z0, FENCE.x0, FENCE.z1);
  const pickets = new T.InstancedMesh(picketGeometry, white, places.length),
    m = new T.Matrix4(),
    q = new T.Quaternion(),
    up = new T.Vector3(0, 1, 0);
  places.forEach((p, i) => {
    q.setFromAxisAngle(up, p.turn);
    m.compose(new T.Vector3(p.x, LAWN, p.z), q, new T.Vector3(1, 1, 1));
    pickets.setMatrixAt(i, m);
  });
  // The fence takes shadows but casts none: drawn twice, its hundreds of pickets cost more than they show.
  pickets.receiveShadow = true;
  scene.add(pickets);
  // Flower beds between the holes and along the near walk: dark soil with flowers.
  const soil = keep(new T.MeshStandardMaterial({ color: "#6a4a2f", roughness: 1 })),
    edge = keep(new T.MeshStandardMaterial({ color: "#d9cdb4", roughness: 0.9 })),
    bed = (x: number, z: number, w: number, d: number) => {
      mesh(keep(block(w + 0.08, 0.1, d + 0.08, 0.03)), edge, fixed, x, LAWN + 0.04, z);
      mesh(keep(block(w, 0.1, d, 0.02)), soil, fixed, x, LAWN + 0.05, z);
      for (let i = 0; i < w * d * 34; i++) blooms.push({ x: x + (random() - 0.5) * (w - 0.08), y: LAWN + 0.1, z: z + (random() - 0.5) * (d - 0.08) });
    };
  for (let k = 0; k < HOLES.length - 1; k++) {
    const right = ORIGINS[k].x + boxOf(HOLES[k].outline).x1,
      left = ORIGINS[k + 1].x + boxOf(HOLES[k + 1].outline).x0,
      x = (right + left) / 2,
      w = Math.max(0.3, left - right - 0.7);
    bed(x, 2.2, w, 1.6);
    bed(x, -1.6, w, 1.8);
  }
  for (let x = FENCE.x0 + 3; x < FENCE.x1 - 1.5; x += 3.4) bed(x, FENCE.z1 - 0.45, 1.6, 0.4);
  // Trees: round crowns on brown trunks inside the fence, palms along the beach.
  const trunk = keep(new T.MeshStandardMaterial({ color: "#7b5434", roughness: 0.9 })),
    crowns = [keep(new T.MeshStandardMaterial({ color: "#3e9b45", roughness: 0.85 })), keep(new T.MeshStandardMaterial({ color: "#5cb544", roughness: 0.85 }))],
    crown = keep(new T.IcosahedronGeometry(1, 2)),
    stem = keep(new T.CylinderGeometry(0.06, 0.09, 1, 10)),
    tree = (x: number, z: number, h: number) => {
      mesh(stem, trunk, fixed, x, LAWN + h / 2, z).scale.set(1, h, 1);
      mesh(crown, crowns[Math.floor(random() * 2)], fixed, x, LAWN + h + 0.35, z).scale.setScalar(0.55 + random() * 0.15);
      mesh(crown, crowns[0], fixed, x + 0.25, LAWN + h + 0.1, z + 0.1).scale.setScalar(0.32);
    };
  // At the corners of the garden, clear of every hole's line of sight.
  for (const [x, z, h] of [
    [FENCE.x0 + 0.7, -3.5, 1.3],
    [FENCE.x0 + 0.6, 4.6, 1.1],
    [FENCE.x1 - 0.6, -3.4, 1.4],
    [FENCE.x1 - 0.7, 4.5, 1.2],
  ])
    tree(x, z, h);
  const frond = keep(new T.MeshStandardMaterial({ color: "#3f9440", roughness: 0.8, side: T.DoubleSide })),
    leaf = keep(new T.PlaneGeometry(0.22, 1.1, 1, 4)),
    bend = leaf.attributes.position;
  // Each frond droops along its length.
  for (let i = 0; i < bend.count; i++) bend.setZ(i, -0.35 * ((bend.getY(i) + 0.55) / 1.1) ** 2);
  leaf.computeVertexNormals();
  const palm = (x: number, z: number, h: number, lean: number) => {
    const group = new T.Group();
    for (let s = 0; s < 6; s++) {
      const ring = mesh(keep(new T.CylinderGeometry(0.07, 0.085, h / 6, 9)), trunk, group, Math.sin(s / 6) * lean * h * 0.3, (h / 6) * (s + 0.5), 0);
      ring.rotation.z = -lean * 0.25;
    }
    for (let f = 0; f < 7; f++) {
      const holder = new T.Group();
      holder.position.set(Math.sin(1) * lean * h * 0.3, h, 0);
      holder.rotation.y = (f / 7) * Math.PI * 2;
      const blade = mesh(leaf, frond, holder, 0, 0, 0.5, false);
      blade.rotation.x = -Math.PI / 2 + 0.35;
      group.add(holder);
    }
    group.position.set(x, LAWN - 0.15, z);
    fixed.add(group);
  };
  palm(FENCE.x0 + 1.5, -5.6, 2.4, 0.4);
  palm(mid - 6, -5.4, 2.1, -0.3);
  palm(FENCE.x1 - 1.2, -5.7, 2.6, -0.35);
  // The lighthouse: a striped tower on grey rocks, a gallery, a glass lamp room and a red cap.
  const rocks = keep(new T.MeshStandardMaterial({ color: "#8d8a84", roughness: 0.95 })),
    rock = keep(new T.DodecahedronGeometry(1, 0)),
    house = new T.Group();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2,
      r = 1.1 + random() * 0.5,
      stone = mesh(rock, rocks, house, Math.cos(a) * r, -0.2 + random() * 0.1, Math.sin(a) * r);
    stone.scale.set(0.7 + random() * 0.5, 0.45 + random() * 0.3, 0.6 + random() * 0.5);
    stone.rotation.set(random() * 3, random() * 3, random() * 3);
  }
  mesh(keep(new T.CylinderGeometry(1.2, 1.4, 0.5, 20)), rocks, house, 0, -0.05, 0);
  const bands = 7,
    towerH = 3.6;
  for (let b = 0; b < bands; b++) {
    const r0 = 0.62 - (0.2 * b) / bands,
      r1 = 0.62 - (0.2 * (b + 1)) / bands;
    mesh(keep(new T.CylinderGeometry(r1, r0, towerH / bands, 24)), b % 2 ? white : keep(new T.MeshStandardMaterial({ color: "#d8302c", roughness: 0.5 })), house, 0, 0.2 + (towerH / bands) * (b + 0.5), 0);
  }
  const dark = keep(new T.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.5, metalness: 0.4 }));
  mesh(keep(new T.CylinderGeometry(0.62, 0.62, 0.08, 24)), dark, house, 0, 0.2 + towerH + 0.04, 0);
  mesh(keep(new T.TorusGeometry(0.6, 0.015, 6, 28).rotateX(Math.PI / 2)), dark, house, 0, 0.2 + towerH + 0.28, 0);
  const lamp = new T.Group(),
    glow = keep(new T.MeshStandardMaterial({ color: "#fff3b0", emissive: "#ffd34d", emissiveIntensity: 1.6, roughness: 0.2, transparent: true, opacity: 0.9 }));
  mesh(keep(new T.CylinderGeometry(0.34, 0.34, 0.5, 16, 1, true)), keep(new T.MeshStandardMaterial({ color: "#e8f7ff", roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.45, side: T.DoubleSide })), lamp, 0, 0.25, 0, false);
  mesh(keep(new T.SphereGeometry(0.16, 16, 10)), glow, lamp, 0, 0.25, 0, false);
  mesh(keep(new T.ConeGeometry(0.44, 0.45, 18)), keep(new T.MeshStandardMaterial({ color: "#c72b28", roughness: 0.45 })), lamp, 0, 0.72, 0);
  mesh(keep(new T.SphereGeometry(0.06, 10, 8)), dark, lamp, 0, 0.98, 0);
  lamp.position.set(LIGHTHOUSE.x, LAWN - 0.15 + 0.2 + towerH + 0.08, LIGHTHOUSE.z);
  scene.add(lamp);
  // A door and two small windows up the tower.
  mesh(keep(new T.BoxGeometry(0.28, 0.5, 0.06)), dark, house, 0, 0.45, 0.6);
  for (const y of [1.6, 2.7]) mesh(keep(new T.BoxGeometry(0.14, 0.2, 0.05)), dark, house, 0, y, 0.6 - (y / towerH) * 0.18);
  house.position.set(LIGHTHOUSE.x, LAWN - 0.15, LIGHTHOUSE.z);
  fixed.add(house);
  // The kiosk by the gate where the putters are lent: a hut with a striped awning and a sign of its own.
  const kiosk = new T.Group(),
    paintHut = keep(new T.MeshStandardMaterial({ color: "#fff4dc", roughness: 0.7 })),
    stripes = keep(
      canvasTexture(256, 64, (ctx) => {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? "#ffffff" : "#e8453c";
          ctx.fillRect(i * 32, 0, 32, 64);
        }
      }),
    ),
    signFace = keep(
      canvasTexture(512, 128, (ctx) => {
        ctx.fillStyle = "#1f3f7a";
        ctx.fillRect(0, 0, 512, 128);
        ctx.fillStyle = "#ffd23a";
        ctx.font = `900 54px "Inter", "Noto Sans KR", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("바닷가 미니골프", 256, 52);
        ctx.fillStyle = "#ffffff";
        ctx.font = `700 26px "Inter", sans-serif`;
        ctx.fillText("SEASIDE PUTTING GREEN", 256, 102);
      }),
    );
  mesh(keep(block(1.3, 0.95, 0.9, 0.04)), paintHut, kiosk, 0, LAWN + 0.475, 0);
  mesh(keep(new T.BoxGeometry(0.7, 0.36, 0.02)), dark, kiosk, 0, LAWN + 0.62, 0.451);
  mesh(keep(new T.BoxGeometry(1.5, 0.06, 0.4)), keep(new T.MeshStandardMaterial({ color: "#c08a52", roughness: 0.7 })), kiosk, 0, LAWN + 0.44, 0.55);
  const awning = mesh(keep(new T.PlaneGeometry(1.5, 0.5)), keep(new T.MeshStandardMaterial({ map: stripes, roughness: 0.8 })), kiosk, 0, LAWN + 1.0, 0.62);
  awning.rotation.x = -0.9;
  mesh(keep(new T.BoxGeometry(1.4, 0.35, 0.04)), [dark, dark, dark, dark, keep(new T.MeshStandardMaterial({ map: signFace, roughness: 0.6, emissive: "#ffffff", emissiveMap: signFace, emissiveIntensity: 0.25 })), dark], kiosk, 0, LAWN + 1.4, 0.3);
  mesh(keep(block(1.45, 0.08, 1.0, 0.03)), keep(new T.MeshStandardMaterial({ color: "#3b6fb6", roughness: 0.6 })), kiosk, 0, LAWN + 1.2, 0);
  // A rack of putters beside it.
  const shaft = keep(new T.CylinderGeometry(0.008, 0.008, 0.8, 6)),
    steel = keep(new T.MeshStandardMaterial({ color: "#c9ced6", roughness: 0.3, metalness: 0.8 }));
  for (let i = 0; i < 5; i++) {
    const club = mesh(shaft, steel, kiosk, 0.78 + i * 0.045, LAWN + 0.4, 0.2);
    club.rotation.z = 0.08;
  }
  kiosk.position.set(FENCE.x0 + 1.3, 0, 3.1);
  kiosk.rotation.y = 0.5;
  fixed.add(kiosk);
  // Sailing boats far out.
  const boats: T.Group[] = [],
    hull = keep(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 0.5 })),
    sail = keep(new T.MeshStandardMaterial({ color: "#fff8e8", roughness: 0.7, side: T.DoubleSide })),
    blueSail = keep(new T.MeshStandardMaterial({ color: "#4f8fe6", roughness: 0.7, side: T.DoubleSide }));
  for (const [x, z, s, painted] of [
    [mid - 9, -30, 1.2, 0],
    [mid + 7, -44, 1.6, 1],
    [mid + 18, -26, 1, 0],
  ] as [number, number, number, number][]) {
    const boat = new T.Group();
    mesh(keep(new T.CylinderGeometry(0.5, 0.3, 0.3, 12, 1, false, 0, Math.PI).rotateZ(Math.PI / 2)), hull, boat, 0, 0, 0, false).scale.set(1, 1, 2.6);
    mesh(keep(new T.CylinderGeometry(0.025, 0.025, 2.2, 6)), dark, boat, 0, 1.1, 0, false);
    mesh(keep(new T.ShapeGeometry(new T.Shape([new T.Vector2(0, 0.25), new T.Vector2(0, 2.1), new T.Vector2(1.1, 0.25)]))), painted ? blueSail : sail, boat, 0.03, 0, 0, false).rotation.y = Math.PI / 2;
    boat.position.set(x, -0.3, z);
    boat.scale.setScalar(s);
    scene.add(boat);
    boats.push(boat);
  }
  // Clouds: clusters of soft white balls high over the sea.
  const cloud = keep(new T.MeshStandardMaterial({ color: "#ffffff", roughness: 1, emissive: "#ffffff", emissiveIntensity: 0.5 }));
  for (const [x, y, z, s] of [
    [mid - 30, 22, -90, 6],
    [mid + 5, 28, -110, 8],
    [mid + 40, 20, -85, 5],
    [mid - 60, 30, -60, 7],
  ]) {
    const group = new T.Group();
    for (let i = 0; i < 6; i++) {
      const puff = mesh(crown, cloud, group, (random() - 0.5) * 3, (random() - 0.3) * 0.7, (random() - 0.5) * 1.2, false);
      puff.scale.set(1 + random(), 0.7 + random() * 0.4, 1 + random() * 0.5);
      puff.receiveShadow = false;
    }
    group.position.set(x, y, z);
    group.scale.setScalar(s / 3);
    fixed.add(group);
  }
  // Everything that stands still, joined into one mesh a paint.
  flatten(fixed, scene, keep);
  return { sky, sea: waves, lamp, boats };
}
/** The flowers of every bed: green stems, and blossoms drawn as one set a colour (instance colours would need a shader of their own). */
export function plant(scene: T.Scene, keep: Keep, blooms: Bloom[]) {
  const random = seeded(99),
    stemGeometry = keep(new T.CylinderGeometry(0.004, 0.005, 1, 3, 1, true)),
    headGeometry = keep(new T.IcosahedronGeometry(0.028, 0)),
    stems = new T.InstancedMesh(stemGeometry, keep(new T.MeshStandardMaterial({ color: "#3d8b35", roughness: 0.9 })), blooms.length),
    palette = ["#ff5a6e", "#ffd23a", "#ff9ad5", "#ffffff", "#9b6bff", "#ff8a3d", "#5fb3ff"],
    sets: T.Matrix4[][] = palette.map(() => []),
    m = new T.Matrix4(),
    q = new T.Quaternion();
  blooms.forEach((b, i) => {
    const h = 0.07 + random() * 0.08;
    q.identity();
    m.compose(new T.Vector3(b.x, b.y + h / 2, b.z), q, new T.Vector3(1, h, 1));
    stems.setMatrixAt(i, m);
    q.setFromEuler(new T.Euler(random() * 3, random() * 3, 0));
    const s = 0.75 + random() * 0.6;
    sets[Math.floor(random() * palette.length)].push(new T.Matrix4().compose(new T.Vector3(b.x, b.y + h, b.z), q, new T.Vector3(s, s * 0.7, s)));
  });
  // Small enough that their shadows would not show: the flowers cast none.
  scene.add(stems);
  sets.forEach((list, c) => {
    const heads = new T.InstancedMesh(headGeometry, keep(new T.MeshStandardMaterial({ color: palette[c], roughness: 0.6 })), Math.max(1, list.length));
    list.forEach((matrix, i) => heads.setMatrixAt(i, matrix));
    heads.count = list.length;
    scene.add(heads);
  });
}
