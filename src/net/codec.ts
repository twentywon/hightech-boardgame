/**
 * Byte codecs for the pairing codes: base45 (RFC 9285), whose 45 letters are exactly the alphanumeric set a QR code
 * packs at 5.5 bits a letter, and base64url for anything else. Free of the page and of Three.js.
 */
const B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function toBase45(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      let n = bytes[i] * 256 + bytes[i + 1];
      const c = n % 45;
      n = (n - c) / 45;
      const d = n % 45;
      const e = (n - d) / 45;
      out += B45[c] + B45[d] + B45[e];
    } else {
      const n = bytes[i];
      out += B45[n % 45] + B45[Math.floor(n / 45)];
    }
  }
  return out;
}

/** The bytes of a base45 text, or null when it is not one. */
export function fromBase45(text: string): Uint8Array | null {
  if (text.length % 3 === 1) return null;
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 3) {
    const c = B45.indexOf(text[i]),
      d = B45.indexOf(text[i + 1]);
    if (c < 0 || d < 0) return null;
    if (i + 2 < text.length) {
      const e = B45.indexOf(text[i + 2]);
      if (e < 0) return null;
      const n = c + d * 45 + e * 2025;
      if (n > 0xffff) return null;
      out.push(n >> 8, n & 255);
    } else {
      const n = c + d * 45;
      if (n > 255) return null;
      out.push(n);
    }
  }
  return Uint8Array.from(out);
}

export function toBase64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array | null {
  try {
    const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** deflate-raw where the platform has `CompressionStream`, else null (the caller keeps the bytes as they are). */
export async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}

export async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === "undefined") return null;
  try {
    const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    return null;
  }
}
