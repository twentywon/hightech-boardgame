import * as T from "three";
import { block, glossy, planks, wood } from "../../engine/scene-utils";
import { speckled } from "../../engine/scenery";

/**
 * A Korean billiard hall (당구장) of our own round the table, all modelled and painted here: a carpeted floor, a
 * papered wall over a panelled dado, the bead scoreboard on its wires, a rack of house cues with chalk, the counter
 * with its sign, and the long lamp over the table. The table's frame of reference: x across the table (the eye is at
 * +x), z along it, the cloth at y 0.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The floor, the far wall, and the cloth's height above the floor. */
export const FLOOR = -2.75,
  WALL = -5.6;
/** Beads on each wire of the scoreboard, and how far apart they lie. */
export const BEADS = 30;
const PITCH = 0.17,
  WIRE = 7.4;
function paint(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  draw(c.getContext("2d")!);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The wall: cream paper with a faint pattern above, warm wooden panels below. */
function wallpaper() {
  return paint(1024, 512, (ctx) => {
    ctx.fillStyle = "#e9dfc6";
    ctx.fillRect(0, 0, 1024, 512);
    // A quiet diamond pattern in the paper.
    ctx.strokeStyle = "rgba(150, 120, 80, 0.14)";
    ctx.lineWidth = 2;
    for (let x = -512; x < 1024 + 512; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 512, 512);
      ctx.moveTo(x, 512);
      ctx.lineTo(x + 512, 0);
      ctx.stroke();
    }
    for (let i = 0; i < 2400; i++) {
      ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.08)" : "rgba(90,70,40,0.05)";
      ctx.fillRect((i * 397) % 1024, (i * 211) % 512, 2, 2);
    }
  });
}
/** The plaque over the counter, lit from within: our own hall's name. */
function sign() {
  return paint(512, 160, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 160);
    g.addColorStop(0, "#14305c");
    g.addColorStop(1, "#0b1d3a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 160);
    ctx.strokeStyle = "#ffd24a";
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 492, 140);
    ctx.fillStyle = "#fff3c8";
    ctx.font = '900 70px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("큐 당구장", 256, 70);
    ctx.fillStyle = "#ffd24a";
    ctx.font = '700 26px "Inter", Arial, sans-serif';
    ctx.fillText("4구 · 3쿠션 · 연중무휴", 256, 128);
  });
}
/** The small plate on the scoreboard: who each wire counts for. */
function plate(color: string, ring: string) {
  return paint(128, 128, (ctx) => {
    ctx.fillStyle = "#2b1a10";
    ctx.fillRect(0, 0, 128, 128);
    ctx.beginPath();
    ctx.arc(64, 64, 44, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 8;
    ctx.strokeStyle = ring;
    ctx.stroke();
  });
}
/** A wall clock's face. */
function clockFace() {
  return paint(256, 256, (ctx) => {
    ctx.fillStyle = "#fbf8ef";
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#222";
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      ctx.fillRect(128 + Math.sin(a) * 100 - 4, 128 - Math.cos(a) * 100 - 10, 8, 20);
    }
    ctx.strokeStyle = "#222";
    ctx.lineCap = "round";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 + 50, 128 - 30);
    ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(128, 128);
    ctx.lineTo(128 - 18, 128 - 86);
    ctx.stroke();
  });
}
/**
 * The scoreboard on the wall as Korean halls have it: two wires on a dark board, thirty beads on each in groups of
 * five, ivory and red. A point slides a bead from the right-hand heap to the left; a small red tag under each wire
 * marks the target. The upper wire counts for the white ball, the lower for the yellow.
 */
