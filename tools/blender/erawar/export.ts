/**
 * Dev-only page (served by `npm run dev`): builds every 시대 전쟁 unit template with the code-made kit (no bake) and
 * hands it to Playwright as a GLB, for Blender to bake its shade (see README.md here). Its meshes are named m0, m1, …
 * in the order the game lists them (`aoMeshes`), which is how the game finds each one's baked light again.
 */
import * as T from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { Kit } from "../../../src/games/erawar/models";
import { aoMeshes } from "../../../src/games/erawar/baked";

/** A group's path of child indices from the root ("J.0.3"): a unique name, so that Blender can tell the groups apart. */
function pathName(o: T.Object3D, root: T.Object3D) {
  const parts: number[] = [];
  for (let p = o; p !== root && p.parent; p = p.parent) parts.unshift(p.parent.children.indexOf(p));
  return ["J", ...parts].join(".");
}

const kit = new Kit(((r: unknown) => r) as never, true, false);
for (const [name, m] of Object.entries(kit.m)) m.name = name;

async function exportKind(era: number, kind: 0 | 1 | 2) {
  const f = kit.figure(era, kind, 0),
    root = f.root;
  const groups: T.Object3D[] = [];
  root.traverse((o) => {
    if (o instanceof T.Group) groups.push(o);
  });
  for (const g of groups) g.name = pathName(g, root);
  // Only a figure's own parts, in the order the game lists them (`aoMeshes`): no life bar, rank star, shadow patch,
  // flash or tracks.
  const parts = aoMeshes(root);
  parts.forEach((o, i) => (o.name = `m${i}_${(o.material as T.Material).name || "x"}`));
  const drop: T.Object3D[] = [];
  root.traverse((o) => {
    if ((o instanceof T.Mesh || o instanceof T.Sprite) && !parts.includes(o as T.Mesh)) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  root.updateMatrixWorld(true);
  const glb = (await new GLTFExporter().parseAsync(root, { binary: true })) as ArrayBuffer;
  let text = "";
  const bytes = new Uint8Array(glb);
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
(window as unknown as { exportKind: typeof exportKind }).exportKind = exportKind;
document.title = "ready";
