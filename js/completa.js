/* Lemmi - Dati da completare: elenco dei Fratelli attivi e dei bussanti a cui mancano dati utili (codice fiscale,
 * contatti, indirizzo, date…). Serve a tenere pulita l'anagrafica. Si può esportare in Excel. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore } = L;

  // [campo, etichetta, importante] — "importante" = serve per moduli, capitazione o comunicazioni
  const CAMPI_FRATELLO = [
    ['codice_fiscale', 'Codice fiscale', 1], ['data_nascita', 'Data di nascita', 1], ['luogo_nascita', 'Luogo di nascita', 0],
    ['indirizzo', 'Indirizzo', 0], ['cap', 'CAP', 0], ['citta', 'Città', 0], ['cellulare', 'Cellulare', 1], ['email', 'E-mail', 1],
    ['professione', 'Professione', 0], ['matricola', 'Matricola', 1],
  ];
  const CAMPI_BUSSANTE = [
    ['codice_fiscale', 'Codice fiscale', 1], ['data_nascita', 'Data di nascita', 1], ['luogo_nascita', 'Luogo di nascita', 1],
    ['provincia_nascita', 'Prov. nascita', 0], ['cellulare', 'Telefono', 1], ['email', 'E-mail', 1], ['titolo_studio', 'Titolo di studio', 0],
    ['professione', 'Professione', 0], ['indirizzo', 'Indirizzo', 1], ['cap', 'CAP', 0], ['citta', 'Città', 1], ['provincia', 'Prov.', 0],
  ];
  const vuoto = (v) => v === null || v === undefined || String(v).trim() === '';

  function manca(riga, campi) {
    return campi.filter(([k]) => (k in riga) && vuoto(riga[k])).map(([k, t, imp]) => ({ k, t, imp }));
  }

  async function leggi(tabella) {
    const out = [];
    for (let da = 0; ; da += 1000) {
      const r = chk(await state.sb.from(tabella).select('*').order('cognome').range(da, da + 999));
      out.push(...r);
      if (r.length < 1000) break;
    }
    return out;
  }

  L.viste.completa = async function (v) {
    const [fr, bu] = await Promise.all([leggi('fratelli'), leggi('bussanti')]);
    const attivi = fr.filter((f) => String(f.stato || '').toLowerCase() === 'attivo');
    const elF = attivi.map((f) => {
      let m = manca(f, CAMPI_FRATELLO);
      if (('data_iniziazione' in f) && vuoto(f.data_iniziazione) && vuoto(f.anno_iniziazione)) m.push({ k: 'data_iniziazione', t: 'Data di iniziazione', imp: 1 });
      return { tipo: 'Fratello', href: '#/fratelli/' + f.id, nome: f.cognome + ' ' + f.nome, m };
    }).filter((x) => x.m.length);
    const elB = bu.map((b) => ({ tipo: 'Bussante', href: '#/bussanti/' + b.id, nome: b.cognome + ' ' + b.nome, m: manca(b, CAMPI_BUSSANTE) })).filter((x) => x.m.length);
    const tutti = elF.concat(elB);
    const conteggio = {};
    tutti.forEach((x) => x.m.forEach((c) => { conteggio[c.t] = (conteggio[c.t] || 0) + 1; }));
    const stato = { solo: 'tutti', campo: '' };

    v.innerHTML = `<div class="page-head"><div><h1>Dati da completare</h1><p>Fratelli attivi e bussanti con informazioni mancanti · clicca su un nome per aprire la scheda</p></div>
        <div class="right actions"><button class="btn ghost" type="button" id="dc-xls">Scarica Excel</button></div></div>
      <div class="grid cols-3" style="margin-bottom:14px">
        <div class="stat"><div class="n">${attivi.length - elF.length}<small> / ${attivi.length}</small></div><div class="l">Fratelli attivi con scheda completa</div></div>
        <div class="stat"><div class="n">${elF.length}</div><div class="l">Fratelli da completare</div></div>
        <div class="stat"><div class="n">${elB.length}</div><div class="l">Bussanti da completare</div></div></div>
      ${tutti.length ? `<div class="actions" style="margin-bottom:14px;flex-wrap:wrap">
        <label class="lbl" for="dc-chi">Mostra</label><select id="dc-chi" style="width:auto"><option value="tutti">Fratelli e bussanti</option><option value="Fratello">Solo Fratelli</option><option value="Bussante">Solo bussanti</option></select>
        <label class="lbl" for="dc-campo">Manca</label><select id="dc-campo" style="width:auto"><option value="">Qualunque dato</option>${Object.keys(conteggio).sort().map((t) => `<option value="${esc(t)}">${esc(t)} (${conteggio[t]})</option>`).join('')}</select>
        <label style="display:flex;gap:6px;align-items:center;font-weight:500"><input type="checkbox" id="dc-imp"> Solo dati importanti</label>
        <span class="muted" id="dc-n"></span></div>
        <div class="table-wrap"><table><thead><tr><th>Nominativo</th><th>Tipo</th><th>Dati mancanti</th></tr></thead><tbody id="dc-righe"></tbody></table></div>
        <div class="hint" style="margin-top:8px">I dati «importanti» (in grassetto) servono per moduli, capitazione e comunicazioni. Per i Fratelli si considerano solo quelli con stato «attivo».</div>`
      : '<div class="card"><div class="empty"><div>Tutte le schede sono complete. 🎉</div></div></div>'}`;

    const filtrati = () => {
      const imp = $('#dc-imp', v).checked;
      return tutti.map((x) => Object.assign({}, x, { m: x.m.filter((c) => (!imp || c.imp) && (!stato.campo || c.t === stato.campo)) }))
        .filter((x) => x.m.length && (stato.solo === 'tutti' || x.tipo === stato.solo));
    };
    const disegna = () => {
      const f = filtrati();
      $('#dc-n', v).textContent = f.length + (f.length === 1 ? ' scheda' : ' schede');
      $('#dc-righe', v).innerHTML = f.length ? f.map((x) => `<tr class="click" data-go="${esc(x.href)}"><td><b>${esc(x.nome)}</b></td><td>${x.tipo}</td>
        <td>${x.m.map((c) => (c.imp ? `<b>${esc(c.t)}</b>` : esc(c.t))).join(', ')}</td></tr>`).join('') : '<tr><td colspan="3"><div class="empty">Nessuna scheda con questi criteri.</div></td></tr>';
      $$('[data-go]', v).forEach((r) => r.addEventListener('click', () => { location.hash = r.dataset.go; }));
    };
    if (tutti.length) {
      $('#dc-chi', v).addEventListener('change', (e) => { stato.solo = e.target.value; disegna(); });
      $('#dc-campo', v).addEventListener('change', (e) => { stato.campo = e.target.value; disegna(); });
      $('#dc-imp', v).addEventListener('change', disegna);
      disegna();
    }
    $('#dc-xls', v).addEventListener('click', () => {
      if (!window.XLSX) { toast('Libreria Excel non caricata: ricarica la pagina.', 'bad'); return; }
      try {
        const righe = (tutti.length ? filtrati() : []).map((x) => ({ Nominativo: x.nome, Tipo: x.tipo, 'Dati mancanti': x.m.map((c) => c.t).join(', ') }));
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, righe.length ? window.XLSX.utils.json_to_sheet(righe) : window.XLSX.utils.aoa_to_sheet([['(nessun dato da completare)']]), 'Da completare');
        const bytes = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const a = document.createElement('a'); a.href = url; a.download = 'Lemmi_dati_da_completare_' + new Date().toISOString().slice(0, 10) + '.xlsx';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
      } catch (e) { toast(messaggioErrore(e), 'bad'); }
    });
  };
})();
