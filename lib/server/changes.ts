import { equalData, isAppData, isChatAttachment, findMentionIds, type AppData, type Match, type Player, type ChatMessage } from '@/lib/model';
import type { Account } from './store';
import { assert } from './http';
const equal=equalData;
export function applyChanges(state:AppData,changes:unknown,user:Account):AppData {
  assert(Array.isArray(changes) && changes.length>0 && changes.length<=30,400,'Modifiche non valide.');
    for(const change of changes) {
      assert(change && typeof change==='object',400,'Modifica non valida.');
      const {collection,id,before,after}=change;
      assert(['players','seasons','matches','messages'].includes(collection) && typeof id==='string' && id.length<=100,400,'Modifica non valida.');
      assert(after && typeof after==='object' && after.id===id,400,'Elemento non valido.');
      const items=state[collection as keyof Pick<AppData,'players'|'seasons'|'matches'|'messages'>] as {id:string}[];
      const index=items.findIndex(item=>item.id===id), existing=index<0?null:items[index];
      if(collection==='messages') {
        assert(before===null && !existing && after.authorId===user.playerId,403,'Puoi inviare soltanto nuovi messaggi con il tuo account.');
        const message=after as ChatMessage;
        message.createdAt=new Date().toISOString(); message.mentionIds=findMentionIds(message.text,state.players);
        assert(message.attachment === undefined || isChatAttachment(message.attachment),400,'La chat accetta solo testo, menzioni e sticker.');
      } else if(!user.isAdmin) {
        assert(existing && before,403,'Non puoi creare elementi.');
        if(collection==='players') {
          assert(id===user.playerId,403,'Puoi modificare solo il tuo profilo.');
          const old=existing as Player, next=after as Player;
          assert(equal({...old,role:next.role,icon:next.icon,photo:next.photo},next),403,'Puoi modificare soltanto ruolo, icona e foto.');
          assert(equal(existing,before),409,'Il profilo è stato aggiornato altrove. Riaprilo e riprova.');
        } else if(collection==='matches') {
          const old=existing as Match, next=after as Match, base=before as Match;
          assert(old.status==='scheduled' && old.selectedIds.includes(user.playerId),403,'Puoi confermare solo le partite per cui sei convocato.');
          assert(equal({...base,availableIds:next.availableIds},next),403,'Puoi modificare solo la tua disponibilità.');
          assert(Array.isArray(next.availableIds) && equal(base.availableIds.filter(x=>x!==user.playerId),next.availableIds.filter(x=>x!==user.playerId)),403,'Non puoi modificare le conferme degli altri.');
          after.availableIds=next.availableIds.includes(user.playerId)?[...new Set([...old.availableIds,user.playerId])]:old.availableIds.filter(x=>x!==user.playerId);
          Object.assign(after,{...old,availableIds:after.availableIds});
        } else assert(false,403,'Operazione riservata agli amministratori.');
      } else {
        assert(equal(existing,before),409,'Questo elemento è stato aggiornato da un altro utente. Riaprilo e riprova.');
      }
      if(index<0) items.push(after); else items[index]=after;
    }
    assert(isAppData(state),400,'Dati non validi: controlla partecipanti, risultato e voti.');
    const names=new Set<string>();
    for(const p of state.players) {
      assert(p.name===p.name.trim() && p.name.length<=60 && p.icon.length<=20,400,'Nome o icona non validi.');
      assert(!names.has(p.name.toLocaleLowerCase('it')),409,'Esiste già un giocatore con questo nome.');names.add(p.name.toLocaleLowerCase('it'));
      if(p.photo) {
        assert(/^data:image\/(png|jpeg|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(p.photo) && p.photo.length<2800000,400,'Foto non valida o superiore a 2 MB.');
        const bytes=Buffer.from(p.photo.split(',')[1],'base64');
        assert(bytes.length<=2*1024*1024 && ((p.photo.startsWith('data:image/png') && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) || (p.photo.startsWith('data:image/jpeg') && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) || (p.photo.startsWith('data:image/webp') && bytes.subarray(0,4).toString()==='RIFF' && bytes.subarray(8,12).toString()==='WEBP')),400,'Il file caricato non è una foto valida.');
      }
    }
    assert(new Set(state.seasons.map(s=>s.name.trim().toLocaleLowerCase('it'))).size===state.seasons.length && state.seasons.every(s=>s.name.trim().length>0 && s.name.length<=60),400,'Nome stagione vuoto, duplicato o troppo lungo.');
    for(const m of state.matches) {
      assert(/^\d{4}-\d{2}-\d{2}$/.test(m.date) && new Date(m.date+'T12:00:00Z').toISOString().slice(0,10)===m.date && /^([01]\d|2[0-3]):[0-5]\d$/.test(m.time) && m.venue.trim().length>0 && m.venue.length<=120,400,'Data, ora o campo non validi.');
      assert(m.selectedIds.length<=10 && m.appearances.length===m.selectedIds.length && new Set(m.appearances.map(a=>a.playerId)).size===m.appearances.length && m.appearances.every(a=>m.selectedIds.includes(a.playerId)),400,'Partecipanti e squadre non validi.');
    }
  return state;
}
