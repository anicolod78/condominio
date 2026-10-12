-- =============================================================================
-- Maggioranze dei sondaggi: per ogni sondaggio si può indicare la maggioranza
-- richiesta (teste e/o millesimi); risultati e simulazione mostrano se ogni
-- opzione la raggiunge.
-- Da eseguire UNA volta: Supabase > SQL Editor > New query > Run
-- =============================================================================

alter table public.polls
  -- teste: più della metà di chi ha risposto ('votanti') o di tutti i condomini ('tutti')
  add column if not exists majority_heads text check (majority_heads in ('votanti', 'tutti')),
  -- millesimi minimi a favore dell'opzione
  add column if not exists majority_millesimi numeric(10, 3) check (majority_millesimi >= 0),
  -- descrizione della regola scelta (es. "1ª convocazione, art. 1136 c. 2 c.c.")
  add column if not exists majority_label text;

-- I risultati riportano anche il numero di teste (condomini con millesimi)
drop function if exists public.poll_results(bigint);
drop function if exists private.poll_results(bigint);

create function private.poll_results(p_poll_id bigint)
returns table (option_id bigint, votes bigint, millesimi numeric, total_millesimi numeric, total_heads bigint)
language sql stable security definer set search_path = ''
as $$
  select
    o.id,
    count(v.user_id),
    coalesce(sum(r.millesimi), 0),
    (select coalesce(sum(millesimi), 0) from public.residents),
    (select count(*) from public.residents where millesimi > 0)
  from public.poll_options o
  left join public.votes v on v.option_id = o.id
  left join public.residents r on r.user_id = v.user_id
  where o.poll_id = p_poll_id and auth.uid() is not null
  group by o.id;
$$;

create function public.poll_results(p_poll_id bigint)
returns table (option_id bigint, votes bigint, millesimi numeric, total_millesimi numeric, total_heads bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.poll_results(p_poll_id); $$;

revoke execute on function private.poll_results(bigint), public.poll_results(bigint) from public, anon;
grant execute on function private.poll_results(bigint), public.poll_results(bigint) to authenticated;

notify pgrst, 'reload schema';
