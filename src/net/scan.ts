import { readQr } from "./qr";

/**
 * Reading a pairing QR code with the camera: `BarcodeDetector` where the browser has one (Chrome on Android), else
 * the bundled jsQR on frames drawn into a canvas. The camera needs a secure context: https (GitHub Pages),
 * localhost, and in Chrome also a page opened from a file (file:// counts as secure there: measured, the camera is
 * asked for as usual), or the app's WebView once the person has allowed it. A page served by plain http from
 * another machine (a dev server on the LAN) has no camera: the code is then pasted.
 */
export function cameraProblem(): string | null {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia)
    return typeof isSecureContext !== "undefined" && !isSecureContext
      ? "https가 아닌 주소에서는 브라우저가 카메라를 막습니다. 코드를 복사해 붙여 넣어 주세요."
      : "이 브라우저에서는 카메라를 쓸 수 없습니다. 코드를 복사해 붙여 넣어 주세요.";
  return null;
}

interface Detector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare const BarcodeDetector: { new (options: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } | undefined;

/** Why the camera could not be used: none in this browser, refused by the person, none found, or another failure. */
export type CameraTrouble = "unsupported" | "denied" | "missing" | "broken";

/**
 * Starts the camera into `video` and reads frames until a code that `wanted` accepts is seen; `stop` ends it. A
 * failure is told in words for the paste fields of the QR way, and by its kind for a caller with other advice.
 */
export function scan(
  video: HTMLVideoElement,
  wanted: (text: string) => boolean,
  found: (text: string) => void,
  failed: (words: string, why: CameraTrouble) => void,
) {
  let stream: MediaStream | null = null,
    stopped = false,
    timer: ReturnType<typeof setTimeout> | null = null;
  const canvas = document.createElement("canvas"),
    ctx = canvas.getContext("2d", { willReadFrequently: true });
  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
    video.srcObject = null;
  };
  (async () => {
    const problem = cameraProblem();
    if (problem) return failed(problem, "unsupported");
    let detector: Detector | null = null;
    try {
      if (typeof BarcodeDetector !== "undefined" && (!BarcodeDetector.getSupportedFormats || (await BarcodeDetector.getSupportedFormats()).includes("qr_code")))
        detector = new BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      detector = null;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    } catch (error) {
      const name = (error as Error)?.name,
        why: CameraTrouble = name === "NotAllowedError" ? "denied" : name === "NotFoundError" ? "missing" : "broken";
      return failed(
        why === "denied"
          ? "카메라 사용이 허락되지 않았습니다. 코드를 붙여 넣거나 카메라를 허용해 주세요."
          : why === "missing"
            ? "이 기기에서 카메라를 찾지 못했습니다. 코드를 복사해 붙여 넣어 주세요."
            : "카메라를 켤 수 없습니다. 코드를 복사해 붙여 넣어 주세요.",
        why,
      );
    }
    if (stopped) return stop();
    video.srcObject = stream;
    video.setAttribute("playsinline", "");
    video.muted = true;
    await video.play().catch(() => {});
    const look = async () => {
      if (stopped) return;
      let text: string | null = null;
      if (video.readyState >= 2 && video.videoWidth) {
        try {
          if (detector) text = (await detector.detect(video)).map((c) => c.rawValue).find(wanted) ?? null;
          else if (ctx) {
            const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
            text = readQr(image.data, image.width, image.height);
          }
        } catch {
          text = null;
        }
      }
      if (text && wanted(text)) {
        stop();
        return found(text);
      }
      timer = setTimeout(look, detector ? 120 : 200);
    };
    look();
  })();
  return stop;
}
