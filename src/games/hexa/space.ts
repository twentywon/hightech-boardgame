import * as T from "three";

type Keep = <R extends { dispose(): void }>(resource: R) => R;
/** A small repeatable source of numbers, so that the sky and the worlds are the same every time. */
export const sequence = (seed: number) => () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const texture = (canvas: HTMLCanvasElement, keep: Keep) => {
  const t = keep(new T.CanvasTexture(canvas));
  t.colorSpace = T.SRGBColorSpace;
  return t;
};
const canvasOf = (width: number, height: number) => {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return [c, c.getContext("2d")!] as const;
};
/**
 * Deep space behind the culture dish: a band of the galaxy crossing the sky, clouds of glowing gas with darker dust
 * over them, a few thousand stars and some bright ones with rays. Painted once, as the scene's background.
 */
export function skyTexture(keep: Keep) {
  const W = 2048,
    H = 1024,
    [canvas, c] = canvasOf(W, H),
    next = sequence(11),
    glow = (x: number, y: number, r: number, color: string, sx = 1, sy = 1) => {
      c.save();
      c.translate(x, y);
      c.scale(sx, sy);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.fillRect(-r, -r, r * 2, r * 2);
      c.restore();
    };
  const base = c.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, "#05040f");
  base.addColorStop(0.5, "#070a1a");
  base.addColorStop(1, "#03060d");
  c.fillStyle = base;
  c.fillRect(0, 0, W, H);
  // The galaxy's band, from upper left to lower right: a soft light made of many faint glows.
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 70; i++) {
    const t = next(),
      x = t * W,
      y = H * 0.12 + t * H * 0.72 + (next() - 0.5) * 170;
    glow(x, y, 90 + next() * 160, `rgba(${120 + next() * 60 | 0},${110 + next() * 50 | 0},${170 + next() * 60 | 0},0.07)`, 1.6, 0.7);
  }
  // Clouds of gas: violet, teal and rose.
  const clouds: [number, number, number, string][] = [
    [430, 300, 460, "rgba(96,52,190,0.36)"],
    [620, 220, 300, "rgba(190,70,160,0.22)"],
    [1520, 690, 520, "rgba(24,120,170,0.34)"],
    [1700, 560, 300, "rgba(60,200,190,0.16)"],
    [1080, 170, 330, "rgba(170,60,120,0.2)"],
    [260, 820, 300, "rgba(40,80,170,0.22)"],
  ];
  for (const [x, y, r, color] of clouds) {
    glow(x, y, r, color, 1.3, 0.85);
    for (let k = 0; k < 14; k++) glow(x + (next() - 0.5) * r * 1.4, y + (next() - 0.5) * r * 0.9, r * (0.18 + next() * 0.3), color.replace(/[\d.]+\)$/, `${0.12 + next() * 0.14})`));
  }
  // Dark lanes of dust across the brightest gas.
  c.globalCompositeOperation = "source-over";
  for (let i = 0; i < 26; i++) {
    const t = next();
    glow(t * W, H * 0.16 + t * H * 0.7 + (next() - 0.5) * 90, 40 + next() * 90, "rgba(2,3,10,0.42)", 2.2, 0.45);
  }
  // Stars: many faint, some coloured, a few bright with four rays.
  c.globalCompositeOperation = "lighter";
  for (let i = 0; i < 3200; i++) {
    const x = next() * W,
      y = next() * H,
      r = next() < 0.05 ? 1.6 + next() : next() * 1.1 + 0.25,
      hue = next(),
      [red, green, blue] = hue < 0.15 ? [255, 210, 170] : hue < 0.3 ? [170, 200, 255] : [235, 235, 255];
    c.fillStyle = `rgba(${red},${green},${blue},${0.35 + next() * 0.6})`;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }
  for (let i = 0; i < 22; i++) {
    const x = next() * W,
      y = next() * H,
      size = 5 + next() * 9,
      tint = next() < 0.5 ? "200,220,255" : "255,236,210";
    glow(x, y, size * 1.6, `rgba(${tint},0.5)`);
    c.strokeStyle = `rgba(${tint},0.55)`;
    c.lineWidth = 1.1;
    c.beginPath();
    c.moveTo(x - size * 2.2, y);
    c.lineTo(x + size * 2.2, y);
    c.moveTo(x, y - size * 2.2);
    c.lineTo(x, y + size * 2.2);
    c.stroke();
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.arc(x, y, 1.8, 0, Math.PI * 2);
    c.fill();
  }
  c.globalCompositeOperation = "source-over";
  return texture(canvas, keep);
}
/** A soft round glow, for halos and the light under the dish. */
export function glowTexture(keep: Keep, stops: [number, string][]) {
  const [canvas, c] = canvasOf(256, 256),
    g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
  for (const [at, color] of stops) g.addColorStop(at, color);
  c.fillStyle = g;
  c.fillRect(0, 0, 256, 256);
  return texture(canvas, keep);
}
/** An ocean world: deep blue seas, green and ochre land, white clouds. */
function oceanSkin(keep: Keep) {
  const [canvas, c] = canvasOf(1024, 512),
    next = sequence(5);
  const sea = c.createLinearGradient(0, 0, 0, 512);
  sea.addColorStop(0, "#c9dcf0");
  sea.addColorStop(0.1, "#2a5c9c");
  sea.addColorStop(0.5, "#1f4f8e");
  sea.addColorStop(0.9, "#2a5c9c");
  sea.addColorStop(1, "#d8e6f4");
  c.fillStyle = sea;
  c.fillRect(0, 0, 1024, 512);
  // Land and clouds are drawn on a layer of their own, then laid over the sea softened (a blur on every blob was slow).
  const [layerCanvas, l] = canvasOf(1024, 512),
    blob = (x: number, y: number, r: number, color: string) => {
      for (const dx of [-1024, 0, 1024]) {
        const g = l.createRadialGradient(x + dx, y, 0, x + dx, y, r);
        g.addColorStop(0, color);
        g.addColorStop(0.7, color);
        g.addColorStop(1, "rgba(0,0,0,0)");
        l.fillStyle = g;
        l.beginPath();
        l.arc(x + dx, y, r, 0, Math.PI * 2);
        l.fill();
      }
    },
    lay = (blur: number) => {
      c.filter = `blur(${blur}px)`;
      c.drawImage(layerCanvas, 0, 0);
      c.filter = "none";
      l.clearRect(0, 0, 1024, 512);
    };
  for (let i = 0; i < 7; i++) {
    let x = next() * 1024,
      y = 140 + next() * 230;
    // A coast wandering about, green inland and ochre in the dry parts.
    for (let k = 0; k < 70; k++) {
      x += (next() - 0.5) * 34;
      y += (next() - 0.5) * 20;
      blob(x, Math.max(90, Math.min(420, y)), 6 + next() * 14, next() < 0.3 ? "rgba(156,132,82,0.85)" : "rgba(58,112,66,0.85)");
    }
  }
  lay(2);
  for (let i = 0; i < 260; i++) {
    const x = next() * 1024,
      y = 40 + next() * 430;
    l.save();
    l.translate(x, y);
    l.scale(2.6, 0.7);
    blob(0, 0, 5 + next() * 10, `rgba(255,255,255,${0.15 + next() * 0.3})`);
    l.restore();
  }
  lay(4);
  return texture(canvas, keep);
}
/** A gas giant: bands of cream, amber and rust, with a pale storm. */
function giantSkin(keep: Keep) {
  const [canvas, c] = canvasOf(512, 512),
    next = sequence(9),
    colours = ["#e6c08a", "#c98b4f", "#b0643a", "#e8d0a4", "#a85a36", "#d9a066", "#f0dcb4"];
  let y = 0;
  while (y < 512) {
    const h = 8 + next() * 34;
    c.fillStyle = colours[Math.floor(next() * colours.length)];
    c.fillRect(0, y, 512, h + 1);
    y += h;
  }
  // Soften the bands, then a storm.
  c.globalAlpha = 0.5;
  c.drawImage(canvas, 0, 3);
  c.drawImage(canvas, 0, -3);
  c.globalAlpha = 1;
  const g = c.createRadialGradient(330, 320, 0, 330, 320, 34);
  g.addColorStop(0, "rgba(250,230,205,0.95)");
  g.addColorStop(1, "rgba(200,120,80,0)");
  c.save();
  c.translate(330, 320);
  c.scale(1.8, 0.8);
  c.translate(-330, -320);
  c.fillStyle = g;
  c.fillRect(260, 280, 140, 80);
  c.restore();
  return texture(canvas, keep);
}
/** The rings of the giant: thin bands of ice and dust, as a picture laid on a flat ring. */
function ringSkin(keep: Keep) {
  const [canvas, c] = canvasOf(512, 512),
    next = sequence(21);
  for (let r = 256; r > 140; r -= 1 + next() * 3) {
    c.strokeStyle = `rgba(${225 + next() * 30 | 0},${200 + next() * 40 | 0},${160 + next() * 50 | 0},${next() < 0.15 ? 0.05 : 0.25 + next() * 0.5})`;
    c.lineWidth = 2 + next() * 3;
    c.beginPath();
    c.arc(256, 256, r, 0, Math.PI * 2);
    c.stroke();
  }
  return texture(canvas, keep);
}
/** Two far worlds with their glow (`glows`: and a far sun): a blue ocean world and a ringed giant. Returns what turns slowly. */
export function worlds(scene: T.Scene, keep: Keep, glows = true) {
  const turning: T.Object3D[] = [],
    // Without the glows (drawn by the processor alone) the worlds are lit the cheap way too.
    lit = ({ roughness, ...rest }: T.MeshStandardMaterialParameters) => (glows ? new T.MeshStandardMaterial({ roughness, ...rest }) : new T.MeshLambertMaterial(rest as T.MeshLambertMaterialParameters));
  const halo = (color: string) =>
    keep(
      new T.SpriteMaterial({
        map: glowTexture(keep, [
          [0, "rgba(0,0,0,0)"],
          [0.7, "rgba(0,0,0,0)"],
          [0.765, color],
          [1, "rgba(0,0,0,0)"],
        ]),
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    );
  // The ocean world, below and to the left, with a thin blue air round it.
  const ocean = new T.Mesh(
    keep(new T.SphereGeometry(5, 48, 32)),
    keep(lit({ map: oceanSkin(keep), roughness: 0.75, emissive: "#0b1a33", emissiveIntensity: 0.7 })),
  );
  ocean.position.set(-11, -9, -9);
  ocean.rotation.z = 0.35;
  const air = new T.Sprite(halo("rgba(110,170,255,0.75)"));
  air.scale.setScalar(5 * 2.6);
  air.position.copy(ocean.position);
  scene.add(ocean);
  if (glows) scene.add(air);
  turning.push(ocean);
  // The giant, below and to the right, its rings tilted toward us.
  const giant = new T.Mesh(
    keep(new T.SphereGeometry(3.2, 48, 32)),
    keep(lit({ map: giantSkin(keep), roughness: 0.85, emissive: "#2a1408", emissiveIntensity: 0.55 })),
  );
  giant.position.set(12, -12, 2);
  giant.rotation.z = -0.3;
  const rings = new T.Mesh(
    keep(new T.RingGeometry(3.2 * 1.35, 3.2 * 2.25, 96, 1)),
    keep(new T.MeshBasicMaterial({ map: ringSkin(keep), transparent: true, side: T.DoubleSide, depthWrite: false, color: "#b9a588" })),
  );
  rings.position.copy(giant.position);
  rings.rotation.set(-1.15, 0.25, -0.3);
  const glow = new T.Sprite(halo("rgba(255,170,110,0.55)"));
  glow.scale.setScalar(3.2 * 2.6);
  glow.position.copy(giant.position);
  scene.add(giant, rings);
  if (glows) scene.add(glow);
  turning.push(giant);
  // A far sun, where the light comes from.
  const sun = new T.Sprite(
    keep(
      new T.SpriteMaterial({
        map: glowTexture(keep, [
          [0, "rgba(255,250,235,1)"],
          [0.08, "rgba(255,236,200,0.9)"],
          [0.3, "rgba(255,190,140,0.25)"],
          [1, "rgba(0,0,0,0)"],
        ]),
        transparent: true,
        depthWrite: false,
        blending: T.AdditiveBlending,
      }),
    ),
  );
  sun.scale.setScalar(9);
  sun.position.set(-17, -15, -24);
  if (glows) scene.add(sun);
  return turning;
}
