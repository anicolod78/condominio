-- =============================================================================
-- Unità immobiliari: un condomino (la "testa" che vota) può possedere più unità,
-- ognuna con il proprio codice, scala e millesimi. I millesimi e la scala della
-- scheda del condomino diventano la somma/l'elenco delle sue unità e sono
-- aggiornati automaticamente.
-- Da eseguire UNA volta, dopo 008: Supabase > SQL Editor > New query > Run
-- =============================================================================

create table public.units (
  id          bigint generated always as identity primary key,
  resident_id bigint not null references public.residents (id) on delete cascade,
  unit_code   text unique,
  scala       text,
  millesimi   numeric(10, 3) not null default 0 check (millesimi >= 0),
  created_at  timestamptz not null default now()
);

create index on public.units (resident_id);

-- -----------------------------------------------------------------------------
-- Trasferimento dei dati attuali: ogni scheda con codice o millesimi diventa
-- una o più unità. Le schede con più codici (es. "002.3.077D, 003.3.108N")
-- hanno un'unità per codice con 0 millesimi: lo script con le tabelle
-- millesimali (dati_*.sql) assegna poi millesimi e scala di ogni codice.
-- -----------------------------------------------------------------------------
insert into public.units (resident_id, unit_code, scala, millesimi)
select r.id, r.unit_code, r.unit, r.millesimi
from public.residents r
where r.unit_code is not null and r.unit_code not like '%,%';

insert into public.units (resident_id, unit_code, scala, millesimi)
select r.id, trim(code), null, 0
from public.residents r, unnest(string_to_array(r.unit_code, ',')) as code
where r.unit_code like '%,%';

insert into public.units (resident_id, unit_code, scala, millesimi)
select r.id, null, r.unit, r.millesimi
from public.residents r
where r.unit_code is null and r.millesimi > 0;

-- Il codice ora sta nelle unità
drop index if exists public.residents_unit_code_key;
alter table public.residents drop column if exists unit_code;

-- -----------------------------------------------------------------------------
-- Millesimi e scala del condomino calcolati dalle sue unità
-- -----------------------------------------------------------------------------
create or replace function private.refresh_resident(p_resident_id bigint)
returns void
language sql security definer set search_path = ''
as $$
  update public.residents r
  set millesimi = coalesce((select sum(u.millesimi) from public.units u where u.resident_id = r.id), 0),
      unit      = (select string_agg(distinct u.scala, ', ' order by u.scala)
                   from public.units u where u.resident_id = r.id and u.scala is not null)
  where r.id = p_resident_id;
$$;

create or replace function private.units_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.refresh_resident(new.resident_id);
  elsif tg_op = 'UPDATE' then
    perform private.refresh_resident(old.resident_id);
    if new.resident_id <> old.resident_id then         -- unità spostata a un altro condomino
      perform private.refresh_resident(new.resident_id);
    end if;
  else
    perform private.refresh_resident(old.resident_id);
  end if;
  return null;
end;
$$;

create trigger units_changed
  after insert or update or delete on public.units
  for each row execute function private.units_changed();

revoke execute on function private.refresh_resident(bigint), private.units_changed() from public, anon, authenticated;

-- Allinea subito le schede (es. scala delle schede con più unità)
select private.refresh_resident(id) from public.residents;

-- -----------------------------------------------------------------------------
-- Permessi: l'admin gestisce le unità, ognuno vede le proprie
-- -----------------------------------------------------------------------------
revoke all on public.units from anon;
grant select, insert, update, delete on public.units to authenticated;
alter table public.units enable row level security;

create policy "unità: lettura proprie o admin" on public.units
  for select to authenticated using (
    private.is_admin()
    or exists (select 1 from public.residents r where r.id = resident_id and r.user_id = (select auth.uid()))
  );
create policy "unità: gestione admin" on public.units
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

notify pgrst, 'reload schema';
