import * as T from "three";

/**
 * Leaf cards for the crowns of trees and bushes, shared by every scene that has them (first made for the hunt in
 * 사격). A crown is a small dark core, painted with the same foliage laid thick, and round it cards of painted leaves
 * or needles, alpha-tested so that its outline is leafy. Everything is painted in code (nothing is fetched) and no
 * Vite-only import is used, so that views the browser tests load under plain Node may import it.
 *
 * `Grove` lays many crowns as a few instanced meshes (one core and one set of cards a kind of foliage, tinted crown by
 * crown), so that a wood costs little more than the round blobs it replaces; far crowns may take fewer cards.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The kinds of foliage: `birch` small pointed leaves, `oak` lobed leaves, `pine` tufts of long needles, `spray` a
 *  drooping spruce branch (for the tiers of a spruce or fir), `broad` the rounded leaves of a park tree (lime, maple),
 *  `box` the tiny dense leaves of a clipped bush, `blossom` a flowering cherry, painted in its own colours. */
export type LeafKind = "birch" | "oak" | "pine" | "spray" | "broad" | "box" | "blossom";
/** A tiny fixed sequence, so that a picture or a wood is the same every time (the hunt's own). */
export function sequence(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement, own: Own, repeat?: [number, number]) {
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(...repeat);
  }
  return t;
}
/** Pictures are painted once a page (they are only canvases; each view makes its own textures of them). */
const painted = new Map<string, HTMLCanvasElement>();
const once = (key: string, paint: () => HTMLCanvasElement) => {
  let c = painted.get(key);
  if (!c) painted.set(key, (c = paint()));
  return c;
};
/**
 * A picture of foliage for leaf cards, painted in code with clear gaps between the leaves (the cards are drawn with an
 * alpha test, so a crown's outline is leafy): `birch` small pointed leaves on fine twigs, `oak` larger lobed leaves,
 * `pine` tufts of long needles, `spray` a drooping spruce branch thick with short needles (wide, its twig's base at the
 * left), `broad` rounded leaves with a point, `box` tiny oval leaves close together, `blossom` five-petalled flowers
 * in clusters among a few young leaves. The leaves are painted in pale greys of a green cast, light and dark, so that
 * each tree's own tint gives the hue (the blossom in its own pinks, to be tinted white or nearly); the twigs are dark.
 */
