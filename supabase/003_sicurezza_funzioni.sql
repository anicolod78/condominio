-- =============================================================================
-- Correzioni suggerite dal Security Advisor di Supabase
-- Da eseguire UNA volta, dopo schema.sql: Supabase > SQL Editor > New query > Run
--
-- Le funzioni che servono solo alle policy o ai trigger vengono spostate nello
-- schema "private", che non è esposto dalle API REST. Policy e trigger le
-- referenziano per identificativo interno e continuano a funzionare.
-- =============================================================================

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Trigger di creazione profilo: nessuno deve poterlo richiamare
alter function public.handle_new_user() set schema private;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- Funzioni usate dalle policy RLS: servono all'utente autenticato, ma non via API
alter function public.is_admin() set schema private;
alter function public.poll_is_open(bigint) set schema private;
grant execute on function private.is_admin(), private.poll_is_open(bigint) to authenticated;

-- Risultati dei sondaggi: la logica privilegiata va in "private",
-- in "public" resta un involucro senza privilegi richiamato dal sito
alter function public.poll_results(bigint) set schema private;
grant execute on function private.poll_results(bigint) to authenticated;

create function public.poll_results(p_poll_id bigint)
returns table (option_id bigint, votes bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.poll_results(p_poll_id); $$;

revoke execute on function public.poll_results(bigint) from public, anon;
grant execute on function public.poll_results(bigint) to authenticated;

-- Keepalive: search_path fisso
create or replace function public.ping()
returns text
language sql stable set search_path = ''
as $$ select 'ok'; $$;

-- Aggiorna l'elenco delle funzioni esposte dalle API
notify pgrst, 'reload schema';
