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

  const minuscola = (t) => t.charAt(0).toLowerCase() + t.slice(1);
  const iso = (d) => (d ? String(d).slice(0, 10) : '');

  // Problemi di una scheda: segnalazioni, senza modificare nulla. L2 = LemmiLuoghi (se l'elenco si è caricato)
  function problemi(r, tipo, L2, oggi) {
    const p = [];
    const nascita = iso(r.data_nascita);
    const prov = String(r.provincia || '').toUpperCase();
    const provN = String(r.provincia_nascita || '').toUpperCase();
    if (!vuoto(r.codice_fiscale) && window.CodiceFiscale) {
      const val = window.CodiceFiscale.valida(r.codice_fiscale);
      if (!val.ok) p.push('Codice fiscale: ' + minuscola(val.errori[0]));
      else {
        const m = L2 && !vuoto(r.luogo_nascita) && provN !== 'EE' ? L2.trova(r.luogo_nascita, provN) : [];
        const co = window.CodiceFiscale.controllaCoerenza(r.codice_fiscale, { cognome: r.cognome, nome: r.nome, dataNascita: nascita || null, codiceCatastale: m.length === 1 ? m[0].cat : null });
        if (!co.ok) co.avvisi.forEach((a) => p.push('Codice fiscale: ' + minuscola(a)));
      }
    }
    if (L2) {
      if (!vuoto(r.luogo_nascita) && provN !== 'EE' && !L2.trova(r.luogo_nascita, '').length)
        p.push('Luogo di nascita «' + r.luogo_nascita + '» non è nell’elenco dei comuni (può essere giusto se è estero o un comune soppresso)');
      else if (!vuoto(r.luogo_nascita) && provN && provN !== 'EE' && !L2.trova(r.luogo_nascita, provN).length)
        p.push('Luogo di nascita «' + r.luogo_nascita + '» non risulta nella provincia ' + provN);
      if (!vuoto(r.citta)) {
        const m = L2.trova(r.citta, prov);
        if (!L2.trova(r.citta, '').length) p.push('Città «' + r.citta + '» non è nell’elenco dei comuni');
        else if (prov && !m.length) p.push('Città «' + r.citta + '» non risulta nella provincia ' + prov);
        else if (m.length === 1 && m[0].cap && /^\d{5}$/.test(String(r.cap || '')) && !L2.capDentro(m[0].cap, String(r.cap)))
          p.push('CAP ' + r.cap + ' non coerente con ' + m[0].nome + ' (' + m[0].cap + ')');
      }
    }
    if (window.LemmiDate) {
      const cd = tipo === 'Fratello'
        ? window.LemmiDate.fratello({ data_nascita: nascita || null, data_iniziazione: iso(r.data_iniziazione) || null }, oggi)
        : window.LemmiDate.bussante({ tipo_domanda: r.tipo_domanda, data_domanda: iso(r.data_domanda) || null, data_nascita: nascita || null,
          data_presa_in_considerazione: iso(r.data_presa_in_considerazione) || null, data_comunicazione_collegio: iso(r.data_comunicazione_collegio) || null,
          data_prima_votazione: iso(r.data_prima_votazione) || null, data_seconda_votazione: iso(r.data_seconda_votazione) || null }, oggi);
      cd.errori.forEach((e) => p.push('Date: ' + minuscola(e.msg)));
      cd.avvisi.forEach((a) => p.push('Date: ' + minuscola(a)));
    }
    if (window.LemmiControlli && !vuoto(r.cellulare)) {
      const t = window.LemmiControlli.telefono(r.cellulare);
      if (t.errore || t.avviso) p.push('Telefono: ' + minuscola(t.errore || t.avviso));
    }
    return p;
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
    // --- Dati da controllare: segnalazioni sui dati già inseriti (nessuna modifica automatica) ---
    let L2 = null;
    try { if (window.LemmiLuoghi) { await window.LemmiLuoghi.carica(); L2 = window.LemmiLuoghi; } } catch (_) { L2 = null; }
    const oggiIso = L.oggi ? L.oggi() : new Date().toISOString().slice(0, 10);
    const perCf = new Map();
    attivi.map((f) => ({ tipo: 'Fratello', r: f })).concat(bu.map((b) => ({ tipo: 'Bussante', r: b }))).forEach((x) => {
      const cf = String(x.r.codice_fiscale || '').replace(/\s/g, '').toUpperCase();
      if (cf) { if (!perCf.has(cf)) perCf.set(cf, []); perCf.get(cf).push(x); }
    });
    const sosp = [];
    const aggiungi = (tipo, riga, href) => {
      const p = problemi(riga, tipo, L2, oggiIso);
      const cf = String(riga.codice_fiscale || '').replace(/\s/g, '').toUpperCase();
      const altri = (perCf.get(cf) || []).filter((x) => x.r !== riga);
      if (altri.length) p.push('Codice fiscale uguale a: ' + altri.map((x) => x.tipo + ' ' + x.r.cognome + ' ' + x.r.nome).join('; '));
      if (p.length) sosp.push({ tipo, href, nome: riga.cognome + ' ' + riga.nome, p });
    };
    attivi.forEach((f) => aggiungi('Fratello', f, '#/fratelli/' + f.id));
    bu.forEach((b) => aggiungi('Bussante', b, '#/bussanti/' + b.id));
    v.insertAdjacentHTML('beforeend', `<div id="dc-sosp" style="margin-top:26px"><div class="page-head"><div><h2>Dati da controllare</h2>
      <p>Dati già inseriti che non tornano: codice fiscale, luoghi, CAP, date, telefono, codici doppi · ${sosp.length} ${sosp.length === 1 ? 'scheda' : 'schede'}</p></div></div>
      ${sosp.length ? `<div class="table-wrap"><table><thead><tr><th>Nominativo</th><th>Tipo</th><th>Cosa controllare</th></tr></thead><tbody>
        ${sosp.map((x) => `<tr class="click" data-go="${esc(x.href)}"><td><b>${esc(x.nome)}</b></td><td>${x.tipo}</td><td>${x.p.map((t) => esc(t)).join('<br>')}</td></tr>`).join('')}</tbody></table></div>
        <div class="hint" style="margin-top:8px">Sono solo segnalazioni: il dato può essere corretto (per esempio un comune soppresso o un CAP aggiornato). Nulla viene modificato in automatico.${L2 ? '' : ' L’elenco dei comuni non si è caricato: i controlli sui luoghi e sul CAP sono stati saltati.'}</div>`
      : '<div class="card"><div class="empty"><div>Nessun dato sospetto trovato. 🎉</div></div></div>'}</div>`);
    $$('#dc-sosp [data-go]', v).forEach((r) => r.addEventListener('click', () => { location.hash = r.dataset.go; }));
    $('#dc-xls', v).addEventListener('click', async () => {
      try { await L.libreria('xlsx'); } catch (e) { toast(e.message, 'bad'); return; }
      try {
        const righe = (tutti.length ? filtrati() : []).map((x) => ({ Nominativo: x.nome, Tipo: x.tipo, 'Dati mancanti': x.m.map((c) => c.t).join(', ') }));
        const wb = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(wb, righe.length ? window.XLSX.utils.json_to_sheet(righe) : window.XLSX.utils.aoa_to_sheet([['(nessun dato da completare)']]), 'Da completare');
        const rs = sosp.map((x) => ({ Nominativo: x.nome, Tipo: x.tipo, 'Da controllare': x.p.join(' | ') }));
        window.XLSX.utils.book_append_sheet(wb, rs.length ? window.XLSX.utils.json_to_sheet(rs) : window.XLSX.utils.aoa_to_sheet([['(nessun dato sospetto)']]), 'Da controllare');
        const bytes = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const a = document.createElement('a'); a.href = url; a.download = 'Lemmi_dati_da_completare_' + window.Lemmi.oggi() + '.xlsx';
        document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
      } catch (e) { toast(messaggioErrore(e), 'bad'); }
    });
  };
})();
