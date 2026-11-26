/* Lemmi - Caselle e rinnovi (Regolamento della segreteria, cartella 04).
 * Caselle istituzionali (PEC, PEO), dominio, firma digitale e altri servizi: gestore, scadenza del rinnovo,
 * recapiti di recupero, verifica in due passaggi, ultimo cambio password e dove sono custodite le credenziali.
 * Le password NON si scrivono nell'app. A ogni rinnovo delle cariche il nuovo Venerabile e il nuovo Segretario
 * cambiano le password, verificano recapiti di recupero e verifica in due passaggi e tolgono gli accessi non più autorizzati.
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

  const TIPI = { pec: 'PEC', peo: 'Casella e-mail (PEO)', dominio: 'Dominio / sito', firma: 'Firma digitale', altro: 'Altro servizio' };
  const st = { righe: [], dismessi: false, ultimaElezione: null };

  const giorniA = (iso) => { if (!iso) return null; const [a, m, g] = iso.split('-').map(Number); const [A, M, G] = oggi().split('-').map(Number); return Math.round((Date.UTC(a, m - 1, g) - Date.UTC(A, M - 1, G)) / 86400000); };
  const unAnnoDopo = (iso) => { const [a, m, g] = iso.split('-').map(Number); const d = new Date(Date.UTC(a + 1, m - 1, g)); if (d.getUTCMonth() !== m - 1) d.setUTCDate(0); return d.toISOString().slice(0, 10); };
  // stato della scadenza: 'scaduto', 'vicino' (entro il preavviso), 'ok', '' (senza data o con rinnovo automatico lontano)
  const statoScadenza = (r) => {
    const g = giorniA(r.scadenza);
    if (g === null) return '';
    if (g < 0) return 'scaduto';
    if (g <= (r.preavviso_giorni ?? 30)) return 'vicino';
    return 'ok';
  };
  // password da cambiare: mai registrata, più vecchia di 12 mesi, o precedente all'ultima elezione delle cariche
  const passwordDaCambiare = (r) => {
    if (!r.ultimo_cambio_password) return true;
    if (giorniA(r.ultimo_cambio_password) < -365) return true;
    return !!(st.ultimaElezione && st.ultimaElezione <= oggi() && r.ultimo_cambio_password < st.ultimaElezione);
  };
  const badgeScadenza = (r) => {
    if (!r.scadenza) return '<span class="muted">—</span>';
    const g = giorniA(r.scadenza), s = statoScadenza(r);
    const quando = g < 0 ? `scaduto da ${-g} ${g === -1 ? 'giorno' : 'giorni'}` : g === 0 ? 'scade oggi' : `tra ${g} ${g === 1 ? 'giorno' : 'giorni'}`;
    return `${esc(fmtData(r.scadenza))}<div><span class="badge ${s === 'scaduto' ? 'bad' : s === 'vicino' ? 'warn' : 'ok'}">${quando}</span>${r.rinnovo_automatico ? ' <span class="badge gray">automatico</span>' : ''}</div>`;
  };

  async function carica() {
    const [righe, el] = await Promise.all([
      sb().from('caselle_rinnovi').select('*'),
      sb().from('elezioni').select('data_elezione').not('data_elezione', 'is', null).order('data_elezione', { ascending: false }).limit(1),
    ]);
    st.righe = chk(righe).sort((x, y) => (x.attivo === y.attivo ? 0 : x.attivo ? -1 : 1) || String(x.scadenza || '9999').localeCompare(String(y.scadenza || '9999')) || String(x.nome).localeCompare(String(y.nome), 'it'));
    st.ultimaElezione = (!el.error && el.data && el.data[0] && el.data[0].data_elezione) || null;
  }

  function riepilogo() {
    const t = st.righe.filter((r) => r.attivo);
    if (!t.length) return '';
    const n = (f) => t.filter(f).length;
    const sc = n((r) => statoScadenza(r) === 'scaduto'), vi = n((r) => statoScadenza(r) === 'vicino'), pw = n(passwordDaCambiare), nr = n((r) => !r.recapiti_recupero), n2 = n((r) => !r.due_passaggi);
    return `<div class="actions" style="gap:8px;margin-bottom:12px;flex-wrap:wrap">
      <span class="badge">${t.length} ${t.length === 1 ? 'servizio attivo' : 'servizi attivi'}</span>
      ${sc ? `<span class="badge bad">${sc} scadut${sc === 1 ? 'o' : 'i'}</span>` : ''}
      ${vi ? `<span class="badge warn">${vi} in scadenza</span>` : ''}
      <span class="badge ${pw ? 'warn' : 'ok'}">${pw ? pw + ' con password da cambiare' : 'password aggiornate'}</span>
      ${nr ? `<span class="badge gray">${nr} senza recapiti di recupero</span>` : ''}
      ${n2 ? `<span class="badge gray">${n2} senza verifica in due passaggi</span>` : ''}</div>`;
  }

  function disegna() {
    const v = $('#rn-lista'); if (!v) return;
    const lista = st.righe.filter((r) => st.dismessi || r.attivo);
    v.innerHTML = lista.length ? `<div class="table-wrap"><table>
      <thead><tr><th>Servizio</th><th>Gestore</th><th>Scadenza</th><th>Sicurezza</th><th>Password</th><th>Credenziali</th></tr></thead><tbody>
      ${lista.map((r) => `<tr class="click" data-id="${esc(r.id)}"${r.attivo ? '' : ' style="opacity:.6"'}>
        <td><b>${esc(r.nome)}</b>${r.attivo ? '' : ' <span class="badge gray">dismesso</span>'}<div class="muted">${esc(TIPI[r.tipo] || r.tipo)}${r.indirizzo ? ' · ' + esc(r.indirizzo) : ''}</div></td>
        <td>${esc(r.gestore || '—')}</td>
        <td data-sort="${esc(r.scadenza || '9999')}">${badgeScadenza(r)}</td>
        <td><span class="badge ${r.due_passaggi ? 'ok' : 'gray'}">${r.due_passaggi ? 'due passaggi' : 'senza due passaggi'}</span>${r.recapiti_recupero ? '' : '<div><span class="badge gray">recupero da indicare</span></div>'}</td>
        <td data-sort="${esc(r.ultimo_cambio_password || '0000')}">${r.ultimo_cambio_password ? esc(fmtData(r.ultimo_cambio_password)) : '<span class="muted">mai registrato</span>'}${r.attivo && passwordDaCambiare(r) ? '<div><span class="badge warn">da cambiare</span></div>' : ''}</td>
        <td>${esc(r.custodia_credenziali || '—')}</td></tr>`).join('')}</tbody></table></div>`
      : `<div class="empty">${(L.IC && L.IC.chiave) || ''}<div>${st.righe.length ? 'Nessun servizio attivo.' : 'Nessuna casella o servizio registrato.' + (scrive() ? ' Con «Nuovo servizio» puoi cominciare dalla PEC e dalla PEO della Loggia.' : '')}</div></div>`;
    $$('tr[data-id]', v).forEach((tr) => tr.addEventListener('click', () => dettaglio(tr.dataset.id)));
  }

  /* ---------- finestre ---------- */
  function finestra(titolo, corpo, opt) {
    const ov = document.createElement('div');
    ov.className = 'modal-ov';
    ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(titolo)}">
      <div class="modal-h"><h2 style="margin:0">${esc(titolo)}</h2><button class="btn ghost small" type="button" data-x>Chiudi</button></div>
      <div class="modal-b"><form novalidate>${corpo}<div class="err" data-err style="margin-top:10px"></div>
        ${opt.senzaSalva ? '' : `<div class="actions" style="margin-top:14px"><button class="btn gold" type="submit">${esc(opt.testoOk || 'Salva')}</button></div>`}</form></div></div>`;
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
    const primo = $('input:not([type=checkbox]), select', f); if (primo) primo.focus();
    return { ov, f, chiudi, errore };
  }
  const campoData = (id, etichetta, valore, nota, cls) => `<div class="f ${cls || 's6'}"><label for="${id}">${esc(etichetta)}</label>
    <input id="${id}" name="${id}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off" value="${esc(L.isoToIt(valore))}">${nota ? `<div class="muted">${esc(nota)}</div>` : ''}</div>`;
  const dataOk = (txt) => { const t = (txt || '').trim(); return t ? L.itToIso(t) : null; };   // 'ERR' se non valida

  function modulo(r) {
    const nuovo = !r;
    const x = r || { tipo: 'pec', nome: '', preavviso_giorni: 30, attivo: true };
    finestra(nuovo ? 'Nuovo servizio' : 'Modifica: ' + x.nome, `
      <div class="notice warn" style="margin-bottom:12px">Non scrivere qui le password: indica solo <b>dove</b> sono custodite (es. busta chiusa nella cartella 04).</div>
      <div class="form-grid">
      <div class="f s4"><label for="r-tipo">Tipo</label><select id="r-tipo" name="tipo">${Object.keys(TIPI).map((k) => `<option value="${k}" ${k === x.tipo ? 'selected' : ''}>${esc(TIPI[k])}</option>`).join('')}</select></div>
      <div class="f s8"><label for="r-nome">Nome</label><input id="r-nome" name="nome" maxlength="120" placeholder="Es. PEC della Loggia, Casella del Segretario, Dominio lemmi812.it" value="${esc(x.nome)}"></div>
      <div class="f s8"><label for="r-ind">Indirizzo o dominio</label><input id="r-ind" name="indirizzo" maxlength="160" placeholder="Es. loggia@pec.it" value="${esc(x.indirizzo || '')}"></div>
      <div class="f s4"><label for="r-gest">Gestore</label><input id="r-gest" name="gestore" maxlength="80" placeholder="Es. Aruba" value="${esc(x.gestore || '')}"></div>
      ${campoData('r-scad', 'Scadenza del rinnovo', x.scadenza, '', 's4')}
      <div class="f s4"><label for="r-prea">Avvisami (giorni prima)</label><input id="r-prea" name="preavviso" type="number" min="0" max="365" value="${esc(String(x.preavviso_giorni ?? 30))}"></div>
      <div class="f s4" style="align-self:end"><label><input type="checkbox" name="automatico" ${x.rinnovo_automatico ? 'checked' : ''}> Rinnovo automatico</label></div>
      <div class="f s8"><label for="r-rec">Recapiti di recupero</label><input id="r-rec" name="recupero" maxlength="200" placeholder="E-mail o cellulare per recuperare l’accesso" value="${esc(x.recapiti_recupero || '')}"></div>
      <div class="f s4" style="align-self:end"><label><input type="checkbox" name="due" ${x.due_passaggi ? 'checked' : ''}> Verifica in due passaggi attiva</label></div>
      ${campoData('r-pw', 'Ultimo cambio password', x.ultimo_cambio_password, '', 's4')}
      <div class="f s8"><label for="r-cust">Dove sono custodite le credenziali</label><input id="r-cust" name="custodia" maxlength="160" placeholder="Es. busta chiusa nella cartella 04, presso il Segretario" value="${esc(x.custodia_credenziali || '')}"></div>
      <div class="f s12"><label for="r-chi">Chi può accedere</label><input id="r-chi" name="chi" maxlength="200" placeholder="Es. Venerabile e Segretario in carica" value="${esc(x.chi_accede || '')}"></div>
      <div class="f s12"><label for="r-note">Note</label><textarea id="r-note" name="note" rows="2">${esc(x.note || '')}</textarea></div>
      ${nuovo ? '' : `<div class="f s12"><label><input type="checkbox" name="attivo" ${x.attivo ? 'checked' : ''}> Servizio attivo (togli la spunta se la casella o il dominio non si usano più)</label></div>`}
      </div>`, {
      onSubmit: async (f, chiudi, errore) => {
        const e = f.elements;
        if (!e.nome.value.trim()) return errore('Scrivi il nome del servizio.');
        const scad = dataOk(e['r-scad'].value), pw = dataOk(e['r-pw'].value);
        if (scad === 'ERR') return errore('La scadenza non è valida (gg/mm/aaaa).');
        if (pw === 'ERR') return errore('La data dell’ultimo cambio password non è valida (gg/mm/aaaa).');
        if (pw && pw > oggi()) return errore('L’ultimo cambio password non può essere nel futuro.');
        const prea = Number(e.preavviso.value || 30);
        if (!Number.isInteger(prea) || prea < 0 || prea > 365) return errore('Il preavviso va da 0 a 365 giorni.');
        if (/password\s*[:=]|pwd\s*[:=]/i.test([e.note.value, e.custodia.value].join(' '))) return errore('Sembra che tu stia scrivendo una password: qui va indicato solo dove è custodita.');
        const riga = {
          tipo: e.tipo.value, nome: e.nome.value.trim(), indirizzo: e.indirizzo.value.trim() || null, gestore: e.gestore.value.trim() || null,
          scadenza: scad, preavviso_giorni: prea, rinnovo_automatico: e.automatico.checked, recapiti_recupero: e.recupero.value.trim() || null,
          due_passaggi: e.due.checked, ultimo_cambio_password: pw, custodia_credenziali: e.custodia.value.trim() || null,
          chi_accede: e.chi.value.trim() || null, note: e.note.value.trim() || null,
        };
        if (!nuovo) { riga.attivo = e.attivo.checked; riga.aggiornato_il = new Date().toISOString(); }
        if (nuovo) chk(await sb().from('caselle_rinnovi').insert(riga));
        else chk(await sb().from('caselle_rinnovi').update(riga).eq('id', r.id));
        chiudi(); toast(nuovo ? 'Servizio registrato.' : 'Modifiche salvate.', 'ok'); await ricarica();
      },
    });
  }

  async function aggiorna(r, dati, messaggio) {
    try {
      chk(await sb().from('caselle_rinnovi').update(Object.assign(dati, { aggiornato_il: new Date().toISOString() })).eq('id', r.id));
      toast(messaggio, 'ok'); await ricarica();
    } catch (e) { toast(messaggioErrore(e), 'bad'); }
  }

  function dettaglio(id) {
    const r = st.righe.find((x) => x.id === id); if (!r) return;
    const s = statoScadenza(r), pw = passwordDaCambiare(r);
    const kv = (k, val) => `<div><span>${esc(k)}</span><b>${val}</b></div>`;
    const w = finestra(r.nome, `<div class="muted" style="margin-bottom:10px">${esc(TIPI[r.tipo] || r.tipo)}${r.indirizzo ? ' · ' + esc(r.indirizzo) : ''}${r.attivo ? '' : ' · <b>dismesso</b>'}</div>
      ${r.attivo && (s === 'scaduto' || s === 'vicino') ? `<div class="notice ${s === 'scaduto' ? 'bad' : 'warn'}" style="margin-bottom:10px">${s === 'scaduto' ? 'Rinnovo scaduto' : 'Rinnovo in scadenza'} il ${esc(fmtData(r.scadenza))}${r.rinnovo_automatico ? ': il rinnovo è automatico, controlla che sia andato a buon fine.' : '.'}</div>` : ''}
      ${r.attivo && pw ? `<div class="notice warn" style="margin-bottom:10px">Password da cambiare: ${r.ultimo_cambio_password ? 'l’ultimo cambio registrato è del ' + esc(fmtData(r.ultimo_cambio_password)) + (st.ultimaElezione && r.ultimo_cambio_password < st.ultimaElezione ? ', prima del rinnovo delle cariche del ' + esc(fmtData(st.ultimaElezione)) : ', più di un anno fa') : 'nessun cambio registrato'}. Il Regolamento chiede di cambiarla a ogni rinnovo delle cariche e di verificare recapiti di recupero e verifica in due passaggi.</div>` : ''}
      <div class="kv">
        ${kv('Gestore', esc(r.gestore || '—'))}${kv('Scadenza', r.scadenza ? esc(fmtData(r.scadenza)) + (r.rinnovo_automatico ? ' (automatico)' : '') : '—')}
        ${kv('Recapiti di recupero', esc(r.recapiti_recupero || '—'))}${kv('Verifica in due passaggi', r.due_passaggi ? 'Sì' : 'No')}
        ${kv('Ultimo cambio password', r.ultimo_cambio_password ? esc(fmtData(r.ultimo_cambio_password)) : '—')}${kv('Credenziali custodite', esc(r.custodia_credenziali || '—'))}
        ${kv('Chi può accedere', esc(r.chi_accede || '—'))}${kv('Avviso', (r.preavviso_giorni ?? 30) + ' giorni prima')}
      </div>
      ${r.note ? `<p style="margin:12px 0 0">${esc(r.note)}</p>` : ''}
      ${scrive() ? `<div class="actions" style="margin-top:14px;flex-wrap:wrap">
        <button class="btn gold" type="button" data-az="pw">Password cambiata oggi</button>
        ${r.scadenza ? '<button class="btn ghost" type="button" data-az="rinn">Rinnovato: scadenza +1 anno</button>' : ''}
        <button class="btn ghost" type="button" data-az="mod">Modifica</button><button class="btn ghost" type="button" data-az="del">Elimina</button></div>` : ''}`, { senzaSalva: true });
    const az = (n, fn) => { const b = $(`[data-az="${n}"]`, w.ov); if (b) b.onclick = fn; };
    az('pw', () => { w.chiudi(); aggiorna(r, { ultimo_cambio_password: oggi() }, 'Cambio password registrato con la data di oggi.'); });
    az('rinn', async () => {
      const nuova = unAnnoDopo(r.scadenza);
      w.chiudi();
      if (await window.LemmiDialogo.chiedi(`Registrare il rinnovo di «${r.nome}»?\nLa scadenza passa dal ${fmtData(r.scadenza)} al ${fmtData(nuova)}.`, { ok: 'Registra il rinnovo' })) aggiorna(r, { scadenza: nuova }, 'Rinnovo registrato: nuova scadenza ' + fmtData(nuova) + '.');
    });
    az('mod', () => { w.chiudi(); modulo(r); });
    az('del', () => {
      w.chiudi();
      L.eliminaConAnnulla({
        domanda: `Eliminare «${r.nome}» dall’elenco? Se la casella non si usa più puoi anche solo togliere la spunta «Servizio attivo».`, messaggio: 'Servizio eliminato',
        esegui: async () => { chk(await sb().from('caselle_rinnovi').delete().eq('id', r.id)); },
        dopo: ricarica,
      });
    });
  }

  async function ricarica() {
    try { await carica(); } catch (e) {
      const m = messaggioErrore(e);
      const v = $('#rn-lista');
      if (v && /caselle_rinnovi/.test(String((e && e.message) || m))) { v.innerHTML = '<div class="notice bad">Per usare questa pagina esegui prima lo script <b>sql/lemmi_aggiornamento_53.sql</b> su Supabase.</div>'; return; }
      toast(m, 'bad');
    }
    const r = $('#rn-riep'); if (r) r.innerHTML = riepilogo();
    disegna();
  }

  /* ---------- pagina ---------- */
  L.viste.rinnovi = async function (v) {
    v.innerHTML = `<div class="page-head"><div><h1>Caselle e rinnovi</h1><p>PEC, PEO, dominio e altri servizi della Loggia · Regolamento della segreteria, cartella 04</p></div>
      <div class="actions">${scrive() ? '<button class="btn gold" type="button" id="rn-nuovo">+ Nuovo servizio</button>' : ''}</div></div>
      <div class="notice" style="margin-bottom:14px">Le password <b>non</b> si scrivono nell’app: qui si annota dove sono custodite. A ogni rinnovo delle cariche il nuovo Venerabile e il nuovo Segretario cambiano le password, verificano recapiti di recupero e verifica in due passaggi e tolgono gli accessi non più autorizzati: poi qui si preme «Password cambiata oggi».</div>
      <div id="rn-riep"></div>
      <div class="actions" style="margin-bottom:12px"><label style="margin:0"><input type="checkbox" id="rn-dism"> Mostra anche i servizi dismessi</label></div>
      <div id="rn-lista"><div class="empty">Caricamento…</div></div>`;
    const nu = $('#rn-nuovo', v); if (nu) nu.onclick = () => modulo(null);
    st.dismessi = false;
    $('#rn-dism', v).addEventListener('change', (e) => { st.dismessi = e.target.checked; disegna(); });
    await ricarica();
  };

  /* ---------- Cruscotto: rinnovi in scadenza e password da cambiare ---------- */
  const caricaCr = async () => {
    const [r, el] = await Promise.all([
      sb().from('caselle_rinnovi').select('nome,scadenza,preavviso_giorni,rinnovo_automatico,ultimo_cambio_password,attivo').eq('attivo', true),
      sb().from('elezioni').select('data_elezione').not('data_elezione', 'is', null).order('data_elezione', { ascending: false }).limit(1),
    ]);
    return { righe: chk(r), elezione: (!el.error && el.data && el.data[0] && el.data[0].data_elezione) || null };
  };
  const extraRinnovi = async (v, anticipo) => {
    if (!vede()) return;
    let d;
    try { d = await L.datiAnticipati(anticipo, caricaCr); } catch (e) { return; }
    if (!d || !d.righe || !d.righe.length) return;
    st.ultimaElezione = d.elezione;
    const scad = d.righe.filter((r) => ['scaduto', 'vicino'].includes(statoScadenza(r)));
    const pw = d.righe.filter(passwordDaCambiare);
    if (!scad.length && !pw.length) return;
    const el = document.createElement('div');
    el.className = 'notice ' + (scad.some((r) => statoScadenza(r) === 'scaduto') ? 'bad' : 'warn'); el.style.marginTop = '14px';
    const parti = [];
    if (scad.length) parti.push(scad.slice(0, 3).map((r) => `${esc(r.nome)} ${giorniA(r.scadenza) < 0 ? 'scaduto il' : 'scade il'} ${esc(fmtData(r.scadenza))}`).join(' · ') + (scad.length > 3 ? ` e altri ${scad.length - 3}` : ''));
    if (pw.length) parti.push(`${pw.length === 1 ? 'una password da cambiare' : pw.length + ' password da cambiare'}`);
    el.innerHTML = `<b>Caselle e rinnovi:</b> ${parti.join(' · ')} — <a href="#/rinnovi">apri</a>`;
    v.appendChild(el);
  };
  extraRinnovi.carica = () => (vede() ? caricaCr() : null);
  L.cruscottoExtra = L.cruscottoExtra || [];
  L.cruscottoExtra.push(extraRinnovi);
})();
