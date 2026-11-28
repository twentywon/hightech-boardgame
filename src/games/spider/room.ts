import * as T from "three";
import { capable, glossy, weave, wood } from "../../engine/scene-utils";
import { frond } from "../../engine/foliage";
import { painted, roundedRect, sequence, standard, turned } from "../patience/props";
import { FELT, HOME_STEP, HOME_X, PILES_Z, STOCK_STEP, stockSpot } from "./layout";

type Own = <R extends { dispose(): void }>(resource: R) => R;
/** The width of the wooden frame round the felt. */
const RAIL = 0.78,
  /** The card room's floor, a card table's height below the felt. */
  FLOOR = -11,
  /** The felt's picture: pixels to a unit of the table. */
  SCALE = 150;
/** The colour behind everything: the dark of the room's far corners. */
export const ROOM_CLEAR = "#120d0b";
/**
 * The spider's card room, all modelled and painted in code: a deep blue felt with a gold thread border, a place
 * stitched for the completed runs and one for the stock, in a lacquered mahogany frame with brass corners (a small
 * brass spider sits on its far side); below, a floor of black and ivory marble, a palm in a glazed pot at the left
 * and a round side table at the right with a candle, a glass of water and a box of cards. The light is a lamp
 * hanging over the table, so the room falls away into the dark. Only the cards and the frame cast shadows.
 */
export function cardRoom(scene: T.Scene, own: Own) {
  const fine = capable();
  scene.add(new T.HemisphereLight("#f2ecff", "#2a1d14", fine ? 1.0 : 1.35));
  // The lamp over the table: a spot, so that its light falls off toward the room. Where the processor draws alone, a
  // plain sun from the same place (the table's old light), which costs far less for every point of the picture.
  const lamp = fine ? new T.SpotLight("#fff1da", 880, 0, 0.86, 0.42, 2) : new T.DirectionalLight("#fff1da", 2.6);
  lamp.position.set(-2.4, 17, 4.2);
  lamp.target.position.set(0, 0, 0.2);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(2048, 2048);
  if (lamp instanceof T.DirectionalLight) Object.assign(lamp.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9 });
  lamp.shadow.camera.near = 6;
  lamp.shadow.camera.far = 40;
  lamp.shadow.normalBias = 0.02;
  lamp.shadow.bias = -0.0004;
  own(lamp.shadow);
  scene.add(lamp, lamp.target);
  // A soft light from the room on the near side, so that the cards are never in the dark (where the processor draws
  // alone, the sky light does its work: one light fewer to work out for every point of the picture).
  if (fine) {
    const fill = new T.DirectionalLight("#dfe6ff", 0.55);
    fill.position.set(4, 9, 9);
    scene.add(fill);
  }
  table(scene, own, fine);
  floor(scene, own, fine);
  palm(scene, own);
  sideTable(scene, own, fine);
  if (!fine) plain(scene, own);
}
/**
 * Where the processor draws the picture alone (and the browser tests run), the room is worked out the cheaper way:
 * matte surfaces instead of physically lit ones, and its pictures sampled once without slant filtering. Measured on
 * the table at 1228 × 710, this brought a frame back to about what the plain green table cost.
 */
