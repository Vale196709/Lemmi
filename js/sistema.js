/* Lemmi - Info di sistema > Stato del sistema (solo amministratore):
 * versione dell'app, spazio disponibile (database e archivio file), backup completo settimanale e
 * incrementale giornaliero. I dati vengono dalle funzioni info_spazio(), stato_backup(), esegui_backup()
 * (script lemmi_aggiornamento_26.sql) e dalle tabelle backup_esecuzioni / backup_righe. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, isAdmin } = L;

  const NOMI_ARCHIVIO = { 'documenti-loggia': 'Documenti dei bussanti', tavole: 'Lavori e tavole', modelli: 'Modelli della Loggia' };
  const MB = 1024 * 1024;

  function fmtByte(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < MB) return (n / 1024).toFixed(0) + ' KB';
    if (n < 1024 * MB) return (n / MB).toFixed(1).replace('.', ',') + ' MB';
    return (n / (1024 * MB)).toFixed(2).replace('.', ',') + ' GB';
  }
  const dataOra = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return isNaN(d) ? '—' : d.toLocaleDateString('it-IT') + ' ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  };
  const giorniFa = (iso) => (iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : null);
  const nonPresente = (e) => /could not find the function|schema cache|does not exist|relation .* does not exist/i.test((e && e.message) || '');
  const classe = (perc) => (perc >= 90 ? 'bad' : perc >= 70 ? 'warn' : 'ok');

  /* ---------- versione ---------- */
  function cardVersione() {
    const v = window.LEMMI_VERSIONE || { numero: 'n/d', storia: [] };
    const d = v.data ? v.data.split('-').reverse().join('/') : '—';
    return `<div class="card"><h2>Versione dell’app</h2>
      <div class="sys-big">${esc(v.numero)}</div>
      <div class="muted">Ultimo aggiornamento: <b>${esc(d)}</b></div>
      <ul class="sys-list">${(v.storia || []).slice(0, 6).map((x) => `<li><b>${esc(x.n)}</b>${x.data ? ' · ' + esc(x.data.split('-').reverse().join('/')) : ''} — ${esc(x.t)}</li>`).join('')}</ul></div>`;
  }

  /* ---------- spazio ---------- */
  function cardSpazio(sp, errore) {
    if (errore) return `<div class="card"><h2>Spazio disponibile</h2><div class="notice bad">${errore}</div></div>`;
    const lim = (window.LEMMI_VERSIONE && window.LEMMI_VERSIONE.limiti) || { db_mb: 500, file_mb: 1024 };
    const limDb = lim.db_mb * MB, limFile = lim.file_mb * MB;
    const tot = Number(sp.db_totale) || 0, dati = Number(sp.dati) || 0, bk = Number(sp.backup) || 0;
    const altro = Math.max(0, tot - dati - bk);
    const pDb = Math.min(100, (tot / limDb) * 100);
    const w = (x, lm) => Math.max(0, Math.min(100, (x / lm) * 100)).toFixed(2);
    const file = sp.file || [];
    const totFile = file.reduce((a, x) => a + (Number(x.byte) || 0), 0);
    const nFile = file.reduce((a, x) => a + (Number(x.file) || 0), 0);
    const pFile = Math.min(100, (totFile / limFile) * 100);
    const avviso = (p, cosa) => (p >= 90 ? `<div class="notice bad" style="margin-top:12px"><b>${cosa}: spazio quasi esaurito.</b> Libera spazio o valuta un piano superiore.</div>`
      : p >= 70 ? `<div class="notice" style="margin-top:12px"><b>${cosa}: oltre il 70% dello spazio è usato.</b> Tienilo d’occhio.</div>` : '');
    const colori = ['c1', 'c2', 'c3'];

    return `<div class="card"><h2>Spazio disponibile <small>piano con ${lim.db_mb} MB di database e ${(lim.file_mb / 1024).toString().replace('.', ',')} GB di file</small></h2>
      <div class="sys-grid">
        <div>
          <h3>Dati e tavole (database)</h3>
          <div style="margin:8px 0 6px"><span class="sys-big">${esc(fmtByte(Math.max(0, limDb - tot)))}</span> <span class="muted">liberi su ${esc(fmtByte(limDb))}</span></div>
          <div class="meter ${classe(pDb)}" role="img" aria-label="Database usato al ${pDb.toFixed(0)} per cento">
            <i class="c1" style="width:${w(dati, limDb)}%"></i><i class="c2" style="width:${w(bk, limDb)}%"></i><i class="c3" style="width:${w(altro, limDb)}%"></i></div>
          <div class="meter-leg">
            <span><span class="dot" style="background:var(--navy-3)"></span>Dati dell’app <b>${esc(fmtByte(dati))}</b></span>
            <span><span class="dot" style="background:var(--gold)"></span>Backup interni <b>${esc(fmtByte(bk))}</b></span>
            <span><span class="dot" style="background:#b9c3dc"></span>Sistema e altro <b>${esc(fmtByte(altro))}</b></span></div>
          ${avviso(pDb, 'Database')}
          <table style="margin-top:14px"><thead><tr><th>Tabella</th><th style="text-align:right">Righe</th><th style="text-align:right">Spazio</th></tr></thead>
            <tbody>${(sp.tabelle || []).map((t) => `<tr><td>${esc(t.nome)}</td><td style="text-align:right">${Number(t.righe).toLocaleString('it-IT')}</td><td style="text-align:right">${esc(fmtByte(t.byte))}</td></tr>`).join('')}</tbody></table>
          <div class="hint" style="margin-top:6px">Le 8 tabelle più grandi. «Sistema e altro» comprende le parti interne di Supabase.</div>
        </div>
        <div>
          <h3>Archivio file (documenti, tavole, modelli)</h3>
          <div style="margin:8px 0 6px"><span class="sys-big">${esc(fmtByte(Math.max(0, limFile - totFile)))}</span> <span class="muted">liberi su ${esc(fmtByte(limFile))}</span></div>
          <div class="meter ${classe(pFile)}" role="img" aria-label="Archivio file usato al ${pFile.toFixed(0)} per cento">
            ${file.map((x, i) => `<i class="${colori[i % 3]}" style="width:${w(Number(x.byte) || 0, limFile)}%"></i>`).join('')}</div>
          <div class="meter-leg">${file.length ? file.map((x, i) => `<span><span class="dot" style="background:${['var(--navy-3)', 'var(--gold)', '#b9c3dc'][i % 3]}"></span>${esc(NOMI_ARCHIVIO[x.bucket] || x.bucket)} <b>${esc(fmtByte(x.byte))}</b> · ${Number(x.file)} ${Number(x.file) === 1 ? 'file' : 'file'}</span>`).join('') : '<span>Nessun file caricato.</span>'}</div>
          <div class="hint" style="margin-top:8px">${nFile} ${nFile === 1 ? 'file' : 'file'} in totale · ogni file può pesare al massimo 10 MB.</div>
          ${avviso(pFile, 'Archivio file')}
        </div>
      </div></div>`;
  }

  /* ---------- backup ---------- */
  function cardBackup(elenco, stato, errore) {
    if (errore) return `<div class="card"><h2>Backup</h2><div class="notice bad">${errore}</div></div>`;
    const riusciti = elenco.filter((x) => x.esito === 'riuscito');
    const ultimoCompleto = riusciti.find((x) => x.tipo === 'completo');
    const ultimoQualsiasi = riusciti[0];
    const gg = ultimoQualsiasi ? giorniFa(ultimoQualsiasi.concluso_il || ultimoQualsiasi.avviato_il) : null;
    const programmato = stato && stato.pianificazione;
    let semaforo;
    if (!ultimoQualsiasi) semaforo = '<span class="badge bad">Nessun backup eseguito</span>';
    else if (gg > 2) semaforo = `<span class="badge bad">Ultimo backup di ${gg} giorni fa</span>`;
    else semaforo = `<span class="badge ok">Aggiornato · ${gg === 0 ? 'oggi' : gg === 1 ? 'ieri' : gg + ' giorni fa'}</span>`;
    const totByte = elenco.reduce((a, x) => a + (Number(x.byte) || 0), 0);

    return `<div class="card"><h2>Backup <small>completo ogni settimana, incrementale ogni giorno</small></h2>
      <div class="actions" style="margin-bottom:12px">${semaforo}
        ${programmato ? '<span class="badge ok">Pianificazione automatica attiva · ogni notte</span>'
          : '<span class="badge warn">Pianificazione automatica NON attiva</span>'}</div>
      ${programmato ? '' : `<div class="notice"><b>Il backup automatico non è attivo.</b> Su Supabase apri <i>Database › Extensions</i>, abilita <code>pg_cron</code> e riesegui lo script <code>lemmi_aggiornamento_26.sql</code>. Nel frattempo puoi lanciare i backup a mano da qui sotto.</div>`}
      <ul class="sys-list" style="margin-bottom:14px">
        <li><b>Completo</b>: copia di tutte le tabelle, circa una volta alla settimana.</li>
        <li><b>Incrementale</b>: ogni notte, solo le righe nuove, modificate o eliminate dall’ultimo backup.</li>
        <li>Si conservano gli ultimi 5 backup completi (circa 5 settimane) con i loro incrementali; occupano ${esc(fmtByte(totByte))}.</li>
        <li>Ultimo backup completo: <b>${esc(ultimoCompleto ? dataOra(ultimoCompleto.concluso_il) : 'nessuno')}</b></li></ul>
      <div class="actions"><button class="btn" type="button" id="b-bk-auto">Esegui ora (sceglie da solo)</button>
        <button class="btn ghost" type="button" id="b-bk-full">Backup completo ora</button>
        <span class="muted" id="bk-stato"></span></div>
      <div class="table-wrap" style="margin-top:16px"><table><thead><tr><th>Data</th><th>Tipo</th><th>Origine</th><th>Esito</th><th style="text-align:right">Righe nuove o modificate</th><th style="text-align:right">Righe eliminate</th><th style="text-align:right">Dimensione</th><th></th></tr></thead>
        <tbody>${elenco.length ? elenco.map((x) => `<tr>
          <td data-sort="${esc(x.avviato_il)}">${esc(dataOra(x.avviato_il))}</td>
          <td><span class="badge ${x.tipo === 'completo' ? 'gold' : 'info'}">${x.tipo === 'completo' ? 'Completo' : 'Incrementale'}</span></td>
          <td>${x.origine === 'automatico' ? 'Automatico' : 'Manuale'}</td>
          <td>${x.esito === 'riuscito' ? '<span class="badge ok">Riuscito</span>' : x.esito === 'fallito' ? `<span class="badge bad" title="${esc(x.nota || '')}">Fallito</span>` : '<span class="badge warn">In corso</span>'}${x.nota && x.esito === 'fallito' ? `<div class="hint">${esc(x.nota)}</div>` : ''}</td>
          <td style="text-align:right">${x.esito === 'riuscito' ? Number(x.righe_nuove).toLocaleString('it-IT') : '—'}</td>
          <td style="text-align:right">${x.esito === 'riuscito' ? Number(x.righe_eliminate).toLocaleString('it-IT') : '—'}</td>
          <td style="text-align:right">${x.esito === 'riuscito' ? esc(fmtByte(x.byte)) : '—'}</td>
          <td>${x.esito === 'riuscito' ? `<button class="btn ghost small" type="button" data-scarica="${esc(x.id)}" data-tipo="${esc(x.tipo)}">Scarica Excel</button>` : ''}</td></tr>`).join('')
          : '<tr><td colspan="8"><div class="empty"><div>Nessun backup ancora eseguito.</div></div></td></tr>'}</tbody></table></div>
      <div class="notice" style="margin-top:16px"><b>Da sapere.</b> I backup stanno nello stesso database di Supabase: proteggono da errori e cancellazioni, ma non se il progetto andasse perso o sospeso. Una volta alla settimana scarica quindi il backup completo in Excel e conservalo fuori da Supabase. I file caricati (documenti, tavole, modelli) non sono inclusi nei backup. Il file contiene dati personali: non inviarlo per e-mail.</div></div>`;
  }

  async function scarica(btn) {
    if (!window.XLSX) { toast('Libreria Excel non caricata: ricarica la pagina.', 'bad'); return; }
    const id = btn.dataset.scarica, tipo = btn.dataset.tipo;
    const etichetta = btn.textContent;
    btn.disabled = true; btn.textContent = 'Preparo…';
    try {
      const righe = [];
      for (let da = 0; ; da += 1000) {
        const r = chk(await state.sb.from('backup_righe').select('tabella,eliminata,dati').eq('esecuzione_id', id).order('id').range(da, da + 999));
        righe.push(...r);
        if (r.length < 1000) break;
      }
      const per = {};
      righe.forEach((r) => {
        const o = {};
        const d = r.dati || {};
        Object.keys(d).forEach((k) => { const v = d[k]; o[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v; });
        if (tipo === 'incrementale') o._operazione = r.eliminata ? 'eliminata' : 'nuova o modificata';
        (per[r.tabella] = per[r.tabella] || []).push(r.eliminata ? { _operazione: 'eliminata' } : o);
      });
      const wb = window.XLSX.utils.book_new();
      Object.keys(per).sort().forEach((t) => window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(per[t]), t.slice(0, 31)));
      if (!Object.keys(per).length) window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.aoa_to_sheet([['(nessuna riga: nulla è cambiato)']]), 'Vuoto');
      const bytes = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      const nome = 'Lemmi_backup_' + tipo + '_' + new Date().toISOString().slice(0, 10) + '_n' + id + '.xlsx';
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a');
      a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 15000);
      toast('Backup scaricato', 'ok');
    } catch (e) { toast(messaggioErrore(e), 'bad'); }
    btn.disabled = false; btn.textContent = etichetta;
  }

  async function lancia(tipo, btns, stato) {
    btns.forEach((b) => { b.disabled = true; });
    stato.textContent = 'Backup in corso…';
    try {
      const r = chk(await state.sb.rpc('esegui_backup', { p_tipo: tipo, p_origine: 'manuale' }));
      const out = r && r.data !== undefined ? r.data : r;
      if (out && out.esito === 'fallito') { toast('Backup non riuscito: ' + (out.nota || 'errore'), 'bad'); }
      else toast('Backup ' + (out && out.tipo === 'completo' ? 'completo' : 'incrementale') + ' eseguito', 'ok');
      L.route();
    } catch (e) {
      toast(nonPresente(e) ? 'Manca la funzione sul database: esegui lemmi_aggiornamento_26.sql su Supabase.' : messaggioErrore(e), 'bad');
      btns.forEach((b) => { b.disabled = false; }); stato.textContent = '';
    }
  }

  L.viste.sistema = async function (v) {
    if (!isAdmin()) { v.innerHTML = '<div class="notice bad">Questa sezione è riservata all’amministratore.</div>'; return; }
    const manca = '<b>Manca lo script sul database.</b> Esegui su Supabase (SQL Editor) <code>lemmi_aggiornamento_26.sql</code>, poi ricarica la pagina.';
    let sp = null, errSp = null, elenco = [], stato = null, errBk = null;
    try { const r = await state.sb.rpc('info_spazio'); sp = chk(r); if (sp && sp.data !== undefined && !sp.db_totale) sp = sp.data; }
    catch (e) { errSp = nonPresente(e) ? manca : '<b>Impossibile leggere lo spazio.</b><br>' + esc(messaggioErrore(e)); }
    try {
      elenco = chk(await state.sb.from('backup_esecuzioni').select('*').order('avviato_il', { ascending: false }).limit(30));
      const r = await state.sb.rpc('stato_backup');
      stato = r && r.data ? r.data : null;
    } catch (e) { errBk = nonPresente(e) ? manca : '<b>Impossibile leggere i backup.</b><br>' + esc(messaggioErrore(e)); }

    v.innerHTML = `<div class="page-head"><div><h1>Stato del sistema</h1><p>Versione, spazio disponibile e backup · visibile solo all’amministratore</p></div></div>
      ${cardVersione()}${cardSpazio(sp, errSp)}${cardBackup(elenco, stato, errBk)}`;

    const stEl = $('#bk-stato', v);
    if ($('#b-bk-auto', v)) {
      const btns = [$('#b-bk-auto', v), $('#b-bk-full', v)];
      $('#b-bk-auto', v).addEventListener('click', () => lancia('auto', btns, stEl));
      $('#b-bk-full', v).addEventListener('click', () => lancia('completo', btns, stEl));
      $$('[data-scarica]', v).forEach((b) => b.addEventListener('click', () => scarica(b)));
    }
  };
})();
