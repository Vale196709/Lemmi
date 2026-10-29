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
      <div class="page-head"><div><h1>Utenti del sistema</h1><p>Chi può accedere a Lemmi, con il suo profilo · visibile solo all’amministratore</p></div>
        <div class="right actions"><button class="btn gold" id="b-nu" type="button">${L.IC.plus} Nuovo utente</button></div></div>
      <div class="card" id="nu-box" hidden>
        <h2>Nuovo utente</h2>
        <p class="muted" style="margin:0 0 14px">Crea l’accesso a Lemmi: l’utente entra con la sua e-mail e la password temporanea che gli comunichi, poi può cambiarla dalla pagina Loggia.</p>
        <form id="nu-form" autocomplete="off">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:14px">
            <div><label for="nu-email">E-mail</label><input id="nu-email" type="email" required placeholder="nome@esempio.it"></div>
            <div><label for="nu-nome">Nome da mostrare</label><input id="nu-nome" type="text" required placeholder="es. Mario Rossi"></div>
            <div><label for="nu-ruolo">Profilo</label><select id="nu-ruolo">${Object.keys(PROFILI).map((k) => `<option value="${k}" ${k === 'segretario' ? 'selected' : ''}>${esc(PROFILI[k])}</option>`).join('')}</select></div>
            <div><label for="nu-pw">Password temporanea</label><input id="nu-pw" type="text" required minlength="8" autocomplete="off"></div>
          </div>
          <div class="actions" style="margin-top:14px"><button class="btn" type="submit" id="nu-ok">Crea utente</button>
            <button class="btn ghost" type="button" id="nu-gen">Genera password</button>
            <button class="btn ghost" type="button" id="nu-ann">Annulla</button></div>
        </form>
        <div id="nu-esito"></div>
      </div>
      <div class="actions" style="margin-bottom:14px">${Object.keys(PROFILI).filter((k) => conta[k]).map((k) => `<span class="badge ${BADGE[k]}">${esc(PROFILI[k])}: ${conta[k]}</span>`).join('')}
        <span class="muted">${righe.length} ${righe.length === 1 ? 'utente configurato' : 'utenti configurati'}</span></div>
      <div class="table-wrap"><table><thead><tr><th>Nome</th><th>Cognome</th><th>Grado</th><th>E-mail</th><th>Profilo</th><th>Collegato al Fratello</th><th>Ultimo accesso</th></tr></thead>
        <tbody>${righe.length ? righe.map((r) => `<tr>
          <td><b>${esc(r.nome || '—')}</b>${!r.fratello_id && r.nome_visualizzato ? `<div class="hint">nome utente: ${esc(r.nome_visualizzato)}</div>` : ''}</td>
          <td><b>${esc(r.cognome || '—')}</b></td>
          <td>${esc(cap(r.grado) || '—')}</td>
          <td>${esc(r.email || '—')}</td>
          <td data-sort="${esc(r.ruolo || '')}">${String(r.user_id) === String(state.user.id)
            ? `<span class="badge ${BADGE[r.ruolo] || 'gray'}">${esc(PROFILI[r.ruolo] || r.ruolo || '—')}</span><div class="hint">il tuo profilo</div>`
            : `<select class="sel-ruolo" data-u="${esc(r.user_id)}" data-prima="${esc(r.ruolo || '')}" data-nome="${esc(((r.nome || '') + ' ' + (r.cognome || '')).trim() || r.email || '')}" style="min-width:160px" aria-label="Profilo di ${esc(r.email || '')}">
                ${!PROFILI[r.ruolo] ? `<option value="" selected>${esc(r.ruolo || '— nessuno —')}</option>` : ''}
                ${Object.keys(PROFILI).map((k) => `<option value="${k}" ${k === r.ruolo ? 'selected' : ''}>${esc(PROFILI[k])}</option>`).join('')}</select>`}</td>
          <td data-sort="${esc(r.cognome || '')}"><select class="sel-fr" data-u="${esc(r.user_id)}" style="min-width:190px" aria-label="Fratello collegato a ${esc(r.email || '')}">
            <option value="">— nessuno —</option>
            ${fratelli.map((f) => `<option value="${esc(f.id)}" ${String(f.id) === String(r.fratello_id) ? 'selected' : ''}>${esc(f.cognome)} ${esc(f.nome)}</option>`).join('')}</select>
            ${r.collegamento === 'e-mail' ? '<div class="hint">riconosciuto dall’e-mail</div>' : ''}</td>
          <td>${esc(dataOra(r.ultimo_accesso))}</td></tr>`).join('') : '<tr><td colspan="7"><div class="empty"><div>Nessun utente configurato.</div></div></td></tr>'}</tbody></table></div>
      <div class="hint" style="margin-top:12px">Nome, cognome e grado vengono dall’anagrafica dei Fratelli: il collegamento avviene dall’e-mail (se è la stessa dell’anagrafica) oppure scegliendo il Fratello dall’elenco. Gli utenti si creano da qui con «Nuovo utente»; per toglierli si usa Supabase (Authentication › Users). il profilo si cambia dal menu della colonna «Profilo» (non si può cambiare il proprio, per non restare senza amministratore).</div>`;

    // ---- nuovo utente (funzione "crea-utente" su Supabase) ----
    const genPw = () => {
      const set = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const r = new Uint32Array(12); crypto.getRandomValues(r);
      return Array.from(r, (n) => set[n % set.length]).join('');
    };
    const box = $('#nu-box', v), form = $('#nu-form', v), esito = $('#nu-esito', v);
    $('#b-nu', v).addEventListener('click', () => { box.hidden = !box.hidden; if (!box.hidden) { $('#nu-pw', v).value = genPw(); $('#nu-email', v).focus(); } });
    $('#nu-ann', v).addEventListener('click', () => { box.hidden = true; esito.innerHTML = ''; form.reset(); });
    $('#nu-gen', v).addEventListener('click', () => { $('#nu-pw', v).value = genPw(); });
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const body = { email: $('#nu-email', v).value.trim(), nome: $('#nu-nome', v).value.trim(), ruolo: $('#nu-ruolo', v).value, password: $('#nu-pw', v).value };
      if (!window.confirm('Creare l’utente ' + body.email + ' con il profilo «' + PROFILI[body.ruolo] + '»?')) return;
      const ok = $('#nu-ok', v); ok.disabled = true; esito.innerHTML = '';
      try {
        const { data, error } = await state.sb.functions.invoke('crea-utente', { body });
        if (error) {
          let msg = error.message || 'Errore';
          const st = error.context && error.context.status;
          try { const j = await error.context.json(); if (j && j.errore) msg = j.errore; } catch (_) { /* nessun dettaglio */ }
          if (st === 404 || /failed to send|fetch/i.test(msg)) msg = 'La funzione «crea-utente» non risulta pubblicata su Supabase: segui il passo 1 del file LEGGIMI-aggiornamento-27.txt.';
          throw new Error(msg);
        }
        if (data && data.errore) throw new Error(data.errore);
        esito.innerHTML = `<div class="notice" style="margin-top:14px;background:var(--ok-bg);color:var(--ok)"><b>Utente creato.</b> Comunicagli, possibilmente a voce, questi dati di accesso:<br>
          E-mail: <b>${esc(body.email)}</b> · Password temporanea: <b>${esc(body.password)}</b><br><span class="hint">La password non verrà più mostrata. L’utente può cambiarla dalla pagina Loggia.</span><div class="actions" style="margin-top:10px"><button class="btn ghost small" type="button" id="nu-agg">Aggiorna l’elenco</button></div></div>`;
        toast('Utente creato', 'ok');
        form.reset();
        $('#nu-agg', v).addEventListener('click', () => L.route());
      } catch (e) { esito.innerHTML = `<div class="notice bad" style="margin-top:14px">${esc(messaggioErrore(e))}</div>`; }
      ok.disabled = false;
    });

    $$('.sel-ruolo', v).forEach((sel) => sel.addEventListener('change', async () => {
      const nuovo = sel.value, prima = sel.dataset.prima;
      if (!nuovo || nuovo === prima) return;
      if (!window.confirm('Cambiare il profilo di ' + sel.dataset.nome + ' da «' + (PROFILI[prima] || prima || 'nessuno') + '» a «' + PROFILI[nuovo] + '»?\nCambiano subito le sezioni che può vedere e modificare.')) { sel.value = prima; return; }
      sel.disabled = true;
      try {
        chk(await state.sb.rpc('imposta_ruolo_utente', { p_user: sel.dataset.u, p_ruolo: nuovo }));
        toast('Profilo aggiornato', 'ok');
        L.route();
      } catch (e) {
        const mancante = /could not find the function|schema cache/i.test((e && e.message) || '');
        toast(mancante ? 'Manca la funzione sul database: esegui lemmi_aggiornamento_26.sql su Supabase.' : messaggioErrore(e), 'bad');
        sel.value = prima; sel.disabled = false;
      }
    }));
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
