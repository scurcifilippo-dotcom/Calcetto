const assert=require('node:assert/strict');
const {chromium}=require('playwright');
const {createServer}=require('node:http');
const {mkdtemp,readFile,rm}=require('node:fs/promises');
const {tmpdir}=require('node:os');
const path=require('node:path');
async function run(){
  const dir=await mkdtemp(path.join(tmpdir(),'calcetto-browser-download-'));
  // Minimal reproduction independent of the application. Do not disable
  // browser policies to make this pass; report the environment limitation.
  const server=createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(`<!doctype html><button id="save">Download</button><script>document.getElementById('save').onclick=()=>{const u=URL.createObjectURL(new Blob(['{}'],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download='fixture.json';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);};</script>`);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    for(let attempt=0;attempt<2;attempt++){
      let context;
      try{
        context=await chromium.launchPersistentContext(path.join(dir,'profile'),{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox'],acceptDownloads:true});
        const page=context.pages()[0];page.setDefaultTimeout(10000);
        await page.goto(`http://127.0.0.1:${server.address().port}`);await context.setOffline(true);
        const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Download',exact:true}).click()]);
        assert.equal(await download.failure(),null);assert.equal(await readFile(await download.path(),'utf8'),'{}');
        console.log(`PASS: minimal JSON download ${attempt===0?'before':'after'} browser restart.`);
      }finally{if(context)await context.close();}
    }
  }finally{await new Promise(resolve=>server.close(resolve));await rm(dir,{recursive:true,force:true});}
}
run().catch(error=>{console.error('BLOCKED: browser download/restart diagnostic failed independently of Calcetto. '+error.message);process.exitCode=1;});
