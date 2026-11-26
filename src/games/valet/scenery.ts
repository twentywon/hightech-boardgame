import * as T from "three";
import { block } from "../../engine/scene-utils";
import type { Lot, Pillar } from "./sim";

/**
 * What a car park looks like round its bays: the light it is seen by, its floor, its kerbs, and everything about it
 * (the street and the grass of the mart, the burger restaurant by night, the walls and pipes of the car park under
 * the ground). The bays, the booth, the barriers and the marks of the game are laid by the view; this lays the rest
 * into `into` (cleared and disposed with the lot) and says how the view is to light and paint the game's own things.
 * Every picture is drawn in code on canvases (colour, bump and shine), so nothing is fetched.
 */
export interface Look {
  /** Which setting it is (told to tests on the canvas as `data-scene`). */
  name: "mart" | "burger-night" | "underground";
  /** Dark round the lot: cars drive with their lights on, and the lines and the booth's window are lit. */
  dark: boolean;
  /** How bright a car's headlight beams are on the ground (0 by day). */
  beams: number;
  clear: string;
  /** The sky light: its sky colour, ground colour and strength. */
  sky: [string, string, number];
  /** The one light that casts shadows (the sun, the moon, the ceiling lights). */
  sun: { color: string; intensity: number; at: [number, number, number] };
  /** The lot's own floor (as large as the lot, its pattern repeated to scale). */
  floor: T.Material;
  /** The painted lines of the bays. */
  line: T.Material;
  /** A kerb `length` long. */
  kerb: (length: number) => T.Material;
  /** Whether the view puts up its plain lamp posts along the back. */
  lamps: boolean;
  /** Draws a pillar (else the view's plain one). */
  pillar?: (p: Pillar) => void;
  /** A little room whose reflection the shiny things take (paint, glass, a polished floor), where a graphics card is at hand. */
  room?: () => { scene: T.Scene; intensity: number };
  /** Neon that flickers, glows that breathe: called each frame with the time in seconds. */
  tick?: (t: number) => void;
}

type Pen = CanvasRenderingContext2D;
// The same speckles every time a lot is laid (not that anyone would notice; but pictures stay comparable).
let seed = 1;
const rand = () => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return ((seed >>> 0) % 1_000_000) / 1_000_000;
};
function canvas(w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}
/** A colour texture drawn by `draw`, repeated `rx` × `ry` times. */
function picture(
  w: number,
  h: number,
  draw: (pen: Pen, w: number, h: number) => void,
  rx = 1,
  ry = 1,
  colour = true,
) {
  const c = canvas(w, h);
  draw(c.getContext("2d")!, w, h);
  return wrap(new T.CanvasTexture(c), rx, ry, colour);
}
function wrap(texture: T.Texture, rx: number, ry: number, colour: boolean) {
  if (colour) texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 8;
  if (rx !== 1 || ry !== 1) {
    texture.wrapS = texture.wrapT = T.RepeatWrapping;
    texture.repeat.set(rx, ry);
  }
  return texture;
}
/** A bump map turned into a normal map (`strength` how steep its slopes are), repeated as the colour is. */
function normals(
  height: HTMLCanvasElement,
  strength: number,
  rx: number,
  ry: number,
) {
  const w = height.width,
    h = height.height,
    from = height.getContext("2d")!.getImageData(0, 0, w, h).data,
    out = canvas(w, h),
    pen = out.getContext("2d")!,
    image = pen.createImageData(w, h),
    at = (x: number, y: number) =>
      from[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength,
        dy = (at(x, y + 1) - at(x, y - 1)) * strength,
        n = 1 / Math.hypot(dx, dy, 1),
        k = (y * w + x) * 4;
      image.data[k] = (-dx * n * 0.5 + 0.5) * 255;
      image.data[k + 1] = (dy * n * 0.5 + 0.5) * 255;
      image.data[k + 2] = (n * 0.5 + 0.5) * 255;
      image.data[k + 3] = 255;
    }
  pen.putImageData(image, 0, 0);
  return wrap(new T.CanvasTexture(out), rx, ry, false);
}
/** Grit: `count` specks of light and dark over what is drawn. */
function grit(
  pen: Pen,
  w: number,
  h: number,
  count: number,
  alpha: number,
  size = 2,
) {
  for (let k = 0; k < count; k++) {
    pen.fillStyle = `rgba(${k % 2 ? "255,255,255" : "0,0,0"},${alpha * (0.4 + rand())})`;
    pen.fillRect(
      rand() * w,
      rand() * h,
      0.6 + rand() * size,
      0.6 + rand() * size,
    );
  }
}
/** Soft blotches (stains, wet patches, wear), `colour` with an alpha that fades to the edge. */
function blotches(
  pen: Pen,
  w: number,
  h: number,
  count: number,
  colour: (a: number) => string,
  size: number,
  alpha: number,
) {
  for (let k = 0; k < count; k++) {
    const x = rand() * w,
      y = rand() * h,
      r = size * (0.4 + rand()),
      g = pen.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, colour(alpha * (0.5 + rand() * 0.5)));
    g.addColorStop(1, colour(0));
    pen.fillStyle = g;
    pen.save();
    pen.translate(x, y);
    pen.scale(1, 0.5 + rand());
    pen.translate(-x, -y);
    pen.beginPath();
    pen.arc(x, y, r, 0, Math.PI * 2);
    pen.fill();
    pen.restore();
  }
}
/** Diagonal yellow and black bands, as on whatever a car must not hit. */
function hazard(
  pen: Pen,
  x: number,
  y: number,
  w: number,
  h: number,
  band: number,
) {
  pen.save();
  pen.beginPath();
  pen.rect(x, y, w, h);
  pen.clip();
  pen.fillStyle = "#f0c021";
  pen.fillRect(x, y, w, h);
  pen.fillStyle = "#1b1b1b";
  for (let k = -h; k < w + h; k += band * 2) {
    pen.beginPath();
    pen.moveTo(x + k, y + h);
    pen.lineTo(x + k + band, y + h);
    pen.lineTo(x + k + band + h, y);
    pen.lineTo(x + k + h, y);
    pen.fill();
  }
  pen.restore();
}
/** Words that glow (a neon or a lit sign): drawn twice, blurred under and sharp over. */
function glowText(
  pen: Pen,
  text: string,
  x: number,
  y: number,
  font: string,
  colour: string,
  glow: string,
  blur: number,
) {
  pen.font = font;
  pen.textAlign = "center";
  pen.textBaseline = "middle";
  pen.shadowColor = glow;
  pen.shadowBlur = blur;
  pen.fillStyle = glow;
  pen.fillText(text, x, y);
  pen.shadowBlur = blur / 3;
  pen.fillStyle = colour;
  pen.fillText(text, x, y);
  pen.shadowBlur = 0;
}

