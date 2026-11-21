import * as T from "three";
import { block, capable, glossy, hop, planks, stuff, wood } from "../../engine/scene-utils";
import type { Marks } from "../points/view";
import { TableView, type Spot, type TableSubject } from "../table/view";
import { HEXES, NEIGHBOURS } from "./board";
import { ARMY_FORWARD, LAND_TOP, MAP_HALF, MAP_HALF_Z, SEA_TOP, SIZE, hexAt, hexSubject, viewShift } from "./layout";
import { CAPITAL, COLORS, NONE, PORT, TOWN, destinations, type Army, type HexMap, type State } from "./rules";

/** The colour of land nobody holds, and how far a nation's colour tints the grass of its land. */
const WILD = "#9fb96c",
  TINT = 0.62;
/** Where an army's men stand on its stand: one, two or three of them by its size. */
const RANKS: [number, number][][] = [
  [[0, 0]],
  [
    [-0.075, 0],
    [0.075, 0],
  ],
  [
    [-0.09, 0.03],
    [0.09, 0.03],
    [0, -0.06],
  ],
];
/** Estates and armies are drawn larger than life, so that they read on a phone. */
const ESTATE_SCALE = 1.45,
  ARMY_SCALE = 1.9;
const menFor = (count: number) => (count >= 40 ? 3 : count >= 15 ? 2 : 1);
type Kind = "move" | "join" | "attack";
interface Figure {
  group: T.Group;
  men: T.Group[];
  stand: T.Mesh;
  ship: T.Group;
  plate: T.Sprite;
  canvas: HTMLCanvasElement;
  texture: T.CanvasTexture;
  label: string;
  nation: number;
}
/**
 * 헥스 정복전's war room: a map of hexes laid on a big wooden table, land as raised tiles of grass tinted with the
 * colour of the nation that holds them, the sea glossy between them (with slow waves where a graphics card draws),
 * capitals as small castles flying their holder's banner, towns as clusters of houses, ports as a pier with a boat.
 * An army is a stand of tin soldiers in its nation's colour (one, two or three by its size), or a small ship at sea,
 * with a plate over it showing count/morale. A move is walked or sailed hex by hex; a battle meets halfway in a puff of
 * smoke and the loser falls; land changing hands changes colour as the army arrives. Everything is modelled in code.
 */
