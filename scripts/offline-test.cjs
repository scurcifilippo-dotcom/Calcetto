const assert=require('node:assert/strict');
const {createServer}=require('node:http');
const {mkdtemp,mkdir,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const KEY='calcetto-offline-v1';
async function run(){
  const html=await readFile('artifacts/calcetto-offline.html');
  const directory=await mkdtemp(path.join(tmpdir(),'calcetto-offline-test-'));
  await mkdir(path.join(directory,'downloads'));
  // The managed Chromium policy forbids file://. Serve exactly the generated
  // HTML over loopback for tests; disconnect networking after each document load.
  const server=createServer((req,res)=>{if(req.url==='/calcetto-offline.html'){res.writeHead(200,{'Content-Type':'text/html;charset=utf-8'});res.end(html);}else{res.writeHead(404);res.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${server.address().port}/calcetto-offline.html`;
  let context;
  const requests=[],errors=[];
  const launch=async()=>{
    const downloadsPath=await mkdtemp(path.join(directory,'downloads-'));
    context=await chromium.launchPersistentContext(path.join(directory,'profile'),{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox'],viewport:{width:1440,height:1000},acceptDownloads:true,downloadsPath});
    context.on('request',req=>requests.push({url:req.url(),type:req.resourceType()}));
    const page=context.pages()[0]||await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));return page;
  };
  const open=async page=>{await context.setOffline(false);await page.goto(url);await page.getByRole('heading',{name:'Home',exact:true}).waitFor();await context.setOffline(true);};
  const nav=(page,name)=>page.getByRole('navigation',{name:'Navigazione principale',exact:true}).getByRole('button',{name:new RegExp('^'+name)}).click();
  const season=async(page,name)=>{await page.getByRole('button',{name:'Nuova stagione',exact:true}).first().click();const dialog=page.getByRole('dialog',{name:'Nuova stagione',exact:true});await dialog.getByLabel('Nome della stagione').fill(name);await dialog.getByRole('button',{name:'Crea stagione',exact:true}).click();};
  const raw=page=>page.evaluate(key=>localStorage.getItem(key),KEY);
  const backup=page=>page.getByRole('button',{name:'Backup e dati',exact:true}).click();
  const importBackup=(page,data)=>page.getByLabel('Importa backup JSON').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(typeof data==='string'?data:JSON.stringify(data))});
  const download=async(page,name)=>{const event=page.waitForEvent('download');await page.getByRole('button',{name,exact:true}).click();const file=await event;assert.equal(await file.failure(),null);return readFile(await file.path(),'utf8');};
  try{
    let page=await launch();await open(page);
    assert.equal(await page.getByRole('button',{name:'Inviti',exact:true}).count(),0);
    assert.equal(await page.getByLabel('Vista anteprima').count(),0);
    assert.equal(await page.getByRole('navigation').getByRole('button',{name:'Chat',exact:true}).count(),0);
    await season(page,'2026/27');
    await nav(page,'Giocatori');await page.getByRole('button',{name:'Nuovo giocatore',exact:true}).click();
    await page.getByRole('dialog').getByLabel('Nome del giocatore').fill('Amico offline');
    await page.getByRole('dialog').locator('select[name=role]').selectOption('Attaccante');
    await page.getByRole('dialog').getByRole('button',{name:'Aggiungi giocatore',exact:true}).click();
    await page.getByRole('heading',{name:'Amico offline',exact:true}).waitFor();
    await page.locator('.player-card').filter({has:page.getByRole('heading',{name:'Fiori',exact:true})}).click();
    await page.getByRole('dialog').getByRole('combobox').selectOption('Centrocampista');
    await page.getByRole('button',{name:'Usa icona 👑',exact:true}).click();
    await page.getByRole('button',{name:'Salva profilo',exact:true}).click();
    await nav(page,'Home');await page.getByRole('button',{name:'Nuova partita',exact:true}).click();
    let dialog=page.getByRole('dialog',{name:'Nuova partita',exact:true});
    await dialog.getByLabel('Data',{exact:true}).fill('2026-10-19');await dialog.getByLabel('Ora',{exact:true}).fill('21:00');await dialog.getByLabel('Campo',{exact:true}).fill('Campo offline');
    const names=['Trieu','Egor','Pippo','Pujia','Presidente','Adriano','Tiziano','Lele','Buba','Fiori'];
    for(const name of names)await dialog.getByRole('button',{name:`Seleziona ${name}`,exact:true}).click();
    await dialog.getByRole('button',{name:'Crea partita',exact:true}).click();
    dialog=page.getByRole('dialog',{name:'La partita',exact:true});await dialog.getByRole('button',{name:/^Squadre e voti/}).click();
    await dialog.getByLabel('Gol di Fiori',{exact:true}).fill('2');await dialog.getByLabel('Voto di Fiori',{exact:true}).selectOption('7.5');
    await dialog.getByLabel('Risultato squadra B',{exact:true}).fill('2');await dialog.getByRole('combobox',{name:/MVP della partita/}).selectOption('fiori');
    await dialog.getByRole('button',{name:'Concludi partita',exact:true}).click();
    await nav(page,'Statistiche');
    let row=page.locator('.stats-table tbody tr').filter({has:page.getByText('Fiori',{exact:true})});
    assert.deepEqual(await row.locator('td').evaluateAll(c=>c.slice(2).map(x=>x.textContent.trim())),['1','2','7,5','1']);
    row=page.locator('.stats-table tbody tr').filter({has:page.getByText('Trieu',{exact:true})});
    assert.deepEqual(await row.locator('td').evaluateAll(c=>c.slice(2).map(x=>x.textContent.trim())),['1','0','—','0']);
    const original=await raw(page);assert(original);assert.equal(JSON.parse(original).players.length,16);
    await backup(page);const exported=await download(page,'Esporta backup JSON');assert.deepEqual(JSON.parse(exported).data,JSON.parse(original));
    await page.getByRole('button',{name:'Chiudi backup',exact:true}).click();
    console.log('PASS: offline season/player/profile/result entry, 5v5 completion, goals, half-point ratings, unrated attendance and MVP.');
    await backup(page);await importBackup(page,'{"invalid":true}');await page.getByRole('alert').filter({hasText:'non validi'}).waitFor();assert.equal(await raw(page),original);
    await importBackup(page,exported);await page.getByRole('button',{name:'Annulla ripristino',exact:true}).click();assert.equal(await raw(page),original);
    const altered=JSON.parse(exported);altered.data.seasons.push({id:'second-season',name:'2027/28'});
    altered.data.matches.push({...structuredClone(altered.data.matches[0]),id:'second-match',seasonId:'second-season',mvpId:null,appearances:altered.data.matches[0].appearances.map(a=>a.playerId==='fiori'?{...a,goals:1,rating:8.5}:a),scoreB:1});
    await importBackup(page,altered);
    const [safety]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Conferma ripristino',exact:true}).click()]);
    assert.deepEqual(JSON.parse(await readFile(await safety.path(),'utf8')),JSON.parse(original));
    await nav(page,'Statistiche');row=page.locator('.stats-table tbody tr').filter({has:page.getByText('Fiori',{exact:true})});
    assert.deepEqual(await row.locator('td').evaluateAll(c=>c.slice(2).map(x=>x.textContent.trim())),['2','3','8,0','1']);
    await page.getByLabel('Filtra per stagione').selectOption('second-season');
    assert.deepEqual(await row.locator('td').evaluateAll(c=>c.slice(2).map(x=>x.textContent.trim())),['1','1','8,5','0']);
    console.log('PASS: invalid backups rejected, cancellation preserves archive, restoration creates safety download, overall and season statistics recalculate.');
    await nav(page,'Home');
    // A rejected storage write must never appear as a successful saved season.
    const beforeQuota=await raw(page);
    await page.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='calcetto-offline-v1')throw new DOMException('Fixture quota','QuotaExceededError');return window.originalSetItem.call(this,k,v);};});
    await season(page,'Must not be saved');await page.getByRole('alert').filter({hasText:'Salvataggio non riuscito'}).waitFor();assert.equal(await raw(page),beforeQuota);
    assert.equal(JSON.parse(await raw(page)).seasons.length,2);
    await page.getByRole('button',{name:'Chiudi backup',exact:true}).click();
    await page.evaluate(()=>{Storage.prototype.setItem=window.originalSetItem;});
    await page.getByRole('dialog',{name:'Nuova stagione',exact:true}).getByRole('button',{name:'Annulla',exact:true}).click();
    // Simulate an edit by another window after this one loaded its snapshot.
    await page.evaluate(key=>{const data=JSON.parse(localStorage.getItem(key));data.seasons.push({id:'other-window',name:'Altra finestra'});localStorage.setItem(key,JSON.stringify(data));},KEY);
    await season(page,'Stale edit');await page.getByRole('alert').filter({hasText:'altra finestra'}).waitFor();assert.equal(JSON.parse(await raw(page)).seasons.length,3);
    console.log('PASS: failed storage writes and stale windows do not overwrite the saved archive.');
    // Corrupt saved content must be retained, not replaced with a blank group.
    await page.evaluate(key=>localStorage.setItem(key,'{broken archive'),KEY);
    await context.setOffline(false);await page.reload();await context.setOffline(true);
    await page.getByRole('dialog',{name:'Backup e dati',exact:true}).waitFor();assert.equal(await raw(page),'{broken archive');
    await importBackup(page,exported);const [damagedCopy]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Conferma ripristino',exact:true}).click()]);
    assert.equal(await readFile(await damagedCopy.path(),'utf8'),'{broken archive');
    await page.getByRole('heading',{name:'Home',exact:true}).waitFor();assert.deepEqual(JSON.parse(await raw(page)),JSON.parse(original));
    await context.close();context=null;
    page=await launch();await open(page);assert.equal(await raw(page),original,'All data survive full browser shutdown/restart');
    await nav(page,'Partite');assert.equal(await page.locator('.match-card').count(),1);await nav(page,'Statistiche');
    row=page.locator('.stats-table tbody tr').filter({has:page.getByText('Fiori',{exact:true})});assert.match(await row.innerText(),/7,5/);
    console.log('PASS: full browser shutdown/restart preserves all archive data and statistics.');
    // Downloading after a persistent Chromium restart is checked separately by
    // test:offline:downloads: it crashes this managed browser even without Calcetto.
    await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
    await page.screenshot({path:'artifacts/offline-mobile.png',fullPage:true});
    assert.deepEqual(errors,[],'No uncaught browser errors');
    assert(requests.every(r=>r.url===url && r.type==='document'),'No assets, fonts, APIs or third-party network requests');
    console.log('PASS: corrupt-archive recovery, mobile layout, zero API/external requests. Generated HTML tested via loopback transport; file:// is blocked by managed Chromium policy.');
  }finally{if(context)await context.close();await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
