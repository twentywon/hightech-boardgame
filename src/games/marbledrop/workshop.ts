import * as T from "three";
import { block, glossy, planks, stuff, wood } from "../../engine/scene-utils";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A thing of the workshop and where it lies, as a function of the board's half width and the tray's far edge. */
/** The edges of what stands on the bench (the board and the tray): its least and greatest x, and its far and near z. */
export interface Bounds {
  left: number;
  right: number;
  back: number;
  front: number;
}
export interface Prop {
  thing: T.Object3D;
  at: (b: Bounds) => [number, number];
}
/**
 * A toymaker's workshop round the board, all modelled in code: a workbench of planks, and lying on it clear of the
 * board, the tray and the camera's view of them, a hand plane, a mallet, a carpenter's square and
 * a pencil, and a few wooden toys (a stack of painted blocks, a spinning top, a little car, a pull-along duck).
 * Behind the bench a wall of boards with a rack of chisels. `place` lays the props for a board of that size.
 */
export function workshop(scene: T.Object3D, own: Own) {
  const props: Prop[] = [],
    mesh = (geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) => {
      const m = new T.Mesh(own(geometry), material);
      m.position.set(x, y, z);
      m.castShadow = m.receiveShadow = true;
      parent.add(m);
      return m;
    },
    paint = (color: string, roughness = 0.5) => own(new T.MeshStandardMaterial({ color, roughness })),
    lacquer = (color: string) => own(glossy({ color, roughness: 0.35 })),
    beech = own(new T.MeshStandardMaterial({ map: own(wood(false)), color: "#f1d3a6", roughness: 0.6 })),
    walnut = own(new T.MeshStandardMaterial({ map: own(wood(true)), color: "#a8785a", roughness: 0.6 })),
    steel = own(new T.MeshStandardMaterial({ color: "#9aa3aa", metalness: 0.7, roughness: 0.35 })),
    dark = paint("#2a2a2e", 0.6);
  const add = (thing: T.Object3D, at: Prop["at"]) => {
    scene.add(thing);
    props.push({ thing, at });
  };
  // The bench: thick planks running across, and a wall of boards behind it.
  const bench = mesh(new T.BoxGeometry(40, 0.6, 24), own(new T.MeshStandardMaterial({ ...planks(5, own), color: "#c99a6a" })), scene, 0, -0.3, 0);
  bench.castShadow = false;
  const wall = mesh(new T.PlaneGeometry(40, 9), own(new T.MeshStandardMaterial({ ...stuff("boards", "#7d5a40", 6, own, 1.4), roughness: 0.9 })), scene, 0, 4.2, -9);
  wall.castShadow = false;
  // A rack of chisels on the wall, handles down.
  const rack = new T.Group();
  mesh(block(3.2, 0.16, 0.22, 0.04), walnut, rack, 0, 0, 0);
  for (let k = 0; k < 6; k++) {
    const x = -1.25 + k * 0.5;
    mesh(new T.CylinderGeometry(0.06, 0.075, 0.5, 14), beech, rack, x, -0.36, 0.05);
    mesh(block(0.09, 0.42, 0.02, 0.008), steel, rack, x, 0.14, 0.05);
  }
  rack.position.set(-1.5, 1.6, -8.85);
  scene.add(rack);
  // A hand plane lying on its side's flat, a shaving or two curling from it.
  const plane = new T.Group();
  mesh(block(0.95, 0.2, 0.3, 0.05), walnut, plane, 0, 0.1, 0);
  mesh(block(0.62, 0.035, 0.24, 0.012), steel, plane, 0.05, 0.215, 0);
  mesh(new T.SphereGeometry(0.075, 18, 12), beech, plane, -0.33, 0.28, 0);
  const tote = mesh(new T.TorusGeometry(0.1, 0.035, 10, 20, Math.PI * 1.2), beech, plane, 0.28, 0.27, 0);
  tote.rotation.z = -0.2;
  const blade = mesh(block(0.05, 0.3, 0.2, 0.01), steel, plane, 0.02, 0.27, 0);
  blade.rotation.z = 0.7;
  add(plane, (b) => [b.left - 1.0, b.front - 0.65]);
  plane.rotation.y = 0.5;
  // A wooden mallet.
  const mallet = new T.Group(),
    head = mesh(new T.CylinderGeometry(0.15, 0.15, 0.42, 22), beech, mallet, 0, 0.15, 0);
  head.rotation.x = Math.PI / 2;
  const handle = mesh(new T.CylinderGeometry(0.035, 0.04, 0.8, 12), walnut, mallet, 0.42, 0.06, 0);
  handle.rotation.z = Math.PI / 2;
  mallet.rotation.y = -0.6;
  add(mallet, (b) => [b.right + 1.15, b.front - 0.55]);
  // A carpenter's square and a pencil before the board's left.
  const square = new T.Group();
  mesh(block(1.1, 0.02, 0.09, 0.006), steel, square, 0, 0.01, 0);
  mesh(block(0.09, 0.02, 0.7, 0.006), steel, square, -0.505, 0.01, -0.305);
  square.rotation.y = 0.25;
  add(square, (b) => [b.left - 0.85, b.front + 0.4]);
  const pencil = new T.Group(),
    body = mesh(new T.CylinderGeometry(0.03, 0.03, 0.6, 6), lacquer("#f2b52b"), pencil, 0, 0.03, 0);
  body.rotation.z = Math.PI / 2;
  const tip = mesh(new T.ConeGeometry(0.03, 0.09, 6), beech, pencil, -0.345, 0.03, 0);
  tip.rotation.z = Math.PI / 2;
  pencil.rotation.y = -0.4;
  add(pencil, (b) => [b.right + 0.6, b.front + 0.4]);
  // A stack of painted blocks.
  const stack = new T.Group();
  [
    ["#f2c230", 0.42, 0, 0],
    ["#3b6fd8", 0.36, 0.06, 0.5],
    ["#4caf5a", 0.3, -0.03, 1.1],
  ].reduce((y, [color, size, x, turn]) => {
    const s = size as number,
      cube = mesh(block(s, s, s, 0.04), lacquer(color as string), stack, x as number, y + s / 2, 0);
    cube.rotation.y = turn as number;
    return y + s;
  }, 0);
  add(stack, (b) => [b.left - 0.85, b.back + 0.6]);
  // A spinning top lying a little tilted.
  const top = new T.Group(),
    profile = [
      [0, 0],
      [0.05, 0.03],
      [0.2, 0.17],
      [0.24, 0.24],
      [0.2, 0.3],
      [0.06, 0.33],
      [0.035, 0.36],
      [0.035, 0.5],
      [0, 0.52],
    ].map(([r, y]) => new T.Vector2(r, y)),
    spin = mesh(new T.LatheGeometry(profile, 28), beech, top, 0, 0, 0);
  spin.add(mesh(new T.CylinderGeometry(0.242, 0.242, 0.04, 28), lacquer("#3b86d8"), top, 0, 0.24, 0));
  top.rotation.z = 0.12;
  add(top, (b) => [b.right + 0.85, b.back + 0.5]);
  // A little car: a body, a cab and four wheels.
  const car = new T.Group();
  mesh(block(0.62, 0.16, 0.32, 0.05), lacquer("#2f9f8f"), car, 0, 0.15, 0);
  mesh(block(0.3, 0.14, 0.28, 0.05), beech, car, -0.06, 0.29, 0);
  for (const [x, z] of [
    [-0.2, 0.17],
    [0.2, 0.17],
    [-0.2, -0.17],
    [0.2, -0.17],
  ]) {
    const wheel = mesh(new T.CylinderGeometry(0.08, 0.08, 0.05, 18), dark, car, x, 0.08, z);
    wheel.rotation.x = Math.PI / 2;
  }
  car.rotation.y = 0.7;
  add(car, (b) => [b.right + 0.95, (b.front + b.back) / 2 - 0.2]);
  // A pull-along duck on wheels, with its string.
  const duck = new T.Group();
  mesh(new T.SphereGeometry(0.17, 20, 14), lacquer("#f2c230"), duck, 0, 0.24, 0).scale.set(1.25, 0.85, 0.9);
  mesh(new T.SphereGeometry(0.1, 18, 12), lacquer("#f2c230"), duck, 0.17, 0.4, 0);
  const beak = mesh(new T.ConeGeometry(0.035, 0.09, 10), lacquer("#ee8a2a"), duck, 0.29, 0.39, 0);
  beak.rotation.z = -Math.PI / 2;
  mesh(block(0.42, 0.04, 0.22, 0.015), beech, duck, 0, 0.08, 0);
  for (const x of [-0.13, 0.13])
    for (const z of [-0.12, 0.12]) {
      const wheel = mesh(new T.CylinderGeometry(0.05, 0.05, 0.03, 14), walnut, duck, x, 0.05, z);
      wheel.rotation.x = Math.PI / 2;
    }
  duck.rotation.y = 2.4;
  add(duck, (b) => [b.left - 0.5, b.back - 0.4]);
  return {
    props,
    /** Lays the props round the board and the tray. */
    place(bounds: Bounds) {
      for (const prop of props) {
        const [x, z] = prop.at(bounds);
        prop.thing.position.x = x;
        prop.thing.position.z = z;
      }
    },
  };
}
