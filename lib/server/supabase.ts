import { EnvHttpProxyAgent, fetch as upstreamFetch } from 'undici';
import { createHash, randomBytes } from 'node:crypto';
import { ApiError, assert } from './http';
export const remoteEnabled=()=>!!process.env.SUPABASE_URL;
const dispatcher=new EnvHttpProxyAgent();
export const secretToken=()=>randomBytes(32).toString('base64url');
export const tokenDigest=(value:string)=>createHash('sha256').update(value).digest('hex');
export const sessionHash=(request:Request)=>tokenDigest(request.headers.get('cookie')?.match(/(?:^|;\s*)calcetto_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1]||'');
export async function remoteCall<T=Record<string,unknown>>(action:string,args:Record<string,unknown>={}):Promise<T> {
  const address=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert(address && key,503,'Collegamento Supabase incompleto. Configura URL e chiave server.');
  const url=new URL(address);
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
  if(!result.ok){await result.body?.cancel();throw new ApiError(result.status===401||result.status===403?503:502,'Collegamento al database non riuscito. Verifica chiave server e schema SQL.');}
  let payload:unknown;try{payload=await result.json();}catch{throw new ApiError(502,'Risposta del database non valida.');}
  if(payload && typeof payload==='object' && 'error' in payload){
    const error=(payload as {error:{status:number;message:string}}).error;
    throw new ApiError([400,401,403,404,409,410,429].includes(error.status)?error.status:500,typeof error.message==='string'?error.message:'Operazione non riuscita.');
  }
  return payload as T;
}
