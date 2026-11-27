/* Lemmi - Diario della segreteria (Regolamento della segreteria, cartella 08 «Attività svolte dal Segretario in ordine temporale»).
 * Un fascicolo per ogni attività verso la Loggia e il GOI (Gran Segreteria, Consiglio, Anagrafe, Collegio...):
 * data di avvio, oggetto, destinatario, stato, prossimo adempimento e da chi si attende riscontro, con la cronologia
 * di invii, riscontri e solleciti. Il nome della cartella d'archivio segue il Regolamento (es. 2026-10-04_Invio_pie_di_lista_Anagrafe).
 * In più: gli adempimenti ricorrenti dell'anno (piè di lista, verbale delle elezioni, calendario dei lavori) con lo stato fatto/da fare.
 * Leggono Venerabile, Segretario e amministratore; scrivono Segretario e amministratore. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, oggi } = L;
  const sb = () => state.sb;
  const ruolo = () => (state.profilo && state.profilo.ruolo) || '';
  const scrive = () => ['segretario', 'amministratore'].includes(ruolo());
  const vede = () => ['segretario', 'amministratore', 'venerabile'].includes(ruolo());

  const STATI = { aperta: 'In corso', attesa: 'In attesa di riscontro', chiusa: 'Chiusa' };
  const BADGE = { aperta: 'info', attesa: 'warn', chiusa: 'ok' };
  const EVENTI = { invio: 'Invio', riscontro: 'Riscontro ricevuto', sollecito: 'Sollecito', documento: 'Documento', nota: 'Nota' };
  const MEZZI = ['PEC', 'E-mail (PEO)', 'Consegna a mano', 'Posta', 'Portale GOI', 'Telefono', 'Altro'];
  const DEST = ['Gran Segreteria', 'Anagrafe', 'Consiglio dell’Ordine', 'Segreteria del Collegio', 'Grande Oriente d’Italia', 'Gran Tesoreria', 'Maestro Venerabile', 'Loggia'];
  // adempimenti ricorrenti: rif = giorno (mm-gg) da cui l'adempimento è da fare nell'anno
  const RIC = [
    { k: 'piedilista_giugno', oggetto: 'Invio piè di lista al 30 giugno', dest: 'Anagrafe, Gran Segreteria e Segreteria del Collegio', rif: '06-30',
      prossimo: 'Attendere la conferma di ricezione', nota: 'Senza l’invio del piè di lista non si ottiene il Nulla Osta per il rinnovo delle cariche.' },
    { k: 'piedilista_dicembre', oggetto: 'Invio piè di lista al 31 dicembre', dest: 'Anagrafe, Gran Segreteria e Segreteria del Collegio', rif: '12-31',
      prossimo: 'Attendere la conferma di ricezione', nota: 'Senza l’invio del piè di lista non si ottiene il Nulla Osta per il rinnovo delle cariche.' },
    { k: 'verbale_elezioni', oggetto: 'Trasmissione del verbale delle elezioni al GOI', dest: 'Grande Oriente d’Italia', rif: '12-15',
      prossimo: 'Attendere il Nulla Osta', nota: 'Le elezioni annuali si tengono di norma tra il 15 novembre e il 15 dicembre; il verbale va trasmesso subito.' },
    { k: 'calendario_lavori', oggetto: 'Calendario dei lavori', dest: 'Loggia', rif: null,
      prossimo: '', nota: 'Conservare la versione corrente distinguendola dalle precedenti.' },
  ];
  const st = { righe: [], anno: Number(oggi().slice(0, 4)), q: '', stato: '' };

  const slug = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’'`]/g, '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 70);
  const nomeCartella = (data, oggetto, dest) => [data, slug(oggetto), slug(String(dest || '').split(/[,;]| e /)[0])].filter(Boolean).join('_');
  const giorniA = (iso) => { if (!iso) return null; const [a, m, g] = iso.split('-').map(Number); const [A, M, G] = oggi().split('-').map(Number); return Math.round((Date.UTC(a, m - 1, g) - Date.UTC(A, M - 1, G)) / 86400000); };
  const scaduta = (r) => r.stato !== 'chiusa' && r.scadenza && giorniA(r.scadenza) < 0;
  const badgeStato = (r) => `<span class="badge ${BADGE[r.stato] || 'gray'}">${esc(STATI[r.stato] || r.stato)}</span>`;
  const statoRic = (def, anno, righe) => {
    const fatte = righe.filter((r) => r.ricorrente === def.k && Number(r.anno_riferimento) === anno);
    if (fatte.length) return { fatte, da: false };
    const dovuta = def.rif && `${anno}-${def.rif}` <= oggi();
    return { fatte, da: !!dovuta };
  };

  async function carica() {
    st.righe = chk(await sb().from('segreteria_attivita').select('*').order('data', { ascending: false }).order('creato_il', { ascending: false }));
  }
  const anni = () => Array.from(new Set(st.righe.map((r) => Number(String(r.data).slice(0, 4))).concat([Number(oggi().slice(0, 4))]))).sort((a, b) => b - a);
  const filtrate = () => {
    const q = st.q.trim().toLowerCase();
    return st.righe.filter((r) => Number(String(r.data).slice(0, 4)) === st.anno
      && (!st.stato || r.stato === st.stato || (st.stato === 'scadute' && scaduta(r)))
      && (!q || [r.oggetto, r.destinatario, r.prossimo_adempimento, r.attesa_da, r.note, r.rif_archivio].some((x) => String(x || '').toLowerCase().includes(q))));
  };

  function riquadroRicorrenti() {
    const el = $('#dg-ric'); if (!el) return;
    el.innerHTML = `<div class="card" style="margin-bottom:16px"><h2>Adempimenti ricorrenti del ${st.anno}</h2>
      <div class="dg-ric">${RIC.map((d) => {
        const s = statoRic(d, st.anno, st.righe);
        const ult = s.fatte[0];
        return `<div class="dg-ric-v"><div><b>${esc(d.oggetto)}</b><div class="muted">${esc(d.dest)}${d.rif ? ' · da fare dal ' + esc(fmtData(st.anno + '-' + d.rif)) : ''}</div></div>
          <div>${ult ? `${badgeStato(ult)} <button class="btn ghost small" type="button" data-apri="${esc(ult.id)}">Apri</button>`
            : `${s.da ? '<span class="badge bad">da fare</span>' : '<span class="badge gray">non ancora</span>'}${scrive() ? ` <button class="btn ghost small" type="button" data-ric="${esc(d.k)}">Registra</button>` : ''}`}</div></div>`;
      }).join('')}</div></div>`;
    $$('[data-apri]', el).forEach((b) => b.addEventListener('click', () => dettaglio(b.dataset.apri)));
    $$('[data-ric]', el).forEach((b) => b.addEventListener('click', () => { const d = RIC.find((x) => x.k === b.dataset.ric); modulo(null, d); }));
  }

  function riepilogo() {
    const r = st.righe.filter((x) => Number(String(x.data).slice(0, 4)) === st.anno);
    const n = (f) => r.filter(f).length;
    return `<div class="actions" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <span class="badge">${r.length} ${r.length === 1 ? 'attività' : 'attività'} nel ${st.anno}</span>
      ${n((x) => x.stato === 'aperta') ? `<span class="badge info">${n((x) => x.stato === 'aperta')} in corso</span>` : ''}
      ${n((x) => x.stato === 'attesa') ? `<span class="badge warn">${n((x) => x.stato === 'attesa')} in attesa di riscontro</span>` : ''}
      ${n(scaduta) ? `<span class="badge bad">${n(scaduta)} con scadenza superata</span>` : ''}
      <span class="badge ok">${n((x) => x.stato === 'chiusa')} chiuse</span></div>`;
  }

  function disegna() {
    const v = $('#dg-lista'); if (!v) return;
    const lista = filtrate();
    v.innerHTML = lista.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Data</th><th>Attività</th><th>Destinatario</th><th>Stato</th><th>Prossimo adempimento</th></tr></thead><tbody>
      ${lista.map((r) => `<tr class="click" data-id="${esc(r.id)}">
        <td data-sort="${esc(r.data)}"><b>${esc(fmtData(r.data))}</b></td>
        <td><b>${esc(r.oggetto)}</b>${r.rif_archivio ? `<div class="muted dg-cart">📁 ${esc(r.rif_archivio)}</div>` : ''}</td>
        <td>${esc(r.destinatario || '—')}</td>
        <td>${badgeStato(r)}</td>
        <td>${r.stato === 'chiusa' ? (r.chiusa_il ? '<span class="muted">chiusa il ' + esc(fmtData(r.chiusa_il)) + '</span>' : '—') : `${esc(r.prossimo_adempimento || '—')}${r.attesa_da ? `<div class="muted">da: ${esc(r.attesa_da)}</div>` : ''}${r.scadenza ? `<div><span class="badge ${scaduta(r) ? 'bad' : 'gray'}">entro il ${esc(fmtData(r.scadenza))}</span></div>` : ''}`}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">${(L.IC && L.IC.diario) || ''}<div>${st.righe.length ? 'Nessuna attività per questa ricerca.' : 'Il diario è vuoto.' + (scrive() ? ' Con «Nuova attività» registri il primo invio, per esempio il piè di lista.' : '')}</div></div>`;
    $$('tr[data-id]', v).forEach((tr) => tr.addEventListener('click', () => dettaglio(tr.dataset.id)));
  }

  async function ricarica() {
    try { await carica(); } catch (e) {
      const v = $('#dg-lista');
      if (v && /segreteria_attivita/.test(String((e && e.message) || ''))) { v.innerHTML = '<div class="notice bad">Per usare il diario esegui prima lo script <b>sql/lemmi_aggiornamento_55.sql</b> su Supabase.</div>'; return; }
      toast(messaggioErrore(e), 'bad');
    }
    const sel = $('#dg-anno');
    if (sel) sel.innerHTML = anni().map((a) => `<option value="${a}" ${a === st.anno ? 'selected' : ''}>${a}</option>`).join('');
    const r = $('#dg-riep'); if (r) r.innerHTML = riepilogo();
    riquadroRicorrenti();
    disegna();
  }

  /* ---------- finestre ---------- */
  function finestra(titolo, corpo, opt) {
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
      <div class="modal-h"><h2 class="m-0">${esc(titolo)}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b"><form novalidate>${corpo}<div class="err mt-10" data-err></div>
        ${opt.senzaSalva ? '' : `<div class="actions mt-14"><button class="btn gold" type="submit">${esc(opt.testoOk || 'Salva')}</button></div>`}</form></div></div>`;
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
    const primo = $('input:not([type=checkbox]):not([readonly]), select, textarea', f); if (primo && !opt.senzaSalva) primo.focus();
    return { ov, f, chiudi, errore };
  }
  const campoData = (id, etichetta, valore, cls) => `<div class="f ${cls || 's4'}"><label for="${id}">${esc(etichetta)}</label>
    <input id="${id}" name="${id}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${esc(L.isoToIt(valore))}"></div>`;
  const dataOk = (txt) => { const t = (txt || '').trim(); return t ? L.itToIso(t) : null; };

  function modulo(r, ric) {
    const nuovo = !r;
    const x = r || { data: oggi(), oggetto: ric ? ric.oggetto : '', destinatario: ric ? ric.dest : '', stato: 'aperta', prossimo_adempimento: ric ? ric.prossimo : '',
      ricorrente: ric ? ric.k : null, anno_riferimento: ric ? st.anno : null, note: ric ? ric.nota : '' };
    const w = finestra(nuovo ? 'Nuova attività' : 'Modifica attività', `<div class="form-grid">
      ${campoData('a-data', 'Data di avvio', x.data, 's4')}
      <div class="f s8"><label for="a-ogg">Oggetto</label><input id="a-ogg" name="oggetto" maxlength="200" placeholder="Es. Invio piè di lista, Richiesta Nulla Osta, Deleghe per la Gran Loggia" value="${esc(x.oggetto)}"></div>
      <div class="f s12"><label for="a-dest">Destinatario (organo o ufficio)</label><input id="a-dest" name="destinatario" list="dg-dl-dest" maxlength="160" value="${esc(x.destinatario || '')}">
        <datalist id="dg-dl-dest">${DEST.map((d) => `<option value="${esc(d)}"></option>`).join('')}</datalist></div>
      <div class="f s4"><label for="a-stato">Stato</label><select id="a-stato" name="stato">${Object.keys(STATI).map((k) => `<option value="${k}" ${k === x.stato ? 'selected' : ''}>${esc(STATI[k])}</option>`).join('')}</select></div>
      <div class="f s8"><label for="a-pross">Prossimo adempimento</label><input id="a-pross" name="prossimo" maxlength="200" placeholder="Es. Attendere la conferma dell’Anagrafe" value="${esc(x.prossimo_adempimento || '')}"></div>
      <div class="f s8"><label for="a-att">Riscontro atteso da</label><input id="a-att" name="attesa" maxlength="120" placeholder="Es. Anagrafe, Collegio" value="${esc(x.attesa_da || '')}"></div>
      ${campoData('a-scad', 'Entro il (facoltativo)', x.scadenza, 's4')}
      <div class="f s12"><label for="a-cart">Cartella d’archivio (08 › anno)</label><input id="a-cart" name="cartella" maxlength="160" placeholder="Si compila da sola: data_oggetto_destinatario" value="${esc(x.rif_archivio || '')}">
        <div class="muted">Come chiede il Regolamento, es. 2026-10-04_Invio_pie_di_lista_Anagrafe. Lasciala vuota per crearla dai dati.</div></div>
      ${x.ricorrente ? `<div class="f s12"><label for="a-anno">Adempimento ricorrente: anno di riferimento</label><input id="a-anno" name="anno_rif" type="number" min="2000" max="2100" value="${esc(String(x.anno_riferimento || st.anno))}"></div>` : ''}
      <div class="f s12"><label for="a-note">Note</label><textarea id="a-note" name="note" rows="3">${esc(x.note || '')}</textarea></div></div>`, {
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        const data = dataOk(e['a-data'].value);
        if (!data || data === 'ERR') return errore('Scrivi la data di avvio nel formato gg/mm/aaaa.');
        if (!e.oggetto.value.trim()) return errore('Scrivi l’oggetto dell’attività.');
        const scad = dataOk(e['a-scad'].value);
        if (scad === 'ERR') return errore('La data «entro il» non è valida (gg/mm/aaaa).');
        const riga = {
          data, oggetto: e.oggetto.value.trim(), destinatario: e.destinatario.value.trim() || null, stato: e.stato.value,
          prossimo_adempimento: e.prossimo.value.trim() || null, attesa_da: e.attesa.value.trim() || null, scadenza: scad,
          rif_archivio: e.cartella.value.trim() || nomeCartella(data, e.oggetto.value.trim(), e.destinatario.value.trim()),
          note: e.note.value.trim() || null,
        };
        if (x.ricorrente) { riga.ricorrente = x.ricorrente; riga.anno_riferimento = Number(e.anno_rif.value) || st.anno; }
        if (riga.stato === 'chiusa' && (!r || r.stato !== 'chiusa')) riga.chiusa_il = oggi();
        if (riga.stato !== 'chiusa') riga.chiusa_il = null;
        if (nuovo) chk(await sb().from('segreteria_attivita').insert(riga));
        else chk(await sb().from('segreteria_attivita').update(Object.assign(riga, { aggiornato_il: new Date().toISOString() })).eq('id', r.id));
        chiudi(); toast(nuovo ? 'Attività registrata nel diario.' : 'Modifiche salvate.', 'ok');
        st.anno = Number(data.slice(0, 4)); await ricarica();
      },
    });
    // il nome della cartella si propone mentre si scrive (finché non lo si modifica a mano)
    const cart = $('#a-cart', w.ov);
    let manuale = !!x.rif_archivio;
    cart.addEventListener('input', () => { manuale = !!cart.value.trim(); });
    const proponi = () => { if (manuale) return; const d = dataOk($('#a-data', w.ov).value); cart.placeholder = nomeCartella(d && d !== 'ERR' ? d : '', $('#a-ogg', w.ov).value, $('#a-dest', w.ov).value) || 'data_oggetto_destinatario'; };
    ['#a-data', '#a-ogg', '#a-dest'].forEach((s) => $(s, w.ov).addEventListener('input', proponi)); proponi();
  }

  function evento(r, tipo) {
    finestra(EVENTI[tipo] + ' · ' + r.oggetto, `<div class="form-grid">
      ${campoData('e-data', 'Data', oggi(), 's4')}
      ${['invio', 'sollecito', 'riscontro'].includes(tipo) ? `<div class="f s8"><label for="e-mezzo">Mezzo</label><select id="e-mezzo" name="mezzo"><option value="">—</option>${MEZZI.map((m) => `<option>${esc(m)}</option>`).join('')}</select></div>` : ''}
      <div class="f s12"><label for="e-desc">${tipo === 'documento' ? 'Documento (nome del file nella cartella)' : 'Descrizione'}</label><textarea id="e-desc" name="descrizione" rows="3" placeholder="${tipo === 'invio' ? 'Es. Inviato con allegati A, B; ricevuta di consegna PEC conservata' : tipo === 'riscontro' ? 'Es. Conferma di ricezione dell’Anagrafe, prot. n.' : ''}"></textarea></div>
      ${tipo === 'invio' && r.stato === 'aperta' ? '<div class="f s12"><label><input type="checkbox" name="attesa" checked> Metti l’attività «in attesa di riscontro»</label></div>' : ''}
      ${tipo === 'riscontro' && r.stato !== 'chiusa' ? '<div class="f s12"><label><input type="checkbox" name="chiudi" checked> Chiudi l’attività (adempimento concluso)</label></div>' : ''}</div>`, {
      testoOk: 'Registra',
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        const data = dataOk(e['e-data'].value);
        if (!data || data === 'ERR') return errore('Scrivi la data nel formato gg/mm/aaaa.');
        if (tipo === 'documento' && !e.descrizione.value.trim()) return errore('Indica il documento.');
        chk(await sb().from('segreteria_eventi').insert({ attivita_id: r.id, data, tipo, descrizione: e.descrizione.value.trim() || null, mezzo: (e.mezzo && e.mezzo.value) || null }));
        const agg = {};
        if (e.attesa && e.attesa.checked) agg.stato = 'attesa';
        if (e.chiudi && e.chiudi.checked) { agg.stato = 'chiusa'; agg.chiusa_il = data; }
        if (Object.keys(agg).length) chk(await sb().from('segreteria_attivita').update(Object.assign(agg, { aggiornato_il: new Date().toISOString() })).eq('id', r.id));
        chiudi(); toast(EVENTI[tipo] + ' registrato.', 'ok'); await ricarica(); dettaglio(r.id);
      },
    });
  }

  async function dettaglio(id) {
    const r = st.righe.find((x) => x.id === id); if (!r) return;
    let ev = [];
    try { ev = chk(await sb().from('segreteria_eventi').select('*').eq('attivita_id', id).order('data').order('creato_il')); } catch (e) { /* cronologia facoltativa */ }
    const w = finestra(r.oggetto, `<div class="muted mb-8">Dal ${esc(fmtData(r.data))}${r.destinatario ? ' · ' + esc(r.destinatario) : ''}</div>
      <div class="mb-10">${badgeStato(r)}${scaduta(r) ? ' <span class="badge bad">scadenza superata</span>' : ''}</div>
      ${r.stato !== 'chiusa' && (r.prossimo_adempimento || r.attesa_da) ? `<div class="notice ${scaduta(r) ? 'bad' : 'warn'}" style="margin-bottom:10px"><b>Prossimo adempimento:</b> ${esc(r.prossimo_adempimento || '—')}${r.attesa_da ? ' · riscontro atteso da ' + esc(r.attesa_da) : ''}${r.scadenza ? ' · entro il ' + esc(fmtData(r.scadenza)) : ''}</div>` : ''}
      ${r.rif_archivio ? `<div class="dg-cart-box"><span>📁 Cartella 08 › ${esc(String(r.data).slice(0, 4))} › <b>${esc(r.rif_archivio)}</b></span> <button class="btn ghost small" type="button" data-az="copia">Copia il nome</button></div>` : ''}
      ${r.note ? `<p style="margin:10px 0 0">${esc(r.note)}</p>` : ''}
      <h3 style="margin:14px 0 6px;font-size:1rem">Cronologia</h3>
      ${ev.length ? `<ul class="dg-cron">${ev.map((e) => `<li><span class="dg-data">${esc(fmtData(e.data))}</span><div><b>${esc(EVENTI[e.tipo] || e.tipo)}</b>${e.mezzo ? ' · ' + esc(e.mezzo) : ''}${e.descrizione ? `<div class="muted">${esc(e.descrizione)}</div>` : ''}</div>${scrive() ? `<button class="btn ghost small" type="button" data-del-ev="${esc(e.id)}" title="Togli dalla cronologia" aria-label="Togli dalla cronologia">×</button>` : ''}</li>`).join('')}</ul>` : '<div class="muted">Nessun evento registrato.</div>'}
      ${scrive() ? `<div class="actions" style="margin-top:14px;flex-wrap:wrap">
        <button class="btn gold small" type="button" data-ev="invio">+ Invio</button><button class="btn ghost small" type="button" data-ev="riscontro">+ Riscontro</button>
        <button class="btn ghost small" type="button" data-ev="sollecito">+ Sollecito</button><button class="btn ghost small" type="button" data-ev="documento">+ Documento</button>
        <button class="btn ghost small" type="button" data-ev="nota">+ Nota</button></div>
        <div class="actions" style="margin-top:8px;flex-wrap:wrap">
        ${r.stato === 'chiusa' ? '<button class="btn ghost" type="button" data-az="riapri">Riapri</button>' : '<button class="btn ghost" type="button" data-az="chiudi">Segna come chiusa</button>'}
        <button class="btn ghost" type="button" data-az="mod">Modifica</button><button class="btn ghost" type="button" data-az="del">Elimina</button></div>` : ''}`, { senzaSalva: true });
    const az = (n, fn) => { const b = $(`[data-az="${n}"]`, w.ov); if (b) b.onclick = fn; };
    $$('[data-ev]', w.ov).forEach((b) => b.addEventListener('click', () => { w.chiudi(); evento(r, b.dataset.ev); }));
    az('copia', async () => { try { await navigator.clipboard.writeText(r.rif_archivio); toast('Nome della cartella copiato.', 'ok'); } catch (e) { toast('Copia non riuscita: selezionalo a mano.', 'bad'); } });
    const cambia = async (agg, msg) => { try { chk(await sb().from('segreteria_attivita').update(Object.assign(agg, { aggiornato_il: new Date().toISOString() })).eq('id', r.id)); toast(msg, 'ok'); w.chiudi(); await ricarica(); } catch (e) { toast(messaggioErrore(e), 'bad'); } };
    az('chiudi', () => cambia({ stato: 'chiusa', chiusa_il: oggi() }, 'Attività chiusa.'));
    az('riapri', () => cambia({ stato: 'aperta', chiusa_il: null }, 'Attività riaperta.'));
    az('mod', () => { w.chiudi(); modulo(r); });
    az('del', () => {
      w.chiudi();
      L.eliminaConAnnulla({
        domanda: `Eliminare «${r.oggetto}» dal diario? Si cancella anche la sua cronologia.`, messaggio: 'Attività eliminata dal diario',
        esegui: async () => { chk(await sb().from('segreteria_attivita').delete().eq('id', r.id)); }, dopo: ricarica,
      });
    });
    $$('[data-del-ev]', w.ov).forEach((b) => b.addEventListener('click', async () => {
      if (!(await window.LemmiDialogo.chiedi('Togliere questo evento dalla cronologia?', { elimina: true }))) return;
      try { chk(await sb().from('segreteria_eventi').delete().eq('id', b.dataset.delEv)); w.chiudi(); dettaglio(r.id); } catch (e) { toast(messaggioErrore(e), 'bad'); }
    }));
  }

  /* ---------- Excel: indice della cartella 08 dell'anno ---------- */
  async function excel() {
    const lista = st.righe.filter((r) => Number(String(r.data).slice(0, 4)) === st.anno).slice().sort((a, b) => String(a.data).localeCompare(String(b.data)));
    let ev = [];
    if (lista.length) { try { ev = chk(await sb().from('segreteria_eventi').select('*').in('attivita_id', lista.map((r) => r.id)).order('data')); } catch (e) { ev = []; } }
    await L.libreria('xlsx');
    const X = window.XLSX;
    const aoa = [[`Diario della segreteria — cartella 08 — anno ${st.anno}`], [`${(state.loggia && state.loggia.nome) || ''} · generato il ${fmtData(oggi())}`], [],
      ['Data', 'Oggetto', 'Destinatario', 'Stato', 'Prossimo adempimento', 'Riscontro atteso da', 'Entro il', 'Chiusa il', 'Cartella d’archivio', 'Cronologia', 'Note']]
      .concat(lista.map((r) => [fmtData(r.data), r.oggetto, r.destinatario || '', STATI[r.stato] || r.stato, r.prossimo_adempimento || '', r.attesa_da || '',
        r.scadenza ? fmtData(r.scadenza) : '', r.chiusa_il ? fmtData(r.chiusa_il) : '', r.rif_archivio || '',
        ev.filter((e) => e.attivita_id === r.id).map((e) => `${fmtData(e.data)} ${EVENTI[e.tipo] || e.tipo}${e.mezzo ? ' (' + e.mezzo + ')' : ''}${e.descrizione ? ': ' + e.descrizione : ''}`).join('\n'), r.note || '']));
    const ws = X.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [11, 40, 28, 18, 34, 22, 11, 11, 44, 60, 36].map((c) => ({ wch: c }));
    const wb = X.utils.book_new(); X.utils.book_append_sheet(wb, ws, 'Cartella 08 ' + st.anno);
    const out = X.write(wb, { bookType: 'xlsx', type: 'array' });
    const url = URL.createObjectURL(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = `Diario_segreteria_${st.anno}.xlsx`; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  /* ---------- pagina ---------- */
  L.viste.diario = async function (v) {
    v.innerHTML = `<div class="page-head"><div><h1>Diario della segreteria</h1><p>Attività del Segretario verso la Loggia e il GOI, in ordine di data · Regolamento della segreteria, cartella 08</p></div>
      <div class="actions">${scrive() ? '<button class="btn gold" type="button" id="dg-nuovo">+ Nuova attività</button>' : ''}<button class="btn ghost" type="button" id="dg-xls">Indice dell’anno (Excel)</button></div></div>
      <div id="dg-ric"></div>
      <div id="dg-riep"></div>
      <div class="actions mb-14"><select id="dg-anno" class="w-auto" aria-label="Anno"></select>
        <div class="searchbar">${(L.IC && L.IC.search) || ''}<input id="dg-q" type="search" placeholder="Cerca oggetto, destinatario, cartella…"></div>
        <select id="dg-stato" class="w-auto" aria-label="Stato"><option value="">Tutti gli stati</option>${Object.keys(STATI).map((k) => `<option value="${k}">${esc(STATI[k])}</option>`).join('')}<option value="scadute">Con scadenza superata</option></select></div>
      <div id="dg-lista"><div class="empty">Caricamento…</div></div>`;
    st.q = ''; st.stato = ''; st.anno = Number(oggi().slice(0, 4));
    $('#dg-anno', v).addEventListener('change', (e) => { st.anno = Number(e.target.value); const r = $('#dg-riep'); if (r) r.innerHTML = riepilogo(); riquadroRicorrenti(); disegna(); });
    $('#dg-q', v).addEventListener('input', (e) => { st.q = e.target.value; disegna(); });
    $('#dg-stato', v).addEventListener('change', (e) => { st.stato = e.target.value; disegna(); });
    const nu = $('#dg-nuovo', v); if (nu) nu.onclick = () => modulo(null);
    $('#dg-xls', v).onclick = async () => { try { await excel(); } catch (e) { toast('Errore: ' + messaggioErrore(e), 'bad'); } };
    await ricarica();
  };

  /* ---------- Cruscotto: attività con scadenza superata e adempimenti ricorrenti da fare ---------- */
  const caricaCr = async () => chk(await sb().from('segreteria_attivita').select('id,oggetto,stato,scadenza,ricorrente,anno_riferimento,data'));
  const extraDiario = async (v, anticipo) => {
    if (!vede()) return;
    let righe;
    try { righe = await L.datiAnticipati(anticipo, caricaCr); } catch (e) { return; }
    if (!righe) return;
    const anno = Number(oggi().slice(0, 4));
    const scad = righe.filter(scaduta);
    // adempimenti ricorrenti dell'anno in corso (e il piè di lista di dicembre dell'anno prima, a gennaio)
    const daFare = RIC.filter((d) => statoRic(d, anno, righe).da)
      .concat(oggi().slice(5, 7) === '01' && statoRic(RIC[1], anno - 1, righe).da ? [Object.assign({}, RIC[1], { oggetto: RIC[1].oggetto + ' ' + (anno - 1) })] : []);
    if (!scad.length && !daFare.length) return;
    const el = document.createElement('div');
    el.className = 'notice ' + (scad.length ? 'bad' : 'warn'); el.style.marginTop = '14px';
    const parti = [];
    if (daFare.length) parti.push('da fare: ' + daFare.map((d) => esc(d.oggetto)).join(' · '));
    if (scad.length) parti.push(scad.length === 1 ? `«${esc(scad[0].oggetto)}» ha la scadenza superata` : `${scad.length} attività con scadenza superata`);
    el.innerHTML = `<b>Diario della segreteria:</b> ${parti.join(' — ')} — <a href="#/diario">apri</a>`;
    v.appendChild(el);
  };
  extraDiario.carica = () => (vede() ? caricaCr() : null);
  L.cruscottoExtra = L.cruscottoExtra || [];
  L.cruscottoExtra.push(extraDiario);
})();
