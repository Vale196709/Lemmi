// Lemmi - funzione "gestisci-utente" (Supabase Edge Function)
// Disattiva, riattiva o elimina l'accesso di un utente dell'app. La può usare solo l'amministratore.
//  - disattiva: l'utente non può più accedere, ma profilo e collegamento al Fratello restano (si può riattivare)
//  - riattiva:  l'utente torna ad accedere con la sua password di sempre
//  - elimina:   toglie utente di accesso e profilo (non si annulla)
// Non tocca l'anagrafica: il Fratello resta con tutta la sua storia.
// La chiave "service_role" resta qui dentro, su Supabase, e non arriva mai nel sito.
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const risposta = (dati: unknown, stato = 200) =>
  new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } });
const AZIONI = ['disattiva', 'riattiva', 'elimina'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const chiave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, chiave, { auth: { persistSession: false, autoRefreshToken: false } });

    // 1. chi chiama deve essere un amministratore
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return risposta({ errore: 'Accesso richiesto.' }, 401);
    const comeUtente = createClient(url, chiave, {
      auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: 'Bearer ' + token } },
    });
    const { data: eAdmin, error: eChi } = await comeUtente.rpc('lemmi_e_admin');
    if (eChi) return risposta({ errore: 'Accesso non riconosciuto: esci e rientra nell’app (' + eChi.message + ').' }, 401);
    if (eAdmin !== true) return risposta({ errore: 'Solo l’amministratore può gestire gli utenti.' }, 403);

    // 2. cosa fare e su chi
    const b = await req.json().catch(() => ({}));
    const azione = String(b.azione || '');
    const userId = String(b.user_id || '').trim();
    if (!AZIONI.includes(azione)) return risposta({ errore: 'Azione non valida.' }, 400);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return risposta({ errore: 'Utente non valido.' }, 400);
    }

    // 3. non si può agire su sé stessi (si resterebbe senza amministratore)
    const { data: chi } = await admin.auth.getUser(token);
    if (chi?.user?.id === userId) return risposta({ errore: 'Non puoi disattivare o eliminare il tuo stesso utente.' }, 400);

    // 4. l'utente deve esistere
    const { data: esiste, error: eTrova } = await admin.auth.admin.getUserById(userId);
    if (eTrova || !esiste?.user) return risposta({ errore: 'Utente non trovato (forse è già stato eliminato).' }, 404);
    const email = esiste.user.email || null;

    // 5. esecuzione
    if (azione === 'elimina') {
      await admin.from('profili').delete().eq('user_id', userId);   // il profilo cadrebbe a cascata: lo togliamo comunque
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return risposta({ errore: 'Utente non eliminato: ' + error.message }, 500);
    } else {
      // disattivazione = blocco dell'accesso (circa 100 anni); riattivazione = nessun blocco
      const { error } = await admin.auth.admin.updateUserById(userId, { ban_duration: azione === 'disattiva' ? '876000h' : 'none' });
      if (error) return risposta({ errore: 'Operazione non riuscita: ' + error.message }, 500);
    }
    return risposta({ ok: true, azione, email });
  } catch (e) {
    return risposta({ errore: 'Errore imprevisto: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
