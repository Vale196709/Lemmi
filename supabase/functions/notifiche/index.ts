// Lemmi - funzione "notifiche" (Supabase Edge Function): avvisi sul telefono (Web Push, gratuito, senza servizi esterni)
//
// Azioni (corpo JSON {"azione": ...}):
//   "chiave" -> restituisce la chiave pubblica con cui il telefono si iscrive (la crea la prima volta)
//   "prova"  -> manda subito un avviso di prova ai dispositivi di chi la chiama (serve aver fatto l'accesso)
//   "invia"  -> controlla tornate, votazioni, quote e tavole e manda gli avvisi del giorno (la chiama il database ogni mattina)
// Ogni avviso parte una sola volta (registro push_inviati), quindi richiamare "invia" più volte non crea doppioni.
// Le chiavi stanno nella tabella push_chiavi, leggibile solo da questa funzione.
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const risposta = (dati: unknown, stato = 200) =>
  new Response(JSON.stringify(dati), { status: stato, headers: { ...CORS, 'Content-Type': 'application/json' } });

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// date in ora italiana
const isoRoma = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
const traGiorni = (n: number) => isoRoma(new Date(Date.now() + n * 86400000));
const it = (iso: string) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : '';
const eur = (n: number) => n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

async function chiavi() {
  const { data } = await db.from('push_chiavi').select('pubblica, privata').eq('id', 1).maybeSingle();
  if (data) return data;
  const k = webpush.generateVAPIDKeys();
  await db.from('push_chiavi').upsert({ id: 1, pubblica: k.publicKey, privata: k.privateKey });
  const { data: salvate } = await db.from('push_chiavi').select('pubblica, privata').eq('id', 1).single();
  return salvate!;
}

type Avviso = { chiave: string; titolo: string; testo: string; url: string };

async function spedisci(userIds: string[] | null, avvisi: Map<string, Avviso[]>) {
  const k = await chiavi();
  webpush.setVapidDetails('mailto:noreply@lemmi.app', k.pubblica, k.privata);
  let q = db.from('push_iscrizioni').select('endpoint, user_id, chiavi');
  if (userIds) q = q.in('user_id', userIds);
  const { data: iscr } = await q;
  let inviati = 0, rimossi = 0;
  for (const s of iscr || []) {
    for (const a of avvisi.get(s.user_id) || []) {
      const chiaveDisp = a.chiave + '|' + s.endpoint.slice(-40);
      if (!a.chiave.startsWith('prova|')) {
        const { error: dup } = await db.from('push_inviati').insert({ chiave: chiaveDisp });
        if (dup) continue;                                   // già inviato a questo dispositivo
      }
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: s.chiavi }, JSON.stringify({ titolo: a.titolo, testo: a.testo, url: a.url }), { TTL: 86400 });
        inviati++;
      } catch (e) {
        const st = (e as { statusCode?: number }).statusCode;
        if (st === 404 || st === 410) { await db.from('push_iscrizioni').delete().eq('endpoint', s.endpoint); rimossi++; break; }
      }
    }
  }
  return { inviati, rimossi };
}

const GRADI = ['apprendista', 'compagno', 'maestro'];

