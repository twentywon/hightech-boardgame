import * as T from "three";
import { block } from "../../engine/scene-utils";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
/** A canvas texture of `w` × `h` painted by `paint`. */
export function painted(w: number, h: number, paint: (pen: CanvasRenderingContext2D) => void, keep: Keep) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  paint(canvas.getContext("2d")!);
  const texture = keep(new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
/** The carpet of an amusement arcade: deep navy with bright squiggles, rings and stars, as such carpets are. */
function carpet(keep: Keep) {
  const texture = painted(
    512,
    512,
    (pen) => {
      pen.fillStyle = "#14123a";
      pen.fillRect(0, 0, 512, 512);
      const random = sequence(31),
        colours = ["#ff3fa4", "#38e1ff", "#ffd23a", "#7dff6a", "#a46bff"];
      pen.lineCap = "round";
      for (let k = 0; k < 70; k++) {
        const x = random() * 512,
          y = random() * 512,
          c = colours[k % colours.length];
        pen.strokeStyle = pen.fillStyle = c;
        pen.lineWidth = 5;
        if (k % 3 === 0) {
          // A squiggle.
          pen.beginPath();
          for (let s = 0; s <= 6; s++) pen.lineTo(x + s * 9, y + Math.sin(s * 1.7 + k) * 9);
          pen.stroke();
        } else if (k % 3 === 1) {
          pen.beginPath();
          pen.arc(x, y, 8 + random() * 8, 0, Math.PI * 2);
          pen.stroke();
        } else {
          pen.beginPath();
          for (let i = 0; i < 10; i++) {
            const a = -Math.PI / 2 + (i * Math.PI) / 5,
              r = i % 2 ? 5 : 12;
            pen.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
          }
          pen.fill();
        }
      }
      // The pile's speckle.
      for (let k = 0; k < 9000; k++) {
        pen.fillStyle = random() < 0.5 ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.18)";
        pen.fillRect(random() * 512, random() * 512, 2, 2);
      }
    },
    keep,
  );
  texture.wrapS = texture.wrapT = T.RepeatWrapping;
  texture.repeat.set(6, 6);
  return texture;
}
/** A blurred picture of a game for a far machine's screen: soft blobs of colour, as a screen out of focus looks. */
function screenGlow(seed: number, keep: Keep) {
  return painted(
    128,
    96,
    (pen) => {
      const random = sequence(seed);
      pen.fillStyle = ["#1a0d3a", "#06253a", "#2a0a1a"][seed % 3];
      pen.fillRect(0, 0, 128, 96);
      for (let k = 0; k < 9; k++) {
        const x = random() * 128,
          y = random() * 96,
          r = 14 + random() * 26,
          g = pen.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, ["rgba(255,90,200,0.9)", "rgba(80,230,255,0.9)", "rgba(255,230,90,0.9)", "rgba(120,255,120,0.8)"][Math.floor(random() * 4)]);
        g.addColorStop(1, "rgba(0,0,0,0)");
        pen.fillStyle = g;
        pen.fillRect(0, 0, 128, 96);
      }
    },
    keep,
  );
}
/**
 * The arcade round the coin pusher: a carpeted floor, dark walls with neon tubes (a star, waves, a ring), and other
 * machines along the walls and beside this one, their screens glowing out of focus. `floor` is the room's floor
 * height. Returns the neon paints, for the view to let them breathe.
 */
