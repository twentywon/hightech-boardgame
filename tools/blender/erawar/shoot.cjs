// node shoot.cjs <port> <query> <out.png> [w h] — a picture of the lineup page.
const { chromium } = require("playwright");
(async () => {
  const [port, query, out, w = "1280", h = "800"] = process.argv.slice(2);
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const p = await b.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +(process.env.DPR || 2) });
  const errors = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(`http://127.0.0.1:${port}/tools/blender/erawar/lineup.html?${query}`);
  await p.waitForFunction(() => document.title === "ready", null, { timeout: 300000 });
  await p.waitForTimeout(Number(process.env.SETTLE || 1500));
  await p.screenshot({ path: out, timeout: 300000 });
  console.log(out, "errors", JSON.stringify(errors));
  await b.close();
})();
