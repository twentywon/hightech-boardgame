import * as T from "three";
import { afterGPUFrame, aim, wood } from "../../engine/scene-utils";
import { FOV, cameraDistance, type Subject } from "../../engine/camera";
import { SPACES, type State } from "./rules";
import { drawFlag } from "./flags";

export const TOUR_SUBJECT: Subject & { tilt: number } = { half: 6.6, halfZ: 6.6, height: 1.6, lookY: 0, tilt: 0.98 };
export const PLAYER_COLORS = ["#d2452f", "#2f62c0", "#3f9a5a", "#e0a020"];
const GROUPS = ["#e26a4a", "#d9a441", "#4a8fd0", "#57a56b"],
  // Ten spaces along each side, corners included.
  SIDE = 9,
  STEP = 1.3,
  REACH = (SIDE * STEP) / 2;
/** Centre of a space: 0 is the near right corner and the road runs clockwise seen from above. */
export function spaceAt(index: number) {
  const side = Math.floor(index / SIDE),
    k = index % SIDE,
    d = REACH - k * STEP;
  return [
    { x: d, z: REACH },
    { x: -REACH, z: d },
    { x: -d, z: -REACH },
    { x: REACH, z: -d },
  ][side];
}
function texture(c: HTMLCanvasElement) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif';
function tileTexture(index: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!,
    space = SPACES[index];
  ctx.fillStyle = "#f6f0e0";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = space.kind === "city" ? GROUPS[space.group] : "#2c3a44";
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = "#2c2118";
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 248, 248);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1c1f22";
  const city = space.kind === "city",
    size = space.name.length > 5 ? 30 : space.name.length > 3 ? 38 : city ? 46 : 54;
  // A city shows its country's flag under the colour band, then its name and price.
  if (city) drawFlag(ctx, space.country, 73, 76, 110, 72);
  if (space.kind === "ship") {
    // The spacecraft: a white body with a dark nose, wings and a flame.
    ctx.fillStyle = "#e9eef2";
    ctx.beginPath();
    ctx.moveTo(128, 70);
    ctx.quadraticCurveTo(152, 96, 150, 136);
    ctx.lineTo(106, 136);
    ctx.quadraticCurveTo(104, 96, 128, 70);
    ctx.fill();
    ctx.fillStyle = "#2c3a44";
    ctx.beginPath();
    ctx.moveTo(128, 70);
    ctx.quadraticCurveTo(140, 82, 143, 96);
    ctx.lineTo(113, 96);
    ctx.quadraticCurveTo(116, 82, 128, 70);
    ctx.moveTo(106, 118);
    ctx.lineTo(84, 142);
    ctx.lineTo(106, 136);
    ctx.moveTo(150, 118);
    ctx.lineTo(172, 142);
    ctx.lineTo(150, 136);
    ctx.fill();
    ctx.fillStyle = "#f08a24";
    ctx.beginPath();
    ctx.moveTo(114, 138);
    ctx.lineTo(128, 162);
    ctx.lineTo(142, 138);
    ctx.fill();
  }
  ctx.font = `800 ${size}px ${FONT}`;
  const tall = city || space.kind === "ship";
  ctx.fillText(space.name, 128, tall ? 182 : 128);
  ctx.font = `600 ${city ? 28 : 34}px ${FONT}`;
  ctx.fillStyle = "#5a5148";
  ctx.fillText(
    city
      ? String(space.price)
      : { start: "월급 +200", luck: "카드 뽑기", collect: "기금 받기", storm: "더블이면 탈출", fund: "-150", space: "어디든 이동", ship: String(space.price), city: "" }[space.kind],
    128,
    tall ? 224 : 198,
  );
  return texture(c);
}
function dieFace(value: number) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const ctx = c.getContext("2d")!,
    at = [32, 64, 96],
    spots: [number, number][][] = [[], [[1, 1]], [[0, 0], [2, 2]], [[0, 0], [1, 1], [2, 2]], [[0, 0], [2, 0], [0, 2], [2, 2]], [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]]];
  ctx.fillStyle = "#f6f0e2";
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = value === 1 ? "#c8321f" : "#16181a";
  for (const [x, y] of spots[value]) {
    ctx.beginPath();
    ctx.arc(at[x], at[y], value === 1 ? 20 : 11, 0, Math.PI * 2);
    ctx.fill();
  }
  return texture(c);
}
const FACES = [3, 4, 1, 6, 2, 5];
function upright(face: number) {
  const q = new T.Quaternion(),
    x = new T.Vector3(1, 0, 0),
    z = new T.Vector3(0, 0, 1);
  if (face === 6) q.setFromAxisAngle(x, Math.PI);
  else if (face === 2) q.setFromAxisAngle(x, -Math.PI / 2);
  else if (face === 5) q.setFromAxisAngle(x, Math.PI / 2);
  else if (face === 3) q.setFromAxisAngle(z, Math.PI / 2);
  else if (face === 4) q.setFromAxisAngle(z, -Math.PI / 2);
  return q;
}
interface Tween {
  start: number;
  duration: number;
  update: (p: number) => void;
}
/** The board of the world tour: a road of spaces round a map, with buildings that rise on the cities. */
export class TourView {
  readonly renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(FOV, 1, 0.1, 120);
  private observer: ResizeObserver;
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private readyFlag = false;
  private cancelReady: (() => void) | null = null;
  private owned: { dispose(): void }[] = [];
  private tokens: T.Mesh[] = [];
  private dice: T.Mesh[] = [];
  private buildings = new T.Group();
  private built: string[] = SPACES.map(() => "");
  private parts: Record<string, T.BufferGeometry> = {};
  private paints: T.MeshStandardMaterial[];
  private trims: Record<string, T.MeshStandardMaterial> = {};
  private tweens: Tween[] = [];
  private state: State | null = null;
  private reducedMotion =
    typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  onContact: () => void = () => {};
  onSettled: () => void = () => {};
  /** The board was tapped. */
  onTap: () => void = () => {};
  /**
   * Turns the top golden key card over: it lifts off the pile, flips and
   * comes forward. `done` is called when it has opened.
   */
  revealCard(done: () => void) {
    if (this.disposed) return;
    this.card.visible = true;
    this.halo.visible = false;
    const from = this.deck.position.clone().setY(0.4),
      to = new T.Vector3(0, 2.6, 3.4),
      now = performance.now();
    if (this.reducedMotion) {
      this.card.position.copy(to);
      this.card.rotation.set(-0.6, 0, 0);
      this.card.scale.setScalar(1.7);
      this.dirty = true;
      done();
      return;
    }
    this.tweens.push({
      start: now,
      duration: 700,
      update: (p) => {
        const e = p * p * (3 - 2 * p);
        this.card.position.lerpVectors(from, to, e);
        this.card.position.y += Math.sin(Math.PI * p) * 1.2;
        // Face down on the pile, it turns over as it rises and tilts toward the player.
        this.card.rotation.set(-0.6 * e, 0.25 * (1 - e), Math.PI * (1 - e));
        this.card.scale.setScalar(1 + 0.7 * e);
        if (p === 1) done();
      },
    });
  }
  /** Puts the opened card away. */
  hideCard() {
    this.card.visible = false;
    this.dirty = true;
  }
  private card!: T.Mesh;
  /** The pile of golden key cards was tapped. */
  onDeck: () => void = () => {};
  private deck!: T.Mesh;
  private halo!: T.Mesh;
  private ray = new T.Raycaster();
  get animating() {
    return this.tweens.length > 0;
  }
  private own<R extends { dispose(): void }>(resource: R) {
    this.owned.push(resource);
    return resource;
  }
  constructor(
    readonly host: HTMLElement,
    quality: "high" | "low",
    players: number,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFShadowMap;
    this.renderer.setClearColor("#543a28");
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    this.scene.add(new T.HemisphereLight("#fff4dc", "#4a3a2c", 2.2));
    const light = new T.DirectionalLight("#fff3dc", 2.5);
    light.position.set(-6, 12, 5);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    light.shadow.camera.left = -11;
    light.shadow.camera.right = 11;
    light.shadow.camera.top = 11;
    light.shadow.camera.bottom = -11;
    light.shadow.normalBias = 0.02;
    this.own(light.shadow);
    this.scene.add(light);
    const standard = (options: T.MeshStandardMaterialParameters) =>
      this.own(new T.MeshStandardMaterial({ roughness: 0.75, ...options }));
    const table = new T.Mesh(this.own(new T.PlaneGeometry(120, 120)), standard({ map: this.own(wood(true)) }));
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.16;
    table.receiveShadow = true;
    this.scene.add(table);
    // The board: a sea-blue square with the road of spaces along its rim.
    const width = REACH * 2 + STEP,
      board = new T.Mesh(this.own(new T.BoxGeometry(width + 0.3, 0.14, width + 0.3)), standard({ color: "#2f6f8e", roughness: 0.6 }));
    board.position.y = -0.08;
    board.receiveShadow = true;
    this.scene.add(board);
    const tile = this.own(new T.BoxGeometry(STEP - 0.06, 0.06, STEP - 0.06)),
      rim = standard({ color: "#e9dfc8" });
    SPACES.forEach((_, i) => {
      const p = spaceAt(i),
        mesh = new T.Mesh(tile, [rim, rim, standard({ map: this.own(tileTexture(i)), roughness: 0.85 }), rim, rim, rim]);
      mesh.position.set(p.x, 0.02, p.z);
      // Names read from the middle of the board outward on every side.
      mesh.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][Math.floor(i / SIDE)];
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
    // In the middle: a globe on a stand.
    const globeCanvas = document.createElement("canvas");
    globeCanvas.width = 512;
    globeCanvas.height = 256;
    const g = globeCanvas.getContext("2d")!;
    g.fillStyle = "#2f7fb8";
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = "#5fae62";
    for (const [x, y, rx, ry] of [[110, 90, 60, 44], [140, 170, 34, 50], [270, 80, 50, 36], [290, 150, 38, 48], [380, 90, 70, 44], [430, 180, 34, 22], [60, 40, 40, 16]]) {
      g.beginPath();
      g.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2);
      g.fill();
    }
    const globe = new T.Mesh(this.own(new T.SphereGeometry(1.5, 40, 24)), standard({ map: this.own(texture(globeCanvas)), roughness: 0.5 }));
    globe.position.set(0, 1.9, -0.6);
    globe.rotation.z = 0.35;
    globe.castShadow = true;
    const stand = new T.Mesh(this.own(new T.CylinderGeometry(0.5, 0.9, 0.4, 24)), standard({ color: "#c9a85c", roughness: 0.35, metalness: 0.6 }));
    stand.position.set(0, 0.2, -0.6);
    stand.castShadow = true;
    this.scene.add(globe, stand, this.buildings);
    // Building parts, shared by every city, and one paint per traveller.
    this.parts = {
      box: this.own(new T.BoxGeometry(1, 1, 1)),
      roof: this.own(new T.ConeGeometry(0.74, 0.5, 4)),
      drum: this.own(new T.CylinderGeometry(0.5, 0.5, 1, 20)),
      dome: this.own(new T.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2)),
      spire: this.own(new T.ConeGeometry(0.12, 0.7, 10)),
      flag: this.own(new T.BoxGeometry(0.34, 0.2, 0.03)),
      pole: this.own(new T.CylinderGeometry(0.025, 0.025, 0.6, 6)),
    };
    this.paints = PLAYER_COLORS.map((color) => standard({ color, roughness: 0.5 }));
    this.trims = {
      wall: standard({ color: "#f3ead6" }),
      glass: standard({ color: "#9fc6e6", roughness: 0.2, metalness: 0.3 }),
      gold: standard({ color: "#d9b24a", roughness: 0.3, metalness: 0.7 }),
      dark: standard({ color: "#3a3f45" }),
    };
    // The pile of golden key cards, and the ring that lights up when one is to be drawn.
    const keyCanvas = document.createElement("canvas");
    keyCanvas.width = 256;
    keyCanvas.height = 360;
    const k = keyCanvas.getContext("2d")!;
    k.fillStyle = "#d9a520";
    k.fillRect(0, 0, 256, 360);
    k.strokeStyle = "#7a5a10";
    k.lineWidth = 14;
    k.strokeRect(14, 14, 228, 332);
    k.lineWidth = 16;
    k.lineCap = "round";
    k.beginPath();
    k.arc(128, 116, 42, 0, Math.PI * 2);
    k.moveTo(128, 158);
    k.lineTo(128, 286);
    k.moveTo(128, 250);
    k.lineTo(168, 250);
    k.moveTo(128, 286);
    k.lineTo(160, 286);
    k.stroke();
    const gold = standard({ color: "#b8891a", roughness: 0.5 });
    this.deck = new T.Mesh(this.own(new T.BoxGeometry(1.15, 0.3, 1.6)), [gold, gold, standard({ map: this.own(texture(keyCanvas)), roughness: 0.45 }), gold, gold, gold]);
    this.deck.position.set(-2.6, 0.16, 2.2);
    this.deck.rotation.y = 0.25;
    this.deck.castShadow = true;
    this.halo = new T.Mesh(
      this.own(new T.RingGeometry(1.15, 1.32, 48)),
      this.own(new T.MeshBasicMaterial({ color: "#ffe27a", transparent: true, opacity: 0.95, depthWrite: false })),
    );
    this.halo.rotation.x = -Math.PI / 2;
    this.halo.position.set(-2.6, 0.02, 2.2);
    this.halo.visible = false;
    // The card that is turned over: gold back, pale face with the key.
    const faceCanvas = document.createElement("canvas");
    faceCanvas.width = 256;
    faceCanvas.height = 360;
    const f = faceCanvas.getContext("2d")!;
    f.fillStyle = "#fff7d6";
    f.fillRect(0, 0, 256, 360);
    f.strokeStyle = "#c9a227";
    f.lineWidth = 14;
    f.strokeRect(14, 14, 228, 332);
    f.fillStyle = "#7a5a10";
    f.textAlign = "center";
    f.font = `800 44px ${FONT}`;
    f.fillText("황금열쇠", 128, 110);
    f.strokeStyle = "#b8891a";
    f.lineWidth = 14;
    f.lineCap = "round";
    f.beginPath();
    f.arc(128, 178, 30, 0, Math.PI * 2);
    f.moveTo(128, 208);
    f.lineTo(128, 300);
    f.moveTo(128, 272);
    f.lineTo(156, 272);
    f.moveTo(128, 300);
    f.lineTo(150, 300);
    f.stroke();
    this.card = new T.Mesh(this.own(new T.BoxGeometry(1.15, 0.02, 1.6)), [gold, gold, standard({ map: this.own(texture(faceCanvas)), roughness: 0.5 }), standard({ map: this.own(texture(keyCanvas)), roughness: 0.45 }), gold, gold]);
    this.card.visible = false;
    this.card.castShadow = true;
    this.scene.add(this.deck, this.halo, this.card);
    const pawn = this.own(new T.CylinderGeometry(0.09, 0.22, 0.5, 18)),
      head = this.own(new T.SphereGeometry(0.15, 16, 12));
    for (let i = 0; i < players; i++) {
      const token = new T.Mesh(pawn, this.paints[i]),
        top = new T.Mesh(head, this.paints[i]);
      top.position.y = 0.32;
      token.castShadow = top.castShadow = true;
      token.add(top);
      this.tokens.push(token);
      this.scene.add(token);
    }
    const cube = this.own(new T.BoxGeometry(0.6, 0.6, 0.6)),
      faces = FACES.map((value) => standard({ map: this.own(dieFace(value)), roughness: 0.4 }));
    for (const x of [-0.5, 0.5]) {
      const die = new T.Mesh(cube, faces);
      die.position.set(x, 0.3, 2.4);
      die.castShadow = true;
      this.dice.push(die);
      this.scene.add(die);
    }
    const el = this.renderer.domElement;
    let down: number | null = null;
    el.addEventListener("pointerdown", (e) => (down = e.pointerType === "mouse" && e.button !== 0 ? null : e.pointerId));
    el.addEventListener("pointerup", (e) => {
      if (down === e.pointerId && !this.disposed && !this.animating) {
        aim(this.ray, e, el, this.camera);
        if (this.ray.intersectObject(this.deck, false).length) this.onDeck();
        else this.onTap();
      }
      down = null;
    });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const moved = this.step(performance.now());
      if (!this.dirty && !moved) return;
      this.dirty = false;
      this.renderer.render(this.scene, this.camera);
      if (!this.readyFlag && !this.cancelReady)
        this.cancelReady = afterGPUFrame(this.renderer, () => {
          this.readyFlag = true;
          this.renderer.domElement.dataset.ready = "true";
        });
    };
    this.raf = requestAnimationFrame(loop);
  }
  /**
   * The building pieces on a city, set down one beside the other as they are
   * bought: a house with a pitched roof, a glass tower, a domed landmark
   * with a spire. Bare land carries the owner's flag. Returns the group and
   * the newest piece.
   */
  private raise(index: number, owner: number, level: number) {
    const group = new T.Group(),
      paint = this.paints[owner];
    const piece = (slot: number, build: (add: (part: string, material: T.Material, x: number, y: number, z: number, sx?: number, sy?: number, sz?: number) => T.Mesh) => void) => {
      const model = new T.Group();
      build((part, material, x, y, z, sx = 1, sy = 1, sz = 1) => {
        const mesh = new T.Mesh(this.parts[part], material);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        mesh.castShadow = true;
        model.add(mesh);
        return mesh;
      });
      // Every piece stands on a base in its owner's colour, like a playing piece.
      const base = new T.Mesh(this.parts.drum, paint);
      base.scale.set(0.42, 0.05, 0.42);
      base.position.y = 0.025;
      model.add(base);
      model.position.x = slot * 0.4;
      group.add(model);
      return model;
    };
    let newest: T.Object3D = group;
    if (level === 0)
      newest = piece(0, (add) => {
        add("pole", this.trims.dark, 0, 0.35, 0);
        add("flag", paint, 0.18, 0.55, 0);
      });
    if (level >= 1)
      newest = piece(-1, (add) => {
        add("box", this.trims.wall, 0, 0.21, 0, 0.34, 0.32, 0.3);
        add("roof", paint, 0, 0.5, 0, 0.36, 0.56, 0.32).rotation.y = Math.PI / 4;
        add("box", this.trims.dark, 0, 0.13, 0.155, 0.09, 0.16, 0.02);
      });
    if (level >= 2)
      newest = piece(0, (add) => {
        add("box", this.trims.glass, 0, 0.5, 0, 0.3, 0.9, 0.3);
        for (const y of [0.28, 0.5, 0.72]) add("box", paint, 0, y, 0, 0.33, 0.04, 0.33);
        add("box", paint, 0, 0.97, 0, 0.34, 0.06, 0.34);
        add("pole", this.trims.dark, 0.07, 1.25, 0.07, 1, 0.8, 1);
      });
    if (level >= 3)
      newest = piece(1, (add) => {
        add("box", this.trims.wall, 0, 0.13, 0, 0.4, 0.16, 0.4);
        add("drum", paint, 0, 0.42, 0, 0.34, 0.42, 0.34);
        add("dome", this.trims.gold, 0, 0.63, 0, 0.38, 0.38, 0.38);
        add("spire", this.trims.gold, 0, 1.0, 0, 0.7, 0.7, 0.7);
      });
    const p = spaceAt(index),
      // The pieces stand in a row along the inner edge of the space, clear of its flag and name.
      inward = 0.86,
      side = Math.floor(index / SIDE);
    group.position.set(p.x + [0, inward, 0, -inward][side], 0.05, p.z + [-inward, 0, inward, 0][side]);
    group.rotation.y = [0, -Math.PI / 2, Math.PI, Math.PI / 2][side];
    group.scale.setScalar(1.25);
    group.userData.index = index;
    return { group, newest };
  }
  private stand(player: number, index: number) {
    const p = spaceAt(index),
      side = Math.floor(index / SIDE),
      // Tokens share the outer half of a space, two by two.
      out = 0.36,
      along = (player % 2 ? 0.2 : -0.2) + (player > 1 ? 0.0 : 0),
      back = player > 1 ? 0.18 : 0;
    const ox = [along, -(out + back), along, out + back][side],
      oz = [out + back, along, -(out + back), along][side];
    return new T.Vector3(p.x + ox, 0.3, p.z + oz);
  }
  private resize() {
    if (this.disposed) return;
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const distance = cameraDistance(this.camera.aspect, false, TOUR_SUBJECT);
    this.camera.position.set(0, Math.sin(TOUR_SUBJECT.tilt) * distance, Math.cos(TOUR_SUBJECT.tilt) * distance);
    this.camera.lookAt(0, 0, 0);
    this.dirty = true;
  }
  setQuality(quality: "high" | "low") {
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === "high" ? 2 : 1));
    this.resize();
  }
  /** Rebuilds what changed on the cities; a new building grows out of the ground. */
  private dress(state: State, grow: boolean, now: number) {
    state.owners.forEach((owner, index) => {
      const key = owner === -1 ? "" : `${owner}:${state.levels[index]}`;
      if (key === this.built[index]) return;
      this.built[index] = key;
      for (const old of this.buildings.children.filter((c) => c.userData.index === index)) this.buildings.remove(old);
      if (owner === -1) return;
      const { group, newest: building } = this.raise(index, owner, state.levels[index]);
      this.buildings.add(group);
      if (grow) {
        // Only the piece just bought is set down; the others already stand.
        building.scale.setScalar(0.01);
        this.tweens.push({
          start: now,
          duration: 420,
          // It overshoots a little, like something springing up.
          update: (p) => building.scale.setScalar(p < 0.7 ? (p / 0.7) * 1.15 : 1.15 - ((p - 0.7) / 0.3) * 0.15),
        });
      }
    });
  }
  private place(state: State) {
    this.halo.visible = state.phase === "key";
    state.players.forEach((player, i) => {
      this.tokens[i].position.copy(this.stand(i, player.at));
      this.tokens[i].visible = !player.out;
    });
    this.dice.forEach((die, i) => die.quaternion.copy(upright(state.dice[i])));
  }
  /** Shows `state`; a roll tumbles the dice and walks the token along the road. */
  sync(state: State, animate = true) {
    if (this.disposed) return;
    const before = this.state;
    this.state = state;
    this.dirty = true;
    this.tweens = [];
    const now = performance.now(),
      quick = !animate || this.reducedMotion || !before;
    if (quick || state.rollId === before.rollId || !state.path.length) {
      this.place(state);
      this.dress(state, !quick, now);
      if (!this.tweens.length) this.onSettled();
      return;
    }
    this.place(before);
    const mover = before.turn,
      token = this.tokens[mover],
      axis = new T.Vector3(1, 0.5, 0.3).normalize(),
      spin = new T.Quaternion();
    this.dice.forEach((die, i) => {
      const to = upright(state.dice[i]);
      this.tweens.push({
        start: now + i * 60,
        duration: 500,
        update: (p) => {
          spin.setFromAxisAngle(axis, (1 - p) * Math.PI * (4 + i));
          die.quaternion.copy(to).multiply(spin);
          die.position.y = 0.3 + Math.sin(Math.PI * p) * 0.9;
        },
      });
    });
    let at = now + 600,
      from = token.position.clone();
    state.path.forEach((index, k) => {
      const start = from.clone(),
        end = this.stand(mover, index),
        // A flight or a card's order is one long hop, not a walk.
        far = k > 0 && Math.abs(index - state.path[k - 1]) > 1 && !(index === 0 && state.path[k - 1] === SPACES.length - 1);
      this.tweens.push({
        start: at,
        duration: far ? 600 : 150,
        update: (p) => {
          token.position.lerpVectors(start, end, p);
          token.position.y += Math.sin(Math.PI * p) * (far ? 2.2 : 0.3);
          if (p === 1) this.onContact();
        },
      });
      at += far ? 600 : 150;
      from = end;
    });
    this.dress(state, true, at);
  }
  private step(now: number) {
    if (!this.tweens.length) return false;
    this.tweens = this.tweens.filter((t) => {
      const p = Math.min(1, (now - t.start) / t.duration);
      if (p < 0) return true;
      t.update(p);
      return p < 1;
    });
    if (!this.tweens.length && this.state) {
      this.place(this.state);
      this.onSettled();
    }
    return true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelReady?.();
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.tweens = [];
    for (const resource of this.owned) resource.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
