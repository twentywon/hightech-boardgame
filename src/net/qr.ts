import qrcode from "qrcode-generator";
import jsQR from "jsqr";

/**
 * QR codes for pairing, made and read in the page with nothing fetched: made by qrcode-generator (Kazuhiko Arase,
 * MIT), read by jsQR (Cosmo Wolfe, Apache-2.0) where the browser has no `BarcodeDetector`. Both are bundled; their
 * notices are in `public/qr-license.txt`.
 */
const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]*$/;

/** The dark modules of the code for `text`, row by row (the smallest version that holds it, error correction M). */
export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, "M");
  qr.addData(text, ALPHANUMERIC.test(text) ? "Alphanumeric" : "Byte");
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

/** The code as an SVG picture: dark modules on white with the four-module quiet zone the standard asks for. */
export function qrSvg(text: string, label = "연결 QR 코드"): string {
  const modules = qrModules(text),
    n = modules.length,
    size = n + 8;
  let path = "";
  modules.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    }),
  );
  return `<svg class="net-qr" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}" shape-rendering="crispEdges" xmlns="http://www.w3.org/2000/svg"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}

/** Grey pixels (RGBA) of the code at `scale` pixels a module with its quiet zone, as a camera might see it straight on. */
export function qrPixels(text: string, scale = 4): { data: Uint8ClampedArray; width: number; height: number } {
  const modules = qrModules(text),
    n = modules.length + 8,
    width = n * scale,
    data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++)
    for (let x = 0; x < width; x++) {
      const r = Math.floor(y / scale) - 4,
        c = Math.floor(x / scale) - 4,
        dark = r >= 0 && c >= 0 && r < modules.length && c < modules.length && modules[r][c],
        i = (y * width + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = dark ? 0 : 255;
      data[i + 3] = 255;
    }
  return { data, width, height: width };
}

/** The text of a QR code in an image (RGBA pixels), or null. */
export function readQr(data: Uint8ClampedArray, width: number, height: number): string | null {
  return jsQR(data, width, height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}