export function foliage(kind: LeafKind) {
  return once(`leaves:${kind}`, () => paintFoliage(kind));
}
function paintFoliage(kind: LeafKind) {
  const wide = kind === "spray",
    { c, ctx } = canvas(256, wide ? 128 : 256),
    random = sequence({ birch: 41, oak: 43, pine: 47, spray: 53, broad: 59, box: 61, blossom: 67 }[kind]),
    shade = (light: number, alpha = 1) => `hsla(${78 + random() * 16}, ${18 + random() * 14}%, ${light}%, ${alpha})`,
    twig = (x0: number, y0: number, x1: number, y1: number, width: number) => {
      ctx.strokeStyle = "rgba(52,40,28,1)";
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo((x0 + x1) / 2 + (random() - 0.5) * 12, (y0 + y1) / 2 + (random() - 0.5) * 12, x1, y1);
      ctx.stroke();
    };
  if (kind === "spray") {
    // A main twig from the trunk (left) to the tip (right), drooping, with side shoots angled forward; short needles
    // all along every twig, thickest near the trunk, the whole spray tapering to its tip.
    const along = (t: number) => ({ x: 4 + t * 246, y: 56 + t * 10 + Math.sin(t * Math.PI) * 6 }),
      needles = (x0: number, y0: number, x1: number, y1: number, length: number, count: number) => {
        const d = Math.hypot(x1 - x0, y1 - y0) || 1,
          ux = (x1 - x0) / d,
          uy = (y1 - y0) / d;
        for (let k = 0; k < count; k++) {
          const t = random(),
            x = x0 + (x1 - x0) * t,
            y = y0 + (y1 - y0) * t,
            side = random() < 0.5 ? -1 : 1,
            // Each needle leans toward the tip and out to its side.
            a = Math.atan2(uy, ux) + side * (0.7 + random() * 0.5),
            l = length * (0.7 + random() * 0.5) * (1 - t * 0.35);
          ctx.strokeStyle = shade(40 + random() * 52);
          ctx.lineWidth = 2.2 + random() * 1.4;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
          ctx.stroke();
        }
      };
    const shoots: [number, number, number, number][] = [];
    for (let k = 0; k < 12; k++) {
      const t = 0.04 + k * 0.075 + random() * 0.03,
        p = along(t),
        side = k % 2 ? -1 : 1,
        reach = (1 - t) * 52 + 12;
      shoots.push([p.x, p.y, p.x + reach * 0.9, p.y + side * reach * 0.75]);
    }
    const end = along(1);
    twig(along(0).x, along(0).y, end.x, end.y, 3);
    for (const [x0, y0, x1, y1] of shoots) twig(x0, y0, x1, y1, 1.6);
    needles(along(0).x, along(0).y, end.x, end.y, 22, 520);
    for (const [x0, y0, x1, y1] of shoots) needles(x0, y0, x1, y1, 15, 150);
    return c;
  }
  // Sprays of foliage round twigs from the middle: clusters with gaps between them, sparse at the rim, all within a
  // round so that no straight edge of the card shows.
  ctx.beginPath();
  ctx.arc(128, 128, 126, 0, Math.PI * 2);
  ctx.clip();
  if (kind === "broad" || kind === "box" || kind === "blossom") {
    paintMore(kind, ctx, random, shade, twig);
    return c;
  }
  const clusters = kind === "pine" ? 24 : kind === "birch" ? 24 : 18;
  for (let k = 0; k < clusters; k++) {
    const a = random() * Math.PI * 2,
      r = 12 + random() ** 0.8 * (kind === "pine" ? 66 : 60),
      x = 128 + Math.cos(a) * r,
      y = 128 + Math.sin(a) * r;
    twig(128 + Math.cos(a) * 8, 128 + Math.sin(a) * 8, x, y, kind === "pine" ? 2.4 : 1.8);
    if (kind === "pine") {
      // A tuft of long needles bursting from the twig's end, the upper ones lighter.
      for (let n = 0; n < 70; n++) {
        const b = random() * Math.PI * 2,
          l = 18 + random() * 26;
        ctx.strokeStyle = shade(Math.sin(b) < 0 ? 62 + random() * 32 : 36 + random() * 34);
        ctx.lineWidth = 2 + random() * 1.4;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(b) * 3, y + Math.sin(b) * 3);
        ctx.lineTo(x + Math.cos(b) * l, y + Math.sin(b) * l);
        ctx.stroke();
      }
      continue;
    }
    const leaves = kind === "birch" ? 30 : 20;
    for (let n = 0; n < leaves; n++) {
      // Leaves round the twig, lower ones in shadow; each on its own stalk, turned its own way.
      const b = random() * Math.PI * 2,
        d = random() ** 0.7 * (kind === "birch" ? 30 : 34),
        lx = x + Math.cos(b) * d,
        ly = y + Math.sin(b) * d,
        length = kind === "birch" ? 18 + random() * 10 : 28 + random() * 14,
        width = length * (kind === "birch" ? 0.36 : 0.32),
        turn = b + (random() - 0.5) * 1.2,
        light = ly - y < -4 ? 70 + random() * 26 : 42 + random() * 34;
      ctx.save();
      ctx.translate(lx, ly);
      ctx.rotate(turn);
      ctx.fillStyle = shade(light);
      ctx.beginPath();
      if (kind === "birch") {
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(length * 0.35, -width, length, 0);
        ctx.quadraticCurveTo(length * 0.35, width, 0, 0);
      } else {
        // An oak leaf: rounded lobes either side, widest beyond its middle.
        ctx.moveTo(0, 0);
        for (const s of [-1, 1]) {
          for (let j = 0; j <= 12; j++) {
            const t = s < 0 ? j / 12 : 1 - j / 12,
              lobe = 0.62 + 0.38 * Math.abs(Math.cos(t * Math.PI * 4.5)),
              half = width * Math.sin(Math.PI * t) ** 0.8 * (0.6 + 0.5 * t) * lobe;
            ctx.lineTo(t * length, s * half);
          }
        }
      }
      ctx.closePath();
      ctx.fill();
      // The midrib, darker.
      ctx.strokeStyle = shade(light - 22, 0.6);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-2, 0);
      ctx.lineTo(length * 0.85, 0);
      ctx.stroke();
      ctx.restore();
    }
  }
  return c;
}
/** The kinds added after the hunt's: rounded leaves, a clipped bush's tiny ones, and cherry blossom. */
function paintMore(
  kind: "broad" | "box" | "blossom",
  ctx: CanvasRenderingContext2D,
  random: () => number,
  shade: (light: number, alpha?: number) => string,
  twig: (x0: number, y0: number, x1: number, y1: number, width: number) => void,
) {
  const leaf = (x: number, y: number, turn: number, length: number, width: number, fill: string, rib?: string) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(turn);
    ctx.fillStyle = fill;
    ctx.beginPath();
    // Rounded, widest a third of the way, coming to a short point.
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(length * 0.12, -width * 1.15, length * 0.78, -width * 0.9, length, 0);
    ctx.bezierCurveTo(length * 0.78, width * 0.9, length * 0.12, width * 1.15, 0, 0);
    ctx.fill();
    if (rib) {
      ctx.strokeStyle = rib;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(length * 0.85, 0);
      ctx.stroke();
    }
    ctx.restore();
  };
  if (kind === "box") {
    // Many short shoots, each thick with tiny leaves: a close, even texture with small gaps, as a clipped bush has.
    for (let k = 0; k < 46; k++) {
      const a = random() * Math.PI * 2,
        r = 8 + random() ** 0.7 * 100,
        x = 128 + Math.cos(a) * r,
        y = 128 + Math.sin(a) * r;
      twig(x - Math.cos(a) * 10, y - Math.sin(a) * 10, x, y, 1.2);
      for (let n = 0; n < 16; n++) {
        const b = random() * Math.PI * 2,
          d = random() ** 0.6 * 15,
          ly = y + Math.sin(b) * d,
          length = 8 + random() * 5;
        leaf(x + Math.cos(b) * d, ly, b + (random() - 0.5), length, length * 0.42, shade(ly - y < -2 ? 66 + random() * 28 : 38 + random() * 32));
      }
    }
    return;
  }
  if (kind === "broad") {
    // Clusters of rounded leaves on short twigs, each leaf with its rib, the upper ones catching the light.
    for (let k = 0; k < 20; k++) {
      const a = random() * Math.PI * 2,
        r = 12 + random() ** 0.8 * 62,
        x = 128 + Math.cos(a) * r,
        y = 128 + Math.sin(a) * r;
      twig(128 + Math.cos(a) * 8, 128 + Math.sin(a) * 8, x, y, 1.8);
      for (let n = 0; n < 18; n++) {
        const b = random() * Math.PI * 2,
          d = random() ** 0.7 * 32,
          ly = y + Math.sin(b) * d,
          length = 22 + random() * 12,
          light = ly - y < -4 ? 68 + random() * 28 : 40 + random() * 34;
        leaf(x + Math.cos(b) * d, ly, b + (random() - 0.5) * 1.2, length, length * 0.42, shade(light), shade(light - 22, 0.6));
      }
    }
    return;
  }
  // Blossom: dark twigs, a few young leaves, and clusters of pink and white flowers, five petals round a rosy eye.
  for (let k = 0; k < 26; k++) {
    const a = random() * Math.PI * 2,
      r = 12 + random() ** 0.8 * 64,
      x = 128 + Math.cos(a) * r,
      y = 128 + Math.sin(a) * r;
    twig(128 + Math.cos(a) * 8, 128 + Math.sin(a) * 8, x, y, 2);
    for (let n = 0; n < 2; n++) {
      const b = random() * Math.PI * 2,
        length = 10 + random() * 6;
      leaf(x + Math.cos(b) * 12, y + Math.sin(b) * 12, b, length, length * 0.4, `hsl(${84 + random() * 16}, ${30 + random() * 12}%, ${52 + random() * 14}%)`);
    }
    for (let n = 0; n < 15; n++) {
      const b = random() * Math.PI * 2,
        d = random() ** 0.6 * 30,
        fx = x + Math.cos(b) * d,
        fy = y + Math.sin(b) * d,
        size = 5 + random() * 3,
        upper = fy - y < -3,
        petal = `hsl(${338 + random() * 16}, ${55 + random() * 30}%, ${upper ? 88 + random() * 9 : 74 + random() * 12}%)`,
        spin = random() * Math.PI;
      ctx.fillStyle = petal;
      for (let p = 0; p < 5; p++) {
        const t = spin + (p / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(fx + Math.cos(t) * size * 0.62, fy + Math.sin(t) * size * 0.62, size * 0.55, size * 0.42, t, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = `hsl(${345 + random() * 10}, 70%, ${52 + random() * 12}%)`;
      ctx.beginPath();
      ctx.arc(fx, fy, size * 0.26, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
/**
 * A palm frond on a clear ground (128 × 512, its stalk at the bottom): a midrib with narrow leaflets either side,
 * longest in the middle, drooping toward their tips, in pale greys of a green cast so that a tint gives the hue.
 */
export function frond() {
  return once("frond", () => {
    const { c, ctx } = canvas(128, 512),
      random = sequence(71);
    ctx.lineCap = "round";
    for (let y = 500; y > 12; y -= 7) {
      const t = 1 - y / 512,
        long = 58 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.6) + 4;
      for (const side of [-1, 1]) {
        ctx.strokeStyle = `hsl(${80 + random() * 14}, ${22 + random() * 12}%, ${side < 0 ? 52 + random() * 30 : 64 + random() * 30}%)`;
        ctx.lineWidth = 4.5 + random() * 2;
        ctx.beginPath();
        ctx.moveTo(64, y);
        ctx.quadraticCurveTo(64 + side * long * 0.6, y - long * 0.22, 64 + side * long, y - long * 0.55 + random() * 6);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = "hsl(60, 25%, 38%)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(64, 512);
    ctx.lineTo(64, 8);
    ctx.stroke();
    return c;
  });
}
/** A kind of foliage painted over in `colour` (multiplied, its leafy outline kept), for pictures painted on a canvas. */
export function tinted(kind: LeafKind, colour: string) {
  return once(`tinted:${kind}:${colour}`, () => {
    const leaves = foliage(kind),
      { c, ctx } = canvas(leaves.width, leaves.height);
    ctx.drawImage(leaves, 0, 0);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = colour;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(leaves, 0, 0);
    return c;
  });
}
/** The colour a core of each kind is painted on: the shade deep inside the crown. */
const DEEP: Record<LeafKind, string> = {
  birch: "#4a5a3c",
  oak: "#4a5a3c",
  pine: "#4a5a3c",
  spray: "#4a5a3c",
  broad: "#4a5a3c",
  box: "#46553a",
  blossom: "#c99aa6",
};
/** The foliage laid thick over the shade inside a crown, for its core. */
function thick(kind: LeafKind) {
  return once(`thick:${kind}`, () => {
    const leafC = foliage(kind),
      { c, ctx } = canvas(256, 256);
    ctx.fillStyle = DEEP[kind];
    ctx.fillRect(0, 0, 256, 256);
    const tall = kind === "spray" ? 128 : 256;
    for (let y = -tall / 2; y < 256; y += tall / 2) for (const x of [-128, 0, 128]) ctx.drawImage(leafC, x + ((y / (tall / 2)) % 2 ? 64 : 0), y, 256, tall);
    return c;
  });
}
export interface LeafPaint {
  /** The cards: the foliage alpha-tested, both faces, matt (Lambert, as there are a great many leaves). */
  cards: T.MeshLambertMaterial;
  /** The core: the same foliage laid thick over the shade inside a crown. */
  core: T.MeshLambertMaterial;
}
/** The two paints of a kind of foliage, made for one view (textures and materials registered with `own`). */
export function leafPaint(kind: LeafKind, own: Own): LeafPaint {
  return {
    cards: own(new T.MeshLambertMaterial({ color: "#ffffff", map: texture(foliage(kind), own), alphaTest: 0.5, side: T.DoubleSide })),
    core: own(new T.MeshLambertMaterial({ color: kind === "spray" || kind === "blossom" ? "#ffffff" : "#c8c8c8", map: texture(thick(kind), own, [2, 1]) })),
  };
}
/** A texture of one kind of foliage (or of a palm frond), for a view that paints its own leaves with it. */
export function leafTexture(kind: LeafKind | "frond", own: Own) {
  return texture(kind === "frond" ? frond() : foliage(kind), own);
}
/** A quad of a leaf card: its four corners in order round it, their normals, and the stretch of the picture across
 *  its first edge (the whole picture when not given). */
interface Card {
  corners: T.Vector3[];
  normals: T.Vector3[];
  u?: [number, number];
}
/** A geometry put together from leaf cards. */
function cards(quads: Card[]) {
  const positions: number[] = [],
    normals: number[] = [],
    uvs: number[] = [],
    index: number[] = [];
  quads.forEach(({ corners, normals: n, u = [0, 1] }, q) => {
    corners.forEach((p, k) => {
      positions.push(p.x, p.y, p.z);
      normals.push(n[k].x, n[k].y, n[k].z);
      uvs.push(k === 1 || k === 2 ? u[1] : u[0], k >= 2 ? 1 : 0);
    });
    index.push(q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3);
  });
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uvs, 2));
  g.setIndex(index);
  return g;
}
/**
 * A crown of `count` leaf cards about a unit ball: cards spread evenly over the sphere (a Fibonacci spiral), each
 * facing outward, turned its own way and leaning a little, reaching a little past the ball, with the normals of a ball
 * so that the crown is lit as one rounded mass, brighter on top.
 */
export function leafBall(count: number, seed: number) {
  const random = sequence(seed),
    quads: Card[] = [];
  for (let k = 0; k < count; k++) {
    const y = 1 - ((k + 0.5) / count) * 2,
      r = Math.sqrt(1 - y * y),
      a = k * 2.39996 + random() * 0.4,
      out = new T.Vector3(Math.cos(a) * r, y, Math.sin(a) * r).normalize(),
      centre = out.clone().multiplyScalar(0.6 + random() * 0.12),
      // Two axes across the card: tangent to the ball, rolled at random, tipped a little out of the tangent plane.
      helper = Math.abs(out.y) > 0.9 ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 1, 0),
      u0 = new T.Vector3().crossVectors(helper, out).normalize(),
      v0 = new T.Vector3().crossVectors(out, u0),
      roll = random() * Math.PI * 2,
      u = u0.clone().multiplyScalar(Math.cos(roll)).addScaledVector(v0, Math.sin(roll)).addScaledVector(out, (random() - 0.5) * 0.5).normalize(),
      v = new T.Vector3().crossVectors(out, u).normalize(),
      half = 0.6 + random() * 0.12,
      corners = [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([i, j]) => centre.clone().addScaledVector(u, i * half).addScaledVector(v, j * half));
    quads.push({ corners, normals: corners.map((p) => p.clone().normalize().lerp(out, 0.35).normalize()) });
  }
  return cards(quads);
}
/**
 * The branches of one tier of a spruce about a unit cone (base radius 1 at y = 0, its tip at y = 1): two rings of
 * spray cards from near the trunk out and down to the rim, drooping in the middle, the upper ring shorter and steeper,
 * lit as a cone; `plain`, fewer and straight, for far trees.
 */
export function sprayTier(seed: number, plain = false) {
  const random = sequence(seed),
    quads: Card[] = [],
    pieces = plain ? 1 : 2;
  for (const [ring, count, inner, top, reach, foot] of [
    [0, plain ? 5 : 7, 0.06, 0.62, 1.05, 0.02],
    [1, plain ? 4 : 5, 0.05, 0.92, 0.72, 0.36],
  ] as const) {
    for (let k = 0; k < count; k++) {
      const a = ((k + ring * 0.5) / count) * Math.PI * 2 + (random() - 0.5) * 0.3,
        out = new T.Vector3(Math.cos(a), 0, Math.sin(a)),
        side = new T.Vector3(-Math.sin(a), 0, Math.cos(a)),
        r = reach * (0.92 + random() * 0.14),
        // Along the branch in two pieces (one, plain), sagging between the trunk and the tip.
        at = (t: number) => out.clone().multiplyScalar(inner + (r - inner) * t).setY(top + (foot - top) * t - Math.sin(t * Math.PI) * 0.07),
        width = (t: number) => (0.34 + 0.16 * (1 - t)) * (ring ? 0.85 : 1),
        lit = (p: T.Vector3) => new T.Vector3(p.x, 0, p.z).normalize().multiplyScalar(0.75).setY(0.66).normalize();
      for (let s = 0; s < pieces; s++) {
        const t0 = s / pieces,
          t1 = (s + 1) / pieces,
          p0 = at(t0),
          p1 = at(t1),
          corners = [p0.clone().addScaledVector(side, -width(t0)), p1.clone().addScaledVector(side, -width(t1)), p1.clone().addScaledVector(side, width(t1)), p0.clone().addScaledVector(side, width(t0))];
        // Each piece shows its own part of the spray along the picture.
        quads.push({ corners, normals: corners.map(lit), u: [t0, t1] });
      }
    }
  }
  return cards(quads);
}
/** A spruce tier's core: a cone whose underside is lit as if it faced up, as the needles under a branch catch the
 *  sky's light from round it (facing down it was a black disc under every tier). Base radius 0.82 at y = 0. */
export function tierCore() {
  const cone = new T.ConeGeometry(0.82, 0.9, 9).translate(0, 0.45, 0),
    up = cone.getAttribute("normal");
  for (let i = 0; i < up.count; i++) if (up.getY(i) < -0.5) up.setXYZ(i, 0, 1, 0);
  return cone;
}
/** How much of a crown's size its core takes (the rest is cards round it, which gives the depth inside). */
export const CORE = new T.Vector3(0.78, 0.86, 0.78);
/** Cards a crown has near and far, by kind (with a seed each, so that the kinds do not repeat one another). */
const CARDS: Record<Exclude<LeafKind, "spray">, [number, number, number]> = {
  birch: [11, 7, 71],
  oak: [11, 7, 73],
  pine: [9, 6, 67],
  broad: [11, 7, 83],
  box: [9, 6, 89],
  blossom: [12, 8, 97],
};
export interface GroveOptions {
  /** Crowns further than this from `centre` (on the ground plane) take fewer cards; all are near when not given. */
  near?: number;
  centre?: [number, number];
  /** Whether the cores cast shadows (the cards never do). Default true. */
  shadow?: boolean;
  /** Whether the cores take the shadows of others. Default true. */
  receive?: boolean;
  /** How much brighter the cards are tinted than the core (the hunt's 1.25 by default). */
  bright?: number;
  /** How much lighter the cores are tinted (a daylit toy scene, whose other paints take the reflected room's light,
   *  wants its matt leaves a little lighter than the dusk of the hunt). Default 1. */
  lift?: number;
  /** Cards a crown has, as a share of its kind's own count (fewer for small or far crowns). Default 1. */
  leaves?: number;
}
interface Batch {
  geometry: T.BufferGeometry;
  material: T.Material;
  shadow: boolean;
  receive: boolean;
  at: { m: T.Matrix4; c: T.Color }[];
}
type Triple = [number, number, number];
const turned = (a: number) => new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), a);
/**
 * Crowns of leaf cards laid as instanced meshes: `crown` a round or heaped crown (a ball of cards about its middle,
 * `size` its radius on each axis), `tier` one skirt of a spruce or fir (its foot at `at`, `size` its radius, height and
 * radius), then `build` once to add them to `parent`. Positions are in `parent`'s space.
 */
export class Grove {
  private batches = new Map<string, Batch>();
  private paints = new Map<LeafKind, LeafPaint>();
  constructor(
    private readonly parent: T.Object3D,
    private readonly own: Own,
    private readonly options: GroveOptions = {},
  ) {}
  private paint(kind: LeafKind) {
    let p = this.paints.get(kind);
    if (!p) this.paints.set(kind, (p = leafPaint(kind, this.own)));
    return p;
  }
  private batch(key: string, make: () => T.BufferGeometry, material: () => T.Material, shadow: boolean, receive: boolean) {
    let b = this.batches.get(key);
    if (!b) this.batches.set(key, (b = { geometry: this.own(make()), material: material(), shadow, receive, at: [] }));
    return b;
  }
  private isNear(at: T.Vector3) {
    const { near, centre = [0, 0] } = this.options;
    return near === undefined || Math.hypot(at.x - centre[0], at.z - centre[1]) < near;
  }
  private put(kind: LeafKind, core: () => T.BufferGeometry, cards: (near: boolean) => T.BufferGeometry, at: T.Vector3, size: T.Vector3, tint: T.Color, turn: number) {
    const q = turned(turn),
      paint = this.paint(kind),
      near = this.isNear(at),
      { shadow = true, receive = true, bright = 1.25, lift = 1 } = this.options;
    this.batch(`${kind}:core`, core, () => paint.core, shadow, receive).at.push({ m: new T.Matrix4().compose(at, q, size.clone().multiply(CORE)), c: tint.clone().multiplyScalar(lift) });
    this.batch(`${kind}:${near ? "near" : "far"}`, () => cards(near), () => paint.cards, false, false).at.push({
      m: new T.Matrix4().compose(at, q, size),
      c: tint.clone().multiplyScalar(bright),
    });
  }
  /** A crown of `kind` round `at`, `size` its radius (one number, or one an axis), tinted `tint`, turned `turn`. */
  crown(kind: Exclude<LeafKind, "spray">, at: T.Vector3 | Triple, size: number | Triple, tint: T.ColorRepresentation, turn = 0) {
    const [count, few, seed] = CARDS[kind],
      share = this.options.leaves ?? 1,
      where = Array.isArray(at) ? new T.Vector3(...at) : at.clone(),
      by = typeof size === "number" ? new T.Vector3(size, size, size) : new T.Vector3(...size);
    this.put(
      kind,
      () => new T.IcosahedronGeometry(0.74, 0),
      (near) => leafBall(Math.max(4, Math.round((near ? count : few) * share)), seed + (near ? 0 : 1)),
      where,
      by,
      new T.Color(tint),
      turn,
    );
  }
  /** One tier of a spruce or fir: its foot at `at`, `size` its radius, height and radius (as for a cone standing there). */
  tier(at: T.Vector3 | Triple, size: Triple, tint: T.ColorRepresentation, turn = 0) {
    const where = Array.isArray(at) ? new T.Vector3(...at) : at.clone();
    this.put("spray", tierCore, (near) => sprayTier(near ? 61 : 62, !near), where, new T.Vector3(...size), new T.Color(tint), turn);
  }
  /** Adds every crown laid to the parent as instanced meshes, and returns them (to be put on a layer, say). */
  build() {
    const meshes: T.InstancedMesh[] = [];
    for (const b of this.batches.values()) {
      if (!b.at.length) continue;
      const mesh = new T.InstancedMesh(b.geometry, b.material, b.at.length);
      b.at.forEach(({ m, c }, i) => {
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c);
      });
      mesh.castShadow = b.shadow;
      mesh.receiveShadow = b.receive;
      mesh.computeBoundingSphere();
      this.parent.add(this.own(mesh));
      meshes.push(mesh);
    }
    this.batches.clear();
    return meshes;
  }
}
