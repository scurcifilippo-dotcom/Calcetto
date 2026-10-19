import { EnvHttpProxyAgent, fetch as upstreamFetch } from 'undici';
import { createHash, randomBytes } from 'node:crypto';
import { ApiError, assert } from './http';
const supabaseAddress=()=>process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
export const remoteEnabled=()=>!!process.env.VERCEL || !!supabaseAddress();
const dispatcher=new EnvHttpProxyAgent();
export const secretToken=()=>randomBytes(32).toString('base64url');
export const tokenDigest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const sessionHash=(request:Request)=>tokenDigest(request.headers.get('cookie')?.match(/(?:^|;\s*)calcetto_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1]||'');
export async function remoteCall<T=Record<string,unknown>>(action:string,args:Record<string,unknown>={}):Promise<T> {
  const address=supabaseAddress();
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const missing=[!address && 'SUPABASE_URL',!key && 'SUPABASE_SERVICE_ROLE_KEY'].filter(Boolean);
  assert(!missing.length,503,`Configurazione incompleta: ${missing.join(', ')}. Imposta le variabili in Vercel per Production e ripeti il deploy.`);
  assert(address && key,503,'Collegamento Supabase incompleto.');
  let url:URL;
  try { url=new URL(address); } catch { throw new ApiError(503,'SUPABASE_URL non valido: usa il Project URL di Supabase.'); }
  const local=!process.env.VERCEL && url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname) && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(process.env.APP_URL||'');
  assert((url.protocol==='https:' && /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) && !url.port)||local,503,'Indirizzo Supabase non valido.');
  assert(!url.username && !url.password && url.pathname==='/' && !url.search && !url.hash,503,'Usa soltanto il Project URL di Supabase.');
  const headers:Record<string,string>={'Content-Type':'application/json',apikey:key};
  // Legacy service_role JWTs need Authorization; new sb_secret keys authenticate through apikey.
  if(key.startsWith('eyJ')) headers.Authorization=`Bearer ${key}`;
  let result:Response;
  try {
    const endpoint=new URL('/rest/v1/rpc/calcetto_rpc',url);
    const options={method:'POST',headers,body:JSON.stringify({p_action:action,p_args:args}),signal:AbortSignal.timeout(12000)};
    result=local ? await fetch(endpoint,options) : await upstreamFetch(endpoint,{...options,dispatcher}) as unknown as Response;
  }catch{throw new ApiError(503,'Il database non risponde. Riprova tra poco.');}
  if(!result.ok){
    await result.body?.cancel();
    if(result.status===401||result.status===403)throw new ApiError(503,'Chiave server o permessi Supabase non corretti. Verifica SUPABASE_SERVICE_ROLE_KEY e lo schema SQL.');
    if(result.status===404)throw new ApiError(503,'Schema Supabase non disponibile: esegui supabase/schema.sql nel SQL Editor del progetto.');
    throw new ApiError(502,'Collegamento al database non riuscito. Riprova tra poco.');
  }
  let payload:unknown;try{payload=await result.json();}catch{throw new ApiError(502,'Risposta del database non valida.');}
  if(payload && typeof payload==='object' && 'error' in payload){
    const error=(payload as {error:{status:number;message:string}}).error;
    throw new ApiError([400,401,403,404,409,410,429].includes(error.status)?error.status:500,typeof error.message==='string'?error.message:'Operazione non riuscita.');
  }
  return payload as T;
}
