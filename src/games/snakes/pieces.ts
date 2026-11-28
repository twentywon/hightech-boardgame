import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, glossy, wood } from "../../engine/scene-utils";
import { FLAT, LADDER_HALF, LADDER_TOP, RUNG, radiusAt, type LadderLine, type SnakePoint } from "./layout";

type Own = <R extends { dispose(): void }>(resource: R) => R;

/** Our own snakes' colours: body, markings, belly. */
export const SNAKE_PAINTS: [string, string, string][] = [
  ["#4f9a3c", "#f2c94c", "#efe6ad"],
  ["#7b4fb5", "#f39a3d", "#eadcf6"],
  ["#d6523a", "#fff0c8", "#f7d9b6"],
  ["#2f9d96", "#1d4f5c", "#d2efe7"],
  ["#e8892f", "#3a2a22", "#f8dcb0"],
  ["#3a6fd1", "#f4f4f4", "#d3e2f8"],
  ["#d9b52a", "#2f7a3a", "#f6eebc"],
];
/**
 * The skin of a snake, `u` along its length (one picture every `SKIN` units) and `v` round it (0.25 on its back,
 * 0.75 under its belly): the body colour, a pattern down its back, a pale belly with its broad scales and a net of
 * small scales over all. With `relief` it is the matching height picture for a bump map instead.
 */
