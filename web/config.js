// Configurazione pubblica del portale.
//
// URL e chiave "publishable" (o "anon") di Supabase sono fatti per stare nel browser:
// i dati sono protetti dalle regole RLS definite in supabase/schema.sql.
// NON inserire MAI qui la chiave "secret" / "service_role".

export const SUPABASE_URL = 'https://nkfonqmlpyhaqxlcdicf.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_bndPJSfzu-FqtKAWYuIXhQ_W2O9R2DP';

export const NOME_CONDOMINIO = 'Condominio Italia 71';

export const CATEGORIE_DOCUMENTI = [
  'Verbali assemblea',
  'Bilanci e rendiconti',
  'Regolamento',
  'Contratti e preventivi',
  'Comunicazioni',
  'Altro',
];
