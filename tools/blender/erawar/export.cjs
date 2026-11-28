// node tools/blender/erawar/export.cjs <out dir> [port]  — with `npx vite --port <port>` running in the repo.
const { chromium } = require("playwright");
const fs = require("fs");
(async () => {
  const out = process.argv[2], port = process.argv[3] || "4320";
  fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage();
  p.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  await p.goto(`http://127.0.0.1:${port}/tools/blender/erawar/export.html`);
  await p.waitForFunction(() => document.title === "ready", null, { timeout: 120000 });
  for (let era = 0; era < 4; era++)
    for (let kind = 0; kind < 3; kind++) {
      const b64 = await p.evaluate(([e, k]) => window.exportKind(e, k), [era, kind]);
      fs.writeFileSync(`${out}/u${era}${kind}.glb`, Buffer.from(b64, "base64"));
      console.log("wrote", era, kind, Buffer.from(b64, "base64").length);
    }
  await b.close();
})();