export const SKIN = 0.62;
function skin(paint: [string, string, string], kind: number, relief: boolean) {
  const W = 256,
    H = 128,
    c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const ctx = c.getContext("2d")!,
    [body, mark, belly] = paint,
    // The picture is turned over onto the body (flipY): its lower part is the back.
    back = H * 0.75,
    under = H * 0.25;
  ctx.fillStyle = relief ? "#808080" : body;
  ctx.fillRect(0, 0, W, H);
  if (!relief) {
    // The back darker, the flanks lighter, as a rounded body is coloured.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(255,255,255,0.12)");
    g.addColorStop(0.25, "rgba(0,0,0,0.12)");
    g.addColorStop(0.5, "rgba(255,255,255,0.1)");
    g.addColorStop(1, "rgba(255,255,255,0.12)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // The markings down the back, wrapping at the ends of the picture.
    ctx.fillStyle = mark;
    for (const shift of [-W, 0, W]) {
      ctx.save();
      ctx.translate(shift, 0);
      if (kind % 3 === 0) {
        // Diamonds.
        for (let x = 0; x < W; x += W / 2) {
          ctx.beginPath();
          ctx.moveTo(x, back);
          ctx.lineTo(x + W / 4, back - H * 0.17);
          ctx.lineTo(x + W / 2, back);
          ctx.lineTo(x + W / 4, back + H * 0.17);
          ctx.closePath();
          ctx.fill();
        }
      } else if (kind % 3 === 1) {
        // Bands round the body.
        for (let x = W / 8; x < W; x += W / 2) {
          ctx.beginPath();
          ctx.ellipse(x + W / 8, back, W / 10, H * 0.24, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        // Spots in pairs.
        for (let x = W / 8; x < W; x += W / 4) {
          for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(x + side * 10, back + side * H * 0.1, W / 22, H * 0.07, 0, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
    // The belly.
    ctx.fillStyle = belly;
    ctx.fillRect(0, under - H * 0.16, W, H * 0.32);
  }
  // Broad scales across the belly.
  ctx.strokeStyle = relief ? "#3a3a3a" : "rgba(60,40,20,0.28)";
  ctx.lineWidth = 2;
  for (let x = 0; x < W; x += W / 16) {
    ctx.beginPath();
    ctx.moveTo(x, under - H * 0.16);
    ctx.quadraticCurveTo(x + 5, under, x, under + H * 0.16);
    ctx.stroke();
  }
  // A net of small overlapping scales over the back and flanks.
  ctx.strokeStyle = relief ? "#2a2a2a" : "rgba(0,0,0,0.2)";
  ctx.lineWidth = relief ? 2.2 : 1.3;
  const step = W / 32;
  for (let row = 0; row * (step * 0.62) < H * 0.6; row++) {
    const y = (under + H * 0.16 + row * step * 0.62) % H;
    for (let x = (row % 2) * (step / 2) - step; x < W + step; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, step * 0.55, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
  }
  if (relief) {
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let x = 0; x < W; x += step) for (let y = 0; y < H; y += step * 0.62) ctx.fillRect(x + step * 0.3, y + step * 0.15, step * 0.4, step * 0.25);
  }
  const t = new T.CanvasTexture(c);
  if (!relief) t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/**
 * A snake modelled lying over the board: a tapering body along its middle line (rebuilt as the head and tail sway),
 * a head with eyes, a jaw that opens and a forked tongue that flicks.
 */
export class SnakeModel {
  readonly group = new T.Group();
  readonly head = new T.Group();
  private skull = new T.Group();
  private jaw = new T.Group();
  private tongue = new T.Group();
  private roof: T.Mesh;
  private inner: T.Mesh;
  /** The body colour, for its skull and jaw in `Heads`. */
  readonly paint: string;
  /** Where the shared head parts go, in the head's frame. */
  readonly parts = { skull: new T.Object3D(), jaw: new T.Object3D(), eyes: [] as T.Object3D[], pupils: [] as T.Object3D[] };
  private body: T.Mesh;
  private base: SnakePoint[];
  /** The middle line as it lies now (swaying), in table coordinates, and how far along it each point is. */
  readonly line: T.Vector3[];
  private sides: { x: number; z: number }[];
  private along: number[];
  readonly length: number;
  private turn: number;
  open = 0;
  flick = 0;
  private radial: number;
  constructor(
    points: SnakePoint[],
    readonly index: number,
    own: Own,
    rich: boolean,
  ) {
    // Fewer sides round the body where the processor draws alone.
    const RADIAL = (this.radial = rich ? 14 : 9);
    this.base = points;
    this.line = points.map((p) => new T.Vector3(p.x, radiusAt(p.t) * FLAT + p.lift, p.z));
    this.sides = points.map((_, i) => {
      const a = points[Math.max(0, i - 1)],
        b = points[Math.min(points.length - 1, i + 1)],
        dx = b.x - a.x,
        dz = b.z - a.z,
        l = Math.hypot(dx, dz) || 1;
      return { x: -dz / l, z: dx / l };
    });
    this.along = [0];
    for (let i = 1; i < points.length; i++) this.along.push(this.along[i - 1] + Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z));
    this.length = this.along[this.along.length - 1];
    const paint = SNAKE_PAINTS[index % SNAKE_PAINTS.length],
      map = own(skin(paint, index, false)),
      options: T.MeshStandardMaterialParameters = { map, roughness: 0.42 };
    this.paint = paint[0];
    if (rich) Object.assign(options, { bumpMap: own(skin(paint, index, true)), bumpScale: 1.4 });
    const material = own(glossy(options, 0.6));
    // The body: rings round the middle line, the picture laid along its length.
    const rings = points.length,
      geometry = new T.BufferGeometry(),
      uv = new Float32Array(rings * (RADIAL + 1) * 2),
      index3: number[] = [];
    for (let i = 0; i < rings; i++)
      for (let j = 0; j <= RADIAL; j++) {
        uv[(i * (RADIAL + 1) + j) * 2] = this.along[i] / SKIN;
        uv[(i * (RADIAL + 1) + j) * 2 + 1] = j / RADIAL;
      }
    for (let i = 0; i < rings - 1; i++)
      for (let j = 0; j < RADIAL; j++) {
        const a = i * (RADIAL + 1) + j,
          b = a + RADIAL + 1;
        index3.push(a, a + 1, b, b, a + 1, b + 1);
      }
    geometry.setIndex(index3);
    geometry.setAttribute("position", new T.BufferAttribute(new Float32Array(rings * (RADIAL + 1) * 3), 3));
    geometry.setAttribute("normal", new T.BufferAttribute(new Float32Array(rings * (RADIAL + 1) * 3), 3));
    geometry.setAttribute("uv", new T.BufferAttribute(uv, 2));
    this.body = new T.Mesh(own(geometry), material);
    this.body.castShadow = this.body.receiveShadow = true;
    this.group.add(this.body);
    this.rebuild();
    geometry.computeBoundingSphere();
    // The head: a skull wider behind than at the snout, a jaw hinged at the back, eyes and a tongue. Skulls, jaws,
    // eyes and pupils are drawn for all snakes at once (`Heads`); here they are places in the head's own frame.
    const mouth = own(new T.MeshStandardMaterial({ color: "#b8424f", roughness: 0.6 })),
      inside = own(new T.SphereGeometry(1, 14, 8));
        this.parts.skull.scale.set(0.135, 0.068, 0.19);
    this.parts.skull.position.set(0, 0, 0.1);
    this.roof = new T.Mesh(inside, mouth);
    this.roof.scale.set(0.11, 0.012, 0.16);
    this.roof.position.set(0, -0.045, 0.11);
    this.skull.add(this.parts.skull, this.roof);
    for (const side of [-1, 1]) {
      const eye = new T.Object3D(),
        pupil = new T.Object3D();
      eye.position.set(side * 0.078, 0.042, 0.13);
      // A slit pupil looking out from the side of the eye, a little up and forward.
      pupil.scale.set(0.6, 1, 0.6);
      pupil.position.set(side * 0.099, 0.052, 0.146);
      this.parts.eyes.push(eye);
      this.parts.pupils.push(pupil);
      this.skull.add(eye, pupil);
    }
    this.skull.position.set(0, 0.075, -0.06);
    this.parts.jaw.scale.set(0.115, 0.032, 0.17);
    this.parts.jaw.position.set(0, -0.012, 0.15);
    this.inner = new T.Mesh(inside, mouth);
    this.inner.scale.set(0.075, 0.01, 0.12);
    this.inner.position.set(0, 0.018, 0.15);
    this.jaw.add(this.parts.jaw, this.inner);
    this.jaw.position.set(0, 0.045, -0.06);
    // The forked tongue, flicked out from the tip of the mouth.
    const red = own(new T.MeshStandardMaterial({ color: "#d1283e", roughness: 0.5 })),
      stem = new T.Mesh(own(new T.BoxGeometry(0.014, 0.006, 0.12).translate(0, 0, 0.06)), red);
    this.tongue.add(stem);
    for (const side of [-1, 1]) {
      const fork = new T.Mesh(own(new T.BoxGeometry(0.01, 0.005, 0.06).translate(0, 0, 0.03)), red);
      fork.position.set(0, 0, 0.115);
      fork.rotation.y = side * 0.45;
      this.tongue.add(fork);
    }
    this.tongue.position.set(0, 0.05, 0.22);
    this.tongue.visible = false;
    this.head.add(this.skull, this.jaw, this.tongue);
    this.head.scale.setScalar(1.25);
    const p0 = points[0],
      p1 = points[3];
    this.turn = Math.atan2(p0.x - p1.x, p0.z - p1.z);
    this.head.position.set(p0.x, 0, p0.z);
    this.head.rotation.y = this.turn;
    this.group.add(this.head);
  }
  /** Lays the body round the middle line as it is now. */
  private rebuild() {
    const RADIAL = this.radial;
    const position = this.body.geometry.getAttribute("position") as T.BufferAttribute,
      normal = this.body.geometry.getAttribute("normal") as T.BufferAttribute,
      n = this.line.length,
      tangent = new T.Vector3(),
      side = new T.Vector3(),
      up = new T.Vector3(),
      Y = new T.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const c = this.line[i],
        r = radiusAt(this.base[i].t);
      tangent.subVectors(this.line[Math.min(n - 1, i + 1)], this.line[Math.max(0, i - 1)]).normalize();
      side.crossVectors(Y, tangent).normalize();
      up.crossVectors(tangent, side).normalize();
      for (let j = 0; j <= RADIAL; j++) {
        const a = (j / RADIAL) * Math.PI * 2,
          cos = Math.cos(a),
          sin = Math.sin(a),
          k = i * (RADIAL + 1) + j;
        position.setXYZ(k, c.x + side.x * cos * r + up.x * sin * r * FLAT, c.y + side.y * cos * r + up.y * sin * r * FLAT, c.z + side.z * cos * r + up.z * sin * r * FLAT);
        const nx = side.x * cos * FLAT + up.x * sin,
          ny = side.y * cos * FLAT + up.y * sin,
          nz = side.z * cos * FLAT + up.z * sin,
          l = Math.hypot(nx, ny, nz) || 1;
        normal.setXYZ(k, nx / l, ny / l, nz / l);
      }
    }
    position.needsUpdate = normal.needsUpdate = true;
  }
  /** Sways the head and the tail a little (`time` in seconds), opens the jaw by `open` and shows the tongue by `flick`. */
  pose(time: number, sway: boolean) {
    const phase = this.index * 1.7;
    if (sway) {
      for (let i = 0; i < this.base.length; i++) {
        const t = this.base[i].t,
          weight = Math.pow(Math.max(0, 1 - t / 0.3), 1.5) + Math.pow(Math.max(0, (t - 0.72) / 0.28), 1.5) * 0.8,
          offset = weight * 0.05 * Math.sin(time * 1.5 + phase - t * 10);
        this.line[i].x = this.base[i].x + this.sides[i].x * offset;
        this.line[i].z = this.base[i].z + this.sides[i].z * offset;
      }
      this.rebuild();
    }
    const lead = this.line[0];
    this.head.position.set(lead.x, 0, lead.z);
    this.head.rotation.y = this.turn + (sway ? 0.12 * Math.sin(time * 1.1 + phase) : 0);
    // The snout rises a little as the mouth opens.
    this.skull.rotation.x = -this.open * 0.38;
    this.jaw.rotation.x = this.open * 0.42;
    this.head.position.y = this.open * 0.03;
    // The tongue darts out and back; idly every few seconds where the table lives.
    const idle = sway ? Math.max(0, Math.sin(((time + phase) % 4.2) * 7.5)) * ((time + phase) % 4.2 < 0.42 ? 1 : 0) : 0,
      out = Math.max(this.flick, idle);
    this.tongue.visible = out > 0.02;
    this.roof.visible = this.inner.visible = this.open > 0.01;
    this.tongue.scale.set(1, 1, Math.max(0.02, out));
    this.tongue.rotation.x = out * 0.15 * Math.sin(time * 40);
  }
  /** A point on the snake's back `s` (0 to 1) of the way from the head to the tail, and the way it runs there. */
  back(s: number) {
    const want = Math.max(0, Math.min(1, s)) * this.length;
    let i = 1;
    while (i < this.along.length - 1 && this.along[i] < want) i++;
    const a = this.line[i - 1],
      b = this.line[i],
      f = (want - this.along[i - 1]) / Math.max(1e-6, this.along[i] - this.along[i - 1]),
      t = this.base[i - 1].t + (this.base[i].t - this.base[i - 1].t) * f,
      point = new T.Vector3().lerpVectors(a, b, f);
    point.y += radiusAt(t) * FLAT;
    return { point, way: new T.Vector3(b.x - a.x, 0, b.z - a.z).normalize() };
  }
}

/** A wooden ladder standing on short posts a little off the board: two rails, turned rungs between them. */
export function ladderModel(lines: LadderLine[], own: Own, rich: boolean) {
  const group = new T.Group(),
    grain = own(wood(false, 0.75)),
    timber = own(new T.MeshStandardMaterial({ map: grain, color: "#f0c890", roughness: 0.6 })),
    rungWood = own(new T.MeshStandardMaterial({ map: grain, color: "#f6d6a6", roughness: 0.55 })),
    rungs: T.Matrix4[] = [],
    rails: T.BufferGeometry[] = [],
    posts: T.Matrix4[] = [],
    railY = LADDER_TOP - 0.03;
  for (const l of lines) {
    const turn = Math.atan2(l.dir.x, l.dir.z),
      mid = { x: (l.a.x + l.b.x) / 2, z: (l.a.z + l.b.z) / 2 };
    for (const side of [-1, 1]) {
      const ox = l.dir.z * LADDER_HALF * side,
        oz = -l.dir.x * LADDER_HALF * side;
      rails.push(block(0.05, 0.06, l.length, 0.018, 1).rotateY(turn).translate(mid.x + ox, railY, mid.z + oz));
      // Short posts under the ends (and under the middle of a long ladder) hold it off the board.
      const stations = l.length > 4 ? [0.06, 0.5, 0.94] : [0.08, 0.92];
      for (const f of stations)
        posts.push(new T.Matrix4().makeTranslation(l.a.x + l.dir.x * l.length * f + ox, (railY - 0.03) / 2, l.a.z + l.dir.z * l.length * f + oz));
    }
    const count = Math.round(l.length / RUNG);
    for (let i = 0; i <= count; i++) {
      const s = 0.1 + ((l.length - 0.2) * i) / count,
        q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), turn);
      rungs.push(new T.Matrix4().compose(new T.Vector3(l.a.x + l.dir.x * s, railY + 0.005, l.a.z + l.dir.z * s), q, new T.Vector3(1, 1, 1)));
    }
  }
  const rungShape = own(new T.CylinderGeometry(0.02, 0.02, LADDER_HALF * 2 + 0.03, rich ? 10 : 6).rotateZ(Math.PI / 2)),
    rungMesh = own(new T.InstancedMesh(rungShape, rungWood, rungs.length));
  rungs.forEach((m, i) => rungMesh.setMatrixAt(i, m));
  // Where the processor draws alone only the rails cast shadows: rungs and posts are many small things to draw twice.
  rungMesh.castShadow = rich;
  rungMesh.receiveShadow = true;
  const postMesh = own(new T.InstancedMesh(own(new T.CylinderGeometry(0.022, 0.03, railY - 0.03, 8)), timber, posts.length));
  posts.forEach((m, i) => postMesh.setMatrixAt(i, m));
  postMesh.castShadow = rich;
  const railMesh = new T.Mesh(own(mergeGeometries(rails)), timber);
  rails.forEach((g) => g.dispose());
  railMesh.castShadow = railMesh.receiveShadow = true;
  group.add(railMesh, rungMesh, postMesh);
  return group;
}

/** The skulls, jaws, eyes and pupils of all the snakes, drawn together: four instanced meshes. */
export class Heads {
  readonly group = new T.Group();
  private skulls: T.InstancedMesh;
  private jaws: T.InstancedMesh;
  private eyes: T.InstancedMesh;
  private pupils: T.InstancedMesh;
  constructor(
    private snakes: SnakeModel[],
    own: Own,
    rich: boolean,
  ) {
    const shape = own(rich ? new T.SphereGeometry(1, 22, 14) : new T.SphereGeometry(1, 16, 10)),
      at = shape.getAttribute("position");
    for (let i = 0; i < at.count; i++) at.setX(i, at.getX(i) * (1 - 0.32 * Math.max(0, at.getZ(i))));
    shape.computeVertexNormals();
    const skin = own(glossy({ color: "#ffffff", roughness: 0.4 }, 0.6)),
      n = snakes.length;
    this.skulls = own(new T.InstancedMesh(shape, skin, n));
    this.jaws = own(new T.InstancedMesh(shape, skin, n));
    this.eyes = own(new T.InstancedMesh(own(new T.SphereGeometry(0.036, 14, 10)), own(glossy({ color: "#fbf6dc", roughness: 0.25 })), n * 2));
    this.pupils = own(new T.InstancedMesh(own(new T.SphereGeometry(0.022, 10, 8)), own(glossy({ color: "#141414", roughness: 0.15 })), n * 2));
    snakes.forEach((snake, i) => {
      const c = new T.Color(snake.paint);
      this.skulls.setColorAt(i, c);
      this.jaws.setColorAt(i, c);
    });
    this.skulls.castShadow = this.jaws.castShadow = true;
    this.group.add(this.skulls, this.jaws, this.eyes, this.pupils);
    this.update();
  }
  /** Copies where each snake's head parts are now. */
  update() {
    this.snakes.forEach((snake, i) => {
      snake.head.updateMatrixWorld(true);
      const { skull, jaw, eyes, pupils } = snake.parts;
      this.skulls.setMatrixAt(i, skull.matrixWorld);
      this.jaws.setMatrixAt(i, jaw.matrixWorld);
      for (let k = 0; k < 2; k++) {
        this.eyes.setMatrixAt(i * 2 + k, eyes[k].matrixWorld);
        this.pupils.setMatrixAt(i * 2 + k, pupils[k].matrixWorld);
      }
    });
    for (const m of [this.skulls, this.jaws, this.eyes, this.pupils]) {
      m.instanceMatrix.needsUpdate = true;
      m.computeBoundingSphere();
    }
  }
}
