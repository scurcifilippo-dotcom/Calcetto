import { build } from "esbuild";
import { mkdir, writeFile } from "node:fs/promises";

const result = await build({
  entryPoints: ["preview/entry.tsx"],
  bundle: true,
  minify: true,
  write: false,
  outfile: "preview.js",
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const script = result.outputFiles.find((f) => f.path.endsWith(".js")).text.replace(/<\/script/gi, "<\\/script");
const css = result.outputFiles.find((f) => f.path.endsWith(".css"))?.text ?? "";
const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Calcetto — Anteprima interattiva</title><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/calcetto-anteprima.html", html);
await writeFile("artifacts/calcetto-anteprima-v5.html", html);
console.log("Anteprima autonoma generata in artifacts/calcetto-anteprima.html e artifacts/calcetto-anteprima-v5.html");
