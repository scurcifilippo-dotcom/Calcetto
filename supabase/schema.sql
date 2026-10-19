-- Run once in the private Supabase SQL Editor. Safe to run again: existing data is preserved.
-- Only the server's service_role can execute this API. Browser keys have no access.
begin;
create schema if not exists calcetto_private;
revoke all on schema calcetto_private from public, anon, authenticated;
create table if not exists calcetto_private.state (
  id integer primary key check(id=1), version bigint not null default 1, data jsonb not null
);
create table if not exists calcetto_private.users (
  id text primary key, email text not null unique check(email=lower(email)), password text not null,
  player_id text not null unique, admin boolean not null default false
);
create table if not exists calcetto_private.sessions (
  hash text primary key, user_id text not null references calcetto_private.users(id) on delete cascade,
  expires bigint not null
);
create table if not exists calcetto_private.invites (
  id text primary key, hash text not null unique, player_id text not null,
  admin boolean not null default false, kind text not null check(kind in ('join','reset')),
  expires bigint not null, used boolean not null default false, created bigint not null
);
create table if not exists calcetto_private.attempts (
  key text primary key, count bigint not null, expires bigint not null
);
alter table calcetto_private.state enable row level security;
alter table calcetto_private.users enable row level security;
alter table calcetto_private.sessions enable row level security;
alter table calcetto_private.invites enable row level security;
alter table calcetto_private.attempts enable row level security;
revoke all on all tables in schema calcetto_private from public, anon, authenticated;
insert into calcetto_private.state(id,data) values(1,'{"version":1,"players":[{"id":"trieu","name":"Trieu","role":"Portiere","icon":"🧤"},{"id":"egor","name":"Egor","role":"Difensore","icon":"🛡️"},{"id":"pippo","name":"Pippo","role":"Difensore","icon":"🛡️"},{"id":"pujia","name":"Pujia","role":"Difensore","icon":"🛡️"},{"id":"presidente","name":"Presidente","role":"Difensore","icon":"🛡️"},{"id":"adriano","name":"Adriano","role":"Difensore","icon":"🛡️"},{"id":"tiziano","name":"Tiziano","role":"Centrocampista","icon":"⚡"},{"id":"lele","name":"Lele","role":"Centrocampista","icon":"⚡"},{"id":"buba","name":"Buba","role":"Centrocampista","icon":"⚡"},{"id":"michele","name":"Michele","role":"Centrocampista","icon":"⚡"},{"id":"cristian","name":"Cristian","role":"Centrocampista","icon":"⚡"},{"id":"baldo","name":"Baldo","role":"Attaccante","icon":"🎯"},{"id":"fiori","name":"Fiori","role":"Attaccante","icon":"🎯"},{"id":"gigi","name":"Gigi","role":"Attaccante","icon":"🎯"},{"id":"arossa","name":"Arossa","role":"Attaccante","icon":"🎯"}],"seasons":[],"matches":[],"messages":[]}'::jsonb) on conflict(id) do nothing;