function plain(scene: T.Scene, own: Own) {
  const swaps = new Map<T.Material, T.Material>();
  scene.traverse((thing) => {
    if (!(thing instanceof T.Mesh) || Array.isArray(thing.material) || !(thing.material instanceof T.MeshStandardMaterial)) return;
    const was = thing.material;
    let now = swaps.get(was);
    if (!now) {
      if (was.map) {
        was.map.anisotropy = 1;
        was.map.generateMipmaps = false;
        was.map.minFilter = T.LinearFilter;
      }
      now = own(new T.MeshLambertMaterial({ map: was.map, color: was.color, transparent: was.transparent, opacity: was.opacity, alphaTest: was.alphaTest, side: was.side, depthWrite: was.depthWrite }));
      swaps.set(was, now);
    }
    thing.material = now;
  });
}
/** The felt, its frame, the apron and the legs. */
function table(scene: T.Scene, own: Own, fine: boolean) {
  const shape = roundedRect(FELT.x * 2, FELT.z * 2, 0.35),
    geometry = own(new T.ShapeGeometry(shape, 10)),
    at = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, at.getX(i) / (FELT.x * 2) + 0.5, at.getY(i) / (FELT.z * 2) + 0.5);
  const felt = new T.Mesh(geometry, standard(own, { map: feltPicture(own), roughness: 0.97, ...weave(26, 17, own, 0.8) }));
  felt.rotation.x = -Math.PI / 2;
  felt.receiveShadow = true;
  scene.add(felt);
  // The frame: mahogany under lacquer, rounded over on both edges.
  const ring = roundedRect((FELT.x + RAIL) * 2, (FELT.z + RAIL) * 2, 0.7);
  ring.holes.push(roundedRect(FELT.x * 2 + 0.02, FELT.z * 2 + 0.02, 0.35, new T.Path()));
  const grain = own(wood(true));
  grain.repeat.set(0.14, 0.14);
  const mahogany = own(glossy({ map: grain, color: "#b8765a", roughness: 0.42 }, 0.8)),
    rail = new T.Mesh(own(new T.ExtrudeGeometry(ring, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.1, bevelSegments: fine ? 5 : 3, curveSegments: 14 })), mahogany);
  rail.rotation.x = -Math.PI / 2;
  rail.position.y = 0.02;
  rail.castShadow = fine;
  rail.receiveShadow = true;
  scene.add(rail);
  // A brass bead between the felt and the frame.
  const brass = own(glossy({ color: "#c79b4a", metalness: 0.85, roughness: 0.32 }));
  const bead = roundedRect(FELT.x * 2 + 0.14, FELT.z * 2 + 0.14, 0.42);
  bead.holes.push(roundedRect(FELT.x * 2 - 0.02, FELT.z * 2 - 0.02, 0.34, new T.Path()));
  const strip = new T.Mesh(own(new T.ExtrudeGeometry(bead, { depth: 0.035, bevelEnabled: false, curveSegments: 14 })), brass);
  strip.rotation.x = -Math.PI / 2;
  strip.position.y = 0.005;
  scene.add(strip);
  // Brass corner plates on the frame.
  const plate = new T.Shape();
  plate.moveTo(0, 0);
  plate.lineTo(0.62, 0);
  plate.quadraticCurveTo(0.26, 0.26, 0, 0.62);
  plate.closePath();
  const plateGeometry = own(new T.ExtrudeGeometry(plate, { depth: 0.015, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.02, bevelSegments: 2, curveSegments: 10 }));
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) {
      const corner = new T.Mesh(plateGeometry, brass);
      corner.rotation.x = -Math.PI / 2;
      // The plate's right angle sits in the frame's outer corner.
      corner.scale.set(-sx, sz, 1);
      corner.position.set(sx * (FELT.x + RAIL - 0.04), 0.19, sz * (FELT.z + RAIL - 0.04));
      scene.add(corner);
    }
  spider(scene, own, brass, fine);
  // The apron under the frame (only its sides: its top would lie unseen under the felt), and four turned legs.
  const walnut = standard(own, { map: grain, color: "#8a5a44", roughness: 0.5 }),
    band = roundedRect((FELT.x + RAIL) * 2 + 0.06, (FELT.z + RAIL) * 2 + 0.06, 0.75);
  band.holes.push(roundedRect(FELT.x * 2, FELT.z * 2, 0.35, new T.Path()));
  const apron = new T.Mesh(own(new T.ExtrudeGeometry(band, { depth: 1.1, bevelEnabled: false, curveSegments: 12 })), walnut);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = -1.15;
  // The apron and the legs stand under the table, seen only past its edge on a wide screen: not drawn where the
  // processor draws alone (the apron, hidden under the felt, cost a third of a frame there all the same).
  if (fine) scene.add(apron);
  if (fine)
    for (const sx of [-1, 1])
      for (const sz of [-1, 1])
        turned(scene, own, [[0.3, 0], [0.4, 0.5], [0.26, 1.6], [0.34, 6.4], [0.48, 8.6], [0.52, 9.6], [0.42, 9.9]], [sx * (FELT.x + 0.05), FLOOR, sz * (FELT.z + 0.05)], walnut, 18, false);
}
/**
 * The felt's picture: deep blue, a little lighter under the lamp, a double gold thread a hand's breadth inside the
 * frame, and stitched places for the completed runs (with a spider's web in the middle) and for the stock.
 */
