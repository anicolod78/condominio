// Edge Function "gestione-utenti": invito e rimozione dei condomini dal portale.
// Usa la chiave secret di Supabase, che resta qui e non arriva mai nel browser.
// Va pubblicata con "Verify JWT" disattivato: l'utente viene verificato qui sotto.

import { createClient } from 'npm:@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function secretKey() {
  const keys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keys) return JSON.parse(keys).default;
  return Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Metodo non consentito' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Solo un admin del portale può usare questa funzione
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Non autenticato' }, 401);
  const { data: { user }, error: authError } = await admin.auth.getUser(token);
  if (authError || !user) return json({ error: 'Sessione non valida' }, 401);

  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') return json({ error: 'Operazione riservata agli amministratori' }, 403);

  const body = await req.json().catch(() => ({}));

  if (body.action === 'invite') {
    const email = String(body.email ?? '').trim().toLowerCase();
    if (!EMAIL.test(email)) return json({ error: 'Indirizzo email non valido' }, 400);

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo: body.redirectTo });
    if (error) {
      const exists = /already been registered/i.test(error.message);
      return json({ error: exists ? 'Questo indirizzo è già registrato' : error.message }, 400);
    }

    // Il profilo è già stato creato dal trigger: si completano nome e unità
    await admin.from('profiles')
      .update({ full_name: body.full_name?.trim() || null, unit: body.unit?.trim() || null })
      .eq('id', data.user.id);
    return json({ ok: true });
  }

  if (body.action === 'delete') {
    if (!body.user_id) return json({ error: 'Utente non indicato' }, 400);
    if (body.user_id === user.id) return json({ error: 'Non puoi rimuovere te stesso' }, 400);

    const { error } = await admin.auth.admin.deleteUser(body.user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  return json({ error: 'Azione non riconosciuta' }, 400);
});
