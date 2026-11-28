import * as T from "three";
import { block, glossy, planks, stuff, weave, wood } from "../../engine/scene-utils";

/**
 * A Korean go parlour (바둑 기원), modelled and painted in code: a floor of vinyl tiles, cream walls over a wooden
 * wainscot, other go tables with games under way and chairs round them, a raised wooden floor with a footed board
 * and cushions, a wall clock, a framed calligraphy, the members' rank board (기력표), fluorescent lights under the
 * ceiling, a water dispenser, and a cabinet with a kettle on a hot plate and tea cups. Everything stands clear of
 * the table that is played on, behind it or beside it, so that nothing comes between the camera and the board,
 * and none of it casts a shadow onto the board.
 */
type Own = <R extends { dispose(): void }>(resource: R) => R;
export interface RoomPlan {
  /** Height of the floor and of the table tops. */
  floor: number;
  tableTop: number;
  /** How far the table played on reaches sideways and back. */
  tableHalf: number;
  tableDepth: number;
}
const KOREAN = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif',
  BRUSH = '"Nanum Brush Script", "Nanum Myeongjo", "Noto Serif KR", "Noto Serif CJK KR", Batang, AppleMyungjo, serif';
function canvas(width: number, height: number) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return { c, ctx: c.getContext("2d")! };
}
function texture(c: HTMLCanvasElement, repeatX = 1, repeatY = repeatX) {
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeatX !== 1 || repeatY !== 1) {
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.repeat.set(repeatX, repeatY);
  }
  return t;
}
/** A fixed sequence of numbers in [0, 1), so that the room is laid the same way every time. */
function sequence(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
/** Vinyl floor tiles, two shades of beige with flecks and thin joints; one picture is two tiles by two. */
function vinyl() {
  const { c, ctx } = canvas(512, 512),
    rand = sequence(311);
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = (i === 0 || i === 3) ? "#d9d0bd" : "#cbbfa8";
    ctx.fillRect((i % 2) * 256, Math.floor(i / 2) * 256, 256, 256);
  }
  for (let k = 0; k < 2600; k++) {
    const tone = rand() < 0.5 ? "rgba(120,104,84,0.22)" : "rgba(255,250,240,0.25)";
    ctx.fillStyle = tone;
    ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 3, 1 + rand() * 2);
  }
  ctx.strokeStyle = "rgba(90,78,62,0.45)";
  ctx.lineWidth = 2;
  for (const v of [1, 256, 511]) {
    ctx.beginPath();
    ctx.moveTo(v, 0);
    ctx.lineTo(v, 512);
    ctx.moveTo(0, v);
    ctx.lineTo(512, v);
    ctx.stroke();
  }
  return texture(c, 22, 18);
}
/** The face of a go board seen across the room: pale wood, nineteen lines and the star points. */
function boardFace() {
  const { c, ctx } = canvas(512, 512),
    rand = sequence(97);
  ctx.fillStyle = "#d6a868";
  ctx.fillRect(0, 0, 512, 512);
  for (let k = 0; k < 90; k++) {
    ctx.strokeStyle = `rgba(150,96,40,${0.05 + rand() * 0.08})`;
    ctx.lineWidth = 1 + rand() * 3;
    const y = rand() * 512;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + (rand() - 0.5) * 30, 340, y + (rand() - 0.5) * 30, 512, y + (rand() - 0.5) * 20);
    ctx.stroke();
  }
  const edge = 34,
    step = (512 - edge * 2) / 18;
  ctx.strokeStyle = "rgba(60,38,20,0.85)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 19; i++) {
    ctx.beginPath();
    ctx.moveTo(edge, edge + i * step);
    ctx.lineTo(512 - edge, edge + i * step);
    ctx.moveTo(edge + i * step, edge);
    ctx.lineTo(edge + i * step, 512 - edge);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(60,38,20,0.9)";
  for (const r of [3, 9, 15])
    for (const q of [3, 9, 15]) {
      ctx.beginPath();
      ctx.arc(edge + q * step, edge + r * step, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }
  return texture(c);
}
/**
 * A hanging scroll of hanji: two large characters written down it in a brush hand (手談, talking with the hands,
 * and 坐隱, sitting apart from the world, as go is called), a smaller line beside them and a red seal at the foot.
 */
