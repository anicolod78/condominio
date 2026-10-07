-- =============================================================================
-- Simulazione dei sondaggi: l'admin indica una risposta per ogni scheda
-- dell'anagrafica (anche senza accesso al portale) e vede i risultati in
-- millesimi. È separata dai voti reali e visibile solo agli admin.
-- Da eseguire UNA volta: Supabase > SQL Editor > New query > Run
-- =============================================================================

create table public.poll_simulations (
  poll_id     bigint not null references public.polls (id) on delete cascade,
  resident_id bigint not null references public.residents (id) on delete cascade,
  option_id   bigint not null,
  updated_at  timestamptz not null default now(),
  primary key (poll_id, resident_id),
  foreign key (option_id, poll_id) references public.poll_options (id, poll_id) on delete cascade
);

create index on public.poll_simulations (option_id);

revoke all on public.poll_simulations from anon;
grant select, insert, update, delete on public.poll_simulations to authenticated;
alter table public.poll_simulations enable row level security;

create policy "simulazioni: solo admin" on public.poll_simulations
  for all to authenticated using (private.is_admin()) with check (private.is_admin());
