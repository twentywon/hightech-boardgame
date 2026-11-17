import * as T from "three";
import { glossy, planks, wood } from "../../engine/scene-utils";
import type { Own, Setting } from "../patience/view";
import { lay, painted, solid, standard, turned } from "../patience/props";

/** The wall with the window, at the desk's left. */
const WALL = -10.6,
  /** The window's opening on that wall: from the desk up, and along it. */
  OPEN = { bottom: 0.6, top: 22, near: 6.5, far: -6.5 };
/**
 * A wooden desk by a window, all modelled and painted in code: the cards lie on the bare desk top, the window in the
 * wall at the left lets in a low sun whose light falls across the desk in a broad patch crossed by the shadows of
 * the glazing bars; on the sill a potted plant, and on the desk at the right a mug of coffee, a notebook and a pencil.
 */
export function desk(): Setting {
  return { clear: "#2a2420", ink: "rgba(255,244,222,0.7)", build };
}
function build(scene: T.Scene, own: Own) {
  scene.add(new T.HemisphereLight("#eef3ff", "#4d3a28", 2.3));
  // The sun, low over the window sill, so that the bars' shadows lie long across the desk.
  const sun = new T.DirectionalLight("#fff0d2", 2.6),
    toward = new T.Vector3(1, -0.62, 0.3).normalize();
  sun.position.copy(toward.clone().multiplyScalar(-34));
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 4, far: 70 });
  sun.shadow.normalBias = 0.03;
  own(sun.shadow);
  scene.add(sun, sun.target);
  // The desk top, of a warm wood with its grain running across.
  lay(scene, own, 40, 24, [0, 0, 0], standard(own, { ...planks(4.2, own, 2.6) }));
  window_(scene, own);
  things(scene, own);
}
/** The wall at the left with its window: the opening, its frame and glazing bars, the sill and a plant on it. */
function window_(scene: T.Scene, own: Own) {
  const plaster = standard(own, { color: "#d6c8b0", roughness: 0.9 }),
    // A frame and sill of stained wood: white ones, at the edge of a phone's view, took the white lettering's ground.
    paint = standard(own, { map: own(wood(false)), color: "#a8744a", roughness: 0.45 }),
    thick = 0.8,
    x = WALL - thick / 2,
    height = 46,
    length = 60,
    mid = (OPEN.near + OPEN.far) / 2,
    span = OPEN.near - OPEN.far;
  // The wall round the opening: below, above, and to either side.
  // The sun's patch through the opening covers the whole desk in view, so the wall itself need cast no shadow (drawing
  // it into the sun's shadow cost more than anything else on the table).
  solid(scene, own, [thick, OPEN.bottom + 2, length], [x, OPEN.bottom / 2 - 1, 0], plaster, 0.02, false);
  solid(scene, own, [thick, height - OPEN.top, length], [x, (OPEN.top + height) / 2, 0], plaster, 0.02, false);
  solid(scene, own, [thick, OPEN.top - OPEN.bottom, length / 2 - OPEN.near], [x, (OPEN.top + OPEN.bottom) / 2, (OPEN.near + length / 2) / 2], plaster, 0.02, false);
  solid(scene, own, [thick, OPEN.top - OPEN.bottom, length / 2 + OPEN.far], [x, (OPEN.top + OPEN.bottom) / 2, (OPEN.far - length / 2) / 2], plaster, 0.02, false);
  // The frame and its bars: two upright, two across; their shadows are what lies on the desk.
  const bar = 0.32,
    frame = new T.Group();
  for (const z of [OPEN.far + 0.2, OPEN.near - 0.2, mid - span / 6, mid + span / 6]) solid(frame, own, [0.3, OPEN.top - OPEN.bottom, z === OPEN.far + 0.2 || z === OPEN.near - 0.2 ? 0.4 : bar], [x, (OPEN.top + OPEN.bottom) / 2, z], paint, 0.04);
  for (const y of [OPEN.bottom + 0.2, OPEN.top - 0.2, 5.2, 11.5]) solid(frame, own, [0.3, y === 5.2 || y === 11.5 ? bar : 0.4, span], [x, y, mid], paint, 0.04);
  scene.add(frame);
  // The sill, standing out from the wall over the desk, and a plant in a pot on it.
  solid(scene, own, [1.5, 0.3, span + 1.2], [WALL + 0.55, OPEN.bottom - 0.05, mid], paint, 0.08);
  const pot = own(glossy({ color: "#c0603a", roughness: 0.55 }));
  turned(scene, own, [[0, 0], [0.55, 0], [0.75, 1.1], [0.8, 1.2], [0.7, 1.22], [0, 1.15]], [WALL + 0.6, OPEN.bottom + 0.1, mid + 3.4], pot, 28);
  const leaf = standard(own, { color: "#4d7a3a", roughness: 0.6, side: T.DoubleSide });
  for (let k = 0; k < 9; k++) {
    const blade = new T.Mesh(own(new T.SphereGeometry(0.5, 10, 6)), leaf),
      a = (k / 9) * Math.PI * 2;
    blade.scale.set(0.35, 1.3, 0.16);
    blade.position.set(WALL + 0.6 + Math.cos(a) * 0.35, OPEN.bottom + 1.9 + (k % 3) * 0.2, mid + 3.4 + Math.sin(a) * 0.35);
    blade.rotation.set(Math.sin(a) * 0.5, -a, Math.cos(a) * -0.5);
    blade.castShadow = true;
    scene.add(blade);
  }
}
/** A mug of coffee, a notebook and a pencil at the desk's right, clear of the cards. */
function things(scene: T.Scene, own: Own) {
  const china = own(glossy({ color: "#2f4f6e", roughness: 0.3 }));
  turned(scene, own, [[0, 0], [0.62, 0], [0.66, 0.08], [0.66, 1.5], [0.6, 1.52], [0.58, 0.14], [0, 0.14]], [8.7, 0, 1.6], china, 32);
  const coffee = new T.Mesh(own(new T.CircleGeometry(0.57, 28)), standard(own, { color: "#3b2414", roughness: 0.15 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.set(8.7, 1.28, 1.6);
  scene.add(coffee);
  const handle = new T.Mesh(own(new T.TorusGeometry(0.36, 0.09, 10, 20, Math.PI)), china);
  handle.position.set(9.36, 0.78, 1.6);
  handle.rotation.z = -Math.PI / 2;
  handle.castShadow = true;
  scene.add(handle);
  // The notebook: a dark cover, cream pages at its edge, an elastic band.
  const cover = standard(own, { color: "#7a2e24", roughness: 0.7 }),
    pages = standard(own, { color: "#f2ead8", roughness: 0.9 });
  const book = new T.Group();
  solid(book, own, [2.4, 0.3, 3.4], [0, 0.15, 0], pages, 0.05);
  solid(book, own, [2.5, 0.06, 3.5], [0, 0.32, 0], cover, 0.03);
  solid(book, own, [2.5, 0.06, 3.5], [0, 0.0, 0], cover, 0.03, false);
  solid(book, own, [0.08, 0.38, 3.52], [0.95, 0.18, 0], standard(own, { color: "#1f1f22" }), 0.02, false);
  book.position.set(9.1, 0, -2.4);
  book.rotation.y = 0.22;
  scene.add(book);
  // A pencil, yellow with a pink rubber and a sharpened tip.
  const pencil = new T.Group(),
    yellow = standard(own, { color: "#e8b828", roughness: 0.5 }),
    lead = standard(own, { color: "#e9cfa4", roughness: 0.8, map: own(wood(false)) });
  const body = new T.Mesh(own(new T.CylinderGeometry(0.09, 0.09, 3.2, 6)), yellow);
  body.rotation.z = Math.PI / 2;
  const tip = new T.Mesh(own(new T.ConeGeometry(0.09, 0.4, 6)), lead);
  tip.rotation.z = -Math.PI / 2;
  tip.position.x = 1.8;
  const rubber = new T.Mesh(own(new T.CylinderGeometry(0.09, 0.09, 0.3, 12)), standard(own, { color: "#e58c9b" }));
  rubber.rotation.z = Math.PI / 2;
  rubber.position.x = -1.75;
  for (const part of [body, tip, rubber]) {
    part.castShadow = true;
    pencil.add(part);
  }
  pencil.position.set(8.3, 0.1, -0.2);
  pencil.rotation.y = 1.1;
  scene.add(pencil);
  // A ring left by a cup on the wood, long ago.
  const stain = painted(own, 128, 128, (ctx) => {
    ctx.strokeStyle = "rgba(70,40,20,0.25)";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0.3, Math.PI * 1.85);
    ctx.stroke();
  });
  lay(scene, own, 1.4, 1.4, [8.0, 0.003, 3.4], own(new T.MeshBasicMaterial({ map: stain, transparent: true, depthWrite: false })));
}
