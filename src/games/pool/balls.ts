import * as T from "three";

/**
 * The balls' skins, painted pixel by pixel onto the sphere's own map (longitude across, latitude down) so that
 * nothing is stretched: a plain ball is its colour all over with a white number circle on two opposite sides; a
 * striped one is white with a band of its colour round the middle, the circles on the band. The cue ball is plain
 * white. Colours are the usual ones of pool balls; the figures are drawn here.
 */
export const BALL_COLORS = ["#f4f1e8", "#f0b81c", "#1f4fb0", "#cf2a1e", "#4b2a8e", "#ec6b1a", "#11734a", "#7c1d22", "#141518"];
/** How far round a number circle reaches from its middle, and the stripe's half height (as a sine of latitude). */
const CIRCLE = 0.36,
  STRIPE = 0.58;
const parse = (hex: string) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
/** A ball's colour: the plain balls 1–8 have their own; a stripe takes the colour of the ball eight below it. */
export const ballColor = (id: number) => BALL_COLORS[id === 0 ? 0 : id > 8 ? id - 8 : id];
export function ballTexture(id: number, width: number) {
  const height = width / 2,
    c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  const ctx = c.getContext("2d", { willReadFrequently: true })!,
    image = ctx.createImageData(width, height),
    white = parse(BALL_COLORS[0]),
    colour = parse(ballColor(id)),
    striped = id > 8,
    numbered = id > 0,
    // About a pixel of soft edge, measured on the sphere.
    soft = (Math.PI * 2) / width,
    cosCircle = Math.cos(CIRCLE);
  for (let j = 0; j < height; j++) {
    const theta = ((j + 0.5) / height) * Math.PI,
      y = Math.cos(theta),
      ring = Math.sin(theta);
    for (let i = 0; i < width; i++) {
      const phi = ((i + 0.5) / width) * Math.PI * 2,
        z = Math.sin(phi) * ring;
      // How much of the ball's own colour shows here (0 white, 1 colour).
      let paint = id === 0 ? 0 : 1;
      if (striped) paint = Math.max(0, Math.min(1, (Math.asin(STRIPE) - Math.abs(Math.asin(Math.max(-1, Math.min(1, y))))) / soft + 0.5));
      if (numbered) {
        // The circles face +z and −z (the map's quarter and three quarters across).
        const near = Math.acos(Math.min(1, Math.abs(z))),
          inCircle = Math.max(0, Math.min(1, (CIRCLE - near) / soft + 0.5));
        if (Math.abs(z) > cosCircle - 0.1) paint *= 1 - inCircle;
      }
      const k = (j * width + i) * 4;
      for (let ch = 0; ch < 3; ch++) image.data[k + ch] = Math.round(white[ch] + (colour[ch] - white[ch]) * paint);
      image.data[k + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  if (numbered) {
    // The numbers, upright with the north pole above them; 6 and 9 underlined.
    const size = Math.round(height * 0.29);
    ctx.fillStyle = "#16171a";
    ctx.font = `800 ${size}px "Helvetica Neue", Arial, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const u of [0.25, 0.75]) {
      const x = u * width,
        mid = height / 2 + size * 0.04;
      if (id >= 10) {
        // Two figures are squeezed a little to keep inside the circle.
        ctx.save();
        ctx.translate(x, mid);
        ctx.scale(0.82, 1);
        ctx.fillText(String(id), 0, 0);
        ctx.restore();
      } else ctx.fillText(String(id), x, mid);
      if (id === 6 || id === 9) ctx.fillRect(x - size * 0.22, mid + size * 0.42, size * 0.44, Math.max(1, size * 0.07));
    }
  }
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  t.anisotropy = width > 256 ? 4 : 1;
  return t;
}
/**
 * How a ball lies before it has rolled: one of its number circles turned up toward the eye (which looks from +x,
 * high), its figures upright as seen from there, give or take a little so that the rack does not look printed.
 */
export function restingTurn(id: number) {
  const up = new T.Vector3(0.5, 0.86, 0).normalize(),
    top = new T.Vector3(-0.86, 0.5, 0).normalize(),
    side = new T.Vector3().crossVectors(top, up),
    turn = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(side, top, up)),
    // A small turn of its own, the same for a ball every time.
    a = Math.sin(id * 12.9898) * 0.5,
    b = Math.sin(id * 78.233) * 0.25;
  return new T.Quaternion().setFromAxisAngle(up, a).multiply(new T.Quaternion().setFromAxisAngle(side, b)).multiply(turn);
}
