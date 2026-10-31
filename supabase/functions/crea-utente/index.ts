// Lemmi - funzione "crea-utente" (Supabase Edge Function)
// Crea un nuovo utente dell'app con il suo profilo. La può usare solo l'amministratore.
// La chiave "service_role" resta qui dentro, su Supabase, e non arriva mai nel sito.
// Aggiornamento 35: accetta anche il profilo "fratello" (area Fratelli in sola lettura),
// che deve essere collegato a un Fratello dell'anagrafica (dall'e-mail o scelto nell'app).
import { createClient } from 'npm:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const PROFILI = ['amministratore', 'venerabile', 'segretario', 'tesoriere', 'fratello'];
const risposta = (dati: unknown, stato = 200) =>
  new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. chi chiama deve essere un amministratore
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return risposta({ errore: 'Accesso richiesto.' }, 401);
    const { data: chi, error: eChi } = await admin.auth.getUser(token);
    if (eChi || !chi?.user) return risposta({ errore: 'Accesso non valido: esci e rientra nell’app.' }, 401);
    const { data: prof } = await admin.from('profili').select('ruolo').eq('user_id', chi.user.id).maybeSingle();
    if (!prof || String(prof.ruolo) !== 'amministratore') return risposta({ errore: 'Solo l’amministratore può creare utenti.' }, 403);

    // 2. dati del nuovo utente
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    const nome = String(b.nome || '').trim();
    const ruolo = String(b.ruolo || '');
    const password = String(b.password || '');
    let fratelloId: string | null = b.fratello_id ? String(b.fratello_id) : null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return risposta({ errore: 'E-mail non valida.' }, 400);
    if (!PROFILI.includes(ruolo)) return risposta({ errore: 'Profilo non valido.' }, 400);
    if (password.length < 8) return risposta({ errore: 'La password deve avere almeno 8 caratteri.' }, 400);

    // il Fratello dell'anagrafica: scelto nell'app oppure riconosciuto dall'e-mail
    if (!fratelloId) {
      const { data: fr } = await admin.from('fratelli').select('id').ilike('email', email).limit(2);
      if (fr && fr.length === 1) fratelloId = fr[0].id;
    }
    if (ruolo === 'fratello' && !fratelloId) {
      return risposta({ errore: 'Per il profilo «Fratello» scegli il Fratello dell’anagrafica (o inserisci in anagrafica la stessa e-mail).' }, 400);
    }

    // 3. creazione dell'utente (e-mail già confermata: entra subito con la password temporanea)
    const { data: nuovo, error: eNuovo } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { nome_visualizzato: nome },
    });
    if (eNuovo || !nuovo?.user) {
      const msg = eNuovo?.message || 'errore';
      return risposta({ errore: /already|registered|exists/i.test(msg) ? 'Esiste già un utente con questa e-mail.' : 'Utente non creato: ' + msg }, 400);
    }

    // 4. profilo nell'app
    const { error: eProf } = await admin.from('profili').upsert({
      user_id: nuovo.user.id, ruolo, nome_visualizzato: nome || null, fratello_id: fratelloId,
    });
    if (eProf) {
      await admin.auth.admin.deleteUser(nuovo.user.id);   // niente utenti a metà
      return risposta({ errore: 'Profilo non salvato: ' + eProf.message }, 500);
    }
    return risposta({ ok: true, user_id: nuovo.user.id, fratello_id: fratelloId });
  } catch (e) {
    return risposta({ errore: 'Errore imprevisto: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
