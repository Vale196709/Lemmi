/* Lemmi - copia di sicurezza: scarica tutti i dati in un unico file Excel (solo amministratore). */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L || !L.estensioniLoggia) return;
  const { state, $, toast, messaggioErrore, isAdmin } = L;

  // tabella -> colonna per ordinare (serve a leggere i dati a blocchi senza perderne)
  const TABELLE = [
    ['fratelli', 'cognome'], ['passaggi_grado', 'data'], ['cariche_storico', 'anno_dal'], ['elenco_cariche', 'nome'], ['profili', 'user_id'],
    ['loggia', 'id'], ['bussanti', 'cognome'], ['documenti', 'creato_il'],
    ['voci_quota', 'codice'], ['fasce_eta', 'eta_da'], ['parametri_quote', 'id'], ['piano_rate', 'id'],
    ['scadenze', 'creato_il'], ['versamenti', 'data_versamento'], ['categorie_movimento', 'nome'],
    ['import_estratti', 'creato_il'], ['conto_movimenti', 'data_operazione'],
    ['modelli_messaggio', 'codice'], ['messaggi', 'creato_il'], ['messaggi_destinatari', 'id'],
    ['cronologia_modifiche', 'id'],
  ];
  const BLOCCO = 1000;
  const MAX_RIGHE = { cronologia_modifiche: 20000 };

  function appiattisci(r) {
    const o = {};
    Object.keys(r).forEach((k) => { const v = r[k]; o[k] = v !== null && typeof v === 'object' ? JSON.stringify(v) : v; });
    return o;
  }

  async function leggiTabella(nome, ordine) {
    const righe = [];
    for (let da = 0; ; da += BLOCCO) {
      const { data, error } = await state.sb.from(nome).select('*').order(ordine, { ascending: nome !== 'cronologia_modifiche' }).range(da, da + BLOCCO - 1);
      if (error) throw error;
      righe.push(...data);
      if (data.length < BLOCCO || righe.length >= (MAX_RIGHE[nome] || Infinity)) break;
    }
    return righe;
  }

  async function esporta(btn, stato) {
    if (!window.XLSX) { toast('Libreria Excel non caricata: ricarica la pagina.', 'bad'); return; }
    const etichetta = btn.textContent;
    btn.disabled = true;
    const wb = window.XLSX.utils.book_new();
    const esito = [];
    for (let i = 0; i < TABELLE.length; i++) {
      const [nome, ordine] = TABELLE[i];
      stato.textContent = 'Leggo ' + nome + ' (' + (i + 1) + ' di ' + TABELLE.length + ')…';
      try {
        const righe = (await leggiTabella(nome, ordine)).map(appiattisci);
        const ws = righe.length ? window.XLSX.utils.json_to_sheet(righe) : window.XLSX.utils.aoa_to_sheet([['(nessun dato)']]);
        window.XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
        esito.push({ tabella: nome, righe: righe.length, nota: MAX_RIGHE[nome] && righe.length >= MAX_RIGHE[nome] ? 'limitato alle ultime ' + MAX_RIGHE[nome] + ' righe' : '' });
      } catch (e) {
        esito.push({ tabella: nome, righe: '', nota: /schema cache|does not exist|Could not find/i.test((e && e.message) || '') ? 'tabella non presente' : 'non letta: ' + messaggioErrore(e) });
      }
    }
    window.XLSX.utils.book_append_sheet(wb, window.XLSX.utils.json_to_sheet(esito), 'Esito');
    const bytes = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const nomeFile = 'Lemmi_copia_di_sicurezza_' + new Date().toISOString().slice(0, 10) + '.xlsx';
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url; a.download = nomeFile; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 15000);
    const ok = esito.filter((x) => x.righe !== '').length;
    stato.textContent = 'Copia salvata: ' + nomeFile + ' (' + ok + ' tabelle).';
    toast('Copia di sicurezza scaricata', 'ok');
    btn.disabled = false; btn.textContent = etichetta;
  }

  L.estensioniLoggia.push((v) => {
    if (!isAdmin()) return;
    v.insertAdjacentHTML('beforeend', `<div class="card" style="margin-top:18px"><h2>Copia di sicurezza</h2>
      <p class="muted" style="margin:0 0 14px">Scarica tutti i dati dell’app in un unico file Excel (un foglio per ogni tabella). Conviene farlo una volta al mese e prima di ogni aggiornamento.</p>
      <div class="notice">Il file contiene dati personali dei Fratelli e dei bussanti: conservalo in un luogo sicuro e non inviarlo per e-mail. I documenti caricati (certificati, foto, moduli firmati) non sono inclusi: restano nell’archivio privato.</div>
      <div class="actions"><button class="btn ghost" id="b-backup" type="button">Scarica la copia di sicurezza</button><span class="muted" id="backup-stato"></span></div></div>`);
    $('#b-backup').addEventListener('click', (e) => esporta(e.currentTarget, $('#backup-stato')).catch((err) => { toast(messaggioErrore(err), 'bad'); e.currentTarget.disabled = false; }));
  });
})();
