import { remoteCall, sessionHash, secretToken, tokenDigest } from './supabase';
import { type Account } from './store';
import { assert, body, handle, origin, response, sameOrigin, sessionCookie, configuredOrigin, ApiError } from './http';
import { isAppData, removeChatMedia, type AppData } from '../model';
import { hash, verify, verifyDummy } from './passwords';
import { applyChanges } from './changes';
type Snapshot={user:Account|null;data?:AppData;version?:string;initialized:boolean};
async function readSnapshot(request:Request,ifVersion?:string):Promise<Snapshot> {
  for(let attempt=0;attempt<3;attempt++) {
    const data=await remoteCall<Snapshot>('snapshot',{sessionHash:sessionHash(request),ifVersion:attempt?undefined:ifVersion});
    if(!data.user || !data.data)return data;
    const cleaned=removeChatMedia(data.data);
    assert(isAppData(cleaned),503,'Dati condivisi non validi.');
    if(cleaned===data.data)return data;
    try {
      const result=await remoteCall<{version:string}>('state_write',{sessionHash:sessionHash(request),version:data.version,data:cleaned});
      return {...data,data:cleaned,version:result.version};
    }catch(error){if(!(error instanceof ApiError)||error.status!==409||attempt===2)throw error;}
  }
  throw new ApiError(409,'Dati aggiornati. Riprova.');
}
async function snapshot(request:Request,admin=false) {
  const data=await readSnapshot(request);
  assert(data.user,401,'Accedi per continuare.');assert(!admin||data.user.isAdmin,403,'Operazione riservata agli amministratori.');
  assert(isAppData(data.data),503,'Dati condivisi non validi.');return data as Snapshot&{user:Account;data:AppData;version:string};
}
const limit=async(key:string,max=10,minutes=15)=>{await remoteCall('rate',{key,max,minutes});};
export function authGet(request:Request){return handle(async()=>{
  const data=await remoteCall<Snapshot>('snapshot',{sessionHash:sessionHash(request),authOnly:true});
  return response({user:data.user,configured:!!configuredOrigin(),initialized:data.initialized});
});}
export function authPost(request:Request){return handle(async()=>{
  sameOrigin(request);const input=await body(request);
  if(input.action==='inspectInvite'){
    assert(typeof input.token==='string' && /^[A-Za-z0-9_-]{43}$/.test(input.token),404,'Invito non valido.');
    return response(await remoteCall('invite_inspect',{hash:tokenDigest(input.token)}));
  }
  if(input.action==='logout'){await remoteCall('logout',{sessionHash:sessionHash(request)});return response({ok:true},200,{'Set-Cookie':sessionCookie('',0)});}
  assert(input.action==='login'||input.action==='register',400,'Azione non valida.');
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  const password=typeof input.password==='string'?input.password:'';
  assert(email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),400,'Inserisci un’email valida.');
  assert(password.length>=12 && Buffer.byteLength(password)<=256,400,'Usa una password da 12 a 256 caratteri.');
  await limit(`auth:${email}`);await limit('auth:global',200);
  const raw=secretToken(),session={hash:tokenDigest(raw),expires:Date.now()+14*86400000};let user:Account;
  if(input.action==='login'){
    const record=await remoteCall<{user:Account&{password:string}|null}>('login_record',{email});
    const correct=record.user?await verify(password,record.user.password):await verifyDummy(password);
    assert(correct && record.user,401,'Email o password non corrette.');
    const {password:_password,...account}=record.user;user=account;
    await remoteCall('session_create',{userId:user.id,email,session});
  }else{
    assert(typeof input.token==='string' && /^[A-Za-z0-9_-]{43}$/.test(input.token),400,'Serve un invito valido.');
    const result=await remoteCall<{user:Account}>('register',{inviteHash:tokenDigest(input.token),email,password:await hash(password),session});user=result.user;
  }
  return response({user,origin:origin()},200,{'Set-Cookie':sessionCookie(raw)});
});}
export function dataGet(request:Request){return handle(async()=>{
  const previous=request.headers.get('if-none-match')?.match(/^"calcetto-(\d+)"$/)?.[1];
  const state=await readSnapshot(request,previous);
  assert(state.user,401,'Accedi per continuare.');
  const etag=`"calcetto-${state.version}"`;
  if(previous && previous===state.version)return new Response(null,{status:304,headers:{ETag:etag,'Cache-Control':'private, no-cache','Vary':'Cookie'}});
  assert(isAppData(state.data),503,'Dati condivisi non validi.');
  return response({data:state.data},200,{ETag:etag,Vary:'Cookie'});
});}
export function dataPatch(request:Request){return handle(async()=>{
  sameOrigin(request);const input=await body(request);let state=await snapshot(request);
  await limit(`write:${state.user.id}`,300,1);
  for(let attempt=0;attempt<3;attempt++){
    const next=applyChanges(structuredClone(state.data),structuredClone(input.changes),state.user);
    try{
      const result=await remoteCall<{version:string}>('state_write',{sessionHash:sessionHash(request),version:state.version,data:next});
      return response({data:next},200,{ETag:`"calcetto-${result.version}"`,Vary:'Cookie'});
    }catch(error){if(!(error instanceof ApiError)||error.status!==409||attempt===2)throw error;state=await snapshot(request);}
  }
  throw new ApiError(409,'Dati aggiornati da un altro utente. Riapri e riprova.');
});}
export function invitesGet(request:Request){return handle(async()=>response(await remoteCall('invites_list',{sessionHash:sessionHash(request)})));}
export function invitesPost(request:Request){return handle(async()=>{
  sameOrigin(request);const input=await body(request);const state=await snapshot(request,true);await limit(`invites:${state.user.id}`,40,60);
  if(input.action==='revoke'){assert(typeof input.id==='string',400,'Invito non valido.');return response(await remoteCall('invite_revoke',{sessionHash:sessionHash(request),id:input.id}));}
  assert(typeof input.playerId==='string' && state.data.players.some(p=>p.id===input.playerId),400,'Scegli un giocatore.');
  const base=origin(),raw=secretToken(),expires=Date.now()+72*3600000;
  const result=await remoteCall<{id:string}>('invite_create',{sessionHash:sessionHash(request),playerId:input.playerId,isAdmin:input.isAdmin===true,reset:input.action==='reset',hash:tokenDigest(raw),id:crypto.randomUUID(),expires});
  return response({id:result.id,url:`${base}/#invite=${raw}`,expires},201);
});}
export function cloudHealth(){return handle(async()=>{origin();const result=await remoteCall<{ok:boolean}>('ping');assert(result.ok===true,503,'Schema Supabase incompleto: esegui supabase/schema.sql nel SQL Editor.');return response({ok:true});});}
