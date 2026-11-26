import * as T from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GATE, PLATFORMS } from "./sim";
import { type Own, canvas, glow, normalFrom, painted, stream, texture } from "./paint";

/**
 * 금화 쟁탈전's valley, our own, built in code: a late-afternoon sky with a low warm sun (its glow and slow rays),
 * banks of cumulus, ranges of mountains fading into the haze (the farthest snow-capped), wooded hills, a meadow with a
 * rutted dirt road across it seen from the side (its cut bank toward the eye shows the earth in layers, roots and
 * stones, grass hanging over its lip), tufts and flowers that stir in the wind, timber ledges on lashed posts with
 * hanging lanterns, and at each end a castle in its side's colour: dressed stone, battlements, a shingled tower roof
 * with its flag waving, an arched gate with its doors swung open and a torch at each side, windows lit one by one as
 * the treasury fills, and on the tower a tall slit that fills with gold.
 *
 * Trees, bushes, stones and tufts are each one merged or instanced mesh (a handful of draws, so that a phone and the
 * processor-drawn browser tests keep their frames); the wind is done in their shaders. With a graphics card (`rich`)
 * the stone, planks, road and earth also get relief (normal maps), the torches cast light, and there are more tufts.
 */
export const SIDE_COLORS: [string, string] = ["#d8352c", "#2b6fe3"];
/** What of a castle the view moves: the gold in its tower's slit (scaled up as the treasury fills), its windows (lit one by one), its flag. */
export interface Castle {
  gauge: T.Mesh;
  windows: T.MeshBasicMaterial[];
  flag: T.Mesh;
  ring: T.Mesh;
}
export interface Valley {
  castles: [Castle, Castle];
  clouds: T.Object3D[];
  /** The sun and its glow: as far as the sky, it goes along with the eye (the view sets it across). */
  sun: T.Group;
  /** The wind, the flags, the flames and the lanterns, `t` seconds on (`dt` since the last). */
  tick(t: number, dt: number): void;
}
/** How far either way the scenery goes (the view never looks past the castles' backs). */
const SCENERY = GATE + 8;
/** How tall the gold stands in a tower's slit when the castle is full. */
export const GAUGE_TALL = 3.1;
/** How far either way the clouds drift before they come round again. */
export const CLOUDS = 100;
/** The low sun's colour and where it comes from (the view's sun light shines from the same way). */
export const SUNLIGHT = "#ffe1b0";
const lambert = (own: Own, options: T.MeshLambertMaterialParameters) => own(new T.MeshLambertMaterial(options));
const basic = (own: Own, options: T.MeshBasicMaterialParameters) => own(new T.MeshBasicMaterial(options));
function put(own: Own, parent: T.Object3D, geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0, shadow: "cast" | "receive" | "both" | "" = "") {
  const m = new T.Mesh(own(geometry), material);
  m.position.set(x, y, z);
  m.castShadow = shadow === "cast" || shadow === "both";
  m.receiveShadow = shadow === "receive" || shadow === "both";
  parent.add(m);
  return m;
}
/** A box whose faces carry their texture at `tile` metres a repeat (so that stone blocks and planks keep their size). */
function tiledBox(w: number, h: number, d: number, tile: number) {
  const g = new T.BoxGeometry(w, h, d),
    uv = g.getAttribute("uv") as T.BufferAttribute,
    // Faces in order +x, −x, +y, −y, +z, −z, four corners each: what u and v run along on each.
    spans: [number, number][] = [
      [d, h],
      [d, h],
      [w, d],
      [w, d],
      [w, h],
      [w, h],
    ];
  for (let f = 0; f < 6; f++)
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * spans[f][0]) / tile, (uv.getY(i) * spans[f][1]) / tile);
    }
  return g;
}
/** A cylinder whose side carries its texture at `tile` metres a repeat. */
function tiledCylinder(top: number, bottom: number, h: number, segments: number, tile: number) {
  const g = new T.CylinderGeometry(top, bottom, h, segments),
    uv = g.getAttribute("uv") as T.BufferAttribute,
    round = Math.PI * (top + bottom);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * round) / tile, (uv.getY(i) * h) / tile);
  return g;
}
/** Paints colours on a geometry's corners (`colour(position, normal)`), for merged meshes drawn with vertex colours. */
function tint(g: T.BufferGeometry, colour: (p: T.Vector3, n: T.Vector3, out: T.Color) => void) {
  const pos = g.getAttribute("position"),
    nor = g.getAttribute("normal"),
    data = new Float32Array(pos.count * 3),
    p = new T.Vector3(),
    n = new T.Vector3(),
    c = new T.Color();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    n.fromBufferAttribute(nor, i);
    colour(p, n, c);
    data.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new T.BufferAttribute(data, 3));
  return g;
}
/** Keeps only position, normal, colour and a sway weight, unindexed, so that unlike shapes merge into one. */
function plain(g: T.BufferGeometry, sway: (p: T.Vector3) => number) {
  const out = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(out.attributes)) if (!["position", "normal", "color"].includes(name)) out.deleteAttribute(name);
  const pos = out.getAttribute("position"),
    s = new Float32Array(pos.count),
    p = new T.Vector3();
  for (let i = 0; i < pos.count; i++) s[i] = sway(p.fromBufferAttribute(pos, i));
  out.setAttribute("sway", new T.BufferAttribute(s, 1));
  return out;
}
/** A lumpy ball: an icosphere pushed in and out by a smooth noise (the same at a shared corner, so it stays whole). */
function lump(radius: number, detail: number, seed: number, rough = 0.22) {
  const g = mergeVertices(new T.IcosahedronGeometry(radius, detail).deleteAttribute("uv").deleteAttribute("normal")),
    pos = g.getAttribute("position") as T.BufferAttribute,
    p = new T.Vector3();
  for (let i = 0; i < pos.count; i++) {
    p.fromBufferAttribute(pos, i);
    const u = p.clone().normalize(),
      n = Math.sin(u.x * 3.1 + seed) * Math.sin(u.y * 2.7 + seed * 1.7) * Math.sin(u.z * 3.3 + seed * 0.6) + 0.5 * Math.sin(u.x * 7.3 + u.z * 5.1 + seed * 2.3);
    p.multiplyScalar(1 + rough * n);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  g.computeVertexNormals();
  return g;
}
/** The wind in a shader: corners rise and lean by their `sway` weight, with time and place (one clock for the valley). */
function windy(material: T.Material, clock: { value: number }, strength: number, instanced = false) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = clock;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\nuniform float uWind;\n${instanced ? "" : "attribute float sway;"}`)
      .replace(
        "#include <begin_vertex>",
        instanced
          ? `#include <begin_vertex>
             vec4 wAt = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
             float wH = clamp(position.y / 0.3, 0.0, 1.0);
             transformed.x += (sin(uWind * 2.1 + wAt.x * 1.3 + wAt.z * 0.7) + 0.4 * sin(uWind * 5.3 + wAt.x * 3.1)) * ${strength.toFixed(3)} * wH * wH;`
          : `#include <begin_vertex>
             vec4 wAt = modelMatrix * vec4(position, 1.0);
             transformed.x += (sin(uWind * 1.3 + wAt.x * 0.45 + wAt.z * 0.3) + 0.35 * sin(uWind * 3.7 + wAt.x * 1.9)) * ${strength.toFixed(3)} * sway;
             transformed.z += sin(uWind * 1.1 + wAt.x * 0.6) * ${(strength * 0.4).toFixed(3)} * sway;`,
      );
  };
  material.customProgramCacheKey = () => `goldraid-wind-${instanced}-${strength}`;
  return material;
}
/** The sky: deep blue overhead, paling to a warm haze at the hills. */
function sky(own: Own, scene: T.Scene) {
  scene.background = painted(own, 4, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, "#3d86d1");
    g.addColorStop(0.35, "#79b7e6");
    g.addColorStop(0.62, "#bcdcec");
    g.addColorStop(0.8, "#f1e2c4");
    g.addColorStop(1, "#f4c88e");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 512);
  });
  // The far things fade into a warm, light haze.
  scene.fog = new T.Fog("#dde3dc", 40, 320);
}
/**
 * A range of mountains or hills as one mesh: a crest of waves of several lengths over `span`, and rows of corners
 * under it shaded from its colour at the crest to the haze below; above `snow` its tops are white.
 */
function range(own: Own, seed: number, span: number, low: number, high: number, jag: number, crest: string, foot: string, snow = Infinity) {
  const random = stream(seed),
    waves = [1, 2, 3, 5, 8, 13, 21, 34].map((k) => ({ k, a: (0.3 + random() * 0.7) / Math.pow(k, jag), p: random() * Math.PI * 2 })),
    steps = 260,
    drops = [0, 0.25, 0.7, 1.4, 2.6, 4.5, 8, 40],
    positions: number[] = [],
    colours: number[] = [],
    index: number[] = [],
    top = new T.Color(crest),
    bottom = new T.Color(foot),
    white = new T.Color("#f4f6fa"),
    shade = new T.Color("#9fb0c8"),
    c = new T.Color();
  for (let i = 0; i <= steps; i++) {
    const x = -span / 2 + (span * i) / steps,
      u = (i / steps) * Math.PI * 2;
    let y = 0;
    for (const w of waves) y += w.a * Math.sin(w.k * u + w.p);
    const crestY = low + high * (0.6 + 0.4 * y),
      // The slope here: snow lies on the side toward the sun, the other is in shade.
      next = waves.reduce((s, w) => s + w.a * Math.cos(w.k * u + w.p) * w.k, 0) > 1.5,
      jitter = Math.sin(i * 0.37) * 0.015;
    drops.forEach((d, r) => {
      const yy = Math.max(low - 40, crestY - d);
      positions.push(x, yy, 0);
      const f = Math.min(1, d / 8);
      c.copy(top).lerp(bottom, f).offsetHSL(0, 0, jitter);
      // Snow on the tops, a little greyer on the slopes facing away from the sun.
      if (yy > snow) c.lerp(next ? shade : white, Math.min(1, (yy - snow) / 1.2) * 0.85);
      colours.push(c.r, c.g, c.b);
      if (i > 0 && r > 0) {
        const a = (i - 1) * drops.length + r - 1,
          b = i * drops.length + r - 1;
        index.push(a, b, a + 1, b, b + 1, a + 1);
      }
    });
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  g.setIndex(index);
  return new T.Mesh(own(g), basic(own, { vertexColors: true, side: T.DoubleSide }));
}
/** A bank of cumulus painted on a canvas: heaped round tops lit warm, flat grey-blue bases. */
function cumulus(own: Own, seed: number) {
  return texture(
    own,
    canvas(512, 256, (ctx) => {
      const random = stream(seed),
        base = 196;
      const puffs: [number, number, number][] = [];
      for (let k = 0; k < 16; k++) {
        const x = 70 + random() * 372,
          r = 34 + random() * 52 * (1 - Math.abs(x - 256) / 300),
          y = base - r * (0.45 + random() * 0.5);
        puffs.push([x, y, r]);
      }
      puffs.sort((a, b) => b[2] - a[2]);
      for (const [x, y, r] of puffs) {
        const g = ctx.createRadialGradient(x - r * 0.25, y - r * 0.45, r * 0.1, x, y, r);
        g.addColorStop(0, "rgba(255,251,240,1)");
        g.addColorStop(0.55, "rgba(246,243,238,0.98)");
        g.addColorStop(0.85, "rgba(214,222,234,0.95)");
        g.addColorStop(1, "rgba(200,210,226,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      // A flat underside in shade, fading out at the bottom.
      ctx.globalCompositeOperation = "source-atop";
      const under = ctx.createLinearGradient(0, base - 60, 0, base + 10);
      under.addColorStop(0, "rgba(170,186,210,0)");
      under.addColorStop(1, "rgba(150,168,196,0.75)");
      ctx.fillStyle = under;
      ctx.fillRect(0, 0, 512, 256);
      ctx.globalCompositeOperation = "destination-out";
      const cut = ctx.createLinearGradient(0, base - 8, 0, base + 14);
      cut.addColorStop(0, "rgba(0,0,0,0)");
      cut.addColorStop(1, "rgba(0,0,0,1)");
      ctx.fillStyle = cut;
      ctx.fillRect(0, base - 8, 512, 80);
    }),
  );
}
/** The sun's slow rays: thin wedges of light from the middle, fading outward. */
function rays(own: Own) {
  return texture(
    own,
    canvas(512, 512, (ctx) => {
      const random = stream(17);
      ctx.translate(256, 256);
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2 + random() * 0.15,
          w = 0.03 + random() * 0.06,
          g = ctx.createRadialGradient(0, 0, 20, 0, 0, 256);
        g.addColorStop(0, `rgba(255,240,205,${0.5 + random() * 0.4})`);
        g.addColorStop(1, "rgba(255,240,205,0)");
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, 256, a - w, a + w);
        ctx.closePath();
        ctx.fill();
      }
    }),
  );
}
function backdrop(own: Own, scene: T.Scene): { clouds: T.Object3D[]; sun: T.Group; spin: T.SpriteMaterial } {
  // The sun, low over the mountains: a bright disc in a wide warm glow, and rays turning slowly.
  const sun = new T.Group(),
    soft = glow(own, 256, 0.08),
    sprite = (map: T.Texture, colour: string, size: number, opacity: number, z: number) => {
      const s = new T.Sprite(own(new T.SpriteMaterial({ map, color: colour, transparent: true, opacity, depthWrite: false, fog: false, blending: T.AdditiveBlending })));
      s.scale.set(size, size, 1);
      s.position.set(0, 0, z);
      s.renderOrder = -10;
      sun.add(s);
      return s;
    };
  // Behind the clouds (they drift across it), over the mountains.
  sun.position.set(0, 34, -140);
  scene.add(sun);
  sprite(soft, "#ffcf8a", 110, 0.5, -1);
  const spinning = sprite(rays(own), "#ffe2b0", 110, 0.1, -0.5);
  sprite(soft, "#fff1d0", 26, 0.95, 0);
  put(own, sun, new T.CircleGeometry(3.8, 40), basic(own, { color: "#fff8e6", fog: false }), 0, 0, 0.2).renderOrder = -9;
  // Ranges: the snowy far mountains, blue mountains, green hills, and the wooded hills behind the valley.
  const far = range(own, 5, 330, 4, 12, 1.05, "#7d91b2", "#bcc6c9", 16);
  far.position.z = -70;
  const blue = range(own, 12, 280, 2.5, 8, 1.15, "#6f8fae", "#b4c2c2");
  blue.position.z = -52;
  const hills = range(own, 23, 230, 1.0, 5.2, 1.3, "#7ea472", "#b8c8a8");
  hills.position.z = -36;
  const near = range(own, 31, 180, 0.2, 3.6, 1.55, "#4f8a45", "#7aa064");
  near.position.z = -22;
  scene.add(far, blue, hills, near);
  // Clouds: banks of cumulus that drift, the farther the paler.
  const clouds: T.Object3D[] = [],
    random = stream(77),
    maps = [cumulus(own, 3), cumulus(own, 8), cumulus(own, 21)].map((map) => own(new T.SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false })));
  for (let k = 0; k < 13; k++) {
    const cloud = new T.Sprite(maps[k % 3]),
      wide = 18 + random() * 18;
    cloud.scale.set(wide, wide / 2, 1);
    cloud.position.set(-CLOUDS + random() * 2 * CLOUDS, 24 + random() * 14, -100 - random() * 12);
    cloud.renderOrder = -8;
    scene.add(cloud);
    clouds.push(cloud);
  }
  return { clouds, sun, spin: spinning.material };
}
/** The road: packed earth with two wheel ruts, pebbles and tufts creeping in at its edges (colour and its relief). */
function roadPictures(own: Own, rich: boolean) {
  const W = 1024,
    H = 256,
    random = stream(9),
    pebbles: [number, number, number, number][] = [];
  for (let k = 0; k < 360; k++) pebbles.push([random() * W, 20 + random() * (H - 40), 2 + random() * 5, random()]);
  const ruts = [0.36, 0.68];
  const colour = canvas(W, H, (ctx) => {
    ctx.fillStyle = "#c7a26b";
    ctx.fillRect(0, 0, W, H);
    // Mottling in a few sizes.
    for (let k = 0; k < 2600; k++) {
      const big = random() < 0.2;
      ctx.fillStyle = ["#b8935c", "#d2b07a", "#bf9a63", "#dcbb86", "#a98653"][Math.floor(random() * 5)];
      ctx.globalAlpha = big ? 0.25 : 0.5;
      ctx.beginPath();
      ctx.ellipse(random() * W, random() * H, big ? 14 + random() * 26 : 1 + random() * 3, big ? 4 + random() * 8 : 1 + random() * 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // The ruts: darker, smoother, packed by wheels, with a lighter ridge between.
    for (const r of ruts) {
      const y = r * H,
        g = ctx.createLinearGradient(0, y - 18, 0, y + 18);
      g.addColorStop(0, "rgba(120,88,52,0)");
      g.addColorStop(0.5, "rgba(120,88,52,0.38)");
      g.addColorStop(1, "rgba(120,88,52,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, y - 18, W, 36);
      ctx.strokeStyle = "rgba(90,64,38,0.25)";
      ctx.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        ctx.beginPath();
        const yy = y - 10 + k * 4;
        ctx.moveTo(0, yy);
        for (let x = 0; x <= W; x += 32) ctx.lineTo(x, yy + Math.sin(x * 0.02 + k) * 1.5);
        ctx.stroke();
      }
    }
    // Pebbles: lit from the sun's side, with a shadow under.
    for (const [x, y, r, tone] of pebbles) {
      ctx.fillStyle = "rgba(80,58,34,0.35)";
      ctx.beginPath();
      ctx.ellipse(x + r * 0.35, y + r * 0.45, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r);
      g.addColorStop(0, tone < 0.5 ? "#e8dcc4" : "#d8c6a0");
      g.addColorStop(1, tone < 0.5 ? "#9a8f7c" : "#8f7a58");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Grass creeping in along both edges.
    for (const edge of [0, H]) {
      for (let k = 0; k < 700; k++) {
        const x = random() * W,
          reach = Math.pow(random(), 2) * 26,
          y = edge === 0 ? reach : H - reach;
        ctx.strokeStyle = ["#5f9a40", "#76ad4f", "#4e8a36", "#8ab85a"][Math.floor(random() * 4)];
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (random() - 0.5) * 6, y + (edge === 0 ? -1 : 1) * (4 + random() * 8));
        ctx.stroke();
      }
    }
  });
  const height = rich
    ? canvas(W, H, (ctx) => {
        ctx.fillStyle = "#808080";
        ctx.fillRect(0, 0, W, H);
        const r2 = stream(91);
        for (let k = 0; k < 1500; k++) {
          ctx.fillStyle = r2() < 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
          ctx.beginPath();
          ctx.arc(r2() * W, r2() * H, 1 + r2() * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        for (const r of ruts) {
          const y = r * H,
            g = ctx.createLinearGradient(0, y - 20, 0, y + 20);
          g.addColorStop(0, "rgba(0,0,0,0)");
          g.addColorStop(0.5, "rgba(0,0,0,0.45)");
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.fillRect(0, y - 20, W, 40);
        }
        for (const [x, y, r] of pebbles) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, "#ffffff");
          g.addColorStop(1, "#909090");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      })
    : null;
  return { colour, height };
}
/** The cut bank toward the eye: topsoil with roots, a band of clay with stones, and layered rock below. */
function bankPictures(rich: boolean) {
  const W = 512,
    H = 512,
    random = stream(21),
    stones: [number, number, number, number, string][] = [],
    // Where each layer begins down the picture (it waves along).
    layers = [
      { from: 0, colour: "#5a3c22", speck: ["#4a301b", "#6e4c2c"] },
      { from: 0.16, colour: "#7a5634", speck: ["#694829", "#8c6640"] },
      { from: 0.38, colour: "#a07a48", speck: ["#8c6a3c", "#b48c58"] },
      { from: 0.52, colour: "#86776a", speck: ["#776a5e", "#968676"] },
      { from: 0.66, colour: "#6f6358", speck: ["#62574d", "#7c7064"] },
      { from: 0.82, colour: "#544a42", speck: ["#4a413a", "#5f554c"] },
    ],
    wave = (k: number, x: number) => Math.sin((x / W) * Math.PI * 2 * (1 + (k % 3)) + k * 1.7) * 7 + Math.sin((x / W) * Math.PI * 2 * 5 + k) * 3;
  for (let k = 0; k < 70; k++) {
    const y = 0.2 + random() * 0.78;
    stones.push([random() * W, y * H, 4 + random() * (y > 0.5 ? 14 : 8), random() * Math.PI, y > 0.5 ? "#9a9086" : "#b29e82"]);
  }
  const colour = canvas(W, H, (ctx) => {
    layers.forEach((layer, k) => {
      ctx.fillStyle = layer.colour;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) ctx.lineTo(x, layer.from * H + (k ? wave(k, x) : 0));
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      // Specks within the layer, and a darker seam along its top.
      for (let s = 0; s < 500; s++) {
        const x = random() * W,
          y = layer.from * H + random() * H * 0.25;
        ctx.fillStyle = layer.speck[s % 2];
        ctx.globalAlpha = 0.6;
        ctx.fillRect(x, y, 1 + random() * 3, 1 + random() * 2);
      }
      ctx.globalAlpha = 1;
      if (k) {
        ctx.strokeStyle = "rgba(40,26,14,0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= W; x += 8) ctx[x ? "lineTo" : "moveTo"](x, layer.from * H + wave(k, x));
        ctx.stroke();
      }
    });
    // Cracks in the rock.
    ctx.strokeStyle = "rgba(30,24,20,0.45)";
    ctx.lineWidth = 1.2;
    for (let k = 0; k < 26; k++) {
      let x = random() * W,
        y = H * (0.55 + random() * 0.45);
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let s = 0; s < 5; s++) {
        x += (random() - 0.5) * 24;
        y += 4 + random() * 10;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // Roots down from the turf.
    for (let k = 0; k < 16; k++) {
      let x = random() * W,
        y = 0,
        a = Math.PI / 2 + (random() - 0.5) * 0.9;
      ctx.strokeStyle = random() < 0.5 ? "rgba(190,150,104,0.55)" : "rgba(150,112,70,0.55)";
      ctx.lineWidth = 0.8 + random() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      const long = 30 + random() * 120;
      for (let s = 0; s < long; s += 6) {
        a += (random() - 0.5) * 0.5;
        x += Math.cos(a) * 6;
        y += Math.sin(a) * 6;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    for (const [x, y, r, a, c] of stones) {
      ctx.fillStyle = "rgba(20,14,10,0.45)";
      ctx.beginPath();
      ctx.ellipse(x + 2, y + 3, r, r * 0.7, a, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r * 1.1);
      g.addColorStop(0, "#e2d8c8");
      g.addColorStop(0.5, c);
      g.addColorStop(1, "#4e4640");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, r, r * 0.7, a, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const height = rich
    ? canvas(W, H, (ctx) => {
        ctx.fillStyle = "#707070";
        ctx.fillRect(0, 0, W, H);
        const r2 = stream(33);
        for (let k = 0; k < 2500; k++) {
          ctx.fillStyle = r2() < 0.5 ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
          ctx.fillRect(r2() * W, r2() * H, 2 + r2() * 5, 2 + r2() * 4);
        }
        layers.forEach((layer, k) => {
          if (!k) return;
          ctx.strokeStyle = "rgba(0,0,0,0.5)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          for (let x = 0; x <= W; x += 8) ctx[x ? "lineTo" : "moveTo"](x, layer.from * H + wave(k, x));
          ctx.stroke();
        });
        for (const [x, y, r, a] of stones) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r);
          g.addColorStop(0, "#ffffff");
          g.addColorStop(1, "#808080");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(x, y, r, r * 0.7, a, 0, Math.PI * 2);
          ctx.fill();
        }
      })
    : null;
  return { colour, height };
}
/** A tuft of grass blades (with a flower or two when `flowers`) on a clear ground, for crossed cards. */
function tuftPicture(own: Own, seed: number, flowers: boolean) {
  return texture(
    own,
    canvas(128, 128, (ctx) => {
      const random = stream(seed);
      for (let k = 0; k < 34; k++) {
        const x = 20 + random() * 88,
          bend = (random() - 0.5) * 34,
          tall = 50 + random() * 74;
        ctx.strokeStyle = ["#4d8a34", "#64a043", "#7cb653", "#3f7a2c", "#94c25e"][Math.floor(random() * 5)];
        ctx.lineWidth = 2 + random() * 2.5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x, 128);
        ctx.quadraticCurveTo(x + bend * 0.3, 128 - tall * 0.6, x + bend, 128 - tall);
        ctx.stroke();
      }
      if (flowers)
        for (let k = 0; k < 4; k++) {
          const x = 24 + random() * 80,
            y = 20 + random() * 40,
            colour = ["#fff6e8", "#ffd84a", "#c98ef0", "#ff8fa8"][Math.floor(random() * 4)];
          ctx.strokeStyle = "#4d8a34";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x, 128);
          ctx.lineTo(x + (random() - 0.5) * 8, y);
          ctx.stroke();
          ctx.fillStyle = colour;
          for (let p = 0; p < 5; p++) {
            ctx.beginPath();
            ctx.arc(x + Math.cos((p * Math.PI * 2) / 5) * 5, y + Math.sin((p * Math.PI * 2) / 5) * 5, 4, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "#f2b02a";
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
    }),
  );
}
/** Crossed cards of a tuft, standing on the ground (its foot at y = 0), `tall` high. */
function tuftShape(tall: number) {
  const parts = [0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => {
    const g = new T.PlaneGeometry(tall * 1.2, tall, 1, 2);
    g.translate(0, tall / 2, 0);
    g.rotateY(a);
    return g;
  });
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}
/** The meadow, the road across it, the cut bank toward the eye with grass over its lip; trees, bushes, tufts and stones. */
function ground(own: Own, scene: T.Scene, rich: boolean, wind: { value: number }) {
  const grass = lambert(own, {
      map: painted(
        own,
        1024,
        1024,
        (ctx) => {
          ctx.fillStyle = "#62a046";
          ctx.fillRect(0, 0, 1024, 1024);
          const random = stream(3);
          for (let k = 0; k < 70; k++) {
            ctx.fillStyle = random() < 0.5 ? "rgba(70,120,45,0.25)" : "rgba(140,180,80,0.22)";
            ctx.beginPath();
            ctx.ellipse(random() * 1024, random() * 1024, 40 + random() * 110, 20 + random() * 60, random() * 3, 0, Math.PI * 2);
            ctx.fill();
          }
          for (let k = 0; k < 9000; k++) {
            ctx.strokeStyle = ["#558f3b", "#6eac4c", "#4b8434", "#86bb5c", "#a4c76a"][Math.floor(random() * 5)];
            ctx.lineWidth = 1.5;
            const x = random() * 1024,
              y = random() * 1024;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + (random() - 0.5) * 4, y - 4 - random() * 8);
            ctx.stroke();
          }
          for (let k = 0; k < 260; k++) {
            ctx.fillStyle = ["#fff6e8", "#ffd84a", "#c98ef0", "#ff9fb4"][Math.floor(random() * 4)];
            ctx.beginPath();
            ctx.arc(random() * 1024, random() * 1024, 1.5 + random() * 1.5, 0, Math.PI * 2);
            ctx.fill();
          }
        },
        [20, 5],
      ),
    }),
    road = roadPictures(own, rich),
    dirt = lambert(own, { map: texture(own, road.colour, { repeat: [20, 1] }) }),
    bank = bankPictures(rich),
    soil = lambert(own, { map: texture(own, bank.colour, { repeat: [24, 1] }) });
  if (road.height) {
    dirt.normalMap = normalFrom(own, road.height, 3, [20, 1]);
    dirt.normalScale.set(0.9, 0.9);
  }
  if (bank.height) soil.normalMap = normalFrom(own, bank.height, 3, [24, 1]);
  const top = put(own, scene, new T.PlaneGeometry(120, 26), grass, 0, 0, -10.6, "receive");
  top.rotation.x = -Math.PI / 2;
  const way = put(own, scene, new T.PlaneGeometry(120, 2.3), dirt, 0, 0.012, 0.25, "receive");
  way.rotation.x = -Math.PI / 2;
  put(own, scene, new T.PlaneGeometry(120, 5), soil, 0, -2.5, 2.4, "receive");
  // Deeper down the earth is plain rock (a tall screen sees far under the road).
  put(own, scene, new T.PlaneGeometry(120, 60), basic(own, { color: "#4f453d" }), 0, -34.9, 2.4);
  // Grass hanging over the bank's lip.
  const fringe = lambert(own, {
    map: painted(
      own,
      512,
      64,
      (ctx) => {
        const random = stream(5);
        ctx.fillStyle = "#4f8a36";
        ctx.fillRect(0, 0, 512, 10);
        for (let k = 0; k < 500; k++) {
          const x = random() * 512;
          ctx.strokeStyle = ["#4d8a34", "#64a043", "#3f7a2c", "#78b050"][Math.floor(random() * 4)];
          ctx.lineWidth = 2 + random() * 2;
          ctx.beginPath();
          ctx.moveTo(x, 6);
          ctx.quadraticCurveTo(x + (random() - 0.5) * 10, 20, x + (random() - 0.5) * 16, 14 + random() * 46);
          ctx.stroke();
        }
      },
      [60, 1],
    ),
    transparent: false,
    alphaTest: 0.5,
    side: T.DoubleSide,
  });
  put(own, scene, new T.PlaneGeometry(120, 0.34), fringe, 0, -0.1, 2.42);
  const random = stream(40);
  // Trees: pines (layered, ragged cones) and broadleaves (lumpy crowns), all one mesh for the leaves and one for the
  // trunks, shaded by their corners (lit from the sun's side and above, darker within and below), and stirred by the wind.
  const nearLeaves: T.BufferGeometry[] = [],
    farLeaves: T.BufferGeometry[] = [],
    trunks: T.BufferGeometry[] = [],
    sunward = new T.Vector3(0.45, 0.75, 0.5).normalize(),
    bark = new T.Color("#5e4330"),
    pale = new T.Color("#7a5a40");
  let leaves = nearLeaves;
  const tree = (x: number, z: number, size: number, k: number) => {
    const pine = random() < 0.5,
      base = new T.Color(pine ? ["#2f6b37", "#356f3a", "#2a5f34"][k % 3] : ["#3f8038", "#4b8c3c", "#5a9640", "#36773a"][k % 4]),
      tall = pine ? size * 1.15 : size * 0.7;
    const t = tint(new T.CylinderGeometry(0.07 * size, 0.11 * size, tall, 7).translate(x, tall / 2, z), (p, n, out) => out.copy(bark).lerp(pale, Math.max(0, n.dot(sunward))));
    trunks.push(plain(t, () => 0));
    const colourAt = (cx: number, cy: number, cz: number, high: number) => (p: T.Vector3, n: T.Vector3, out: T.Color) => {
      const lit = Math.max(0, n.dot(sunward)),
        up = (p.y - cy) / high;
      out.copy(base).offsetHSL(0, 0.03, -0.11 + 0.17 * lit + 0.05 * up);
      // The middle of a crown is darker (light does not reach it).
      const inward = Math.hypot(p.x - cx, p.z - cz) / (high * 0.6);
      if (inward < 0.6) out.offsetHSL(0, 0, -0.06);
    };
    if (pine) {
      const layers = 5;
      for (let l = 0; l < layers; l++) {
        const r = size * (0.68 - l * 0.11),
          h = size * 0.62,
          y = size * (0.62 + l * 0.33),
          cone = new T.ConeGeometry(r, h, 11, 2, true),
          pos = cone.getAttribute("position") as T.BufferAttribute;
        // Ragged hem: the lowest ring of each layer in and out.
        for (let i = 0; i < pos.count; i++)
          if (pos.getY(i) < -h / 2 + 0.01) {
            const a = Math.atan2(pos.getZ(i), pos.getX(i)),
              f = 1 + 0.16 * Math.sin(a * 5 + l * 2 + k);
            pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) - 0.08 * size * Math.abs(Math.sin(a * 3 + k)), pos.getZ(i) * f);
          }
        cone.computeVertexNormals();
        cone.translate(x, y, z);
        leaves.push(plain(tint(cone, colourAt(x, size * 0.6, z, size * 2)), (p) => Math.max(0, (p.y - size * 0.4) / (size * 2.2))));
      }
    } else {
      const blobs = 4 + Math.floor(random() * 3);
      for (let b = 0; b < blobs; b++) {
        const a = (b / blobs) * Math.PI * 2 + random(),
          r = size * (0.32 + random() * 0.16),
          cx = x + Math.cos(a) * size * 0.28,
          cy = size * (1.0 + random() * 0.38) + (b === 0 ? size * 0.25 : 0),
          cz = z + Math.sin(a) * size * 0.22,
          blob = lump(r, rich && leaves === nearLeaves ? 2 : 1, k * 7 + b, 0.2).translate(cx, cy, cz);
        leaves.push(plain(tint(blob, colourAt(x, size * 0.9, z, size)), (p) => Math.max(0, (p.y - size * 0.6) / size)));
      }
    }
  };
  let k = 0;
  // Near trees behind the road, and a farther, smaller row for depth.
  for (let n = 0; n < 70; n++) {
    const x = -SCENERY + random() * 2 * SCENERY,
      z = -3.4 - random() * 9,
      size = 1.4 + random() * 1.5;
    if (Math.abs(x) > GATE - 1.1 && z > -5.5) continue;
    tree(x, z, size, k++);
  }
  // The farther row casts no shadow (none would be seen so far back), and is coarser where the processor draws.
  leaves = farLeaves;
  for (let n = 0; n < 70; n++) tree(-SCENERY * 2 + random() * 4 * SCENERY, -13 - random() * 7, 1.6 + random() * 1.4, k++);
  const leafy = windy(lambert(own, { vertexColors: true }), wind, 0.05),
    woody = lambert(own, { vertexColors: true }),
    // Where the processor draws, trees cast no shadow (they fall behind them, on the meadow, and cost a pass).
    crowns = put(own, scene, mergeGeometries(nearLeaves), leafy, 0, 0, 0, rich ? "cast" : ""),
    back = put(own, scene, mergeGeometries(farLeaves), leafy),
    stems = put(own, scene, mergeGeometries(trunks), woody, 0, 0, 0, rich ? "cast" : "");
  crowns.frustumCulled = back.frustumCulled = stems.frustumCulled = false;
  nearLeaves.concat(farLeaves, trunks).forEach((g) => g.dispose());
  // Bushes along the back of the road, and stones along the bank's edge: one mesh each.
  const bushes: T.BufferGeometry[] = [],
    green = new T.Color("#4a8a3a");
  for (let n = 0; n < 50; n++) {
    const x = -(GATE + 2) + random() * 2 * (GATE + 2),
      z = -1.5 - random() * 1.4,
      s = 0.3 + random() * 0.28,
      shade = green.clone().offsetHSL((random() - 0.5) * 0.04, 0, (random() - 0.5) * 0.08);
    const b = lump(1, 2, n * 3.1, 0.18).scale(s * 1.3, s * 0.75, s).translate(x, s * 0.45, z);
    bushes.push(plain(tint(b, (p, nn, out) => out.copy(shade).offsetHSL(0, 0, -0.1 + 0.18 * Math.max(0, nn.dot(sunward)))), (p) => Math.max(0, p.y / 0.6)));
  }
  put(own, scene, mergeGeometries(bushes), leafy, 0, 0, 0, rich ? "both" : "receive").frustumCulled = false;
  bushes.forEach((g) => g.dispose());
  const stones: T.BufferGeometry[] = [],
    grey = new T.Color("#a49e92");
  for (let n = 0; n < 46; n++) {
    const s = 0.08 + random() * 0.14,
      g = lump(1, 1, n * 1.9, 0.25)
        .scale(s * 1.4, s * 0.7, s)
        .rotateY(random() * 3)
        .translate(-SCENERY + random() * 2 * SCENERY, s * 0.25, 1.55 + random() * 0.75),
      tone = grey.clone().offsetHSL(0, 0, (random() - 0.5) * 0.12);
    stones.push(plain(tint(g, (p, nn, out) => out.copy(tone).offsetHSL(0, 0, -0.14 + 0.2 * Math.max(0, nn.dot(sunward)))), () => 0));
  }
  put(own, scene, mergeGeometries(stones), lambert(own, { vertexColors: true, flatShading: true }), 0, 0, 0, "both").frustumCulled = false;
  stones.forEach((g) => g.dispose());
  // Tufts of grass (some with flowers) along both edges of the road and in the meadow behind: instanced crossed cards.
  const count = rich ? 900 : 220,
    flowery = Math.floor(count * 0.25),
    shape = own(tuftShape(0.3));
  for (const [n, flowers] of [
    [count - flowery, false],
    [flowery, true],
  ] as const) {
    const material = windy(lambert(own, { map: tuftPicture(own, flowers ? 12 : 4, flowers), alphaTest: 0.5, side: T.DoubleSide }), wind, 0.05, true),
      tufts = new T.InstancedMesh(shape, material, n),
      m = new T.Matrix4(),
      q = new T.Quaternion(),
      s = new T.Vector3(),
      p = new T.Vector3(),
      c = new T.Color();
    for (let i = 0; i < n; i++) {
      const where = random(),
        x = -SCENERY + random() * 2 * SCENERY,
        // Before the road (on the bank's lip), just behind it, or out in the meadow.
        z = where < 0.4 ? 1.42 + random() * 0.95 : where < 0.75 ? -0.95 - random() * 0.5 : -1.5 - random() * 5,
        // Low on the bank's lip before the road (so that nothing on the road is hidden), fuller behind it.
        size = z > 1 ? 0.3 + random() * 0.35 : 0.7 + random() * 0.9;
      q.setFromAxisAngle(new T.Vector3(0, 1, 0), random() * Math.PI);
      m.compose(p.set(x, 0, z), q, s.set(size, size * (0.8 + random() * 0.5), size));
      tufts.setMatrixAt(i, m);
      tufts.setColorAt(i, c.setHSL(0.26 + (random() - 0.5) * 0.05, 0.5, 0.75 + random() * 0.3));
    }
    tufts.frustumCulled = false;
    tufts.receiveShadow = true;
    scene.add(own(tufts));
  }
}
/** Planks with grain, joins and nails (and their relief), and a post's wood. */
function woodPictures(own: Own, rich: boolean) {
  const W = 512,
    H = 256,
    boards = 6,
    random = stream(14),
    knots: [number, number, number][] = [];
  for (let k = 0; k < 10; k++) knots.push([random() * W, random() * H, 4 + random() * 6]);
  const colour = canvas(W, H, (ctx) => {
    for (let b = 0; b < boards; b++) {
      const y = (b * H) / boards,
        tone = ["#a8743f", "#b47d46", "#9c6b3a", "#b98650", "#a3713f", "#ad7a44"][b];
      ctx.fillStyle = tone;
      ctx.fillRect(0, y, W, H / boards);
      for (let k = 0; k < 40; k++) {
        ctx.strokeStyle = random() < 0.5 ? "rgba(90,56,26,0.3)" : "rgba(210,160,100,0.22)";
        ctx.lineWidth = 0.6 + random() * 1.2;
        const yy = y + random() * (H / boards);
        ctx.beginPath();
        ctx.moveTo(0, yy);
        for (let x = 0; x <= W; x += 16) ctx.lineTo(x, yy + Math.sin(x * 0.015 + k) * 1.6);
        ctx.stroke();
      }
      // Joins between boards along their length, and the board ends.
      ctx.fillStyle = "rgba(50,30,14,0.75)";
      ctx.fillRect(0, y, W, 2.5);
      const cut = (b * 137) % W;
      ctx.fillRect(cut, y, 2.5, H / boards);
      ctx.fillStyle = "#3a2a1e";
      for (const nx of [cut - 9, cut + 12])
        for (const ny of [y + 9, y + H / boards - 9]) {
          ctx.beginPath();
          ctx.arc((nx + W) % W, ny, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
    }
    for (const [x, y, r] of knots) {
      ctx.fillStyle = "rgba(80,48,22,0.6)";
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.6, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const planks = lambert(own, { map: texture(own, colour) });
  if (rich) {
    planks.normalMap = normalFrom(
      own,
      canvas(W, H, (ctx) => {
        ctx.fillStyle = "#909090";
        ctx.fillRect(0, 0, W, H);
        for (let b = 0; b < boards; b++) {
          const y = (b * H) / boards;
          ctx.fillStyle = "#202020";
          ctx.fillRect(0, y, W, 3);
          ctx.fillRect((b * 137) % W, y, 3, H / boards);
          for (let k = 0; k < 20; k++) {
            ctx.fillStyle = "rgba(0,0,0,0.15)";
            ctx.fillRect(0, y + random() * (H / boards), W, 1);
          }
        }
      }),
      2.5,
    );
  }
  const post = lambert(own, {
    map: painted(own, 64, 256, (ctx) => {
      ctx.fillStyle = "#7a5230";
      ctx.fillRect(0, 0, 64, 256);
      for (let k = 0; k < 40; k++) {
        ctx.strokeStyle = random() < 0.5 ? "rgba(60,36,18,0.4)" : "rgba(160,112,66,0.3)";
        ctx.lineWidth = 1 + random();
        const x = random() * 64;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (random() - 0.5) * 4, 256);
        ctx.stroke();
      }
    }),
  });
  return { planks, post };
}
/** A lantern's glow and a torch's flame: soft sprites that flicker (`tick`). */
interface Flame {
  sprite: T.Sprite;
  base: number;
  seed: number;
  light: T.PointLight | null;
}
/** The timber ledges: a plank deck on lashed posts with braces, each with a lantern hanging under its middle. */
function ledges(own: Own, scene: T.Scene, rich: boolean, flames: Flame[], halo: T.Texture) {
  const { planks, post } = woodPictures(own, rich),
    dark = lambert(own, { color: "#5e3e24" }),
    iron = lambert(own, { color: "#2e2a26" }),
    rope = lambert(own, { color: "#c8a46a" }),
    lamp = basic(own, { color: "#ffd66a" }),
    glowing = own(new T.SpriteMaterial({ map: halo, color: "#ffb453", transparent: true, opacity: 0.7, depthWrite: false, blending: T.AdditiveBlending }));
  for (const p of PLATFORMS) {
    const width = p.x1 - p.x0,
      mid = (p.x0 + p.x1) / 2,
      high = p.y > 2,
      deck = tiledBox(width + 0.16, 0.16, 1.5, 2.6);
    // The deck's front shows only the edge of its first board.
    const uv = deck.getAttribute("uv") as T.BufferAttribute;
    for (const f of [4, 5]) for (let k = 0; k < 4; k++) uv.setY(f * 4 + k, uv.getY(f * 4 + k) * 0.12);
    put(own, scene, deck, planks, mid, p.y - 0.08, -0.5, "both");
    put(own, scene, tiledBox(width + 0.2, 0.09, 0.1, 2.6), planks, mid, p.y - 0.2, 0.23, "cast");
    // The ledges stand a little behind the line the bandits run on, so that nobody is ever hidden by one.
    // Posts: at the ends of a low ledge; a high one hangs on two tall poles behind, out of the runners' way.
    for (const x of [p.x0 + 0.12, p.x1 - 0.12]) {
      const z = high ? -1.17 : 0.1,
        tall = p.y - 0.16,
        stand = (zz: number) => {
          put(own, scene, tiledCylinder(0.065, 0.08, tall, 8, 1.2), post, x, tall / 2, zz, "cast");
          // Rope lashing under the deck.
          for (const dy of [0, 0.07]) {
            const ring = put(own, scene, new T.TorusGeometry(0.085, 0.018, 5, 12), rope, x, p.y - 0.3 - dy, zz);
            ring.rotation.x = Math.PI / 2;
          }
        };
      stand(z);
      if (!high) stand(-1.13);
      // A brace from the post up under the deck, toward the middle.
      if (!high) {
        const inward = x < mid ? 1 : -1,
          brace = put(own, scene, new T.BoxGeometry(0.06, 0.6, 0.05), dark, x + inward * 0.2, p.y - 0.42, -1.13, "cast");
        brace.rotation.z = -inward * 0.75;
      }
    }
    // A lantern under its middle: a chain, an iron frame round warm glass, and its glow.
    put(own, scene, new T.CylinderGeometry(0.008, 0.008, 0.2, 4), iron, mid, p.y - 0.27, 0.15);
    put(own, scene, new T.ConeGeometry(0.07, 0.06, 6), iron, mid, p.y - 0.38, 0.15);
    put(own, scene, new T.CylinderGeometry(0.045, 0.045, 0.11, 6), lamp, mid, p.y - 0.46, 0.15);
    put(own, scene, new T.CylinderGeometry(0.06, 0.06, 0.02, 6), iron, mid, p.y - 0.52, 0.15);
    const s = new T.Sprite(glowing);
    s.position.set(mid, p.y - 0.46, 0.2);
    s.scale.setScalar(0.62);
    scene.add(s);
    flames.push({ sprite: s, base: 0.62, seed: mid * 3.1 + p.y, light: null });
  }
}
/** Stone blocks of mixed sizes in mortar (and their relief), and a roof's shingles in the side's colour. */
function stonePictures(own: Own, side: number, rich: boolean) {
  const W = 512,
    H = 512,
    rows = 8,
    random = stream(side + 50),
    blocks: [number, number, number, number, string][] = [];
  for (let r = 0; r < rows; r++) {
    let x = -random() * 40;
    while (x < W) {
      const w = 48 + random() * 64;
      blocks.push([x, (r * H) / rows, w, H / rows, ["#c2bcad", "#b5af9f", "#cbc5b6", "#aea897", "#bdb4a0", "#c8c0ae"][Math.floor(random() * 6)]]);
      x += w;
    }
  }
  const colour = canvas(W, H, (ctx) => {
    ctx.fillStyle = "#8b8578";
    ctx.fillRect(0, 0, W, H);
    for (const [x, y, w, h, c] of blocks) {
      for (const dx of [0, W]) {
        const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
        g.addColorStop(0, new T.Color(c).offsetHSL(0, 0, 0.06).getStyle());
        g.addColorStop(1, c);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x + 3 - dx, y + 3, w - 6, h - 6, 6);
        ctx.fill();
      }
    }
    for (let k = 0; k < 3000; k++) {
      ctx.fillStyle = random() < 0.5 ? "rgba(80,74,64,0.22)" : "rgba(235,230,220,0.2)";
      ctx.fillRect(random() * W, random() * H, 1 + random() * 3, 1 + random() * 2);
    }
    // Weathering: streaks down from the joins, and a few lichen spots.
    for (let k = 0; k < 40; k++) {
      const x = random() * W,
        y = random() * H,
        g = ctx.createLinearGradient(x, y, x, y + 60);
      g.addColorStop(0, "rgba(70,64,56,0.22)");
      g.addColorStop(1, "rgba(70,64,56,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, 3 + random() * 6, 60);
    }
    for (let k = 0; k < 24; k++) {
      ctx.fillStyle = random() < 0.5 ? "rgba(140,150,80,0.35)" : "rgba(200,190,120,0.3)";
      ctx.beginPath();
      ctx.arc(random() * W, random() * H, 3 + random() * 8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const stone = lambert(own, { map: texture(own, colour) });
  if (rich)
    stone.normalMap = normalFrom(
      own,
      canvas(W, H, (ctx) => {
        ctx.fillStyle = "#202020";
        ctx.fillRect(0, 0, W, H);
        for (const [x, y, w, h] of blocks)
          for (const dx of [0, W]) {
            ctx.fillStyle = "#b0b0b0";
            ctx.beginPath();
            ctx.roundRect(x + 4 - dx, y + 4, w - 8, h - 8, 8);
            ctx.fill();
            ctx.fillStyle = "#d8d8d8";
            ctx.beginPath();
            ctx.roundRect(x + 9 - dx, y + 9, w - 18, h - 18, 8);
            ctx.fill();
          }
        const r2 = stream(side + 9);
        for (let k = 0; k < 2000; k++) {
          ctx.fillStyle = r2() < 0.5 ? "rgba(0,0,0,0.15)" : "rgba(255,255,255,0.12)";
          ctx.fillRect(r2() * W, r2() * H, 2 + r2() * 4, 2 + r2() * 4);
        }
      }),
      3,
    );
  const roof = lambert(own, {
    map: painted(
      own,
      256,
      256,
      (ctx) => {
        const base = new T.Color(SIDE_COLORS[side]);
        ctx.fillStyle = base.clone().offsetHSL(0, 0, -0.18).getStyle();
        ctx.fillRect(0, 0, 256, 256);
        for (let r = 0; r < 8; r++)
          for (let k = -1; k < 9; k++) {
            const x = k * 32 + (r % 2) * 16,
              y = r * 32,
              g = ctx.createLinearGradient(0, y, 0, y + 34);
            g.addColorStop(0, base.clone().offsetHSL(0, 0, 0.06).getStyle());
            g.addColorStop(1, base.clone().offsetHSL(0, 0, -0.12).getStyle());
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 30, y);
            ctx.lineTo(x + 30, y + 22);
            ctx.quadraticCurveTo(x + 15, y + 38, x, y + 22);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.25)";
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
      },
      [6, 2],
    ),
  });
  return { stone, roof };
}
/** A cloth in the side's colour with a gold border and a gold crown on it (a flag or a banner). */
function heraldry(own: Own, side: number, tall: boolean) {
  const w = tall ? 128 : 256,
    h = tall ? 256 : 144;
  return painted(own, w, h, (ctx) => {
    const base = new T.Color(SIDE_COLORS[side]);
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, base.clone().offsetHSL(0, 0, 0.06).getStyle());
    g.addColorStop(1, base.clone().offsetHSL(0, 0, -0.08).getStyle());
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#f2c23a";
    ctx.lineWidth = tall ? 8 : 10;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    // A crown: three points over a band.
    const cx = w / 2,
      cy = h * (tall ? 0.42 : 0.52),
      s = (tall ? w : h) * 0.3;
    ctx.fillStyle = "#ffd24a";
    ctx.beginPath();
    ctx.moveTo(cx - s, cy + s * 0.5);
    ctx.lineTo(cx - s, cy - s * 0.35);
    ctx.lineTo(cx - s * 0.5, cy + s * 0.05);
    ctx.lineTo(cx, cy - s * 0.6);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.05);
    ctx.lineTo(cx + s, cy - s * 0.35);
    ctx.lineTo(cx + s, cy + s * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#b8862a";
    ctx.fillRect(cx - s, cy + s * 0.35, s * 2, s * 0.2);
    if (tall) {
      // A swallowtail cut at the bottom.
      ctx.globalCompositeOperation = "destination-out";
      ctx.beginPath();
      ctx.moveTo(0, h);
      ctx.lineTo(w / 2, h - 40);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
  });
}
/** Wooden doors with iron straps and studs. */
function doorPicture(own: Own) {
  return painted(own, 128, 256, (ctx) => {
    const random = stream(61);
    for (let b = 0; b < 4; b++) {
      ctx.fillStyle = ["#6e4626", "#7a4f2c", "#684223", "#754b29"][b];
      ctx.fillRect(b * 32, 0, 32, 256);
      for (let k = 0; k < 12; k++) {
        ctx.strokeStyle = "rgba(40,24,12,0.35)";
        ctx.lineWidth = 1;
        const x = b * 32 + random() * 32;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (random() - 0.5) * 3, 256);
        ctx.stroke();
      }
      ctx.fillStyle = "rgba(30,18,8,0.8)";
      ctx.fillRect(b * 32, 0, 2, 256);
    }
    for (const y of [40, 128, 216]) {
      ctx.fillStyle = "#2c2824";
      ctx.fillRect(0, y - 9, 128, 18);
      ctx.fillStyle = "#6a645c";
      for (let x = 8; x < 128; x += 20) {
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}
/** A castle for `side`, mirrored for the right one: built with +x outward from the field, the gate at the field's end. */
function castle(own: Own, scene: T.Scene, side: 0 | 1, rich: boolean, flames: Flame[], waving: T.Mesh[], halo: T.Texture, fire: T.Texture): Castle {
  const sign = side === 0 ? -1 : 1,
    colour = SIDE_COLORS[side],
    group = new T.Group(),
    CENTRE = GATE + 1.4,
    gate = GATE - CENTRE,
    { stone, roof } = stonePictures(own, side, rich),
    shade = lambert(own, { map: stone.map, color: "#c8c0b0" }),
    darkness = basic(own, { color: "#1a130e" }),
    iron = lambert(own, { color: "#2c2824" }),
    gold = lambert(own, { color: "#ffcc3a", emissive: "#6a4a00" }),
    timber = lambert(own, { color: "#6a4a30" });
  if (stone.normalMap) shade.normalMap = stone.normalMap;
  group.position.x = sign * CENTRE;
  group.scale.x = sign;
  scene.add(group);
  // The wall on a darker footing, and its battlements.
  put(own, group, tiledBox(4.6, 3.1, 1.6, 1.6), stone, 0.5, 1.55, -1.95, "both");
  put(own, group, tiledBox(4.7, 0.35, 1.7, 1.6), lambert(own, { map: stone.map, color: "#9a9284" }), 0.5, 0.17, -1.95, "both");
  put(own, group, tiledBox(4.7, 0.1, 1.66, 1.6), shade, 0.5, 3.12, -1.95, "cast");
  for (let k = 0; k < 7; k++) put(own, group, tiledBox(0.36, 0.42, 0.3, 1.6), stone, -1.55 + k * 0.69, 3.36, -1.3, "cast");
  // The gate: an arch in a frame of lighter stone, its doors swung open, its portcullis drawn up, a banner over it.
  put(own, group, tiledBox(1.8, 2.25, 0.14, 1.6), shade, gate, 1.12, -1.12, "receive");
  put(own, group, new T.BoxGeometry(1.25, 1.35, 0.06), darkness, gate, 0.68, -1.04);
  const arch = put(own, group, new T.CircleGeometry(0.625, 24, 0, Math.PI), darkness, gate, 1.35, -1.01);
  arch.renderOrder = 1;
  const voussoirs = put(own, group, new T.TorusGeometry(0.7, 0.09, 6, 18, Math.PI), shade, gate, 1.35, -1.0, "cast");
  voussoirs.scale.z = 0.6;
  for (const dx of [-0.7, 0.7]) put(own, group, tiledBox(0.18, 1.35, 0.14, 1.6), shade, gate + dx, 0.68, -1.0, "cast");
  // The portcullis drawn up into the arch.
  for (let k = 0; k < 5; k++) put(own, group, new T.BoxGeometry(0.035, 0.5, 0.03), iron, gate - 0.5 + k * 0.25, 1.62, -0.99);
  for (const y of [1.4, 1.58]) put(own, group, new T.BoxGeometry(1.25, 0.035, 0.03), iron, gate, y, -0.99);
  // Doors swung back against the wall either side.
  const doors = lambert(own, { map: doorPicture(own), side: T.DoubleSide });
  for (const dx of [-1, 1]) {
    // Hinged at the arch's sides and swung out toward the road.
    const open = 1.25,
      d = put(own, group, new T.PlaneGeometry(0.62, 1.28), doors, gate + dx * (0.625 + 0.31 * Math.cos(open)), 0.66, -1.0 + 0.31 * Math.sin(open), "cast");
    d.rotation.y = -dx * open;
  }
  // A banner over the gate, and a torch at each side of it.
  const banner = put(own, group, new T.PlaneGeometry(0.62, 0.9, 1, 8), lambert(own, { map: heraldry(own, side, true), transparent: true, alphaTest: 0.3, side: T.DoubleSide }), gate, 2.52, -1.03);
  waving.push(banner);
  const flame = own(new T.SpriteMaterial({ map: fire, color: "#ffb060", transparent: true, depthWrite: false, blending: T.AdditiveBlending })),
    warm = own(new T.SpriteMaterial({ map: halo, color: "#ff9a40", transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending }));
  for (const dx of [-1.05, 1.05]) {
    put(own, group, new T.BoxGeometry(0.08, 0.08, 0.16), iron, gate + dx, 1.85, -0.98);
    const stick = put(own, group, new T.CylinderGeometry(0.03, 0.022, 0.42, 6), timber, gate + dx, 2.0, -0.9);
    stick.rotation.x = 0.25;
    put(own, group, new T.CylinderGeometry(0.05, 0.035, 0.08, 7), iron, gate + dx, 2.2, -0.86);
    const f = new T.Sprite(flame);
    f.position.set(gate + dx, 2.36, -0.83);
    f.scale.set(0.26, 0.42, 1);
    f.center.set(0.5, 0.2);
    group.add(f);
    const h = new T.Sprite(warm);
    h.position.set(gate + dx, 2.32, -0.8);
    h.scale.setScalar(1.1);
    group.add(h);
    let light: T.PointLight | null = null;
    if (rich) {
      light = new T.PointLight("#ff9a48", 2.2, 3.2, 2);
      light.position.set(gate + dx, 2.4, -0.6);
      group.add(light);
    }
    flames.push({ sprite: f, base: 0.42, seed: side * 7 + dx * 3, light });
  }
  // Windows along the wall, in stone frames with sills: lit one by one as the treasury fills.
  const windows: T.MeshBasicMaterial[] = [];
  for (let k = 0; k < 3; k++) {
    const glass = basic(own, { color: "#3a3028" }),
      x = 0.15 + k * 0.72;
    put(own, group, tiledBox(0.44, 0.08, 0.12, 1.6), shade, x, 1.9, -1.1, "cast");
    const frame = put(own, group, new T.TorusGeometry(0.17, 0.045, 5, 12, Math.PI), shade, x, 2.46, -1.13);
    frame.scale.z = 0.5;
    for (const dx of [-0.19, 0.19]) put(own, group, new T.BoxGeometry(0.06, 0.52, 0.06), shade, x + dx, 2.2, -1.13);
    put(own, group, new T.PlaneGeometry(0.3, 0.52), glass, x, 2.2, -1.14);
    put(own, group, new T.CircleGeometry(0.15, 12, 0, Math.PI), glass, x, 2.46, -1.14);
    put(own, group, new T.BoxGeometry(0.02, 0.62, 0.02), iron, x, 2.25, -1.12);
    windows.push(glass);
  }
  // The turret over the gate (the fire pots come from here), and the great tower with its corbels, roof and flag.
  put(own, group, tiledCylinder(0.5, 0.55, 4.1, 16, 1.6), stone, gate - 0.95, 2.05, -1.9, "both");
  put(own, group, tiledCylinder(0.6, 0.6, 0.18, 16, 1.6), shade, gate - 0.95, 4.12, -1.9, "cast");
  put(own, group, new T.ConeGeometry(0.72, 1.05, 16), roof, gate - 0.95, 4.72, -1.9, "cast");
  put(own, group, new T.SphereGeometry(0.06, 8, 6), gold, gate - 0.95, 5.28, -1.9);
  put(own, group, tiledCylinder(1.05, 1.15, 5.6, 22, 1.6), stone, 1.75, 2.8, -2.15, "both");
  const corbel = own(new T.BoxGeometry(0.16, 0.22, 0.2));
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2,
      c = new T.Mesh(corbel, shade);
    c.position.set(1.75 + Math.cos(a) * 1.12, 5.38, -2.15 + Math.sin(a) * 1.12);
    c.rotation.y = -a;
    c.castShadow = true;
    group.add(c);
  }
  put(own, group, tiledCylinder(1.24, 1.24, 0.3, 22, 1.6), shade, 1.75, 5.62, -2.15, "cast");
  put(own, group, new T.ConeGeometry(1.4, 1.9, 22), roof, 1.75, 6.72, -2.15, "cast");
  put(own, group, new T.SphereGeometry(0.08, 8, 6), gold, 1.75, 7.7, -2.15);
  put(own, group, new T.CylinderGeometry(0.025, 0.025, 1.1, 5), timber, 1.75, 8.05, -2.15);
  const flag = put(own, group, new T.PlaneGeometry(0.86, 0.5, 12, 3), lambert(own, { map: heraldry(own, side, false), side: T.DoubleSide }), 1.32, 8.32, -2.15);
  waving.push(flag);
  // The treasury's slit down the tower: a dark frame, and the gold that rises in it.
  put(own, group, new T.BoxGeometry(0.66, GAUGE_TALL + 0.3, 0.06), basic(own, { color: "#2a2018" }), 1.75, 2.75, -1.08);
  const gauge = put(own, group, new T.BoxGeometry(0.46, 1, 0.05), basic(own, { color: "#ffcf3a" }), 1.75, 1.2, -1.03);
  gauge.scale.y = 0.001;
  // Marks at the quarters.
  for (let k = 1; k < 4; k++) put(own, group, new T.BoxGeometry(0.66, 0.03, 0.02), shade, 1.75, 1.2 + (GAUGE_TALL * k) / 4, -1.0);
  // The ring on the road before the gate: where the gold is brought.
  const ring = new T.Mesh(own(new T.RingGeometry(0.72, 0.92, 36)), basic(own, { color: colour, transparent: true, opacity: 0.75, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(sign * GATE, 0.03, 0.45);
  scene.add(ring);
  return { gauge, windows, flag, ring };
}
/** A flame: a hot white-yellow core in an orange tongue that fades upward. */
function flamePicture(own: Own) {
  return texture(
    own,
    canvas(64, 128, (ctx) => {
      const g = ctx.createRadialGradient(32, 92, 2, 32, 80, 52);
      g.addColorStop(0, "rgba(255,250,220,1)");
      g.addColorStop(0.25, "rgba(255,200,90,0.95)");
      g.addColorStop(0.6, "rgba(255,110,30,0.55)");
      g.addColorStop(1, "rgba(200,40,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(32, 4);
      ctx.bezierCurveTo(52, 50, 60, 80, 32, 124);
      ctx.bezierCurveTo(4, 80, 12, 50, 32, 4);
      ctx.fill();
    }),
  );
}
/** Builds the whole valley into `scene` and hands back what moves. `rich`: a graphics card draws it (relief, torch light, more tufts). */
export function buildValley(scene: T.Scene, own: Own, rich: boolean): Valley {
  const wind = { value: 0 },
    flames: Flame[] = [],
    waving: T.Mesh[] = [],
    halo = glow(own, 128, 0.1),
    fire = flamePicture(own);
  sky(own, scene);
  const { clouds, sun, spin } = backdrop(own, scene);
  ground(own, scene, rich, wind);
  ledges(own, scene, rich, flames, halo);
  const castles: [Castle, Castle] = [castle(own, scene, 0, rich, flames, waving, halo, fire), castle(own, scene, 1, rich, flames, waving, halo, fire)];
  // The cloths' corners as made, to wave from.
  const rest = waving.map((m) => (m.geometry.getAttribute("position") as T.BufferAttribute).array.slice());
  return {
    castles,
    clouds,
    sun,
    tick(t, dt) {
      wind.value = t;
      spin.rotation = t * 0.02;
      for (const f of flames) {
        const flicker = 0.85 + 0.1 * Math.sin(t * 13 + f.seed) + 0.08 * Math.sin(t * 29 + f.seed * 2.3);
        f.sprite.scale.y = f.base * flicker;
        if (f.base > 0.5) f.sprite.scale.x = f.base * flicker;
        if (f.light) f.light.intensity = 2.2 * flicker;
      }
      if (dt <= 0 && t > 0.1) return;
      waving.forEach((m, k) => {
        const pos = m.geometry.getAttribute("position") as T.BufferAttribute,
          from = rest[k],
          flag = k % 2 === 1;
        for (let i = 0; i < pos.count; i++) {
          const x = from[i * 3],
            y = from[i * 3 + 1],
            // A flag flies from its pole (its right edge, toward the pole); a banner hangs from its top.
            along = flag ? (0.43 - x) / 0.86 : (0.45 - y) / 0.9,
            wave = flag ? Math.sin(t * 6.5 + along * 7 + k) * 0.09 * along + Math.sin(t * 11 + along * 13) * 0.02 * along : Math.sin(t * 2.2 + along * 4 + k) * 0.03 * along;
          pos.setZ(i, from[i * 3 + 2] + wave);
          if (flag) pos.setY(i, y - along * along * 0.05 + Math.sin(t * 4 + along * 5) * 0.015 * along);
        }
        pos.needsUpdate = true;
        m.geometry.computeVertexNormals();
      });
    },
  };
}