function calligraphy(words: string) {
  const { c, ctx } = canvas(256, 940),
    rand = sequence(41 + words.charCodeAt(0));
  ctx.fillStyle = "#f2e8d2";
  ctx.fillRect(0, 0, 256, 940);
  for (let k = 0; k < 600; k++) {
    ctx.strokeStyle = `rgba(160,140,100,${0.05 + rand() * 0.08})`;
    ctx.lineWidth = 0.6 + rand();
    const x = rand() * 256,
      y = rand() * 940;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rand() - 0.5) * 24, y + (rand() - 0.5) * 24);
    ctx.stroke();
  }
  ctx.fillStyle = "#1d1a17";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 190px ${BRUSH}`;
  [...words].forEach((ch, i) => ctx.fillText(ch, 116, 430 + i * 230));
  ctx.font = `500 30px ${BRUSH}`;
  for (const [i, ch] of [..."爛柯一局石友"].entries()) ctx.fillText(ch, 218, 420 + i * 40);
  ctx.fillStyle = "#b8282a";
  ctx.fillRect(198, 680, 38, 38);
  ctx.fillRect(198, 730, 38, 38);
  ctx.fillStyle = "#f2e8d2";
  ctx.font = `700 22px ${BRUSH}`;
  ctx.fillText("石", 217, 700);
  ctx.fillText("友", 217, 750);
  return texture(c);
}
/** A wall clock's face: numbers, minute marks and the hands at twenty to four. */
function clockFace() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = "#fbfaf6";
  ctx.fillRect(0, 0, 256, 256);
  ctx.translate(128, 128);
  ctx.fillStyle = "#222";
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * Math.PI * 2,
      long = i % 5 === 0;
    ctx.save();
    ctx.rotate(a);
    ctx.fillRect(-(long ? 2.5 : 1), -118, long ? 5 : 2, long ? 16 : 8);
    ctx.restore();
  }
  ctx.font = `600 30px ${KOREAN}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let h = 1; h <= 12; h++) {
    const a = (h / 12) * Math.PI * 2;
    ctx.fillText(String(h), Math.sin(a) * 84, -Math.cos(a) * 84);
  }
  const hand = (angle: number, length: number, width: number, color: string) => {
    ctx.save();
    ctx.rotate(angle);
    ctx.fillStyle = color;
    ctx.fillRect(-width / 2, -length, width, length + 14);
    ctx.restore();
  };
  hand(((3 + 40 / 60) / 12) * Math.PI * 2, 62, 8, "#1a1a1a");
  hand((40 / 60) * Math.PI * 2, 96, 5, "#1a1a1a");
  hand((17 / 60) * Math.PI * 2, 104, 2, "#c23a2a");
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fillStyle = "#1a1a1a";
  ctx.fill();
  return texture(c);
}
/** The members' rank board: name plaques hung under their rank, the dan above and the kyu below. */
function rankBoard() {
  const { c, ctx } = canvas(1024, 560);
  ctx.fillStyle = "#4b2f1c";
  ctx.fillRect(0, 0, 1024, 560);
  ctx.strokeStyle = "#c9a25a";
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 1004, 540);
  ctx.fillStyle = "#f1e3c0";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 50px ${KOREAN}`;
  ctx.fillText("수담기원 회원 기력표", 512, 56);
  const ranks = ["7단", "6단", "5단", "4단", "3단", "2단", "1단", "1급", "2급", "3급", "4급", "5급", "6급", "7급"],
    names = ["김수담", "박정석", "이포석", "최행마", "정사활", "한끝내기", "조대마", "윤화점", "강소목", "서삼삼", "임축머리", "오장문", "신호구", "권패싸움", "문단수", "배붙임", "송날일", "황호선", "안걸침", "류귀살", "전한칸", "남두칸", "홍마늘", "유정석"],
    width = 1024 / 7;
  ranks.forEach((rank, i) => {
    const col = i % 7,
      row = Math.floor(i / 7),
      x = col * width + width / 2,
      y = 120 + row * 220;
    ctx.fillStyle = "#c9a25a";
    ctx.font = `700 30px ${KOREAN}`;
    ctx.fillText(rank, x, y);
    for (let k = 0; k < 2; k++) {
      const name = names[(i * 2 + k) % names.length];
      ctx.fillStyle = "#f6efdc";
      ctx.fillRect(x - 56, y + 26 + k * 82, 112, 70);
      ctx.fillStyle = "#2a1c12";
      ctx.font = `600 ${name.length > 3 ? 24 : 28}px ${KOREAN}`;
      ctx.fillText(name, x, y + 61 + k * 82);
    }
  });
  return texture(c);
}
/** A small framed notice: 정숙 (quiet, please) and the day's fee, as such places put up. */
function notice() {
  const { c, ctx } = canvas(384, 256);
  ctx.fillStyle = "#fffdf6";
  ctx.fillRect(0, 0, 384, 256);
  ctx.fillStyle = "#b8282a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 92px ${KOREAN}`;
  ctx.fillText("정 숙", 192, 96);
  ctx.fillStyle = "#333";
  ctx.font = `500 30px ${KOREAN}`;
  ctx.fillText("대국 중에는 조용히", 192, 188);
  return texture(c);
}
/** The outline of a go bowl turned on a lathe, from the foot up over the rim and into the hollow, down to `fill`. */
export function bowlGeometry(radius: number, height: number, fill = 0.64) {
  const r = radius,
    h = height,
    profile: [number, number][] = [
      [0, 0],
      [0.6, 0],
      [0.68, 0.015],
      [0.7, 0.05],
      [0.8, 0.09],
      [0.92, 0.2],
      [0.99, 0.36],
      [1.0, 0.48],
      [0.97, 0.62],
      [0.9, 0.75],
      [0.81, 0.85],
      [0.75, 0.9],
      [0.73, 0.925],
      [0.7, 0.92],
      [0.68, 0.86],
      [0.66, fill + 0.08],
      [0.5, fill],
      [0, fill],
    ];
  return new T.LatheGeometry(
    profile.map(([x, y]) => new T.Vector2(x * r, y * h)),
    48,
  );
}
/** A bowl's lid lying upturned, as a shallow dish: its domed top below, its rim above, hollow inside. */
export function lidGeometry(radius: number) {
  const r = radius,
    profile: [number, number][] = [
      [0, 0],
      [0.55, 0],
      [0.62, 0.012],
      [0.82, 0.05],
      [0.94, 0.1],
      [1.0, 0.17],
      [1.0, 0.24],
      [0.97, 0.27],
      [0.93, 0.25],
      [0.9, 0.17],
      [0.78, 0.1],
      [0.5, 0.06],
      [0, 0.05],
    ];
  return new T.LatheGeometry(
    profile.map(([x, y]) => new T.Vector2(x * r, y * r)),
    48,
  );
}
/**
 * Where the `i`-th stone of a heap lies inside a round hollow of radius `room`: a sunflower's spiral, each ring a
 * little higher toward the middle, with a small tilt; a second layer starts where the first is full.
 */