create or replace function public.calcetto_rpc(p_action text, p_args jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog, calcetto_private
as $calcetto$
declare
  now_ms bigint := floor(extract(epoch from clock_timestamp())*1000)::bigint;
  u calcetto_private.users%rowtype;
  existing calcetto_private.users%rowtype;
  invitation calcetto_private.invites%rowtype;
  doc calcetto_private.state%rowtype;
  session_value jsonb;
  user_value jsonb;
  item jsonb;
  changed bigint;
  counter bigint;
  target text;
  invite_kind text;
  grant_admin boolean;
  session_hash text := coalesce(p_args->>'sessionHash','');
begin
  if p_action='ping' then return jsonb_build_object('ok',exists(select 1 from calcetto_private.state where id=1)); end if;

  if p_action='rate' then
    if length(coalesce(p_args->>'key','')) not between 1 and 300 or (p_args->>'max')::int not between 1 and 1000 or (p_args->>'minutes')::int not between 1 and 60 then
      return jsonb_build_object('error',jsonb_build_object('status',400,'message','Limite non valido.'));
    end if;
    delete from calcetto_private.attempts where expires<now_ms;
    insert into calcetto_private.attempts as a(key,count,expires) values(p_args->>'key',1,now_ms+(p_args->>'minutes')::bigint*60000)
      on conflict(key) do update set count=a.count+1 returning count into counter;
    if counter>(p_args->>'max')::bigint then return jsonb_build_object('error',jsonb_build_object('status',429,'message','Troppi tentativi. Riprova tra qualche minuto.')); end if;
    return jsonb_build_object('ok',true);
  end if;

  if p_action='backup' then
    return jsonb_build_object('format','calcetto-supabase-v1','createdAt',now_ms,
      'state',(select to_jsonb(s) from calcetto_private.state s where id=1),
      'users',coalesce((select jsonb_agg(to_jsonb(backup_user)) from calcetto_private.users backup_user),'[]'::jsonb),
      'sessions',coalesce((select jsonb_agg(to_jsonb(s)) from calcetto_private.sessions s),'[]'::jsonb),
      'invites',coalesce((select jsonb_agg(to_jsonb(i)) from calcetto_private.invites i),'[]'::jsonb));
  end if;

  if p_action='login_record' then
    select * into u from calcetto_private.users where email=p_args->>'email';
    return jsonb_build_object('user',case when u.id is null then null else jsonb_build_object('id',u.id,'email',u.email,'playerId',u.player_id,'isAdmin',u.admin,'password',u.password) end);
  end if;

  if p_action='session_create' then
    if not exists(select 1 from calcetto_private.users where id=p_args->>'userId' and email=p_args->>'email') then
      return jsonb_build_object('error',jsonb_build_object('status',401,'message','Account non disponibile.'));
    end if;
    session_value:=p_args->'session';
    delete from calcetto_private.sessions where expires<now_ms;
    insert into calcetto_private.sessions(hash,user_id,expires) values(session_value->>'hash',p_args->>'userId',least((session_value->>'expires')::bigint,now_ms+1209600000));
    delete from calcetto_private.attempts where key='auth:'||(p_args->>'email');
    return jsonb_build_object('ok',true);
  end if;

  if p_action='invite_inspect' then
    select * into invitation from calcetto_private.invites where hash=p_args->>'hash' and not used and expires>now_ms;
    if invitation.id is null then return jsonb_build_object('error',jsonb_build_object('status',410,'message','Questo link è scaduto, revocato o già utilizzato. Chiedi un nuovo invito.')); end if;
    select data into doc.data from calcetto_private.state where id=1;
    select p->>'name' into target from jsonb_array_elements(doc.data->'players') p where p->>'id'=invitation.player_id;
    if target is null then return jsonb_build_object('error',jsonb_build_object('status',410,'message','Giocatore non disponibile.')); end if;
    return jsonb_build_object('invite',jsonb_build_object('name',target,'kind',invitation.kind,'expires',invitation.expires));
  end if;

  if p_action='register' then
    select * into invitation from calcetto_private.invites where hash=p_args->>'inviteHash' for update;
    if invitation.id is null or invitation.used or invitation.expires<=now_ms then return jsonb_build_object('error',jsonb_build_object('status',410,'message','Invito scaduto, revocato o già utilizzato.')); end if;
    select * into existing from calcetto_private.users where player_id=invitation.player_id;
    if exists(select 1 from calcetto_private.users where email=p_args->>'email' and id is distinct from existing.id) then return jsonb_build_object('error',jsonb_build_object('status',409,'message','Non è possibile usare questa email.')); end if;
    if invitation.kind='reset' then
      if existing.id is null or existing.email<>p_args->>'email' then return jsonb_build_object('error',jsonb_build_object('status',400,'message','Usa l’email già associata al tuo account.')); end if;
      update calcetto_private.users set password=p_args->>'password' where id=existing.id returning * into u;
      delete from calcetto_private.sessions where user_id=u.id;
    else
      if existing.id is not null then return jsonb_build_object('error',jsonb_build_object('status',409,'message','Questo giocatore ha già un account.')); end if;
      insert into calcetto_private.users(id,email,password,player_id,admin) values(gen_random_uuid()::text,p_args->>'email',p_args->>'password',invitation.player_id,invitation.admin) returning * into u;
    end if;
    update calcetto_private.invites set used=true where id=invitation.id;
    session_value:=p_args->'session';
    insert into calcetto_private.sessions(hash,user_id,expires) values(session_value->>'hash',u.id,least((session_value->>'expires')::bigint,now_ms+1209600000));
    delete from calcetto_private.attempts where key='auth:'||u.email;
    return jsonb_build_object('user',jsonb_build_object('id',u.id,'email',u.email,'playerId',u.player_id,'isAdmin',u.admin));
  end if;

  if p_action='logout' then delete from calcetto_private.sessions where hash=session_hash;return jsonb_build_object('ok',true); end if;

  if p_action='bootstrap' then
    perform pg_advisory_xact_lock(734298125);
    if exists(select 1 from calcetto_private.users where admin) then return jsonb_build_object('error',jsonb_build_object('status',409,'message','Un amministratore esiste già. Usa Inviti nel sito.')); end if;
    if jsonb_typeof(p_args->'invites') is distinct from 'array' or jsonb_array_length(p_args->'invites') not between 1 and 4 then return jsonb_build_object('error',jsonb_build_object('status',400,'message','Inviti iniziali non validi.')); end if;
    for item in select * from jsonb_array_elements(p_args->'invites') loop
      if item->>'playerId' not in ('fiori','pippo','gigi','presidente') then raise check_violation;end if;
      update calcetto_private.invites set used=true where player_id=item->>'playerId' and kind='join' and not used;
      insert into calcetto_private.invites(id,hash,player_id,admin,kind,expires,created) values(item->>'id',item->>'hash',item->>'playerId',true,'join',least((item->>'expires')::bigint,now_ms+259200000),now_ms);
    end loop;
    return jsonb_build_object('ok',true);
  end if;

  select users.* into u from calcetto_private.sessions sessions join calcetto_private.users users on users.id=sessions.user_id where sessions.hash=session_hash and sessions.expires>now_ms;
  user_value:=case when u.id is null then null else jsonb_build_object('id',u.id,'email',u.email,'playerId',u.player_id,'isAdmin',u.admin) end;
  if p_action='snapshot' then
    if u.id is null or coalesce((p_args->>'authOnly')::boolean,false) then return jsonb_build_object('user',user_value,'initialized',exists(select 1 from calcetto_private.users));end if;
    select * into doc from calcetto_private.state where id=1;
    return jsonb_build_object('user',user_value,'initialized',true,'version',doc.version::text) ||
      case when p_args->>'ifVersion'=doc.version::text then '{}'::jsonb else jsonb_build_object('data',doc.data) end;
  end if;
  if u.id is null then return jsonb_build_object('error',jsonb_build_object('status',401,'message','Accedi per continuare.')); end if;

  if p_action='state_write' then
    if jsonb_typeof(p_args->'data') is distinct from 'object' or jsonb_typeof(p_args->'data'->'messages') is distinct from 'array' then raise check_violation;end if;
    if exists(select 1 from jsonb_array_elements(p_args->'data'->'messages') m where m ? 'attachment' and m->'attachment'->>'type' is distinct from 'sticker') then raise check_violation;end if;
    update calcetto_private.state set data=p_args->'data',version=version+1 where id=1 and version=(p_args->>'version')::bigint returning version into counter;
    if counter is null then return jsonb_build_object('error',jsonb_build_object('status',409,'message','Dati aggiornati da un altro utente. Riprova.')); end if;
    return jsonb_build_object('version',counter::text);
  end if;

  if not u.admin then return jsonb_build_object('error',jsonb_build_object('status',403,'message','Operazione riservata agli amministratori.')); end if;
  if p_action='invites_list' then
    return jsonb_build_object('users',coalesce((select jsonb_agg(jsonb_build_object('playerId',player_id,'isAdmin',admin)) from calcetto_private.users),'[]'::jsonb),
      'invites',coalesce((select jsonb_agg(jsonb_build_object('id',id,'playerId',player_id,'kind',kind,'isAdmin',admin,'expires',expires) order by created desc) from calcetto_private.invites where not used and expires>now_ms),'[]'::jsonb));
  end if;
  if p_action='invite_revoke' then update calcetto_private.invites set used=true where id=p_args->>'id';return jsonb_build_object('ok',true);end if;
  if p_action='invite_create' then
    target:=p_args->>'playerId';
    select * into doc from calcetto_private.state where id=1;
    if not exists(select 1 from jsonb_array_elements(doc.data->'players') p where p->>'id'=target) then return jsonb_build_object('error',jsonb_build_object('status',400,'message','Scegli un giocatore.'));end if;
    select * into existing from calcetto_private.users where player_id=target;
    if existing.id is not null and not coalesce((p_args->>'reset')::boolean,false) then return jsonb_build_object('error',jsonb_build_object('status',409,'message','Questo giocatore ha già un account.'));end if;
    if existing.id is null and coalesce((p_args->>'reset')::boolean,false) then return jsonb_build_object('error',jsonb_build_object('status',400,'message','Il giocatore non ha un account.'));end if;
    invite_kind:=case when existing.id is null then 'join' else 'reset' end;
    grant_admin:=case when existing.id is null then coalesce((p_args->>'isAdmin')::boolean,false) else existing.admin end;
    perform pg_advisory_xact_lock(hashtext('invite:'||target)::bigint);
    update calcetto_private.invites set used=true where player_id=target and kind=invite_kind and not used;
    insert into calcetto_private.invites(id,hash,player_id,admin,kind,expires,created) values(p_args->>'id',p_args->>'hash',target,grant_admin,invite_kind,least((p_args->>'expires')::bigint,now_ms+259200000),now_ms);
    return jsonb_build_object('id',p_args->>'id');
  end if;
  return jsonb_build_object('error',jsonb_build_object('status',400,'message','Operazione non valida.'));
exception
  when unique_violation then return jsonb_build_object('error',jsonb_build_object('status',409,'message','Account o invito già presente.'));
  when check_violation or invalid_text_representation or not_null_violation then return jsonb_build_object('error',jsonb_build_object('status',400,'message','Dati non validi.'));
end;
$calcetto$;
revoke all on function public.calcetto_rpc(text,jsonb) from public, anon, authenticated;
grant execute on function public.calcetto_rpc(text,jsonb) to service_role;
commit;
