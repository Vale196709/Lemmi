/* Lemmi - Ripristino guidato da backup (solo amministratore), aperto da Stato del sistema.
 * Passi: 1) si sceglie il backup, 2) si vede cosa differisce dallo stato attuale, 3) si conferma tabella per tabella.
 * Non si sovrascrive mai tutto in blocco; prima di ogni ripristino il database fa da solo un backup di sicurezza. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore } = L;
  const NOMI = { fratelli: 'Fratelli', bussanti: 'Bussanti', versamenti: 'Versamenti', scadenze: 'Scadenze', voci_quota: 'Voci di quota', conto_movimenti: 'Conto di Loggia', eventi_conto: 'Eventi del conto', conto_saldi: 'Saldi del conto', pratiche: 'Pratiche', pratiche_passi: 'Passi delle pratiche', pratiche_date: 'Date delle pratiche', documenti: 'Documenti', cariche_storico: 'Cariche', profili: 'Utenti', loggia: 'Loggia' };
  const nome = (t) => NOMI[t] || t.replace(/_/g, ' ');
  const val = (x) => { const s = x !== null && typeof x === 'object' ? JSON.stringify(x) : String(x); return s.length > 90 ? s.slice(0, 90) + '…' : s; };
  const dato = (o) => Object.keys(o || {}).filter((k) => o[k] !== null && o[k] !== '').slice(0, 5).map((k) => `${k}: ${val(o[k])}`).join(' · ');

  async function apri(id, box) {
    box.hidden = false;
    box.innerHTML = '<div class="card"><div class="loading"><span class="spin"></span></div></div>';
    box.scrollIntoView({ behavior: 'smooth', block: 'start' });
    let r;
    try { r = chk(await state.sb.rpc('anteprima_ripristino', { p_esec: Number(id) })); if (r && r.data !== undefined && !r.eliminate) r = r.data; }
    catch (e) {
      box.innerHTML = `<div class="card"><div class="notice bad">${/function|schema cache/i.test(e.message || '') ? '<b>Manca lo script sul database.</b> Esegui <code>lemmi_aggiornamento_30.sql</code>, poi ricarica.' : esc(messaggioErrore(e))}</div></div>`;
      return;
    }
    const tab = Object.keys(r || {}).sort();
    const diff = tab.filter((t) => r[t].eliminate > 0 || r[t].modificate > 0);
    box.innerHTML = `<div class="card"><h2>Ripristino dal backup n. ${esc(id)} <button class="btn ghost small" type="button" id="rip-chiudi" style="float:right">Chiudi</button></h2>
      <div class="notice"><b>Come funziona.</b> Si confronta il backup con i dati di oggi. Puoi <b>recuperare le righe eliminate</b> (le righe attuali non vengono toccate) oppure <b>riportare le righe modificate</b> alla versione del backup. Le righe nuove, inserite dopo il backup, non vengono mai cancellate. Prima di ogni ripristino il sistema salva da solo un backup di sicurezza. Ripristina prima le tabelle “principali” (es. Fratelli) e poi quelle collegate (es. Quote).</div>
      ${diff.length ? `<div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Dati</th><th style="text-align:right">Eliminate dopo il backup</th><th style="text-align:right">Modificate</th><th style="text-align:right">Nuove (restano)</th><th></th></tr></thead><tbody>
        ${diff.map((t) => `<tr><td><b>${esc(nome(t))}</b><div class="hint">${esc(t)}</div></td><td style="text-align:right">${r[t].eliminate}</td><td style="text-align:right">${r[t].modificate}</td><td style="text-align:right">${r[t].nuove}</td>
          <td><button class="btn small" type="button" data-esamina="${esc(t)}">Esamina…</button></td></tr>`).join('')}</tbody></table></div>`
        : '<div class="empty" style="margin-top:14px"><div>Nessuna differenza: i dati attuali coincidono con questo backup, a parte righe nuove.</div></div>'}
      <div id="rip-det" style="margin-top:16px"></div></div>`;
    $('#rip-chiudi', box).onclick = () => { box.hidden = true; box.innerHTML = ''; };
    $$('[data-esamina]', box).forEach((b) => b.addEventListener('click', () => esamina(id, b.dataset.esamina, box)));
  }

  async function esamina(id, t, box) {
    const det = $('#rip-det', box);
    det.innerHTML = '<div class="loading"><span class="spin"></span></div>';
    det.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    try {
      let d = chk(await state.sb.rpc('anteprima_ripristino', { p_esec: Number(id), p_tabella: t }));
      if (d && d.data !== undefined && d.eliminate === undefined) d = d.data;
      det.innerHTML = `<h3>${esc(nome(t))}</h3>
        ${d.eliminate ? `<p><b>${d.eliminate}</b> ${d.eliminate === 1 ? 'riga eliminata' : 'righe eliminate'} da recuperare${d.esempi_eliminate.length ? ', ad esempio:' : ''}</p>
          <ul class="sys-list">${d.esempi_eliminate.map((x) => `<li>${esc(dato(x))}</li>`).join('')}</ul>
          <div class="actions"><button class="btn" type="button" data-fai="eliminate">Recupera ${d.eliminate} ${d.eliminate === 1 ? 'riga eliminata' : 'righe eliminate'}</button></div>` : ''}
        ${d.modificate ? `<p style="margin-top:14px"><b>${d.modificate}</b> ${d.modificate === 1 ? 'riga modificata' : 'righe modificate'} dopo il backup${d.esempi_modificate.length ? ', ad esempio:' : ''}</p>
          <ul class="sys-list">${d.esempi_modificate.map((x) => `<li>Backup: ${esc(dato(x.prima))}<br>Oggi: ${esc(dato(x.ora))}</li>`).join('')}</ul>
          ${d.con_chiave ? `<div class="actions"><button class="btn danger" type="button" data-fai="modificate">Riporta ${d.modificate} ${d.modificate === 1 ? 'riga' : 'righe'} alla versione del backup</button></div>`
            : '<div class="notice">Questa tabella non ha un identificativo: le modifiche non si possono riportare, solo recuperare le righe eliminate.</div>'}` : ''}
        <div id="rip-conf" style="margin-top:14px"></div>`;
      $$('[data-fai]', det).forEach((b) => b.addEventListener('click', () => conferma(id, t, b.dataset.fai, b.textContent, box)));
    } catch (e) { det.innerHTML = `<div class="notice bad">${esc(messaggioErrore(e))}</div>`; }
  }

  function conferma(id, t, modo, testo, box) {
    const c = $('#rip-conf', box);
    c.innerHTML = `<div class="notice bad"><b>Conferma.</b> Stai per eseguire: «${esc(testo)}» su ${esc(nome(t))}. Scrivi <b>RIPRISTINA</b> per procedere.
      <div class="actions" style="margin-top:8px"><input id="rip-txt" autocomplete="off" style="max-width:180px"><button class="btn danger" type="button" id="rip-ok" disabled>Esegui</button><button class="btn ghost" type="button" id="rip-no">Annulla</button></div></div>`;
    const inp = $('#rip-txt', c), ok = $('#rip-ok', c);
    inp.addEventListener('input', () => { ok.disabled = inp.value.trim().toUpperCase() !== 'RIPRISTINA'; });
    $('#rip-no', c).onclick = () => { c.innerHTML = ''; };
    ok.onclick = async () => {
      ok.disabled = true; ok.textContent = 'Ripristino…';
      try {
        let r = chk(await state.sb.rpc('ripristina_tabella', { p_esec: Number(id), p_tabella: t, p_modo: modo }));
        if (r && r.data !== undefined && r.ok === undefined) r = r.data;
        toast(`Ripristinate ${r.righe} ${r.righe === 1 ? 'riga' : 'righe'} in ${nome(t)}. Backup di sicurezza n. ${r.backup_sicurezza}.`, 'ok');
        state.fratelli = null;
        apri(id, box);
      } catch (e) {
        c.innerHTML = `<div class="notice bad"><b>Ripristino non eseguito</b> (nessun dato è stato cambiato): ${esc(messaggioErrore(e))}</div>`;
      }
    };
  }

  L.ripristino = { apri };
})();
