import type { AppData, ChatMessage } from './model';
export type User = {id:string;email:string;playerId:string;isAdmin:boolean};
export type LiveConnection = {data:AppData;user:User;persist:(next:AppData)=>boolean;send:(message:ChatMessage)=>Promise<boolean>;logout:()=>void;openInvites:()=>void;status:string;error:string};
export async function api(path:string,options:RequestInit={}) {
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...options.headers},cache:'no-store',signal:options.signal||AbortSignal.timeout(20000)});
  if(response.status===304)return {notModified:true};
  const result=await response.json();
  if(!response.ok) throw new Error(result.error||'Connessione non riuscita.');
  return path==='/api/data'?{...result,etag:response.headers.get('etag')}:result;
}
