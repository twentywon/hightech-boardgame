import * as T from "three";
import type { Color, PieceSymbol } from "chess.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, glossy } from "../../engine/scene-utils";

/**
 * The chess set: turned Staunton-like pieces of boxwood and ebony, each standing on a ring of green felt. Every
 * piece is one geometry (its parts merged, their colours carried by the vertices: the felt, the knight's eyes, the
 * bishop's slit), so a piece is drawn at one stroke; boxwood shows a fine grain, ebony a deep polish.
 */

/** Registers a resource with the view that must dispose it. */
type Own = <R extends { dispose(): void }>(resource: R) => R;

const BOXWOOD = "#ecdcb4",
  EBONY = "#191513",
  FELT = "#2c5a3c";

/** A fine, straight grain running up the piece (the turned parts' first texture coordinate goes round them). */
function grainMap(own: Own) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  let seed = 23;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  ctx.fillStyle = "#fbf6ee";
  ctx.fillRect(0, 0, 256, 64);
  // Broad soft bands of a slightly darker or lighter growth, then thin lines of the grain.
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(150,110,60,${0.04 + rnd() * 0.05})` : `rgba(255,255,255,${0.15 + rnd() * 0.2})`;
    ctx.fillRect(rnd() * 256, 0, 6 + rnd() * 22, 64);
  }
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 256,
      wave = rnd() * 3;
    ctx.strokeStyle = `rgba(120,80,36,${0.035 + rnd() * 0.08})`;
    ctx.lineWidth = 0.6 + rnd() * 1.3;
    ctx.beginPath();
    for (let y = 0; y <= 64; y += 8) ctx.lineTo(x + Math.sin(y / 9 + i) * wave, y);
    ctx.stroke();
  }
  const t = own(new T.CanvasTexture(c));
  t.colorSpace = T.SRGBColorSpace;
  t.wrapS = t.wrapT = T.RepeatWrapping;
  // Several grains round a piece, not one stretched band.
  t.repeat.set(3, 1);
  return t;
}

/** The two finishes: oiled boxwood with its grain, and polished ebony. Colours come from the vertices. */
export function pieceMaterials(own: Own): Record<Color, T.MeshStandardMaterial> {
  const map = grainMap(own);
  return {
    // The turned bodies were open shells once and are painted on both sides still (AGENTS).
    w: own(glossy({ color: "#ffffff", map, vertexColors: true, roughness: 0.42, side: T.DoubleSide }, 0.55)),
    b: own(glossy({ color: "#ffffff", map, vertexColors: true, roughness: 0.2, metalness: 0.02, side: T.DoubleSide }, 1)),
  };
}

const lathe = (points: number[][], segments = 32) =>
  new T.LatheGeometry(
    points.map(([r, y]) => new T.Vector2(r, y)),
    segments,
  );

/** The parts of one piece, as geometry placed where it stands, each with its colour. */
function parts(type: PieceSymbol, color: Color) {
  const body = new T.Color(color === "w" ? BOXWOOD : EBONY),
    list: { geometry: T.BufferGeometry; colour: T.Color }[] = [];
  const add = (geometry: T.BufferGeometry, x = 0, y = 0, z = 0, colour = body) => {
    geometry.translate(x, y, z);
    list.push({ geometry, colour });
    return geometry;
  };
  // The felt ring the piece stands on, a shade inside its foot.
  add(new T.CylinderGeometry(0.292, 0.292, 0.022, 32, 1), 0, 0, 0, new T.Color(FELT));
  // A turned set in the Staunton manner: every piece stands on the same foot and stem, closed at the top.
  add(
    lathe([
      [0, 0.011],
      [0.3, 0.011],
      [0.315, 0.03],
      [0.315, 0.07],
      [0.29, 0.1],
      [0.25, 0.115],
      [0.235, 0.145],
      [0.255, 0.175],
      [0.24, 0.205],
      [0.19, 0.235],
      [0.16, 0.3],
      [0.138, 0.4],
      [0.125, 0.5],
      [0.14, 0.545],
      [0.2, 0.565],
      [0.215, 0.59],
      [0.2, 0.612],
      [0.12, 0.628],
      [0, 0.63],
    ]),
  );
  if (type === "p") {
    add(lathe([[0.12, 0.62], [0.085, 0.66], [0.1, 0.7], [0, 0.7]]));
    add(new T.SphereGeometry(0.175, 28, 20), 0, 0.82);
  }
  if (type === "r") {
    // A tower with a hollow top and six merlons round it.
    add(
      lathe([
        [0.19, 0.61],
        [0.165, 0.66],
        [0.158, 0.86],
        [0.19, 0.9],
        [0.25, 0.93],
        [0.265, 0.96],
        [0.265, 1.03],
        [0.185, 1.03],
        [0.185, 0.97],
        [0, 0.97],
      ]),
    );
    for (let n = 0; n < 6; n++) {
      const a = (n * Math.PI) / 3,
        arc = 0.36,
        merlon = new T.Shape();
      merlon.absarc(0, 0, 0.265, a - arc, a + arc, false);
      merlon.absarc(0, 0, 0.185, a + arc, a - arc, true);
      add(new T.ExtrudeGeometry(merlon, { depth: 0.09, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 1, curveSegments: 6 }).rotateX(-Math.PI / 2), 0, 1.03, 0);
    }
  }
  if (type === "b") {
    // A mitre on a collar, with its slit and a finial.
    add(
      lathe([
        [0.19, 0.61],
        [0.12, 0.65],
        [0.1, 0.72],
        [0.16, 0.755],
        [0.182, 0.78],
        [0.16, 0.805],
        [0.115, 0.825],
        [0.15, 0.9],
        [0.178, 0.99],
        [0.168, 1.08],
        [0.125, 1.17],
        [0.06, 1.24],
        [0, 1.265],
      ]),
    );
    // A thin dark plate set into the mitre: only its edge shows, as the slit.
    const cut = new T.BoxGeometry(0.022, 0.15, 0.345).rotateZ(-0.5);
    add(cut, 0.07, 1.115, 0, new T.Color(color === "w" ? "#6f675a" : "#56605f"));
    add(new T.SphereGeometry(0.052, 18, 12), 0, 1.3);
  }
  if (type === "n") {
    // A horse's head cut from a board and rounded off: ear, forehead, nose, jaw and the arch of the neck.
    const head = new T.Shape();
    head.moveTo(-0.185, 0.6);
    head.splineThru(
      [
        [-0.225, 0.78],
        [-0.21, 0.95],
        [-0.14, 1.1],
        [-0.06, 1.2],
        [-0.025, 1.3],
        [0.03, 1.21],
        [0.095, 1.16],
        [0.2, 1.06],
        [0.295, 0.935],
        [0.32, 0.865],
        [0.285, 0.8],
        [0.2, 0.805],
        [0.125, 0.86],
        [0.105, 0.78],
        [0.15, 0.68],
        [0.17, 0.6],
      ].map(([x, y]) => new T.Vector2(x, y)),
    );
    head.closePath();
    add(
      new T.ExtrudeGeometry(head, {
        depth: 0.13,
        bevelEnabled: true,
        bevelSize: 0.045,
        bevelThickness: 0.055,
        bevelSegments: 4,
        curveSegments: 28,
        steps: 1,
      }),
      0,
      0,
      -0.065,
    );
    // The mane: a ridge down the back of the neck.
    const mane = new T.Shape();
    mane.moveTo(-0.2, 0.64);
    mane.splineThru([[-0.265, 0.8], [-0.25, 0.97], [-0.17, 1.13], [-0.08, 1.24], [-0.1, 1.1], [-0.17, 0.95], [-0.185, 0.8]].map(([x, y]) => new T.Vector2(x, y)));
    mane.closePath();
    add(new T.ExtrudeGeometry(mane, { depth: 0.05, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 2, curveSegments: 16 }), 0, 0, -0.025);
    for (const z of [-0.118, 0.118]) add(new T.SphereGeometry(0.024, 12, 8), 0.135, 1.03, z, new T.Color(color === "w" ? "#2c3230" : "#ddcda5"));
  }
  if (type === "q" || type === "k") {
    add(
      lathe([
        [0.19, 0.61],
        [0.125, 0.66],
        [0.1, 0.8],
        [0.095, 0.98],
        [0.13, 1.04],
        [0.21, 1.07],
        [0.215, 1.1],
        [0.15, 1.12],
        [0.13, 1.16],
        ...(type === "q"
          ? [
              [0.185, 1.25],
              [0.235, 1.305],
              [0.2, 1.305],
              [0.12, 1.25],
              [0, 1.26],
            ]
          : [
              [0.2, 1.27],
              [0.22, 1.31],
              [0.17, 1.335],
              [0.06, 1.36],
              [0, 1.365],
            ]),
      ]),
    );
    if (type === "q") {
      // A coronet of small balls round a dome, and one on top.
      for (let n = 0; n < 8; n++) {
        const a = (n * Math.PI) / 4;
        add(new T.SphereGeometry(0.042, 14, 10), Math.cos(a) * 0.218, 1.325, Math.sin(a) * 0.218);
      }
      add(new T.SphereGeometry(0.13, 22, 14).scale(1, 0.6, 1), 0, 1.27);
      add(new T.SphereGeometry(0.05, 16, 12), 0, 1.38);
    } else {
      add(block(0.085, 0.27, 0.085, 0.02), 0, 1.49);
      add(block(0.25, 0.085, 0.085, 0.02), 0, 1.505);
    }
  }
  return list;
}

/** One piece as one geometry: its parts merged, each part's colour written into its vertices. */
export function pieceGeometry(type: PieceSymbol, color: Color) {
  const pieces = parts(type, color).map(({ geometry, colour }) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    if (flat !== geometry) geometry.dispose();
    const keep = new T.BufferGeometry();
    for (const name of ["position", "normal", "uv"]) keep.setAttribute(name, flat.getAttribute(name));
    const count = flat.getAttribute("position").count,
      colours = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colour.toArray(colours, i * 3);
    keep.setAttribute("color", new T.BufferAttribute(colours, 3));
    return keep;
  });
  const merged = mergeGeometries(pieces, false)!;
  for (const g of pieces) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}