function feltPicture(own: Own) {
  const w = Math.round(FELT.x * 2 * SCALE),
    h = Math.round(FELT.z * 2 * SCALE);
  return painted(own, w, h, (ctx) => {
    const px = (x: number) => (x + FELT.x) * SCALE,
      pz = (z: number) => (z + FELT.z) * SCALE;
    ctx.fillStyle = "#173a60";
    ctx.fillRect(0, 0, w, h);
    const glow = ctx.createRadialGradient(w * 0.46, h * 0.42, 40, w / 2, h / 2, w * 0.62);
    glow.addColorStop(0, "rgba(110,160,215,0.12)");
    glow.addColorStop(0.6, "rgba(40,80,130,0.04)");
    glow.addColorStop(1, "rgba(4,10,24,0.5)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    // The nap of the cloth: faint streaks.
    const next = sequence(19);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = next() < 0.5 ? "rgba(0,8,24,0.07)" : "rgba(170,205,240,0.05)";
      ctx.fillRect(next() * w, next() * h, 1 + next() * 5, 1);
    }
    // The gold thread border, doubled.
    ctx.strokeStyle = "rgba(214,178,98,0.62)";
    ctx.lineWidth = 3;
    const inset = 0.2 * SCALE;
    ctx.beginPath();
    ctx.roundRect(inset, inset, w - inset * 2, h - inset * 2, 0.3 * SCALE);
    ctx.stroke();
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(inset + 9, inset + 9, w - inset * 2 - 18, h - inset * 2 - 18, 0.3 * SCALE - 9);
    ctx.stroke();
    // Stitched places: a dashed outline, as a running stitch.
    const stitched = (x0: number, z0: number, x1: number, z1: number) => {
      ctx.save();
      ctx.setLineDash([12, 8]);
      ctx.strokeStyle = "rgba(226,196,128,0.5)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(px(x0), pz(z0), (x1 - x0) * SCALE, (z1 - z0) * SCALE, 0.1 * SCALE);
      ctx.stroke();
      ctx.restore();
    };
    stitched(HOME_X - 0.56, PILES_Z - 0.81, HOME_X + 7 * HOME_STEP + 0.56, PILES_Z + 0.81);
    stitched(stockSpot.x - 4 * STOCK_STEP - 0.56, PILES_Z - 0.81, stockSpot.x + 0.56, PILES_Z + 0.81);
    // A spider's web in gold thread in the middle of the place for the runs.
    ctx.save();
    ctx.translate(px(HOME_X + 3.5 * HOME_STEP), pz(PILES_Z));
    ctx.strokeStyle = "rgba(226,196,128,0.42)";
    ctx.lineWidth = 2;
    const spokes = 10,
      r = 0.62 * SCALE;
    for (let k = 0; k < spokes; k++) {
      const a = (k / spokes) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      ctx.stroke();
    }
    for (let ring = 1; ring <= 5; ring++) {
      const rr = (ring / 5) * r * 0.95;
      ctx.beginPath();
      for (let k = 0; k <= spokes; k++) {
        const a = (k / spokes) * Math.PI * 2,
          b = ((k - 0.5) / spokes) * Math.PI * 2;
        if (k === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        // Each thread sags a little toward the middle between two spokes.
        else ctx.quadraticCurveTo(Math.cos(b) * rr * 0.86, Math.sin(b) * rr * 0.86, Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.stroke();
    }
    ctx.restore();
  });
}
/** A small brass spider resting on the far side of the frame. */
function spider(scene: T.Scene, own: Own, brass: T.Material, fine: boolean) {
  const group = new T.Group(),
    dark = own(glossy({ color: "#2b1d14", metalness: 0.6, roughness: 0.3 })),
    body = new T.Mesh(own(new T.SphereGeometry(0.1, fine ? 18 : 10, fine ? 12 : 8)), dark),
    head = new T.Mesh(own(new T.SphereGeometry(0.065, fine ? 14 : 8, fine ? 10 : 6)), brass);
  body.scale.set(1, 0.7, 1.25);
  body.position.set(0, 0.06, 0.06);
  head.scale.set(1, 0.75, 1);
  head.position.set(0, 0.05, -0.1);
  group.add(body, head);
  const legGeometry = own(new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0.05, 0), new T.Vector3(0.12, 0.13, 0), new T.Vector3(0.26, 0.0, 0)]), 8, 0.012, 5, false));
  for (const side of [-1, 1])
    for (let k = 0; k < 4; k++) {
      const leg = new T.Mesh(legGeometry, brass);
      leg.position.set(side * 0.04, 0, -0.08 + k * 0.05);
      leg.rotation.y = side < 0 ? Math.PI - (k - 1.5) * 0.42 : (k - 1.5) * 0.42;
      group.add(leg);
    }
  for (const child of group.children) child.castShadow = true;
  group.position.set(FELT.x + RAIL * 0.5, 0.17, -2.3);
  group.rotation.y = -0.25;
  scene.add(group);
}
/** Black and ivory marble squares, set on the diagonal under the table. */
function floor(scene: T.Scene, own: Own, fine: boolean) {
  const map = painted(own, 512, 512, (ctx, w, h) => {
    const next = sequence(5);
    for (let i = 0; i < 2; i++)
      for (let j = 0; j < 2; j++) {
        const dark = (i + j) % 2 === 1;
        ctx.fillStyle = dark ? "#2b2826" : "#b3a994";
        ctx.fillRect((i * w) / 2, (j * h) / 2, w / 2, h / 2);
        // Veins.
        ctx.save();
        ctx.beginPath();
        ctx.rect((i * w) / 2, (j * h) / 2, w / 2, h / 2);
        ctx.clip();
        for (let v = 0; v < 5; v++) {
          ctx.strokeStyle = dark ? `rgba(200,190,175,${0.08 + next() * 0.12})` : `rgba(90,80,70,${0.08 + next() * 0.14})`;
          ctx.lineWidth = 0.6 + next() * 1.8;
          ctx.beginPath();
          let x = (i * w) / 2 + next() * (w / 2),
            y = (j * h) / 2;
          ctx.moveTo(x, y);
          for (let s = 0; s < 8; s++) {
            x += (next() - 0.5) * 40;
            y += h / 16;
            ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
        ctx.restore();
        ctx.strokeStyle = "rgba(0,0,0,0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect((i * w) / 2 + 1, (j * h) / 2 + 1, w / 2 - 2, h / 2 - 2);
      }
  }, true);
  map.repeat.set(34, 34);
  map.rotation = Math.PI / 4;
  const size = 110,
    shape = roundedRect(size, size, 0.01),
    hole = { x: FELT.x + RAIL - 0.3, z: FELT.z + RAIL - 0.3 };
  // A hole where the table stands over it, which no eye above the table could see past.
  shape.holes.push(roundedRect(hole.x * 2, hole.z * 2, 0.5, new T.Path()));
  const geometry = own(new T.ShapeGeometry(shape, 4)),
    at = geometry.getAttribute("position"),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < at.count; i++) uv.setXY(i, at.getX(i) / size + 0.5, at.getY(i) / size + 0.5);
  const mesh = new T.Mesh(geometry, standard(own, { map, roughness: 0.3, color: "#8f877c" }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = FLOOR;
  scene.add(mesh);
  // Where the processor draws alone, a darker floor stands for the pool of light below: a sheet over the whole floor
  // cost a tenth of a frame there.
  if (!fine) {
    (mesh.material as T.MeshStandardMaterial).color.set("#6b655d");
    return;
  }
  // The lamp's pool of light: the floor darkens away from the table.
  const dusk = new T.Mesh(
    own(new T.PlaneGeometry(64, 64)),
    own(new T.MeshBasicMaterial({ color: "#000000", transparent: true, depthWrite: false, map: painted(own, 256, 256, (ctx, w, h) => {
      const g = ctx.createRadialGradient(w / 2, h / 2, w * 0.12, w / 2, h / 2, w / 2);
      g.addColorStop(0, "rgb(0,0,0)");
      g.addColorStop(0.45, "rgb(140,140,140)");
      g.addColorStop(1, "rgb(230,230,230)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }) })),
  );
  // The picture's grey is its strength: dark where it is light.
  (dusk.material as T.MeshBasicMaterial).alphaMap = (dusk.material as T.MeshBasicMaterial).map;
  (dusk.material as T.MeshBasicMaterial).map = null;
  dusk.rotation.x = -Math.PI / 2;
  dusk.position.y = FLOOR + 0.05;
  dusk.renderOrder = 1;
  scene.add(dusk);
}
/** A kentia palm in a glazed pot on the floor at the table's left. */
function palm(scene: T.Scene, own: Own) {
  const x = -11.6,
    z = -0.6,
    glaze = own(glossy({ color: "#1f4a5a", roughness: 0.25 }));
  turned(scene, own, [[0.9, 0], [1.25, 0.3], [1.55, 1.6], [1.7, 3.0], [1.82, 3.2], [1.7, 3.25]], [x, FLOOR, z], glaze, 32, false);
  // The soil.
  const soil = new T.Mesh(own(new T.CircleGeometry(1.66, 24)), standard(own, { color: "#2c2018", roughness: 1 }));
  soil.rotation.x = -Math.PI / 2;
  soil.position.set(x, FLOOR + 3.05, z);
  scene.add(soil);
  const texture = own(new T.CanvasTexture(frond()));
  texture.colorSpace = T.SRGBColorSpace;
  const leaf = standard(own, { map: texture, color: "#6f9a4a", alphaTest: 0.45, side: T.DoubleSide, roughness: 0.7 });
  // A frond: a strip that rises from the pot and arches over, its picture's stalk at the pot.
  const length = 6.2,
    geometry = own(new T.PlaneGeometry(1.7, length, 1, 10)),
    at = geometry.getAttribute("position");
  for (let i = 0; i < at.count; i++) {
    const t = at.getY(i) / length + 0.5;
    // Up out of the pot, then over and down toward the tip.
    at.setXYZ(i, at.getX(i) * (0.4 + t * 0.6), Math.sin(t * Math.PI * 0.85) * 3.4 - t * t * 1.2, t * length);
  }
  geometry.computeVertexNormals();
  const next = sequence(31);
  for (let k = 0; k < 11; k++) {
    const mesh = new T.Mesh(geometry, leaf),
      a = (k / 11) * Math.PI * 2 + next() * 0.4,
      s = 0.75 + next() * 0.35;
    mesh.position.set(x, FLOOR + 3.1 + next() * 1.6, z);
    mesh.rotation.set(-0.35 - next() * 0.35, a, 0, "YXZ");
    mesh.scale.setScalar(s);
    scene.add(mesh);
  }
}
/** A round side table at the right with a lit candle, a glass of water and a box of cards. */
function sideTable(scene: T.Scene, own: Own, fine: boolean) {
  const x = 11.4,
    z = 0.4,
    top = FLOOR + 7.2,
    grain = own(wood(true));
  grain.repeat.set(0.3, 0.3);
  const mahogany = own(glossy({ map: grain, color: "#b8765a", roughness: 0.4 }, 0.8));
  turned(scene, own, [[1.2, 0], [1.3, 0.2], [0.3, 0.5], [0.22, 3], [0.36, 5.6], [0.2, 6.9], [2.1, 6.95], [2.2, 7.05], [2.1, 7.2], [0, 7.2]], [x, FLOOR, z], mahogany, 40, false);
  const brass = own(glossy({ color: "#c79b4a", metalness: 0.85, roughness: 0.3 }));
  // The candlestick and its candle, its flame glowing.
  const cx = x - 0.7,
    cz = z - 0.6;
  turned(scene, own, [[0.42, 0], [0.45, 0.06], [0.14, 0.2], [0.1, 0.9], [0.2, 1.0], [0.24, 1.08], [0.12, 1.1]], [cx, top, cz], brass, 28, false);
  turned(scene, own, [[0.11, 0], [0.11, 0.6], [0.06, 0.66], [0, 0.66]], [cx, top + 1.08, cz], standard(own, { color: "#f1e6cf", roughness: 0.6 }), 18, false);
  const flame = new T.Mesh(own(new T.SphereGeometry(0.07, 10, 8)), own(new T.MeshBasicMaterial({ color: "#ffd98a" })));
  flame.scale.set(1, 2.1, 1);
  flame.position.set(cx, top + 1.88, cz);
  const halo = new T.Sprite(own(new T.SpriteMaterial({ map: haloPicture(own), color: "#ffcf7a", transparent: true, depthWrite: false, blending: T.AdditiveBlending, opacity: 0.8 })));
  halo.scale.set(1.5, 1.5, 1);
  halo.position.copy(flame.position);
  scene.add(flame, halo);
  if (fine) {
    const glow = new T.PointLight("#ffb866", 6, 7, 2);
    glow.position.set(cx, top + 2.1, cz);
    scene.add(glow);
  }
  // A glass of water.
  const glass = new T.Mesh(
    own(new T.LatheGeometry([[0, 0], [0.32, 0], [0.34, 0.05], [0.38, 0.7], [0.36, 0.7], [0.3, 0.08], [0, 0.08]].map(([r, y]) => new T.Vector2(r, y)), 28)),
    own(glossy({ color: "#d8ecf2", roughness: 0.06, transparent: true, opacity: 0.2, depthWrite: false })),
  );
  glass.position.set(x + 0.8, top, z - 0.5);
  scene.add(glass);
  // A box of cards, its lid printed with a web.
  const box = painted(own, 128, 192, (ctx, w, h) => {
    ctx.fillStyle = "#7a1f25";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#e0c27e";
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.lineWidth = 2;
    ctx.translate(w / 2, h / 2);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 40, Math.sin(a) * 40);
      ctx.stroke();
    }
    for (const r of [14, 26, 38]) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  const side = standard(own, { color: "#6a1a20", roughness: 0.6 }),
    lid = standard(own, { map: box, roughness: 0.55 }),
    deck = new T.Mesh(own(new T.BoxGeometry(0.72, 0.28, 1.05)), [side, side, lid, side, side, side]);
  deck.position.set(x + 0.2, top + 0.14, z + 0.9);
  deck.rotation.y = 0.35;
  scene.add(deck);
}
/** A soft round glow for the candle's flame. */
function haloPicture(own: Own) {
  return painted(own, 64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.3, "rgba(255,255,255,0.35)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}
