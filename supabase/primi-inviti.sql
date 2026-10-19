-- Run privately in Supabase SQL Editor AFTER schema.sql and a successful /api/health.
-- This creates real, one-use invitations for the four initial administrators.
-- Keep the result private: each link grants access to the named player's account.
-- Repeating this before any administrator registers replaces the preceding links.
with tokens as materialized (
  select player_id,
    translate(rtrim(encode(sha256(convert_to(gen_random_uuid()::text || gen_random_uuid()::text, 'UTF8')), 'base64'), '='), '+/', '-_') as raw_token,
    gen_random_uuid()::text as invite_id,
    floor(extract(epoch from (clock_timestamp() + interval '72 hours')) * 1000)::bigint as expires
  from (values ('fiori'), ('pippo'), ('gigi'), ('presidente')) players(player_id)
), created as materialized (
  select public.calcetto_rpc('bootstrap', jsonb_build_object('invites', jsonb_agg(jsonb_build_object(
    'playerId', player_id,
    'id', invite_id,
    'hash', encode(sha256(convert_to(raw_token, 'UTF8')), 'hex'),
    'expires', expires
  )))) as result
  from tokens
)
select tokens.player_id as giocatore,
  case when (created.result->>'ok')::boolean then 'https://calcetto-virid.vercel.app/#invite=' || tokens.raw_token end as link_personale,
  to_timestamp(tokens.expires / 1000.0) as scadenza,
  created.result->'error'->>'message' as errore
from tokens cross join created;
