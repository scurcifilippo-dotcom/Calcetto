import { remoteEnabled } from '@/lib/server/supabase';
import { invitesGet, invitesPost } from '@/lib/server/cloud-api';
import { db, createInvite, readState } from '@/lib/server/store';
import { assert, body, handle, origin, rateLimit, requireAdmin, response, sameOrigin } from '@/lib/server/http';
export const runtime='nodejs';
export const maxDuration=30;
export const dynamic='force-dynamic';
export function GET(request:Request) { if(remoteEnabled())return invitesGet(request);return handle(()=>{
  requireAdmin(request);
  const users=db().prepare('SELECT player_id AS playerId,admin AS isAdmin FROM users').all();
  const invites=db().prepare('SELECT id,player_id AS playerId,kind,admin AS isAdmin,expires FROM invites WHERE used=0 AND expires>? ORDER BY created DESC').all(Date.now());
  return response({users,invites});
}); }
export function POST(request:Request) { if(remoteEnabled())return invitesPost(request);return handle(async()=>{
  sameOrigin(request);const user=requireAdmin(request);rateLimit(`invites:${user.id}`,40,60);
  const input=await body(request);
  if(input.action==='revoke') {
    assert(typeof input.id==='string',400,'Invito non valido.');
    db().prepare('UPDATE invites SET used=1 WHERE id=?').run(input.id);return response({ok:true});
  }
  const {playerId}=input;
  assert(typeof playerId==='string' && readState().players.some(p=>p.id===playerId),400,'Scegli un giocatore.');
  const existing=db().prepare('SELECT id,admin FROM users WHERE player_id=?').get(playerId);
  assert(!existing || input.action==='reset',409,'Questo giocatore ha già un account.');
  assert(input.action!=='reset' || existing,400,'Il giocatore non ha un account.');
  const base=origin();
  const invite=createInvite(playerId,existing?!!existing.admin:input.isAdmin===true,existing?'reset':'join');
  // Fragment keeps the bearer token out of server access logs and Referer headers.
  return response({id:invite.id,url:`${base}/#invite=${invite.token}`,expires:invite.expires},201);
}); }
