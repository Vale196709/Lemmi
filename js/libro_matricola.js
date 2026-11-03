/* Lemmi - Libro Matricola (Fratelli/Bussanti > Libro Matricola).
 * Registro in ordine cronologico dei Fratelli con i passaggi di grado e le variazioni, come richiesto dall'art. 37
 * del Regolamento dell'Ordine e dal Corso Segretari 2024 (modello a due schede per pagina).
 * Si genera dai dati già presenti nell'app; i campi che l'app non conosce (numeri di brevetto, giudizi)
 * restano con le righe in bianco da compilare a mano. Il numero progressivo segue la data di iniziazione e coincide
 * con il numero d'ordine del fascicolo personale, come suggerisce il Corso Segretari. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, esc, chk, toast, messaggioErrore, fmtData } = L;

  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const pulisci = (s) => String(s == null ? '' : s).normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7E -ÿ–—…€•]/g, '');
  const st = { righe: [], filtro: 'tutti' };

  async function carica() {
    const [fr, pass, car] = await Promise.all([
      state.sb.from('fratelli').select('*'),
      state.sb.from('passaggi_grado').select('fratello_id,grado,anno,data'),
      state.sb.from('cariche_storico').select('fratello_id,carica,anno_dal,anno_al,note'),
    ]);
    const fratelli = chk(fr), passaggi = chk(pass), cariche = chk(car);
    const chiave = (f) => f.data_iniziazione || (f.anno_iniziazione ? f.anno_iniziazione + '-12-31' : '9999');
    const ord = fratelli.slice().sort((a, b) => chiave(a).localeCompare(chiave(b)) || a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));
    st.righe = ord.map((f, i) => {
      const p = passaggi.filter((x) => x.fratello_id === f.id);
      const pg = (g) => { const x = p.find((y) => y.grado === g); return x ? (x.data ? fmtData(x.data) : String(x.anno || '')) : ''; };
      return {
        n: i + 1, f,
        nascita: [f.luogo_nascita ? f.luogo_nascita + (f.provincia_nascita ? ' (' + f.provincia_nascita + ')' : '') : '', f.data_nascita ? fmtData(f.data_nascita) : ''].filter(Boolean).join(', '),
        residenza: [f.indirizzo, [f.cap, f.citta].filter(Boolean).join(' '), f.provincia ? '(' + f.provincia + ')' : ''].filter(Boolean).join(' '),
        iniz: f.data_iniziazione ? fmtData(f.data_iniziazione) : (f.anno_iniziazione ? String(f.anno_iniziazione) : ''),
        comp: pg('compagno'), maes: pg('maestro'),
        cariche: cariche.filter((c) => c.fratello_id === f.id).sort((a, b) => (a.anno_dal || 0) - (b.anno_dal || 0))
          .map((c) => (c.anno_dal ? (c.anno_al && c.anno_al !== c.anno_dal ? c.anno_dal + '-' + c.anno_al : c.anno_dal) + ' ' : '') + c.carica + (c.note ? ' (' + c.note + ')' : '')),
      };
    });
  }

  const visibili = () => st.righe.filter((r) => st.filtro === 'tutti' || (st.filtro === 'attivi' ? r.f.stato === 'attivo' : r.f.stato !== 'attivo'));
  const notizia = (f) => {
    const base = ({ assonnato: 'Collocato in sonno', depennato: 'Depennato', dimissionario: 'Dimissionario', trasferito: 'Trasferito ad altra Loggia', oriente_eterno: 'Passato all’Oriente Eterno' }[f.stato] || '');
    if (!base) return '';
    return base + (f.data_uscita ? ' il ' + fmtData(f.data_uscita) : '') + (f.stato === 'trasferito' && f.loggia_destinazione ? ' (' + f.loggia_destinazione + ')' : '') + (f.stato === 'trasferito' && f.exeat_rif ? ', Exeat ' + f.exeat_rif : '');
  };

  /* ---------- PDF sul modello del Libro Matricola (due schede per pagina) ---------- */
  async function pdf() {
    const { PDFDocument, StandardFonts, rgb } = await L.libreria('pdflib');
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold), fi = await doc.embedFont(StandardFonts.HelveticaOblique);
    const W = 595.28, H = 841.89, M = 26, nero = rgb(0, 0, 0), grigio = rgb(0.45, 0.45, 0.45), blu = rgb(0.04, 0.1, 0.38);
    const righe = visibili();
    const T = (pg, s, x, y, o) => pg.drawText(pulisci(s), Object.assign({ x, y, size: 7.5, font: f, color: nero }, o || {}));
    const adatta = (s, w, sz, font) => { let t = pulisci(s); while (t.length > 1 && font.widthOfTextAtSize(t, sz) > w) t = t.slice(0, -1); return t; };
    const linea = (pg, x1, y, x2, tratt) => pg.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: tratt ? 0.4 : 0.7, color: tratt ? grigio : nero, dashArray: tratt ? [1.5, 1.5] : undefined });
    const box = (pg, x, y, w, h) => pg.drawRectangle({ x, y, width: w, height: h, borderColor: nero, borderWidth: 0.8 });
    const loggia = [state.loggia.nome, state.loggia.numero ? 'n. ' + state.loggia.numero : '', state.loggia.oriente ? 'Or. di ' + state.loggia.oriente : ''].filter(Boolean).join(' ');

    function scheda(pg, r, top) {
      const h = 378, x0 = M, w = W - 2 * M, xs = x0 + w * 0.52, y0 = top - h;
      box(pg, x0, y0, w, h);
      pg.drawLine({ start: { x: xs, y: y0 }, end: { x: xs, y: top }, thickness: 0.8, color: nero });
      // ---- colonna sinistra: n° progressivo e generalità
      box(pg, x0, top - 30, 46, 30);
      T(pg, 'n°', x0 + 4, top - 10, { size: 6, font: fb }); T(pg, 'progressivo', x0 + 4, top - 17, { size: 6, font: fb });
      T(pg, String(r.n), x0 + 8, top - 27, { size: 10, font: fb, color: blu });
      T(pg, 'Generalità', x0 + 130, top - 12, { size: 9, font: fb });
      linea(pg, x0 + 46, top - 16, xs);
      const campoS = (y, valore, etichetta) => {
        if (valore) T(pg, adatta(valore, xs - x0 - 16, 8.5, fb), x0 + 8, y + 3, { size: 8.5, font: fb, color: blu });
        linea(pg, x0 + 6, y, xs - 6, true);
        T(pg, '(' + etichetta + ')', x0 + (xs - x0) / 2 - f.widthOfTextAtSize('(' + etichetta + ')', 6) / 2, y - 8, { size: 6, font: fi, color: grigio });
      };
      campoS(top - 46, r.f.cognome + ' ' + r.f.nome, 'Cognome e nome');
      campoS(top - 70, r.nascita, 'Luogo e data di nascita');
      campoS(top - 94, r.residenza, 'Residenza');
      campoS(top - 118, r.f.professione, 'Professione');
      // Notizie
      const yN = top - 134;
      linea(pg, x0, yN + 2, xs); T(pg, 'Notizie', x0 + 135, yN - 9, { size: 9, font: fb }); linea(pg, x0, yN - 13, xs);
      const notizie = ['Proveniente dalla R.·.L.·. ........................................ n° ........', 'all’Or.·. di ........................................ in data ................',
        'Trasferito alla R.·.L.·. ........................................ n° ........', 'all’Or.·. di ........................................ in data ................',
        'Collocato in sonno in data ................................', 'a seguito di richiesta .............................................', 'Depennato in data ................................', 'per .........................................................................'];
      notizie.forEach((s, i) => T(pg, s, x0 + 6, yN - 26 - i * 14, { size: 7, color: grigio }));
      const nz = notizia(r.f);
      if (nz) T(pg, adatta('Stato attuale: ' + nz, xs - x0 - 12, 8, fb), x0 + 6, yN - 26 - 8 * 14 - 2, { size: 8, font: fb, color: blu });
      // Giudizi massonici: sempre in bianco, da compilare a mano
      const yG = yN - 26 - 8 * 14 - 14;
      linea(pg, x0, yG + 2, xs); T(pg, 'Giudizi massonici subiti', x0 + 100, yG - 9, { size: 9, font: fb }); linea(pg, x0, yG - 13, xs);
      for (let i = 0; i < 4; i++) { const yy = yG - 28 - i * 14; if (yy > y0 + 6) linea(pg, x0 + 6, yy, xs - 6, true); }

      // ---- colonna destra: registrazione, iniziazione e passaggi di grado
      const xr = xs, wr = x0 + w - xs;
      T(pg, 'Data della registrazione', xr + 6, top - 12, { size: 7, font: fb }); T(pg, r.iniz, xr + 110, top - 12, { size: 8, font: fb, color: blu }); linea(pg, xr + 106, top - 14, x0 + w - 6, true);
      linea(pg, xr, top - 18, x0 + w);
      T(pg, 'Numero d’Ordine Fascicolo', xr + 6, top - 29, { size: 7, font: fb }); T(pg, String(r.n), xr + 120, top - 29, { size: 8, font: fb, color: blu }); linea(pg, xr + 116, top - 31, x0 + w - 6, true);
      linea(pg, xr, top - 35, x0 + w);
      const c1 = xr, c2 = xr + wr * 0.34, c3 = xr + wr * 0.67;
      T(pg, 'Iniziazione', c1 + 18, top - 54, { size: 8.5, font: fb });
      T(pg, 'Passaggio di Grado', c2 + 40, top - 45, { size: 8, font: fb });
      linea(pg, c2, top - 50, x0 + w);
      T(pg, 'Comp. d’Arte', c2 + 14, top - 60, { size: 7.5, font: fb }); T(pg, 'Maestro', c3 + 26, top - 60, { size: 7.5, font: fb });
      pg.drawLine({ start: { x: c2, y: top - 35 }, end: { x: c2, y: top - 150 }, thickness: 0.6, color: nero });
      pg.drawLine({ start: { x: c3, y: top - 50 }, end: { x: c3, y: top - 150 }, thickness: 0.6, color: nero });
      linea(pg, xr, top - 64, x0 + w);
      [[c1, r.iniz], [c2, r.comp], [c3, r.maes]].forEach(([cx, data]) => {
        const cw = wr * 0.33 - 8;
        T(pg, 'Brevetto n°', cx + 6, top - 76, { size: 6, color: grigio }); linea(pg, cx + 6, top - 88, cx + cw, true);
        T(pg, 'rilasciato in data', cx + 6, top - 100, { size: 6, color: grigio }); linea(pg, cx + 6, top - 112, cx + cw, true);
        T(pg, 'nella Tornata del', cx + 6, top - 124, { size: 6, color: grigio });
        if (data) T(pg, data, cx + 8, top - 138, { size: 8.5, font: fb, color: blu });
        linea(pg, cx + 6, top - 140, cx + cw, true);
      });
      linea(pg, xr, top - 150, x0 + w);
      T(pg, 'Incarichi / osservazioni / annotazioni', xr + 40, top - 162, { size: 8.5, font: fb });
      linea(pg, xr, top - 167, x0 + w);
      const annot = r.cariche.slice();
      if (r.f.matricola) annot.unshift('Matricola GOI ' + r.f.matricola);
      for (let i = 0; i < 14; i++) {
        const yy = top - 182 - i * 14;
        if (yy < y0 + 6) break;
        if (annot[i]) T(pg, adatta(annot[i], wr - 14, 7.5, f), xr + 7, yy + 3, { size: 7.5, color: blu });
        linea(pg, xr + 6, yy, x0 + w - 6, true);
      }
    }

    const perPagina = 2, nPag = Math.max(1, Math.ceil(righe.length / perPagina));
    for (let p = 0; p < nPag; p++) {
      const pg = doc.addPage([W, H]);
      T(pg, 'Libro Matricola', M, H - 26, { size: 13, font: fb });
      if (loggia) T(pg, 'R.·.L.·. ' + loggia, M + 110, H - 26, { size: 9, color: grigio });
      T(pg, 'Pagina n° ' + (p + 1), W - M - 60, H - 26, { size: 9, font: fb });
      righe.slice(p * perPagina, (p + 1) * perPagina).forEach((r, k) => scheda(pg, r, H - 38 - k * 392));
    }
    const nome = 'Libro_Matricola_' + L.oggi() + '.pdf';
    const url = URL.createObjectURL(new Blob([await doc.save()], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = nome; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return righe.length;
  }

  async function excel() {
    const XLSX = await L.libreria('xlsx');
    const aoa = [['N° progressivo', 'Cognome e nome', 'Luogo e data di nascita', 'Residenza', 'Professione', 'Data registrazione (iniziazione)', 'Compagno d’Arte', 'Maestro', 'Stato', 'Matricola GOI', 'Incarichi']]
      .concat(visibili().map((r) => [r.n, r.f.cognome + ' ' + r.f.nome, r.nascita, r.residenza, r.f.professione || '', r.iniz, r.comp, r.maes, cap(String(r.f.stato || '').replace('_', ' ')), r.f.matricola || '', r.cariche.join('; ')]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [8, 26, 30, 36, 20, 14, 14, 14, 12, 12, 50].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Libro Matricola');
    const url = URL.createObjectURL(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a'); a.href = url; a.download = 'Libro_Matricola_' + L.oggi() + '.xlsx'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  L.viste.libromatricola = async function (v) {
    await carica();
    const disegna = () => {
      const r = visibili();
      const manc = r.filter((x) => !x.iniz).length;
      $('#lm-corpo', v).innerHTML = `
        ${manc ? `<div class="notice">${manc} ${manc === 1 ? 'Fratello non ha' : 'Fratelli non hanno'} la data di iniziazione: ${manc === 1 ? 'compare' : 'compaiono'} in fondo. Completala dalla scheda del Fratello (o da «Dati da completare») per avere l’ordine cronologico corretto.</div>` : ''}
        <div class="table-wrap"><table><thead><tr><th class="num">N°</th><th>Cognome e nome</th><th>Nascita</th><th>Iniziazione</th><th>Compagno</th><th>Maestro</th><th>Stato</th><th>Incarichi</th></tr></thead>
        <tbody>${r.length ? r.map((x) => `<tr><td class="num"><b>${x.n}</b></td><td><a class="nome" href="#/fratelli/${esc(x.f.id)}">${esc(x.f.cognome)} ${esc(x.f.nome)}</a>${x.f.matricola ? `<div class="hint">matricola ${esc(x.f.matricola)}</div>` : ''}</td>
          <td>${esc(x.nascita || '—')}</td><td>${esc(x.iniz || '—')}</td><td>${esc(x.comp || '—')}</td><td>${esc(x.maes || '—')}</td>
          <td>${L.badgeStato(x.f.stato)}</td>
          <td class="hint">${esc(x.cariche.join(' · ') || '—')}</td></tr>`).join('') : '<tr><td colspan="8"><div class="empty">Nessun Fratello.</div></td></tr>'}</tbody></table></div>`;
    };
    v.innerHTML = `
      <div class="page-head"><div><h1>Libro Matricola</h1><p>Registro cronologico dei Fratelli (art. 37 del Regolamento dell’Ordine) · modello del Corso Segretari 2024</p></div>
        <div class="right actions"><button class="btn gold" id="lm-pdf" type="button">${L.IC.pdf} PDF da stampare</button><button class="btn ghost" id="lm-xls" type="button">Excel</button></div></div>
      <div class="actions" style="margin-bottom:14px"><label class="lbl" for="lm-f">Fratelli</label>
        <select id="lm-f" style="width:auto"><option value="tutti">Tutti (registro completo)</option><option value="attivi">Solo attivi</option><option value="altri">Solo non attivi</option></select>
        <span class="hint">Il numero progressivo segue la data di iniziazione e vale anche come numero del fascicolo. Numeri di brevetto e giudizi restano da compilare a mano.</span></div>
      <div id="lm-corpo"></div>`;
    $('#lm-f', v).value = st.filtro;
    $('#lm-f', v).addEventListener('change', (e) => { st.filtro = e.target.value; disegna(); });
    const conBottone = (id, fn, ok) => $(id, v).addEventListener('click', async (e) => {
      const b = e.currentTarget, t = b.innerHTML; b.disabled = true; b.textContent = 'Preparo…';
      try { const n = await fn(); toast(ok(n), 'ok'); } catch (err) { toast(messaggioErrore(err), 'bad'); }
      b.disabled = false; b.innerHTML = t;
    });
    conBottone('#lm-pdf', pdf, (n) => 'Libro Matricola in PDF: ' + n + ' schede');
    conBottone('#lm-xls', excel, () => 'Libro Matricola in Excel');
    disegna();
  };
})();
