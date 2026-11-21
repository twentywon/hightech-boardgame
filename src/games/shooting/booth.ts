import * as T from "three";
import { block } from "../../engine/scene-utils";
import { ACROSS, BACK_Z, BAYS, BULL_R, COMBO, FACE_R, ROWS, TIERS, type BBTarget } from "./bb";
import { RIGS } from "./layout";
import { canvas, sequence, sevenSegment, texture } from "./paint";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
/**
 * The BB-gun booth of an arcade, after the composition of the machine in the user's photograph (our own name, signs
 * and prints): seen from the player's place, the rifle on its swivel at the counter, a glass booth under blue neon
 * and a camouflage net, three bays of round targets in metal racks behind it with hazard stripes on their ledges, a
 * red seven-segment display over each bay (score, combo, pellets), and two cards on the counter: how to aim, and the
 * combo rule with the three tiers. The arcade round it is dark, lit by other machines.
 */
export interface Booth {
  targets: { group: T.Group; face: T.MeshStandardMaterial; bull: T.MeshStandardMaterial }[];
  /** The three displays: painted by `show`. */
  show: (score: number, combo: number, comboLeft: number, pellets: number) => void;
  /** The swivel's turning yoke (turned with the gun's yaw). */
  yoke: T.Group;
  /** The neon tubes' paint, for their slow flicker. */
  neon: T.MeshBasicMaterial[];
}
export function buildBooth(scene: T.Scene, keep: Keep): Booth {
  const std = (o: T.MeshStandardMaterialParameters) => keep(new T.MeshStandardMaterial({ roughness: 0.7, ...o })),
    put = (g: T.BufferGeometry, m: T.Material, x: number, y: number, z: number, parent: T.Object3D = scene) => {
      const mesh = new T.Mesh(keep(g), m);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    },
    random = sequence(77);
  scene.fog = new T.Fog("#0a0820", 9, 26);
  // The arcade's floor and walls, and other machines glowing in the dark at either side.
  const { c: tileC, ctx: tile } = canvas(256, 256);
  tile.fillStyle = "#17142a";
  tile.fillRect(0, 0, 256, 256);
  for (let k = 0; k < 400; k++) {
    tile.fillStyle = `hsla(${200 + random() * 120},80%,60%,${0.05 + random() * 0.12})`;
    tile.fillRect(random() * 256, random() * 256, 3, 3);
  }
  tile.strokeStyle = "rgba(0,0,0,0.5)";
  tile.lineWidth = 4;
  tile.strokeRect(0, 0, 256, 256);
  put(new T.PlaneGeometry(30, 30), std({ map: texture(tileC, keep, [20, 20]), roughness: 0.4 }), 0, 0, 0).rotation.x = -Math.PI / 2;
  put(new T.PlaneGeometry(30, 8), std({ color: "#0d0b1c" }), 0, 4, -9);
  for (const side of [-1, 1])
    for (let k = 0; k < 3; k++) {
      const hue = [300, 190, 40][(k + (side > 0 ? 1 : 0)) % 3],
        cab = put(block(1.1, 2.1, 0.9, 0.06), std({ color: `hsl(${hue},40%,12%)` }), side * (3.1 + k * 1.3), 1.05, -1.5 - k * 1.9);
      cab.rotation.y = -side * 0.5;
      const screen = put(new T.PlaneGeometry(0.8, 0.6), keep(new T.MeshBasicMaterial({ color: `hsl(${hue},85%,${40 + k * 6}%)` })), 0, 0.4, 0.451, cab);
      screen.receiveShadow = false;
    }
  // The counter before the booth, its top lit blue; the swivel's post and the turning yoke on it.
  const counterTop = std({ color: "#1a2a55", roughness: 0.35, metalness: 0.5 });
  put(block(3.8, 0.1, 0.7, 0.03), counterTop, 0, 1.0, 0.3);
  put(block(3.8, 0.95, 0.62, 0.03), std({ color: "#121a33", roughness: 0.6 }), 0, 0.48, 0.34);
  const steel = std({ color: "#7d8591", roughness: 0.3, metalness: 0.85 }),
    pivot = RIGS.bb.pivot;
  put(new T.CylinderGeometry(0.04, 0.06, pivot.y - 0.16 - 1.05, 16), steel, pivot.x, (1.05 + pivot.y - 0.16) / 2, pivot.z);
  put(new T.CylinderGeometry(0.11, 0.12, 0.04, 24), steel, pivot.x, 1.07, pivot.z);
  const yoke = new T.Group();
  yoke.position.set(pivot.x, pivot.y - 0.16, pivot.z);
  scene.add(yoke);
  put(new T.CylinderGeometry(0.05, 0.05, 0.05, 20), steel, 0, 0, 0, yoke);
  for (const side of [-1, 1]) put(block(0.01, 0.075, 0.05, 0.003), steel, side * 0.022, 0.035, -0.0, yoke);
  // The booth: a dark frame of metal posts with glass between, a camouflage net under its roof and blue neon along it.
  const frame = std({ color: "#20242c", roughness: 0.45, metalness: 0.6 }),
    glass = keep(new T.MeshPhysicalMaterial({ color: "#8fb4ff", transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0, depthWrite: false }));
  for (const x of [-1.8, 1.8]) {
    put(block(0.08, 2.4, 0.08, 0.02), frame, x, 1.2, 0.02);
    put(block(0.08, 2.4, 0.08, 0.02), frame, x, 1.2, -4.45);
    const pane = put(new T.PlaneGeometry(4.45, 1.6), glass, x, 1.75, -2.2);
    pane.rotation.y = Math.PI / 2;
  }
  put(block(3.68, 0.08, 0.08, 0.02), frame, 0, 2.4, 0.02);
  put(block(3.68, 0.5, 0.06, 0.02), frame, 0, 2.62, 0.02);
  // The front glass over the counter, cut away where the rifle goes through.
  for (const side of [-1, 1]) put(new T.PlaneGeometry(1.5, 1.32), glass, side * 1.04, 1.74, 0.0);
  put(new T.PlaneGeometry(0.58, 0.62), glass, 0, 2.08, 0.0);
  // The camouflage net: patches of greens and browns on a coarse mesh, seen through and lit by the neon.
  const { c: netC, ctx: net } = canvas(512, 512);
  const greens = ["#26351c", "#3d4a22", "#56502b", "#2d2a1a", "#40562c"];
  for (let k = 0; k < 220; k++) {
    net.fillStyle = greens[Math.floor(random() * greens.length)];
    net.beginPath();
    const x = random() * 512,
      y = random() * 512;
    for (let p = 0; p < 7; p++) net.lineTo(x + (random() - 0.5) * 60, y + (random() - 0.5) * 60);
    net.fill();
  }
  net.globalCompositeOperation = "destination-out";
  for (let y = 0; y < 512; y += 16) for (let x = 0; x < 512; x += 16) if (random() < 0.42) net.fillRect(x + 3, y + 3, 10, 10);
  net.globalCompositeOperation = "source-over";
  const netMesh = put(new T.PlaneGeometry(3.6, 4.4, 12, 12), std({ map: texture(netC, keep, [2, 2.4]), transparent: true, alphaTest: 0.3, side: T.DoubleSide, roughness: 0.9 }), 0, 2.28, -2.2);
  netMesh.rotation.x = Math.PI / 2;
  const sag = netMesh.geometry.getAttribute("position");
  for (let i = 0; i < sag.count; i++) sag.setZ(i, -0.12 * Math.sin(((sag.getX(i) + 1.8) / 3.6) * Math.PI) * Math.sin(((sag.getY(i) + 2.2) / 4.4) * Math.PI * 3) ** 2);
  netMesh.geometry.computeVertexNormals();
  put(new T.PlaneGeometry(3.6, 4.5), std({ color: "#07060f" }), 0, 2.45, -2.2).rotation.x = Math.PI / 2;
  const neon: T.MeshBasicMaterial[] = [];
  const tube = (length: number, x: number, y: number, z: number, along: "x" | "z", colour = "#3d6bff") => {
    const m = keep(new T.MeshBasicMaterial({ color: colour }));
    neon.push(m);
    const mesh = put(new T.CylinderGeometry(0.016, 0.016, length, 10), m, x, y, z);
    mesh.rotation[along === "x" ? "z" : "x"] = Math.PI / 2;
    return mesh;
  };
  tube(3.5, 0, 2.36, -0.06, "x");
  tube(4.4, -1.74, 2.36, -2.2, "z");
  tube(4.4, 1.74, 2.36, -2.2, "z");
  tube(3.5, 0, 2.36, -4.38, "x", "#7a4dff");
  // The back of the bays: dark sheet metal scratched and scrawled over, in three bays between posts.
  const { c: backC, ctx: back } = canvas(512, 256);
  back.fillStyle = "#1d2129";
  back.fillRect(0, 0, 512, 256);
  for (let k = 0; k < 160; k++) {
    back.strokeStyle = `rgba(${150 + random() * 100},${160 + random() * 90},${180 + random() * 70},${0.06 + random() * 0.16})`;
    back.lineWidth = 0.5 + random() * 2;
    back.beginPath();
    const x = random() * 512,
      y = random() * 256;
    back.moveTo(x, y);
    back.lineTo(x + (random() - 0.5) * 140, y + (random() - 0.5) * 60);
    back.stroke();
  }
  put(new T.PlaneGeometry(3.6, 1.9), std({ map: texture(backC, keep), roughness: 0.5, metalness: 0.4 }), 0, 1.45, BACK_Z);
  put(new T.PlaneGeometry(3.6, 4.5), std({ color: "#181b22", roughness: 0.8 }), 0, 0.62, -2.2).rotation.x = -Math.PI / 2;
  for (const x of [-1.575, -0.525, 0.525, 1.575]) put(block(0.06, 1.75, 0.7, 0.015), frame, x, 1.45, -3.95);
  // Hazard stripes on the ledges, as on a firing range.
  const { c: stripeC, ctx: stripe } = canvas(256, 32);
  stripe.fillStyle = "#f2c21a";
  stripe.fillRect(0, 0, 256, 32);
  stripe.fillStyle = "#16161a";
  for (let x = -32; x < 256; x += 32) {
    stripe.beginPath();
    stripe.moveTo(x, 32);
    stripe.lineTo(x + 16, 32);
    stripe.lineTo(x + 32, 0);
    stripe.lineTo(x + 16, 0);
    stripe.fill();
  }
  const stripes = std({ map: texture(stripeC, keep, [3, 1]), roughness: 0.55 });
  ROWS.forEach((row) => {
    BAYS.forEach((bx) => {
      put(block(0.98, 0.07, 0.3, 0.01), frame, bx, row.y - 0.135, row.z + 0.05);
      const ledge = put(new T.PlaneGeometry(0.98, 0.05), stripes, bx, row.y - 0.135, row.z + 0.201);
      ledge.receiveShadow = false;
    });
  });
  // The targets: a black housing with a ring of steel round its face, a lamp behind the face and a bull in its middle.
  const housing = keep(new T.CylinderGeometry(FACE_R + 0.016, FACE_R + 0.02, 0.05, 32)).rotateX(Math.PI / 2),
    faceShape = keep(new T.CircleGeometry(FACE_R, 32)),
    bullShape = keep(new T.CircleGeometry(BULL_R, 24)),
    rim = keep(new T.TorusGeometry(FACE_R + 0.006, 0.006, 8, 32)),
    blackPlastic = std({ color: "#121318", roughness: 0.5 });
  const targets: Booth["targets"] = [];
  BAYS.forEach((bx) =>
    ROWS.forEach((row) =>
      ACROSS.forEach((ax) => {
        const group = new T.Group();
        group.position.set(bx + ax, row.y, row.z);
        scene.add(group);
        const box = new T.Mesh(housing, blackPlastic);
        box.position.z = -0.03;
        group.add(box);
        const ring = new T.Mesh(rim, steel);
        group.add(ring);
        const face = std({ color: "#2b3140", emissive: "#000000", roughness: 0.35 }),
          bull = std({ color: "#454c5c", emissive: "#000000", roughness: 0.3 }),
          f = new T.Mesh(faceShape, face),
          b = new T.Mesh(bullShape, bull);
        f.position.z = 0.002;
        b.position.z = 0.004;
        group.add(f, b);
        targets.push({ group, face, bull });
      }),
    ),
  );
  // The displays over the bays: red seven-segment digits behind dark glass, each with a small label.
  const displays = BAYS.map((bx) => {
    const { c, ctx } = canvas(512, 128),
      map = texture(c, keep);
    put(block(0.86, 0.22, 0.08, 0.02), blackPlastic, bx, 2.02, -3.55);
    put(new T.PlaneGeometry(0.8, 0.2), keep(new T.MeshBasicMaterial({ map, toneMapped: false })), bx, 2.02, -3.508);
    return { c, ctx, map };
  });
  // The machine's own name over the displays, in neon letters.
  const { c: nameC, ctx: name } = canvas(1024, 160);
  name.font = '900 112px "Inter", "Noto Sans KR", sans-serif';
  name.textAlign = "center";
  name.textBaseline = "middle";
  name.shadowColor = "#ff3fb4";
  name.shadowBlur = 24;
  name.strokeStyle = "#ffd6f2";
  name.lineWidth = 8;
  name.strokeText("명중왕", 512, 84);
  name.fillStyle = "#ff4fbf";
  name.fillText("명중왕", 512, 84);
  name.shadowBlur = 0;
  name.font = '800 34px "Inter", sans-serif';
  name.fillStyle = "#7fd8ff";
  name.fillText("★ BB SHOOTING ★", 512, 146);
  put(new T.PlaneGeometry(1.4, 0.22), keep(new T.MeshBasicMaterial({ map: texture(nameC, keep), transparent: true, toneMapped: false })), 0, 2.27, -3.6);
  // The cards on the counter: how to aim (left) and the combo rule with the three tiers (right).
  const card = (x: number, rotate: number, draw: (ctx: CanvasRenderingContext2D) => void) => {
    const { c, ctx } = canvas(512, 640);
    ctx.fillStyle = "#fbfbf7";
    ctx.fillRect(0, 0, 512, 640);
    draw(ctx);
    const stand = new T.Group();
    stand.position.set(x, 1.06, 0.36);
    stand.rotation.set(-0.42, rotate, 0);
    scene.add(stand);
    const face = new T.Mesh(keep(new T.PlaneGeometry(0.3, 0.375)), std({ map: texture(c, keep), roughness: 0.4 }));
    face.position.y = 0.19;
    stand.add(face);
    const backing = new T.Mesh(keep(block(0.32, 0.395, 0.012, 0.004)), std({ color: "#222630", roughness: 0.5, metalness: 0.3 }));
    backing.position.set(0, 0.19, -0.008);
    stand.add(backing);
  };
  const heading = (ctx: CanvasRenderingContext2D, text: string, y: number, size: number, colour: string) => {
    ctx.font = `900 ${size}px "Inter", "Noto Sans KR", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillStyle = colour;
    ctx.fillText(text, 256, y);
  };
  card(-0.74, 0.32, (ctx) => {
    ctx.fillStyle = "#14161c";
    ctx.fillRect(0, 0, 512, 92);
    heading(ctx, "명중왕 조준 방법", 62, 44, "#ffd84a");
    // A front post in a notch, lined up.
    ctx.fillStyle = "#1c1e24";
    ctx.fillRect(116, 300, 120, 70);
    ctx.fillRect(276, 300, 120, 70);
    ctx.fillRect(116, 370, 280, 60);
    ctx.fillRect(246, 236, 20, 140);
    ctx.fillStyle = "#ff5a2a";
    ctx.beginPath();
    ctx.arc(256, 244, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#43d16a";
    for (const x of [170, 342]) {
      ctx.beginPath();
      ctx.arc(x, 336, 11, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.strokeStyle = "#e23a3a";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(256, 190, 44, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(256, 190, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = '700 30px "Noto Sans KR", sans-serif';
    ctx.fillStyle = "#22252c";
    ctx.textAlign = "center";
    ["누르고 있으면 조준", "가늠자와 가늠쇠를 일직선에", "떼는 순간 발사!"].forEach((line, i) => ctx.fillText(line, 256, 500 + i * 44));
  });
  card(0.74, -0.32, (ctx) => {
    ctx.fillStyle = "#2a5bd7";
    ctx.fillRect(0, 0, 512, 230);
    ctx.fillStyle = "#ffd84a";
    ctx.beginPath();
    ctx.ellipse(170, 74, 110, 50, -0.08, 0, Math.PI * 2);
    ctx.fill();
    heading(ctx, "", 0, 10, "#000");
    ctx.font = '900 64px "Noto Sans KR", sans-serif';
    ctx.textAlign = "center";
    ctx.fillStyle = "#c8261a";
    ctx.fillText("콤보", 170, 96);
    ctx.fillStyle = "#ffffff";
    ctx.font = '900 46px "Noto Sans KR", sans-serif';
    ctx.fillText("고득점!", 392, 92);
    ctx.font = '700 30px "Noto Sans KR", sans-serif';
    ctx.fillText(`${COMBO}초 안에 다음 과녁을 맞히면`, 256, 166);
    ctx.fillText("콤보로 점수가 곱해집니다", 256, 206);
    const coins: [string, string][] = [["#c0773a", "#7a4519"], ["#d9dde3", "#8b929c"], ["#f2c230", "#a77a0a"]];
    TIERS.forEach((tier, i) => {
      const y = 300 + i * 112;
      ctx.fillStyle = "#22252c";
      ctx.font = '900 46px "Noto Sans KR", sans-serif';
      ctx.textAlign = "left";
      ctx.fillText(`${tier.name}`, 52, y + 16);
      ctx.font = '700 28px "Noto Sans KR", sans-serif';
      ctx.fillText(["처음이라면", "과녁이 더 많이", "가장 어렵게"][i], 124, y + 14);
      const [fill, edge] = coins[i];
      ctx.fillStyle = fill;
      ctx.strokeStyle = edge;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(352, y, 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#22252c";
      ctx.font = '900 36px "Inter", sans-serif';
      ctx.textAlign = "right";
      ctx.fillText(`${tier.pellets}발`, 488, y + 14);
    });
  });
  // Light: a cool sky in the dark, a lamp over each bay, and the blue of the neon.
  scene.add(new T.HemisphereLight("#7c8cff", "#1a1230", 0.9));
  const key = new T.DirectionalLight("#dfe6ff", 1.1);
  key.position.set(0.8, 4, 2.2);
  key.target.position.set(0, 1.2, -3.8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  Object.assign(key.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -2.5, near: 0.5, far: 12 });
  keep(key.shadow);
  scene.add(key, key.target);
  // A lamp over the bays (one light, not one a bay: the booth is drawn by the processor in many browsers).
  const lamp = new T.DirectionalLight("#bcd0ff", 0.9);
  lamp.position.set(0, 3, -1);
  lamp.target.position.set(0, 1.2, -4);
  scene.add(lamp, lamp.target);
  const blue = new T.PointLight("#3d6bff", 3, 6, 1.5);
  blue.position.set(0, 2.3, -1.2);
  scene.add(blue);
  let shown = "";
  const show = (score: number, combo: number, comboLeft: number, pellets: number) => {
    // Painted again only when something on them changes (the combo's bar in steps of a tenth of its window).
    const key = `${score}|${combo}|${combo > 1 ? Math.ceil((comboLeft / COMBO) * 10) : 0}|${pellets}`;
    if (key === shown) return;
    shown = key;
    const words: [string, string][] = [
      ["SCORE", String(Math.min(999999, score)).padStart(6, " ")],
      ["COMBO", combo > 1 ? ` ${Math.min(9, combo)}` : "--"],
      ["BB", String(Math.max(0, pellets)).padStart(3, " ")],
    ];
    displays.forEach(({ c, ctx, map }, i) => {
      ctx.fillStyle = "#0a0204";
      ctx.fillRect(0, 0, c.width, c.height);
      ctx.font = '800 20px "Inter", sans-serif';
      ctx.fillStyle = "#3fe06a";
      ctx.textAlign = "left";
      ctx.fillText(words[i][0], 14, 26);
      const text = words[i][1],
        w = i === 0 ? 50 : 62,
        gap = w * 0.35,
        span = text.length * (w + gap) - gap,
        x = (c.width - span) / 2 + (i === 0 ? 30 : 10);
      sevenSegment(ctx, text, x, 30, w, 82, "#ff2a1e");
      // The combo's multiplier sign, in the display's red.
      if (i === 1 && combo > 1) {
        ctx.font = '900 76px "Inter", sans-serif';
        ctx.fillStyle = "#ff2a1e";
        ctx.textAlign = "center";
        ctx.fillText("×", x + w * 0.55, 98);
      }
      // The combo's window running out, under the number.
      if (i === 1 && combo > 1) {
        ctx.fillStyle = "#3fe06a";
        ctx.fillRect(80, 118, 352 * Math.max(0, Math.min(1, comboLeft / COMBO)), 6);
      }
      map.needsUpdate = true;
    });
  };
  show(0, 0, 0, TIERS[0].pellets);
  return { targets, show, yoke, neon };
}
/** Lights a target's face as the sim has it: dark, blue or yellow (struck ones spin by the view). */
export function lightTarget(target: Booth["targets"][number], state: BBTarget, now: number) {
  const colour = state.lit === 2 ? "#ffcf2e" : state.lit === 1 ? "#2f7bff" : null;
  if (colour) {
    // A slow pulse while it waits to be struck, quicker in its last half second.
    const left = state.until - now,
      pulse = 0.75 + 0.25 * Math.sin(now * (left < 0.5 ? 30 : 9));
    target.face.color.set(colour);
    target.face.emissive.set(colour);
    target.face.emissiveIntensity = 1.4 * pulse;
    target.bull.color.set("#ffffff");
    target.bull.emissive.set("#ffffff");
    target.bull.emissiveIntensity = 1.2 * pulse;
  } else {
    target.face.color.set("#2b3140");
    target.face.emissive.set("#000000");
    target.bull.color.set("#454c5c");
    target.bull.emissive.set("#000000");
  }
}
