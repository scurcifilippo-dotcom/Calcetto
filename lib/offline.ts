import {initialData,isAppData,type AppData} from './model';

export const OFFLINE_KEY='calcetto-offline-v1';
export const BACKUP_FORMAT='calcetto-offline-backup-v1';
export function readOffline(){
  let raw:string|null;
  try{raw=localStorage.getItem(OFFLINE_KEY);}catch{throw Error('Il browser blocca l’archivio locale. Apri il file in Chrome o Edge in una finestra normale, fuori dalla navigazione privata.');}
  if(raw===null)return {data:structuredClone(initialData),raw};
  let data:unknown;
  try{data=JSON.parse(raw);}catch{throw Error('L’archivio salvato non è leggibile. Non è stato sovrascritto: puoi esportarlo e ripristinare un backup.');}
  if(!isAppData(data))throw Error('L’archivio salvato non è valido. Non è stato sovrascritto: ripristina un backup valido.');
  return {data,raw};
}
export function writeOffline(data:AppData,expected:string|null){
  if(!isAppData(data))throw Error('Dati non validi: il salvataggio è stato annullato.');
  if(localStorage.getItem(OFFLINE_KEY)!==expected)throw Error('L’archivio è cambiato in un’altra finestra. Riapri il file prima di modificarlo.');
  const raw=JSON.stringify(data);
  try{localStorage.setItem(OFFLINE_KEY,raw);}catch{throw Error('Salvataggio non riuscito: memoria piena o archiviazione bloccata. La modifica non è stata applicata. Esporta un backup dei dati attuali.');}
  return raw;
}
export function makeBackup(data:AppData){return JSON.stringify({format:BACKUP_FORMAT,savedAt:new Date().toISOString(),data},null,2);}
export function parseBackup(text:string):AppData{
  let value:unknown;
  try{value=JSON.parse(text);}catch{throw Error('Il file non contiene un backup JSON valido.');}
  if(value && typeof value==='object' && 'format' in value){
    if(value.format!==BACKUP_FORMAT || !('data' in value))throw Error('Questo formato di backup non è supportato.');
    value=value.data;
  }
  if(!isAppData(value))throw Error('Il backup contiene dati incompleti o non validi. L’archivio attuale non è stato modificato.');
  return value;
}
export function downloadFile(content:string,name:string){
  const url=URL.createObjectURL(new Blob([content],{type:'application/json;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=name;
  document.body.appendChild(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
