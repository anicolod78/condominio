-- =============================================================================
-- Data di riferimento dei documenti (es. data dell'assemblea o del bilancio)
-- Da eseguire UNA volta: Supabase > SQL Editor > New query > Run
-- =============================================================================

alter table public.documents add column if not exists document_date date;

-- Per i documenti già caricati si usa la data di caricamento
update public.documents set document_date = created_at::date where document_date is null;

alter table public.documents
  alter column document_date set default current_date,
  alter column document_date set not null;

create index if not exists documents_document_date_idx on public.documents (document_date desc);
