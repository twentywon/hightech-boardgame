/**
 * Dev-only page: every unit of an era (or all eras) in a row, lit as in the game, walking in place, to compare the
 * code-made look (`?blender=0`) with the Blender-baked one (`?blender=1`, the default) and to count frames.
 * `?era=0..3` (all when absent), `?close=1` for a close look at the fighter, `?walk=0` to stand still.
 */
import * as T from "three";
import { Kit, poseFigure } from "../../../src/games/erawar/models";
import { lifelike, place } from "../../../src/engine/lifelike";

const q = new URLSearchParams(location.search),
  blender = q.get("blender") !== "0",
  eraQ = q.get("era"),
  close = q.get("close") === "1",
  walk = q.get("walk") !== "0";
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.body.append(renderer.domElement);
const scene = new T.Scene();
scene.background = new T.Color("#a9cdea");
const camera = new T.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
const rich = lifelike();
const kit = new Kit(((r: unknown) => r) as never, rich, blender);
scene.add(new T.HemisphereLight("#dcecff", "#5a6a3a", 1.7));
const sun = new T.DirectionalLight("#fff1d6", 2.6);
sun.position.set(6, 14, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -4, near: 1, far: 50 });
scene.add(sun);
const ground = new T.Mesh(new T.PlaneGeometry(80, 40), new T.MeshLambertMaterial({ color: "#6d8f45" }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const eras = eraQ === null ? [0, 1, 2, 3] : [Number(eraQ)];
const figures: { f: ReturnType<Kit["figure"]>; phase: number }[] = [];
eras.forEach((era, row) => {
  for (let kind = 0 as 0 | 1 | 2; kind < 3; kind = (kind + 1) as 0 | 1 | 2)
    for (const side of [0, 1]) {
      const f = kit.figure(era, kind, side);
      f.root.position.set((kind - 1) * 3.0 + (side ? 0.7 : -0.7) - 0.4 + (kind === 2 ? 0.5 : 0), 0, -row * 3.2 - (kind === 2 ? (side ? 1.6 : 0) : 0));
      f.root.rotation.y = side ? 0.5 : -0.5;
      scene.add(f.root);
      figures.push({ f, phase: Math.random() * 3 });
    }
});
if (close) {
  // The fighters of the first row, close.
  camera.position.set(-2.2, 1.1, 2.4);
  camera.lookAt(-3.4, 0.62, 0);
} else {
  const rows = eras.length;
  camera.position.set(0, 2.2 + rows * 1.6, 8.5 + rows * 3.4);
  camera.lookAt(0, 0.6, -(rows - 1) * 1.6);
}
if (rich) place(renderer, scene, "sky", 0.55, { exposure: 0.95 });
let frames = 0;
const start = performance.now();
(window as unknown as { fps: () => number }).fps = () => (frames * 1000) / (performance.now() - start);
const loop = (t: number) => {
  requestAnimationFrame(loop);
  for (const { f, phase } of figures) poseFigure(f, walk ? t / 1000 + phase : phase, walk, 9, 1, t / 1000 + phase);
  renderer.render(scene, camera);
  frames++;
  if (frames === 3) document.title = "ready";
};
requestAnimationFrame(loop);