export function arcadeRoom(scene: T.Scene, keep: Keep, floor: number) {
  const neon: T.MeshStandardMaterial[] = [];
  const ground = new T.Mesh(keep(new T.PlaneGeometry(30, 30).rotateX(-Math.PI / 2)), keep(new T.MeshLambertMaterial({ map: carpet(keep) })));
  ground.position.y = floor;
  scene.add(ground);
  const wall = keep(new T.MeshLambertMaterial({ color: "#1c1638" }));
  const back = new T.Mesh(keep(new T.PlaneGeometry(30, 9)), wall);
  back.position.set(0, floor + 4.5, -6.5);
  scene.add(back);
  for (const side of [-1, 1]) {
    const flank = new T.Mesh(keep(new T.PlaneGeometry(14, 9)), wall);
    flank.rotation.y = -side * (Math.PI / 2);
    flank.position.set(side * 8, floor + 4.5, 0.5);
    scene.add(flank);
  }
  const tube = (colour: string) => {
    const paint = keep(new T.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: 2.2, roughness: 0.4 }));
    neon.push(paint);
    return paint;
  };
  const line = (points: T.Vector3[], colour: string, thick = 0.05) => {
    const path = new T.CatmullRomCurve3(points),
      mesh = new T.Mesh(keep(new T.TubeGeometry(path, Math.max(8, points.length * 8), thick, 6, false)), tube(colour));
    scene.add(mesh);
    return mesh;
  };
  // Neon on the back wall: waves across, a star at each side, a ring with a coin's cross in it.
  for (const [y, colour] of [
    [floor + 5.3, "#ff3fa4"],
    [floor + 5.0, "#38e1ff"],
  ] as const)
    line(
      Array.from({ length: 25 }, (_, k) => new T.Vector3(-9 + k * 0.75, y + Math.sin(k * 0.9) * 0.14, -6.45)),
      colour,
    );
  for (const side of [-1, 1]) {
    const cx = side * 4.6,
      cy = floor + 3.4,
      star = Array.from({ length: 11 }, (_, i) => {
        const a = Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? 0.32 : 0.78;
        return new T.Vector3(cx + Math.cos(a) * r, cy + Math.sin(a) * r, -6.44);
      });
    const shape = new T.Mesh(keep(new T.TubeGeometry(new T.CatmullRomCurve3(star, true, "catmullrom", 0.02), 120, 0.045, 6, true)), tube("#ffd23a"));
    scene.add(shape);
  }
  const ring = new T.Mesh(keep(new T.TorusGeometry(0.9, 0.05, 8, 64)), tube("#7dff6a"));
  ring.position.set(0, floor + 4.1, -6.44);
  scene.add(ring);
  // Other machines: tall cabinets along the back wall and one either side of this machine, a little behind it.
  const random = sequence(7),
    bodies = ["#3a1a7a", "#0f4a6a", "#7a1a4a", "#1a5a3a"].map((c) => keep(new T.MeshLambertMaterial({ color: c })));
  const machine = (x: number, z: number, turn: number, seed: number, tall: number) => {
    const group = new T.Group();
    const body = new T.Mesh(keep(block(1.5, tall, 1.3, 0.06)), bodies[seed % bodies.length]);
    body.position.y = tall / 2;
    group.add(body);
    const glow = keep(new T.MeshBasicMaterial({ map: screenGlow(seed, keep) }));
    const screen = new T.Mesh(keep(new T.PlaneGeometry(1.2, 0.95)), glow);
    screen.position.set(0, tall * 0.62, 0.66);
    screen.rotation.x = -0.12;
    group.add(screen);
    const marquee = new T.Mesh(keep(new T.BoxGeometry(1.4, 0.32, 0.08)), tube(["#ff3fa4", "#38e1ff", "#ffd23a", "#a46bff"][seed % 4]));
    marquee.position.set(0, tall - 0.22, 0.64);
    group.add(marquee);
    group.position.set(x, floor, z);
    group.rotation.y = turn;
    scene.add(group);
  };
  for (let k = 0; k < 7; k++) machine(-6 + k * 2, -5.6, 0, k + Math.floor(random() * 3), 2.9 + random() * 0.4);
  for (const side of [-1, 1]) {
    machine(side * 3.7, -1.2, -side * 0.35, side < 0 ? 2 : 5, 3.3);
    machine(side * 6.2, 0.6, -side * 0.9, side < 0 ? 4 : 1, 3.0);
  }
  // A strip of light along the foot of the back wall.
  const skirting = new T.Mesh(keep(new T.BoxGeometry(30, 0.06, 0.06)), tube("#a46bff"));
  skirting.position.set(0, floor + 0.05, -6.4);
  scene.add(skirting);
  return neon;
}
