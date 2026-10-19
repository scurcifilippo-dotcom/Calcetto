import { build } from 'esbuild';
import { writeFile, mkdir } from 'node:fs/promises';
const args=process.argv.slice(2);
const requested=args.includes('--player')?[args[args.indexOf('--player')+1]]:['fiori','pippo','gigi','presidente'];
if(requested.some(name=>!name)) throw new Error('Uso: npm run admin:invite [-- --player pippo]');
const url=new URL(process.env.APP_URL||'');
if(url.protocol!=='https:' && !(url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname))) throw new Error('Imposta APP_URL con l’indirizzo HTTPS del sito.');
if(url.username || url.password || url.pathname!=='/' || url.search || url.hash) throw new Error('APP_URL deve contenere soltanto l’origine del sito.');
if(process.env.SUPABASE_URL) {
  const compiled=await build({entryPoints:['lib/server/supabase.ts'],bundle:true,platform:'node',format:'esm',packages:'external',write:false});
  const target=new URL('../data/admin-bootstrap.mjs',import.meta.url);
  await mkdir('data',{recursive:true,mode:0o700});await writeFile(target,compiled.outputFiles[0].text,{mode:0o600});
  const {remoteCall,secretToken,tokenDigest}=await import(target.href);
  const invites=requested.map(playerId=>({playerId,token:secretToken(),id:crypto.randomUUID(),expires:Date.now()+72*3600000}));
  await remoteCall('bootstrap',{invites:invites.map(({token,...invite})=>({...invite,hash:tokenDigest(token)}))});
  for(const invite of invites) {
    const path=`data/primo-accesso-${invite.playerId}.txt`;
    await writeFile(path,`Primo accesso amministratore: ${invite.playerId}\n${url.origin}/#invite=${invite.token}\nScadenza: ${new Date(invite.expires).toISOString()}\n`,{mode:0o600});
    console.log(`Invito creato per ${invite.playerId}. Leggi ${path} in privato, poi cancella il file.`);
  }
  process.exit(0);
}
const bundle=await build({entryPoints:['lib/server/store.ts'],bundle:true,platform:'node',format:'esm',write:false});
const store=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
if(store.db().prepare('SELECT id FROM users WHERE admin=1').get()) throw new Error('Un amministratore esiste già. Crea gli inviti dal sito.');
for(const name of requested) {
  const player=store.readState().players.find(p=>p.id===name || p.name.toLowerCase()===name.toLowerCase());
  if(!player) throw new Error('Giocatore non trovato. Usa un nome della lista.');
  const invite=store.createInvite(player.id,true);
  await mkdir('data',{recursive:true,mode:0o700});
  const path=`data/primo-accesso-${player.id}.txt`;
  await writeFile(path,`Primo accesso amministratore: ${player.name}\n${url.origin}/#invite=${invite.token}\nScadenza: ${new Date(invite.expires).toISOString()}\n`,{mode:0o600});
  console.log(`Invito amministratore creato per ${player.name}. Leggi ${path} in privato e cancella il file dopo l’utilizzo. Il token non viene stampato nei log.`);

}
