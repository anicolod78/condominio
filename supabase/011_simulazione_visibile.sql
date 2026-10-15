-- =============================================================================
-- Simulazioni visibili ai condomini (in sola lettura)
-- Per ogni sondaggio l'admin sceglie cosa vedono i condomini della simulazione:
--   'nascosta'  : niente (solo admin)
--   'riepilogo' : totali per opzione (teste e millesimi), senza nomi  [predefinito]
--   'dettaglio' : riepilogo + risposta simulata di ogni condomino
-- Le risposte simulate restano modificabili solo dagli admin.
-- Da eseguire UNA volta: Supabase > SQL Editor > New query > Run
-- =============================================================================

alter table public.polls
  add column if not exists simulation_visibility text not null default 'riepilogo'
    check (simulation_visibility in ('nascosta', 'riepilogo', 'dettaglio'));

-- Livello di visibilità della simulazione per i condomini (null = non visibile).
-- Vale anche per gli admin in "vista condomini": la gestione completa della
-- simulazione passa dalle tabelle, riservate agli admin.
create or replace function private.simulation_access(p_poll_id bigint)
returns text
language sql stable security definer set search_path = ''
as $$
  select case
    when auth.uid() is null then null
    when not exists (select 1 from public.poll_simulations s where s.poll_id = p_poll_id) then null
    else nullif((select p.simulation_visibility from public.polls p where p.id = p_poll_id), 'nascosta')
  end;
$$;

-- Sondaggi con una simulazione visibile a chi la chiede, e relativo livello
create function private.visible_simulations()
returns table (poll_id bigint, access text)
language sql stable security definer set search_path = ''
as $$
  select p.id, private.simulation_access(p.id)
  from public.polls p
  where private.simulation_access(p.id) is not null;
$$;

-- Riepilogo: per ogni risposta (null = nessuna risposta) teste e millesimi
create function private.simulation_summary(p_poll_id bigint)
returns table (option_id bigint, heads bigint, heads_with_millesimi bigint, millesimi numeric)
language sql stable security definer set search_path = ''
as $$
  select s.option_id, count(*), count(*) filter (where r.millesimi > 0), coalesce(sum(r.millesimi), 0)
  from public.residents r
  left join public.poll_simulations s on s.resident_id = r.id and s.poll_id = p_poll_id
  where private.simulation_access(p_poll_id) is not null
  group by s.option_id;
$$;

-- Dettaglio per condomino: solo se l'admin l'ha reso visibile
create function private.simulation_detail(p_poll_id bigint)
returns table (resident_id bigint, full_name text, unit text, unit_code text, millesimi numeric, option_id bigint)
language sql stable security definer set search_path = ''
as $$
  select r.id, r.full_name, r.unit,
         (select min(u.unit_code) from public.units u where u.resident_id = r.id),
         r.millesimi, s.option_id
  from public.residents r
  left join public.poll_simulations s on s.resident_id = r.id and s.poll_id = p_poll_id
  where private.simulation_access(p_poll_id) = 'dettaglio';
$$;

-- Involucri senza privilegi richiamati dal sito
create function public.visible_simulations()
returns table (poll_id bigint, access text)
language sql stable security invoker set search_path = ''
as $$ select * from private.visible_simulations(); $$;

create function public.simulation_summary(p_poll_id bigint)
returns table (option_id bigint, heads bigint, heads_with_millesimi bigint, millesimi numeric)
language sql stable security invoker set search_path = ''
as $$ select * from private.simulation_summary(p_poll_id); $$;

create function public.simulation_detail(p_poll_id bigint)
returns table (resident_id bigint, full_name text, unit text, unit_code text, millesimi numeric, option_id bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.simulation_detail(p_poll_id); $$;

revoke execute on function
  private.simulation_access(bigint), private.visible_simulations(),
  private.simulation_summary(bigint), private.simulation_detail(bigint),
  public.visible_simulations(), public.simulation_summary(bigint), public.simulation_detail(bigint)
  from public, anon;
grant execute on function
  private.simulation_access(bigint), private.visible_simulations(),
  private.simulation_summary(bigint), private.simulation_detail(bigint),
  public.visible_simulations(), public.simulation_summary(bigint), public.simulation_detail(bigint)
  to authenticated;

notify pgrst, 'reload schema';
