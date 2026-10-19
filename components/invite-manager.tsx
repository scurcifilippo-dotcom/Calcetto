"use client";
import { useEffect, useState } from 'react';
import { api } from '@/lib/live';
import type { Player } from '@/lib/model';
type Invite={id:string;playerId:string;kind:string;expires:number};
type Member={playerId:string;isAdmin:boolean};
const adminIds=new Set(['fiori','pippo','gigi','presidente']);
export default function InviteManager({players,onClose}:{players:Player[];onClose:()=>void}) {
  const [invites,setInvites]=useState<Invite[]>([]),[users,setUsers]=useState<Member[]>([]);
  const [playerId,setPlayer]=useState(''),[admin,setAdmin]=useState(false),[url,setUrl]=useState('');
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[copied,setCopied]=useState(false);
  const [expires,setExpires]=useState(0);
  const refresh=async()=>{const result=await api('/api/invites');setInvites(result.invites);setUsers(result.users);};
  useEffect(()=>{refresh().catch(e=>setError(e.message));},[]);
  const make=async()=>{
    setBusy(true);setError('');setUrl('');setCopied(false);
    try {const result=await api('/api/invites',{method:'POST',body:JSON.stringify({playerId,isAdmin:admin,action:users.some(u=>u.playerId===playerId)?'reset':'create'})});setUrl(result.url);setExpires(result.expires);await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}
  };
  const revoke=async(id:string)=>{setBusy(true);try{await api('/api/invites',{method:'POST',body:JSON.stringify({action:'revoke',id})});setUrl('');await refresh();}catch(e){setError((e as Error).message);}finally{setBusy(false);}};
  return <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-label="Inviti al gruppo"><div className="dialog-header"><h2 className="dialog-title">Inviti al gruppo</h2><button className="button ghost small" onClick={onClose}>Chiudi</button></div><div className="dialog-body">
    <p className="page-description">Crea un link personale e condividilo in privato. Chi lo riceve potrà registrare l’account del giocatore scelto. Il link scade dopo 72 ore ed è utilizzabile una volta sola.</p>
    <label className="form-field"><span className="field-label">Giocatore da invitare</span><select className="form-select" value={playerId} onChange={e=>{setPlayer(e.target.value);setAdmin(adminIds.has(e.target.value));setUrl('');}}><option value="">Scegli un giocatore</option>{players.map(p=><option key={p.id} value={p.id}>{p.name}{users.some(u=>u.playerId===p.id)?' · Account attivo':''}</option>)}</select></label>
    {playerId && !users.some(u=>u.playerId===playerId) && <label className="field-hint"><input type="checkbox" checked={admin} onChange={e=>setAdmin(e.target.checked)} /> Accesso amministratore</label>}
    {playerId && users.some(u=>u.playerId===playerId) && <p className="field-hint">L’account esiste già. Puoi generare un link per cambiare la password; al suo utilizzo tutte le sessioni precedenti saranno chiuse.</p>}
    <button className="button primary" disabled={!playerId||busy} onClick={make}>{users.some(u=>u.playerId===playerId)?'Crea link recupero password':'Crea link di invito'}</button>
    {url && <div className="invite-result"><label className="form-field"><span className="field-label">Link personale</span><input className="form-input" readOnly value={url} aria-label="Link personale" onFocus={e=>e.target.select()} /></label><p className="field-hint">Scade: {new Date(expires).toLocaleString('it-IT')}. Un nuovo link per questo giocatore sostituisce quello precedente.</p><button className="button secondary" onClick={async()=>{try{await navigator.clipboard.writeText(url);setCopied(true);}catch{setError('Seleziona il link e copialo manualmente.');}}}>{copied?'Link copiato':'Copia link'}</button></div>}
    {error && <p className="alert warning" role="alert">{error}</p>}
    <h3>Inviti in attesa</h3>{!invites.length?<p className="field-hint">Nessun invito in attesa.</p>:invites.map(i=><div className="invite-row" key={i.id}><span>{players.find(p=>p.id===i.playerId)?.name} · {i.kind==='reset'?'Recupero':'Registrazione'}<small className="field-hint">Scade {new Date(i.expires).toLocaleString('it-IT')}</small></span><button className="button ghost small" disabled={busy} onClick={()=>revoke(i.id)}>Revoca</button></div>)}
  </div></section></div>;
}
