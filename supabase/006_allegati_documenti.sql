-- =============================================================================
-- Allegati dei documenti: un file zip facoltativo collegato a ogni documento
-- Da eseguire UNA volta: Supabase > SQL Editor > New query > Run
-- =============================================================================

alter table public.documents
  add column if not exists attachment_path text unique,   -- percorso nel bucket "documenti"
  add column if not exists attachment_name text,
  add column if not exists attachment_size bigint;

-- Gli zip possono essere pesanti: limite per file portato a 50 MB,
-- il massimo consentito dal piano gratuito di Supabase
update storage.buckets set file_size_limit = 52428800 where id = 'documenti';
