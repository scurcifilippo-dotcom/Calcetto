"use client";
import {useEffect,useRef,useState} from 'react';
import CalcettoApp from './calcetto-app';
import {type AppData} from '@/lib/model';
import {OFFLINE_KEY,readOffline,writeOffline,makeBackup,parseBackup,downloadFile} from '@/lib/offline';

export default function OfflineApp(){
  const [data,setData]=useState<AppData|null>(null),[error,setError]=useState(''),[backup,setBackup]=useState(false),[pending,setPending]=useState<AppData|null>(null),[reading,setReading]=useState(false);
  const [archiveVersion,setArchiveVersion]=useState(0);
  const baseline=useRef<string|null>(null),fileVersion=useRef(0);
  const load=()=>{try{const saved=readOffline();baseline.current=saved.raw;setData(saved.data);setError('');}catch(e){setBackup(true);setError((e as Error).message||'Il browser blocca l’archivio locale. Apri il file in Chrome o Edge fuori dalla navigazione privata.');}};
  useEffect(()=>{load();},[]);
  const persist=(next:AppData)=>{
    try{baseline.current=writeOffline(next,baseline.current);setData(next);setError('');return true;}
    catch(e){setError((e as Error).message);setBackup(true);return false;}
  };
  const exportBackup=()=>{if(data)downloadFile(makeBackup(data),`calcetto-backup-${new Date().toISOString().replace(/[:.]/g,'-')}.json`);};
  const importFile=async(file?:File)=>{
    const version=++fileVersion.current;setPending(null);setError('');
    if(!file){setReading(false);return;}
    if(file.size>20*1024*1024){setError('Il backup supera il limite di 20 MB.');setReading(false);return;}
    setReading(true);
    try{const next=parseBackup(await file.text());if(version===fileVersion.current)setPending(next);}
    catch(e){if(version===fileVersion.current)setError((e as Error).message);}
    finally{if(version===fileVersion.current)setReading(false);}
  };
  const restore=()=>{
    if(!pending)return;
    try{
      // Keep the exact archive being replaced, even if it could not be parsed.
      const previous=localStorage.getItem(OFFLINE_KEY);
      if(data && previous!==baseline.current)throw Error('L’archivio è cambiato in un’altra finestra. Riapri il file prima del ripristino.');
      if(previous!==null)downloadFile(previous,`calcetto-prima-del-ripristino-${Date.now()}.json`);
      baseline.current=writeOffline(pending,previous);setData(pending);setArchiveVersion(v=>v+1);setPending(null);setBackup(false);setError('');
    }catch(e){setError((e as Error).message);}
  };
  const close=()=>{fileVersion.current++;setReading(false);setPending(null);setBackup(false);};
  return <>
    {data ? <CalcettoApp key={archiveVersion} offline={{data,persist,openBackup:()=>setBackup(true)}}/> : <main className="auth-shell"><section className="auth-card"><span className="auth-brand">calcetto.</span><h1>Archivio offline</h1><p className="page-description">{error || 'Caricamento dei dati…'}</p>{error && <><button className="button secondary" onClick={load}>Riprova</button><button className="button primary" onClick={()=>setBackup(true)}>Ripristina backup</button></>}</section></main>}
    {(backup || (error && !data)) && <div className="dialog-backdrop"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title"><div className="dialog-header"><h2 id="backup-title" className="dialog-title">Backup e dati</h2>{data && <button className="icon-button" aria-label="Chiudi backup" onClick={close}>✕</button>}</div><div className="dialog-body">
      <p className="page-description">Le modifiche si salvano automaticamente nel browser di questo dispositivo. Per ritrovarle, riapri lo stesso file dalla stessa cartella con lo stesso browser e profilo.</p>
      <p className="field-hint">Il file HTML è il programma; il backup JSON contiene i tuoi dati. Esporta una copia dopo le partite e prima di spostare il file o cancellare i dati del browser. Usa una finestra normale, non privata.</p>
      {data && <button className="button primary" onClick={exportBackup}>Esporta backup JSON</button>}
      {!data && <button className="button secondary" onClick={()=>{try{const raw=localStorage.getItem(OFFLINE_KEY);if(raw!==null)downloadFile(raw,'calcetto-archivio-da-recuperare.json');}catch{setError('Il browser non consente di leggere l’archivio.');}}}>Esporta archivio da recuperare</button>}
      <label className="form-field offline-import"><span className="field-label">Importa un backup JSON</span><input type="file" accept=".json,application/json" aria-label="Importa backup JSON" onChange={e=>void importFile(e.target.files?.[0])}/></label>
      {reading && <p role="status">Lettura del backup…</p>}
      {pending && <div className="alert warning"><div><p>{pending.players.length} giocatori · {pending.seasons.length} stagioni · {pending.matches.length} partite.</p><p>Il ripristino sostituisce l’archivio attuale. Verrà scaricata una copia dei dati precedenti prima della sostituzione.</p><button className="button primary" onClick={restore}>Conferma ripristino</button><button className="button secondary" onClick={()=>setPending(null)}>Annulla ripristino</button></div></div>}
      {error && <p className="alert warning" role="alert">{error}</p>}
    </div><div className="dialog-footer">{data && <button className="button secondary" onClick={close}>Chiudi</button>}</div></section></div>}
  </>;
}
