/* Lemmi - Info di sistema > Utenti del sistema (solo amministratore):
 * nome, cognome, grado, e-mail e profilo di chi può accedere all'app.
 * I dati vengono dalla funzione info_utenti_sistema() (script lemmi_aggiornamento_18.sql): l'e-mail sta nell'area
 * riservata di Supabase e solo una funzione con controllo "amministratore" può leggerla. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, isAdmin } = L;

  const PROFILI = { amministratore: 'Amministratore', venerabile: 'Maestro Venerabile', segretario: 'Segretario', tesoriere: 'Tesoriere' };
  const BADGE = { amministratore: 'gold', venerabile: 'info', segretario: 'ok', tesoriere: 'warn' };
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const dataOra = (iso) => {
    if (!iso) return 'mai';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };

  L.viste.utenti = async function (v) {
    if (!isAdmin()) { v.innerHTML = '<div class="notice bad">Questa sezione è riservata all’amministratore.</div>'; return; }
    let righe;
    try {
      righe = chk(await state.sb.rpc('info_utenti_sistema'));
    } catch (e) {
      const mancante = /could not find the function|schema cache|does not exist/i.test((e && e.message) || '');
      v.innerHTML = `<div class="page-head"><div><h1>Utenti del sistema</h1><p>Info di sistema</p></div></div>
        <div class="notice bad">${mancante ? '<b>Manca la funzione sul database.</b> Esegui su Supabase (SQL Editor) lo script <code>lemmi_aggiornamento_18.sql</code>, poi ricarica la pagina.' : '<b>Impossibile leggere l’elenco.</b><br>' + esc(messaggioErrore(e))}</div>`;
      return;
    }
    const fratelli = await L.caricaFratelli();

    const conta = {};
    righe.forEach((r) => { conta[r.ruolo] = (conta[r.ruolo] || 0) + 1; });

    v.innerHTML = `
      <div class="page-head"><div><h1>Utenti del sistema</h1><p>Chi può accedere a Lemmi, con il suo profilo · visibile solo all’amministratore</p></div></div>
      <div class="actions" style="margin-bottom:14px">${Object.keys(PROFILI).filter((k) => conta[k]).map((k) => `<span class="badge ${BADGE[k]}">${esc(PROFILI[k])}: ${conta[k]}</span>`).join('')}
        <span class="muted">${righe.length} ${righe.length === 1 ? 'utente configurato' : 'utenti configurati'}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Cognome</th><th>Grado</th><th>E-mail</th><th>Profilo</th><th>Collegato al Fratello</th><th>Ultimo accesso</th></tr></thead>
        <tbody>${righe.length ? righe.map((r) => `<tr>
          <td><b>${esc(r.nome || '—')}</b>${!r.fratello_id && r.nome_visualizzato ? `<div class="hint">nome utente: ${esc(r.nome_visualizzato)}</div>` : ''}</td>
          <td><b>${esc(r.cognome || '—')}</b></td>
          <td>${esc(cap(r.grado) || '—')}</td>
          <td>${esc(r.email || '—')}</td>
          <td><span class="badge ${BADGE[r.ruolo] || 'gray'}">${esc(PROFILI[r.ruolo] || r.ruolo || '—')}</span></td>
          <td data-sort="${esc(r.cognome || '')}"><select class="sel-fr" data-u="${esc(r.user_id)}" style="min-width:190px" aria-label="Fratello collegato a ${esc(r.email || '')}">
            <option value="">— nessuno —</option>
            ${fratelli.map((f) => `<option value="${esc(f.id)}" ${String(f.id) === String(r.fratello_id) ? 'selected' : ''}>${esc(f.cognome)} ${esc(f.nome)}</option>`).join('')}</select>
            ${r.collegamento === 'e-mail' ? '<div class="hint">riconosciuto dall’e-mail</div>' : ''}</td>
          <td>${esc(dataOra(r.ultimo_accesso))}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty"><div>Nessun utente configurato.</div></div></td></tr>'}</tbody></table></div>
      <div class="hint" style="margin-top:12px">Nome, cognome e grado vengono dall’anagrafica dei Fratelli: il collegamento avviene dall’e-mail (se è la stessa dell’anagrafica) oppure scegliendo il Fratello dall’elenco. Gli utenti si creano e si tolgono da Supabase (Authentication › Users); il profilo si cambia nella tabella <code>profili</code>.</div>`;

    $$('.sel-fr', v).forEach((sel) => sel.addEventListener('change', async () => {
      sel.disabled = true;
      try {
        chk(await state.sb.rpc('collega_utente_fratello', { p_user: sel.dataset.u, p_fratello: sel.value }));
        toast('Collegamento salvato', 'ok');
        L.route();
      } catch (e) { toast(messaggioErrore(e), 'bad'); sel.disabled = false; }
    }));
  };
})();