async function avvisiDelGiorno() {
  const oggi = traGiorni(0), domani = traGiorni(1), tra3 = traGiorni(3), tra7 = traGiorni(7);
  const { data: prof } = await db.from('profili').select('user_id, ruolo, fratello_id');
  const { data: utentiIscritti } = await db.from('push_iscrizioni').select('user_id');
  const iscritti = new Set((utentiIscritti || []).map((x) => x.user_id));
  const profili = (prof || []).filter((p) => iscritti.has(p.user_id));
  const avvisi = new Map<string, Avviso[]>();
  const add = (u: string, a: Avviso) => { if (!avvisi.has(u)) avvisi.set(u, []); avvisi.get(u)!.push(a); };
  if (!profili.length) return avvisi;

  // tornate di domani
  const { data: tornate } = await db.from('tornate').select('id, data, ora, tipo, grado, luogo, link_online, stato').eq('data', domani).neq('stato', 'annullata');
  // grado dei Fratelli (ultimo passaggio)
  const idsFr = profili.map((p) => p.fratello_id).filter(Boolean);
  const gradoDi = new Map<string, number>();
  if (idsFr.length) {
    const { data: pg } = await db.from('passaggi_grado').select('fratello_id, grado').in('fratello_id', idsFr);
    (pg || []).forEach((r) => gradoDi.set(r.fratello_id, Math.max(gradoDi.get(r.fratello_id) ?? 0, GRADI.indexOf(String(r.grado)))));
  }
  for (const t of tornate || []) {
    const g = GRADI.indexOf(String(t.grado || 'apprendista'));
    const testo = `${t.tipo === 'informale' ? 'Conferenza via web' : 'Tornata'}${t.grado ? ' di ' + t.grado : ''} domani${t.ora ? ' alle ' + String(t.ora).slice(0, 5) : ''}${t.luogo ? ' · ' + t.luogo : ''}`;
    for (const p of profili) {
      if (String(p.ruolo) === 'fratello' && p.fratello_id && gradoDi.has(p.fratello_id) && gradoDi.get(p.fratello_id)! < g) continue;  // tornata di grado superiore
      add(p.user_id, { chiave: `tornata|${t.id}|${p.user_id}`, titolo: 'Promemoria tornata', testo, url: '#/calendario' });
    }
  }

  // votazioni dei bussanti tra 7 giorni e domani (Venerabile, Segretario, amministratore)
  const { data: bus } = await db.from('bussanti').select('id, cognome, nome, data_prima_votazione, data_seconda_votazione');
  for (const b of bus || []) {
    for (const [campo, nome] of [['data_prima_votazione', 'Prima votazione'], ['data_seconda_votazione', 'Seconda votazione']] as const) {
      const d = (b as Record<string, string | null>)[campo];
      if (d !== tra7 && d !== domani) continue;
      for (const p of profili.filter((x) => ['amministratore', 'venerabile', 'segretario'].includes(String(x.ruolo)))) {
        add(p.user_id, { chiave: `vot|${b.id}|${campo}|${d}|${p.user_id}`, titolo: nome + (d === domani ? ' domani' : ' tra una settimana'), testo: `${b.cognome} ${b.nome} · ${it(d!)}`, url: '#/bussanti/' + b.id });
      }
    }
  }

  // quote in scadenza tra 7 giorni
  const { data: sc } = await db.from('scadenze').select('id, fratello_id, importo_dovuto, data_scadenza, voce_id').eq('data_scadenza', tra7);
  if (sc && sc.length) {
    const ids = sc.map((s) => s.id);
    const { data: vers } = await db.from('versamenti').select('scadenza_id, importo').in('scadenza_id', ids);
    const versato = new Map<string, number>();
    (vers || []).forEach((v) => versato.set(v.scadenza_id, (versato.get(v.scadenza_id) || 0) + Number(v.importo)));
    const aperte = sc.filter((s) => Number(s.importo_dovuto) - (versato.get(s.id) || 0) > 0);
    const { data: voci } = await db.from('voci_quota').select('id, nome');
    const nomeVoce = new Map((voci || []).map((v) => [v.id, v.nome]));
    if (aperte.length) {
      const tot = aperte.reduce((a, s) => a + Number(s.importo_dovuto) - (versato.get(s.id) || 0), 0);
      for (const p of profili.filter((x) => ['amministratore', 'tesoriere'].includes(String(x.ruolo)))) {
        add(p.user_id, { chiave: `quote|${tra7}|${p.user_id}`, titolo: 'Quote in scadenza', testo: `${aperte.length} ${aperte.length === 1 ? 'quota' : 'quote'} da incassare entro il ${it(tra7)} · ${eur(tot)}`, url: '#/pagamenti/scadenze' });
      }
      for (const p of profili.filter((x) => String(x.ruolo) === 'fratello' && x.fratello_id)) {
        for (const s of aperte.filter((x) => x.fratello_id === p.fratello_id)) {
          add(p.user_id, { chiave: `miaquota|${s.id}|${p.user_id}`, titolo: 'Quota in scadenza', testo: `${nomeVoce.get(s.voce_id) || 'Quota'}: ${eur(Number(s.importo_dovuto) - (versato.get(s.id) || 0))} entro il ${it(tra7)}`, url: '#/' });
        }
      }
    }
  }

  // tavole da consegnare tra 3 giorni (al Fratello autore)
  const { data: lav } = await db.from('lavori').select('id, titolo, fratello_id, data_consegna_prevista, stato').eq('data_consegna_prevista', tra3);
  for (const l of lav || []) {
    if (['presentato', 'consegnato', 'archiviato'].includes(String(l.stato))) continue;
    for (const p of profili.filter((x) => x.fratello_id === l.fratello_id)) {
      add(p.user_id, { chiave: `tavola|${l.id}|${p.user_id}`, titolo: 'Consegna della tavola', testo: `«${l.titolo}» va consegnata entro il ${it(tra3)}`, url: '#/' });
    }
  }
  void oggi;
  return avvisi;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const b = await req.json().catch(() => ({}));
    const azione = String(b.azione || '');
    if (azione === 'chiave') return risposta({ chiave: (await chiavi()).pubblica });

    if (azione === 'prova') {
      const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
      const { data: chi } = token ? await db.auth.getUser(token) : { data: null };
      if (!chi?.user) return risposta({ errore: 'Accesso richiesto.' }, 401);
      const m = new Map<string, Avviso[]>([[chi.user.id, [{ chiave: 'prova|' + Date.now(), titolo: 'Lemmi', testo: 'Le notifiche funzionano su questo dispositivo.', url: '#/' }]]]);
      return risposta(await spedisci([chi.user.id], m));
    }

    if (azione === 'invia') {
      const avvisi = await avvisiDelGiorno();
      if (!avvisi.size) return risposta({ inviati: 0, nota: 'nessun avviso oggi' });
      return risposta(await spedisci([...avvisi.keys()], avvisi));
    }
    return risposta({ errore: 'Azione sconosciuta.' }, 400);
  } catch (e) {
    return risposta({ errore: 'Errore imprevisto: ' + (e instanceof Error ? e.message : String(e)) }, 500);
  }
});
