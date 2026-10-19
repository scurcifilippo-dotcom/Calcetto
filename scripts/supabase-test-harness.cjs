// Local HTTP adapter for the Supabase RPC contract. Every action executes the real
// schema.sql on disposable PostgreSQL; this does not claim live Supabase access.
const {spawn,execFile}=require('node:child_process');
const {promisify}=require('node:util');
const exec=promisify(execFile);
const {createServer}=require('node:http');
const {readFile}=require('node:fs/promises');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
module.exports.create=async function(){
  const name=`calcetto-pg-test-${process.pid}`;
  const env={...process.env,DOCKER_CONFIG:process.env.DOCKER_CONFIG||'/workspace/.cache/docker'};
  let bridge;
  const pg=sql=>new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',name,'psql','-qAt','-U','postgres','-d','calcetto','-v','ON_ERROR_STOP=1'],{env,stdio:['pipe','pipe','pipe']});
    let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.on('error',reject);
    child.on('exit',code=>code===0?resolve(output.trim()):reject(new Error(error)));child.stdin.end(sql);
  });
  const close=async()=>{if(bridge)await new Promise(r=>bridge.close(r));await exec('docker',['rm','--force','--volumes',name],{env}).catch(()=>{});};
  try{
    await exec('docker',['run','--detach','--name',name,'--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','POSTGRES_DB=calcetto','postgres:17-bookworm'],{env});
    let ready=false;
    for(let i=0;i<100;i++){try{const logs=await exec('docker',['logs',name],{env});if(!logs.stdout.includes('PostgreSQL init process complete')){await wait(150);continue;}await exec('docker',['exec',name,'psql','-qAt','-U','postgres','-d','calcetto','-c','select 1'],{env});ready=true;break;}catch{await wait(150);}}
    if(!ready)throw Error('PostgreSQL fixture not ready');
    await pg('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
    const schema=await readFile('supabase/schema.sql','utf8');await pg(schema);await pg(schema); // Repeatability must preserve data.
    for(const role of ['anon','authenticated']) {
      await assert.rejects(pg(`set role ${role};select public.calcetto_rpc('backup');`),/permission denied/);
      await assert.rejects(pg(`set role ${role};select * from calcetto_private.users;`),/permission denied/);
    }
    const rpc=async(action,args={})=>JSON.parse(await pg(`set role service_role;select public.calcetto_rpc(${quote(action)},${quote(JSON.stringify(args))}::jsonb)::text;`));
    const marker='fixture-service-key';const calls=[];let bootstrapInvites; const schemaAgain=()=>pg(schema);
    bridge=createServer(async(req,res)=>{
      if(req.url!=='/rest/v1/rpc/calcetto_rpc'||req.headers.apikey!==marker){res.writeHead(403);res.end('{}');return;}
      let raw='';for await(const chunk of req)raw+=chunk;
      try{const {p_action,p_args}=JSON.parse(raw);const data=await rpc(p_action,p_args);calls.push({action:p_action,bytes:Buffer.byteLength(JSON.stringify(data))});res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data));}
      catch(error){console.error('PostgreSQL test fixture:',error.message);res.writeHead(500);res.end('{}');}
    });
    await new Promise(r=>bridge.listen(0,'127.0.0.1',r));
    return {
      schemaAgain,env:{SUPABASE_URL:`http://127.0.0.1:${bridge.address().port}`,SUPABASE_SERVICE_ROLE_KEY:marker},remote:true,rpc,calls,
      readState:async()=>JSON.parse(await pg('select data::text from calcetto_private.state where id=1;')),
      readRaw:()=>pg('select data::text from calcetto_private.state where id=1;'),
      writeRaw:async(data)=>{await pg(`update calcetto_private.state set data=${quote(JSON.stringify(data))}::jsonb,version=version+1 where id=1;`);},
      tokenHashes:async()=>JSON.parse(await pg("select coalesce(jsonb_agg(jsonb_build_object('hash',hash)),'[]')::text from calcetto_private.invites;")),
      createInvite:async(playerId,admin,kind='join',hours=72)=>{
        if(admin && kind==='join' && hours===72 && ['fiori','pippo'].includes(playerId)) {
          if(!bootstrapInvites){
            bootstrapInvites=['fiori','pippo','gigi','presidente'].map(playerId=>({playerId,token:crypto.randomBytes(32).toString('base64url'),id:crypto.randomUUID(),expires:Date.now()+72*3600000}));
            const result=await rpc('bootstrap',{invites:bootstrapInvites.map(({token,...invite})=>({...invite,hash:crypto.createHash('sha256').update(token).digest('hex')}))});assert.equal(result.ok,true);
          }
          return bootstrapInvites.find(invite=>invite.playerId===playerId);
        }
        const token=crypto.randomBytes(32).toString('base64url'),id=crypto.randomUUID(),expires=Date.now()+hours*3600000;
        await pg(`insert into calcetto_private.invites(id,hash,player_id,admin,kind,expires,created) values(${quote(id)},${quote(crypto.createHash('sha256').update(token).digest('hex'))},${quote(playerId)},${admin},${quote(kind)},${expires},${Date.now()});`);
        return {id,token,expires};
      },close,
    };
  }catch(error){await close();throw error;}
};
