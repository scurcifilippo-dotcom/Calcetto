const assert=require('node:assert/strict');
const {build}=require('esbuild');
const {Module}=require('node:module');
const {existsSync}=require('node:fs');
const {join}=require('node:path');
const {tmpdir}=require('node:os');
async function run(){
  const code=await build({entryPoints:['app/api/health/route.ts'],bundle:true,platform:'node',format:'cjs',write:false,plugins:[{name:'isolated-provider',setup(b){
    b.onResolve({filter:/^undici$/},()=>({path:'undici',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export class EnvHttpProxyAgent {} export const fetch=(...args)=>globalThis.fixtureFetch(...args);'}));
  }}]});
  const m=new Module('configuration-test',module);m.filename=join(process.cwd(),'artifacts/config-test.cjs');m.paths=module.paths;m._compile(code.outputFiles[0].text,m.filename);
  const names=['VERCEL','APP_URL','VERCEL_PROJECT_PRODUCTION_URL','SUPABASE_URL','NEXT_PUBLIC_SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY','CALCETTO_DB_PATH'];
  const saved=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  const forbidden=join(tmpdir(),`calcetto-no-local-db-${process.pid}.sqlite`);
  try{
    for(const name of names)delete process.env[name];
    process.env.VERCEL='1';process.env.APP_URL='https://calcetto-virid.vercel.app';process.env.CALCETTO_DB_PATH=forbidden;
    let r=await m.exports.GET(),data=await r.json();assert.equal(r.status,503);assert.match(data.error,/SUPABASE_URL.*SUPABASE_SERVICE_ROLE_KEY/);
    assert(!existsSync(forbidden),'Vercel must never create a local database');
    process.env.SUPABASE_URL='https://kqjvhtxwdctlmjuvvebh.supabase.co';
    r=await m.exports.GET();assert.equal(r.status,503);assert.match((await r.json()).error,/SUPABASE_SERVICE_ROLE_KEY/);
    process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY='public-fixture-key';
    r=await m.exports.GET();assert.equal(r.status,503,'Public keys are never accepted as a server secret');
    delete process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY='private-fixture-marker';
    process.env.SUPABASE_URL='not-a-url';
    r=await m.exports.GET();assert.equal(r.status,503);assert.match((await r.json()).error,/SUPABASE_URL/);
    process.env.SUPABASE_URL='https://kqjvhtxwdctlmjuvvebh.supabase.co';process.env.APP_URL='not-a-url';
    r=await m.exports.GET();assert.equal(r.status,503);assert.match((await r.json()).error,/APP_URL/);
    delete process.env.APP_URL;process.env.VERCEL_PROJECT_PRODUCTION_URL='calcetto-virid.vercel.app';
    globalThis.fixtureFetch=async(url,options)=>{assert.equal(url.hostname,'kqjvhtxwdctlmjuvvebh.supabase.co');assert.equal(options.headers.apikey,'private-fixture-marker');return Response.json({ok:true});};
    r=await m.exports.GET();assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
    delete process.env.SUPABASE_URL;process.env.NEXT_PUBLIC_SUPABASE_URL='https://kqjvhtxwdctlmjuvvebh.supabase.co';
    r=await m.exports.GET();assert.equal(r.status,200,'Public project URL alias is supported');
    for(const [status,pattern] of [[401,/chiave server/i],[403,/permessi/i],[404,/schema\.sql/]]){
      globalThis.fixtureFetch=async()=>new Response('{}',{status});r=await m.exports.GET();const payload=await r.json();assert.equal(r.status,503);assert.match(payload.error,pattern);assert(!JSON.stringify(payload).includes('private-fixture-marker'));
    }
    globalThis.fixtureFetch=async()=>Response.json({ok:false});r=await m.exports.GET();assert.equal(r.status,503,'An empty schema cannot pass health check');
    assert(!existsSync(forbidden));
    console.log('PASS: missing Vercel settings give actionable 503 errors; no SQLite fallback; malformed URLs, server key isolation, schema/auth failures and production-origin fallback verified. Provider transport mocked.');
  }finally{delete globalThis.fixtureFetch;for(const name of names){if(saved[name]===undefined)delete process.env[name];else process.env[name]=saved[name];}}
}
run().catch(e=>{console.error(e);process.exitCode=1;});
