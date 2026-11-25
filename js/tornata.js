/* Lemmi - Modalità «Tornata»: tutto quello che serve la sera della tornata in una sola schermata.
 * #/tornata          → la tornata di oggi, altrimenti la prossima
 * #/tornata/<id>     → una tornata precisa (dal Calendario)
 * Contiene: scheda della serata (modificabile), promemoria (votazioni, tavole, agape, ricorrenze), presenze P/G/A
 * con ospiti (anche senza rete: restano sul dispositivo), Tronco della Vedova (in Tesoreria con lo script 51)
 * e «Prepara il verbale», che porta tutto nel generatore di Template > Verbali.
 * Compilano Segretario e amministratore; il Venerabile vede in sola lettura. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, oggi, canEdit, eur } = L;

  const TIPI = { ordinaria: 'Ordinaria', informale: 'Conferenza (web)', straordinaria: 'Straordinaria', agape: 'Agape' };
  const GRADI = { apprendista: 'Apprendista', compagno: 'Compagno', maestro: 'Maestro' };
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const giorno = (iso) => { const [a, m, g] = iso.split('-').map(Number); return GIORNI[new Date(Date.UTC(a, m - 1, g)).getUTCDay()]; };
  const hhmm = (t) => (t ? String(t).slice(0, 5) : '');
  const PRES = [['presente', 'P', 'Presente', 'p'], ['giustificato', 'G', 'Assente giustificato', 'g'], ['assente', 'A', 'Assente', 'a']];
  const conPresenze = (t) => t && t.tipo !== 'informale' && t.tipo !== 'agape';
  const importo = (txt) => { const x = String(txt || '').trim().replace(/[€\s]/g, ''); if (x === '') return null; const n = Number(x.includes(',') ? x.replace(/\./g, '').replace(',', '.') : x); return isFinite(n) ? n : NaN; };

  /* ---------- bozza della serata sul dispositivo (funziona anche senza rete) ---------- */
  const chiave = (id) => 'lemmi.serata.' + id;
  const leggiBozza = (id) => { try { return JSON.parse(localStorage.getItem(chiave(id)) || 'null') || {}; } catch (e) { return {}; } };
  const scriviBozza = (id, b) => { try { localStorage.setItem(chiave(id), JSON.stringify(b)); } catch (e) { /* spazio esaurito: resta solo in pagina */ } };

  async function trovaTornata(id) {
    if (id) {
      try { return chk(await state.sb.from('tornate').select('*').eq('id', id).maybeSingle()); } catch (e) {
        const b = leggiBozza(id); if (b.t) { toast('Senza rete: uso i dati della tornata salvati su questo dispositivo.'); return b.t; }
        throw e;
      }
    }
    const lista = chk(await state.sb.from('tornate').select('*').gte('data', oggi()).neq('stato', 'annullata').order('data').order('ora').limit(5));
    return lista.find((t) => t.tipo !== 'agape') || lista[0] || null;
  }

  /* ---------- promemoria della serata ---------- */
  async function promemoria(t) {
    const voci = [], d = t.data;
    const prova = async (fn) => { try { await fn(); } catch (e) { /* facoltativo: tabella assente o nessun permesso */ } };
    await Promise.all([
      prova(async () => {
        const b = chk(await state.sb.from('bussanti').select('id,cognome,nome,data_prima_votazione,data_seconda_votazione').or(`data_prima_votazione.eq.${d},data_seconda_votazione.eq.${d}`));
        b.forEach((x) => voci.push({ o: 1, ic: '🗳️', html: `<b>${x.data_prima_votazione === d ? 'Prima' : 'Seconda'} votazione</b> del bussante <a href="#/bussanti/${esc(x.id)}">${esc(x.cognome)} ${esc(x.nome)}</a>` }));
      }),
      prova(async () => {
        const l = chk(await state.sb.from('lavori').select('id,titolo,fratello_id,autore_esterno,data_presentazione,data_discussione').or(`data_presentazione.eq.${d},data_discussione.eq.${d}`));
        if (!l.length) return;
        const fr = await L.caricaFratelli();
        const nome = (x) => { const f = fr.find((q) => q.id === x.fratello_id); return f ? f.cognome + ' ' + f.nome : (x.autore_esterno || ''); };
        l.forEach((x) => voci.push({ o: 2, ic: '📜', html: `<b>Tavola</b> «${esc(x.titolo)}»${nome(x) ? ' di ' + esc(nome(x)) : ''}${x.data_discussione === d && x.data_presentazione !== d ? ' (discussione)' : ''}` }));
      }),
      prova(async () => {
        if (!L.agapi) return;
        const tt = chk(await state.sb.from('tornate').select('*').eq('data', d).neq('stato', 'annullata'));
        const conA = tt.filter(L.agapi.haAgape);
        if (!conA.length) return;
        const c = await L.agapi.conteggi(conA.map((x) => x.id));
        conA.forEach((x) => voci.push({ o: 3, ic: '🍽️', html: `${L.agapi.badge(x, c[x.id])} <button type="button" class="btn ghost small" data-agape="${esc(x.id)}">Apri l’agape</button>`, t: x }));
      }),
      prova(async () => {
        if (!L.ricorrenze || d !== oggi()) return;
        const r = (await L.ricorrenze.ricorrenze()).filter((x) => x.giorni === 0);
        r.forEach((x) => voci.push({ o: 4, ic: x.tipo === 'cmp' ? '🎂' : '⭐', html: `<a href="#/fratelli/${esc(x.f.id)}">${esc(x.f.cognome)} ${esc(x.f.nome)}</a>: ${x.tipo === 'cmp' ? 'compie ' + x.anni + ' anni' : x.anni + (x.anni === 1 ? ' anno' : ' anni') + ' dall’iniziazione'}` }));
      }),
    ]);
    return voci.sort((a, b) => a.o - b.o);
  }

  /* ---------- presenze: chi può partecipare ---------- */
  async function eleggibili(grado) {
    if (!L.eleggibiliPerGrado) return [];
    const { attivi, gradoFr, GRADO_N } = await L.eleggibiliPerGrado();
    return attivi.filter((f) => { const n = gradoFr(f); return !n || n >= (GRADO_N[grado] || 1); });
  }

  // salva le presenze nel registro senza toccare l'eventuale testo del verbale già scritto
  async function salvaPresenze(t, grado, el, bozza) {
    const pres = el.map((f) => ({ fratello_id: String(f.id), esito: bozza.pres[f.id] || 'presente' }));
    const presenti = pres.filter((p) => p.esito === 'presente').length;
    const es = chk(await state.sb.from('verbali').select('id').eq('data', t.data).eq('grado', grado).maybeSingle());
    let id;
    if (es) { id = es.id; chk(await state.sb.from('verbali').update({ presenti, ospiti: bozza.ospiti || null, aggiornato_il: new Date().toISOString() }).eq('id', id)); }
    else id = chk(await state.sb.from('verbali').insert({ data: t.data, grado, presenti, ospiti: bozza.ospiti || null }).select('id').single()).id;
    chk(await state.sb.from('presenze_verbale').delete().eq('verbale_id', id));
    if (pres.length) chk(await state.sb.from('presenze_verbale').insert(pres.map((p) => ({ verbale_id: id, fratello_id: p.fratello_id, esito: p.esito }))));
  }

  async function troncoRegistrato(t) {
    try {
      const r = chk(await state.sb.from('versamenti').select('importo').eq('riferimento', 'tornata:' + t.id).limit(1));
      return r && r.length ? Number(r[0].importo) : null;
    } catch (e) { return undefined; }   // senza permesso o senza rete: non si sa
  }

  /* ---------- pagina ---------- */
  async function vista(v, parti) {
    const t = await trovaTornata(parti[1]);
    if (!t) {
      v.innerHTML = `<div class="page-head"><div><h1>Modalità Tornata</h1><p>Nessuna tornata in programma.</p></div></div>
        <div class="card empty">Non ci sono tornate da oggi in avanti nel Calendario. <a href="#/calendario">Apri il Calendario</a></div>`;
      return;
    }
    const scrive = canEdit();
    const bozza = Object.assign({ pres: {}, ospiti: '', tronco: '', grado: '' }, leggiBozza(t.id));
    bozza.t = t; scriviBozza(t.id, bozza);
    const grado = t.grado || bozza.grado || '';
    const oggiE = t.data === oggi();
    const [voci, el, tronco] = await Promise.all([
      promemoria(t),
      conPresenze(t) && grado ? eleggibili(grado).catch(() => []) : Promise.resolve([]),
      conPresenze(t) ? troncoRegistrato(t) : Promise.resolve(undefined),
    ]);
    const dove = t.tipo === 'informale' || t.link_online
      ? (t.link_online ? `<a href="${esc(t.link_online)}" target="_blank" rel="noopener">Apri il collegamento</a>` : '<span class="muted">collegamento da indicare</span>')
      : esc(t.luogo || '—');

    v.innerHTML = `
      <div class="crumb"><a href="#/calendario">Calendario</a> › Serata del ${fmtData(t.data)}</div>
      <div class="page-head"><div><h1>${oggiE ? 'Tornata di stasera' : 'Tornata del ' + fmtData(t.data)}</h1>
        <p>${esc(giorno(t.data))} ${fmtData(t.data)}${t.ora ? ' · ore ' + esc(hhmm(t.ora)) : ''} · <span class="badge info">${esc(TIPI[t.tipo] || t.tipo)}</span>${grado ? ' ' + L.badgeGrado(grado) : ''}${t.stato === 'annullata' ? ' <span class="badge bad">Annullata</span>' : ''}</p></div>
        <div class="right actions">${L.wa ? (L.wa.tornate[t.id] = t, L.wa.tornata(t)) : ''}${scrive && conPresenze(t) && grado ? '<button class="btn gold" id="tn-verbale" type="button">Prepara il verbale</button>' : ''}</div></div>
      ${scrive ? '' : '<div class="notice" style="margin-bottom:14px">Sola lettura: presenze, Tronco e verbale li compila il Segretario.</div>'}

      <div class="grid cols-2 tn-griglia">
        <div class="card"><div class="tn-h"><h2>La serata</h2>${scrive ? '<button class="btn ghost small" id="tn-mod" type="button">Modifica</button>' : ''}</div>
          <div class="kv">
            <div><span>Luogo / collegamento</span><b>${dove}</b></div>
            <div><span>Relatore</span><b>${esc(t.relatore || '—')}</b></div>
          </div>
          <h3 style="margin:14px 0 6px">Ordine del giorno</h3>
          <div class="tn-odg">${t.ordine_del_giorno ? esc(t.ordine_del_giorno) : '<span class="muted">Non ancora scritto.</span>'}</div>
        </div>
        <div class="card"><h2>Promemoria della serata</h2>
          ${voci.length ? `<ul class="tn-prom">${voci.map((x) => `<li><span aria-hidden="true">${x.ic}</span><div>${x.html}</div></li>`).join('')}</ul>` : '<div class="empty">Nessuna votazione, tavola, agape o ricorrenza per questa data.</div>'}
        </div>
      </div>

      ${conPresenze(t) ? `
      <div class="card" style="margin-top:18px"><h2>Presenze</h2>
        ${grado ? '' : `<div class="notice warn" style="margin-bottom:10px">Il grado della tornata non è indicato: sceglilo per vedere chi può partecipare.</div>`}
        <div class="actions" style="margin:0 0 10px">
          ${t.grado ? '' : `<label for="tn-grado" class="lbl" style="margin:0">Grado</label><select id="tn-grado" ${scrive ? '' : 'disabled'}><option value="">—</option>${Object.keys(GRADI).map((k) => `<option value="${k}" ${k === grado ? 'selected' : ''}>${GRADI[k]}</option>`).join('')}</select>`}
          <span class="muted" id="tn-riep"></span>
          ${scrive && el.length ? '<button class="btn ghost small" id="tn-tutti" type="button">Tutti presenti</button>' : ''}</div>
        ${el.length ? `<div class="hint" style="margin:0 0 8px">P presente · G assente giustificato · A assente. Tutti partono come presenti: segna solo chi manca.</div>
        <div class="tn-pres">${el.map((f) => `<div class="tn-riga"><div class="tn-nome"><b>${esc(f.cognome)} ${esc(f.nome)}</b>${f.grado_attuale ? ' ' + L.badgeGrado(f.grado_attuale) : ''}</div>
          <div class="pres-seg" role="group" aria-label="Presenza di ${esc(f.cognome)} ${esc(f.nome)}">${PRES.map(([val, lett, nome, cl]) => `<button type="button" class="${cl}" data-fr="${esc(f.id)}" data-val="${val}" title="${nome}" aria-label="${nome}" ${scrive ? '' : 'disabled'}>${lett}</button>`).join('')}</div></div>`).join('')}</div>` : (grado ? '<div class="empty">Nessun Fratello attivo per questo grado.</div>' : '')}
        <div class="form-grid" style="margin-top:14px">
          <div class="f s12"><label for="tn-ospiti">Ospiti (nome e cognome, separati da virgola)</label><input id="tn-ospiti" value="${esc(bozza.ospiti)}" placeholder="es. Mario Rossi, Luca Bianchi" ${scrive ? '' : 'readonly'}></div>
        </div>
        ${scrive && el.length ? `<div class="actions" style="margin-top:12px"><button class="btn" id="tn-salva" type="button">Salva le presenze nel registro</button>
          <span class="hint" id="tn-stato">${bozza.salvato ? 'Ultimo salvataggio nel registro: ' + esc(bozza.salvato) : 'Le presenze restano su questo dispositivo finché non le salvi (anche senza rete).'}</span></div>` : ''}
      </div>

      <div class="card" style="margin-top:18px"><h2>Tronco della Vedova</h2>
        <div class="form-grid">
          <div class="f s4"><label for="tn-tronco">Raccolto stasera (€)</label><input id="tn-tronco" inputmode="decimal" value="${esc(bozza.tronco)}" placeholder="es. 25" ${scrive ? '' : 'readonly'}></div>
          <div class="f s8" style="align-self:end"><div class="actions">${scrive ? '<button class="btn ghost" id="tn-tronco-reg" type="button">Registra in Tesoreria</button>' : ''}
            <span class="hint" id="tn-tronco-stato">${tronco === undefined ? 'Stato in Tesoreria non disponibile.' : tronco === null ? 'Non ancora registrato in Tesoreria.' : 'Registrato in Tesoreria: <b>' + esc(eur(tronco)) + '</b>'}</span></div></div>
          <div class="f s12 hint">L’importo entra anche nel testo del verbale. In Tesoreria va come incasso collettivo in contanti della data della tornata: registrandolo di nuovo si corregge, con 0 si toglie.</div>
        </div>
      </div>` : `<div class="notice" style="margin-top:18px">Per le ${t.tipo === 'agape' ? 'agapi' : 'conferenze via web'} non si tengono presenze né verbale.</div>`}`;

    // --- scheda della serata: modifica rapida ---
    const bm = $('#tn-mod', v);
    if (bm) bm.addEventListener('click', () => {
      const corpo = `<div class="form-grid">
        ${L.campo('ora', 'Ora', hhmm(t.ora), { cls: 's4' })}${L.campo('relatore', 'Relatore', t.relatore || '', { cls: 's8' })}
        ${L.campo('luogo', 'Luogo', t.luogo || '', { cls: 's6' })}${L.campo('link_online', 'Collegamento (link)', t.link_online || '', { cls: 's6' })}
        <div class="f s12"><label for="f-odg">Ordine del giorno</label><textarea id="f-odg" name="ordine_del_giorno" rows="6" style="width:100%">${esc(t.ordine_del_giorno || '')}</textarea></div></div>`;
      const apriModale = L.pagamenti && L.pagamenti.modal;
      if (!apriModale) { toast('Modifica non disponibile: apri la tornata dal Calendario.', 'bad'); return; }
      apriModale('Serata del ' + fmtData(t.data), corpo, {
        onSubmit: async (fm, chiudi, errore) => {
          const ora = fm.elements.ora.value.trim();
          if (ora && !/^\d{1,2}[:.]\d{2}$/.test(ora)) return errore('Ora non valida: usa hh:mm.');
          const dati = { ora: ora ? ora.replace('.', ':') : null, relatore: fm.elements.relatore.value.trim() || null, luogo: fm.elements.luogo.value.trim() || null,
            link_online: fm.elements.link_online.value.trim() || null, ordine_del_giorno: fm.elements.ordine_del_giorno.value.trim() || null };
          if (dati.link_online && !/^https?:\/\//i.test(dati.link_online)) return errore('Il collegamento deve iniziare con https://');
          chk(await state.sb.from('tornate').update(dati).eq('id', t.id));
          chiudi(); toast('Serata aggiornata', 'ok'); L.route();
        },
      });
    });

    $$('[data-agape]', v).forEach((b) => b.addEventListener('click', () => { const x = voci.find((q) => q.t && q.t.id === b.dataset.agape); if (x) L.agapi.apri(x.t); }));

    if (!conPresenze(t)) return;
    const salvaBozza = () => scriviBozza(t.id, bozza);

    // --- grado da scegliere (tornata senza grado) ---
    const sg = $('#tn-grado', v);
    if (sg) sg.addEventListener('change', async () => {
      bozza.grado = sg.value; salvaBozza();
      if (scrive && sg.value) { try { chk(await state.sb.from('tornate').update({ grado: sg.value }).eq('id', t.id)); } catch (e) { /* resta nella bozza */ } }
      L.route();
    });

    // --- presenze ---
    const riepilogo = () => {
      const n = { presente: 0, giustificato: 0, assente: 0 };
      el.forEach((f) => { n[bozza.pres[f.id] || 'presente']++; });
      const r = $('#tn-riep', v); if (r && el.length) r.textContent = `${n.presente} presenti · ${n.giustificato} giustificati · ${n.assente} assenti`;
      $$('.pres-seg button', v).forEach((b) => b.setAttribute('aria-pressed', (bozza.pres[b.dataset.fr] || 'presente') === b.dataset.val ? 'true' : 'false'));
    };
    $$('.pres-seg button', v).forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.val === 'presente') delete bozza.pres[b.dataset.fr]; else bozza.pres[b.dataset.fr] = b.dataset.val;
      bozza.modificata = true; salvaBozza(); riepilogo();
    }));
    const tt = $('#tn-tutti', v);
    if (tt) tt.addEventListener('click', () => { bozza.pres = {}; bozza.modificata = true; salvaBozza(); riepilogo(); });
    const os = $('#tn-ospiti', v);
    if (os) os.addEventListener('input', () => { bozza.ospiti = os.value; salvaBozza(); });
    riepilogo();

    const bs = $('#tn-salva', v);
    const salva = async () => {
      bs.disabled = true; const et = bs.textContent; bs.textContent = 'Salvo…';
      try {
        await salvaPresenze(t, grado, el, bozza);
        bozza.salvato = new Date().toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'short' }); bozza.daInviare = false; salvaBozza();
        $('#tn-stato', v).textContent = 'Ultimo salvataggio nel registro: ' + bozza.salvato;
        toast('Presenze salvate nel registro dei verbali', 'ok');
      } catch (e) {
        if (L.senzaRete(e)) {
          bozza.daInviare = true; salvaBozza();
          $('#tn-stato', v).innerHTML = '<b>Senza rete:</b> le presenze sono su questo dispositivo; le invio appena torna la connessione (resta su questa pagina) o premi di nuovo «Salva».';
          window.addEventListener('online', () => { if (document.body.contains(bs)) salva(); }, { once: true });
        } else toast(/verbali|presenze_verbale/.test(String(e && e.message)) && /relation|schema cache|does not exist/i.test(String(e && e.message)) ? 'Manca il registro dei verbali: esegui lemmi_aggiornamento_19.sql.' : messaggioErrore(e), 'bad');
      } finally { bs.disabled = false; bs.textContent = et; }
    };
    if (bs) bs.addEventListener('click', salva);

    // --- Tronco della Vedova ---
    const it = $('#tn-tronco', v);
    if (it) it.addEventListener('input', () => { bozza.tronco = it.value; salvaBozza(); });
    const br = $('#tn-tronco-reg', v);
    if (br) br.addEventListener('click', async () => {
      const n = importo(it.value);
      if (n === null || isNaN(n) || n < 0) { toast('Scrivi l’importo raccolto, per esempio 25 oppure 25,50.', 'bad'); it.focus(); return; }
      br.disabled = true;
      try {
        chk(await state.sb.rpc('registra_tronco', { p_tornata: t.id, p_importo: n, p_note: null }));
        $('#tn-tronco-stato', v).innerHTML = n ? 'Registrato in Tesoreria: <b>' + esc(eur(n)) + '</b>' : 'Tolto dalla Tesoreria.';
        toast(n ? 'Tronco della Vedova registrato in Tesoreria' : 'Tronco tolto dalla Tesoreria', 'ok');
      } catch (e) {
        const msg = String((e && e.message) || '');
        toast(/registra_tronco|schema cache|Could not find/i.test(msg) ? 'Per registrare il Tronco esegui prima lo script sql/lemmi_aggiornamento_51.sql su Supabase.' : messaggioErrore(e), 'bad');
      } finally { br.disabled = false; }
    });

    // --- verso il generatore del verbale ---
    const bv = $('#tn-verbale', v);
    if (bv) bv.addEventListener('click', () => {
      if (!L.preparaVerbale) { location.hash = '#/template/verbale/' + grado; return; }
      const n = importo(bozza.tronco);
      L.preparaVerbale({ data: t.data, grado, pres: bozza.pres, ospiti: bozza.ospiti, tronco: n ? n.toLocaleString('it-IT', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + ' euro' : '' });
    });
  }

  L.viste.tornata = vista;

  /* ---------- Cruscotto: richiamo il giorno della tornata ---------- */
  const SOCI = ['amministratore', 'venerabile', 'segretario'];
  const vede = () => SOCI.includes(state.profilo && state.profilo.ruolo);
  const caricaOggi = async () => chk(await state.sb.from('tornate').select('id,data,ora,tipo,grado').eq('data', oggi()).neq('stato', 'annullata').neq('tipo', 'agape'));
  const extraTornata = async (v, anticipo) => {
    if (!vede()) return;
    let tt;
    try { tt = await L.datiAnticipati(anticipo, caricaOggi); } catch (e) { return; }
    if (!tt || !tt.length) return;
    const t = tt[0];
    const el = document.createElement('div');
    el.className = 'notice tn-avviso';
    el.innerHTML = `<b>Stasera:</b> ${esc(TIPI[t.tipo] || t.tipo)}${t.grado ? ' in grado di ' + esc(GRADI[t.grado] || t.grado) : ''}${t.ora ? ' alle ' + esc(hhmm(t.ora)) : ''}
      <a class="btn gold small" href="#/tornata/${esc(t.id)}">Apri la serata</a>`;
    const testa = $('.page-head', v);
    if (testa) testa.insertAdjacentElement('afterend', el); else v.prepend(el);
  };
  extraTornata.carica = () => (vede() ? caricaOggi() : null);
  L.cruscottoExtra = L.cruscottoExtra || [];
  L.cruscottoExtra.unshift(extraTornata);
})();
