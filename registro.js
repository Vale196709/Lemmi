/* Lemmi - Info di sistema > Registro delle attività (solo amministratore).
 * Mostra chi ha inserito, modificato o eliminato dati, e quando. I dati vengono scritti in automatico dal database
 * (trigger lemmi_audit, script lemmi_aggiornamento_30.sql) e si conservano per 24 mesi. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, messaggioErrore, isAdmin } = L;
  const PAG = 50;

  const NOMI = { fratelli: 'Fratelli', bussanti: 'Bussanti', versamenti: 'Versamenti', scadenze: 'Scadenze', voci_quota: 'Voci di quota', conto_movimenti: 'Conto di Loggia', eventi_conto: 'Eventi del conto', conto_saldi: 'Saldi del conto', pratiche: 'Pratiche', pratiche_passi: 'Passi delle pratiche', pratiche_date: 'Date delle pratiche', documenti: 'Documenti', cariche_storico: 'Cariche', profili: 'Utenti', loggia: 'Loggia' };
  const nomeTab = (t) => NOMI[t] || t.replace(/_/g, ' ');
  const OP = { inserimento: ['Inserimento', 'ok'], modifica: ['Modifica', 'info'], eliminazione: ['Eliminazione', 'bad'] };
  const nonPresente = (e) => /does not exist|schema cache/i.test((e && e.message) || '');
  const dataOra = (iso) => { const d = new Date(iso); return isNaN(d) ? '—' : d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };

  function valore(v) {
    if (v === null || v === undefined) return '∅';
    if (typeof v === 'object') return JSON.stringify(v);
    const s = String(v);
    return s.length > 120 ? s.slice(0, 120) + '…' : s;
  }
  function dettaglio(r) {
    const prima = r.prima || {}, dopo = r.dopo || {};
    if (r.operazione === 'modifica') {
      const chiavi = Object.keys(dopo);
      return chiavi.length ? '<ul class="sys-list">' + chiavi.map((k) => `<li><b>${esc(k)}</b>: ${esc(valore(prima[k]))} → <b>${esc(valore(dopo[k]))}</b></li>`).join('') + '</ul>' : '—';
    }
    const o = r.operazione === 'inserimento' ? dopo : prima;
    const chiavi = Object.keys(o).filter((k) => o[k] !== null && o[k] !== '');
    return '<ul class="sys-list">' + chiavi.slice(0, 14).map((k) => `<li><b>${esc(k)}</b>: ${esc(valore(o[k]))}</li>`).join('') + (chiavi.length > 14 ? '<li>…</li>' : '') + '</ul>';
  }

  L.viste.registro = async function (v) {
    if (!isAdmin()) { v.innerHTML = '<div class="notice bad">Questa sezione è riservata all’amministratore.</div>'; return; }
    v.innerHTML = `<div class="page-head"><div><h1>Registro delle attività</h1><p>Chi ha inserito, modificato o eliminato dati · si conserva per 24 mesi · visibile solo all’amministratore</p></div></div>
      <div class="card"><div class="filters" style="display:flex;flex-wrap:wrap;gap:12px;align-items:end">
        <label>Dati<select id="rg-tab"><option value="">Tutti</option></select></label>
        <label>Operazione<select id="rg-op"><option value="">Tutte</option><option value="inserimento">Inserimenti</option><option value="modifica">Modifiche</option><option value="eliminazione">Eliminazioni</option></select></label>
        <label>Dal<input type="date" id="rg-da"></label><label>Al<input type="date" id="rg-a"></label>
        <label>Utente<input type="search" id="rg-ut" placeholder="e-mail"></label>
        <button class="btn" type="button" id="rg-cerca">Cerca</button></div>
        <div id="rg-ris" style="margin-top:16px"></div></div>`;
    let pag = 0;
    const tabelle = Object.keys(NOMI).filter((k, i, a) => a.indexOf(k) === i);
    $('#rg-tab', v).innerHTML += tabelle.map((t) => `<option value="${esc(t)}">${esc(nomeTab(t))}</option>`).join('');

    async function carica() {
      const out = $('#rg-ris', v);
      out.innerHTML = '<div class="loading"><span class="spin"></span></div>';
      try {
        let q = state.sb.from('registro_attivita').select('*').order('quando', { ascending: false }).range(pag * PAG, pag * PAG + PAG);
        const t = $('#rg-tab', v).value, o = $('#rg-op', v).value, da = $('#rg-da', v).value, a = $('#rg-a', v).value, u = $('#rg-ut', v).value.trim();
        if (t) q = q.eq('tabella', t);
        if (o) q = q.eq('operazione', o);
        if (da) q = q.gte('quando', da + 'T00:00:00');
        if (a) q = q.lte('quando', a + 'T23:59:59');
        if (u) q = q.ilike('utente_email', '%' + u.replace(/[%,]/g, '') + '%');
        const righe = chk(await q);
        const pagina = righe.slice(0, PAG), altre = righe.length > PAG;
        out.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Quando</th><th>Utente</th><th>Operazione</th><th>Dati</th><th>Riga</th><th></th></tr></thead><tbody>
          ${pagina.length ? pagina.map((r, i) => `<tr><td>${esc(dataOra(r.quando))}</td><td>${esc(r.utente_email || 'sistema')}</td>
            <td><span class="badge ${(OP[r.operazione] || ['', 'info'])[1]}">${esc((OP[r.operazione] || [r.operazione])[0])}</span></td>
            <td>${esc(nomeTab(r.tabella))}</td><td>${esc(r.riga_id || '')}</td>
            <td><button class="btn ghost small" type="button" data-det="${i}">Dettagli</button></td></tr>
            <tr hidden data-riga="${i}"><td colspan="6">${dettaglio(r)}</td></tr>`).join('')
            : '<tr><td colspan="6"><div class="empty"><div>Nessuna attività trovata.</div></div></td></tr>'}</tbody></table></div>
          <div class="actions" style="margin-top:12px"><button class="btn ghost small" type="button" id="rg-prec" ${pag ? '' : 'disabled'}>← Più recenti</button>
            <span class="muted">Pagina ${pag + 1}</span><button class="btn ghost small" type="button" id="rg-succ" ${altre ? '' : 'disabled'}>Meno recenti →</button></div>`;
        $$('[data-det]', out).forEach((b) => b.addEventListener('click', () => { const r = $(`[data-riga="${b.dataset.det}"]`, out); r.hidden = !r.hidden; }));
        $('#rg-prec', out).onclick = () => { pag = Math.max(0, pag - 1); carica(); };
        $('#rg-succ', out).onclick = () => { pag += 1; carica(); };
      } catch (e) {
        out.innerHTML = `<div class="notice bad">${nonPresente(e) ? '<b>Manca lo script sul database.</b> Esegui <code>lemmi_aggiornamento_30.sql</code> su Supabase, poi ricarica.' : esc(messaggioErrore(e))}</div>`;
      }
    }
    $('#rg-cerca', v).onclick = () => { pag = 0; carica(); };
    carica();
  };
})();
