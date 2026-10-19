import { remoteEnabled } from '@/lib/server/supabase';
import { authGet, authPost } from '@/lib/server/cloud-api';
import { hash, verify, verifyDummy } from '@/lib/server/passwords';
import { db, token, digest, account, readState, transaction } from '@/lib/server/store';
import { assert, body, currentUser, handle, origin, rateLimit, response, sameOrigin, sessionCookie, configuredOrigin } from '@/lib/server/http';
export const runtime='nodejs';
export const maxDuration=30;
export const dynamic='force-dynamic';
export function GET(request:Request) { if(remoteEnabled())return authGet(request);return handle(()=>{
  const user=currentUser(request);
  return response({user,configured:!!configuredOrigin(),initialized:!!db().prepare('SELECT id FROM users LIMIT 1').get()});
}); }
export function POST(request:Request) { if(remoteEnabled())return authPost(request);return handle(async()=>{
  sameOrigin(request); const input=await body(request);
  const invite=typeof input.token==='string'?input.token:'';
  if(input.action==='inspectInvite') {
    assert(/^[A-Za-z0-9_-]{43}$/.test(invite),404,'Invito non valido.');
    const row=db().prepare('SELECT player_id,expires,kind FROM invites WHERE hash=? AND used=0 AND expires>?').get(digest(invite),Date.now());
    assert(row,410,'Questo link è scaduto, revocato o già utilizzato. Chiedi un nuovo invito.');
    const player=readState().players.find(p=>p.id===row.player_id);
    assert(player,410,'Giocatore non disponibile.');
    return response({invite:{name:player.name,kind:row.kind,expires:row.expires}});
  }

  if(input.action==='logout') {
    const raw=request.headers.get('cookie')?.match(/(?:^|;\s*)calcetto_session=([A-Za-z0-9_-]{43})(?:;|$)/)?.[1];
    if(raw)db().prepare('DELETE FROM sessions WHERE hash=?').run(digest(raw));
    return response({ok:true},200,{'Set-Cookie':sessionCookie('',0)});
  }
  assert(input.action==='login'||input.action==='register',400,'Azione non valida.');
  const email=typeof input.email==='string'?input.email.trim().toLowerCase():'';
  const password=typeof input.password==='string'?input.password:'';
  assert(email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),400,'Inserisci un’email valida.');
  assert(password.length>=12 && Buffer.byteLength(password)<=256,400,'Usa una password da 12 a 256 caratteri.');
  // Stored in SQLite, so limits also survive process restarts. No untrusted forwarded IP dependency.
  rateLimit(`auth:${email}`,10); rateLimit('auth:global',200,15);
  let user;
  if(input.action==='login') {
    const row=db().prepare('SELECT * FROM users WHERE email=?').get(email);
    const correct=row?await verify(password,String(row.password)):await verifyDummy(password);
    assert(row && correct,401,'Email o password non corrette.');user=account(row);
  } else {
    const raw=typeof input.token==='string'?input.token:'';
    assert(/^[A-Za-z0-9_-]{43}$/.test(raw),400,'Serve un invito valido.');
    const encoded=await hash(password);
    user=transaction(()=>{
      const invite=db().prepare('SELECT * FROM invites WHERE hash=? AND used=0 AND expires>?').get(digest(raw),Date.now());
      assert(invite,410,'Invito scaduto, revocato o già utilizzato.');
      const existing=db().prepare('SELECT * FROM users WHERE player_id=?').get(String(invite.player_id));
      const emailOwner=db().prepare('SELECT id FROM users WHERE email=?').get(email);
      assert(!emailOwner || (existing && emailOwner.id===existing.id),409,'Non è possibile usare questa email.');
      if(invite.kind==='reset') {
        assert(existing && existing.email===email,400,'Usa l’email già associata al tuo account.');
        db().prepare('UPDATE users SET password=? WHERE id=?').run(encoded,String(existing.id));
        db().prepare('DELETE FROM sessions WHERE user_id=?').run(String(existing.id));
      } else {
        assert(!existing,409,'Questo giocatore ha già un account.');
        db().prepare('INSERT INTO users(id,email,password,player_id,admin) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),email,encoded,String(invite.player_id),Number(invite.admin));
      }
      db().prepare('UPDATE invites SET used=1 WHERE id=?').run(String(invite.id));
      return account(db().prepare('SELECT * FROM users WHERE player_id=?').get(String(invite.player_id))!);
    });
  }
  const raw=token();
  db().prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
  db().prepare('INSERT INTO sessions(hash,user_id,expires) VALUES(?,?,?)').run(digest(raw),user.id,Date.now()+14*86400000);
  db().prepare('DELETE FROM attempts WHERE key=?').run(`auth:${email}`);
  return response({user,origin:origin()},200,{'Set-Cookie':sessionCookie(raw)});
}); }
