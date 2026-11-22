import * as T from "three";
import { block, capable, glossy, wood } from "../../engine/scene-utils";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** A seeded random, so that the stands and the stars look the same every time. */
function seeded(seed: number) {
  return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
}
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, ctx: c.getContext("2d", { willReadFrequently: true })! };
}
function texture(own: Own, c: HTMLCanvasElement) {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The evening sky over the park, with the stands' dark tiers and the crowd's specks of colour against it. */
function skyAndStands(rich: boolean) {
  const w = rich ? 2048 : 1024,
    h = w / 2,
    s = w / 2048,
    { c, ctx } = canvas(w, h),
    rand = seeded(1207);
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, "#070d24");
  sky.addColorStop(0.45, "#16224a");
  sky.addColorStop(0.7, "#3d3a63");
  sky.addColorStop(0.86, "#8a5a6a");
  sky.addColorStop(1, "#c98a62");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rand() * 0.6})`;
    const r = (0.6 + rand() * 1.4) * s;
    ctx.fillRect(rand() * w, rand() * h * 0.5, r, r);
  }
  // The stands: tiers rising to the sides, dark against the sky, the crowd in specks.
  const base = h * 0.98,
    top = (x: number) => h * (0.62 - 0.16 * Math.pow(Math.abs(x / w - 0.5) * 2, 1.4));
  ctx.fillStyle = "#14161f";
  ctx.beginPath();
  ctx.moveTo(0, base);
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, top(x));
  ctx.lineTo(w, base);
  ctx.closePath();
  ctx.fill();
  const colors = ["#c8452f", "#e9e4d8", "#2f62c0", "#f2c94c", "#4a8a5a", "#d77fa1", "#8e8e9a"];
  for (let i = 0; i < 9000 * s * s + 2500; i++) {
    const x = rand() * w,
      y = top(x) + 6 * s + rand() * (base - top(x));
    ctx.globalAlpha = 0.25 + rand() * 0.35;
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    ctx.fillRect(x, y, 2.2 * s, 2.6 * s);
  }
  ctx.globalAlpha = 1;
  // The rails between tiers.
  ctx.strokeStyle = "rgba(10,10,14,0.85)";
  for (let k = 1; k < 6; k++) {
    ctx.lineWidth = 4 * s;
    ctx.beginPath();
    for (let x = 0; x <= w; x += 16) {
      const y = top(x) + (base - top(x)) * (k / 6);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return c;
}
/** Grass mown in broad stripes, and the warning track of red earth along the wall. */
function lawn(rich: boolean) {
  const size = rich ? 1024 : 512,
    { c, ctx } = canvas(size, size),
    rand = seeded(55);
  const stripes = 8;
  for (let k = 0; k < stripes; k++) {
    ctx.fillStyle = k % 2 ? "#3f7a34" : "#4a8a3c";
    ctx.fillRect(0, (k * size) / stripes, size, size / stripes);
  }
  for (let i = 0; i < size * 30; i++) {
    ctx.fillStyle = rand() < 0.5 ? "rgba(20,50,16,0.35)" : "rgba(140,190,100,0.25)";
    ctx.fillRect(rand() * size, rand() * size, 1, 2 + rand() * 3);
  }
  return c;
}
/** A floodlight's face: rows of lamps, burning. */
function lamps() {
  const { c, ctx } = canvas(256, 128);
  ctx.fillStyle = "#2b2e33";
  ctx.fillRect(0, 0, 256, 128);
  for (let r = 0; r < 3; r++)
    for (let k = 0; k < 6; k++) {
      const x = 22 + k * 42,
        y = 22 + r * 42,
        g = ctx.createRadialGradient(x, y, 0, x, y, 19);
      g.addColorStop(0, "#ffffff");
      g.addColorStop(0.5, "#fff3c8");
      g.addColorStop(1, "#6a6040");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 18, 0, Math.PI * 2);
      ctx.fill();
    }
  return c;
}
/** A soft halo of light, laid over the floodlights. */
function halo() {
  const { c, ctx } = canvas(128, 128),
    g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,246,220,0.75)");
  g.addColorStop(0.35, "rgba(255,240,200,0.25)");
  g.addColorStop(1, "rgba(255,240,200,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return c;
}
/** A baseball's leather: white, with the red double stitching running round it in its figure of eight. */
function leather() {
  const { c, ctx } = canvas(512, 256);
  ctx.fillStyle = "#f3efe4";
  ctx.fillRect(0, 0, 512, 256);
  // The seam on the sphere: the curve of a ball's stitching, laid out by longitude and latitude.
  const seam = (t: number) => {
    const a = 0.39,
      x = Math.cos(t) - a * Math.cos(3 * t),
      y = Math.sin(t) + a * Math.sin(3 * t),
      z = 2 * Math.sqrt(a * (1 - a)) * Math.sin(2 * t),
      r = Math.hypot(x, y, z);
    return { u: (Math.atan2(y, x) / (Math.PI * 2) + 1) % 1, v: Math.acos(z / r) / Math.PI };
  };
  ctx.strokeStyle = "#c2272d";
  ctx.lineWidth = 3;
  for (let i = 0; i < 160; i++) {
    const t = (i / 160) * Math.PI * 2,
      p = seam(t),
      q = seam(t + 0.02),
      // Each stitch is a little V across the seam.
      x = p.u * 512,
      y = p.v * 256,
      dx = (q.u - p.u) * 512,
      dy = (q.v - p.v) * 256,
      d = Math.hypot(dx, dy) || 1;
    if (Math.abs(dx) > 200) continue;
    const nx = (-dy / d) * 7,
      ny = (dx / d) * 7;
    ctx.beginPath();
    ctx.moveTo(x + nx, y + ny);
    ctx.lineTo(x + dx * 2, y + dy * 2);
    ctx.lineTo(x - nx, y - ny);
    ctx.stroke();
  }
  return c;
}
const lathe = (points: [number, number][], segments = 28) => new T.LatheGeometry(points.map(([r, y]) => new T.Vector2(r, y)), segments);
/**
 * A ballpark of our own at dusk round the scoreboard: the sky and the stands behind, two floodlight towers, the
 * padded outfield wall with its yellow line, the grass and the warning track, and a ball and a bat in the grass.
 */
export function ballpark(scene: T.Scene, own: Own, wallZ: number) {
  const rich = capable(),
    standard = (o: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.85, ...o }));
  const back = new T.Mesh(own(new T.PlaneGeometry(130, 65)), own(new T.MeshBasicMaterial({ map: texture(own, skyAndStands(rich)), fog: false })));
  back.position.set(0, 18, -30);
  scene.add(back);
  // The outfield wall, padded, with the yellow line along its top.
  const pad = new T.Mesh(own(block(70, 1.3, 0.5, 0.08)), standard({ color: "#1f4a37", roughness: 0.9 }));
  pad.position.set(0, 0.65, wallZ);
  pad.receiveShadow = true;
  scene.add(pad);
  const line = new T.Mesh(own(new T.BoxGeometry(70, 0.08, 0.52)), standard({ color: "#f2c230", roughness: 0.6 }));
  line.position.set(0, 1.27, wallZ);
  scene.add(line);
  // The warning track and the grass.
  const track = new T.Mesh(own(new T.PlaneGeometry(70, 2.4).rotateX(-Math.PI / 2)), standard({ color: "#9a5a3c", roughness: 1 }));
  track.position.set(0, 0.002, wallZ + 1.45);
  track.receiveShadow = true;
  scene.add(track);
  const grass = texture(own, lawn(rich));
  grass.wrapS = grass.wrapT = T.RepeatWrapping;
  grass.repeat.set(4, 3);
  const field = new T.Mesh(own(new T.PlaneGeometry(90, 50).rotateX(-Math.PI / 2)), standard({ map: grass, roughness: 1 }));
  field.position.set(0, 0, wallZ + 2.65 + 25);
  field.receiveShadow = true;
  scene.add(field);
  // Floodlight towers at either side.
  const steel = standard({ color: "#4a5058", roughness: 0.5, metalness: rich ? 0.6 : 0.2 }),
    face = own(new T.MeshBasicMaterial({ map: texture(own, lamps()) })),
    glow = own(new T.MeshBasicMaterial({ map: texture(own, halo()), transparent: true, depthWrite: false, blending: T.AdditiveBlending })),
    head = own(block(2.6, 1.4, 0.4, 0.06)),
    pole = own(new T.CylinderGeometry(0.14, 0.22, 12, 12)),
    lampFace = own(new T.PlaneGeometry(2.4, 1.2)),
    haloShape = own(new T.PlaneGeometry(6, 6));
  for (const x of [-11.5, 11.5]) {
    const tower = new T.Group(),
      p = new T.Mesh(pole, steel),
      h = new T.Mesh(head, steel),
      f = new T.Mesh(lampFace, face),
      g = new T.Mesh(haloShape, glow);
    p.position.y = 2.5;
    h.position.y = 8.9;
    h.rotation.x = 0.25;
    f.position.set(0, 8.9 - 0.05, 0.21);
    f.rotation.x = 0.25;
    g.position.set(0, 8.9, 0.6);
    tower.add(p, h, f, g);
    tower.position.set(x, 0, wallZ - 2);
    tower.rotation.y = -Math.sign(x) * 0.3;
    p.castShadow = h.castShadow = true;
    scene.add(tower);
  }
  // A ball and a bat in the grass at the sides, clear of the keys.
  const ball = new T.Mesh(own(new T.SphereGeometry(0.42, 32, 20)), own(glossy({ map: texture(own, leather()), roughness: 0.55 }, 0.15)));
  ball.position.set(-6.9, 0.42, 1.6);
  ball.rotation.set(0.4, 0.9, 0.2);
  ball.castShadow = ball.receiveShadow = true;
  scene.add(ball);
  const ash = own(wood(false, 0.7));
  const bat = new T.Mesh(
    own(lathe([[0, 0], [0.2, 0], [0.24, 0.05], [0.2, 0.12], [0.11, 0.18], [0.1, 1.4], [0.13, 2.1], [0.2, 2.8], [0.24, 3.4], [0.25, 3.9], [0.22, 4.02], [0, 4.06]])),
    rich ? glossy({ map: ash, color: "#d9b07a", roughness: 0.45 }, 0.4) : standard({ map: ash, color: "#d9b07a", roughness: 0.5 }),
  );
  if (rich) own(bat.material as T.Material);
  bat.rotation.set(0, 0, Math.PI / 2);
  bat.rotation.order = "YXZ";
  bat.rotation.y = 0.6;
  bat.position.set(9.0, 0.24, 0.4);
  bat.castShadow = bat.receiveShadow = true;
  scene.add(bat);
}
