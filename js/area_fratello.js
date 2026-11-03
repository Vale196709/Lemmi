/* Lemmi - Area del Fratello: con il profilo "fratello" ciascuno vede SOLO i propri dati
 * (anagrafica, storia, tavole, quote) e le prossime tornate del suo grado. Sola lettura.
 * Le regole di sicurezza del database (lemmi_aggiornamento_35.sql) garantiscono che non possa leggere altro. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, esc, chk, fmtData, eur, oggi } = L;

  const GRADI = ['apprendista', 'compagno', 'maestro'];
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const BADGE = { Pagato: 'ok', Esente: 'gray', Parziale: 'warn', Scaduto: 'bad', 'Da pagare': 'info' };
  const TIPO_T = { ordinaria: 'Tornata rituale', informale: 'Conferenza via web', straordinaria: 'Tornata straordinaria', agape: 'Agape' };
  const leggi = async (q) => { try { return chk(await q); } catch (e) { return []; } };

  L.vistaFratello = async function (v) {
    const fr = (await leggi(state.sb.from('fratelli').select('*').limit(2)))[0];
    const head = `<div class="page-head"><div><h1>La mia scheda</h1><p>${esc(state.loggia.nome || 'La tua Loggia')}${state.loggia.oriente ? ' · Oriente di ' + esc(state.loggia.oriente) : ''}</p></div></div>`;
    if (!fr) {
      v.innerHTML = head + `<div class="notice">Il tuo accesso non è ancora collegato alla tua scheda in anagrafica. Chiedi all’amministratore di collegarlo (Info di sistema › Utenti del sistema).</div>`;
      return;
    }
    const [pass, car, lav, quote, tor] = await Promise.all([
      leggi(state.sb.from('passaggi_grado').select('grado,anno,data').order('data')),
      leggi(state.sb.from('cariche_storico').select('carica,anno_dal,anno_al,note').order('anno_dal')),
      leggi(state.sb.from('lavori').select('titolo,tipo,stato,data_consegna_prevista,data_presentazione,tornata_id').order('data_assegnazione', { ascending: false })),
      leggi(state.sb.rpc('mie_quote')),
      leggi(state.sb.from('tornate').select('*').gte('data', oggi()).neq('stato', 'annullata').order('data').limit(20)),
    ]);
    const mioGrado = pass.reduce((m, p) => Math.max(m, GRADI.indexOf(String(p.grado))), 0);
    const tornate = tor.filter((t) => !pass.length || !t.grado || GRADI.indexOf(String(t.grado)) <= mioGrado).slice(0, 5);   // grado non registrato: si mostrano tutte
    const aperte = quote.filter((q) => Number(q.residuo) > 0 && q.stato !== 'Esente');
    const daVersare = aperte.reduce((a, q) => a + Number(q.residuo), 0);

    const storia = [];
    if (fr.data_iniziazione || fr.anno_iniziazione) storia.push({ tipo: 0, k: fr.data_iniziazione || String(fr.anno_iniziazione), t: 'Iniziazione', d: fr.data_iniziazione ? fmtData(fr.data_iniziazione) : String(fr.anno_iniziazione) });
    pass.filter((p) => p.grado !== 'apprendista').forEach((p) => storia.push({ tipo: 1, k: p.data || String(p.anno || ''), t: p.grado === 'compagno' ? 'Passaggio a Compagno d’Arte' : 'Elevazione a Maestro', d: p.data ? fmtData(p.data) : (p.anno || '') }));
    car.forEach((c) => storia.push({ tipo: 2, k: String(c.anno_dal || ''), t: c.carica, d: c.anno_dal ? (c.anno_al && c.anno_al !== c.anno_dal ? c.anno_dal + '–' + c.anno_al : String(c.anno_dal)) : '', n: c.note }));
    storia.sort((a, b) => String(a.k).localeCompare(String(b.k)));

    const kv = (l, x) => `<div><span>${l}</span><b>${x ? esc(x) : '—'}</b></div>`;
    v.innerHTML = head + `
      <div class="cr-strip">
        <div class="cr-kpis">
          <div class="cr-kpi"><b>${esc(fr.cognome)} ${esc(fr.nome)}</b></div>
          ${pass.length ? `<div class="cr-kpi"><span>Grado</span> <b style="font-size:1rem">${esc(cap(GRADI[mioGrado]))}</b></div>` : ''}
          ${fr.matricola ? `<div class="cr-kpi"><span>Matricola</span> <b style="font-size:1rem">${esc(fr.matricola)}</b></div>` : ''}
          <div class="cr-kpi"><span>Da versare</span> <b style="font-size:1rem;color:${daVersare > 0 ? 'var(--bad)' : 'var(--ok)'}">${eur(daVersare)}</b></div>
        </div>
      </div>
      <div class="grid cols-2">
        <div class="card"><h2>Prossime tornate</h2>
          ${tornate.length ? `<div class="table-wrap"><table><tbody>${tornate.map((t) => `<tr><td><b>${fmtData(t.data)}</b>${t.ora ? `<div class="hint">ore ${esc(String(t.ora).slice(0, 5))}</div>` : ''}</td>
            <td data-tornata="${esc(t.id)}">${esc(TIPO_T[t.tipo] || cap(t.tipo))}${t.grado ? ` <span class="badge gold">${esc(cap(t.grado))}</span>` : ''}
              ${t.ordine_del_giorno ? `<div class="hint">${esc(t.ordine_del_giorno)}</div>` : ''}
              ${t.link_online && /^https:\/\//i.test(t.link_online) ? `<div><a href="${esc(t.link_online)}" target="_blank" rel="noopener">Collegamento online</a></div>` : t.luogo ? `<div class="hint">${esc(t.luogo)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>
            <div style="margin-top:10px"><a href="#/calendario">Tutto il calendario</a></div>` : '<div class="empty"><div>Nessuna tornata in calendario.</div></div>'}</div>
        <div class="card"><h2>Le mie quote</h2>
          ${quote.length ? `<div class="table-wrap"><table><thead><tr><th>Voce</th><th class="num">Da versare</th><th>Stato</th></tr></thead><tbody>${quote.slice(0, 12).map((q) => `<tr>
            <td><b>${esc(q.voce)}</b> ${esc(q.anno)}${q.rate_totali > 1 ? ` <span class="muted">· rata ${q.rata_n}/${q.rate_totali}</span>` : ''}<div class="hint">${eur(q.importo_dovuto)}${q.data_scadenza ? ' · scadenza ' + fmtData(q.data_scadenza) : ''}</div></td>
            <td class="num"><b>${eur(q.residuo)}</b></td><td>${L.badgeStato(L.statoQuota(q), L.statoQuota(q))}</td></tr>`).join('')}</tbody></table></div>
            <p class="hint" style="margin-top:8px">Per versamenti o chiarimenti rivolgiti al Tesoriere.</p>` : '<div class="empty"><div>Nessuna quota registrata.</div></div>'}</div>
        <div class="card"><h2>La mia storia</h2>
          ${storia.length ? `<div class="timeline tl-v">${storia.map((s) => L.vocetl({ tipo: s.tipo, etichetta: s.d, titolo: s.t, dettaglio: s.n })).join('')}</div>` : '<div class="empty"><div>Nessun dato registrato.</div></div>'}</div>
        <div class="card"><h2>Le mie tavole</h2>
          ${lav.length ? `<div class="table-wrap"><table><tbody>${lav.map((l) => `<tr><td><b>${esc(l.titolo)}</b><div class="hint">${esc(cap(l.tipo))} · ${l.data_presentazione ? 'presentata il ' + fmtData(l.data_presentazione) : l.data_consegna_prevista ? 'consegna entro il ' + fmtData(l.data_consegna_prevista) : 'senza data'}</div></td>
            <td><span class="badge ${l.stato === 'presentato' ? 'ok' : 'gray'}">${esc(cap(String(l.stato).replace('_', ' ')))}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty"><div>Nessuna tavola registrata.</div></div>'}</div>
      </div>
      <div class="card"><h2>I miei dati</h2><div class="kv">
        ${kv('Data di nascita', fr.data_nascita ? fmtData(fr.data_nascita) : '')}${kv('Luogo di nascita', [fr.luogo_nascita, fr.provincia_nascita ? '(' + fr.provincia_nascita + ')' : ''].filter(Boolean).join(' '))}
        ${kv('Indirizzo', [fr.indirizzo, fr.cap, fr.citta, fr.provincia ? '(' + fr.provincia + ')' : ''].filter(Boolean).join(' '))}
        ${kv('Professione', fr.professione)}${kv('Cellulare', fr.cellulare)}${kv('E-mail', fr.email)}
      </div><p class="hint" style="margin-top:12px">Se un dato è sbagliato o manca, comunicalo al Segretario. Le notifiche sul telefono si attivano da «Il mio accesso».</p></div>`;
    if (L.agapi) { try { await L.agapi.montaFratello(v, tornate); } catch (e) { /* facoltativo */ } }
  };
})();
