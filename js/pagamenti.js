/* Lemmi - sezione Pagamenti e quote.
 * Usa le tabelle e le viste create dallo script lemmi_pagamenti.sql. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, isoToIt, itToIso, oggi, isAdmin, IC, campo } = L;

  const canPay = () => ['amministratore', 'tesoriere'].includes(state.profilo.ruolo);
  const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
  const eur = (x) => euro.format(Number(x || 0));
  const num = (x) => Number(x || 0);
  const STATI = ['Scaduto', 'Da pagare', 'Parziale', 'Pagato', 'Esente'];
  const BADGE = { Pagato: 'ok', Scaduto: 'bad', Parziale: 'warn', 'Da pagare': 'info', Esente: 'gray', 'In regola': 'ok', 'Con scaduti': 'bad', 'In attesa': 'warn' };
  const MODALITA = ['contanti', 'bonifico', 'carta', 'assegno', 'altro'];
  const pag = { anno: new Date().getFullYear(), righe: [], vers: [], coll: [], voci: [], anni: [], fratelli: null, filtri: { q: '', stato: '', voce: '' } };

  L.tabsPagamenti = [];

  /* ---------- utilità ---------- */
  // Campo "Fratello": si scrive il cognome e si sceglie dall'elenco
  function campoFratello(frat, o) {
    o = Object.assign({ nome: 'fratello', id: 'm-fratello', label: 'Fratello', req: true, cls: 's6', wid: '' }, o || {});
    return `<div class="f ${o.cls}" ${o.wid ? `id="${o.wid}"` : ''}><label for="${o.id}">${o.label}${o.req ? ' <span class="req">*</span>' : ''}</label>
      <input id="${o.id}" name="${o.nome}" list="dl-${o.id}" autocomplete="off" placeholder="Scrivi il cognome e scegli dall’elenco">
      <datalist id="dl-${o.id}">${frat.map((x) => `<option value="${esc(x.cognome + ' ' + x.nome)}"></option>`).join('')}</datalist></div>`;
  }
  function idFratello(frat, testo) {
    const t = String(testo || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (!t) return null;
    const m = frat.find((x) => (x.cognome + ' ' + x.nome).toLowerCase() === t || (x.nome + ' ' + x.cognome).toLowerCase() === t);
    return m ? m.id : null;
  }
  function leggiImporto(s) {            // "600", "600,50", "1.000,50" -> numero ; vuoto -> null ; errore -> NaN
    let t = String(s || '').trim().replace(/\s/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
    return Number(t);
  }
  const fmtInput = (x) => (x === null || x === undefined || x === '' ? '' : String(Number(x).toFixed(2)).replace('.', ','));
  const opzioni = (lista, sel) => lista.map((o) => `<option value="${esc(o.v)}" ${o.v === sel ? 'selected' : ''}>${esc(o.t)}</option>`).join('');

  async function fratelliPag() {
    if (!pag.fratelli) {
      const tab = isAdmin() ? 'fratelli' : 'v_fratelli_tesoreria';
      pag.fratelli = chk(await state.sb.from(tab).select('id,cognome,nome,stato').order('cognome'));
    }
    return pag.fratelli;
  }

  async function carica(anno) {
    const sb = state.sb;
    try {
      const [s, v, c, vo, an] = await Promise.all([
        sb.from('v_scadenze_stato').select('*').eq('anno', anno).order('fratello').order('data_scadenza'),
        sb.from('v_versamenti_elenco').select('*').eq('anno', anno).order('data_versamento', { ascending: false }),
        sb.from('v_incassi_collettivi').select('*').eq('anno', anno),
        sb.from('voci_quota').select('*').eq('attiva', true).order('nome'),
        sb.from('v_scadenze_stato').select('anno'),
      ]);
      pag.righe = chk(s); pag.vers = chk(v); pag.coll = chk(c); pag.voci = chk(vo);
      const anni = new Set(chk(an).map((r) => r.anno));
      const ora = new Date().getFullYear();
      [ora, ora + 1, anno].forEach((a) => anni.add(a));
      pag.anni = Array.from(anni).sort((a, b) => b - a);
    } catch (e) {
      if (/schema cache|does not exist|Could not find/i.test((e && e.message) || '')) {
        throw new Error('Le tabelle dei pagamenti non sono ancora presenti: esegui lo script lemmi_pagamenti.sql nell\'editor SQL di Supabase.');
      }
      throw e;
    }
  }

  /* ---------- finestre ---------- */
  function modal(titolo, corpo, op) {
    op = op || {};
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
      <div class="modal-h"><h2>${esc(titolo)}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <form class="modal-b" novalidate>${corpo}<div class="err" data-err style="margin-top:10px"></div>
        <div class="actions" style="margin-top:14px">
          ${op.senzaConferma ? '' : `<button class="btn gold" type="submit">${esc(op.conferma || 'Salva')}</button>`}
          ${op.extra || ''}
          <button class="btn ghost" type="button" data-x>${op.senzaConferma ? 'Chiudi' : 'Annulla'}</button>
        </div></form></div>`;
    document.body.appendChild(ov);
    const chiudi = () => ov.remove();
    $$('[data-x]', ov).forEach((b) => { b.onclick = chiudi; });
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });
    ov.addEventListener('keydown', (e) => { if (e.key === 'Escape') chiudi(); });
    const f = $('form', ov);
    L.mascheraDate(f);
    const err = $('[data-err]', ov);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      err.textContent = '';
      const btn = $('button[type=submit]', f);
      if (btn) btn.disabled = true;
      try { if (op.onSubmit) await op.onSubmit(f, chiudi, (m) => { err.textContent = m; }); } catch (e) { err.textContent = messaggioErrore(e); }
      if (btn) btn.disabled = false;
    });
    const primo = $('input:not([type=hidden]):not([disabled]), select', f);
    if (primo) primo.focus();
    return { ov, f, chiudi };
  }

  function avviso(titolo, html) {
    modal(titolo, html, { senzaConferma: true });
  }

  const vocePerCodice = (cod) => pag.voci.find((x) => x.codice === cod);

  /* ---------- registra un versamento ---------- */
  async function apriVersamento(sc) {
    const frat = sc ? [] : await fratelliPag();
    const personali = pag.voci;
    const corpo = `<div class="form-grid">
      ${sc ? `<div class="f"><div class="kv"><div><span>Fratello</span><b>${esc(sc.fratello)}</b></div><div><span>Voce</span><b>${esc(sc.voce)}${sc.rate_totali > 1 ? ' · rata ' + sc.rata_n + '/' + sc.rate_totali : ''}</b></div><div><span>Residuo</span><b>${eur(sc.residuo)}</b></div></div></div>` : `
        <div class="f s6"><label for="m-voce">Voce</label><select id="m-voce" name="voce">${opzioni(personali.map((x) => ({ v: x.id, t: x.nome })), '')}</select></div>
        ${campoFratello(frat, { wid: 'w-frat' })}
        <div class="f s4" id="w-anno"><label for="m-anno">Anno della quota</label><input id="m-anno" name="anno" inputmode="numeric" maxlength="4" value="${pag.anno}"></div>
        <div class="f s8" id="w-scad"><label for="m-scad">Scadenza da saldare</label><select id="m-scad" name="scadenza"></select></div>`}
      ${campo('data', 'Data del versamento', oggi(), { type: 'date', cls: 's4' })}
      ${campo('importo', 'Importo (€)', sc ? fmtInput(sc.residuo) : '', { cls: 's4', ph: 'es. 600,00' })}
      <div class="f s4"><label for="m-mod">Modalità</label><select id="m-mod" name="modalita"><option value="">—</option>${opzioni(MODALITA.map((x) => ({ v: x, t: x.charAt(0).toUpperCase() + x.slice(1) })), '')}</select></div>
      ${campo('riferimento', 'Riferimento (es. CRO del bonifico)', '', { cls: 's6' })}
      ${campo('note', 'Note', '', { cls: 's6' })}
    </div>`;
    const m = modal(sc ? 'Registra un versamento' : 'Nuovo versamento', corpo, {
      conferma: 'Registra',
      onSubmit: async (f, chiudi, errore) => {
        const data = itToIso(f.elements.data.value);
        if (!data || data === 'ERR') return errore('Inserisci la data del versamento nel formato gg/mm/aaaa.');
        const imp = leggiImporto(f.elements.importo.value);
        if (imp === null || Number.isNaN(imp) || imp <= 0) return errore('Importo non valido: usa cifre, ad esempio 600 oppure 600,50.');
        const pay = { data_versamento: data, importo: imp, modalita: f.elements.modalita.value || null, riferimento: f.elements.riferimento.value.trim() || null, note: f.elements.note.value.trim() || null };
        if (sc) {
          const v = vocePerCodice(sc.voce_codice);
          if (!v) return errore('Voce non trovata: ricarica la pagina.');
          Object.assign(pay, { voce_id: v.id, fratello_id: sc.fratello_id, anno: sc.anno, scadenza_id: sc.id });
        } else {
          const v = pag.voci.find((x) => x.id === f.elements.voce.value);
          if (!v) return errore('Scegli la voce.');
          pay.voce_id = v.id;
          if (v.personale) {
            const anno = Number(f.elements.anno.value);
            const fid = idFratello(frat, f.elements.fratello.value);
            if (!fid) return errore('Indica il nome del Fratello: scrivi il cognome e scegli dall’elenco.');
            if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) return errore('Anno non valido (4 cifre).');
            Object.assign(pay, { fratello_id: fid, anno, scadenza_id: f.elements.scadenza.value || null });
          } else {
            Object.assign(pay, { fratello_id: null, anno: Number(data.slice(0, 4)), scadenza_id: null });
          }
        }
        chk(await state.sb.from('versamenti').insert(pay));
        chiudi(); toast('Versamento registrato', 'ok'); L.route();
      },
    });
    if (sc) return;
    const f = m.f;
    const aggiorna = () => {
      const v = pag.voci.find((x) => x.id === f.elements.voce.value);
      const pers = v ? v.personale : true;
      ['w-anno', 'w-scad'].forEach((id) => $('#' + id, f).classList.toggle('hidden', !pers));
      f.elements.fratello.disabled = !pers;
      f.elements.fratello.placeholder = pers ? 'Scrivi il cognome e scegli dall’elenco' : 'Voce collettiva: non serve indicare il Fratello';
      if (!pers) { f.elements.fratello.value = ''; return; }
      const aperte = pag.righe.filter((r) => r.fratello_id === idFratello(frat, f.elements.fratello.value) && v && r.voce_codice === v.codice && r.anno === Number(f.elements.anno.value) && num(r.residuo) > 0);
      f.elements.scadenza.innerHTML = '<option value="">— nessuna (acconto non collegato) —</option>' + aperte.map((r) =>
        `<option value="${esc(r.id)}">${fmtData(r.data_scadenza)}${r.rate_totali > 1 ? ' · rata ' + r.rata_n + '/' + r.rate_totali : ''} · residuo ${eur(r.residuo)}</option>`).join('');
      if (aperte.length === 1) { f.elements.scadenza.value = aperte[0].id; if (!f.elements.importo.value) f.elements.importo.value = fmtInput(aperte[0].residuo); }
    };
    ['voce', 'fratello', 'anno'].forEach((n) => f.elements[n].addEventListener('change', aggiorna));
    f.elements.fratello.addEventListener('input', aggiorna);
    f.elements.anno.addEventListener('input', aggiorna);
    f.elements.scadenza.addEventListener('change', () => {
      const r = pag.righe.find((x) => x.id === f.elements.scadenza.value);
      if (r && !f.elements.importo.value) f.elements.importo.value = fmtInput(r.residuo);
    });
    aggiorna();
  }

  /* ---------- genera la capitazione ---------- */
  async function apriGenera() {
    const frat = await fratelliPag();
    const stati = Array.from(new Set(frat.map((x) => x.stato).filter(Boolean)));
    const corpo = `<div class="form-grid">
      <div class="f s4"><label for="g-anno">Anno</label><input id="g-anno" name="anno" inputmode="numeric" maxlength="4" value="${pag.anno}"></div>
      <div class="f s8"><label for="g-mod">Modalità di pagamento</label><select id="g-mod" name="modalita">
        <option value="unica">In unica rata (scadenza 25 gennaio)</option>
        <option value="due_rate">In due rate (25 gennaio e 10 giugno, metà ciascuna)</option></select></div>
      <div class="f"><span class="lbl">Fratelli a cui assegnare la quota</span>
        ${stati.length ? stati.map((s, i) => `<label class="check"><input type="checkbox" name="stato" value="${esc(s)}" ${/attiv/i.test(s) ? 'checked' : ''}> ${esc(s)} <span class="muted">(${frat.filter((x) => x.stato === s).length})</span></label>`).join('')
          : '<span class="muted">Nessuno stato trovato nell\'anagrafica.</span>'}</div>
      <div class="f hint">L\'importo dipende dall\'età di ciascun Fratello (fasce nel database). Le scadenze già esistenti non vengono duplicate.</div></div>`;
    modal('Genera la capitazione', corpo, {
      conferma: 'Genera scadenze',
      onSubmit: async (f, chiudi, errore) => {
        const anno = Number(f.elements.anno.value);
        if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) return errore('Anno non valido (4 cifre).');
        const sel = $$('[name=stato]:checked', f).map((x) => x.value);
        if (!sel.length) return errore('Scegli almeno uno stato.');
        const r = chk(await state.sb.rpc('crea_scadenze_capitazione', { p_anno: anno, p_modalita: f.elements.modalita.value, p_stati: sel }));
        chiudi();
        pag.anno = anno;
        const righe = [`<div class="kv"><div><span>Scadenze create</span><b>${num(r.scadenze_create)}</b></div></div>`];
        if (num(r.senza_data_nascita)) righe.push(`<div class="notice">${num(r.senza_data_nascita) === 1 ? 'Un Fratello non ha' : num(r.senza_data_nascita) + ' Fratelli non hanno'} la data di nascita in anagrafica: completa il dato e rilancia, le scadenze già create non si duplicano.</div>`);
        if (num(r.senza_fascia)) righe.push(`<div class="notice">${num(r.senza_fascia) === 1 ? 'Un Fratello non rientra' : num(r.senza_fascia) + ' Fratelli non rientrano'} in nessuna fascia d'età.</div>`);
        if (num(r.con_altro_piano_rate)) righe.push(`<div class="notice">${num(r.con_altro_piano_rate) === 1 ? 'Un Fratello ha già scadenze' : num(r.con_altro_piano_rate) + ' Fratelli hanno già scadenze'} con un piano di rate diverso: non sono state toccate.</div>`);
        if (!num(r.scadenze_create) && !num(r.senza_data_nascita) && !num(r.con_altro_piano_rate)) righe.push('<div class="notice">Nessuna nuova scadenza: erano già tutte presenti, oppure nessun Fratello ha lo stato scelto.</div>');
        avviso('Capitazione ' + anno, righe.join(''));
        L.route();
      },
    });
  }

  /* ---------- nuova scadenza singola ---------- */
  async function apriNuovaScadenza() {
    const frat = await fratelliPag();
    const voci = pag.voci.filter((x) => x.personale && x.tipo_importo !== 'per_eta');
    if (!voci.length) { toast('Nessuna voce disponibile per le scadenze singole.', 'bad'); return; }
    const fisso0 = voci[0].importo_fisso;
    const corpo = `<div class="form-grid">
      <div class="f s6"><label for="n-voce">Voce</label><select id="n-voce" name="voce">${opzioni(voci.map((x) => ({ v: x.codice, t: x.nome })), '')}</select></div>
      ${campoFratello(frat, { id: 'n-frat' })}
      <div class="f s3"><label for="n-anno">Anno</label><input id="n-anno" name="anno" inputmode="numeric" maxlength="4" value="${pag.anno}"></div>
      ${campo('importo', 'Importo (€)', fisso0 !== null && fisso0 !== undefined ? fisso0 : '', { cls: 's4', ph: 'es. 260,00' }).replace(`value="${esc(fisso0)}"`, `value="${esc(fmtInput(fisso0))}"`)}
      ${campo('scadenza', 'Scadenza (facoltativa)', '', { type: 'date', cls: 's5' })}
      <div class="f hidden" id="w-motivo"><label for="n-motivo">Motivo dell’importo diverso da quello previsto <span class="req">*</span></label><input id="n-motivo" name="motivo" placeholder="es. importo concordato con il Venerabile"></div>
      ${campo('note', 'Note', '', { cls: 's12' })}
      <div class="f hint" id="n-hint"></div></div>`;
    const m = modal('Nuova scadenza', corpo, {
      conferma: 'Crea scadenza',
      onSubmit: async (f, chiudi, errore) => {
        const anno = Number(f.elements.anno.value);
        const fid = idFratello(frat, f.elements.fratello.value);
        if (!fid) return errore('Indica il nome del Fratello: scrivi il cognome e scegli dall’elenco.');
        if (!Number.isInteger(anno) || anno < 2000 || anno > 2100) return errore('Anno non valido (4 cifre).');
        const v = voci.find((x) => x.codice === f.elements.voce.value);
        const imp = leggiImporto(f.elements.importo.value);
        if (Number.isNaN(imp)) return errore('Importo non valido: usa cifre, ad esempio 260 oppure 260,50.');
        if (imp === null && (v.importo_fisso === null || v.importo_fisso === undefined)) return errore('Indica l’importo: per questa voce non c’è un importo prestabilito.');
        const dt = itToIso(f.elements.scadenza.value);
        if (dt === 'ERR') return errore('Scadenza non valida: usa il formato gg/mm/aaaa.');
        const diverso = imp !== null && v.importo_fisso !== null && v.importo_fisso !== undefined && imp !== num(v.importo_fisso);
        const motivo = f.elements.motivo.value.trim();
        if (diverso && !motivo) return errore('Indica il motivo dell’importo diverso da quello previsto.');
        const nuovoId = chk(await state.sb.rpc('crea_scadenza_singola', {
          p_voce_codice: v.codice, p_fratello: fid, p_anno: anno, p_importo: imp,
          p_data_scadenza: dt, p_motivo_eccezione: motivo || null, p_note: f.elements.note.value.trim() || null,
        }));
        chiudi();
        // Se la scadenza è nata con un'esenzione per età, lo si comunica subito
        let esente = null;
        try {
          const rr = chk(await state.sb.from('v_scadenze_stato').select('fratello,voce,importo_base,sconto,motivo_eccezione').eq('id', nuovoId).single());
          if (num(rr.sconto) > 0) esente = rr;
        } catch (e) { /* l'avviso è facoltativo */ }
        if (esente) {
          avviso('Scadenza creata con esenzione',
            `<div class="notice"><b>${esc(esente.fratello)}</b> · ${esc(esente.voce)}<br>Importo previsto ${eur(esente.importo_base)}, sconto applicato ${eur(esente.sconto)}.<br>${esc(esente.motivo_eccezione || '')}</div>
             <p class="muted">L’esenzione per età è automatica. Se non va applicata, apri la scadenza con «Modifica» e azzera lo sconto.</p>`);
        } else {
          toast('Scadenza creata', 'ok');
        }
        L.route();
      },
    });
    const f = m.f;
    const aggiorna = (cambiaVoce) => {
      const v = voci.find((x) => x.codice === f.elements.voce.value);
      if (cambiaVoce) f.elements.importo.value = v && v.importo_fisso !== null && v.importo_fisso !== undefined ? fmtInput(v.importo_fisso) : '';
      const imp = leggiImporto(f.elements.importo.value);
      const diverso = v && v.importo_fisso !== null && v.importo_fisso !== undefined && imp !== null && !Number.isNaN(imp) && imp !== num(v.importo_fisso);
      $('#w-motivo', f).classList.toggle('hidden', !diverso);
      const esenz = v && v.esenzione_eta_sotto ? ' L’esenzione per età si applica in automatico alla creazione (si può togliere da «Modifica»).' : '';
      $('#n-hint').textContent = v ? ((v.note || '') + esenz).trim() : '';
    };
    f.elements.voce.addEventListener('change', () => aggiorna(true));
    f.elements.importo.addEventListener('input', () => aggiorna(false));
    aggiorna(false);
  }

  /* ---------- modifica una scadenza ---------- */
  function apriModifica(r) {
    const corpo = `<div class="form-grid">
      <div class="f"><div class="kv"><div><span>Fratello</span><b>${esc(r.fratello)}</b></div><div><span>Voce</span><b>${esc(r.voce)}${r.rate_totali > 1 ? ' · rata ' + r.rata_n + '/' + r.rate_totali : ''}</b></div>
        <div><span>Importo base</span><b>${eur(r.importo_base)}</b></div><div><span>Versato finora</span><b>${eur(r.versato)}</b></div></div></div>
      ${campo('sconto', 'Sconto / esonero (€)', '', { cls: 's4', ph: 'es. 100,00' }).replace('value=""', `value="${esc(num(r.sconto) ? fmtInput(r.sconto) : '')}"`)}
      ${campo('scadenza', 'Scadenza', r.data_scadenza, { type: 'date', cls: 's4' })}
      ${campo('motivo', 'Motivo dello sconto o dell’eccezione', r.motivo_eccezione || '', { cls: 's12' })}
      ${campo('note', 'Note', r.note || '', { cls: 's12' })}</div>`;
    const extra = isAdmin() ? '<button class="btn danger" type="button" data-del>Elimina scadenza</button>' : '';
    const m = modal('Modifica scadenza', corpo, {
      extra,
      onSubmit: async (f, chiudi, errore) => {
        const sc = leggiImporto(f.elements.sconto.value);
        if (Number.isNaN(sc) || (sc !== null && sc < 0)) return errore('Sconto non valido: usa cifre, ad esempio 100 oppure 100,50.');
        if (sc !== null && sc > num(r.importo_base)) return errore('Lo sconto non può superare l’importo base (' + eur(r.importo_base) + ').');
        const dt = itToIso(f.elements.scadenza.value);
        if (dt === 'ERR') return errore('Scadenza non valida: usa il formato gg/mm/aaaa.');
        const motivo = f.elements.motivo.value.trim();
        if (sc && !motivo) return errore('Indica il motivo dello sconto.');
        chk(await state.sb.from('scadenze').update({ sconto: sc || 0, data_scadenza: dt, motivo_eccezione: motivo || null, note: f.elements.note.value.trim() || null }).eq('id', r.id));
        chiudi(); toast('Scadenza aggiornata', 'ok'); L.route();
      },
    });
    const del = $('[data-del]', m.ov);
    if (del) del.onclick = async () => {
      if (!window.confirm('Eliminare questa scadenza? Non è possibile se ha versamenti collegati.')) return;
      try { chk(await state.sb.from('scadenze').delete().eq('id', r.id)); m.chiudi(); toast('Scadenza eliminata', 'ok'); L.route(); }
      catch (e) { $('[data-err]', m.ov).textContent = messaggioErrore(e); }
    };
  }

  /* ---------- schede della sezione ---------- */
  function kpi() {
    const dovuto = pag.righe.reduce((a, r) => a + num(r.importo_dovuto), 0);
    const versato = pag.righe.reduce((a, r) => a + num(r.versato), 0);
    const residuo = pag.righe.reduce((a, r) => a + num(r.residuo), 0);
    const scaduto = pag.righe.filter((r) => r.stato === 'Scaduto').reduce((a, r) => a + num(r.residuo), 0);
    return `<div class="grid stats">
      <div class="stat"><div class="n">${eur(dovuto)}</div><div class="l">Dovuto nel ${pag.anno}</div></div>
      <div class="stat"><div class="n">${eur(versato)}</div><div class="l">Incassato (${dovuto ? Math.round(versato / dovuto * 100) : 0}%)</div></div>
      <div class="stat"><div class="n">${eur(residuo)}</div><div class="l">Residuo da incassare</div></div>
      <div class="stat"><div class="n" style="color:${scaduto ? 'var(--bad)' : 'inherit'}">${eur(scaduto)}</div><div class="l">Di cui già scaduto</div></div></div>`;
  }

  function tabScadenze() {
    const c = $('#p-corpo');
    const voci = Array.from(new Set(pag.righe.map((r) => r.voce)));
    c.innerHTML = `<div class="actions" style="margin-bottom:14px">
      <div class="searchbar">${IC.search}<input id="p-q" type="search" placeholder="Cerca un Fratello…" value="${esc(pag.filtri.q)}"></div>
      <select id="p-stato" style="width:auto"><option value="">Tutti gli stati</option>${opzioni(STATI.map((x) => ({ v: x, t: x })), pag.filtri.stato)}</select>
      <select id="p-voce" style="width:auto"><option value="">Tutte le voci</option>${opzioni(voci.map((x) => ({ v: x, t: x })), pag.filtri.voce)}</select>
      <span class="muted" id="p-conta"></span></div>
      <div class="table-wrap"><table><thead><tr><th>Fratello</th><th>Voce</th><th>Età</th><th class="num">Dovuto</th><th class="num">Versato</th><th class="num">Residuo</th><th>Scadenza</th><th>Stato</th><th></th></tr></thead><tbody id="p-righe"></tbody></table></div>`;
    const disegna = () => {
      const q = pag.filtri.q.trim().toLowerCase();
      const f = pag.righe.filter((r) => (!q || r.fratello.toLowerCase().includes(q)) && (!pag.filtri.stato || r.stato === pag.filtri.stato) && (!pag.filtri.voce || r.voce === pag.filtri.voce));
      $('#p-conta').textContent = f.length + (f.length === 1 ? ' scadenza' : ' scadenze');
      $('#p-righe').innerHTML = f.length ? f.map((r) => `<tr>
        <td><b>${esc(r.fratello)}</b></td>
        <td>${esc(r.voce)}${r.rate_totali > 1 ? ` <span class="muted">· rata ${r.rata_n}/${r.rate_totali}</span>` : ''}${r.motivo_eccezione ? `<div class="hint">Eccezione: ${esc(r.motivo_eccezione)}</div>` : ''}</td>
        <td>${r.eta_calcolata === null || r.eta_calcolata === undefined ? '—' : esc(r.eta_calcolata)}</td>
        <td class="num">${eur(r.importo_dovuto)}</td><td class="num">${eur(r.versato)}</td><td class="num"><b>${eur(r.residuo)}</b></td>
        <td>${fmtData(r.data_scadenza)}</td><td><span class="badge ${BADGE[r.stato] || 'gray'}">${esc(r.stato)}</span></td>
        <td class="act">${canPay() ? `${num(r.residuo) > 0 ? `<button class="btn ghost small" data-ver="${esc(r.id)}">Versamento</button> ` : ''}<button class="btn ghost small" data-mod="${esc(r.id)}">Modifica</button>` : ''}</td></tr>`).join('')
        : `<tr><td colspan="9"><div class="empty">${IC.inbox}<div>${pag.righe.length ? 'Nessun risultato.' : 'Nessuna scadenza per il ' + pag.anno + '.' + (canPay() ? ' Usa «Genera capitazione» per crearle.' : '')}</div></div></td></tr>`;
      $$('[data-ver]', c).forEach((b) => b.addEventListener('click', () => apriVersamento(pag.righe.find((x) => x.id === b.dataset.ver))));
      $$('[data-mod]', c).forEach((b) => b.addEventListener('click', () => apriModifica(pag.righe.find((x) => x.id === b.dataset.mod))));
    };
    $('#p-q').addEventListener('input', (e) => { pag.filtri.q = e.target.value; disegna(); });
    $('#p-stato').addEventListener('change', (e) => { pag.filtri.stato = e.target.value; disegna(); });
    $('#p-voce').addEventListener('change', (e) => { pag.filtri.voce = e.target.value; disegna(); });
    disegna();
  }

  function tabVersamenti() {
    const c = $('#p-corpo');
    const totale = pag.vers.reduce((a, x) => a + num(x.importo), 0);
    const nonColl = pag.vers.filter((x) => x.non_collegato);
    c.innerHTML = `
      ${pag.coll.map((x) => `<div class="notice" style="background:var(--gold-soft);color:#5d4608"><b>${esc(x.voce)}</b> · ${num(x.n_versamenti)} versament${num(x.n_versamenti) === 1 ? 'o' : 'i'} nel ${pag.anno}: <b>${eur(x.totale)}</b></div>`).join('')}
      ${nonColl.length ? `<div class="notice">${nonColl.length} versament${nonColl.length === 1 ? 'o non è collegato' : 'i non sono collegati'} a una scadenza (${eur(nonColl.reduce((a, x) => a + num(x.importo), 0))}).</div>` : ''}
      <div class="table-wrap"><table><thead><tr><th>Data</th><th>Fratello</th><th>Voce</th><th class="num">Importo</th><th>Modalità</th><th>Riferimento</th><th></th><th></th></tr></thead><tbody>
      ${pag.vers.length ? pag.vers.map((x) => `<tr><td>${fmtData(x.data_versamento)}</td><td>${x.fratello ? '<b>' + esc(x.fratello) + '</b>' : '<span class="muted">Collettivo</span>'}</td><td>${esc(x.voce)}</td>
        <td class="num"><b>${eur(x.importo)}</b></td><td>${esc(x.modalita || '—')}</td><td>${esc(x.riferimento || '')}</td>
        <td>${x.non_collegato ? '<span class="badge warn">Non collegato</span>' : ''}</td>
        <td class="act">${isAdmin() ? `<button class="btn danger small" data-delv="${esc(x.id)}">Elimina</button>` : ''}</td></tr>`).join('')
        : `<tr><td colspan="8"><div class="empty">${IC.inbox}<div>Nessun versamento registrato per il ${pag.anno}.</div></div></td></tr>`}
      </tbody>${pag.vers.length ? `<tfoot><tr><td colspan="3"><b>Totale</b></td><td class="num"><b>${eur(totale)}</b></td><td colspan="4"></td></tr></tfoot>` : ''}</table></div>`;
    $$('[data-delv]', c).forEach((b) => b.addEventListener('click', async () => {
      if (!window.confirm('Eliminare definitivamente questo versamento?')) return;
      try { chk(await state.sb.from('versamenti').delete().eq('id', b.dataset.delv)); toast('Versamento eliminato', 'ok'); L.route(); }
      catch (e) { toast(messaggioErrore(e), 'bad'); }
    }));
  }

  function tabRiepilogo() {
    const c = $('#p-corpo');
    const per = {};
    pag.righe.forEach((r) => {
      const x = per[r.fratello_id] || (per[r.fratello_id] = { nome: r.fratello, dov: 0, ver: 0, res: 0, scad: 0 });
      x.dov += num(r.importo_dovuto); x.ver += num(r.versato); x.res += num(r.residuo); if (r.stato === 'Scaduto') x.scad++;
    });
    const sit = (x) => (x.dov === 0 ? 'Esente' : x.res <= 0 ? 'In regola' : x.scad > 0 ? 'Con scaduti' : 'In attesa');
    const fr = Object.values(per).sort((a, b) => b.res - a.res || a.nome.localeCompare(b.nome));
    const pv = {};
    pag.righe.forEach((r) => {
      const x = pv[r.voce] || (pv[r.voce] = { dov: 0, ver: 0, res: 0 });
      x.dov += num(r.importo_dovuto); x.ver += num(r.versato); x.res += num(r.residuo);
    });
    c.innerHTML = `<div class="grid cols-2">
      <div class="card"><h2>Per voce</h2><div class="table-wrap"><table><thead><tr><th>Voce</th><th class="num">Dovuto</th><th class="num">Versato</th><th class="num">Residuo</th></tr></thead><tbody>
        ${Object.entries(pv).map(([k, x]) => `<tr><td><b>${esc(k)}</b></td><td class="num">${eur(x.dov)}</td><td class="num">${eur(x.ver)}</td><td class="num">${eur(x.res)}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">Nessun dato.</div></td></tr>'}
      </tbody></table></div></div>
      <div class="card"><h2>Situazione dei Fratelli <small>${fr.filter((x) => sit(x) === 'Con scaduti').length} con scaduti</small></h2>
        <div class="searchbar" style="margin-bottom:12px;max-width:none">${IC.search}<input id="r-q" type="search" placeholder="Cerca un Fratello…"></div>
        <div class="table-wrap"><table><thead><tr><th>Fratello</th><th class="num">Dovuto</th><th class="num">Residuo</th><th>Situazione</th></tr></thead><tbody id="r-righe"></tbody></table></div></div></div>`;
    const disegna = () => {
      const q = $('#r-q').value.trim().toLowerCase();
      const f = fr.filter((x) => !q || x.nome.toLowerCase().includes(q));
      $('#r-righe').innerHTML = f.length ? f.map((x) => `<tr><td><b>${esc(x.nome)}</b></td><td class="num">${eur(x.dov)}</td><td class="num">${eur(x.res)}</td><td><span class="badge ${BADGE[sit(x)]}">${sit(x)}</span></td></tr>`).join('')
        : '<tr><td colspan="4"><div class="empty">Nessun risultato.</div></td></tr>';
    };
    $('#r-q').addEventListener('input', disegna);
    disegna();
  }

  L.pagamenti = { pag, modal, avviso, leggiImporto, fmtInput, opzioni, fratelliPag, eur, num, canPay, BADGE, campoFratello, idFratello, vocePerCodice };

  /* ---------- vista principale ---------- */
  L.viste.pagamenti = async function (v, parti) {
    const extra = L.tabsPagamenti.filter((t) => t.ruoli.includes(state.profilo.ruolo));
    const tab = ['versamenti', 'riepilogo'].concat(extra.map((t) => t.id)).includes(parti[1]) ? parti[1] : 'scadenze';
    const tabExtra = extra.find((t) => t.id === tab);
    await carica(pag.anno);
    v.innerHTML = `
      <div class="page-head"><div><h1>Pagamenti e quote</h1><p>Capitazione, aumenti di salario, iniziazioni e Tronco della Vedova</p></div>
        <div class="right actions">
          <label class="lbl" for="p-anno">Anno</label><select id="p-anno" style="width:auto">${pag.anni.map((a) => `<option value="${a}" ${a === pag.anno ? 'selected' : ''}>${a}</option>`).join('')}</select>
          ${canPay() ? `<button class="btn gold" id="b-nver">${IC.plus} Nuovo versamento</button><button class="btn ghost" id="b-nsc">Nuova scadenza</button><button class="btn ghost" id="b-gen">Genera capitazione</button>` : ''}
        </div></div>
      ${tabExtra && tabExtra.senzaKpi ? '' : kpi()}
      <div class="tabs"><a class="tab ${tab === 'scadenze' ? 'on' : ''}" href="#/pagamenti">Scadenze</a>
        <a class="tab ${tab === 'versamenti' ? 'on' : ''}" href="#/pagamenti/versamenti">Versamenti</a>
        <a class="tab ${tab === 'riepilogo' ? 'on' : ''}" href="#/pagamenti/riepilogo">Riepilogo</a>
        ${extra.map((t) => `<a class="tab ${tab === t.id ? 'on' : ''}" href="#/pagamenti/${esc(t.id)}">${esc(t.titolo)}</a>`).join('')}</div>
      <div id="p-corpo"></div>`;
    $('#p-anno').addEventListener('change', (e) => { pag.anno = Number(e.target.value); pag.filtri = { q: '', stato: '', voce: '' }; L.route(); });
    if (canPay()) {
      $('#b-nver').onclick = () => apriVersamento(null).catch((e) => toast(messaggioErrore(e), 'bad'));
      $('#b-nsc').onclick = () => apriNuovaScadenza().catch((e) => toast(messaggioErrore(e), 'bad'));
      $('#b-gen').onclick = () => apriGenera().catch((e) => toast(messaggioErrore(e), 'bad'));
    }
    if (tabExtra) await tabExtra.render($('#p-corpo'), L.pagamenti);
    else if (tab === 'scadenze') tabScadenze(); else if (tab === 'versamenti') tabVersamenti(); else tabRiepilogo();
  };
})();
