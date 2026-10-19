import {build} from 'esbuild';
import {mkdir,writeFile} from 'node:fs/promises';
const result=await build({entryPoints:['offline/entry.tsx'],bundle:true,minify:true,write:false,outfile:'offline.js',format:'iife',jsx:'automatic',define:{'process.env.NODE_ENV':'"production"'}});
const script=result.outputFiles.find(f=>f.path.endsWith('.js')).text.replace(/<\/script/gi,'<\\/script');
const css=result.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'';
const html=`<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>Calcetto — Offline</title><style>${css}</style></head><body><div id="root"></div><script>${script}</script></body></html>`;
for(const directory of ['artifacts','public']){await mkdir(directory,{recursive:true});await writeFile(`${directory}/calcetto-offline.html`,html);}
console.log('Calcetto offline: artifacts/calcetto-offline.html e public/calcetto-offline.html. Nessuna dipendenza di rete.');
