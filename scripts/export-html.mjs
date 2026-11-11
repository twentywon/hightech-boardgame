import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";

// Export the pinned Vite build as one offline document, including its AI Workers.
// Refuse unknown loader formats rather than silently shipping broken Worker URLs.
const root = resolve("dist");
let html = await readFile(resolve(root, "index.html"), "utf8");
const script =
  /<script type="module" crossorigin src="\.\/([^\"]+)"><\/script>/;
const entry = html.match(script);
if (!entry) throw new Error("Expected one local Vite module entry");
let code = await readFile(resolve(root, entry[1]), "utf8");
const loader =
  /new URL\(new URL\(`(worker-[^`]+\.js)`,import\.meta\.url\)\.href,``\+import\.meta\.url\)/g;
const workers = new Map();
for (const match of code.matchAll(loader)) {
  if (!workers.has(match[1]))
    workers.set(match[1], {
      variable: `__WTG_INLINE_WORKER_${workers.size}__`,
      code: await readFile(resolve(root, dirname(entry[1]), match[1]), "utf8"),
    });
}
if (!workers.size) throw new Error("No recognized AI Worker loaders found");
code = code.replace(loader, (_, name) => workers.get(name).variable);
// A page opened from disk (file://) has an opaque origin, where browsers refuse
// to load a module Worker from a blob URL. The bundled Workers are
// self-contained, so start them as classic Workers, which do load there.
for (const [name, worker] of workers)
  if (/(^|[;}\n])\s*(import|export)[\s{*"'`(]|import\.meta/.test(worker.code))
    throw new Error(`Worker ${name} still uses module syntax`);
const moduleWorker =
  /new Worker\((__WTG_INLINE_WORKER_\d+__),\{type:[`'"]module[`'"]\}\)/g;
const started = code.match(moduleWorker)?.length ?? 0;
code = code.replace(moduleWorker, "new Worker($1)");
if (!started || /__WTG_INLINE_WORKER_\d+__,\{/.test(code))
  throw new Error("Unrecognized Worker constructor options");
if (code.includes("import.meta.url"))
  throw new Error("Unresolved module-relative resources");
const prefix = [...workers.values()]
  .map(
    (w) =>
      `const ${w.variable}=URL.createObjectURL(new Blob([${JSON.stringify(w.code)}],{type:'text/javascript'}));`,
  )
  .join("\n");
const inline = `<script type="module">${(prefix + "\n" + code).replace(/<\/script/gi, "<\\/script")}</script>`;
html = html.replace(script, () => inline);
const cssTag = /<link rel="stylesheet" crossorigin href="\.\/([^\"]+)">/g;
for (const match of html.matchAll(cssTag)) {
  const css = await readFile(resolve(root, match[1]), "utf8");
  html = html.replace(match[0], () => `<style>${css}</style>`);
}
// Third-party notices travel with the single file: chess.js and the hwatu images.
const notice = (
  await Promise.all(
    ["chess-license.txt", "hwatu-license.txt"].map((name) =>
      readFile(resolve(root, name), "utf8"),
    ),
  )
).join("\n\n");
html = html.replace("</body>", () => `<!-- ${notice.replaceAll("--", "—")} -->\n</body>`);
const target = resolve(root, "world-table-games.html");
await writeFile(target, html);
console.log(
  `Single HTML: ${target} (${Buffer.byteLength(html)} bytes, ${workers.size} embedded AI Workers)`,
);
