import * as T from "three";

/** Pictures and shapes for the war room's shots: water, fire, smoke, a flash, the pegs and the shell, all painted in code. */
function canvas(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  paint(c.getContext("2d")!);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
/**
 * The relief of a gently moving sea as a normal map that repeats: a few long swells and many small ripples, all whole
 * waves across the picture so that its edges meet.
 */
export function waveNormals() {
  const size = 256,
    c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!,
    image = ctx.createImageData(size, size),
    waves: [number, number, number, number][] = [
      [1, 2, 0.5, 0],
      [3, -1, 0.3, 1.3],
      [2, 5, 0.18, 2.1],
      [-6, 3, 0.1, 0.4],
      [7, 7, 0.04, 3.3],
      [-9, 11, 0.025, 1.7],
    ];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let dx = 0,
        dy = 0;
      for (const [fx, fy, a, phase] of waves) {
        const k = ((fx * x + fy * y) / size) * Math.PI * 2 + phase,
          d = a * Math.cos(k) * Math.PI * 2;
        dx += d * fx * 0.05;
        dy += d * fy * 0.05;
      }
      const length = Math.hypot(dx, dy, 1),
        i = (y * size + x) * 4;
      image.data[i] = ((-dx / length) * 0.5 + 0.5) * 255;
      image.data[i + 1] = ((-dy / length) * 0.5 + 0.5) * 255;
      image.data[i + 2] = ((1 / length) * 0.5 + 0.5) * 255;
      image.data[i + 3] = 255;
    }
  ctx.putImageData(image, 0, 0);
  const t = new T.CanvasTexture(c);
  t.wrapS = t.wrapT = T.RepeatWrapping;
  return t;
}
/** A tongue of flame: white-yellow at its root, orange and red toward its tip, fading out. */
export function flameTexture() {
  return canvas(64, 128, (ctx) => {
    ctx.translate(32, 100);
    ctx.scale(1, 2.6);
    const g = ctx.createRadialGradient(0, 0, 0, 0, -6, 28);
    g.addColorStop(0, "rgba(255,250,220,1)");
    g.addColorStop(0.25, "rgba(255,210,90,0.95)");
    g.addColorStop(0.55, "rgba(255,110,30,0.7)");
    g.addColorStop(1, "rgba(200,30,0,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -6, 28, 0, Math.PI * 2);
    ctx.fill();
  });
}
/** A soft round puff: smoke, spray, a flash, depending on how it is tinted. */
export function puffTexture() {
  return canvas(64, 64, (ctx) => {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.45, "rgba(255,255,255,0.6)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  });
}
/** A radar's screen: dark green glass, range rings, a cross, a few faint returns. */
export function radarTexture() {
  return canvas(256, 256, (ctx) => {
    const g = ctx.createRadialGradient(128, 128, 10, 128, 128, 128);
    g.addColorStop(0, "#0f3a22");
    g.addColorStop(1, "#04140b");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    ctx.strokeStyle = "rgba(90,255,150,0.45)";
    ctx.lineWidth = 2;
    for (const r of [40, 80, 120]) {
      ctx.beginPath();
      ctx.arc(128, 128, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(128, 6);
    ctx.lineTo(128, 250);
    ctx.moveTo(6, 128);
    ctx.lineTo(250, 128);
    ctx.stroke();
    ctx.fillStyle = "rgba(140,255,180,0.8)";
    for (const [x, y] of [[170, 90], [96, 172], [60, 80], [190, 160]]) {
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}
/** The radar's sweep: a wedge of green light that fades behind its leading edge. */
export function sweepTexture() {
  return canvas(256, 256, (ctx) => {
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = `rgba(110,255,160,${(0.5 * (1 - k / 40)) ** 1.5})`;
      ctx.beginPath();
      ctx.moveTo(128, 128);
      ctx.arc(128, 128, 124, -Math.PI / 2 - (k + 1) * 0.025, -Math.PI / 2 - k * 0.025);
      ctx.fill();
    }
  });
}
/** A peg as the charts' pegs are turned: a shaft, a collar and a rounded head; it stands on y 0. */
export function pegGeometry() {
  const points = [
    [0, 0],
    [0.045, 0],
    [0.045, 0.15],
    [0.068, 0.165],
    [0.078, 0.195],
    [0.07, 0.228],
    [0.045, 0.255],
    [0.0, 0.264],
  ].map(([x, y]) => new T.Vector2(x, y));
  return new T.LatheGeometry(points, 16);
}
/** A naval shell: a pointed nose, a straight body and a driving band near its base; its nose looks along +z. */
export function shellGeometry() {
  const points = [
    [0, -0.1],
    [0.034, -0.1],
    [0.038, -0.09],
    [0.038, -0.065],
    [0.043, -0.06],
    [0.043, -0.042],
    [0.038, -0.038],
    [0.038, 0.015],
    [0.032, 0.052],
    [0.018, 0.085],
    [0, 0.1],
  ].map(([x, y]) => new T.Vector2(x * 2.2, y * 2.2));
  const g = new T.LatheGeometry(points, 16);
  g.rotateX(Math.PI / 2);
  return g;
}
/** A ball of fire: a white-hot heart, yellow and orange flames round it in lumps, a dark red edge fading out. */
export function fireballTexture() {
  return canvas(128, 128, (ctx) => {
    let seed = 13;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 14; k++) {
      const a = random() * Math.PI * 2,
        d = 14 + random() * 22,
        x = 64 + Math.cos(a) * d,
        y = 64 + Math.sin(a) * d,
        r = 18 + random() * 16,
        g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(255,140,40,0.9)");
      g.addColorStop(0.6, "rgba(200,50,10,0.6)");
      g.addColorStop(1, "rgba(120,20,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 46);
    g.addColorStop(0, "rgba(255,255,230,1)");
    g.addColorStop(0.3, "rgba(255,220,100,1)");
    g.addColorStop(0.7, "rgba(255,130,30,0.85)");
    g.addColorStop(1, "rgba(220,60,10,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
  });
}
/** A billow of black smoke: dark lumps, denser in the middle, soft at the edge. */
export function smokeTexture() {
  return canvas(128, 128, (ctx) => {
    let seed = 29;
    const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let k = 0; k < 18; k++) {
      const a = random() * Math.PI * 2,
        d = random() * 30,
        x = 64 + Math.cos(a) * d,
        y = 64 + Math.sin(a) * d,
        r = 20 + random() * 18,
        shade = Math.floor(30 + random() * 40),
        g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${shade},${shade},${shade},0.55)`);
      g.addColorStop(1, `rgba(${shade},${shade},${shade},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    }
  });
}
