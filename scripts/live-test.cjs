const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {spawn,execFile}=require('node:child_process');
const exec=require('node:util').promisify(execFile);
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {build}=require('esbuild');
const {chromium}=require('playwright');
const {DatabaseSync}=require('node:sqlite');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function run(){
  const dir=await mkdtemp(path.join(tmpdir(),'calcetto-live-'));
  const port=Number(process.env.CALCETTO_TEST_PORT||(process.env.CALCETTO_TEST_REMOTE==='1'?3013:3012)),base=`http://127.0.0.1:${port}`;
  process.env.CALCETTO_DB_PATH=path.join(dir,'calcetto.sqlite');
  const bundle=await build({entryPoints:['lib/server/store.ts'],bundle:true,platform:'node',format:'esm',write:false});
  const store=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const driver=process.env.CALCETTO_TEST_REMOTE==='1'?await require('./supabase-test-harness.cjs').create():{
    ...store,env:{SUPABASE_URL:'',NEXT_PUBLIC_SUPABASE_URL:'',SUPABASE_SERVICE_ROLE_KEY:''},remote:false,
    readRaw:()=>store.db().prepare('SELECT body FROM state WHERE id=1').get().body,
    writeRaw:data=>store.db().prepare('UPDATE state SET body=? WHERE id=1').run(JSON.stringify(data)),
    tokenHashes:()=>store.db().prepare('SELECT hash FROM invites').all(),close:()=>store.db().close(),
  };
  const first=await driver.createInvite('fiori',true),secondAdmin=await driver.createInvite('pippo',true);
  const seed=structuredClone(await driver.readState());
  let server,browser,logs='';
  const start=async()=>{
    server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port',String(port)],{env:{...process.env,...driver.env,APP_URL:base,NEXT_TELEMETRY_DISABLED:'1'},stdio:['ignore','pipe','pipe']});
    server.stdout.on('data',b=>logs+=b);server.stderr.on('data',b=>logs+=b);
    for(let i=0;i<100;i++){try{if((await fetch(base+'/api/health')).ok)return;}catch{}if(server.exitCode!==null)throw Error('Server exited: '+logs);await sleep(150);}
    throw Error('Server not ready: '+logs);
  };
  const stop=async()=>{if(server&&server.exitCode===null&&!server.signalCode){const child=server;const done=new Promise(r=>child.once('exit',r));child.kill('SIGTERM');const timer=setTimeout(()=>child.kill('SIGKILL'),5000);await done;clearTimeout(timer);}};
  try{
    await start();console.log('CHECK: server started');
    assert.equal((await fetch(base+'/api/data')).status,401);
    assert.equal((await fetch(base+'/api/invites')).status,401);
    assert.equal((await fetch(base+'/api/gifs?q=calcio')).status,404);
    assert.equal((await fetch(base+'/api/auth',{method:'POST',headers:{'Content-Type':'application/json','Origin':'https://evil.example'},body:JSON.stringify({action:'login'})})).status,403);
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
    const admin=await browser.newContext({viewport:{width:1440,height:1000}}),member=await browser.newContext(),other=await browser.newContext();
    const page=await admin.newPage(),friend=await member.newPage();page.setDefaultTimeout(10000);friend.setDefaultTimeout(10000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));friend.on('pageerror',e=>errors.push(e.message));
    const request=async(context,route,body,method='POST')=>context.request.fetch(base+route,{method,headers:{Origin:base,'Content-Type':'application/json'},...(body?{data:JSON.stringify(body)}:{})});
    const register=async(page,raw,email)=>{
      await page.goto(base+'/#invite='+raw);
      await page.getByRole('heading',{name:'Crea il tuo account',exact:true}).waitFor();
      assert.equal(new URL(page.url()).hash,'','Token removed from location');
      await page.getByLabel('Email',{exact:true}).fill(email);
      await page.getByLabel('Password',{exact:true}).fill('Fixture-Only-Password-123!');
      await page.getByRole('button',{name:'Crea account',exact:true}).click();
      await page.getByRole('heading',{name:'Home',exact:true}).waitFor();
      assert.equal(await page.getByLabel('Vista anteprima').count(),0,'No impersonation selector');
    };
    await register(page,first.token,'fiori@example.test');
    if(driver.remote)assert.equal((await driver.rpc('bootstrap',{invites:[]})).error.status,409,'Bootstrap closes after first admin');
    let result=await request(admin,'/api/auth',{action:'register',token:first.token,email:'duplicate@example.test',password:'Fixture-Only-Password-123!'});assert.equal(result.status(),410,'Invite single use');
    await page.getByRole('button',{name:'Inviti',exact:true}).click();
    const dialog=page.getByRole('dialog',{name:'Inviti al gruppo'});
    await dialog.getByLabel('Giocatore da invitare').selectOption('trieu');
    await dialog.getByRole('button',{name:'Crea link di invito'}).click();
    await dialog.getByLabel('Link personale').waitFor();
    const inviteUrl=await dialog.getByLabel('Link personale').inputValue();
    assert.equal(new URL(inviteUrl).origin,base);
    await register(friend,new URLSearchParams(new URL(inviteUrl).hash.slice(1)).get('invite'),'trieu@example.test');
    await dialog.getByRole('button',{name:'Chiudi',exact:true}).click();
    result=await request(member,'/api/invites',{playerId:'egor'});assert.equal(result.status(),403);
    result=await request(admin,'/api/invites',{playerId:'egor'});const egorInvite=await result.json();
    result=await request(other,'/api/auth',{action:'register',token:new URLSearchParams(new URL(egorInvite.url).hash.slice(1)).get('invite'),email:'egor@example.test',password:'Fixture-Only-Password-123!'});assert.equal(result.status(),200);
    result=await request(admin,'/api/invites',{playerId:'gigi',isAdmin:true});const revoked=await result.json();
    await request(admin,'/api/invites',{action:'revoke',id:revoked.id});
    result=await request(admin,'/api/auth',{action:'inspectInvite',token:new URLSearchParams(new URL(revoked.url).hash.slice(1)).get('invite')});assert.equal(result.status(),410);
    const expired=await driver.createInvite('presidente',true,'join',-1);
    result=await request(admin,'/api/auth',{action:'inspectInvite',token:expired.token});assert.equal(result.status(),410);
    await page.getByRole('button',{name:'Nuova stagione',exact:true}).click();
    await page.getByRole('dialog').getByRole('textbox').fill('Stagione condivisa');
    await page.getByRole('dialog').getByRole('button',{name:'Crea stagione',exact:true}).click();
    await page.getByRole('button',{name:'Nuova partita',exact:true}).click();
    const match=page.getByRole('dialog');
    await match.locator('input[name=date]').fill('2026-10-25');await match.locator('input[name=time]').fill('21:00');await match.locator('input[name=venue]').fill('Campo test');
    const ids=['trieu','egor','pippo','pujia','presidente','adriano','tiziano','lele','buba','fiori'];
    for(const id of ids)await match.getByRole('button',{name:`Seleziona ${seed.players.find(p=>p.id===id).name}`,exact:true}).click();
    await match.getByRole('button',{name:'Crea partita',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Chiudi finestra'}).click();
    await friend.getByRole('navigation',{name:'Navigazione principale',exact:true}).getByRole('button',{name:'Partite',exact:true}).click();
    await friend.locator('.match-card').waitFor();await friend.locator('.match-card').click();
    const confirmed=friend.waitForResponse(r=>new URL(r.url()).pathname==='/api/data' && r.request().method()==='PATCH');
    await friend.getByRole('button',{name:'Sono disponibile',exact:true}).click();
    const confirmation=await confirmed;assert.equal(confirmation.status(),200,(await confirmation.json()).error||'Confirmation saved');
    await friend.getByRole('button',{name:'Ritira disponibilità',exact:true}).waitFor();
    await friend.getByRole('dialog').getByRole('button',{name:'Chiudi finestra'}).click();
    let data=(await (await admin.request.get(base+'/api/data')).json()).data;
    assert.equal(data.matches.length,1);assert(data.matches[0].availableIds.includes('trieu'));
    const patch=async(context,collection,before,after)=>request(context,'/api/data',{changes:[{collection,id:after.id,before,after}]},'PATCH');
    result=await patch(member,'seasons',null,{id:'forbidden',name:'Forbidden'});assert.equal(result.status(),403);
    result=await patch(member,'players',data.players.find(p=>p.id==='egor'),{...data.players.find(p=>p.id==='egor'),icon:'⭐'});assert.equal(result.status(),403);
    const own=data.players.find(p=>p.id==='trieu');
    result=await patch(member,'players',own,{...own,role:'Difensore',icon:'⭐'});assert.equal(result.status(),200);
    result=await patch(member,'players',{...own,role:'Difensore',icon:'⭐'},{...own,name:'Impersonation'});assert.equal(result.status(),403);
    const old=data.matches[0];
    result=await patch(member,'matches',old,{...old,scoreA:99});assert.equal(result.status(),403);
    result=await patch(member,'matches',old,{...old,availableIds:['trieu','egor']});assert.equal(result.status(),403);
    // Both members use the same snapshot; their own confirmations must merge.
    await patch(member,'matches',old,{...old,availableIds:[]});
    await Promise.all([patch(member,'matches',{...old,availableIds:[]},{...old,availableIds:['trieu']}),patch(other,'matches',{...old,availableIds:[]},{...old,availableIds:['egor']})]);
    data=(await (await admin.request.get(base+'/api/data')).json()).data;
    assert.deepEqual(new Set(data.matches[0].availableIds),new Set(['trieu','egor']));
    // Stale admin snapshots cannot overwrite another edit.
    const season=data.seasons[0];
    assert.equal((await patch(admin,'seasons',season,{...season,name:'Nome aggiornato'})).status(),200);
    assert.equal((await patch(admin,'seasons',season,{...season,name:'Sovrascrittura'})).status(),409);
    // Text and stickers cross browser contexts; author and timestamp are controlled by server.
    await page.getByRole('navigation',{name:'Navigazione principale',exact:true}).getByRole('button',{name:'Chat',exact:true}).click();
    await friend.getByRole('navigation',{name:'Navigazione principale',exact:true}).getByRole('button',{name:'Chat',exact:true}).click();
    await page.getByLabel('Messaggio per il gruppo').fill('Ciao @Trieu, ci vediamo al campo');await page.getByRole('button',{name:'Invia messaggio'}).click();
    await friend.getByRole('article',{name:'Messaggio di Fiori'}).waitFor();
    await friend.getByLabel('Messaggio per il gruppo').fill('Confermato @Fiori');await friend.getByRole('button',{name:'Invia messaggio'}).click();
    await page.getByRole('article',{name:'Messaggio di Trieu'}).waitFor();
    assert.equal(await page.locator('.chat-mention').count(),2);
    await friend.getByRole('button',{name:'Scegli uno sticker'}).click();await friend.getByRole('button',{name:'Invia sticker: Gol',exact:true}).click();
    await page.getByLabel('Sticker: Gol',{exact:true}).waitFor();
    assert.equal(await page.locator('.chat-shell input[type=file], .chat-shell img').count(),0);
    for(const attachment of [{type:'gif',url:'https://media.giphy.com/media/example/giphy.gif'},{type:'gif',url:'data:image/gif;base64,R0lGODlh'},{type:'photo',url:'https://removed-media.example/photo.jpg'},{type:'sticker',stickerId:'gol',url:'https://removed-media.example/photo.jpg'}]) {
      result=await patch(member,'messages',null,{id:crypto.randomUUID(),authorId:'trieu',text:'Testo',createdAt:new Date().toISOString(),mentionIds:[],attachment});assert.equal(result.status(),400,'Media is rejected even with valid text');
    }
    result=await patch(admin,'messages',null,{id:'admin-media',authorId:'fiori',text:'Testo',createdAt:new Date().toISOString(),mentionIds:[],attachment:{type:'photo',url:'https://removed-media.example/photo.jpg'}});assert.equal(result.status(),400,'Admins cannot bypass media restrictions');
    result=await patch(member,'messages',null,{id:'hidden-photo',authorId:'trieu',text:'Testo',createdAt:new Date().toISOString(),mentionIds:[],photo:'data:image/png;base64,aW52YWxpZA=='});assert.equal(result.status(),400,'Unknown media fields are rejected');
    result=await patch(member,'messages',null,{id:'spoof',authorId:'fiori',text:'Fake',createdAt:new Date().toISOString(),mentionIds:[]});assert.equal(result.status(),403);
    console.log('CHECK: accounts, permissions, concurrency and chat passed');
    // Password reset is bearer-link based, preserves role/email, invalidates existing sessions.
    result=await request(admin,'/api/invites',{action:'reset',playerId:'trieu'});const reset=await result.json();
    const oldSession=(await member.cookies()).find(c=>c.name==='calcetto_session').value;
    result=await request(member,'/api/auth',{action:'register',token:new URLSearchParams(new URL(reset.url).hash.slice(1)).get('invite'),email:'trieu@example.test',password:'New-Fixture-Password-456!'});assert.equal(result.status(),200);
    result=await request(member,'/api/auth',{action:'login',email:'trieu@example.test',password:'Fixture-Only-Password-123!'});assert.equal(result.status(),401);
    assert.equal((await fetch(base+'/api/data',{headers:{Cookie:'calcetto_session='+oldSession}})).status,401,'Reset invalidates previous sessions');
    const good=await request(member,'/api/auth',{action:'login',email:'trieu@example.test',password:'New-Fixture-Password-456!'});assert.equal(good.status(),200);
    const session=await admin.request.get(base+'/api/auth');assert.equal((await session.json()).user.isAdmin,true);
    // Sports rules/statistics still checked server side.
    data=(await (await admin.request.get(base+'/api/data')).json()).data;
    const m=data.matches[0], completed={...m,status:'completed',availableIds:[],scoreA:1,scoreB:0,mvpId:'trieu',appearances:m.appearances.map((a,i)=>({...a,goals:i===0?1:0,rating:i===0?6.5:null}))};
    assert.equal((await patch(admin,'matches',m,{...completed,appearances:completed.appearances.slice(1)})).status(),400);
    assert.equal((await patch(admin,'matches',m,{...completed,appearances:completed.appearances.map((a,i)=>i? a:{...a,rating:6.3})})).status(),400);
    assert.equal((await patch(admin,'matches',m,completed)).status(),200);
    if(driver.remote){
      const file=path.join(dir,'backup.json');await exec(process.execPath,['scripts/backup.mjs',file],{env:{...process.env,...driver.env,APP_URL:base}});
      const backup=JSON.parse(await readFile(file,'utf8'));assert.deepEqual(backup.state.data,await driver.readState());assert.equal(backup.users.length,3);
      const current=await admin.request.get(base+'/api/data'),etag=current.headers().etag;assert(etag);
      const unchanged=await admin.request.get(base+'/api/data',{headers:{'If-None-Match':etag}});assert.equal(unchanged.status(),304);assert.equal((await unchanged.body()).length,0);
      const conditional=await driver.rpc('snapshot',{sessionHash:crypto.createHash('sha256').update((await admin.cookies()).find(c=>c.name==='calcetto_session').value).digest('hex'),ifVersion:etag.match(/(\d+)/)[1]});
      assert.equal(conditional.data,undefined,'Unchanged data not transferred from database');
    }else{
      await exec(process.execPath,['scripts/backup.mjs',path.join(dir,'backup.sqlite')],{env:{...process.env,...driver.env}});
      const backup=new DatabaseSync(path.join(dir,'backup.sqlite'),{readOnly:true});
      assert.deepEqual(JSON.parse(backup.prepare('SELECT body FROM state WHERE id=1').get().body),await driver.readState(),'Consistent backup includes all committed data');backup.close();
    }
    console.log('CHECK: scores, ratings, backups and conditional requests passed');
    // Simulate a database from the earlier version, before media were removed.
    const legacy=structuredClone(await driver.readState());
    legacy.messages.push({id:'old-uploaded-gif',authorId:'trieu',text:'Didascalia da conservare',createdAt:'2026-10-19T10:00:00Z',mentionIds:[],attachment:{type:'gif',url:'data:image/gif;base64,'+'A'.repeat(12000)}});
    legacy.messages.push({id:'old-photo-only',authorId:'fiori',text:'',createdAt:'2026-10-19T10:01:00Z',mentionIds:[],attachment:{type:'photo',url:'https://removed-media.example/photo.jpg'}});
    await driver.writeRaw(legacy);
    const cleaned=(await (await admin.request.get(base+'/api/data')).json()).data;
    assert(cleaned.messages.every(m=>!m.attachment || m.attachment.type==='sticker'));
    assert.equal(cleaned.messages.find(m=>m.id==='old-uploaded-gif').text,'Didascalia da conservare');
    assert.equal(cleaned.messages.find(m=>m.id==='old-photo-only').text,'Allegato rimosso');
    assert.deepEqual(cleaned.matches,legacy.matches);assert.deepEqual(cleaned.players,legacy.players);assert.deepEqual(cleaned.seasons,legacy.seasons);
    assert(!(await driver.readRaw()).includes('removed-media.example'),'Media removed from persistent payload');
    const beforeRestart=(await (await admin.request.get(base+'/api/data')).json()).data;
    console.log('CHECK: restarting server');await stop();await start();console.log('CHECK: server restarted');
    const restored=await admin.request.get(base+'/api/data');assert.equal(restored.status(),200);assert.deepEqual((await restored.json()).data,beforeRestart,'Accounts, sessions, matches and messages survive restart');
    await page.reload();await page.getByRole('heading',{name:'Home',exact:true}).waitFor();
    await page.getByRole('navigation',{name:'Navigazione principale',exact:true}).getByRole('button',{name:'Statistiche',exact:true}).click();
    const row=page.locator('.stats-table tbody tr').filter({has:page.getByText('Trieu',{exact:true})});assert.deepEqual(await row.locator('td').evaluateAll(cells=>cells.slice(2).map(c=>c.textContent.trim())),['1','1','6,5','1']);
    console.log('CHECK: persistence and statistics passed');
    // Profile photos are compacted before reaching the serverless request limit.
    await friend.getByRole('navigation',{name:'Navigazione principale',exact:true}).getByRole('button',{name:/^Giocatori/}).click();
    await friend.locator('.player-card').filter({has:friend.getByRole('heading',{name:'Trieu',exact:true})}).click();
    console.log('CHECK: profile opened');
    const png=await friend.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=600;canvas.height=600;
      const ctx=canvas.getContext('2d'),image=ctx.createImageData(600,600);
      for(let i=0;i<image.data.length;i+=4){image.data[i]=Math.random()*256;image.data[i+1]=Math.random()*256;image.data[i+2]=Math.random()*256;image.data[i+3]=255;}
      ctx.putImageData(image,0,0);return canvas.toDataURL('image/png').split(',')[1];
    });
    console.log('CHECK: photo fixture generated');
    await friend.getByRole('dialog').locator('input[type=file]').setInputFiles({name:'profilo.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
    const savedPhoto=friend.waitForResponse(r=>new URL(r.url()).pathname==='/api/data' && r.request().method()==='PATCH');
    await friend.getByRole('button',{name:'Salva profilo',exact:true}).click();
    console.log('CHECK: profile save clicked');
    assert.equal((await savedPhoto).status(),200,'Compacted profile photo accepted');
    const portrait=friend.locator('.player-card').filter({has:friend.getByRole('heading',{name:'Trieu',exact:true})}).locator('img');
    await portrait.waitFor();assert(await portrait.evaluate(async image=>{await image.decode();return image.naturalWidth<=320 && image.naturalHeight<=320;}));
    const compact=(await (await admin.request.get(base+'/api/data')).json()).data.players.find(p=>p.id==='trieu').photo;
    assert(compact.length<512*1024 && compact.length<png.length/2,'Profile payload reduced');
    if(driver.remote){const previous=await driver.readState();await driver.schemaAgain();assert.deepEqual(await driver.readState(),previous,'Reapplying schema preserves real data');}
    await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/live-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false,'Mobile width');
    assert.deepEqual(errors,[],'No browser errors');
    for(let i=0;i<10;i++)assert.equal((await request(admin,'/api/auth',{action:'login',email:'not-a-member@example.test',password:'Wrong-Fixture-Password-123!'})).status(),401);
    assert.equal((await request(admin,'/api/auth',{action:'login',email:'not-a-member@example.test',password:'Wrong-Fixture-Password-123!'})).status(),429,'Password guessing limited');
    assert.equal((await request(member,'/api/auth',{action:'logout'})).status(),200);
    assert.equal((await member.request.get(base+'/api/data')).status(),401,'Logout invalidates session');
    const rows=await driver.tokenHashes();assert(rows.every(r=>r.hash!==first.token && r.hash.length===64),'Only token digests retained');
    assert(!logs.includes(first.token) && !logs.includes(secondAdmin.token),'No invite tokens in server logs');
    console.log(`${driver.remote?'PostgreSQL with local Supabase RPC adapter':'SQLite'} backend verified.`);
    console.log('PASS: multi-user signup/login, server permissions, one-use/expired/revoked invitations, private links, profile ownership, optional confirmations merging concurrently, conflict protection, shared text chat/mentions/emoji stickers, media rejection and migration, password recovery/session revocation, guessing limits, consistent backup, 5v5 validation, statistics, mobile, restart persistence.');
  }finally{if(browser)await browser.close();await stop();await driver.close();await rm(dir,{recursive:true,force:true});}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