export class BeadBoard {
  readonly group = new T.Group();
  private beads: T.InstancedMesh;
  /** Each bead's place along its wire now and where it is going (0 at the left stop). */
  private at: number[] = [];
  private goal: number[] = [];
  private tags: T.Mesh[] = [];
  private matrix = new T.Matrix4();
  private turn = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2);
  private scale = new T.Vector3(1, 1, 1);
  private spot = new T.Vector3();
  constructor(own: Own) {
    const g = this.group,
      board = new T.Mesh(own(block(0.16, 1.62, 8.2, 0.05)), own(new T.MeshStandardMaterial({ map: own(wood(true)), color: "#6a4632", roughness: 0.55 })));
    board.castShadow = board.receiveShadow = true;
    g.add(board);
    // A paler moulding round it.
    const trim = own(new T.MeshStandardMaterial({ map: own(wood(false)), color: "#d9b07a", roughness: 0.45 }));
    for (const y of [0.83, -0.83]) {
      const bar = new T.Mesh(own(block(0.2, 0.08, 8.36, 0.03)), trim);
      bar.position.set(0.02, y, 0);
      g.add(bar);
    }
    for (const z of [4.14, -4.14]) {
      const bar = new T.Mesh(own(block(0.2, 1.74, 0.08, 0.03)), trim);
      bar.position.set(0.02, 0, z);
      g.add(bar);
    }
    const steel = own(new T.MeshStandardMaterial({ color: "#d6d9de", roughness: 0.25, metalness: 0.9 })),
      wire = own(new T.CylinderGeometry(0.012, 0.012, WIRE + 0.3, 6)),
      peg = own(new T.CylinderGeometry(0.035, 0.035, 0.16, 10)),
      red = own(new T.MeshStandardMaterial({ color: "#c8281e", roughness: 0.5 }));
    for (const [k, y] of [0.33, -0.33].entries()) {
      const line = new T.Mesh(wire, steel);
      line.rotation.x = Math.PI / 2;
      line.position.set(0.2, y, 0);
      g.add(line);
      for (const z of [(WIRE + 0.3) / 2, -(WIRE + 0.3) / 2]) {
        const end = new T.Mesh(peg, steel);
        end.rotation.z = Math.PI / 2;
        end.position.set(0.12, y, z);
        g.add(end);
      }
      // Whose wire: a white or a yellow ball painted on a plate at its left end.
      const badge = new T.Mesh(own(new T.PlaneGeometry(0.34, 0.34)), own(new T.MeshStandardMaterial({ map: own(k === 0 ? plate("#f4f1e6", "#b7b2a2") : plate("#f2c230", "#a77f12")), roughness: 0.6 })));
      badge.rotation.y = Math.PI / 2;
      badge.position.set(0.085, y, WIRE / 2 + 0.24);
      g.add(badge);
      const tag = new T.Mesh(own(new T.ConeGeometry(0.06, 0.13, 3)), red);
      tag.rotation.z = Math.PI;
      tag.position.set(0.16, y - 0.2, 0);
      this.tags.push(tag);
      g.add(tag);
    }
    // A bead: two shallow cones back to back round the wire.
    const profile = [new T.Vector2(0.014, -0.075), new T.Vector2(0.06, -0.07), new T.Vector2(0.115, -0.012), new T.Vector2(0.115, 0.012), new T.Vector2(0.06, 0.07), new T.Vector2(0.014, 0.075)];
    this.beads = new T.InstancedMesh(own(new T.LatheGeometry(profile, 20)), own(glossy({ color: "#ffffff", roughness: 0.3 }, 0.6)), BEADS * 2);
    this.beads.castShadow = true;
    const ivory = new T.Color("#efe4c8"),
      oxblood = new T.Color("#9a2a20");
    for (let i = 0; i < BEADS * 2; i++) {
      this.beads.setColorAt(i, Math.floor((i % BEADS) / 5) % 2 ? oxblood : ivory);
      this.at.push(this.rest(i % BEADS, 0));
      this.goal.push(this.at[i]);
    }
    g.add(this.beads);
    this.lay();
  }
  /** Where bead `k` of a wire rests along it with `score` beads counted. */
  private rest(k: number, score: number) {
    return k < score ? (k + 0.5) * PITCH : WIRE - (BEADS - 1 - k + 0.5) * PITCH;
  }
  private lay() {
    for (let i = 0; i < BEADS * 2; i++) {
      const y = i < BEADS ? 0.33 : -0.33;
      this.spot.set(0.2, y, WIRE / 2 - this.at[i]);
      this.beads.setMatrixAt(i, this.matrix.compose(this.spot, this.turn, this.scale));
    }
    this.beads.instanceMatrix.needsUpdate = true;
  }
  /** Counts the score of both sides on the wires; at once, or by sliding the beads (`tick` moves them). */
  set(score: [number, number], target: number, now = false) {
    for (let i = 0; i < BEADS * 2; i++) this.goal[i] = this.rest(i % BEADS, Math.min(BEADS, score[i < BEADS ? 0 : 1]));
    for (const tag of this.tags) tag.position.z = WIRE / 2 - Math.min(BEADS, target) * PITCH;
    if (now) {
      this.at = [...this.goal];
      this.lay();
    }
  }
  /** Slides the beads a frame's way toward where they belong; true while any still moves. */
  tick(seconds: number) {
    let moved = false;
    for (let i = 0; i < BEADS * 2; i++) {
      const gap = this.goal[i] - this.at[i];
      if (Math.abs(gap) < 1e-4) continue;
      const stepped = Math.sign(gap) * Math.min(Math.abs(gap), seconds * 9);
      this.at[i] += stepped;
      moved = true;
    }
    if (moved) this.lay();
    return moved;
  }
}
/** Builds the hall round the table into `scene`; returns the scoreboard. */
export function hall(scene: T.Object3D, own: Own) {
  const standard = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
  const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, shadow = true) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };
  // Carpet: a deep green with flecks, as halls are laid.
  add(new T.PlaneGeometry(70, 70), standard({ map: own(speckled("#27463f", ["#1d3832", "#335a50", "#3d6a5e", "#203b35"], 41, 22)), roughness: 1 }), 0, FLOOR, 0, false).rotation.x = -Math.PI / 2;
  // The far wall: paper above, panels below a rail.
  const paper = own(wallpaper());
  paper.wrapS = paper.wrapT = T.RepeatWrapping;
  paper.repeat.set(6, 2);
  const high = 12,
    dado = 1.0;
  add(new T.PlaneGeometry(44, high - dado), standard({ map: paper, roughness: 0.95 }), WALL, FLOOR + dado + (high - dado) / 2, 0, false).rotation.y = Math.PI / 2;
  const panels = planks(4, own, 0.6);
  add(new T.PlaneGeometry(44, dado), standard({ ...panels, color: "#c9a27c" }), WALL, FLOOR + dado / 2, 0, false).rotation.y = Math.PI / 2;
  const rail = standard({ map: own(wood(true)), color: "#7a4c30", roughness: 0.5 });
  add(block(0.16, 0.14, 44, 0.04), rail, WALL + 0.08, FLOOR + dado, 0);
  add(block(0.12, 0.24, 44, 0.03), rail, WALL + 0.06, FLOOR + 0.12, 0);
  // The two ends of the hall.
  for (const z of [16, -16]) add(new T.PlaneGeometry(40, high), standard({ map: paper, roughness: 0.95 }), 6, FLOOR + high / 2, z, false).rotation.y = z > 0 ? Math.PI : 0;
  // The scoreboard, over the middle of the table.
  const beads = new BeadBoard(own);
  // Low enough on the wall to be seen over the far rail from where the players stand.
  beads.group.position.set(WALL + 0.1, -0.85, 0);
  scene.add(beads.group);
  // A wall clock beside it.
  const clock = add(new T.CylinderGeometry(0.42, 0.42, 0.08, 32), [standard({ color: "#3a3d42", metalness: 0.4, roughness: 0.4 }), standard({ map: own(clockFace()), roughness: 0.5 }), standard({ color: "#3a3d42" })], WALL + 0.06, -0.6, 5.0);
  clock.rotation.z = -Math.PI / 2;
  // The cue rack at the right: a back board, a bar with holes at the top, a cup rail below, eight house cues.
  const rack = new T.Group();
  rack.position.set(WALL + 0.1, 0, -6.4);
  scene.add(rack);
  const rackWood = standard({ map: own(wood(true)), color: "#8a5a3a", roughness: 0.5 });
  const put = (geometry: T.BufferGeometry, material: T.Material, x: number, y: number, z: number) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    rack.add(mesh);
    return mesh;
  };
  put(block(0.1, 4.2, 2.4, 0.04), rackWood, 0, FLOOR + 2.9, 0);
  put(block(0.42, 0.14, 2.5, 0.04), rackWood, 0.2, FLOOR + 4.6, 0);
  put(block(0.42, 0.22, 2.5, 0.05), rackWood, 0.2, FLOOR + 1.0, 0);
  const shafts = own(new T.CylinderGeometry(0.03, 0.05, 3.7, 10)),
    butts = own(new T.CylinderGeometry(0.05, 0.065, 1.1, 10)),
    tips = own(new T.CylinderGeometry(0.03, 0.03, 0.05, 10)),
    maple = standard({ color: "#e2c48e", roughness: 0.35 }),
    blue = standard({ color: "#3f7fd0" });
  ["#2a1a12", "#6a1f1a", "#1c2a3e", "#2a1a12", "#3a2c16", "#6a1f1a", "#1c2a3e", "#2a1a12"].forEach((color, i) => {
    const z = -1.05 + i * 0.3;
    put(butts, standard({ color, roughness: 0.3 }), 0.24, FLOOR + 1.7, z);
    put(shafts, maple, 0.24, FLOOR + 4.05, z);
    put(tips, blue, 0.24, FLOOR + 5.92, z);
  });
  // Chalk cubes on the rack's cup rail.
  const chalk = standard({ color: "#2f7fc0", roughness: 0.9 });
  for (const z of [-1.0, -0.7, 0.75, 1.05]) put(block(0.13, 0.13, 0.13, 0.02), chalk, 0.3, FLOOR + 1.18, z);
  // The counter at the left, with its lit sign over it, a till and a bell.
  const counterWood = standard({ ...planks(1.2, own, 0.6), color: "#b3825a" }),
    top = standard({ color: "#2b2b2e", roughness: 0.35, metalness: 0.1 });
  add(block(1.6, 2.4, 3.6, 0.05), counterWood, WALL + 1.0, FLOOR + 1.2, 8.4);
  add(block(1.8, 0.12, 3.8, 0.04), top, WALL + 1.0, FLOOR + 2.46, 8.4);
  add(block(0.7, 0.4, 0.8, 0.05), standard({ color: "#3b4048", roughness: 0.4, metalness: 0.3 }), WALL + 0.9, FLOOR + 2.72, 9.2);
  add(block(0.5, 0.1, 0.6, 0.03), standard({ color: "#20242a", roughness: 0.3 }), WALL + 1.2, FLOOR + 2.98, 9.2).rotation.z = 0.3;
  add(new T.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), standard({ color: "#c9a23a", metalness: 0.9, roughness: 0.25 }), WALL + 1.3, FLOOR + 2.52, 7.6);
  // A box of balls for hire on the counter.
  add(block(0.6, 0.18, 0.9, 0.03), standard({ color: "#1f5a8a", roughness: 0.7 }), WALL + 1.2, FLOOR + 2.61, 8.3);
  const shell = own(new T.SphereGeometry(0.12, 16, 12));
  ["#f4f1e6", "#f2c230", "#c8281e", "#c8281e"].forEach((color, i) => add(shell, own(glossy({ color, roughness: 0.2 })), WALL + 1.08 + (i % 2) * 0.24, FLOOR + 2.76, 8.06 + Math.floor(i / 2) * 0.28 + (i % 2) * 0.1));
  const board = add(new T.PlaneGeometry(3.4, 1.06), own(new T.MeshBasicMaterial({ map: own(sign()) })), WALL + 0.06, 0.45, 8.4, false);
  board.rotation.y = Math.PI / 2;
  // The lamp over the table: a long box with tubes behind a diffuser, on two rods from the ceiling.
  const lamp = new T.Group();
  lamp.position.set(-0.7, 6.4, 0);
  scene.add(lamp);
  const frame = own(new T.MeshStandardMaterial({ color: "#1f4a3a", roughness: 0.45, metalness: 0.35 })),
    glow = own(new T.MeshBasicMaterial({ color: "#fffaf0" }));
  const shade = new T.Mesh(own(block(1.6, 0.34, 7.2, 0.06)), frame);
  shade.castShadow = false;
  lamp.add(shade);
  const diffuser = new T.Mesh(own(new T.PlaneGeometry(1.44, 7.0)), glow);
  diffuser.rotation.x = Math.PI / 2;
  diffuser.position.y = -0.172;
  lamp.add(diffuser);
  for (const z of [2.8, -2.8]) {
    const rod = new T.Mesh(own(new T.CylinderGeometry(0.03, 0.03, 8, 6)), frame);
    rod.position.set(0, 4.15, z);
    lamp.add(rod);
  }
  return beads;
}
