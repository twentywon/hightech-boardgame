import * as T from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { block, glossy, wood } from "../../engine/scene-utils";
import { FLOOR } from "./table";
import { ballColor } from "./balls";

/**
 * The pool corner of the pub, all modelled here round the table (the pub itself is `pub` in `scenery.ts`): a long
 * lamp of three green shades hung over the table, a floor stand of house cues with chalk, a chalkboard on an easel
 * with the house rules, a tall drinks table with stools and a ball rack lying on it. Table frame: x across (the eye
 * at +x), z along, the cloth at y 0, the floor at `FLOOR`. The costly gloss goes only where a graphics card draws.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
function painted(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  draw(c.getContext("2d")!);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
/** The chalkboard: the house's own words, written in chalk. */
function chalkboard() {
  return painted(512, 640, (ctx) => {
    ctx.fillStyle = "#1f2623";
    ctx.fillRect(0, 0, 512, 640);
    // Rubbed-out chalk, faint clouds of it.
    for (let i = 0; i < 26; i++) {
      const x = (i * 197) % 512,
        y = (i * 331) % 640,
        g = ctx.createRadialGradient(x, y, 0, x, y, 60 + (i % 5) * 18);
      g.addColorStop(0, "rgba(230,235,228,0.07)");
      g.addColorStop(1, "rgba(230,235,228,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 512, 640);
    }
    ctx.fillStyle = "#f2f0e6";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = '700 64px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    ctx.fillText("포켓볼", 256, 92);
    ctx.strokeStyle = "rgba(242,240,230,0.8)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(130, 140);
    ctx.lineTo(382, 140);
    ctx.stroke();
    ctx.font = '600 40px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    ctx.fillStyle = "#f6d36a";
    ctx.fillText("에이트볼 · 나인볼", 256, 205);
    ctx.fillStyle = "#f2f0e6";
    ctx.font = '500 34px "Noto Sans KR", "Apple SD Gothic Neo", sans-serif';
    ["이긴 사람이 계속", "큐 끝에 초크를", "공은 굴려서"].forEach((line, i) => ctx.fillText(line, 256, 290 + i * 62));
    // Two balls drawn in chalk, and a tally.
    ctx.lineWidth = 4;
    for (const [x, colour] of [[180, "#f6d36a"], [332, "#f2f0e6"]] as [number, string][]) {
      ctx.strokeStyle = colour;
      ctx.beginPath();
      ctx.arc(x, 520, 40, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x, 520, 16, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#f6d36a";
    ctx.font = '700 22px "Inter", Arial, sans-serif';
    ctx.fillText("8", 180, 521);
    ctx.fillStyle = "#f2f0e6";
    ctx.fillText("9", 332, 521);
    ctx.strokeStyle = "#f2f0e6";
    ctx.lineWidth = 3;
    for (let k = 0; k < 4; k++) {
      ctx.beginPath();
      ctx.moveTo(228 + k * 14, 595);
      ctx.lineTo(228 + k * 14, 625);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(220, 620);
    ctx.lineTo(282, 598);
    ctx.stroke();
  });
}
/** Builds the corner into `scene`. */
export function poolCorner(scene: T.Object3D, own: Own, rich: boolean) {
  const paint = (options: T.MeshStandardMaterialParameters) => own(rich ? new T.MeshStandardMaterial({ roughness: 0.6, ...options }) : new T.MeshLambertMaterial({ color: options.color, map: options.map ?? null, side: options.side ?? T.FrontSide })),
    shiny = (options: T.MeshStandardMaterialParameters) => own(rich ? glossy({ roughness: 0.3, ...options }, 0.6) : new T.MeshLambertMaterial({ color: options.color, map: options.map ?? null })),
    add = (geometry: T.BufferGeometry, material: T.Material, x = 0, y = 0, z = 0, parent: T.Object3D = scene, cast = true) => {
      const mesh = new T.Mesh(own(geometry), material);
      mesh.position.set(x, y, z);
      mesh.castShadow = cast && rich;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
    merged = (parts: T.BufferGeometry[]) => {
      const one = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))!;
      parts.forEach((g) => g.dispose());
      return one;
    };
  const oak = paint({ map: own(wood(true)), color: "#a8744e", roughness: 0.5 }),
    brass = paint({ color: "#c9a23a", roughness: 0.3, metalness: rich ? 0.85 : 0 }),
    iron = paint({ color: "#26282c", roughness: 0.45, metalness: rich ? 0.6 : 0 });

  // The lamp: three green enamel shades on a brass-capped bar, hung from the ceiling over the middle of the table.
  // It throws no shadow: the table's light stands for its bulbs.
  const lamp = new T.Group();
  lamp.position.set(-0.6, 5.9, 0);
  scene.add(lamp);
  const enamel = paint({ color: "#1d5a3c", roughness: 0.32, metalness: rich ? 0.25 : 0 }),
    inside = own(new T.MeshBasicMaterial({ color: "#fff1d2", side: T.BackSide })),
    bulb = own(new T.MeshBasicMaterial({ color: "#fffaf0" })),
    shade = own(
      new T.LatheGeometry(
        // From the rim up, so that the lathe's faces look outward.
        [
          [0.5, 0.0],
          [0.45, 0.07],
          [0.34, 0.2],
          [0.22, 0.33],
          [0.13, 0.4],
          [0.07, 0.42],
        ].map(([r, y]) => new T.Vector2(r, y)),
        rich ? 32 : 20,
      ),
    );
  add(block(0.18, 0.14, 6.6, 0.05), oak, 0, 0.6, 0, lamp, false);
  for (const z of [-3.3, 3.3]) add(new T.SphereGeometry(0.09, 12, 8), brass, 0, 0.6, z, lamp, false);
  for (const z of [-2.3, 0, 2.3]) {
    const outer = new T.Mesh(shade, enamel),
      under = new T.Mesh(shade, inside);
    outer.position.set(0, 0, z);
    under.position.set(0, 0, z);
    lamp.add(outer);
    // The glowing inside only where a graphics card draws.
    if (rich) lamp.add(under);
    add(new T.CylinderGeometry(0.08, 0.08, 0.16, 12), brass, 0, 0.47, z, lamp, false);
    add(new T.SphereGeometry(0.12, 14, 10), bulb, 0, 0.09, z, lamp, false);
  }
  // Chains up to the ceiling.
  for (const z of [-2.6, 2.6]) add(new T.CylinderGeometry(0.025, 0.025, 3, 5), iron, 0, 2.2, z, lamp, false);

  // The cue stand at the far right: a weighted base, two posts and a top rail with clips, six house cues and chalk.
  const stand = new T.Group();
  stand.position.set(-6.3, FLOOR, -5.0);
  scene.add(stand);
  add(merged([block(0.7, 0.3, 2.4, 0.08).translate(0, 0.15, 0), block(0.16, 4.0, 0.16, 0.04).translate(-0.18, 2.1, -1.05), block(0.16, 4.0, 0.16, 0.04).translate(-0.18, 2.1, 1.05), block(0.34, 0.16, 2.4, 0.05).translate(-0.1, 4.0, 0)]), oak, 0, 0, 0, stand);
  const shafts: T.BufferGeometry[] = [],
    butts: T.BufferGeometry[] = [],
    tips: T.BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) {
    const z = -0.85 + k * 0.34,
      lean = 0.07 + (k % 3) * 0.015,
      along = (g: T.BufferGeometry, y: number) => g.translate(0, y, 0).rotateZ(lean).translate(0.12, 0.3, z);
    butts.push(along(new T.CylinderGeometry(0.05, 0.065, 1.5, 10), 0.75));
    shafts.push(along(new T.CylinderGeometry(0.028, 0.05, 2.9, 8), 2.95));
    tips.push(along(new T.CylinderGeometry(0.028, 0.028, 0.05, 8), 4.42));
  }
  add(merged(butts), shiny({ color: "#3a1c14" }), 0, 0, 0, stand);
  add(merged(shafts), paint({ color: "#e2c48e", roughness: 0.4 }), 0, 0, 0, stand);
  add(merged(tips), paint({ color: "#2f6fc4" }), 0, 0, 0, stand);
  const chalk = paint({ color: "#2f7fc0", roughness: 0.9 });
  for (const z of [-0.6, 0.55]) add(block(0.14, 0.14, 0.14, 0.02), chalk, 0.22, 0.37, z, stand);

  // The chalkboard on an easel, behind the far rail.
  const easel = new T.Group();
  easel.position.set(-6.6, FLOOR, -1.15);
  easel.rotation.z = 0.12;
  scene.add(easel);
  add(merged([block(0.12, 4.4, 0.12, 0.03).translate(0, 2.2, -0.9), block(0.12, 4.4, 0.12, 0.03).translate(0, 2.2, 0.9), block(0.14, 0.12, 2.2, 0.03).translate(0.04, 1.5, 0)]), oak, 0, 0, 0, easel);
  const board = add(new T.PlaneGeometry(1.9, 2.4), paint({ map: own(chalkboard()), roughness: 0.95 }), 0.09, 2.95, 0, easel, false);
  board.rotation.y = Math.PI / 2;
  add(merged([block(0.06, 0.12, 2.1, 0.02).translate(0, 4.2, 0), block(0.06, 0.12, 2.1, 0.02).translate(0, 1.7, 0), block(0.06, 2.6, 0.12, 0.02).translate(0, 2.95, -1.0), block(0.06, 2.6, 0.12, 0.02).translate(0, 2.95, 1.0)]), oak, 0.08, 0, 0, easel);

  // A tall drinks table with two stools, two glasses and the ball rack lying on it, at the far left.
  const bar = new T.Group();
  bar.position.set(-6.7, FLOOR, 4.4);
  scene.add(bar);
  add(new T.CylinderGeometry(1.0, 1.0, 0.12, rich ? 36 : 24), oak, 0, 3.95, 0, bar);
  add(merged([new T.CylinderGeometry(0.08, 0.08, 3.9, 10).translate(0, 1.95, 0), new T.CylinderGeometry(0.6, 0.7, 0.1, 22).translate(0, 0.05, 0)]), iron, 0, 0, 0, bar);
  const glass = own(rich ? new T.MeshPhysicalMaterial({ color: "#d99a2c", roughness: 0.12, transparent: true, opacity: 0.82, clearcoat: 1 }) : new T.MeshLambertMaterial({ color: "#d99a2c", transparent: true, opacity: 0.85 })),
    froth = paint({ color: "#f6efdc", roughness: 0.9 });
  for (const [dx, dz] of [[-0.35, -0.3], [0.3, 0.35]]) {
    add(new T.CylinderGeometry(0.18, 0.15, 0.5, 16), glass, dx, 4.26, dz, bar);
    add(new T.CylinderGeometry(0.185, 0.185, 0.08, 16), froth, dx, 4.54, dz, bar);
  }
  // The triangle: three bars of dark wood round an empty middle.
  const rack = new T.Group();
  rack.position.set(0.25, 4.03, -0.35);
  rack.rotation.y = 0.5;
  bar.add(rack);
  const side = 1.1;
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3,
      piece = add(block(0.07, 0.07, side, 0.02), oak, Math.cos(a) * side * 0.29, 0.035, Math.sin(a) * side * 0.29, rack);
    piece.rotation.y = -a;
  }
  // A spare ball on the table, and the stools beside it.
  add(new T.SphereGeometry(0.19, 20, 14), shiny({ color: ballColor(1) }), -0.45, 4.2, 0.45, bar);
  const leather = paint({ color: "#6a2a22", roughness: 0.55 });
  for (const [x, z] of [
    [0.9, -1.4],
    [-0.4, 1.5],
  ]) {
    add(new T.CylinderGeometry(0.55, 0.5, 0.2, 24), leather, x, 3.0, z, bar);
    add(merged([new T.CylinderGeometry(0.06, 0.06, 2.9, 8).translate(0, 1.5, 0), new T.CylinderGeometry(0.45, 0.5, 0.08, 20).translate(0, 0.04, 0), new T.TorusGeometry(0.36, 0.03, 6, 20).rotateX(Math.PI / 2).translate(0, 1.0, 0)]), iron, x, 0, z, bar);
  }
}