export class HexConquestView extends TableView<State> {
  private map: HexMap | null = null;
  private tops: T.InstancedMesh | null = null;
  private bodies: T.InstancedMesh | null = null;
  private landIndex = new Map<number, number>();
  private estates = new T.Group();
  private banners = new Map<number, T.Mesh[]>();
  private figures = new Map<number, Figure>();
  private rings: T.Mesh[] = [];
  private ringPaint: Record<Kind | "movable" | "selected" | "cursor" | "hover", T.MeshBasicMaterial>;
  private ringShape: T.BufferGeometry;
  private thinRing: T.BufferGeometry;
  private discShape: T.BufferGeometry;
  private puffs: T.Sprite[] = [];
  private paints: { coat: T.Material; trim: T.Material; sail: T.Material; banner: T.Material; roof: T.Material }[];
  private shapes: Record<string, T.BufferGeometry>;
  private stuffs: Record<string, T.Material>;
  private seaMaterial: T.MeshStandardMaterial;
  private seaCanvas = document.createElement("canvas");
  private seaTexture: T.CanvasTexture;
  private waves: T.Texture | null = null;
  private hovered = -1;
  private dragging: { from: number; at: { x: number; z: number } | null; over: number } | null = null;
  private lifted = -1;
  private idle = 0;
  constructor(host: HTMLElement, quality: "high" | "low") {
    super(host, quality, "#2a2019");
    const keep = <R extends { dispose(): void }>(r: R) => this.own(r);
    this.floor = new T.Plane(new T.Vector3(0, 1, 0), -LAND_TOP);
    // A lamp over the war table, warm, and the dim room.
    this.daylight("#f6ecda", "#3b2c1e", "#fff1da", 11, 2.25).position.set(-5, 13, 7);
    // The table: dark planks reaching past the view on every side, on a frame of pale wood round the map.
    const table = this.add(block(34, 0.6, 24, 0.1), this.standard({ ...planks(3.2, keep, 2.3), color: "#b9a690" }), 0, -0.32, 0);
    table.castShadow = false;
    const rim = this.standard({ map: keep(wood(false)), color: "#c79a68", roughness: 0.5 }),
      fw = MAP_HALF + 0.42,
      fd = MAP_HALF_Z + 0.42;
    for (const s of [-1, 1]) {
      this.add(block(fw * 2 + 0.36, 0.2, 0.36, 0.06), rim, 0, 0.08, s * (fd + 0.0));
      this.add(block(0.36, 0.2, fd * 2 - 0.36, 0.06), rim, s * fw, 0.08, 0);
    }
    // The sea: the map's ground, painted for each map (deep water, shallows by the coasts, the grid of the sea), glossy.
    this.seaCanvas.width = 1024;
    this.seaCanvas.height = 680;
    this.seaTexture = keep(new T.CanvasTexture(this.seaCanvas));
    this.seaTexture.colorSpace = T.SRGBColorSpace;
    this.seaTexture.anisotropy = 4;
    this.seaMaterial = this.standard({ map: this.seaTexture, roughness: 0.22, metalness: 0.05 });
    if (capable()) {
      this.waves = keep(waveMap());
      this.waves.repeat.set(3, 2);
      this.seaMaterial.normalMap = this.waves;
      this.seaMaterial.normalScale = new T.Vector2(0.16, 0.16);
    }
    const sea = this.add(new T.PlaneGeometry(fw * 2 - 0.36, fd * 2 - 0.36), this.seaMaterial, 0, SEA_TOP, 0);
    sea.rotation.x = -Math.PI / 2;
    sea.castShadow = false;
    // Shared shapes and paints.
    this.shapes = {
      body: keep(new T.CylinderGeometry(SIZE * 0.975, SIZE * 0.99, LAND_TOP - SEA_TOP + 0.04, 6).rotateY(Math.PI / 6).translate(0, (LAND_TOP + SEA_TOP - 0.04) / 2 - 0.002, 0)),
      top: keep(new T.CircleGeometry(SIZE * 0.95, 6).rotateX(-Math.PI / 2)),
      stand: keep(new T.CylinderGeometry(0.135, 0.145, 0.025, 24).translate(0, 0.0125, 0)),
      legs: keep(block(0.05, 0.075, 0.03, 0.008).translate(0, 0.0675, 0)),
      coat: keep(new T.CylinderGeometry(0.03, 0.037, 0.085, 12).translate(0, 0.145, 0)),
      belt: keep(new T.CylinderGeometry(0.038, 0.038, 0.012, 12).translate(0, 0.118, 0)),
      arm: keep(new T.CapsuleGeometry(0.011, 0.06, 3, 8)),
      head: keep(new T.SphereGeometry(0.024, 14, 10).translate(0, 0.21, 0)),
      hat: keep(new T.CylinderGeometry(0.022, 0.025, 0.045, 12).translate(0, 0.248, 0)),
      plume: keep(new T.SphereGeometry(0.011, 8, 6).translate(0, 0.277, 0)),
      rifle: keep(block(0.009, 0.16, 0.009, 0.002).translate(0.05, 0.16, 0.012)),
      hull: keep(hullShape()),
      deck: keep(block(0.24, 0.012, 0.1, 0.004).translate(0, 0.07, 0)),
      mast: keep(new T.CylinderGeometry(0.008, 0.01, 0.26, 8).translate(0, 0.19, 0)),
      sail: keep(sailShape()),
      wall: keep(block(0.11, 0.08, 0.09, 0.01).translate(0, 0.04, 0)),
      roof: keep(new T.ConeGeometry(0.085, 0.07, 4).rotateY(Math.PI / 4).scale(1, 1, 0.78).translate(0, 0.115, 0)),
      keep: keep(block(0.2, 0.22, 0.2, 0.012).translate(0, 0.11, 0)),
      tower: keep(new T.CylinderGeometry(0.048, 0.054, 0.28, 12).translate(0, 0.14, 0)),
      spire: keep(new T.ConeGeometry(0.062, 0.09, 12).translate(0, 0.325, 0)),
      wallRing: keep(block(0.34, 0.1, 0.34, 0.015).translate(0, 0.05, 0)),
      pole: keep(new T.CylinderGeometry(0.006, 0.006, 0.26, 6).translate(0, 0.35, 0)),
      flag: keep(new T.PlaneGeometry(0.13, 0.08, 6, 1).translate(0.065, 0.44, 0)),
      plank: keep(block(0.11, 0.025, 0.46, 0.006)),
      post: keep(new T.CylinderGeometry(0.014, 0.014, 0.16, 6)),
      boat: keep(hullShape(0.55)),
    };
    this.stuffs = {
      grass: this.standard({ ...stuff("grass", "#e4e4de", 0.6, keep), roughness: 0.95 }),
      earth: this.standard({ ...stuff("earth", "#7a5c3e", 0.8, keep), roughness: 0.95 }),
      stone: this.standard({ ...stuff("stone", "#d8d2c4", 0.5, keep), roughness: 0.8 }),
      plaster: this.standard({ color: "#efe4cc", roughness: 0.85 }),
      pine: this.standard({ map: keep(wood(false)), color: "#d0a774", roughness: 0.6 }),
      dark: this.standard({ map: keep(wood(true)), color: "#a07050", roughness: 0.6 }),
      tin: keep(glossy({ color: "#cfd3d6", roughness: 0.3, metalness: 0.75 }, 0.6)),
      black: keep(glossy({ color: "#1b1c1f", roughness: 0.35, metalness: 0.3 }, 0.6)),
      skin: this.standard({ color: "#f0c8a4", roughness: 0.55 }),
      gold: keep(glossy({ color: "#e2b54a", roughness: 0.28, metalness: 0.85 }, 0.6)),
      canvas: this.standard({ color: "#f3ead6", roughness: 0.8, side: T.DoubleSide }),
    };
    this.paints = COLORS.map((color) => ({
      coat: keep(glossy({ color, roughness: 0.32, metalness: 0.35 }, 0.8)),
      trim: keep(glossy({ color: new T.Color(color).lerp(new T.Color("#ffffff"), 0.45), roughness: 0.35, metalness: 0.3 }, 0.6)),
      sail: this.standard({ color: new T.Color(color).lerp(new T.Color("#ffffff"), 0.15), roughness: 0.75, side: T.DoubleSide }),
      banner: this.standard({ color, roughness: 0.7, side: T.DoubleSide }),
      roof: this.standard({ color: new T.Color(color).lerp(new T.Color("#4a3a30"), 0.25), roughness: 0.6 }),
    }));
    // The marks: rings round a hex, a small one at an army's foot, the keyboard's and the mouse's.
    this.ringShape = keep(new T.RingGeometry(SIZE * 0.72, SIZE * 0.9, 6).rotateX(-Math.PI / 2));
    this.thinRing = keep(new T.RingGeometry(SIZE * 0.82, SIZE * 0.9, 6).rotateX(-Math.PI / 2));
    this.discShape = keep(new T.CircleGeometry(SIZE * 0.72, 6).rotateX(-Math.PI / 2));
    const basic = (color: string, opacity = 0.95) => keep(new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: T.DoubleSide }));
    this.ringPaint = { move: basic("#ffffff"), join: basic("#5fd9ff"), attack: basic("#ff3b2e"), movable: basic("#ffd864", 0.8), selected: basic("#ffc93a"), cursor: basic("#ffffff", 0.7), hover: basic("#fff6d8", 0.45) };
    this.scene.add(this.estates);
    const puffPaint = keep(new T.SpriteMaterial({ map: keep(puffTexture()), transparent: true, depthWrite: false, opacity: 0 }));
    for (let i = 0; i < 9; i++) {
      const puff = new T.Sprite(puffPaint.clone());
      this.own(puff.material);
      puff.visible = false;
      puff.renderOrder = 8;
      this.scene.add(puff);
      this.puffs.push(puff);
    }
    this.begin();
    // The sea's slow waves, only where a graphics card draws and motion is welcome.
    if (this.waves && !this.reducedMotion) {
      let then = 0;
      const tick = (now: number) => {
        if (this.disposed) return;
        this.idle = requestAnimationFrame(tick);
        if (now - then < 50) return;
        then = now;
        this.waves!.offset.set(now * 0.000012, now * 0.000007);
        this.redraw();
      };
      this.idle = requestAnimationFrame(tick);
    }
  }
  protected subject(aspect: number): TableSubject {
    return hexSubject(aspect);
  }
  /** The map stands right of the middle on middling screens, the lettering at its left (`viewShift`). */
  protected resize() {
    super.resize();
    if (this.disposed || !this.host.clientWidth) return;
    const shift = viewShift(this.camera.aspect);
    this.camera.position.x -= shift;
    this.camera.lookAt(-shift, this.subject(this.camera.aspect).lookY, 0);
    this.camera.updateMatrixWorld();
    this.publish();
  }
  protected photographic() {
    return true;
  }
  // ---- building --------------------------------------------------------------------------------------------------
  /** Lays the tiles and estates of a map (once: a view sees one map). */
  private build(map: HexMap) {
    this.map = map;
    const land = [];
    for (let h = 0; h < HEXES; h++) if (map.land[h]) land.push(h);
    this.tops = new T.InstancedMesh(this.shapes.top, this.stuffs.grass, land.length);
    this.bodies = new T.InstancedMesh(this.shapes.body, this.stuffs.earth, land.length);
    const m = new T.Matrix4(),
      q = new T.Quaternion(),
      up = new T.Vector3(0, 1, 0);
    land.forEach((h, i) => {
      const at = hexAt(h);
      this.landIndex.set(h, i);
      // Each tile's grass turned by a sixth now and then, so that no two neighbours look alike.
      q.setFromAxisAngle(up, ((h * 7) % 6) * (Math.PI / 3));
      m.compose(new T.Vector3(at.x, LAND_TOP + 0.001, at.z), q, new T.Vector3(1, 1, 1));
      this.tops!.setMatrixAt(i, m);
      m.makeTranslation(at.x, 0, at.z);
      this.bodies!.setMatrixAt(i, m);
      this.tops!.setColorAt(i, new T.Color(WILD));
    });
    for (const mesh of [this.tops, this.bodies]) {
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.scene.add(mesh);
    }
    this.paintSea(map);
    for (let h = 0; h < HEXES; h++) {
      const e = map.estate[h];
      if (e === NONE) continue;
      const at = hexAt(h),
        group = new T.Group();
      group.position.set(at.x, LAND_TOP, at.z);
      group.scale.setScalar(ESTATE_SCALE);
      if (e === CAPITAL) this.castle(group, h);
      else if (e === TOWN) this.town(group, h);
      else if (e === PORT) this.port(group, h, map);
      this.estates.add(group);
    }
  }
  private mesh(geometry: T.BufferGeometry, material: T.Material, parent: T.Object3D, x = 0, y = 0, z = 0) {
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  /** A small castle: a wall round a keep, four towers with spires, and a banner over the keep. */
  private castle(group: T.Group, h: number) {
    const s = this.shapes,
      stone = this.stuffs.stone;
    group.position.z -= 0.13;
    this.mesh(s.wallRing, stone, group);
    this.mesh(s.keep, stone, group);
    const flags: T.Mesh[] = [];
    for (const [x, z] of [
      [-0.15, -0.15],
      [0.15, -0.15],
      [-0.15, 0.15],
      [0.15, 0.15],
    ]) {
      this.mesh(s.tower, stone, group, x, 0, z);
      flags.push(this.mesh(s.spire, this.paints[0].roof, group, x, 0, z));
    }
    this.mesh(s.pole, this.stuffs.dark, group);
    const flag = this.mesh(s.flag, this.paints[0].banner, group);
    flag.castShadow = false;
    flags.push(flag);
    this.banners.set(h, flags);
  }
  /** Three houses round a little square, their roofs of tiles. */
  private town(group: T.Group, h: number) {
    const s = this.shapes,
      spots = [
        [-0.12, -0.08, 0.3],
        [0.12, -0.1, -0.4],
        [0.01, 0.1, 0.9],
      ];
    group.position.z -= 0.11;
    spots.forEach(([x, z, turn], i) => {
      const house = new T.Group();
      house.position.set(x, 0, z);
      house.rotation.y = turn + (h % 3) * 0.3;
      const scale = i === 2 ? 1.15 : 1;
      house.scale.setScalar(scale);
      this.mesh(s.wall, this.stuffs.plaster, house);
      this.mesh(s.roof, this.paintsRoof, house);
      group.add(house);
    });
  }
  private get paintsRoof() {
    return (this.stuffs.roofTile ??= this.standard({ color: "#b5553a", roughness: 0.7 }));
  }
  /** A pier of planks out over the water next to it, posts under it, and a boat moored at its end. */
  private port(group: T.Group, h: number, map: HexMap) {
    const water = NEIGHBOURS[h].filter((n) => !map.land[n]),
      // The pier points at the water nearest the middle of all the water round it.
      target = water.length ? water[Math.floor(water.length / 2)] : NEIGHBOURS[h][0],
      from = hexAt(h),
      to = hexAt(target),
      angle = Math.atan2(to.x - from.x, to.z - from.z);
    const pier = new T.Group();
    pier.rotation.y = angle;
    group.add(pier);
    const plank = this.mesh(this.shapes.plank, this.stuffs.pine, pier, 0, 0.01, 0.33);
    plank.scale.set(1.4, 1, 1);
    for (const sx of [-0.06, 0.06]) for (const z of [0.26, 0.5]) this.mesh(this.shapes.post, this.stuffs.dark, pier, sx, -0.06, z);
    const boat = new T.Group();
    boat.position.set(0.15, -LAND_TOP + SEA_TOP + 0.005, 0.52);
    boat.rotation.y = Math.PI / 2;
    this.mesh(this.shapes.boat, this.stuffs.dark, boat);
    pier.add(boat);
    // A crate and a barrel on the quay.
    this.mesh(this.shapes.wall, this.stuffs.pine, group, -0.12, 0, -0.1).scale.set(0.6, 0.7, 0.7);
  }
  /** The sea for a map: deep water, lighter shallows along every coast, and the faint grid of the water's hexes. */
  private paintSea(map: HexMap) {
    const c = this.seaCanvas,
      ctx = c.getContext("2d")!,
      w = c.width,
      h = c.height,
      fw = MAP_HALF + 0.42 - 0.18,
      fd = MAP_HALF_Z + 0.42 - 0.18,
      px = (x: number, z: number): [number, number] => [((x + fw) / (fw * 2)) * w, ((z + fd) / (fd * 2)) * h],
      unit = w / (fw * 2);
    const deep = ctx.createLinearGradient(0, 0, w, h);
    deep.addColorStop(0, "#1d4d6e");
    deep.addColorStop(1, "#173f5c");
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, w, h);
    const hex = (cx: number, cy: number, r: number) => {
      ctx.beginPath();
      for (let i = 0; i < 6; i++) ctx.lineTo(cx + Math.cos((Math.PI / 3) * i) * r, cy + Math.sin((Math.PI / 3) * i) * r);
      ctx.closePath();
    };
    // Shallows: a soft light glow round each piece of land.
    ctx.save();
    ctx.filter = `blur(${Math.round(unit * 0.28)}px)`;
    ctx.fillStyle = "#3f8fa6";
    for (let i = 0; i < HEXES; i++) {
      if (!map.land[i]) continue;
      const at = hexAt(i);
      hex(...px(at.x, at.z), unit * SIZE * 1.18);
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = "#58aebd";
    for (let i = 0; i < HEXES; i++) {
      if (!map.land[i]) continue;
      const at = hexAt(i);
      hex(...px(at.x, at.z), unit * SIZE * 1.02);
      ctx.fill();
    }
    // The grid of the water's hexes, faint, so that a ship's steps can be counted.
    ctx.strokeStyle = "rgba(220, 240, 250, 0.22)";
    ctx.lineWidth = Math.max(1, unit * 0.025);
    for (let i = 0; i < HEXES; i++) {
      if (map.land[i]) continue;
      const at = hexAt(i);
      hex(...px(at.x, at.z), unit * SIZE * 0.94);
      ctx.stroke();
    }
    this.seaTexture.needsUpdate = true;
  }
  // ---- armies ----------------------------------------------------------------------------------------------------
  private figure(h: number): Figure {
    const known = this.figures.get(h);
    if (known) return known;
    const group = new T.Group(),
      stand = this.mesh(this.shapes.stand, this.stuffs.pine, group),
      men: T.Group[] = [];
    for (let i = 0; i < 3; i++) {
      const man = new T.Group();
      for (const part of ["legs", "coat", "belt", "head", "hat", "plume", "rifle"]) this.mesh(this.shapes[part], this.stuffs.tin, man);
      for (const sx of [-1, 1]) {
        const arm = this.mesh(this.shapes.arm, this.stuffs.tin, man, sx * 0.042, 0.15, 0);
        arm.rotation.z = sx * 0.12;
      }
      group.add(man);
      men.push(man);
    }
    const ship = new T.Group();
    this.mesh(this.shapes.hull, this.stuffs.dark, ship);
    this.mesh(this.shapes.deck, this.stuffs.pine, ship);
    this.mesh(this.shapes.mast, this.stuffs.dark, ship, 0.02);
    this.mesh(this.shapes.sail, this.paints[0].sail, ship, 0.02);
    ship.rotation.y = 0.5;
    group.add(ship);
    const canvas = document.createElement("canvas");
    canvas.width = 160;
    canvas.height = 64;
    const texture = this.own(new T.CanvasTexture(canvas));
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    const plate = new T.Sprite(this.own(new T.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false, transparent: true })));
    plate.renderOrder = 10;
    plate.center.set(0.5, 0);
    group.add(plate);
    this.scene.add(group);
    const made: Figure = { group, men, stand, ship, plate, canvas, texture, label: "", nation: -1 };
    this.figures.set(h, made);
    return made;
  }
  /** Paints a figure for an army: its men or its ship in its colour, and its plate. */
  private dress(f: Figure, army: Army, atSea: boolean) {
    const paint = this.paints[army.nation];
    if (f.nation !== army.nation) {
      f.nation = army.nation;
      for (const man of f.men)
        man.children.forEach((part, i) => {
          // legs, coat, belt, head, hat, plume, rifle, arm, arm
          (part as T.Mesh).material = [this.stuffs.black, paint.coat, this.stuffs.canvas, this.stuffs.skin, this.stuffs.black, paint.trim, this.stuffs.dark, paint.coat, paint.coat][i];
        });
      (f.ship.children[3] as T.Mesh).material = paint.sail;
    }
    const count = menFor(army.count);
    f.stand.visible = !atSea;
    f.men.forEach((man, i) => {
      man.visible = !atSea && i < count;
      if (!man.visible) return;
      const [x, z] = RANKS[count - 1][i];
      man.position.set(x, 0.03, z);
      man.rotation.set(0, 0.25, 0);
    });
    f.ship.visible = atSea;
    f.ship.rotation.z = 0;
    f.plate.visible = true;
    const label = `${army.count}/${army.morale}`;
    if (label !== f.label) {
      f.label = label;
      drawPlate(f.canvas, label, COLORS[army.nation]);
      f.texture.needsUpdate = true;
    }
    // The plate is sized in the army's own scale: about three quarters of a hex across, larger on a phone.
    const wide = (this.camera.aspect >= 1.95 ? 1.25 : 1) / ARMY_SCALE;
    f.plate.scale.set(0.74 * wide, 0.296 * wide, 1);
    f.plate.position.set(0, atSea ? 0.36 : 0.38, 0);
  }
  /** Where an army on `h` stands. */
  private standAt(h: number) {
    const at = hexAt(h),
      land = this.map!.land[h];
    return new T.Vector3(at.x, land ? LAND_TOP : SEA_TOP, at.z + (land && this.map!.estate[h] !== NONE ? ARMY_FORWARD : 0));
  }
  // ---- laying out ------------------------------------------------------------------------------------------------
  private paintOwners(owner: number[]) {
    if (!this.tops) return;
    const color = new T.Color(),
      wild = new T.Color(WILD);
    for (const [h, i] of this.landIndex) {
      color.copy(wild);
      if (owner[h] >= 0) color.lerp(new T.Color(COLORS[owner[h]]), TINT);
      this.tops.setColorAt(i, color);
    }
    this.tops.instanceColor!.needsUpdate = true;
    for (const [h, flags] of this.banners) {
      const o = owner[h];
      flags.forEach((mesh, i) => (mesh.material = o >= 0 ? (i === flags.length - 1 ? this.paints[o].banner : this.paints[o].roof) : this.paintsRoof));
    }
  }
  protected place(state: S) {
    if (state.map !== this.map) this.build(state.map);
    this.paintOwners(state.owner);
    for (const [h, f] of this.figures) if (!state.armies[h]) f.group.visible = false;
    for (let h = 0; h < HEXES; h++) {
      const army = state.armies[h];
      if (!army) continue;
      const f = this.figure(h);
      f.group.visible = true;
      f.group.position.copy(this.standAt(h));
      f.group.rotation.set(0, 0, 0);
      f.group.scale.setScalar(ARMY_SCALE);
      this.dress(f, army, !state.map.land[h]);
      if (h === this.lifted) f.group.position.y += 0.1;
    }
    for (const puff of this.puffs) puff.visible = false;
    this.publish();
    this.mark(this.marks);
  }
  /** Tells browser tests where every hex and army is on the screen, and how the game stands. */
  private publish() {
    const state = this.state,
      el = this.renderer.domElement;
    if (!state || !this.map || !this.host.clientWidth) return;
    this.camera.updateMatrixWorld();
    const w = el.clientWidth,
      h = el.clientHeight,
      v = new T.Vector3(),
      screen = (p: T.Vector3) => {
        v.copy(p).project(this.camera);
        return [Math.round(((v.x + 1) / 2) * w), Math.round(((1 - v.y) / 2) * h)];
      };
    const places = Array.from({ length: HEXES }, (_, i) => {
      const at = hexAt(i);
      return screen(new T.Vector3(at.x, state.map.land[i] ? LAND_TOP : SEA_TOP, at.z));
    });
    const armies: { h: number; n: number; c: number; m: number; moved: boolean; at: number[] }[] = [];
    state.armies.forEach((a, i) => {
      if (a) armies.push({ h: i, n: a.nation, c: a.count, m: a.morale, moved: a.moved, at: screen(this.standAt(i).add(new T.Vector3(0, 0.24, 0))) });
    });
    el.dataset.places = JSON.stringify(places);
    el.dataset.armies = JSON.stringify(armies);
    el.dataset.land = state.map.land.map((l) => (l ? 1 : 0)).join("");
    el.dataset.estates = state.map.estate.join("");
    el.dataset.owners = state.owner.join(",");
    el.dataset.seat = String(state.seat);
    el.dataset.left = String(state.left);
    el.dataset.ply = String(state.ply);
  }
  // ---- animating -------------------------------------------------------------------------------------------------
  protected animate(before: State, state: State) {
    const last = state.last;
    if (!last || state.ply !== before.ply + 1 || !this.map) return false;
    let t = 0;
    if (last.kind !== "end" && last.mover) {
      const f = this.figures.get(last.from);
      if (!f) return false;
      const start = this.standAt(last.from),
        end = this.standAt(last.to),
        mid = last.via >= 0 ? this.standAt(last.via) : null,
        seaward = !this.map.land[last.to];
      // A soldier marching onto the water boards a ship at once, and one coming ashore leaves it.
      if (seaward !== !this.map.land[last.from]) this.dress(f, last.mover, seaward);
      const path = (p: number, out: T.Vector3) => {
        if (!mid) return out.lerpVectors(start, end, p);
        return p < 0.5 ? out.lerpVectors(start, mid, p * 2) : out.lerpVectors(mid, end, p * 2 - 1);
      };
      const walk = mid ? 720 : 480,
        at = new T.Vector3();
      if (last.kind === "attack") {
        // Up to the edge of the hex attacked, a puff of smoke, and the loser falls.
        const stop = 0.62,
          loser = last.won ? this.figures.get(last.to) : f;
        this.tween(0, walk * stop, (p) => {
          path(stop * p, at);
          f.group.position.copy(at);
          f.group.position.y += hop(p) * 0.05;
          this.redraw();
        });
        t = walk * stop;
        const meet = new T.Vector3().lerpVectors(path(stop, new T.Vector3()), end, 0.5);
        this.tween(t, 650, (p) => {
          if (p > 0 && !this.puffs[0].visible) this.onContact();
          this.smoke(meet, p);
          if (loser) {
            const fallen = Math.min(1, Math.max(0, (p - 0.25) / 0.6));
            loser.group.rotation.set(0, 0, 0);
            loser.men.forEach((man) => (man.rotation.x = -fallen * (Math.PI / 2) * 0.95));
            loser.ship.rotation.z = fallen * 0.9;
            loser.group.position.y = (loser === f ? at.y : this.standAt(last.to).y) - fallen * 0.06;
            loser.plate.visible = fallen < 0.5;
          }
        });
        t += 650;
        if (last.won) {
          this.tween(t, walk * (1 - stop), (p) => {
            path(stop + (1 - stop) * p, at);
            f.group.position.copy(at);
            if (p >= 1) this.paintOwners(state.owner);
          });
          t += walk * (1 - stop);
        }
      } else {
        this.tween(0, walk, (p) => {
          path(p, at);
          f.group.position.copy(at);
          f.group.position.y += hop(p) * 0.06;
          if (p >= 0.84 && !f.group.userData.landed) {
            f.group.userData.landed = true;
            this.onContact();
            this.paintOwners(state.owner);
          }
        });
        f.group.userData.landed = false;
        t = walk;
      }
      // A conquered nation's land turns over to the conqueror with a puff at its capital.
      if (last.conquered >= 0) {
        const capital = before.nations[last.conquered].capital,
          spot = this.standAt(capital);
        this.tween(t, 700, (p) => {
          if (p > 0) this.paintOwners(state.owner);
          this.smoke(spot, p, 1.6);
        });
        t += 700;
      }
    }
    // Reinforcements at the ends of turns: the new strength shown with a small bounce of each army that took them.
    if (last.spawned.length) {
      const spawned = [...new Set(last.spawned)];
      let laid = false;
      this.tween(t, 420, (p) => {
        if (p > 0 && !laid) {
          laid = true;
          this.place(state);
        }
        for (const h of spawned) {
          const f = this.figures.get(h);
          if (f && state.armies[h]) f.group.scale.setScalar(ARMY_SCALE * (1 + 0.22 * Math.sin(Math.PI * p)));
        }
      });
      t += 420;
    }
    return t > 0;
  }
  /** A puff of smoke at `at`, `p` of its way from nothing to gone. */
  private smoke(at: T.Vector3, p: number, size = 1) {
    this.puffs.forEach((puff, i) => {
      const a = (i / this.puffs.length) * Math.PI * 2,
        spread = (0.08 + 0.22 * p) * size;
      puff.visible = p > 0 && p < 1;
      puff.position.set(at.x + Math.cos(a) * spread, at.y + 0.12 + 0.18 * p * size + (i % 3) * 0.03, at.z + Math.sin(a) * spread * 0.7);
      puff.scale.setScalar((0.16 + 0.3 * p) * size * (0.8 + (i % 3) * 0.15));
      (puff.material as T.SpriteMaterial).opacity = Math.sin(Math.PI * Math.min(1, p * 1.15)) * 0.85;
    });
  }
  // ---- choosing --------------------------------------------------------------------------------------------------
  protected spots(): Spot[] {
    if (!this.state) return [];
    return Array.from({ length: HEXES }, (_, h) => {
      const at = hexAt(h);
      return { x: at.x, y: this.state!.map.land[h] ? LAND_TOP : SEA_TOP, z: at.z, r: SIZE * 0.86, point: h };
    });
  }
  /** The hex under a point of the map's plane, or -1. */
  private hexUnder(x: number, z: number) {
    let best = -1,
      near = SIZE * 0.95;
    for (let h = 0; h < HEXES; h++) {
      const at = hexAt(h),
        d = Math.hypot(at.x - x, at.z - z);
      if (d < near) {
        near = d;
        best = h;
      }
    }
    return best;
  }
  /** A tap takes the army it strikes first, else the hex under it. */
  protected pick(ray: T.Ray) {
    const state = this.state;
    if (!state || !this.map) return -1;
    let best = -1,
      along = Infinity;
    const body = new T.Vector3(),
      foot = new T.Vector3();
    for (let h = 0; h < HEXES; h++) {
      if (!state.armies[h]) continue;
      body.copy(this.standAt(h));
      body.y += 0.26;
      if (ray.distanceSqToPoint(body) > 0.25 * 0.25) continue;
      const d = foot.copy(body).sub(ray.origin).dot(ray.direction);
      if (d < along) {
        along = d;
        best = h;
      }
    }
    if (best >= 0) return best;
    const hit = new T.Vector3();
    if (!ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -LAND_TOP), hit)) return -1;
    const under = this.hexUnder(hit.x, hit.z);
    // Water lies lower than land: a ray that passes over a sea hex meets the sea further on.
    if (under >= 0 && !this.map.land[under] && ray.intersectPlane(new T.Plane(new T.Vector3(0, 1, 0), -SEA_TOP), hit)) {
      const low = this.hexUnder(hit.x, hit.z);
      if (low >= 0 && !this.map.land[low]) return low;
    }
    return under;
  }
  /** A press on an army of mine that may move is followed: let go on another hex it moves there, on itself it is a tap. */
  protected dragStart(point: number) {
    const s = this.state;
    if (!s || s.winner !== null || s.seat !== 0 || point < 0) return false;
    const army = s.armies[point];
    if (!army || army.nation !== 0 || army.moved || !destinations(s, point).length) return false;
    this.dragging = { from: point, at: null, over: point };
    return true;
  }
  protected dragMove(at: { x: number; z: number }) {
    if (!this.dragging) return;
    const over = this.hexUnder(at.x, at.z),
      f = this.figures.get(this.dragging.from);
    this.dragging.at = at;
    // Once the pointer has left the army's own hex the army is carried along over the map.
    if (over !== this.dragging.from && f) {
      f.group.position.set(at.x, LAND_TOP + 0.18, at.z);
      this.lifted = -1;
    }
    this.dragging.over = over;
    if (over !== this.hovered) this.hover(over);
    this.redraw();
  }
  protected dragEnd(at: { x: number; z: number } | null) {
    const drag = this.dragging;
    this.dragging = null;
    if (!drag) return;
    if (this.state) this.place(this.state);
    if (!at) return;
    const to = this.hexUnder(at.x, at.z);
    if (to === drag.from || to < 0 || drag.over === drag.from) this.onPick(drag.from);
    else this.onMove({ from: drag.from, to, extra: -1 });
  }
  protected hover(point: number) {
    this.hovered = point;
    this.mark(this.marks);
  }
  // ---- marks -----------------------------------------------------------------------------------------------------
  private ring(i: number, shape: T.BufferGeometry, paint: T.Material, h: number, lift = 0) {
    let mesh = this.rings[i];
    if (!mesh) {
      mesh = new T.Mesh(shape, paint);
      mesh.renderOrder = 6;
      this.scene.add(mesh);
      this.rings[i] = mesh;
    }
    const at = hexAt(h);
    mesh.geometry = shape;
    mesh.material = paint;
    mesh.position.set(at.x, (this.map!.land[h] ? LAND_TOP : SEA_TOP) + 0.006 + lift, at.z);
    mesh.scale.setScalar(1);
    mesh.visible = true;
    return mesh;
  }
  protected mark(marks: Marks) {
    const state = this.state;
    let n = 0;
    if (state && this.map) {
      const kind = (h: number): Kind => {
        const a = state.armies[h];
        return !a ? "move" : a.nation === state.seat ? "join" : "attack";
      };
      for (const h of marks.targets) {
        this.ring(n++, this.ringShape, this.ringPaint[kind(h)], h);
        if (kind(h) !== "move") this.ring(n++, this.discShape, this.ringPaint[kind(h)], h, -0.002).scale.setScalar(0.92);
      }
      for (const h of marks.movable) if (h !== marks.selected) this.ring(n++, this.thinRing, this.ringPaint.movable, h).scale.setScalar(0.62);
      if (marks.selected !== null && marks.selected >= 0) this.ring(n++, this.ringShape, this.ringPaint.selected, marks.selected);
      if (marks.cursor !== null && marks.cursor >= 0) this.ring(n++, this.thinRing, this.ringPaint.cursor, marks.cursor, 0.002);
      if (this.hovered >= 0 && (this.dragging || marks.targets.includes(this.hovered))) this.ring(n++, this.discShape, this.ringPaint.hover, this.hovered, 0.001);
      // The army picked up stands a little raised.
      const lifted = marks.selected ?? -1;
      if (lifted !== this.lifted) {
        const was = this.figures.get(this.lifted);
        if (was && state.armies[this.lifted]) was.group.position.y = this.standAt(this.lifted).y;
        this.lifted = lifted;
        const now = this.figures.get(lifted);
        if (now && state.armies[lifted] && !this.animating) now.group.position.y = this.standAt(lifted).y + 0.1;
      }
    }
    for (let i = n; i < this.rings.length; i++) this.rings[i].visible = false;
    // The hexes the army picked up may go to, for browser tests.
    this.renderer.domElement.dataset.targets = marks.targets.join(",");
    this.redraw();
  }
  dispose() {
    cancelAnimationFrame(this.idle);
    super.dispose();
  }
}
type S = State;
/** The plate over an army: its count and morale, white on dark with its nation's colour down the left. */
function drawPlate(canvas: HTMLCanvasElement, label: string, color: string) {
  const ctx = canvas.getContext("2d")!,
    w = canvas.width,
    h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.beginPath();
  ctx.roundRect(3, 3, w - 6, h - 6, 14);
  ctx.fillStyle = "rgba(18, 16, 14, 0.86)";
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${label.length > 4 ? 40 : 44}px Inter, "Noto Sans KR", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, h / 2 + 2);
}
/** A soft round puff of smoke. */
function puffTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d")!,
    g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
  g.addColorStop(0, "rgba(250, 246, 238, 1)");
  g.addColorStop(0.5, "rgba(228, 222, 210, 0.75)");
  g.addColorStop(1, "rgba(200, 194, 184, 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  return texture;
}
/** The hull of a little ship: a pointed bow and a square stern, raised in a low wall. */
function hullShape(scale = 1) {
  const shape = new T.Shape();
  shape.moveTo(-0.13, -0.05);
  shape.lineTo(0.08, -0.05);
  shape.quadraticCurveTo(0.15, -0.03, 0.17, 0);
  shape.quadraticCurveTo(0.15, 0.03, 0.08, 0.05);
  shape.lineTo(-0.13, 0.05);
  shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 2 });
  // Lying on the water: the shape's plane turned flat, its depth upward.
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0.012, 0);
  geometry.scale(scale, scale, scale);
  return geometry;
}
/** A square sail bellied a little, across the hull. */
function sailShape() {
  const geometry = new T.PlaneGeometry(0.16, 0.15, 6, 1);
  const at = geometry.getAttribute("position");
  for (let i = 0; i < at.count; i++) at.setZ(i, 0.025 * Math.cos((at.getX(i) / 0.16) * Math.PI));
  geometry.rotateY(Math.PI / 2);
  geometry.translate(0, 0.2, 0);
  geometry.computeVertexNormals();
  return geometry;
}
/** Slow waves as a normal map: a few long swells crossing, drawn once. */
function waveMap() {
  const size = 256,
    canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!,
    image = ctx.createImageData(size, size),
    height = (x: number, y: number) => {
      const u = (x / size) * Math.PI * 2,
        v = (y / size) * Math.PI * 2;
      return Math.sin(u * 3 + v) * 0.5 + Math.sin(u - v * 4) * 0.35 + Math.sin(u * 7 + v * 5) * 0.15 + Math.sin(u * 2 - v * 9) * 0.1;
    };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = height(x + 1, y) - height(x - 1, y),
        dy = height(x, y + 1) - height(x, y - 1),
        n = new T.Vector3(-dx * 4, -dy * 4, 1).normalize(),
        i = (y * size + x) * 4;
      image.data[i] = (n.x * 0.5 + 0.5) * 255;
      image.data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      image.data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  const texture = new T.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  return texture;
}
