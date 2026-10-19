import { DatabaseSync, backup } from 'node:sqlite';
import { resolve, dirname } from 'node:path';
import { mkdir, chmod, writeFile } from 'node:fs/promises';
const source=resolve(process.env.CALCETTO_DB_PATH||'data/calcetto.sqlite');
const destination=process.argv[2] && resolve(process.argv[2]);
if(!destination || source===destination) throw new Error('Uso: npm run backup -- /percorso/backup.sqlite (diverso dal database attivo)');
await mkdir(dirname(destination),{recursive:true,mode:0o700});
if(process.env.SUPABASE_URL) {
  const {build}=await import('esbuild');
  const compiled=await build({entryPoints:['lib/server/supabase.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
  await mkdir('data',{recursive:true,mode:0o700});const modulePath=new URL('../data/backup-remote.mjs',import.meta.url);
  await writeFile(modulePath,compiled.outputFiles[0].text,{mode:0o600});
  const {remoteCall}=await import(modulePath.href);const result=await remoteCall('backup');
  await writeFile(destination,JSON.stringify(result),{mode:0o600});await chmod(destination,0o600);
  console.log('Backup Supabase privato completato. Conservalo fuori dal repository.');process.exit(0);
}
const db=new DatabaseSync(source,{readOnly:true});
try{await backup(db,destination);await chmod(destination,0o600);}finally{db.close();}
console.log('Backup coerente completato. Copialo fuori dal server in uno spazio privato.');
