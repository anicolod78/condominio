-- =============================================================================
-- Anagrafica condomini con millesimi
-- Da eseguire UNA volta, dopo gli script 002-004: Supabase > SQL Editor > Run
--
-- L'elenco dei condomini diventa indipendente dagli account: una scheda può
-- esistere senza email e senza accesso al portale. Gli account (profiles)
-- restano solo per accesso e ruolo e si collegano alla scheda con la stessa email.
-- =============================================================================

create table public.residents (
  id              bigint generated always as identity primary key,
  full_name       text not null,
  unit            text,
  email           text,
  phone           text,
  millesimi       numeric(10, 3) not null default 0 check (millesimi >= 0),
  share_contacts  boolean not null default false,
  user_id         uuid unique references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create unique index residents_email_key on public.residents (lower(email)) where email is not null;

-- Una scheda per ogni account esistente, con i dati già inseriti
insert into public.residents (full_name, unit, email, phone, share_contacts, user_id)
select coalesce(nullif(trim(p.full_name), ''), p.email, 'Senza nome'), p.unit, p.email, p.phone, p.share_contacts, p.id
from public.profiles p;

-- Le funzioni precedenti cambiano forma: si ricreano più sotto
drop function if exists public.directory();
drop function if exists private.directory();
drop function if exists public.update_my_profile(text, text, boolean);
drop function if exists private.update_my_profile(text, text, boolean);
drop function if exists public.poll_results(bigint);
drop function if exists private.poll_results(bigint);

-- I dati anagrafici ora stanno solo in residents
alter table public.profiles
  drop column if exists full_name,
  drop column if exists unit,
  drop column if exists phone,
  drop column if exists share_contacts;

-- -----------------------------------------------------------------------------
-- Nuovo account: si collega alla scheda con la stessa email, o ne crea una
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);

  update public.residents set user_id = new.id
  where user_id is null and email is not null and lower(email) = lower(new.email);

  if not found then
    insert into public.residents (full_name, email, user_id)
    values (coalesce(new.email, 'Nuovo condomino'), new.email, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

revoke execute on function private.handle_new_user() from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Permessi: l'admin gestisce l'anagrafica, ognuno legge la propria scheda.
-- Agli altri condomini l'elenco arriva da directory(), che nasconde i contatti.
-- -----------------------------------------------------------------------------
revoke all on public.residents from anon;
grant select, insert, update, delete on public.residents to authenticated;
alter table public.residents enable row level security;

create policy "anagrafica: lettura propria o admin" on public.residents
  for select to authenticated using (user_id = (select auth.uid()) or private.is_admin());
create policy "anagrafica: gestione admin" on public.residents
  for all to authenticated using (private.is_admin()) with check (private.is_admin());

-- -----------------------------------------------------------------------------
-- Elenco per tutti: nome, unità e millesimi sempre;
-- email e telefono solo con il consenso della persona
-- -----------------------------------------------------------------------------
create function private.directory()
returns table (id bigint, full_name text, unit text, millesimi numeric, email text, phone text,
               has_account boolean, is_admin boolean, is_me boolean)
language sql stable security definer set search_path = ''
as $$
  select
    r.id,
    r.full_name,
    r.unit,
    r.millesimi,
    case when r.share_contacts or r.user_id = auth.uid() then r.email end,
    case when r.share_contacts or r.user_id = auth.uid() then r.phone end,
    r.user_id is not null,
    coalesce(p.role = 'admin', false),
    coalesce(r.user_id = auth.uid(), false)
  from public.residents r
  left join public.profiles p on p.id = r.user_id
  where auth.uid() is not null
  order by r.unit nulls last, r.full_name;
$$;

create function public.directory()
returns table (id bigint, full_name text, unit text, millesimi numeric, email text, phone text,
               has_account boolean, is_admin boolean, is_me boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.directory(); $$;

-- Ognuno aggiorna solo telefono e consenso della propria scheda
create function private.update_my_profile(p_phone text, p_share_contacts boolean)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.residents
  set phone          = nullif(trim(p_phone), ''),
      share_contacts = coalesce(p_share_contacts, false)
  where user_id = auth.uid();
$$;

create function public.update_my_profile(p_phone text, p_share_contacts boolean)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.update_my_profile(p_phone, p_share_contacts); $$;

-- -----------------------------------------------------------------------------
-- Risultati dei sondaggi: voti e somma dei millesimi di chi ha votato,
-- più il totale dei millesimi in anagrafica (per le percentuali)
-- -----------------------------------------------------------------------------
create function private.poll_results(p_poll_id bigint)
returns table (option_id bigint, votes bigint, millesimi numeric, total_millesimi numeric)
language sql stable security definer set search_path = ''
as $$
  select
    o.id,
    count(v.user_id),
    coalesce(sum(r.millesimi), 0),
    (select coalesce(sum(millesimi), 0) from public.residents)
  from public.poll_options o
  left join public.votes v on v.option_id = o.id
  left join public.residents r on r.user_id = v.user_id
  where o.poll_id = p_poll_id and auth.uid() is not null
  group by o.id;
$$;

create function public.poll_results(p_poll_id bigint)
returns table (option_id bigint, votes bigint, millesimi numeric, total_millesimi numeric)
language sql stable security invoker set search_path = ''
as $$ select * from private.poll_results(p_poll_id); $$;

revoke execute on function
  private.directory(), public.directory(),
  private.update_my_profile(text, boolean), public.update_my_profile(text, boolean),
  private.poll_results(bigint), public.poll_results(bigint)
  from public, anon;
grant execute on function
  private.directory(), public.directory(),
  private.update_my_profile(text, boolean), public.update_my_profile(text, boolean),
  private.poll_results(bigint), public.poll_results(bigint)
  to authenticated;

notify pgrst, 'reload schema';
