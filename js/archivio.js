/* Lemmi - Archivio cartaceo (Regolamento della segreteria, Parte II).
 * Registro degli originali conservati nelle sei cartelline: dove sta ogni originale, se è in archivio, prelevato
 * per un'esigenza della pratica o trasmesso a un organo, con lo storico dei movimenti.
 * La scansione di un documento non sostituisce l'originale: qui si tiene traccia di dove si trova.
 * Leggono Venerabile, Segretario e amministratore; scrivono Segretario e amministratore. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, oggi } = L;
  const sb = () => state.sb;
  const ruolo = () => (state.profilo && state.profilo.ruolo) || '';
  const scrive = () => ['segretario', 'amministratore'].includes(ruolo());
  const IC = () => L.IC || {};

  const CART = {
    bussanti: 'Bussanti e iniziazioni',
    regolarizzazioni: 'Regolarizzazioni ed exeat in entrata/uscita',
    assemblee_goi: 'Deleghe e inviti alle assemblee del GOI',
    elezioni: 'Tornata elettorale e insediamento delle cariche',
    associazione: 'Associazione Lemmi 812',
    passaggi_grado: 'Passaggi di grado',
  };
  const NUMERO = Object.keys(CART).reduce((m, k, i) => { m[k] = i + 1; return m; }, {});
  const nomeCart = (k) => (CART[k] ? `${NUMERO[k]}. ${CART[k]}` : k);
  const STATO = { in_archivio: 'In archivio', prelevato: 'Prelevato', trasmesso: 'Trasmesso a un organo' };
  const EVENTO = { prelievo: 'Prelievo', trasmissione: 'Trasmissione a un organo', rientro: 'Rientro in archivio' };

  const st = { righe: [], q: '', cart: '', stato: '' };
  const scaduto = (r) => r.stato === 'prelevato' && r.rientro_previsto && r.rientro_previsto < oggi();
  const fuori = (r) => r.stato !== 'in_archivio';

  const badgeStato = (r) => {
    if (r.stato === 'in_archivio') return '<span class="badge ok">In archivio</span>';
    const b = r.stato === 'prelevato' ? '<span class="badge warn">Prelevato</span>' : '<span class="badge gold">Trasmesso</span>';
    return b + (scaduto(r) ? ' <span class="badge bad">Rientro scaduto</span>' : '');
  };

  async function carica() {
    st.righe = chk(await sb().from('originali_cartacei').select('*'))
      .sort((x, y) => ((NUMERO[x.cartellina] || 99) - (NUMERO[y.cartellina] || 99)) || String(x.descrizione).localeCompare(String(y.descrizione), 'it'));
  }

  /* ---------- elenco ---------- */
  const filtrate = () => {
    const q = st.q.trim().toLowerCase();
    return st.righe.filter((r) => (!st.cart || r.cartellina === st.cart)
      && (!st.stato || (st.stato === 'fuori' ? fuori(r) : r.stato === st.stato))
      && (!q || [r.descrizione, r.riferimento, r.destinatario, r.note].join(' ').toLowerCase().includes(q)));
  };

  function riepilogo() {
    const t = st.righe;
    if (!t.length) return '';
    const n = (f) => t.filter(f).length;
    return `<div class="actions" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <span class="badge">${t.length} ${t.length === 1 ? 'originale' : 'originali'}</span>
      <span class="badge ok">${n((r) => !fuori(r))} in archivio</span>
      <span class="badge ${n(fuori) ? 'warn' : ''}">${n(fuori)} fuori sede</span>
      ${n(scaduto) ? `<span class="badge bad">${n(scaduto)} con rientro scaduto</span>` : ''}
      <span class="badge ${n((r) => !r.scansionato) ? 'gray' : ''}">${n((r) => !r.scansionato)} senza scansione</span></div>`;
  }

  function disegna() {
    const v = $('#ar-lista'); if (!v) return;
    const lista = filtrate();
    v.innerHTML = lista.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Cartellina</th><th>Documento</th><th>Riferimento</th><th>Stato</th><th>Dove / a chi</th><th>Rientro previsto</th><th>Scansione</th></tr></thead><tbody>
      ${lista.map((r) => `<tr class="click" data-id="${esc(r.id)}">
        <td>${esc(nomeCart(r.cartellina))}</td><td><b>${esc(r.descrizione)}</b></td><td>${esc(r.riferimento || '—')}</td>
        <td>${badgeStato(r)}</td>
        <td>${r.stato === 'in_archivio' ? '—' : `${esc(r.destinatario || '')}<div class="muted">dal ${esc(fmtData(r.data_uscita))}${r.stato === 'trasmesso' ? (r.copia_in_cartellina ? ' · copia in cartellina' : ' · manca la copia in cartellina') : ''}</div>`}</td>
        <td>${r.rientro_previsto ? esc(fmtData(r.rientro_previsto)) : '—'}</td>
        <td>${r.scansionato ? 'Sì' : 'No'}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">${IC().inbox || ''}<div>${st.righe.length ? 'Nessun risultato.' : 'Nessun originale registrato.' + (scrive() ? ' Con «Nuovo originale» puoi cominciare.' : '')}</div></div>`;
    $$('tr[data-id]', v).forEach((tr) => tr.addEventListener('click', () => dettaglio(tr.dataset.id)));
  }

  /* ---------- finestre ---------- */
  function finestra(titolo, corpo, opt) {
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
      <div class="modal-h"><h2 style="margin:0">${esc(titolo)}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b"><form novalidate>${corpo}<div class="err" data-err style="margin-top:10px"></div>
        ${opt.senzaSalva ? '' : `<div class="actions" style="margin-top:14px"><button class="btn gold" type="submit">${esc(opt.testoOk || 'Salva')}</button>${opt.extra || ''}</div>`}</form></div></div>`;
    document.body.appendChild(ov);
    const tasto = (e) => { if (e.key === 'Escape') chiudi(); };
    const chiudi = () => { document.removeEventListener('keydown', tasto); ov.remove(); };
    document.addEventListener('keydown', tasto);
    $('[data-x]', ov).onclick = chiudi;
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) chiudi(); });
    const f = $('form', ov);
    const errore = (m) => { $('[data-err]', ov).textContent = m; };
    L.mascheraDate(ov);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault(); errore('');
      const b = $('button[type=submit]', f); if (b) b.disabled = true;
      try { if (opt.onSubmit) await opt.onSubmit(f, chiudi, errore); } catch (e) { errore(messaggioErrore(e)); }
      if (b) b.disabled = false;
    });
    return { ov, f, chiudi, errore };
  }

  const campoData = (id, etichetta, valore, nota) => `<div class="f s6"><label for="${id}">${esc(etichetta)}</label>
    <input id="${id}" name="${id}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${esc(L.isoToIt(valore))}">${nota ? `<div class="muted">${esc(nota)}</div>` : ''}</div>`;
  const dataOk = (txt, obbligatoria) => {
    const t = (txt || '').trim();
    if (!t) return obbligatoria ? 'ERR' : null;
    return L.itToIso(t);       // 'ERR' se non valida
  };

  /* nuovo / modifica */
  function modulo(r) {
    const nuovo = !r;
    const x = r || { cartellina: '', descrizione: '', riferimento: '', data_ricezione: oggi(), scansionato: false, note: '' };
    const w = finestra(nuovo ? 'Nuovo originale' : 'Modifica originale', `<div class="form-grid">
      <div class="f s12"><label for="o-cart">Cartellina</label><select id="o-cart" name="cartellina"><option value="">Scegli…</option>${Object.keys(CART).map((k) => `<option value="${k}" ${k === x.cartellina ? 'selected' : ''}>${esc(nomeCart(k))}</option>`).join('')}</select></div>
      <div class="f s12"><label for="o-desc">Documento</label><input id="o-desc" name="descrizione" maxlength="200" placeholder="Es. Domanda A/1 firmata, Promessa solenne, Delega per la Gran Loggia" value="${esc(x.descrizione)}"></div>
      <div class="f s6"><label for="o-rif">Persona o pratica</label><input id="o-rif" name="riferimento" maxlength="120" value="${esc(x.riferimento || '')}"></div>
      ${campoData('o-ric', 'Ricevuto il', x.data_ricezione)}
      <div class="f s12"><label><input type="checkbox" name="scansionato" ${x.scansionato ? 'checked' : ''}> Esiste una scansione nell’archivio digitale</label></div>
      <div class="f s12"><label for="o-note">Note</label><textarea id="o-note" name="note" rows="2">${esc(x.note || '')}</textarea></div></div>`, {
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        if (!e.cartellina.value) return errore('Scegli la cartellina.');
        if (!e.descrizione.value.trim()) return errore('Scrivi quale documento è.');
        const ric = dataOk(e['o-ric'].value, false);
        if (ric === 'ERR') return errore('La data di ricezione non è valida (gg/mm/aaaa).');
        const riga = { cartellina: e.cartellina.value, descrizione: e.descrizione.value.trim(), riferimento: e.riferimento.value.trim() || null, data_ricezione: ric, scansionato: e.scansionato.checked, note: e.note.value.trim() || null };
        if (nuovo) chk(await sb().from('originali_cartacei').insert(riga));
        else chk(await sb().from('originali_cartacei').update(Object.assign(riga, { aggiornato_il: new Date().toISOString() })).eq('id', r.id));
        chiudi(); toast(nuovo ? 'Originale registrato.' : 'Modifiche salvate.', 'ok'); await ricarica();
      },
    });
    return w;
  }

  /* uscita (prelievo o trasmissione) e rientro */
  function movimento(r, tipo) {
    const rientro = tipo === 'rientro';
    finestra(rientro ? 'Registra il rientro' : 'Registra un’uscita', `<p style="margin:0 0 10px"><b>${esc(r.descrizione)}</b>${r.riferimento ? ' · ' + esc(r.riferimento) : ''}</p><div class="form-grid">
      ${rientro ? '' : `<div class="f s12"><label for="m-tipo">Che cosa succede</label><select id="m-tipo" name="tipo"><option value="prelievo">Prelievo temporaneo per la pratica (deve rientrare)</option><option value="trasmissione">Trasmissione a un organo (nella cartellina resta una copia)</option></select></div>
      <div class="f s12"><label for="m-dest">A chi o dove va</label><input id="m-dest" name="destinatario" maxlength="120" placeholder="Es. Gran Segreteria, Collegio dei MM.VV., Agenzia delle Entrate, il Venerabile"></div>`}
      ${campoData('m-data', rientro ? 'Rientrato il' : 'Uscito il', oggi())}
      ${rientro ? '' : `<div class="f s6" id="m-rp"><label for="m-rient">Rientro previsto</label><input id="m-rient" name="rientro" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
      <div class="f s12" id="m-copia" hidden><label><input type="checkbox" name="copia"> Ho lasciato una copia in cartellina, con data e destinatario</label></div>`}
      <div class="f s12"><label for="m-note">Note</label><input id="m-note" name="note" maxlength="200"></div></div>`, {
      testoOk: rientro ? 'Registra il rientro' : 'Registra l’uscita',
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        const data = dataOk(e['m-data'].value, true);
        if (!data || data === 'ERR') return errore('Scrivi la data nel formato gg/mm/aaaa.');
        const ev = rientro ? 'rientro' : e.tipo.value;
        let rp = null;
        if (!rientro) {
          if (!e.destinatario.value.trim()) return errore('Indica a chi o dove va l’originale.');
          rp = ev === 'prelievo' ? dataOk(e.rientro.value, false) : null;
          if (rp === 'ERR') return errore('La data di rientro previsto non è valida (gg/mm/aaaa).');
          if (rp && rp < data) return errore('Il rientro previsto è prima della data di uscita.');
        }
        chk(await sb().rpc('registra_movimento_originale', {
          p_id: r.id, p_evento: ev, p_data: data, p_destinatario: rientro ? null : e.destinatario.value.trim(),
          p_rientro_previsto: rp, p_copia: !rientro && ev === 'trasmissione' ? e.copia.checked : null, p_note: e.note.value.trim() || null,
        }));
        chiudi(); toast(rientro ? 'Rientro registrato.' : 'Uscita registrata.', 'ok'); await ricarica();
      },
    });
    if (!rientro) {
      const sel = $('#m-tipo'), copia = $('#m-copia'), rp = $('#m-rp');
      const agg = () => { const t = sel.value === 'trasmissione'; copia.hidden = !t; rp.hidden = t; };
      sel.addEventListener('change', agg); agg();
    }
  }

  /* scheda con storico */
  async function dettaglio(id) {
    const r = st.righe.find((x) => x.id === id); if (!r) return;
    let mov = [];
    try { mov = chk(await sb().from('originali_movimenti').select('*').eq('originale_id', id).order('data', { ascending: false }).order('creato_il', { ascending: false })); } catch (e) { /* lo storico è facoltativo */ }
    const w = finestra(r.descrizione, `<div class="muted" style="margin-bottom:8px">${esc(nomeCart(r.cartellina))}${r.riferimento ? ' · ' + esc(r.riferimento) : ''}${r.data_ricezione ? ' · ricevuto il ' + esc(fmtData(r.data_ricezione)) : ''}</div>
      <div style="margin-bottom:10px">${badgeStato(r)} <span class="badge ${r.scansionato ? 'ok' : 'gray'}">${r.scansionato ? 'Con scansione' : 'Senza scansione'}</span></div>
      ${fuori(r) ? `<div class="notice ${scaduto(r) ? 'bad' : 'warn'}" style="margin-bottom:10px"><b>${esc(r.destinatario)}</b> dal ${esc(fmtData(r.data_uscita))}${r.rientro_previsto ? ' · rientro previsto il ' + esc(fmtData(r.rientro_previsto)) : ''}${r.stato === 'trasmesso' ? '<br>' + (r.copia_in_cartellina ? 'Nella cartellina c’è la copia.' : 'Nella cartellina manca ancora la copia con data e destinatario.') : ''}</div>` : ''}
      ${r.note ? `<p style="margin:0 0 10px">${esc(r.note)}</p>` : ''}
      <h3 style="margin:12px 0 6px;font-size:1rem">Storico dei movimenti</h3>
      ${mov.length ? `<div class="table-wrap"><table><tbody>${mov.map((m) => `<tr><td>${esc(fmtData(m.data))}</td><td>${esc(EVENTO[m.evento] || m.evento)}</td><td>${esc(m.destinatario || '')}${m.note ? `<div class="muted">${esc(m.note)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<div class="muted">Nessun movimento: l’originale non si è mai spostato dall’archivio.</div>'}
      ${scrive() ? `<div class="actions" style="margin-top:14px;flex-wrap:wrap">
        ${r.stato === 'in_archivio' ? '<button class="btn gold" type="button" data-az="esce">Registra un’uscita</button>' : '<button class="btn gold" type="button" data-az="rientra">Registra il rientro</button>'}
        <button class="btn ghost" type="button" data-az="mod">Modifica</button><button class="btn ghost" type="button" data-az="del">Elimina</button></div>` : ''}`, { senzaSalva: true });
    const az = (n, fn) => { const b = $(`[data-az="${n}"]`, w.ov); if (b) b.onclick = fn; };
    az('esce', () => { w.chiudi(); movimento(r, 'uscita'); });
    az('rientra', () => { w.chiudi(); movimento(r, 'rientro'); });
    az('mod', () => { w.chiudi(); modulo(r); });
    az('del', () => {
      w.chiudi();
      L.eliminaConAnnulla({
        domanda: `Eliminare «${r.descrizione}» dal registro? Si cancella anche il suo storico dei movimenti.`, messaggio: 'Originale eliminato dal registro',
        esegui: async () => { chk(await sb().from('originali_cartacei').delete().eq('id', r.id)); },
        dopo: ricarica,
      });
    });
  }

  /* ---------- Excel ---------- */
  async function excel() {
    await L.libreria('xlsx');
    const X = window.XLSX;
    const aoa = [['Archivio cartaceo — elenco degli originali'], [`Generato il ${fmtData(oggi())}`], [],
      ['Cartellina', 'Documento', 'Persona o pratica', 'Ricevuto il', 'Stato', 'Dove / a chi', 'Uscito il', 'Rientro previsto', 'Copia in cartellina', 'Scansione', 'Note']]
      .concat(st.righe.map((r) => [nomeCart(r.cartellina), r.descrizione, r.riferimento || '', r.data_ricezione ? fmtData(r.data_ricezione) : '', STATO[r.stato] || r.stato,
        r.destinatario || '', r.data_uscita ? fmtData(r.data_uscita) : '', r.rientro_previsto ? fmtData(r.rientro_previsto) : '',
        r.stato === 'trasmesso' ? (r.copia_in_cartellina ? 'Sì' : 'No') : '', r.scansionato ? 'Sì' : 'No', r.note || '']));
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [44, 40, 24, 12, 22, 28, 12, 14, 12, 10, 40].map((c) => ({ wch: c }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Originali');
    const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
    const url = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `Archivio_cartaceo_${oggi()}.xlsx`; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  async function ricarica() {
    try { await carica(); } catch (e) { toast(messaggioErrore(e), 'bad'); }
    const r = $('#ar-riep'); if (r) r.innerHTML = riepilogo();
    disegna();
  }

  /* ---------- pagina ---------- */
  L.viste.archivio = async function (v) {
    v.innerHTML = `<div class="page-head"><div><h1>Archivio cartaceo</h1><p>Dove si trova ogni originale · Regolamento della segreteria, Parte II</p></div>
      <div class="actions">${scrive() ? '<button class="btn gold" type="button" id="ar-nuovo">+ Nuovo originale</button>' : ''}<button class="btn ghost" type="button" id="ar-xls">Scarica l’elenco (Excel)</button></div></div>
      <div class="notice" style="margin-bottom:14px">La scansione di un documento non sostituisce l’originale. Se un originale esce dall’archivio (prelievo per la pratica o trasmissione a un organo) annota dove va e quando deve rientrare; se lo trasmetti, nella cartellina resta una copia con data e destinatario.</div>
      <div id="ar-riep"></div>
      <div class="actions" style="margin-bottom:14px"><div class="searchbar">${IC().search || ''}<input id="ar-q" type="search" placeholder="Cerca documento, persona, destinatario…"></div>
        <select id="ar-cart" style="width:auto"><option value="">Tutte le cartelline</option>${Object.keys(CART).map((k) => `<option value="${k}">${esc(nomeCart(k))}</option>`).join('')}</select>
        <select id="ar-stato" style="width:auto"><option value="">Tutti gli stati</option><option value="in_archivio">In archivio</option><option value="fuori">Fuori sede</option></select></div>
      <div id="ar-lista"><div class="empty">Caricamento…</div></div>`;
    $('#ar-q', v).addEventListener('input', (e) => { st.q = e.target.value; disegna(); });
    $('#ar-cart', v).addEventListener('change', (e) => { st.cart = e.target.value; disegna(); });
    $('#ar-stato', v).addEventListener('change', (e) => { st.stato = e.target.value; disegna(); });
    const nu = $('#ar-nuovo', v); if (nu) nu.onclick = () => modulo(null);
    $('#ar-xls', v).onclick = async () => { try { await excel(); } catch (e) { toast('Errore: ' + messaggioErrore(e), 'bad'); } };
    st.q = ''; st.cart = ''; st.stato = '';
    await ricarica();
  };

  /* ---------- Cruscotto: avviso per gli originali non rientrati ---------- */
  L.cruscottoExtra = L.cruscottoExtra || [];
  const vedeArchivio = () => ['segretario', 'amministratore', 'venerabile'].includes(ruolo());
  const caricaRitardi = async () => chk(await sb().from('originali_cartacei').select('descrizione,destinatario,rientro_previsto').eq('stato', 'prelevato').lt('rientro_previsto', oggi()));
  const extraArchivio = async (v, anticipo) => {
    if (!vedeArchivio()) return;
    let ritardi;
    try { ritardi = await L.datiAnticipati(anticipo, caricaRitardi); } catch (e) { return; }
    if (!ritardi || !ritardi.length) return;
    const el = document.createElement('div');
    el.className = 'notice warn'; el.style.marginTop = '14px';
    el.innerHTML = `<b>Archivio cartaceo:</b> ${ritardi.length === 1 ? 'un originale doveva già essere rientrato' : ritardi.length + ' originali dovevano già essere rientrati'} (${esc(ritardi.slice(0, 2).map((x) => x.descrizione + ' — ' + x.destinatario).join('; '))}${ritardi.length > 2 ? '…' : ''}). <a href="#/archivio">Apri l’archivio</a>`;
    v.appendChild(el);
  };
  extraArchivio.carica = () => (vedeArchivio() ? caricaRitardi() : null);
  L.cruscottoExtra.push(extraArchivio);
})();
