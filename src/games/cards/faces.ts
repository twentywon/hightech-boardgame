import { roundRect } from "./table-view";

/**
 * The one deck every card game here plays with: English-pattern faces from
 * Wikimedia Commons (see public/cards-license.txt), inlined so no game needs
 * a network request, and one shared back.
 */
export const CARD = { width: 1, height: 1.5, pixels: [280, 420] as [number, number] };
const pictures = new Map<string, HTMLImageElement>();
const sources = import.meta.glob<string>("./faces/*.webp", {
  query: "?inline",
  import: "default",
  eager: true,
});
// Decoded once when the app loads, long before a table is opened.
if (typeof Image !== "undefined")
  for (const [path, url] of Object.entries(sources)) {
    const image = new Image();
    image.src = url;
    pictures.set(path.match(/(\w+)\.webp$/)![1], image);
  }
const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const SYMBOL = '"Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif';
// The pictures are pure white and saturated; this tone settles them on the felt.
const PAPER = "#dcd5c4";
/** Paints the face of `key` (rank then suit letter, such as "10D"). */
export function drawFace(ctx: CanvasRenderingContext2D, w: number, h: number, key: string) {
  const image = pictures.get(key);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  if (image?.complete && image.naturalWidth) ctx.drawImage(image, 0, 0, w, h);
  else {
    // A plain drawn face stands in for a picture that has not decoded.
    const suit = key.slice(-1),
      rank = key.slice(0, -1);
    ctx.fillStyle = suit === "H" || suit === "D" ? "#c8321f" : "#16181a";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const index = () => {
      ctx.font = `700 ${rank === "10" ? 70 : 82}px "Helvetica Neue", Arial, sans-serif`;
      ctx.fillText(rank, 54, 62);
      ctx.font = `64px ${SYMBOL}`;
      ctx.fillText(GLYPH[suit], 54, 138);
    };
    index();
    ctx.save();
    ctx.translate(w, h);
    ctx.rotate(Math.PI);
    index();
    ctx.restore();
    ctx.font = `160px ${SYMBOL}`;
    ctx.fillText(GLYPH[suit], w / 2 + 16, h / 2 + 10);
  }
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
}
/** Paints the shared card back. */
export function drawBack(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = "#22355c";
  roundRect(ctx, 16, 16, w - 32, h - 32, 14);
  ctx.fill();
  ctx.strokeStyle = "#c9ab62";
  ctx.lineWidth = 2;
  for (let i = -h; i < w + h; i += 28) {
    ctx.beginPath();
    ctx.moveTo(i, 16);
    ctx.lineTo(i + h, h - 16);
    ctx.moveTo(i + h, 16);
    ctx.lineTo(i, h - 16);
    ctx.stroke();
  }
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, 16);
  ctx.fillRect(0, h - 16, w, 16);
  ctx.fillRect(0, 0, 16, h);
  ctx.fillRect(w - 16, 0, 16, h);
}
