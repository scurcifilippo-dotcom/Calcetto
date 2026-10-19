import { db, digest, account, type Account } from './store';
export class ApiError extends Error { constructor(public status:number, message:string) { super(message); } }
export function assert(condition:unknown, status:number, message:string): asserts condition { if (!condition) throw new ApiError(status,message); }
export const response = (body:unknown,status=200,extra:Record<string,string>={}) => Response.json(body,{status,headers:{'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer',...extra}});
export const configuredOrigin=()=>process.env.APP_URL || (process.env.VERCEL && process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
export function origin(): string {
  const configured = configuredOrigin();
  assert(configured,503,'Indirizzo pubblico non configurato (APP_URL).');
  const url = new URL(configured);
  assert(url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)),503,'APP_URL deve usare HTTPS.');
  assert(!url.username && !url.password && url.pathname==='/' && !url.search && !url.hash,503,'APP_URL deve contenere solo l’origine del sito.');
  return url.origin;
}
export function sameOrigin(request:Request) {
  assert(request.headers.get('origin')===origin(),403,'Richiesta da un’origine non autorizzata.');
}
export async function body(request:Request):Promise<Record<string,unknown>> {
  const limit=6*1024*1024;
  assert(request.headers.get('content-type')?.split(';')[0]==='application/json',415,'Formato richiesta non valido.');
  assert(Number(request.headers.get('content-length')||0)<=limit,413,'Allegato troppo grande.');
  const reader=request.body?.getReader(); assert(reader,400,'Richiesta vuota.');
  const chunks:Uint8Array[]=[]; let length=0;
  for (;;) { const item=await reader.read(); if(item.done) break; length+=item.value.length; if(length>limit){await reader.cancel();throw new ApiError(413,'Allegato troppo grande.');} chunks.push(item.value); }
  let parsed:unknown; try { parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400,'Richiesta non valida.'); }
  assert(parsed && typeof parsed==='object' && !Array.isArray(parsed),400,'Richiesta non valida.');
  return parsed as Record<string,unknown>;
}
export function currentUser(request:Request):Account|null {
  const raw=request.headers.get('cookie')?.match(/(?:^|;\s*)calcetto_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
  if(!raw) return null;
  const row=db().prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?').get(digest(raw),Date.now());
  return row?account(row):null;
}
export function requireUser(request:Request) { const user=currentUser(request); assert(user,401,'Accedi per continuare.');return user; }
export function requireAdmin(request:Request) { const user=requireUser(request);assert(user.isAdmin,403,'Operazione riservata agli amministratori.');return user; }
export function rateLimit(key:string,max=10,minutes=15) {
  db().prepare('DELETE FROM attempts WHERE expires<?').run(Date.now());
  const current=db().prepare('SELECT count FROM attempts WHERE key=?').get(key) as {count:number}|undefined;
  assert(!current || current.count<max,429,'Troppi tentativi. Riprova tra qualche minuto.');
  db().prepare('INSERT INTO attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,Date.now()+minutes*60000);
}
export async function handle(operation:()=>Promise<Response>|Response) {
  try { return await operation(); }
  catch(error) { if(error instanceof ApiError) return response({error:error.message},error.status); console.error('Calcetto API error:',error instanceof Error?error.name:'Unknown');return response({error:'Operazione non riuscita. Riprova.'},500); }
}
export function sessionCookie(raw:string,expires=14*86400) {
  return `calcetto_session=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${expires}${origin().startsWith('https:')?'; Secure':''}`;
}
