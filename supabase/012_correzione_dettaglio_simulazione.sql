-- =============================================================================
-- Correzione: (ri)crea la funzione del dettaglio della simulazione prevista da
-- 011_simulazione_visibile.sql, nel caso non sia stata creata.
-- Si può eseguire anche più volte.
-- Supabase > SQL Editor > New query > Run
-- =============================================================================

create or replace function private.simulation_detail(p_poll_id bigint)
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

create or replace function public.simulation_detail(p_poll_id bigint)
returns table (resident_id bigint, full_name text, unit text, unit_code text, millesimi numeric, option_id bigint)
language sql stable security invoker set search_path = ''
as $$ select * from private.simulation_detail(p_poll_id); $$;

revoke execute on function private.simulation_detail(bigint), public.simulation_detail(bigint) from public, anon;
grant execute on function private.simulation_detail(bigint), public.simulation_detail(bigint) to authenticated;

-- Aggiorna l'elenco delle funzioni esposte dalle API
notify pgrst, 'reload schema';

-- Verifica: devono comparire 4 righe (private e public per summary e detail)
select n.nspname as schema, p.proname as funzione
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where p.proname in ('simulation_summary', 'simulation_detail')
order by 2, 1;
