-- =============================================================================
-- Elenco condomini
-- Da eseguire UNA volta, dopo schema.sql: Supabase > SQL Editor > New query > Run
-- =============================================================================

alter table public.profiles
  add column if not exists phone text,
  add column if not exists share_contacts boolean not null default false;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Rimuove eventuali versioni precedenti di questo script
drop function if exists public.directory();
drop function if exists public.update_my_profile(text, text, boolean);

-- Elenco visibile a tutti i condomini: nome e unità sempre,
-- email e telefono solo per chi ha dato il consenso (o per il proprio profilo)
create or replace function private.directory()
returns table (id uuid, full_name text, unit text, email text, phone text, is_admin boolean)
language sql stable security definer set search_path = ''
as $$
  select
    p.id,
    p.full_name,
    p.unit,
    case when p.share_contacts or p.id = auth.uid() then p.email end,
    case when p.share_contacts or p.id = auth.uid() then p.phone end,
    p.role = 'admin'
  from public.profiles p
  where auth.uid() is not null
  order by p.unit nulls last, p.full_name nulls last;
$$;

-- Ognuno modifica solo i propri dati di contatto (non unità né ruolo)
create or replace function private.update_my_profile(p_full_name text, p_phone text, p_share_contacts boolean)
returns void
language sql volatile security definer set search_path = ''
as $$
  update public.profiles
  set full_name      = nullif(trim(p_full_name), ''),
      phone          = nullif(trim(p_phone), ''),
      share_contacts = coalesce(p_share_contacts, false)
  where id = auth.uid();
$$;

-- Involucri senza privilegi esposti alle API e richiamati dal sito
create function public.directory()
returns table (id uuid, full_name text, unit text, email text, phone text, is_admin boolean)
language sql stable security invoker set search_path = ''
as $$ select * from private.directory(); $$;

create function public.update_my_profile(p_full_name text, p_phone text, p_share_contacts boolean)
returns void
language sql volatile security invoker set search_path = ''
as $$ select private.update_my_profile(p_full_name, p_phone, p_share_contacts); $$;

revoke execute on function
  private.directory(), private.update_my_profile(text, text, boolean),
  public.directory(), public.update_my_profile(text, text, boolean)
  from public, anon;
grant execute on function
  private.directory(), private.update_my_profile(text, text, boolean),
  public.directory(), public.update_my_profile(text, text, boolean)
  to authenticated;

notify pgrst, 'reload schema';
