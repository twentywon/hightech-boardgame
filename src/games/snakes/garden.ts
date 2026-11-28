import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Grove } from "../../engine/foliage";
import { block, planks, stuff, wood } from "../../engine/scene-utils";
import { TABLE_Y } from "./layout";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The lawn under the garden table. */
export const GROUND = -4.2,
  /** The lawn's colour, which the view clears to where the lawn itself is left out. */
  LAWN = "#86b45a";
/**
 * A garden of our own round the table the board lies on: a slatted garden table on a lawn, a clipped hedge and two
 * trees behind, flower beds at the sides and a pot of flowers on the table. All in code; leaves are `Grove` cards.
 */
export function garden(scene: T.Scene, own: Own, rich: boolean) {
  const standard = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.85, ...o }));
  // The table: a thick top of planks on four square legs.
  const top = new T.Mesh(own(block(14.6, 0.3, 12.4, 0.08)), standard(planks(1.8, own, 1.55)));
  top.receiveShadow = true;
  top.position.set(-0.3, TABLE_Y - 0.15, 0.5);
  scene.add(top);
  const legWood = standard({ map: own(wood(true, 0.8)), color: "#9a7a5e" });
  const legs = [
    [-6.6, -5.1],
    [6.0, -5.1],
    [-6.6, 6.1],
    [6.0, 6.1],
  ].map(([x, z]) => block(0.5, TABLE_Y - 0.3 - GROUND, 0.5, 0.05).translate(x, (TABLE_Y - 0.3 + GROUND) / 2, z));
  scene.add(new T.Mesh(own(mergeGeometries(legs)), legWood));
  legs.forEach((g) => g.dispose());
  const grove = new Grove(scene, own, { near: 15, centre: [0, -2], shadow: false, bright: 1.45, lift: 1.2 });
  // Where the processor draws alone the garden beyond the table is left out (it cost as much again as the table):
  // the view clears to the lawn's green instead.
  if (rich) lawnAndBeds(scene, own, grove);
  // A pot of flowers on the back corner of the table.
  const pot = new T.Mesh(
    own(
      new T.LatheGeometry(
        [
          [0, 0],
          [0.42, 0],
          [0.55, 0.85],
          [0.62, 0.88],
          [0.64, 1.02],
          [0.5, 1.02],
          [0.48, 0.95],
        ].map(([r, y]) => new T.Vector2(r, y)),
        24,
      ),
    ),
    standard({ color: "#c0673f", roughness: 0.9 }),
  );
  pot.position.set(-6.1, TABLE_Y, -4.55);
  pot.castShadow = true;
  scene.add(pot);
  grove.crown("blossom", [-6.1, TABLE_Y + 1.5, -4.55], [0.75, 0.6, 0.75], "#f3b5c9", 3);
  grove.build();
}
/** The lawn, the hedge, two trees and the flower beds round the table. */
function lawnAndBeds(scene: T.Scene, own: Own, grove: Grove) {
  const standard = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.85, ...o }));
  // The lawn, with a hole where the table hides it, so that nothing is painted twice there.
  const outline = new T.Shape([new T.Vector2(-80, -80), new T.Vector2(80, -80), new T.Vector2(80, 80), new T.Vector2(-80, 80)]),
    // (the shape's y is the table's -z)
    hole = new T.Path([new T.Vector2(-7.3, -5.7), new T.Vector2(-7.3, 5.4), new T.Vector2(6.7, 5.4), new T.Vector2(6.7, -5.7)]);
  outline.holes.push(hole);
  const ground = new T.ShapeGeometry(outline).rotateX(-Math.PI / 2),
    uv = ground.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 160 + 0.5, uv.getY(i) / 160 + 0.5);
  const lawn = new T.Mesh(own(ground), standard({ ...stuff("grass", LAWN, 22, own), roughness: 1 }));
  lawn.position.y = GROUND;
  lawn.receiveShadow = true;
  scene.add(lawn);
  const bed = standard({ ...stuff("earth", "#6b4a33", 4, own, 1), roughness: 1 });
  const hedgeBed = new T.Mesh(own(block(44, 0.3, 2.6, 0.1)), bed);
  hedgeBed.position.set(0, GROUND + 0.1, -11.2);
  scene.add(hedgeBed);
  // A clipped hedge across the back.
  for (let x = -21; x <= 21; x += 2.1) grove.crown("box", [x, GROUND + 1.3, -11.2 + Math.sin(x) * 0.15], [1.35, 1.45, 1.1], x % 4 < 2 ? "#4f8a3c" : "#57924a", x);
  // Two trees behind the hedge.
  const bark = standard({ map: own(wood(true, 0.6)), color: "#7a5a44", roughness: 1 });
  for (const [x, z, s] of [
    [-11, -15, 1.1],
    [10.5, -16, 1.25],
  ]) {
    const trunk = new T.Mesh(own(new T.CylinderGeometry(0.28 * s, 0.42 * s, 6 * s, 10)), bark);
    trunk.position.set(x, GROUND + 3 * s, z);
    scene.add(trunk);
    grove.crown("oak", [x, GROUND + 6.4 * s, z], [3 * s, 2.6 * s, 3 * s], "#5f9445", x);
    grove.crown("oak", [x + 1.6 * s, GROUND + 7.4 * s, z + 0.6], 1.9 * s, "#6a9e4c", x + 1);
  }
  // Flower beds at the sides: low bushes in bloom and clipped balls.
  const blooms = ["#f2a7c3", "#fff3f6", "#f6c86a", "#d9a2f0"];
  for (const side of [-1, 1])
    for (let k = 0; k < 5; k++) {
      const x = side * (11.6 + (k % 2) * 1.3),
        z = -6 + k * 2.6;
      if (k % 2) grove.crown("box", [x, GROUND + 0.75, z], 0.85, "#4c8a3e", k);
      else grove.crown("blossom", [x, GROUND + 0.8, z], [1.1, 0.85, 1.1], blooms[(k + (side > 0 ? 1 : 0)) % blooms.length], k + side);
    }
}