export function heapSpot(i: number, room: number, stone: number, rise: number) {
  const perLayer = Math.max(6, Math.floor(((room / stone) * (room / stone)) * 0.78)),
    layer = Math.floor(i / perLayer),
    k = i % perLayer,
    shift = layer * 1.3,
    rho = Math.sqrt((k + 0.5) / perLayer) * (room - stone * 0.9),
    angle = k * 2.39996 + shift,
    wobble = Math.sin(i * 12.9898) * 43758.5453;
  const tilt = (wobble - Math.floor(wobble) - 0.5) * 0.5;
  return {
    x: Math.cos(angle) * rho,
    z: Math.sin(angle) * rho,
    y: (1 - (rho / room) ** 2) * rise + layer * stone * 0.55,
    tiltX: tilt,
    tiltZ: Math.cos(i * 3.1) * 0.22,
    turn: angle,
  };
}
/** Builds the parlour round the table played on. */
export function giwon(scene: T.Object3D, own: Own, plan: RoomPlan) {
  const standard = (options: T.MeshStandardMaterialParameters) => own(new T.MeshStandardMaterial({ roughness: 0.8, ...options }));
  const keep = <R extends { dispose(): void }>(r: R) => own(r);
  const add = (geometry: T.BufferGeometry, material: T.Material | T.Material[], x: number, y: number, z: number, parent: T.Object3D = scene, shadow = false) => {
    const mesh = new T.Mesh(own(geometry), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const { floor, tableTop, tableHalf: hw, tableDepth: hd } = plan,
    height = tableTop - floor,
    // The camera looks down on the board, so the room is drawn close round the table: the back wall stands just
    // behind the other player's chair, and only its lower part comes into view.
    back = -hd - 5.2,
    side = hw + 14,
    ceiling = floor + 26,
    deep = 60;
  // The floor, the walls over a low wooden wainscot, and the ceiling.
  add(new T.PlaneGeometry(side * 2 + 2, deep), standard({ map: own(vinyl()), roughness: 0.42 }), 0, floor, back + deep / 2).rotation.x = -Math.PI / 2;
  const paint = standard({ ...stuff("stone", "#e9e2d0", 3, keep, 2), roughness: 0.95 }),
    panel = standard({ map: own(wood(true)), color: "#b07a4c", roughness: 0.55 }),
    trim = standard({ map: own(wood(true)), color: "#6a4128", roughness: 0.5 });
  add(new T.PlaneGeometry(side * 2 + 2, ceiling - floor), paint, 0, (floor + ceiling) / 2, back);
  for (const sign of [-1, 1]) add(new T.PlaneGeometry(deep, ceiling - floor), paint, sign * side, (floor + ceiling) / 2, back + deep / 2).rotation.y = -sign * Math.PI / 2;
  const wainscot = height * 0.22;
  add(block(side * 2 + 2, wainscot, 0.25, 0.04), panel, 0, floor + wainscot / 2, back + 0.13);
  add(block(side * 2 + 2, 0.22, 0.36, 0.05), trim, 0, floor + wainscot, back + 0.18);
  for (const sign of [-1, 1]) {
    add(block(0.25, wainscot, deep, 0.04), panel, sign * (side - 0.13), floor + wainscot / 2, back + deep / 2);
    add(block(0.36, 0.22, deep, 0.05), trim, sign * (side - 0.18), floor + wainscot, back + deep / 2);
  }
  add(new T.PlaneGeometry(side * 2 + 2, deep), standard({ color: "#f3f1ea", roughness: 1 }), 0, ceiling, back + deep / 2).rotation.x = Math.PI / 2;
  // Fluorescent lights in white housings, in rows under the ceiling.
  const housing = standard({ color: "#f4f4f0", roughness: 0.6 }),
    tube = own(new T.MeshBasicMaterial({ color: "#f6fbff" }));
  for (const x of [-12, 0, 12])
    for (const z of [back + 5, back + 17, back + 29]) {
      add(block(1.6, 0.35, 7, 0.08), housing, x, ceiling - 0.6, z);
      for (const dx of [-0.4, 0.4]) add(new T.CylinderGeometry(0.16, 0.16, 6.6, 10).rotateX(Math.PI / 2), tube, x + dx, ceiling - 0.85, z);
    }
  // On the back wall: a hanging scroll either side of the chair, the clock, and the rank board.
  const frameWood = standard({ map: own(wood(true)), color: "#4a2c1a", roughness: 0.45 });
  const hang = (map: T.Texture, w: number, h: number, x: number, bottom: number, frame = 0.22, material = frameWood) => {
    const y = bottom + h / 2;
    if (frame) add(block(w + frame * 2, h + frame * 2, 0.18, 0.05), material, x, y, back + 0.1);
    add(new T.PlaneGeometry(w, h), standard({ map: own(map), roughness: 0.9 }), x, y, back + 0.2);
  };
  const scroll = (map: T.Texture, x: number) => {
    hang(map, 2.6, 9.5, x, floor + wainscot + 0.9, 0);
    // Silk mounting round the paper, and the roller at its foot.
    add(new T.PlaneGeometry(3.3, 10.6), standard({ color: "#6f7f6a", roughness: 0.7 }), x, floor + wainscot + 0.9 + 4.75, back + 0.15);
    add(new T.CylinderGeometry(0.16, 0.16, 3.9, 12).rotateZ(Math.PI / 2), trim, x, floor + wainscot + 0.5, back + 0.3);
  };
  scroll(calligraphy("手談"), -3.4);
  scroll(calligraphy("坐隱"), -hw - 6.4);
  hang(rankBoard(), 9, 4.9, hw + 4.4, floor + wainscot + 1.0, 0.18, trim);
  hang(notice(), 2.4, 1.6, hw + 10.8, floor + height * 0.5, 0.1, standard({ color: "#c9c4b6", roughness: 0.4, metalness: 0.5 }));
  // The clock: a round case with a white face, at the right of the chair.
  const clockAt = new T.Vector3(3.5, floor + height * 0.5, back + 0.25);
  add(new T.CylinderGeometry(1.25, 1.25, 0.3, 40).rotateX(Math.PI / 2), standard({ color: "#2b2b2e", roughness: 0.35, metalness: 0.4 }), clockAt.x, clockAt.y, clockAt.z);
  add(new T.CircleGeometry(1.08, 40), standard({ map: own(clockFace()), roughness: 0.3 }), clockAt.x, clockAt.y, clockAt.z + 0.16);
  // Tables, boards and bowls round the room, with games under way.
  const top = standard({ ...planks(1, keep), color: "#cfc3b2" }),
    oak = standard({ map: own(wood(false)), color: "#a8784a", roughness: 0.55 }),
    face = standard({ map: own(boardFace()), roughness: 0.55 }),
    boardSide = standard({ map: own(wood(false, 0.3)), roughness: 0.52 }),
    bowlWood = own(glossy({ map: own(wood(true)), color: "#c58b58", roughness: 0.4 }, 0.5)),
    vinylSeat = standard({ color: "#2e5a45", roughness: 0.55 }),
    black = own(glossy({ color: "#202226", roughness: 0.3, metalness: 0.04 })),
    white = own(glossy({ color: "#f6f0e4", roughness: 0.28, metalness: 0.04 })),
    stone = own(new T.SphereGeometry(1, 16, 10)),
    bowl = own(bowlGeometry(0.95, 1.0)),
    lid = own(lidGeometry(0.95));
  const stones: { x: number; y: number; z: number; color: 0 | 1 }[] = [],
    rand = sequence(2024),
    boardHalf = 3.4,
    radius = 0.16;
  /**
   * A board `thick` deep standing at `y`, with a game of `count` stones under way, and bowls with their lids
   * beside it at `bowlY`, on the `sides` given (-1 left, 1 right).
   */
  const goSet = (group: T.Object3D, y: number, count: number, thick = 0.45, bowlY = y, sides = [-1, 1]) => {
    add(block(boardHalf * 2, thick, boardHalf * 2, 0.06), [boardSide, boardSide, face, boardSide, boardSide, boardSide], 0, y + thick / 2, 0, group);
    const taken = new Set<number>(),
      step = (boardHalf * 2 - 0.44) / 18;
    group.updateMatrixWorld(true);
    for (let k = 0; k < count; k++) {
      let p = Math.floor(rand() * 361);
      // Games grow from the corners and sides.
      if (rand() < 0.6) {
        const r = Math.floor(rand() * 6) + (rand() < 0.5 ? 0 : 13),
          q = Math.floor(rand() * 19);
        p = rand() < 0.5 ? r * 19 + q : q * 19 + r;
      }
      if (taken.has(p)) continue;
      taken.add(p);
      const world = group.localToWorld(new T.Vector3(((p % 19) - 9) * step, y + thick + radius * 0.5, (Math.floor(p / 19) - 9) * step));
      stones.push({ x: world.x, y: world.y, z: world.z, color: k % 2 === 0 ? 0 : 1 });
    }
    for (const sign of sides) {
      add(bowl, bowlWood, sign * (boardHalf + 1.3), bowlY, sign * 1.2, group);
      add(lid, bowlWood, sign * (boardHalf + 1.3), bowlY, -sign * 1.1, group);
    }
  };
  /** A wooden chair with a green vinyl cushion on its seat and its back; it faces +z before it is turned. */
  const chair = (parent: T.Object3D, x: number, z: number, turn: number) => {
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = turn;
    parent.add(group);
    const seat = floor + height * 0.6;
    add(block(3.4, 0.36, 3.2, 0.08), oak, 0, seat - 0.18, 0, group);
    add(block(3.2, 0.32, 3.0, 0.14), vinylSeat, 0, seat + 0.16, 0.05, group);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) add(block(0.34, seat - floor, 0.34, 0.06), oak, sx * 1.45, (seat + floor) / 2, sz * 1.35, group);
    for (const sx of [-1, 1]) add(block(0.34, 3.6, 0.34, 0.06), oak, sx * 1.45, seat + 1.8, -1.42, group);
    add(block(3.2, 1.7, 0.3, 0.1), oak, 0, seat + 2.7, -1.42, group);
    add(block(2.7, 1.3, 0.16, 0.06), vinylSeat, 0, seat + 2.7, -1.22, group);
  };
  /** A table with legs and two chairs, turned by `turn`, with a game on it. */
  const table = (x: number, z: number, turn: number, count: number) => {
    const group = new T.Group();
    group.position.set(x, 0, z);
    group.rotation.y = turn;
    scene.add(group);
    add(block(hw * 2, 0.4, hd * 2, 0.08), top, 0, tableTop - 0.2, 0, group);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) add(block(0.45, height - 0.4, 0.45, 0.06), oak, sx * (hw - 0.6), floor + (height - 0.4) / 2, sz * (hd - 0.6), group);
    goSet(group, tableTop, count);
    for (const sz of [-1, 1]) chair(group, 0, sz * (hd + 1.9), sz < 0 ? 0 : Math.PI);
  };
  // The chair across the table played on, where the other player sits.
  chair(scene, 0, -hd - 1.9, 0);
  // A game under way at the next table on the left, and a quiet one behind it.
  table(-hw * 2 - 1.8, -1.2, 0, 70);
  table(-hw * 2 - 1.8, -hd * 2 - 9, 0, 30);
  // A raised wooden floor at the right with a footed board, as old parlours keep, and a cushion either side.
  {
    const group = new T.Group(),
      deck = floor + height * 0.3,
      across = 11;
    group.position.set(hw + 3.6 + across / 2, 0, -0.6);
    scene.add(group);
    add(block(across, deck - floor, hd * 2 + 9, 0.12), standard({ ...planks(1.2, keep), color: "#e2c196", roughness: 0.5 }), 0, (deck + floor) / 2, 0, group);
    const footed = deck + height * 0.26;
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) add(new T.CylinderGeometry(0.42, 0.3, footed - deck, 14), boardSide, sx * (boardHalf - 0.8) - 1.2, (footed + deck) / 2, sz * (boardHalf - 0.8), group);
    const board = new T.Group();
    board.position.x = -1.2;
    group.add(board);
    // Its bowls stand on the far side only, so that none stands by the table played on and seems to be on it.
    goSet(board, footed, 34, 1.5, deck, [1]);
    const silk = standard({ color: "#a8262c", roughness: 0.55, ...weave(1, 1, keep, 0.5) }),
      rim = standard({ color: "#e6c27a", roughness: 0.6 });
    for (const sz of [-1, 1]) {
      add(block(4.2, 0.5, 4.2, 0.22), rim, -1.2, deck + 0.25, sz * (boardHalf + 3.4), group);
      add(block(3.5, 0.16, 3.5, 0.06), silk, -1.2, deck + 0.55, sz * (boardHalf + 3.4), group);
    }
  }
  // Stones of every game round the room, drawn together.
  for (const color of [0, 1] as const) {
    const list = stones.filter((s) => s.color === color),
      mesh = new T.InstancedMesh(stone, color === 0 ? black : white, Math.max(1, list.length)),
      m = new T.Matrix4(),
      q = new T.Quaternion();
    list.forEach((s, i) => mesh.setMatrixAt(i, m.compose(new T.Vector3(s.x, s.y, s.z), q, new T.Vector3(radius, radius * 0.5, radius))));
    mesh.count = list.length;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // Against the back wall: a water dispenser with its blue bottle at the right, a cabinet with tea at the left.
  {
    const x = hw + 11.5,
      z = back + 1.6,
      body = standard({ color: "#eef0f0", roughness: 0.35 }),
      tall = height * 1.05;
    add(block(2.6, tall, 2.4, 0.15), body, x, floor + tall / 2, z);
    add(block(2.0, 0.25, 0.9, 0.05), standard({ color: "#555a60", roughness: 0.3, metalness: 0.5 }), x, floor + height * 0.38, z + 1.3);
    add(block(2.2, 1.6, 0.1, 0.05), standard({ color: "#d9dcdc", roughness: 0.4 }), x, floor + height * 0.55, z + 1.22);
    add(new T.CylinderGeometry(0.16, 0.16, 0.5, 10).rotateX(Math.PI / 2), standard({ color: "#d23b2f", roughness: 0.4 }), x - 0.45, floor + height * 0.6, z + 1.3);
    add(new T.CylinderGeometry(0.16, 0.16, 0.5, 10).rotateX(Math.PI / 2), standard({ color: "#2f63c8", roughness: 0.4 }), x + 0.45, floor + height * 0.6, z + 1.3);
    const bottle = own(new T.MeshStandardMaterial({ color: "#7fbdf5", roughness: 0.08, transparent: true, opacity: 0.62 }));
    add(new T.CylinderGeometry(1.05, 1.05, 2.6, 28), bottle, x, floor + tall + 1.6, z);
    add(new T.SphereGeometry(1.05, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), bottle, x, floor + tall + 2.9, z);
    add(new T.CylinderGeometry(0.4, 0.5, 0.4, 16), bottle, x, floor + tall + 0.15, z);
    // Paper cups in a holder on its side.
    add(new T.CylinderGeometry(0.28, 0.28, 2.4, 14), standard({ color: "#f8f8f4", roughness: 0.7 }), x - 1.65, floor + height * 0.55, z + 0.4);
  }
  {
    const x = -hw + 0.4,
      z = back + 1.4,
      cabinet = standard({ map: own(wood(true)), color: "#8a5a36", roughness: 0.5 }),
      shelfTop = floor + height * 0.42;
    add(block(7, shelfTop - floor, 2.6, 0.1), cabinet, x, (shelfTop + floor) / 2, z);
    for (const dx of [-1.7, 1.7]) add(block(3.2, (shelfTop - floor) * 0.8, 0.06, 0.02), cabinet, x + dx, (shelfTop + floor) / 2, z + 1.32);
    // A hot plate with a kettle on it.
    add(new T.CylinderGeometry(0.95, 1.0, 0.35, 28), standard({ color: "#2a2a2c", roughness: 0.4, metalness: 0.3 }), x - 1.8, shelfTop + 0.18, z);
    const metal = standard({ color: "#c9ccd0", roughness: 0.22, metalness: 0.9 }),
      kettleBase = shelfTop + 0.35;
    add(
      new T.LatheGeometry(
        [
          [0, 0],
          [0.85, 0],
          [0.95, 0.15],
          [0.98, 0.5],
          [0.85, 0.95],
          [0.5, 1.15],
          [0.35, 1.2],
          [0.34, 1.32],
          [0, 1.34],
        ].map(([r, y]) => new T.Vector2(r * 1.05, y * 1.05)),
        28,
      ),
      metal,
      x - 1.8,
      kettleBase,
      z,
    );
    const spout = add(new T.CylinderGeometry(0.08, 0.16, 1.0, 10), metal, x - 0.85, kettleBase + 0.85, z);
    spout.rotation.z = -0.9;
    const handle = add(new T.TorusGeometry(0.62, 0.07, 8, 20, Math.PI), standard({ color: "#1d1d1d", roughness: 0.5 }), x - 1.8, kettleBase + 1.35, z);
    handle.rotation.y = Math.PI / 2;
    // A tray of tea cups.
    add(block(2.8, 0.1, 1.7, 0.04), standard({ map: own(wood(true)), color: "#3b2416", roughness: 0.35 }), x + 1.5, shelfTop + 0.05, z);
    const china = standard({ color: "#f3efe6", roughness: 0.3 });
    for (const [dx, dz] of [[-0.8, -0.35], [0, -0.35], [0.8, -0.35], [-0.4, 0.4], [0.4, 0.4]]) add(new T.CylinderGeometry(0.28, 0.2, 0.42, 16), china, x + 1.5 + dx, shelfTop + 0.31, z + dz);
  }
}