/** The view's tools for laying things, bound to the lot's group. */
class Layer {
  constructor(readonly into: T.Group) {}
  /** A white blob that fades to its edge, for glows and pools of light (shared within a lot). */
  readonly blob = picture(128, 128, (pen) => {
    const g = pen.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(0.6, "rgba(255,255,255,0.14)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    pen.fillStyle = g;
    pen.fillRect(0, 0, 128, 128);
  });
  /** A soft-edged oblong of light (the light from a window, from a row of tubes). */
  readonly oblong = picture(128, 128, (pen) => {
    const image = pen.createImageData(128, 128);
    for (let y = 0; y < 128; y++)
      for (let x = 0; x < 128; x++) {
        const fx = Math.min(1, Math.min(x, 127 - x) / 40),
          fy = Math.min(1, Math.min(y, 127 - y) / 40),
          a =
            Math.sin((fx * Math.PI) / 2) ** 2 *
            Math.sin((fy * Math.PI) / 2) ** 2,
          k = (y * 128 + x) * 4;
        image.data[k] = image.data[k + 1] = image.data[k + 2] = 255;
        image.data[k + 3] = a * 255;
      }
    pen.putImageData(image, 0, 0);
  });
  mesh(
    g: T.BufferGeometry,
    m: T.Material | T.Material[],
    x: number,
    y: number,
    z: number,
    shadow = true,
  ) {
    const mesh = new T.Mesh(g, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.into.add(mesh);
    return mesh;
  }
  /** Something flat on the ground (`turn` about the up axis). */
  flat(
    w: number,
    d: number,
    m: T.Material,
    x: number,
    z: number,
    y = 0.012,
    turn = 0,
  ) {
    const mesh = this.mesh(new T.PlaneGeometry(w, d), m, x, y, z, false);
    mesh.rotation.set(-Math.PI / 2, 0, turn);
    return mesh;
  }
  /** Something upright facing the viewer (+z), leaning back by `lean`. */
  upright(
    w: number,
    h: number,
    m: T.Material,
    x: number,
    y: number,
    z: number,
    lean = 0,
  ) {
    const mesh = this.mesh(new T.PlaneGeometry(w, h), m, x, y, z, false);
    mesh.rotation.x = -lean;
    return mesh;
  }
  /** A pool of light on the ground, added to what is there. */
  pool(
    x: number,
    z: number,
    w: number,
    d: number,
    colour: string,
    strength: number,
    oblong = false,
    y = 0.017,
  ) {
    const m = new T.MeshBasicMaterial({
      map: oblong ? this.oblong : this.blob,
      color: colour,
      transparent: true,
      opacity: strength,
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const mesh = this.flat(w, d, m, x, z, y);
    mesh.receiveShadow = false;
    mesh.renderOrder = 1;
    return m;
  }
  /** A glow round a lamp, always facing the viewer. */
  glow(
    x: number,
    y: number,
    z: number,
    size: number,
    colour: string,
    strength: number,
  ) {
    const m = new T.SpriteMaterial({
      map: this.blob,
      color: colour,
      transparent: true,
      opacity: strength,
      blending: T.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const sprite = new T.Sprite(m);
    sprite.position.set(x, y, z);
    sprite.scale.set(size, size, 1);
    sprite.renderOrder = 2;
    this.into.add(sprite);
    return m;
  }
  light(
    colour: string,
    intensity: number,
    distance: number,
    x: number,
    y: number,
    z: number,
    decay = 1.3,
  ) {
    const light = new T.PointLight(colour, intensity, distance, decay);
    light.position.set(x, y, z);
    this.into.add(light);
    return light;
  }
}

/** The sky light, the sun and the floor of the lot of `stage`, with all that is round it laid into `into`. */
export function dress(stage: number, lot: Lot, into: T.Group): Look {
  seed = 0x2f6e2b1 + stage;
  const layer = new Layer(into);
  return stage === 2
    ? burgerNight(lot, layer)
    : stage === 3
      ? underground(lot, layer)
      : mart(lot, layer);
}

/** Asphalt: aggregate speckled light and dark, patched, stained by oil; `wet` how much of it shines from rain. */
function asphalt(
  size: number,
  base: string,
  rx: number,
  ry: number,
  wet: number,
) {
  const bump = canvas(size, size),
    bp = bump.getContext("2d")!;
  bp.fillStyle = "#808080";
  bp.fillRect(0, 0, size, size);
  for (let k = 0; k < size * size * 0.05; k++) {
    const v = 90 + rand() * 120;
    bp.fillStyle = `rgb(${v},${v},${v})`;
    const r = 0.6 + rand() * 1.8;
    bp.fillRect(rand() * size, rand() * size, r, r);
  }
  const map = picture(
    size,
    size,
    (pen, w, h) => {
      pen.fillStyle = base;
      pen.fillRect(0, 0, w, h);
      blotches(pen, w, h, 14, (a) => `rgba(0,0,0,${a})`, w * 0.18, 0.16);
      blotches(pen, w, h, 10, (a) => `rgba(255,255,255,${a})`, w * 0.2, 0.05);
      grit(pen, w, h, size * size * 0.06, 0.12, 2.2);
      // Stones in the mix, a little lighter.
      for (let k = 0; k < size * 3; k++) {
        pen.fillStyle = `rgba(${170 + rand() * 60},${165 + rand() * 60},${160 + rand() * 50},${0.1 + rand() * 0.2})`;
        pen.fillRect(
          rand() * w,
          rand() * h,
          1 + rand() * 2.5,
          1 + rand() * 2.5,
        );
      }
      // Thin cracks.
      pen.strokeStyle = "rgba(0,0,0,0.35)";
      pen.lineWidth = 1;
      for (let k = 0; k < 6; k++) {
        let x = rand() * w,
          y = rand() * h;
        pen.beginPath();
        pen.moveTo(x, y);
        for (let s = 0; s < 14; s++)
          pen.lineTo((x += (rand() - 0.5) * 22), (y += (rand() - 0.3) * 16));
        pen.stroke();
      }
      // Oil dropped where cars stand.
      blotches(pen, w, h, 8, (a) => `rgba(12,10,8,${a})`, w * 0.05, 0.4);
    },
    rx,
    ry,
  );
  const rough = picture(
    size / 2,
    size / 2,
    (pen, w, h) => {
      pen.fillStyle = "#e0e0e0";
      pen.fillRect(0, 0, w, h);
      // Wet patches shine (smooth), the rest is rough.
      blotches(
        pen,
        w,
        h,
        Math.round(20 * wet),
        (a) => `rgba(40,40,40,${a})`,
        w * 0.2,
        0.9,
      );
      grit(pen, w, h, w * h * 0.03, 0.15);
    },
    rx,
    ry,
    false,
  );
  return { map, normal: normals(bump, 2.2, rx, ry), rough };
}

/** The supermarket's lot by day: grass, the street past the entrance, the road the exit leads to. */
function mart(lot: Lot, layer: Layer): Look {
  const w = lot.maxX - lot.minX,
    d = lot.maxZ - lot.minZ;
  const grass = new T.MeshStandardMaterial({ color: "#6a9550", roughness: 1 }),
    road = new T.MeshStandardMaterial({ color: "#44474d", roughness: 0.95 }),
    walk = new T.MeshStandardMaterial({ color: "#b9b5ab", roughness: 0.9 });
  layer.flat(160, 120, grass, 0, 0, -0.04).receiveShadow = true;
  // The street runs past the entrance; cars turn in from it.
  layer.flat(9, 120, road, -16 - 5.2, 0, -0.02).receiveShadow = true;
  layer.flat(1.4, 120, walk, -16 - 0.3, 0, -0.012).receiveShadow = true;
  layer.flat(30, 7.4, road, 16 + 15, 0, -0.02).receiveShadow = true;
  const dash = new T.MeshStandardMaterial({ color: "#e8e4d2", roughness: 0.8 });
  for (let k = -8; k <= 8; k++)
    layer.flat(0.16, 2.2, dash, -16 - 5.2, k * 5, -0.012);
  // Asphalt, speckled like the real thing.
  const speckle = picture(256, 256, (pen) => {
    pen.fillStyle = "#54585f";
    pen.fillRect(0, 0, 256, 256);
    for (let k = 0; k < 2600; k++) {
      pen.fillStyle = `rgba(${k % 2 ? "255,255,255" : "0,0,0"},${0.04 + rand() * 0.07})`;
      pen.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
    }
  });
  speckle.wrapS = speckle.wrapT = T.RepeatWrapping;
  speckle.repeat.set(w / 8, d / 8);
  const kerb = new T.MeshStandardMaterial({ color: "#c9c5ba", roughness: 0.8 });
  return {
    name: "mart",
    dark: false,
    beams: 0,
    clear: "#8fb4d8",
    sky: ["#eaf3ff", "#5a6a4a", 1.7],
    sun: { color: "#fff1d6", intensity: 2.2, at: [-10, 26, 12] },
    floor: new T.MeshStandardMaterial({ map: speckle, roughness: 0.95 }),
    line: new T.MeshStandardMaterial({ color: "#f1efe6", roughness: 0.7 }),
    kerb: () => kerb,
    lamps: true,
  };
}

/** The brand of the burger restaurant (made up): a crescent moon behind a burger. */
function logo(pen: Pen, x: number, y: number, r: number) {
  // The crescent is cut on a canvas of its own (so that the cut does not go through what is under it).
  const size = Math.ceil(r * 3),
    moon = canvas(size, size),
    mp = moon.getContext("2d")!,
    c = size / 2;
  mp.fillStyle = "#ffd76a";
  mp.beginPath();
  mp.arc(c, c, r, 0, Math.PI * 2);
  mp.fill();
  mp.globalCompositeOperation = "destination-out";
  mp.beginPath();
  mp.arc(c + r * 0.42, c - r * 0.3, r * 0.86, 0, Math.PI * 2);
  mp.fill();
  pen.save();
  pen.shadowColor = "#ffcf5a";
  pen.shadowBlur = r * 0.5;
  pen.drawImage(moon, x - c, y - c);
  pen.restore();
  // The burger: a bun, lettuce, a patty, a bun.
  const bx = x + r * 0.18,
    by = y + r * 0.28,
    bw = r * 1.05;
  pen.save();
  pen.shadowColor = "#ff8a3d";
  pen.shadowBlur = r * 0.25;
  pen.fillStyle = "#f59a3c";
  pen.beginPath();
  pen.ellipse(bx, by - r * 0.16, bw / 2, r * 0.3, 0, Math.PI, 0);
  pen.fill();
  pen.fillStyle = "#58c26a";
  pen.fillRect(bx - bw / 2, by - r * 0.16, bw, r * 0.1);
  pen.fillStyle = "#6b2f1c";
  pen.fillRect(bx - bw / 2 + r * 0.03, by - r * 0.06, bw - r * 0.06, r * 0.16);
  pen.fillStyle = "#f59a3c";
  pen.beginPath();
  pen.roundRect(bx - bw / 2, by + r * 0.1, bw, r * 0.17, r * 0.08);
  pen.fill();
  // Sesame.
  pen.fillStyle = "#fff3c8";
  for (const [sx, sy] of [
    [-0.2, -0.32],
    [0.05, -0.38],
    [0.25, -0.3],
    [-0.05, -0.25],
  ])
    pen.fillRect(bx + sx * r, by + sy * r, r * 0.06, r * 0.035);
  pen.restore();
}

/**
 * The burger restaurant's lot at night: dark rain-wet asphalt with its lines, a restaurant with big warm windows and a
 * neon on its roof behind the lot, a lit sign on a tall post, the drive-through lane with its menu board, tall lamps
 * that throw pools of light, the street lit orange, the grass and the hedges dark.
 */
function burgerNight(lot: Lot, layer: Layer): Look {
  const w = lot.maxX - lot.minX,
    d = lot.maxZ - lot.minZ;
  // The ground round it all, dark grass; the street and the road out.
  const grassTex = picture(
    256,
    256,
    (pen, gw, gh) => {
      pen.fillStyle = "#18221a";
      pen.fillRect(0, 0, gw, gh);
      blotches(pen, gw, gh, 20, (a) => `rgba(40,60,30,${a})`, 40, 0.5);
      grit(pen, gw, gh, 9000, 0.18, 1.5);
    },
    30,
    22,
  );
  layer.flat(
    160,
    120,
    new T.MeshStandardMaterial({ map: grassTex, roughness: 1 }),
    0,
    0,
    -0.05,
  ).receiveShadow = true;
  const street = asphalt(512, "#2a2c30", 1.4, 16, 1);
  const roadMat = new T.MeshStandardMaterial({
    map: street.map,
    normalMap: street.normal,
    normalScale: new T.Vector2(0.5, 0.5),
    roughnessMap: street.rough,
    roughness: 0.9,
  });
  layer.flat(9, 120, roadMat, -21.2, 0, -0.02).receiveShadow = true;
  const exitRoad = asphalt(512, "#2a2c30", 4.5, 1.1, 1);
  layer.flat(
    30,
    7.4,
    new T.MeshStandardMaterial({
      map: exitRoad.map,
      normalMap: exitRoad.normal,
      roughnessMap: exitRoad.rough,
      roughness: 0.9,
    }),
    31,
    0,
    -0.02,
  ).receiveShadow = true;
  const paving = picture(256, 256, (pen, pw, ph) => {
    pen.fillStyle = "#56544f";
    pen.fillRect(0, 0, pw, ph);
    grit(pen, pw, ph, 5000, 0.12);
    pen.strokeStyle = "rgba(0,0,0,0.45)";
    pen.lineWidth = 2;
    for (let k = 0; k <= 256; k += 64) {
      pen.beginPath();
      pen.moveTo(k, 0);
      pen.lineTo(k, 256);
      pen.moveTo(0, k);
      pen.lineTo(256, k);
      pen.stroke();
    }
  });
  paving.wrapS = paving.wrapT = T.RepeatWrapping;
  const walk = (pw: number, pd: number, x: number, z: number) => {
    const t = paving.clone();
    t.repeat.set(pw / 2, pd / 2);
    t.needsUpdate = true;
    layer.flat(
      pw,
      pd,
      new T.MeshStandardMaterial({ map: t, roughness: 0.85 }),
      x,
      z,
      -0.01,
    ).receiveShadow = true;
  };
  walk(1.4, 120, -16.3, 0);
  // The pavement between the lot and the restaurant.
  walk(42, 2.2, 4.4, lot.minZ - 1.3);
  const dash = new T.MeshStandardMaterial({
    color: "#d9b648",
    roughness: 0.6,
    emissive: "#2a2208",
  });
  for (let k = -8; k <= 8; k++)
    layer.flat(0.16, 2.2, dash, -21.2, k * 5, -0.012);

  // The restaurant behind the lot: a box with a flat roof, its front all glass from the knees up.
  const front = lot.minZ - 2.1,
    width = 17,
    depth = 8,
    height = 3.9,
    cx = -1.5;
  const wall = new T.MeshStandardMaterial({ color: "#2b2f36", roughness: 0.7 });
  const roofTex = picture(
    256,
    128,
    (pen, rw, rh) => {
      pen.fillStyle = "#3a3c40";
      pen.fillRect(0, 0, rw, rh);
      grit(pen, rw, rh, 9000, 0.22, 1.6);
    },
    3,
    2,
  );
  const roof = new T.MeshStandardMaterial({ map: roofTex, roughness: 1 });
  layer.mesh(
    new T.BoxGeometry(width, height, depth),
    [wall, wall, roof, wall, wall, wall],
    cx,
    height / 2,
    front - depth / 2,
  );
  // A parapet round the roof and the boxes of the air conditioning on it.
  const parapet = new T.MeshStandardMaterial({
    color: "#1a8f86",
    roughness: 0.5,
    metalness: 0.2,
  });
  layer.mesh(
    new T.BoxGeometry(width + 0.3, 0.55, 0.3),
    parapet,
    cx,
    height + 0.2,
    front + 0.05,
  );
  const steel = new T.MeshStandardMaterial({
    color: "#8a9096",
    roughness: 0.4,
    metalness: 0.6,
  });
  for (const [x, z] of [
    [cx - 5, front - 4],
    [cx + 4.5, front - 5],
  ]) {
    layer.mesh(block(2, 0.9, 1.4, 0.06), steel, x, height + 0.45, z);
    layer.mesh(
      new T.CylinderGeometry(0.42, 0.42, 0.06, 18),
      new T.MeshStandardMaterial({ color: "#222", roughness: 0.6 }),
      x + 0.4,
      height + 0.93,
      z,
    );
  }
  // The front: windows lit warm from within, a door, a teal band over them.
  const fw = 1600,
    fh = Math.round((fw * height) / width),
    px = fw / width,
    glassTop = 2.45,
    glassBottom = 0.4;
  const drawFront = (lit: boolean) => (pen: Pen) => {
    pen.fillStyle = lit ? "#000" : "#2b2f36";
    pen.fillRect(0, 0, fw, fh);
    const top = fh - glassTop * px,
      bottom = fh - glassBottom * px,
      left = 0.4 * px,
      right = fw - 0.4 * px;
    // Inside: warm light, the counter and its menu boards at the back, lamps hanging, tables and people.
    const inside = pen.createLinearGradient(0, top, 0, bottom);
    inside.addColorStop(0, "#ffd99a");
    inside.addColorStop(0.55, "#ffbf6e");
    inside.addColorStop(1, "#d9823e");
    pen.fillStyle = inside;
    pen.fillRect(left, top, right - left, bottom - top);
    // Menu boards over the counter.
    for (let k = 0; k < 4; k++) {
      const mx = left + 2.2 * px + k * 2.1 * px,
        my = top + 0.18 * px;
      pen.fillStyle = "#2a1e1a";
      pen.fillRect(mx, my, 1.8 * px, 0.5 * px);
      for (let r = 0; r < 3; r++) {
        pen.fillStyle = ["#ffcf5a", "#ff8a3d", "#f4efe2"][r];
        pen.fillRect(
          mx + 0.1 * px,
          my + (0.08 + r * 0.14) * px,
          (0.6 + rand() * 0.8) * px,
          0.06 * px,
        );
      }
      pen.fillStyle = "#f59a3c";
      pen.beginPath();
      pen.arc(mx + 1.5 * px, my + 0.25 * px, 0.15 * px, 0, Math.PI * 2);
      pen.fill();
    }
    // The counter.
    pen.fillStyle = "#7a3b22";
    pen.fillRect(left + 1.6 * px, top + 0.85 * px, 9 * px, 0.45 * px);
    pen.fillStyle = "#f2e6cf";
    pen.fillRect(left + 1.6 * px, top + 0.82 * px, 9 * px, 0.06 * px);
    // Pendant lamps.
    for (let k = 0; k < 9; k++) {
      const lx = left + (0.9 + k * 1.75) * px;
      pen.strokeStyle = "rgba(60,30,10,0.6)";
      pen.lineWidth = 2;
      pen.beginPath();
      pen.moveTo(lx, top);
      pen.lineTo(lx, top + 0.3 * px);
      pen.stroke();
      const g = pen.createRadialGradient(
        lx,
        top + 0.35 * px,
        0,
        lx,
        top + 0.35 * px,
        0.45 * px,
      );
      g.addColorStop(0, "rgba(255,255,235,1)");
      g.addColorStop(1, "rgba(255,240,200,0)");
      pen.fillStyle = g;
      pen.fillRect(lx - 0.5 * px, top, px, px);
    }
    // Tables, chairs and people (in shadow against the light).
    for (let k = 0; k < 7; k++) {
      const tx = left + (0.8 + k * 2.15) * px,
        ty = bottom - 0.55 * px;
      pen.fillStyle = "rgba(70,35,18,0.85)";
      pen.fillRect(tx - 0.45 * px, ty, 0.9 * px, 0.07 * px);
      pen.fillRect(tx - 0.04 * px, ty, 0.08 * px, 0.55 * px);
      if (rand() < 0.6) {
        const sx = tx + (rand() < 0.5 ? -0.55 : 0.55) * px;
        pen.fillStyle = "rgba(60,32,24,0.8)";
        pen.beginPath();
        pen.arc(sx, ty - 0.55 * px, 0.14 * px, 0, Math.PI * 2);
        pen.fill();
        pen.beginPath();
        pen.roundRect(
          sx - 0.2 * px,
          ty - 0.4 * px,
          0.4 * px,
          0.75 * px,
          0.12 * px,
        );
        pen.fill();
      }
    }
    // The door, at the right.
    const dx = right - 2.5 * px;
    pen.fillStyle = "rgba(255,230,180,0.25)";
    pen.fillRect(dx, top + 0.25 * px, 1.6 * px, bottom - top - 0.25 * px);
    // Mullions and the frames of the glass, and the reflection of the night along the glass.
    if (!lit) {
      pen.fillStyle = "#15181c";
      for (let x = left; x <= right + 1; x += (right - left) / 9)
        pen.fillRect(x - 3, top, 6, bottom - top);
      pen.fillRect(left, top - 4, right - left, 8);
      pen.fillRect(left, bottom - 4, right - left, 8);
      pen.fillRect(dx - 3, top + 0.25 * px - 3, 1.6 * px + 6, 6);
      const sheen = pen.createLinearGradient(0, top, fw * 0.3, bottom);
      sheen.addColorStop(0, "rgba(140,170,220,0.18)");
      sheen.addColorStop(0.5, "rgba(140,170,220,0)");
      pen.fillStyle = sheen;
      pen.fillRect(left, top, right - left, bottom - top);
      // The teal band over the glass, and the dark base under it.
      pen.fillStyle = "#1a8f86";
      pen.fillRect(0, top - 0.14 * px, fw, 0.1 * px);
      pen.fillStyle = "#16191d";
      pen.fillRect(0, bottom, fw, fh - bottom);
      // "OPEN 24" on the door glass.
      glowText(
        pen,
        "OPEN 24",
        dx + 0.8 * px,
        top + 0.6 * px,
        `800 ${0.26 * px}px Inter, Arial, sans-serif`,
        "#fff2f6",
        "#ff4f8a",
        14,
      );
    } else {
      pen.fillStyle = "#000";
      for (let x = left; x <= right + 1; x += (right - left) / 9)
        pen.fillRect(x - 3, top, 6, bottom - top);
      glowText(
        pen,
        "OPEN 24",
        dx + 0.8 * px,
        top + 0.6 * px,
        `800 ${0.26 * px}px Inter, Arial, sans-serif`,
        "#fff2f6",
        "#ff4f8a",
        14,
      );
    }
  };
  const frontMap = picture(fw, fh, drawFront(false)),
    frontGlow = picture(fw, fh, drawFront(true));
  const face = new T.MeshStandardMaterial({
    map: frontMap,
    emissiveMap: frontGlow,
    emissive: "#ffffff",
    emissiveIntensity: 1.05,
    roughness: 0.25,
    metalness: 0.1,
  });
  layer.upright(width, height, face, cx, height / 2, front + 0.01);
  // An awning over the windows.
  layer.mesh(
    new T.BoxGeometry(width - 1, 0.12, 0.9),
    parapet,
    cx,
    glassTop + 0.1,
    front + 0.45,
  );
  // The neon on the roof: the moon and burger, and the name.
  const neonTex = picture(1024, 256, (pen) => {
    pen.fillStyle = "rgba(10,14,22,0.92)";
    pen.beginPath();
    pen.roundRect(8, 8, 1008, 240, 40);
    pen.fill();
    pen.lineWidth = 7;
    pen.strokeStyle = "#5ff2e4";
    pen.shadowColor = "#2fe0d0";
    pen.shadowBlur = 22;
    pen.beginPath();
    pen.roundRect(18, 18, 988, 220, 34);
    pen.stroke();
    pen.shadowBlur = 0;
    logo(pen, 140, 128, 84);
    glowText(
      pen,
      "달빛버거",
      590,
      108,
      "900 118px 'Noto Sans KR', sans-serif",
      "#fff6e2",
      "#ffb347",
      26,
    );
    glowText(
      pen,
      "MOONLIGHT BURGER",
      590,
      200,
      "800 48px Inter, Arial, sans-serif",
      "#e9fffb",
      "#2fe0d0",
      18,
    );
  });
  const neon = new T.MeshBasicMaterial({
    map: neonTex,
    transparent: true,
    toneMapped: false,
  });
  // (To the right of the middle, clear of the money and the customers' row over the top of the screen.)
  layer.upright(5.4, 1.35, neon, cx + 4.6, glassTop + 0.8, front + 0.95, 0.3);
  const neonGlow = layer.glow(
    cx + 4.6,
    glassTop + 0.8,
    front + 1.1,
    8,
    "#ffb066",
    0.2,
  );
  // The light from the windows on the pavement and the lot.
  const spill = layer.pool(
    cx,
    lot.minZ + 0.6,
    width + 2,
    7,
    "#ffb768",
    0.32,
    true,
    0.018,
  );
  layer.pool(cx, lot.minZ - 1.6, width + 1, 2.6, "#ffb768", 0.5, true, 0.0);
  layer.light("#ffb36a", 30, 20, cx, 2.6, front + 2.2, 1.2);

  // The drive-through: a lane past the restaurant's right side, a lit menu board, a sign over the way in.
  const lane = asphalt(256, "#26282b", 1, 3, 1);
  layer.flat(
    5,
    14,
    new T.MeshStandardMaterial({
      map: lane.map,
      roughnessMap: lane.rough,
      roughness: 0.9,
    }),
    cx + width / 2 + 3,
    front - 4.6,
    -0.008,
  ).receiveShadow = true;
  const arrowTex = picture(128, 256, (pen) => {
    pen.fillStyle = "rgba(240,236,220,0.85)";
    pen.beginPath();
    pen.moveTo(64, 10);
    pen.lineTo(118, 90);
    pen.lineTo(84, 90);
    pen.lineTo(84, 246);
    pen.lineTo(44, 246);
    pen.lineTo(44, 90);
    pen.lineTo(10, 90);
    pen.fill();
  });
  layer.flat(
    1.2,
    2.4,
    new T.MeshBasicMaterial({
      map: arrowTex,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    }),
    cx + width / 2 + 3,
    front - 2.2,
    0.0,
  );
  const menuTex = picture(512, 320, (pen) => {
    pen.fillStyle = "#1c1410";
    pen.fillRect(0, 0, 512, 320);
    pen.fillStyle = "#1a8f86";
    pen.fillRect(0, 0, 512, 54);
    glowText(
      pen,
      "DRIVE THRU 메뉴",
      256,
      28,
      "800 34px 'Noto Sans KR', Inter, sans-serif",
      "#ffffff",
      "#9ffcf3",
      10,
    );
    for (let k = 0; k < 6; k++) {
      const mx = 18 + (k % 3) * 166,
        my = 70 + Math.floor(k / 3) * 124;
      const g = pen.createLinearGradient(mx, my, mx, my + 110);
      g.addColorStop(0, "#fff0d0");
      g.addColorStop(1, "#ffc27a");
      pen.fillStyle = g;
      pen.fillRect(mx, my, 150, 110);
      logo(pen, mx + 52, my + 50, 30);
      pen.fillStyle = "#3a1d10";
      pen.fillRect(mx + 92, my + 32, 46, 10);
      pen.fillRect(mx + 92, my + 52, 34, 10);
      pen.fillStyle = "#d4302a";
      pen.font = "900 22px Inter, Arial, sans-serif";
      pen.textAlign = "left";
      pen.fillText(`${(5 + k * 0.7).toFixed(1)}`, mx + 92, my + 92);
    }
  });
  const boardX = cx + width / 2 + 0.6,
    boardZ = front - 3.2;
  layer.mesh(
    new T.BoxGeometry(0.12, 1.6, 0.12),
    steel,
    boardX - 0.6,
    0.8,
    boardZ - 0.05,
  );
  layer.mesh(
    new T.BoxGeometry(0.12, 1.6, 0.12),
    steel,
    boardX + 0.6,
    0.8,
    boardZ - 0.05,
  );
  layer.mesh(
    new T.BoxGeometry(1.9, 1.25, 0.14),
    new T.MeshStandardMaterial({ color: "#121416", roughness: 0.4 }),
    boardX,
    2.15,
    boardZ - 0.08,
  );
  layer.upright(
    1.78,
    1.12,
    new T.MeshBasicMaterial({ map: menuTex, toneMapped: false }),
    boardX,
    2.15,
    boardZ,
    0.25,
  );
  layer.glow(boardX, 2.15, boardZ + 0.2, 3.4, "#ffcf8a", 0.22);
  layer.pool(boardX + 1.2, boardZ + 1, 4, 3, "#ffd39a", 0.25);
  const thruTex = picture(512, 128, (pen) => {
    pen.fillStyle = "#0e1418";
    pen.fillRect(0, 0, 512, 128);
    glowText(
      pen,
      "DRIVE THRU →",
      256,
      66,
      "900 64px Inter, Arial, sans-serif",
      "#fffbe8",
      "#ffb347",
      18,
    );
  });
  const gx = cx + width / 2 + 3;
  for (const s of [-1, 1])
    layer.mesh(
      new T.BoxGeometry(0.16, 2.6, 0.16),
      parapet,
      gx + s * 2.4,
      1.3,
      front + 0.4,
    );
  layer.mesh(
    new T.BoxGeometry(5, 0.9, 0.2),
    new T.MeshStandardMaterial({ color: "#0e1418", roughness: 0.5 }),
    gx,
    2.6,
    front + 0.4,
  );
  layer.upright(
    4.8,
    0.82,
    new T.MeshBasicMaterial({ map: thruTex, toneMapped: false }),
    gx,
    2.6,
    front + 0.52,
    0.3,
  );
  layer.glow(gx, 2.6, front + 0.7, 6, "#ffb347", 0.16);

  // A tall sign on a post at the corner of the street: the moon and burger, lit.
  const pylonTex = picture(256, 256, (pen) => {
    const g = pen.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, "#14304a");
    g.addColorStop(1, "#0b1a2a");
    pen.fillStyle = g;
    pen.beginPath();
    pen.roundRect(4, 4, 248, 248, 36);
    pen.fill();
    pen.strokeStyle = "#5ff2e4";
    pen.lineWidth = 8;
    pen.shadowColor = "#2fe0d0";
    pen.shadowBlur = 18;
    pen.stroke();
    pen.shadowBlur = 0;
    logo(pen, 118, 112, 76);
    glowText(
      pen,
      "달빛버거",
      128,
      216,
      "900 40px 'Noto Sans KR', sans-serif",
      "#fff6e2",
      "#ffb347",
      12,
    );
  });
  const pylonX = lot.minX - 1.4,
    pylonZ = lot.minZ - 2.4;
  layer.mesh(
    new T.CylinderGeometry(0.14, 0.2, 3.6, 12),
    steel,
    pylonX,
    1.8,
    pylonZ,
  );
  layer.mesh(
    block(2.3, 2.3, 0.36, 0.1),
    new T.MeshStandardMaterial({
      color: "#0d1520",
      roughness: 0.4,
      metalness: 0.4,
    }),
    pylonX,
    4.4,
    pylonZ,
  );
  layer.upright(
    2.1,
    2.1,
    new T.MeshBasicMaterial({ map: pylonTex, toneMapped: false }),
    pylonX,
    4.4,
    pylonZ + 0.19,
    0.2,
  );
  const pylonGlow = layer.glow(pylonX, 4.4, pylonZ + 0.3, 5.5, "#58e8da", 0.2);

  // Tall lamps over the lot: at the back (their heads reaching over it) and at the front corners, each with a pool of
  // light on the ground; the street's lamps are sodium orange.
  const headMat = new T.MeshStandardMaterial({
    color: "#fffaf0",
    emissive: "#fff2d6",
    emissiveIntensity: 2.2,
    toneMapped: false,
  });
  const pole = (
    x: number,
    z: number,
    h: number,
    reach: number,
    colour: string,
    poolX: number,
    poolZ: number,
    size: number,
    strength: number,
  ) => {
    layer.mesh(new T.CylinderGeometry(0.08, 0.12, h, 10), steel, x, h / 2, z);
    layer.mesh(
      new T.BoxGeometry(0.12, 0.1, Math.abs(reach) + 0.2),
      steel,
      x,
      h,
      z + reach / 2,
    );
    layer.mesh(
      new T.BoxGeometry(0.5, 0.12, 0.26),
      headMat,
      x,
      h - 0.08,
      z + reach,
      false,
    );
    layer.glow(x, h - 0.15, z + reach, 2.6, colour, 0.55);
    layer.pool(poolX, poolZ, size, size, colour, strength);
  };
  for (const x of [-9, 0, 9])
    pole(x, lot.minZ - 0.7, 6, 1.1, "#ffe6bd", x, lot.minZ + 3, 13, 0.36);
  // The lamps at the front corners stand out of sight (over the controls at the screen's lower corners); their light is on the lot.
  for (const s of [-1, 1])
    layer.pool(s * (lot.maxX - 3.5), lot.maxZ - 3.2, 12, 12, "#dfe8ff", 0.3);
  pole(-26.2, -12, 6.5, 0, "#ffa94d", -22.5, -12, 10, 0.32);
  // (The next lamp down the street stands out of sight; its light is on the road.)
  layer.pool(-22.5, 5, 10, 10, "#ffa94d", 0.3);
  layer.light("#ffe0b0", 34, 28, -4, 6, lot.minZ + 2, 1.1);
  layer.light("#d8e4ff", 22, 24, 4, 6, lot.maxZ - 1, 1.1);

  // A clipped hedge along the front and a few dark trees.
  const leafTex = picture(
    256,
    64,
    (pen, lw, lh) => {
      pen.fillStyle = "#1a2c1c";
      pen.fillRect(0, 0, lw, lh);
      for (let k = 0; k < 2400; k++) {
        pen.fillStyle = `rgba(${40 + rand() * 40},${70 + rand() * 50},${40 + rand() * 30},${0.3 + rand() * 0.5})`;
        pen.beginPath();
        pen.arc(rand() * lw, rand() * lh, 1 + rand() * 2.5, 0, Math.PI * 2);
        pen.fill();
      }
    },
    (w + 2) / 4,
    1,
  );
  layer.mesh(
    block(w + 2, 0.85, 1, 0.3),
    new T.MeshStandardMaterial({ map: leafTex, roughness: 1 }),
    0,
    0.42,
    lot.maxZ + 1.5,
  );
  const bark = new T.MeshStandardMaterial({ color: "#2a2018", roughness: 1 }),
    leaves = new T.MeshStandardMaterial({ color: "#1a2a1c", roughness: 1 });
  for (const [x, z] of [
    [cx - width / 2 - 2.6, front - 3],
    [cx + width / 2 + 7.5, front - 2.2],
    [lot.maxX + 3.8, lot.maxZ + 3],
    [lot.maxX + 6, lot.minZ + 1],
  ]) {
    layer.mesh(new T.CylinderGeometry(0.14, 0.2, 2.2, 8), bark, x, 1.1, z);
    for (let k = 0; k < 3; k++)
      layer.mesh(
        new T.SphereGeometry(1.1 - k * 0.2, 12, 10),
        leaves,
        x + (rand() - 0.5) * 0.6,
        2.4 + k * 0.8,
        z + (rand() - 0.5) * 0.6,
      );
  }

  // The lot's own asphalt: dark, wet in patches (they catch the lamps), bumpy.
  const own = asphalt(1024, "#2c2e32", w / 14, d / 14, 1.2);
  const floor = new T.MeshStandardMaterial({
    map: own.map,
    normalMap: own.normal,
    normalScale: new T.Vector2(0.7, 0.7),
    roughnessMap: own.rough,
    roughness: 0.92,
    metalness: 0.05,
  });
  const kerb = new T.MeshStandardMaterial({ color: "#8e8b84", roughness: 0.8 });
  return {
    name: "burger-night",
    dark: true,
    beams: 0.42,
    clear: "#0a0f1c",
    sky: ["#3c4d7a", "#100d0a", 0.85],
    sun: { color: "#a9bcff", intensity: 0.55, at: [-6, 30, 9] },
    floor,
    line: new T.MeshStandardMaterial({
      color: "#ebe8dc",
      roughness: 0.6,
      emissive: "#55534c",
    }),
    kerb: () => kerb,
    lamps: false,
    room: () => {
      const scene = new T.Scene();
      scene.background = new T.Color("#070b16");
      const lamp = (
        colour: string,
        x: number,
        y: number,
        z: number,
        sx: number,
        sy: number,
      ) => {
        const m = new T.Mesh(
          new T.PlaneGeometry(sx, sy),
          new T.MeshBasicMaterial({ color: colour, side: T.DoubleSide }),
        );
        m.position.set(x, y, z);
        m.lookAt(0, 0, 0);
        scene.add(m);
      };
      lamp("#ffd9a0", -3, 4, -2, 1.5, 0.6);
      lamp("#ffd9a0", 3, 4, -2, 1.5, 0.6);
      lamp("#ffb060", 0, 1.2, -5, 6, 1.5);
      lamp("#5ff2e4", -2, 2.5, -5, 2.5, 0.5);
      lamp("#ffa94d", -5, 3.5, 2, 1, 0.5);
      return { scene, intensity: 0.9 };
    },
    tick: (t) => {
      // The neon buzzes: now and then it falters for a moment.
      const flick =
        Math.sin(t * 37) > 0.995 || (t % 7.3 < 0.08 && t % 7.3 > 0.03)
          ? 0.55
          : 1;
      neon.color.setScalar(flick);
      neonGlow.opacity = 0.22 * flick + 0.03 * Math.sin(t * 2.1);
      pylonGlow.opacity = 0.18 + 0.04 * Math.sin(t * 1.7);
      spill.opacity = 0.32 + 0.015 * Math.sin(t * 3.1);
    },
  };
}

/**
 * The car park under the ground, cut open to be looked into: a green epoxy floor, glossy and worn by tyres, painted
 * arrows; the walls round it (a hatched band at their feet, the level and the zones painted on), a ceiling's tubes
 * along the back wall and their light on the floor; ducts and the sprinkler's red pipe; a fire hose cabinet, the green
 * sign over the emergency door; the ramp up to the street on the left, the way out up the ramp on the right; pillars
 * with yellow and black bands and their numbers. Round it all, the ground the car park was dug into.
 */
function underground(lot: Lot, layer: Layer): Look {
  const w = lot.maxX - lot.minX,
    d = lot.maxZ - lot.minZ,
    H = 3.4;
  const concrete = (base: string, rx: number, ry: number, stains = 0.2) =>
    picture(
      512,
      512,
      (pen, cw, ch) => {
        pen.fillStyle = base;
        pen.fillRect(0, 0, cw, ch);
        blotches(pen, cw, ch, 24, (a) => `rgba(0,0,0,${a})`, cw * 0.15, stains);
        blotches(
          pen,
          cw,
          ch,
          16,
          (a) => `rgba(255,255,255,${a})`,
          cw * 0.12,
          0.06,
        );
        grit(pen, cw, ch, 26000, 0.12, 1.6);
        // Form-work joints.
        pen.strokeStyle = "rgba(0,0,0,0.18)";
        pen.lineWidth = 2;
        pen.strokeRect(0, 0, cw, ch);
      },
      rx,
      ry,
    );
  // The rock the car park is dug into, seen as cut: dark, round everything.
  const section = new T.MeshStandardMaterial({
    map: concrete("#1b1d20", 6, 6, 0.3),
    roughness: 0.95,
  });
  const sectionEdge = new T.MeshStandardMaterial({
    color: "#6a6f75",
    roughness: 0.8,
  });
  const solid = (
    x0: number,
    x1: number,
    z0: number,
    z1: number,
    h: number,
    faceMat?: T.Material,
  ) => {
    const mats = [
      section,
      section,
      section,
      section,
      faceMat ?? section,
      section,
    ];
    layer.mesh(
      new T.BoxGeometry(x1 - x0, h, z1 - z0),
      mats,
      (x0 + x1) / 2,
      h / 2 - 0.05,
      (z0 + z1) / 2,
      true,
    );
    // A pale edge along the cut, the way a drawing shows where it is cut.
    for (const z of [z0 + 0.06, z1 - 0.06])
      layer.mesh(
        new T.BoxGeometry(x1 - x0, 0.04, 0.12),
        sectionEdge,
        (x0 + x1) / 2,
        h - 0.03,
        z,
        false,
      );
  };
  // The floor outside the lot (the lanes) is plain concrete.
  layer.flat(
    160,
    120,
    new T.MeshStandardMaterial({
      map: concrete("#56595c", 20, 15, 0.25),
      roughness: 0.85,
    }),
    0,
    0,
    -0.04,
  ).receiveShadow = true;

  // The back wall, its face painted: a hatched band at the foot, a green dado, the level and the zones, joints.
  const back = lot.minZ - 0.75,
    left = lot.minX - 0.45,
    laneLeft = -26,
    right = lot.maxX + 0.45,
    span = right - left,
    mx = 96;
  const wallTex = picture(
    Math.round(span * mx),
    Math.round(H * mx),
    (pen, ww, wh) => {
      const m = (v: number) => v * mx,
        y = (v: number) => wh - v * mx;
      pen.fillStyle = "#d9d8d2";
      pen.fillRect(0, 0, ww, wh);
      blotches(pen, ww, wh, 40, (a) => `rgba(60,55,45,${a})`, m(1.4), 0.12);
      grit(pen, ww, wh, ww * wh * 0.02, 0.08);
      pen.fillStyle = "#4f7a66";
      pen.fillRect(0, y(1.25), ww, m(0.95));
      pen.fillStyle = "#3f6352";
      pen.fillRect(0, y(1.29), ww, m(0.06));
      hazard(pen, 0, y(0.3), ww, m(0.3), m(0.22));
      // Joints between the wall's panels.
      pen.fillStyle = "rgba(0,0,0,0.22)";
      for (let x = 0; x < span; x += 5) pen.fillRect(m(x), 0, 3, wh);
      // Rust and water stains running down from the ceiling.
      for (let k = 0; k < 18; k++) {
        const sx = rand() * ww,
          g = pen.createLinearGradient(0, 0, 0, m(1.6));
        g.addColorStop(0, "rgba(110,80,40,0.25)");
        g.addColorStop(1, "rgba(110,80,40,0)");
        pen.fillStyle = g;
        pen.fillRect(sx, 0, m(0.08 + rand() * 0.2), m(0.6 + rand()));
      }
      // The zones, in big circles, and the level.
      const zones = ["A", "B", "C", "D"];
      zones.forEach((z, k) => {
        const cx = m(3.2 + k * 8.5),
          cy = y(2.15);
        pen.fillStyle = ["#2f7bd0", "#e0782a", "#3aa35a", "#b54ac8"][k];
        pen.beginPath();
        pen.arc(cx, cy, m(0.55), 0, Math.PI * 2);
        pen.fill();
        pen.fillStyle = "#fff";
        pen.font = `900 ${m(0.7)}px Inter, Arial, sans-serif`;
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.fillText(z, cx, cy + m(0.04));
        pen.fillStyle = "#2b2f33";
        pen.font = `900 ${m(0.48)}px Inter, Arial, sans-serif`;
        pen.textAlign = "left";
        pen.fillText("B2", cx + m(0.75), cy + m(0.04));
      });
      // A painted arrow toward the way out.
      pen.fillStyle = "#2b2f33";
      pen.font = `800 ${m(0.34)}px 'Noto Sans KR', Inter, sans-serif`;
      pen.textAlign = "right";
      pen.fillText("출구 EXIT  ➜", ww - m(0.6), y(1.6));
    },
  );
  const wallFace = new T.MeshStandardMaterial({
    map: wallTex,
    roughness: 0.85,
  });
  solid(left, right, back - 30, back, H, wallFace);
  // The rock left of the entrance lane, and the rock right of the lot on either side of the way out.
  const near = lot.maxZ + 0.45;
  solid(-60, laneLeft, back - 30, near, H);
  solid(
    right,
    60,
    back - 30,
    -lot.exit.hz - 0.5,
    H,
    new T.MeshStandardMaterial({
      map: concrete("#cfcfc8", 8, 1, 0.15),
      roughness: 0.85,
    }),
  );
  solid(right, 60, lot.exit.hz + 0.5, near, H);
  // In front: the near wall cut low, so that the lot is seen over it.
  solid(-60, 60, near, 40, 0.75);
  // The ramp up to the street (the lane on the left) and the ramp up to the way out (on the right), with a lit mouth.
  const rampMat = new T.MeshStandardMaterial({
    map: concrete("#5d6063", 2, 4, 0.2),
    roughness: 0.8,
  });
  const ramp = (
    x: number,
    z: number,
    len: number,
    wide: number,
    alongX: boolean,
  ) => {
    const rise = Math.atan2(H, len);
    const mesh = layer.mesh(
      new T.PlaneGeometry(
        alongX ? Math.hypot(len, H) : wide,
        alongX ? wide : Math.hypot(len, H),
      ),
      rampMat,
      x,
      H / 2 - 0.03,
      z,
      false,
    );
    if (alongX) mesh.rotation.set(-Math.PI / 2, -rise, 0);
    else mesh.rotation.set(-Math.PI / 2 + rise, 0, 0);
    return mesh;
  };
  ramp((laneLeft + left) / 2, back - 2 - 7, 14, left - laneLeft, false);
  ramp(right + 12 + 7, 0, 14, lot.exit.hz * 2 + 1, true);
  // The beam over each ramp's mouth, with its clearance sign.
  const clearTex = picture(512, 128, (pen) => {
    hazard(pen, 0, 0, 512, 128, 34);
    pen.fillStyle = "#fff";
    pen.beginPath();
    pen.roundRect(150, 14, 212, 100, 14);
    pen.fill();
    pen.fillStyle = "#d4302a";
    pen.font = "900 54px Inter, Arial, sans-serif";
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText("2.3m", 256, 66);
  });
  layer.mesh(
    new T.BoxGeometry(left - laneLeft, 0.6, 0.4),
    [
      section,
      section,
      section,
      section,
      new T.MeshStandardMaterial({ map: clearTex, roughness: 0.6 }),
      section,
    ],
    (laneLeft + left) / 2,
    2.6,
    back - 0.2,
  );
  // Over the way out: a lit sign hung from the ceiling.
  const exitTex = picture(512, 128, (pen) => {
    pen.fillStyle = "#0f7a3a";
    pen.fillRect(0, 0, 512, 128);
    glowText(
      pen,
      "출구 EXIT ➜",
      256,
      66,
      "900 66px 'Noto Sans KR', Inter, sans-serif",
      "#ffffff",
      "#c8ffd8",
      12,
    );
  });
  layer.mesh(
    new T.BoxGeometry(3, 0.75, 0.14),
    new T.MeshStandardMaterial({ color: "#202326", roughness: 0.5 }),
    right + 2,
    H - 0.75,
    -lot.exit.hz + 0.2,
  );
  layer.upright(
    2.9,
    0.68,
    new T.MeshBasicMaterial({ map: exitTex, toneMapped: false }),
    right + 2,
    H - 0.75,
    -lot.exit.hz + 0.28,
    0.2,
  );
  layer.glow(right + 2, H - 0.75, -lot.exit.hz + 0.4, 4, "#5dff8e", 0.18);
  layer.pool(right + 5, 0, 10, lot.exit.hz * 2 + 1, "#d8ffe4", 0.16, true);

  // On the back wall: tube lights, the ducts and pipes over them, a fire hose cabinet, the emergency door and its sign, a camera.
  const tube = new T.MeshStandardMaterial({
      color: "#ffffff",
      emissive: "#eef6ff",
      emissiveIntensity: 2,
      toneMapped: false,
    }),
    housing = new T.MeshStandardMaterial({
      color: "#c9ccd0",
      roughness: 0.4,
      metalness: 0.5,
    }),
    steel = new T.MeshStandardMaterial({
      color: "#9aa0a6",
      roughness: 0.35,
      metalness: 0.7,
    });
  const wash = new T.MeshBasicMaterial({
    map: layer.oblong,
    color: "#eaf2ff",
    transparent: true,
    opacity: 0.35,
    blending: T.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const tubes: T.SpriteMaterial[] = [];
  for (let x = left + 2.5; x < right - 1; x += 5) {
    layer.mesh(
      new T.BoxGeometry(1.5, 0.12, 0.18),
      housing,
      x,
      2.36,
      back + 0.1,
      false,
    );
    layer.mesh(
      new T.CylinderGeometry(0.035, 0.035, 1.36, 8).rotateZ(Math.PI / 2),
      tube,
      x,
      2.29,
      back + 0.16,
      false,
    );
    const wallWash = layer.upright(4.4, 2.4, wash, x, 1.35, back + 0.02);
    wallWash.renderOrder = 1;
    tubes.push(layer.glow(x, 2.29, back + 0.3, 2, "#e8f2ff", 0.45));
  }
  layer.mesh(
    new T.BoxGeometry(span, 0.42, 0.55),
    new T.MeshStandardMaterial({
      color: "#b8bcc0",
      roughness: 0.45,
      metalness: 0.55,
    }),
    (left + right) / 2,
    H - 0.32,
    back + 0.3,
  );
  for (let x = left + 1; x < right; x += 1.2)
    layer.mesh(
      new T.BoxGeometry(0.05, 0.44, 0.57),
      steel,
      x,
      H - 0.32,
      back + 0.3,
      false,
    );
  layer.mesh(
    new T.CylinderGeometry(0.06, 0.06, span, 10).rotateZ(Math.PI / 2),
    new T.MeshStandardMaterial({ color: "#c8281f", roughness: 0.45 }),
    (left + right) / 2,
    H - 0.68,
    back + 0.12,
  );
  for (let x = left + 3; x < right; x += 6)
    layer.mesh(
      new T.CylinderGeometry(0.03, 0.03, 0.4, 8),
      steel,
      x,
      H - 0.9,
      back + 0.12,
      false,
    );
  layer.mesh(
    new T.CylinderGeometry(0.035, 0.035, span, 8).rotateZ(Math.PI / 2),
    new T.MeshStandardMaterial({ color: "#d9a520", roughness: 0.5 }),
    (left + right) / 2,
    H - 0.82,
    back + 0.08,
  );
  const hoseTex = picture(256, 320, (pen) => {
    pen.fillStyle = "#c92a22";
    pen.fillRect(0, 0, 256, 320);
    pen.fillStyle = "#e8e2d8";
    pen.fillRect(26, 70, 204, 150);
    pen.strokeStyle = "#8a1a14";
    pen.lineWidth = 6;
    pen.strokeRect(26, 70, 204, 150);
    pen.strokeStyle = "#c92a22";
    pen.lineWidth = 14;
    for (let r = 20; r < 64; r += 16) {
      pen.beginPath();
      pen.arc(128, 145, r, 0, Math.PI * 2);
      pen.stroke();
    }
    pen.fillStyle = "#fff";
    pen.font = "900 44px 'Noto Sans KR', sans-serif";
    pen.textAlign = "center";
    pen.fillText("소화전", 128, 52);
    pen.font = "800 26px 'Noto Sans KR', sans-serif";
    pen.fillText("FIRE HOSE", 128, 270);
  });
  for (const x of [lot.minX + 10, lot.maxX - 4.5]) {
    layer.mesh(
      new T.BoxGeometry(0.82, 1.02, 0.2),
      new T.MeshStandardMaterial({ color: "#a8221b", roughness: 0.5 }),
      x,
      1.25,
      back + 0.1,
    );
    layer.upright(
      0.8,
      1,
      new T.MeshStandardMaterial({ map: hoseTex, roughness: 0.45 }),
      x,
      1.25,
      back + 0.21,
    );
    layer.glow(x, 1.85, back + 0.3, 0.5, "#ff4030", 0.8);
  }
  const doorX = lot.minX + 18.5;
  layer.upright(
    1.1,
    2.15,
    new T.MeshStandardMaterial({
      color: "#7b8288",
      roughness: 0.45,
      metalness: 0.6,
    }),
    doorX,
    1.075,
    back + 0.02,
  );
  layer.mesh(
    new T.BoxGeometry(0.06, 0.06, 0.12),
    steel,
    doorX + 0.4,
    1.05,
    back + 0.08,
    false,
  );
  const sosTex = picture(256, 96, (pen) => {
    pen.fillStyle = "#12a34a";
    pen.fillRect(0, 0, 256, 96);
    pen.fillStyle = "#ffffff";
    // A running figure toward a door.
    pen.fillRect(18, 16, 40, 64);
    pen.fillStyle = "#12a34a";
    pen.fillRect(24, 22, 28, 58);
    pen.fillStyle = "#fff";
    pen.beginPath();
    pen.arc(80, 26, 8, 0, Math.PI * 2);
    pen.fill();
    pen.lineWidth = 8;
    pen.strokeStyle = "#fff";
    pen.lineCap = "round";
    pen.beginPath();
    pen.moveTo(76, 38);
    pen.lineTo(70, 58);
    pen.lineTo(60, 76);
    pen.moveTo(70, 58);
    pen.lineTo(86, 74);
    pen.moveTo(74, 44);
    pen.lineTo(90, 50);
    pen.moveTo(74, 44);
    pen.lineTo(60, 46);
    pen.stroke();
    pen.font = "900 40px 'Noto Sans KR', sans-serif";
    pen.textAlign = "center";
    pen.textBaseline = "middle";
    pen.fillText("비상구", 170, 50);
  });
  layer.mesh(
    new T.BoxGeometry(0.86, 0.34, 0.1),
    new T.MeshStandardMaterial({ color: "#e8e8e8", roughness: 0.4 }),
    doorX,
    2.42,
    back + 0.08,
    false,
  );
  layer.upright(
    0.8,
    0.3,
    new T.MeshBasicMaterial({ map: sosTex, toneMapped: false }),
    doorX,
    2.42,
    back + 0.14,
  );
  const sos = layer.glow(doorX, 2.42, back + 0.3, 1.8, "#3dff7a", 0.35);
  layer.mesh(
    new T.BoxGeometry(0.22, 0.16, 0.34),
    new T.MeshStandardMaterial({ color: "#eceff1", roughness: 0.4 }),
    lot.minX + 4.5,
    2.55,
    back + 0.25,
    false,
  );
  const rec = layer.glow(
    lot.minX + 4.62,
    2.55,
    back + 0.44,
    0.22,
    "#ff2a2a",
    0.9,
  );

  // The ceiling's tubes, seen by their light: rows of soft oblongs on the floor over the aisle and the bays.
  for (let x = lot.minX + 3; x < lot.maxX - 1; x += 5.2)
    for (const z of [lot.minZ + 2.4, -0.2, lot.maxZ - 2])
      layer.pool(x, z, 6, 3.4, "#e3eeff", 0.11, true);
  layer.pool((laneLeft + left) / 2, -3, 8, 18, "#e3eeff", 0.12, true);
  // Arrows on the floor: down the entrance lane, along the aisle toward the way out.
  const arrow = picture(128, 256, (pen) => {
    pen.fillStyle = "rgba(255,255,255,0.88)";
    pen.beginPath();
    pen.moveTo(64, 10);
    pen.lineTo(118, 92);
    pen.lineTo(84, 92);
    pen.lineTo(84, 246);
    pen.lineTo(44, 246);
    pen.lineTo(44, 92);
    pen.lineTo(10, 92);
    pen.fill();
  });
  const paint = new T.MeshBasicMaterial({
    map: arrow,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    color: "#f6f2e0",
  });
  layer.flat(1.1, 2.4, paint, (laneLeft + left) / 2 + 1.5, -6, 0.003, Math.PI);
  for (const [x, z] of [
    [2.2, -1.6],
    [10.4, 1.4],
  ])
    layer.flat(1.1, 2.4, paint, x, z, 0.015, -Math.PI / 2);
  // A walkway painted along the front wall: green with white edges.
  const walk = new T.MeshStandardMaterial({ color: "#3f8f5c", roughness: 0.5 });
  layer.flat(w + 0.8, 0.36, walk, 0, lot.maxZ + 0.28, -0.03);

  // The pillars: round, white, a yellow and black band at the foot and their number up where it is seen.
  const pillarTex = (n: string) =>
    picture(512, 512, (pen, pw, ph) => {
      pen.fillStyle = "#e4e3de";
      pen.fillRect(0, 0, pw, ph);
      blotches(pen, pw, ph, 10, (a) => `rgba(60,55,45,${a})`, 60, 0.12);
      grit(pen, pw, ph, 8000, 0.08);
      hazard(pen, 0, ph * 0.72, pw, ph * 0.28, 34);
      pen.fillStyle = "#3aa35a";
      pen.fillRect(0, ph * 0.66, pw, ph * 0.04);
      for (let k = 0; k < 4; k++) {
        const x = (pw * (k + 0.5)) / 4;
        pen.fillStyle = "#2b2f33";
        pen.font = "900 64px Inter, Arial, sans-serif";
        pen.textAlign = "center";
        pen.textBaseline = "middle";
        pen.fillText(n, x, ph * 0.42);
        pen.font = "800 30px Inter, Arial, sans-serif";
        pen.fillText("B2", x, ph * 0.3);
      }
    });
  let count = 0;
  const pillar = (p: Pillar) => {
    count++;
    const zone = p.z < -3 ? "A" : "C",
      side = new T.MeshStandardMaterial({
        map: pillarTex(`${zone}${count}`),
        roughness: 0.6,
      }),
      top = section;
    layer.mesh(
      new T.CylinderGeometry(p.r, p.r, H, 24),
      [side, top, top],
      p.x,
      H / 2,
      p.z,
    );
    // A tube light on each pillar's side toward the aisle.
    layer.mesh(
      new T.BoxGeometry(0.08, 0.9, 0.08),
      tube,
      p.x,
      2.3,
      p.z + p.r + 0.04,
      false,
    );
    layer.glow(p.x, 2.3, p.z + p.r + 0.2, 1.4, "#e8f2ff", 0.35);
    layer.pool(p.x, p.z + 1.4, 3.4, 3.4, "#e3eeff", 0.16);
  };

  // The lot's floor: green epoxy, glossy, worn where the tyres run, with tyre marks.
  const epoxyBump = canvas(512, 512),
    eb = epoxyBump.getContext("2d")!;
  eb.fillStyle = "#808080";
  eb.fillRect(0, 0, 512, 512);
  blotches(eb, 512, 512, 60, (a) => `rgba(255,255,255,${a})`, 30, 0.12);
  grit(eb, 512, 512, 12000, 0.1, 1.2);
  const epoxy = picture(
    1024,
    1024,
    (pen, ew, eh) => {
      pen.fillStyle = "#4b7a62";
      pen.fillRect(0, 0, ew, eh);
      blotches(
        pen,
        ew,
        eh,
        30,
        (a) => `rgba(120,140,125,${a})`,
        ew * 0.12,
        0.25,
      );
      blotches(pen, ew, eh, 30, (a) => `rgba(20,35,28,${a})`, ew * 0.1, 0.22);
      grit(pen, ew, eh, 60000, 0.07, 1.4);
      // Tyre marks: dark arcs where cars turned.
      pen.lineCap = "round";
      for (let k = 0; k < 26; k++) {
        const x = rand() * ew,
          y = rand() * eh,
          r = 120 + rand() * 320,
          a = rand() * Math.PI * 2;
        pen.strokeStyle = `rgba(10,14,12,${0.06 + rand() * 0.1})`;
        pen.lineWidth = 7 + rand() * 6;
        pen.beginPath();
        pen.arc(x, y, r, a, a + 0.4 + rand() * 0.8);
        pen.stroke();
        pen.beginPath();
        pen.arc(x, y, r + 26, a, a + 0.4 + rand() * 0.8);
        pen.stroke();
      }
      // Scuffs where the paint wore through to the concrete.
      blotches(
        pen,
        ew,
        eh,
        18,
        (a) => `rgba(150,150,140,${a})`,
        ew * 0.03,
        0.4,
      );
    },
    w / 16,
    d / 16,
  );
  const shine = picture(
    256,
    256,
    (pen, sw, sh) => {
      pen.fillStyle = "#a8a8a8";
      pen.fillRect(0, 0, sw, sh);
      blotches(pen, sw, sh, 18, (a) => `rgba(230,230,230,${a})`, 40, 0.8);
      grit(pen, sw, sh, 3000, 0.2);
    },
    w / 16,
    d / 16,
    false,
  );
  const floor = new T.MeshStandardMaterial({
    map: epoxy,
    normalMap: normals(epoxyBump, 1.2, w / 16, d / 16),
    normalScale: new T.Vector2(0.35, 0.35),
    roughnessMap: shine,
    roughness: 0.95,
    metalness: 0.05,
  });
  // Kerbs (the walls' feet round the lot): hatched yellow and black.
  const kerb = (length: number) => {
    const t = picture(
      256,
      32,
      (pen) => hazard(pen, 0, 0, 256, 32, 16),
      Math.max(1, length / 2.4),
      1,
    );
    return new T.MeshStandardMaterial({ map: t, roughness: 0.6 });
  };
  layer.light("#eef4ff", 26, 24, -6, H + 1, -2, 1.1);
  layer.light("#eef4ff", 26, 24, 8, H + 1, 1, 1.1);
  return {
    name: "underground",
    dark: true,
    beams: 0.22,
    clear: "#121417",
    sky: ["#dfe7ee", "#2a2e33", 0.85],
    sun: { color: "#eef4ff", intensity: 1.05, at: [2, 30, 5] },
    floor,
    line: new T.MeshStandardMaterial({
      color: "#f4f3ea",
      roughness: 0.5,
      emissive: "#3a3a36",
    }),
    kerb,
    lamps: false,
    pillar,
    room: () => {
      const scene = new T.Scene();
      scene.background = new T.Color("#3a3e42");
      for (let x = -6; x <= 6; x += 3)
        for (const z of [-3, 0, 3]) {
          const m = new T.Mesh(
            new T.PlaneGeometry(1.6, 0.18),
            new T.MeshBasicMaterial({ color: "#ffffff", side: T.DoubleSide }),
          );
          m.position.set(x, 3, z);
          m.rotation.x = Math.PI / 2;
          scene.add(m);
        }
      const floorPlane = new T.Mesh(
        new T.PlaneGeometry(30, 30),
        new T.MeshBasicMaterial({ color: "#2e4a3c", side: T.DoubleSide }),
      );
      floorPlane.rotation.x = -Math.PI / 2;
      floorPlane.position.y = -1;
      scene.add(floorPlane);
      return { scene, intensity: 0.7 };
    },
    tick: (t) => {
      // One tube along the wall is failing and blinks; the camera's light winks; the emergency sign breathes.
      const failing = tubes[3];
      if (failing)
        failing.opacity =
          Math.sin(t * 23) > 0.6 && Math.sin(t * 1.3) > 0.2 ? 0.08 : 0.45;
      rec.opacity = Math.sin(t * 3) > 0 ? 0.9 : 0.1;
      sos.opacity = 0.3 + 0.06 * Math.sin(t * 1.5);
    },
  };
}
