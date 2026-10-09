-- =============================================================================
-- Codice dell'unità immobiliare (es. "002.3.076D", dalle tabelle millesimali
-- dell'amministratore): permette di abbinare gli aggiornamenti per codice
-- invece che per nome. Una scheda con più unità può riportare più codici
-- separati da virgola.
-- Da eseguire UNA volta: Supabase > SQL Editor > New query > Run
-- =============================================================================

alter table public.residents add column if not exists unit_code text;

create unique index if not exists residents_unit_code_key
  on public.residents (unit_code) where unit_code is not null;
