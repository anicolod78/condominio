-- =============================================================================
-- Portale Condominio - schema del database Supabase
-- Da eseguire UNA volta in: Supabase > SQL Editor > New query > Run
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Profili: uno per ogni utente invitato (creato automaticamente dal trigger)
-- -----------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  unit        text,                    -- es. "Scala A - Int. 3"
  role        text not null default 'condomino' check (role in ('condomino', 'admin')),
  created_at  timestamptz not null default now()
);

-- security definer: legge profiles senza passare dalle policy (evita ricorsione)
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Contenuti
-- -----------------------------------------------------------------------------
create table public.announcements (
  id          bigint generated always as identity primary key,
  title       text not null,
  body        text not null default '',
  pinned      boolean not null default false,
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.documents (
  id          bigint generated always as identity primary key,
  title       text not null,
  category    text not null default 'Altro',
  file_path   text not null unique,     -- percorso nel bucket "documenti"
  file_name   text not null,
  size_bytes  bigint,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.polls (
  id          bigint generated always as identity primary key,
  question    text not null,
  description text not null default '',
  closes_at   timestamptz,              -- null = aperto finché non viene chiuso
  created_by  uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table public.poll_options (
  id          bigint generated always as identity primary key,
  poll_id     bigint not null references public.polls (id) on delete cascade,
  label       text not null,
  position    int not null default 0,
  unique (id, poll_id)
);

-- Un solo voto per utente e sondaggio; l'opzione deve appartenere al sondaggio
create table public.votes (
  poll_id     bigint not null references public.polls (id) on delete cascade,
  option_id   bigint not null,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (poll_id, user_id),
  foreign key (option_id, poll_id) references public.poll_options (id, poll_id) on delete cascade
);

create index on public.poll_options (poll_id);
create index on public.votes (option_id);

create or replace function public.poll_is_open(p_poll_id bigint)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.polls
    where id = p_poll_id and (closes_at is null or closes_at > now())
  );
$$;

-- Risultati aggregati: i singoli voti restano visibili solo a chi li ha espressi
create or replace function public.poll_results(p_poll_id bigint)
returns table (option_id bigint, votes bigint)
language sql stable security definer set search_path = public
as $$
  select o.id, count(v.user_id)
  from public.poll_options o
  left join public.votes v on v.option_id = o.id
  where o.poll_id = p_poll_id and auth.uid() is not null
  group by o.id;
$$;

-- Usata dal workflow "keepalive" per evitare la pausa del progetto gratuito
create or replace function public.ping()
returns text
language sql stable
as $$ select 'ok'; $$;

-- -----------------------------------------------------------------------------
-- Permessi: nessun accesso anonimo; gli utenti autenticati sono filtrati da RLS
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.is_admin(), public.poll_is_open(bigint), public.poll_results(bigint) to authenticated;
grant execute on function public.ping() to anon, authenticated;

alter table public.profiles      enable row level security;
alter table public.announcements enable row level security;
alter table public.documents     enable row level security;
alter table public.polls         enable row level security;
alter table public.poll_options  enable row level security;
alter table public.votes         enable row level security;

-- Profili: ognuno vede il proprio, l'admin vede e modifica tutti
create policy "profili: lettura propria o admin" on public.profiles
  for select to authenticated using (id = (select auth.uid()) or public.is_admin());
create policy "profili: modifica admin" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Avvisi, documenti, sondaggi: tutti i condomini leggono, solo l'admin gestisce
create policy "avvisi: lettura" on public.announcements
  for select to authenticated using (true);
create policy "avvisi: gestione admin" on public.announcements
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "documenti: lettura" on public.documents
  for select to authenticated using (true);
create policy "documenti: gestione admin" on public.documents
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "sondaggi: lettura" on public.polls
  for select to authenticated using (true);
create policy "sondaggi: gestione admin" on public.polls
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "opzioni: lettura" on public.poll_options
  for select to authenticated using (true);
create policy "opzioni: gestione admin" on public.poll_options
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Voti: ognuno vede, inserisce e cambia solo il proprio, e solo a sondaggio aperto
create policy "voti: lettura propri" on public.votes
  for select to authenticated using (user_id = (select auth.uid()));
create policy "voti: inserimento proprio" on public.votes
  for insert to authenticated
  with check (user_id = (select auth.uid()) and public.poll_is_open(poll_id));
create policy "voti: modifica proprio" on public.votes
  for update to authenticated
  using (user_id = (select auth.uid()) and public.poll_is_open(poll_id))
  with check (user_id = (select auth.uid()) and public.poll_is_open(poll_id));

-- -----------------------------------------------------------------------------
-- Storage: bucket privato per i file (limite 25 MB per file)
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('documenti', 'documenti', false, 26214400)
on conflict (id) do nothing;

create policy "file documenti: lettura condomini" on storage.objects
  for select to authenticated using (bucket_id = 'documenti');
create policy "file documenti: caricamento admin" on storage.objects
  for insert to authenticated with check (bucket_id = 'documenti' and public.is_admin());
create policy "file documenti: eliminazione admin" on storage.objects
  for delete to authenticated using (bucket_id = 'documenti' and public.is_admin());
