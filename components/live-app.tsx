"use client";
import { useEffect, useRef, useState } from 'react';
import CalcettoApp from './calcetto-app';
import InviteManager from './invite-manager';
import { api, type User } from '@/lib/live';
import { equalData, type AppData, type ChatMessage } from '@/lib/model';
type Change={collection:string;id:string;before:unknown;after:unknown};
function changes(previous:AppData,next:AppData):Change[] {
  return (['players','seasons','matches','messages'] as const).flatMap(collection=>next[collection].flatMap(after=>{
    const before=previous[collection].find(item=>item.id===after.id)||null;
    return equalData(before,after)?[]:[{collection,id:after.id,before,after}];
  }));
}
export default function LiveApp() {
  const [user,setUser]=useState<User|null>(null),[data,setData]=useState<AppData|null>(null),[loaded,setLoaded]=useState(false);
  const [error,setError]=useState(''),[status,setStatus]=useState('Dati aggiornati.'),[invites,setInvites]=useState(false);
  const [token,setToken]=useState(''),[invite,setInvite]=useState<{name:string;kind:string}|null>(null);
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[configured,setConfigured]=useState(true),[initialized,setInitialized]=useState(true);
  const state=useRef<AppData|null>(null),queue=useRef<{changes:Change[];resolve?:(saved:boolean)=>void}[]>([]),writing=useRef(false),alive=useRef(true),generation=useRef(0),etag=useRef<string|null>(null);
  const sync=(value:AppData)=>{state.current=value;setData(value);};
  const refresh=async()=>{const start=generation.current;const result=await api('/api/data',{headers:etag.current?{'If-None-Match':etag.current}:{}});if(!result.notModified && !writing.current && alive.current && start===generation.current){etag.current=result.etag||null;sync(result.data);}};
  useEffect(()=>{
    alive.current=true;
    const raw=new URLSearchParams(window.location.hash.slice(1)).get('invite')||'';
    if(raw){setToken(raw);window.history.replaceState(null,'',window.location.pathname);}
    (async()=>{
      try {
        const session=await api('/api/auth');setConfigured(session.configured);setInitialized(session.initialized);
        if(raw) {const result=await api('/api/auth',{method:'POST',body:JSON.stringify({action:'inspectInvite',token:raw})});setInvite(result.invite);}
        else if(session.user){setUser(session.user);await refresh();}
      }catch(e){setError((e as Error).message);}finally{setLoaded(true);}
    })();
    return()=>{alive.current=false;};
  },[]);
  useEffect(()=>{
    if(!user)return;
    let fetching=false;
    const tick=async()=>{if(fetching||writing.current||document.hidden)return;fetching=true;try{await refresh();setStatus('Dati aggiornati.');}catch{setStatus('Connessione interrotta. Riprovo automaticamente.');}finally{fetching=false;}};
    const timer=setInterval(tick,3000);window.addEventListener('focus',tick);
    return()=>{clearInterval(timer);window.removeEventListener('focus',tick);};
  },[user]);
  const drain=async()=>{
    if(writing.current)return;writing.current=true;setStatus('Salvataggio in corso…');setError('');
    try {
      while(queue.current.length){const batch=queue.current[0];const result=await api('/api/data',{method:'PATCH',body:JSON.stringify({changes:batch.changes})});queue.current.shift();batch.resolve?.(true);if(!queue.current.length){etag.current=result.etag||null;sync(result.data);}}
      setStatus('Modifiche salvate.');
    }catch(e){for(const batch of queue.current)batch.resolve?.(false);queue.current=[];setError(`Modifiche non salvate: ${(e as Error).message} Riapri l’elemento prima di riprovare.`);try{const result=await api('/api/data');sync(result.data);}catch{setError('Connessione interrotta: il salvataggio non è confermato. Ricarica la pagina prima di riprovare.');}}
    finally{writing.current=false;}
  };
  const persist=(next:AppData)=>{
    if(!state.current || error)return false;
    const batch=changes(state.current,next);if(!batch.length)return true;
    generation.current++;queue.current.push({changes:batch});sync(next);void drain();return true;
  };
  const send=(message:ChatMessage):Promise<boolean>=>new Promise(resolve=>{
    if(!state.current || error){resolve(false);return;}
    const next={...state.current,messages:[...state.current.messages,message]};
    generation.current++;queue.current.push({changes:changes(state.current,next),resolve});sync(next);void drain();
  });
  const login=async()=>{
    setBusy(true);setError('');
    try {const result=await api('/api/auth',{method:'POST',body:JSON.stringify({action:invite?'register':'login',token,email,password})});setToken('');setInvite(null);setPassword('');setUser(result.user);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const logout=async()=>{if(writing.current){setError('Attendi la fine del salvataggio prima di uscire.');return;}try{await api('/api/auth',{method:'POST',body:JSON.stringify({action:'logout'})});setUser(null);state.current=null;etag.current=null;setData(null);setError('');setInvites(false);}catch(e){setError((e as Error).message);}};
  if(user && data) return <><CalcettoApp live={{user,data,persist,send,logout,openInvites:()=>setInvites(true),status,error}} />{error && <button className="retry-sync button secondary" onClick={()=>{setError('');void refresh();}}>Ricarica dati</button>}{invites && user.isAdmin && <InviteManager players={data.players} onClose={()=>setInvites(false)} />}</>;
  return <main className="auth-shell"><section className="auth-card"><a className="auth-brand" href="/">calcetto.</a><h1>{!loaded?'Caricamento…':invite?.kind==='reset'?'Cambia password':invite?'Crea il tuo account':'Accedi al gruppo'}</h1>
    {invite && <p className="page-description">Account di <strong>{invite.name}</strong>. {invite.kind==='reset'?'Inserisci la tua email e scegli una nuova password.':'Inserisci la tua email e scegli una password personale.'}</p>}
    {!invite && loaded && <p className="page-description">Accesso riservato agli amici invitati. Per registrarti, apri il link personale ricevuto da un amministratore.</p>}
    {!configured && <p className="alert warning">Il sito deve ancora essere configurato con il suo indirizzo pubblico.</p>}
    {loaded && !initialized && !invite && <p className="field-hint">Il primo amministratore deve usare il link generato durante la configurazione del server.</p>}
    {loaded && <form onSubmit={e=>{e.preventDefault();void login();}}><label className="form-field"><span className="field-label">Email</span><input className="form-input" aria-label="Email" type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" maxLength={254}/></label><label className="form-field"><span className="field-label">Password</span><input className="form-input" aria-label="Password" type="password" required minLength={12} maxLength={256} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={invite?'new-password':'current-password'}/></label>{invite && <p className="field-hint">Almeno 12 caratteri. Il link è personale e utilizzabile una sola volta.</p>}<button className="button primary" disabled={busy || !configured || (!!token&&!invite)}>{busy?'Attendi…':invite?.kind==='reset'?'Salva nuova password':invite?'Crea account':'Accedi'}</button></form>}
    {error && <p className="alert warning" role="alert">{error}</p>}{!invite && loaded && <p className="field-hint">Password dimenticata? Chiedi un link di recupero a un amministratore.</p>}
  </section></main>;
}
