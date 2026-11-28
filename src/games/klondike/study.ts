import * as T from "three";
import { glossy, stuff, weave, wood } from "../../engine/scene-utils";
import type { Own, Setting } from "../patience/view";
import { painted, roundedRect, sequence, solid, standard, turned } from "../patience/props";

/** The felt's half sizes: just clear of the cards. */
const FELT = { x: 6.45, z: 4.25 },
  RAIL = 0.62,
  /** The study's floor, a card table's height below the felt. */
  FLOOR = -11.5;
/**
 * A card table in a quiet study, all modelled and painted in code: green baize inside a padded oxblood leather rail set
 * with brass studs, on a walnut apron; below, a parquet floor with a patterned rug, a leather armchair at the left, a
 * side table with a green-shaded banker's lamp and a cup of tea at the right, and a wall of books beyond. Light comes
 * from a lamp hanging over the table, warm, with the room in a softer dusk. Only the cards and the rail cast shadows:
 * the room lies far below the light's reach, and drawing it into the shadow cost more than it showed.
 */
export function study(): Setting {
  return { clear: "#160f0b", ink: "rgba(236,246,232,0.62)", build };
}
function build(scene: T.Scene, own: Own) {
  scene.add(new T.HemisphereLight("#fff0d8", "#2c1d12", 2.1));
  const lamp = new T.DirectionalLight("#fff1d6", 2.3);
  lamp.position.set(-2.5, 12, 4.5);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  Object.assign(lamp.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 });
  lamp.shadow.normalBias = 0.02;
  own(lamp.shadow);
  scene.add(lamp);
  // The felt and its rail.
  const felt = new T.Mesh(
    own(new T.ShapeGeometry(roundedRect(FELT.x * 2, FELT.z * 2, 0.5), 12)),
    standard(own, { color: "#1d5b40", roughness: 0.96, ...weave(30, 30, own) }),
  );
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  scene.add(felt);
  const ring = roundedRect((FELT.x + RAIL) * 2, (FELT.z + RAIL) * 2, 0.9);
  ring.holes.push(roundedRect(FELT.x * 2 + 0.04, FELT.z * 2 + 0.04, 0.5, new T.Path()));
  const leather = standard(own, { color: "#5c1f19", roughness: 0.48 }),
    rail = new T.Mesh(own(new T.ExtrudeGeometry(ring, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.12, bevelSegments: 5, curveSegments: 18 })), leather);
  rail.rotation.x = -Math.PI / 2;
  rail.position.y = 0.02;
  rail.castShadow = rail.receiveShadow = true;
  scene.add(rail);
  // Brass studs along the inside of the rail.
  const studs: [number, number][] = [],
    inner = { x: FELT.x + 0.2, z: FELT.z + 0.2 };
  for (let x = -inner.x + 0.5; x <= inner.x - 0.5; x += 0.42) studs.push([x, -inner.z], [x, inner.z]);
  for (let z = -inner.z + 0.5; z <= inner.z - 0.5; z += 0.42) studs.push([-inner.x, z], [inner.x, z]);
  const brass = glossy({ color: "#c9a14a", metalness: 0.85, roughness: 0.3 }),
    nails = new T.InstancedMesh(own(new T.SphereGeometry(0.05, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), own(brass), studs.length),
    m = new T.Matrix4();
  studs.forEach(([x, z], i) => nails.setMatrixAt(i, m.makeTranslation(x, 0.17, z)));
  scene.add(nails);
  // The walnut apron under the rail, and the legs down to the floor.
  const walnut = standard(own, { map: own(wood(true)), roughness: 0.5 });
  // Only its sides: its top would lie unseen under the felt and still be drawn.
  const band = roundedRect((FELT.x + RAIL) * 2 + 0.1, (FELT.z + RAIL) * 2 + 0.1, 0.95);
  band.holes.push(roundedRect(FELT.x * 2, FELT.z * 2, 0.5, new T.Path()));
  const apron = new T.Mesh(own(new T.ExtrudeGeometry(band, { depth: 0.9, bevelEnabled: false, curveSegments: 12 })), walnut);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -1;
  scene.add(apron);
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      turned(scene, own, [[0.32, 0], [0.42, 0.6], [0.3, 1.4], [0.36, 6], [0.5, 9.2], [0.55, 10.2], [0.4, 10.6]], [sx * (FELT.x + 0.1), FLOOR, sz * (FELT.z + 0.1)], walnut, 18, false);
  // The floor: parquet, and a rug under the table.
  // Both with a hole where the table stands over them, which no eye above the table could see past.
  const hole = { x: FELT.x + RAIL + 0.4, z: FELT.z + RAIL + 0.4 };
  frame(scene, own, 160, 160, hole, FLOOR, standard(own, { ...stuff("boards", "#6e4a30", 18, own), roughness: 0.6 }));
  frame(scene, own, 34, 24, hole, FLOOR + 0.02, standard(own, { map: rug(own), roughness: 1, ...weave(14, 10, own) }));
  armchair(scene, own);
  sideTable(scene, own);
  books(scene, own);
}
/** A flat sheet `width` by `depth` with a hole in its middle, lying at height `y`; its picture spans the whole sheet. */
function frame(scene: T.Scene, own: Own, width: number, depth: number, hole: { x: number; z: number }, y: number, material: T.Material) {
  const shape = roundedRect(width, depth, 0.01);
  shape.holes.push(roundedRect(hole.x * 2, hole.z * 2, 0.6, new T.Path()));
  const geometry = own(new T.ShapeGeometry(shape, 8)),
    at = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, at.getX(i) / width + 0.5, at.getY(i) / depth + 0.5);
  const mesh = new T.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  mesh.receiveShadow = true;
  scene.add(mesh);
}
/** A rug with a border and a medallion, in deep red, navy and gold. */
function rug(own: Own) {
  return painted(own, 1024, 720, (ctx, w, h) => {
    ctx.fillStyle = "#6d1f1d";
    ctx.fillRect(0, 0, w, h);
    const band = (inset: number, color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.strokeRect(inset, inset, w - inset * 2, h - inset * 2);
    };
    band(30, "#1d2c4f", 46);
    band(64, "#c79a4b", 8);
    band(18, "#c79a4b", 5);
    // A row of small diamonds round the border.
    ctx.fillStyle = "#d8b56a";
    for (let x = 60; x < w - 40; x += 44)
      for (const y of [30, h - 30]) {
        ctx.beginPath();
        ctx.moveTo(x, y - 12);
        ctx.lineTo(x + 10, y);
        ctx.lineTo(x, y + 12);
        ctx.lineTo(x - 10, y);
        ctx.fill();
      }
    ctx.save();
    ctx.translate(w / 2, h / 2);
    for (const [r, color] of [[230, "#1d2c4f"], [190, "#c79a4b"], [170, "#7d2622"], [110, "#1d2c4f"], [60, "#d8b56a"]] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2,
          rr = k % 2 ? r * 0.78 : r;
        ctx.lineTo(Math.cos(a) * rr * 1.3, Math.sin(a) * rr * 0.9);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Wear in the pile.
    const next = sequence(7);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = next() < 0.5 ? "rgba(0,0,0,0.08)" : "rgba(255,230,200,0.06)";
      ctx.fillRect(next() * w, next() * h, 2 + next() * 6, 1);
    }
  });
}
/** A buttoned leather armchair drawn up at the table's left. */
function armchair(scene: T.Scene, own: Own) {
  const chair = new T.Group(),
    hide = standard(own, { color: "#6b3a22", roughness: 0.42 }),
    dark = standard(own, { color: "#3a2416", roughness: 0.6 });
  solid(chair, own, [5.2, 3.2, 5], [0, 1.9, 0], hide, 0.6, false);
  solid(chair, own, [4.6, 1.2, 4.2], [0, 4.0, 0.3], hide, 0.5, false);
  solid(chair, own, [5.2, 5.2, 1.3], [0, 5.4, -2.2], hide, 0.6, false);
  for (const x of [-2.5, 2.5]) solid(chair, own, [1.1, 3.6, 5], [x, 4.6, 0], hide, 0.5, false);
  for (const x of [-2.2, 2.2]) for (const z of [-2.1, 2.1]) solid(chair, own, [0.5, 0.6, 0.5], [x, 0.3, z], dark, 0.1, false);
  chair.position.set(-12.2, FLOOR, 1);
  chair.rotation.y = Math.PI / 2;
  scene.add(chair);
}
/** A round side table at the right with a banker's lamp, its green glass shade lit, and a cup of tea. */
function sideTable(scene: T.Scene, own: Own) {
  const group = new T.Group(),
    walnut = standard(own, { map: own(wood(true)), roughness: 0.45 }),
    brass = own(glossy({ color: "#c9a14a", metalness: 0.85, roughness: 0.3 })),
    shade = own(glossy({ color: "#1f6b45", emissive: "#2f8a55", emissiveIntensity: 0.35, roughness: 0.2 })),
    china = own(glossy({ color: "#f3efe6", roughness: 0.25 }));
  turned(group, own, [[1.6, 0], [1.7, 0.3], [0.3, 0.5], [0.25, 6.8], [2.4, 7], [2.5, 7.3], [0, 7.32]], [0, 0, 0], walnut, 40, false);
  turned(group, own, [[0.9, 0], [0.95, 0.25], [0.2, 0.35], [0.12, 2.6], [0, 2.6]], [-0.6, 7.3, -0.5], brass, 40, false);
  const glass = new T.Mesh(own(new T.CylinderGeometry(0.75, 0.75, 1.9, 24, 1, true, 0, Math.PI)), shade);
  glass.rotation.z = Math.PI / 2;
  glass.position.set(-0.6, 9.9, -0.5);
  group.add(glass);
  // The cup on its saucer, with tea in it.
  turned(group, own, [[0, 0], [0.62, 0.02], [0.68, 0.08], [0.4, 0.06], [0, 0.06]], [0.9, 7.32, 0.9], china, 40, false);
  turned(group, own, [[0, 0], [0.28, 0.02], [0.4, 0.3], [0.44, 0.55], [0.41, 0.55], [0.37, 0.3], [0.24, 0.07], [0, 0.07]], [0.9, 7.39, 0.9], china, 40, false);
  const tea = new T.Mesh(own(new T.CircleGeometry(0.39, 24)), standard(own, { color: "#6b3512", roughness: 0.15 }));
  tea.rotation.x = -Math.PI / 2;
  tea.position.set(0.9, 7.88, 0.9);
  group.add(tea);
  group.position.set(10.2, FLOOR, -1.5);
  scene.add(group);
}
/** A wall of books across the room, behind the table. */
function books(scene: T.Scene, own: Own) {
  const walnut = standard(own, { map: own(wood(true)), roughness: 0.6 }),
    wall = standard(own, { color: "#3b2a20", roughness: 0.9 }),
    z = -13;
  solid(scene, own, [44, 26, 1], [0, FLOOR + 13, z - 1.4], wall, 0.05, false);
  solid(scene, own, [30, 18, 2.6], [0, FLOOR + 9, z], walnut, 0.08, false);
  const colours = ["#6d1f1d", "#1d2c4f", "#2f4a2a", "#7a5a2a", "#3b2a3f", "#8a3b1f", "#20302f", "#c3a46a"],
    next = sequence(23),
    spines: { x: number; y: number; w: number; h: number; c: number }[] = [];
  for (let shelf = 0; shelf < 4; shelf++) {
    const y = FLOOR + 1.6 + shelf * 4.2;
    for (let x = -14; x < 14; ) {
      const w = 0.35 + next() * 0.35,
        h = 2.6 + next() * 1.1;
      spines.push({ x: x + w / 2, y: y + h / 2, w, h, c: Math.floor(next() * colours.length) });
      x += w + 0.03;
    }
  }
  const box = own(new T.BoxGeometry(1, 1, 1)),
    m = new T.Matrix4();
  colours.forEach((colour, c) => {
    const these = spines.filter((s) => s.c === c),
      mesh = new T.InstancedMesh(box, standard(own, { color: colour, roughness: 0.7 }), these.length);
    these.forEach((s, i) => mesh.setMatrixAt(i, m.compose(new T.Vector3(s.x, s.y, z + 1.0), new T.Quaternion(), new T.Vector3(s.w, s.h, 2))));
    scene.add(mesh);
  });
}
