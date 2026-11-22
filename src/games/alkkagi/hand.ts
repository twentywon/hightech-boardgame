import * as T from "three";
import { capable } from "../../engine/scene-utils";

/**
 * The hand that flicks, modelled in code: a right hand, palm down, its index finger hooked against the thumb with
 * the nail toward the stone; let go, the finger snaps straight and the nail strikes. In its own frame the flick goes
 * along +x and the nail touches the stone's back at the origin; the view turns and places it behind a stone.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** Lengths of the finger bones, from the knuckle out, and how thick a finger is. */
const INDEX = [0.62, 0.38, 0.32],
  FINGER = 0.115;
/** The index finger's joints cocked (held by the thumb) and let go (straight out, a little down). */
const COCKED = [-0.62, -1.3, -0.62],
  STRAIGHT = [-0.22, -0.08, -0.04];
export class FlickHand {
  readonly root = new T.Group();
  private hand = new T.Group();
  private index: T.Group[] = [];
  /** Where the nail sits in the hand's frame when cocked: the hand is moved so that this is the origin. */
  private nail = new T.Vector3();
  constructor(own: Own) {
    const skinParams: T.MeshStandardMaterialParameters = { color: "#e3ad8c", roughness: 0.55 },
      skin = own(capable() ? new T.MeshPhysicalMaterial({ ...skinParams, sheen: 0.4, sheenColor: new T.Color("#ffd9c4"), sheenRoughness: 0.6 }) : new T.MeshStandardMaterial(skinParams)),
      nailPaint = own(new T.MeshStandardMaterial({ color: "#f2c9bd", roughness: 0.3 })),
      sleeve = own(new T.MeshStandardMaterial({ color: "#f2ede2", roughness: 0.85 })),
      band = own(new T.MeshStandardMaterial({ color: "#2e4a72", roughness: 0.8 }));
    const part = (geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D) => {
      const mesh = new T.Mesh(own(geometry), material);
      mesh.castShadow = true;
      parent.add(mesh);
      return mesh;
    };
    /** A bone of a finger: a capsule from its joint along +x. */
    const bone = (parent: T.Object3D, length: number, radius: number, angle: number) => {
      const joint = new T.Group();
      joint.rotation.z = angle;
      parent.add(joint);
      const mesh = part(new T.CapsuleGeometry(radius, length, 4, 10), skin, joint);
      mesh.rotation.z = Math.PI / 2;
      mesh.position.x = length / 2;
      const end = new T.Group();
      end.position.x = length;
      joint.add(end);
      return { joint, end };
    };
    // The back of the hand and the palm: a flattened ellipsoid behind the row of knuckles, wider than it is long,
    // with the knuckles standing up along its front.
    const knuckle = new T.Vector3(0, 0, 0);
    const palm = part(new T.SphereGeometry(1, 22, 14), skin, this.hand);
    palm.scale.set(0.56, 0.2, 0.5);
    palm.position.set(-0.5, 0.04, 0.3);
    for (const [z, r] of [[0, 0.13], [0.22, 0.135], [0.43, 0.125], [0.62, 0.11]] as const) {
      const bump = part(new T.SphereGeometry(r, 12, 10), skin, this.hand);
      bump.position.set(-0.06, 0.07, z);
    }
    // The index finger at the hand's left edge (the thumb's side), the others curled into the fist beside it.
    let parent: T.Object3D = this.hand;
    const base = new T.Group();
    base.position.copy(knuckle);
    this.hand.add(base);
    parent = base;
    INDEX.forEach((length, i) => {
      const { joint, end } = bone(parent, length, FINGER * (1 - i * 0.06), COCKED[i]);
      this.index.push(joint);
      parent = end;
    });
    // The nail on the back of the last bone.
    const tip = this.index[2],
      nail = part(new T.SphereGeometry(1, 12, 8), nailPaint, tip);
    nail.scale.set(0.12, 0.03, 0.085);
    nail.position.set(INDEX[2] * 0.62, FINGER * 0.95, 0);
    ([[0.22, 0.56, 0.36, 0.3], [0.43, 0.52, 0.34, 0.28], [0.62, 0.42, 0.28, 0.24]] as const).forEach(([z, a, b, c]) => {
      const root = new T.Group();
      root.position.set(-0.06, 0.02, z);
      this.hand.add(root);
      let p: T.Object3D = root;
      [a, b, c].forEach((length, i) => {
        p = bone(p, length, FINGER * (1.02 - i * 0.08), [-1.45, -1.75, -1.2][i]).end;
      });
    });
    // The thumb: from the heel of the hand forward and in, its pad pressed against the hooked fingertip.
    this.pose(1);
    this.hand.updateMatrixWorld(true);
    const pad = new T.Vector3(INDEX[2] * 0.75, -FINGER * 0.8, 0).applyMatrix4(this.index[2].matrixWorld),
      from = new T.Vector3(-0.62, -0.1, -0.22),
      bend = new T.Vector3().lerpVectors(from, pad, 0.5).add(new T.Vector3(-0.05, -0.12, -0.18));
    for (const [a, b, r] of [[from, bend, FINGER * 1.18], [bend, pad, FINGER * 1.05]] as const) {
      const length = a.distanceTo(b),
        mesh = part(new T.CapsuleGeometry(r, length, 4, 10), skin, this.hand);
      mesh.position.lerpVectors(a, b, 0.5);
      mesh.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), new T.Vector3().subVectors(b, a).normalize());
    }
    // The wrist and forearm going back and up out of sight, in a white sleeve with a blue cuff.
    const arm = new T.Group();
    arm.position.set(-1.05, 0.08, 0.26);
    arm.rotation.z = 0.42;
    this.hand.add(arm);
    const fore = part(new T.CylinderGeometry(0.3, 0.36, 4, 16), skin, arm);
    fore.rotation.z = Math.PI / 2;
    fore.position.x = -2;
    const cuff = part(new T.CylinderGeometry(0.46, 0.5, 0.36, 18), band, arm);
    cuff.rotation.z = Math.PI / 2;
    cuff.position.x = -1.3;
    const cloth = part(new T.CylinderGeometry(0.52, 0.7, 4, 18), sleeve, arm);
    cloth.rotation.z = Math.PI / 2;
    cloth.position.x = -3.45;
    // Where the nail is, cocked: the hand is shifted so that it is the origin.
    this.nail.set(INDEX[2] * 0.62, FINGER * 1.05, 0).applyMatrix4(this.index[2].matrixWorld);
    this.hand.position.copy(this.nail).negate();
    this.root.add(this.hand);
    this.root.visible = false;
  }
  /** Cocks the finger (1) or lets it go straight (0). */
  pose(cocked: number) {
    this.index.forEach((joint, i) => (joint.rotation.z = STRAIGHT[i] + (COCKED[i] - STRAIGHT[i]) * cocked));
  }
  /**
   * Puts the hand behind a stone at (x, y, z), its nail touching the stone's back for a flick along `angle` (0 along
   * +x, a quarter turn along +z), `reach` being the stone's radius; `lift` raises and draws it back (0 in place).
   */
  place(x: number, y: number, z: number, angle: number, reach: number, scale: number, lift = 0) {
    this.root.position.set(x - Math.cos(angle) * (reach + 0.01 + lift * 1.6), y + lift * 2.2, z - Math.sin(angle) * (reach + 0.01 + lift * 1.6));
    this.root.rotation.set(0, -angle, 0);
    this.root.scale.setScalar(scale);
  }
}
