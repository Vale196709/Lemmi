/* Lemmi - Piè di lista semestrale (aggiornato al 30 giugno e al 31 dicembre): anteprima, Excel e PDF da firmare.
 * Va inviato a Anagrafe, Gran Segreteria e Segreteria del Collegio, firmato da Maestro Venerabile, Oratore e Segretario. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, toast, messaggioErrore, fmtData, isoToIt, itToIso, oggi, IC, mascheraDate } = L;

  const RUOLI = ['amministratore', 'venerabile', 'segretario'];
  const norm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const GRADI = { apprendista: 'Apprendista', compagno: 'Compagno', maestro: 'Maestro' };
  const ORD_GRADO = { maestro: 0, compagno: 1, apprendista: 2 };
  const pulisci = (s) => String(s == null ? '' : s).normalize('NFC').replace(/[^\x20-\x7E\u00A0-\u00FF\u2019\u2018\u201C\u201D\u2013\u2014\u2026\u20AC\u2022]/g, '?');
  const st = { righe: [], stati: [], inclusi: null, data: null, firme: { mv: '', oratore: '', segretario: '' }, esoneri: {} };

  const dataPredefinita = () => { const o = oggi(); const y = Number(o.slice(0, 4)); return o.slice(5) <= '06-30' ? y + '-06-30' : y + '-12-31'; };

  async function carica() {
    const sb = state.sb;
    const [fr, vc, ca] = await Promise.all([
      sb.from('fratelli').select('*').order('cognome').order('nome'),
      sb.from('v_fratelli_completi').select('id,grado_attuale'),
      sb.from('cariche_storico').select('fratello_id,carica,anno_dal,anno_al'),
    ]);
    const frat = chk(fr), grado = {};
    chk(vc).forEach((x) => { grado[x.id] = String(x.grado_attuale || '').toLowerCase(); });
    const campoEson = frat.length ? ['esonero_capitazione', 'percentuale_esonero', 'esonero'].find((k) => k in frat[0]) : null;
    st.righe = frat.map((f) => ({
      id: f.id, stato: f.stato || '', grado: grado[f.id] || '', cognome: f.cognome, nome: f.nome, nascita: f.data_nascita || '',
      indirizzo: [f.indirizzo, [f.cap, f.citta].filter(Boolean).join(' ') + (f.provincia ? ' (' + f.provincia + ')' : '')].map((x) => String(x || '').trim()).filter((x) => x && x !== '()').join(', '),
      professione: f.professione || '', cellulare: f.cellulare || '', email: f.email || '',
      esonero: campoEson && f[campoEson] != null ? String(f[campoEson]) : '',
    }));
    st.stati = Array.from(new Set(st.righe.map((r) => r.stato).filter(Boolean)));
    if (!st.inclusi) st.inclusi = new Set(st.stati.filter((s) => !/depenn|espuls|decad|eterno|cancell|trasfer/i.test(s)));
    if (!st.data) st.data = dataPredefinita();
    // firmatari proposti dalle cariche dell'anno della data
    const anno = Number(st.data.slice(0, 4));
    const cariche = chk(ca);
    const chi = (re, no) => { const c = cariche.find((x) => re.test(norm(x.carica)) && !(no && no.test(norm(x.carica))) && x.anno_dal <= anno && (x.anno_al || x.anno_dal) >= anno); const f = c && st.righe.find((r) => r.id === c.fratello_id); return f ? f.cognome + ' ' + f.nome : ''; };
    if (!st.firme.mv) st.firme.mv = chi(/venerabile/, /gran|aggiunt/);
    if (!st.firme.oratore) st.firme.oratore = chi(/oratore/, /gran|aggiunt/);
    if (!st.firme.segretario) st.firme.segretario = chi(/segretari/, /gran|aggiunt/);
  }

  const visibili = () => st.righe.filter((r) => !r.stato || st.inclusi.has(r.stato))
    .sort((a, b) => (ORD_GRADO[a.grado] ?? 9) - (ORD_GRADO[b.grado] ?? 9) || a.cognome.localeCompare(b.cognome, 'it') || a.nome.localeCompare(b.nome, 'it'));
  const gradoTesto = (g) => GRADI[g] || '';
  const percEson = (r) => (st.esoneri[r.id] !== undefined ? st.esoneri[r.id] : r.esonero);
  const mancanze = (r) => [!r.nascita && 'data di nascita', !r.indirizzo && 'indirizzo', !r.cellulare && 'cellulare', !r.email && 'e-mail', !r.grado && 'grado'].filter(Boolean);
  const titolo = () => ({
    riga1: "PIE' DI LISTA AGGIORNATO AL " + isoToIt(st.data),
    riga2: 'RISPETTABILE LOGGIA ' + String((state.loggia && state.loggia.nome) || '').toUpperCase() + ' N° ' + ((state.loggia && state.loggia.numero) || '') + " ALL'ORIENTE DI " + String((state.loggia && state.loggia.oriente) || '').toUpperCase(),
  });
  const COLONNE = ['GRADO', 'COGNOME E NOME', 'DATA DI NASCITA', 'INDIRIZZO (VIA, NUMERO CIVICO, CITTA\', CAP)', 'PROFESSIONE', 'CELLULARE', 'INDIRIZZO MAIL', 'PERCENTUALE DI ESONERO CAPITAZIONE'];
  const riga = (r) => [gradoTesto(r.grado), r.cognome + ' ' + r.nome, r.nascita ? fmtData(r.nascita) : '', r.indirizzo, r.professione, r.cellulare, r.email, percEson(r)];
  const nomeFile = (est) => 'Pie_di_lista_' + st.data + '.' + est;
  const scarica = (bytes, nome, tipo) => {
    const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));
    const a = document.createElement('a'); a.href = url; a.download = nome; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  };

  /* ---------- Excel ---------- */
  function excel() {
    if (!window.XLSX) throw new Error('Lettore Excel non caricato: ricarica la pagina.');
    const t = titolo(), righe = visibili();
    const aoa = [[t.riga1], [t.riga2], [], COLONNE, ...righe.map(riga), [], ['', 'L’ORATORE', '', 'IL MAESTRO VENERABILE', '', 'IL SEGRETARIO'], ['', st.firme.oratore, '', st.firme.mv, '', st.firme.segretario]];
    const ws = window.XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 14 }, { wch: 52 }, { wch: 24 }, { wch: 16 }, { wch: 32 }, { wch: 18 }];
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, 'Pie di lista');
    const out = window.XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    scarica(out, nomeFile('xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    return righe.length;
  }

  /* ---------- PDF da firmare (A4 orizzontale) ---------- */
  async function pdf() {
    const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
    const doc = await PDFDocument.create();
    const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
    const W = 841.89, H = 595.28, M = 28;
    const larg = [50, 118, 56, 175, 85, 66, 150, 78];                        // totale 778
    const t = titolo(), righe = visibili();
    const perPagina = 31, nPag = Math.max(1, Math.ceil(righe.length / perPagina));
    const adatta = (testo, w, sz, font) => { let s = pulisci(testo), tagliato = false; while (s.length > 1 && font.widthOfTextAtSize(s + (tagliato ? '…' : ''), sz) > w - 4) { s = s.slice(0, -1); tagliato = true; } return s + (tagliato ? '…' : ''); };
    for (let p = 0; p < nPag; p++) {
      const pg = doc.addPage([W, H]);
      pg.drawText(pulisci(t.riga1), { x: M, y: H - 34, size: 13, font: fb });
      pg.drawText(pulisci(t.riga2), { x: M, y: H - 52, size: 10, font: fb });
      let y = H - 74, x = M;
      pg.drawRectangle({ x: M, y: y - 14, width: larg.reduce((a, b) => a + b, 0), height: 24, color: rgb(0.9, 0.92, 0.97) });
      COLONNE.forEach((c, i) => {
        const parole = pulisci(c).split(' '); let riga1 = '', righeC = [];
        parole.forEach((w) => { const tt = riga1 ? riga1 + ' ' + w : w; if (fb.widthOfTextAtSize(tt, 6.2) > larg[i] - 4 && riga1) { righeC.push(riga1); riga1 = w; } else riga1 = tt; });
        righeC.push(riga1);
        righeC.slice(0, 3).forEach((r, k) => pg.drawText(r, { x: x + 2, y: y + 5 - k * 7, size: 6.2, font: fb }));
        x += larg[i];
      });
      y -= 26;
      righe.slice(p * perPagina, (p + 1) * perPagina).forEach((r, k) => {
        x = M;
        if (k % 2) pg.drawRectangle({ x: M, y: y - 3, width: larg.reduce((a, b) => a + b, 0), height: 13.5, color: rgb(0.97, 0.97, 0.98) });
        riga(r).forEach((c, i) => { pg.drawText(adatta(c, larg[i], 7.2, f), { x: x + 2, y, size: 7.2, font: f }); x += larg[i]; });
        y -= 13.5;
      });
      pg.drawText(pulisci('Pagina ' + (p + 1) + ' di ' + nPag + ' · ' + righe.length + ' Fratelli'), { x: M, y: 16, size: 7, font: f, color: rgb(0.4, 0.4, 0.4) });
      if (p === nPag - 1) {
        const ys = Math.max(60, y - 38), col = (xx, etic, nome) => {
          pg.drawText(etic, { x: xx, y: ys + 22, size: 8, font: fb });
          pg.drawLine({ start: { x: xx, y: ys }, end: { x: xx + 190, y: ys }, thickness: 0.6, color: rgb(0, 0, 0) });
          pg.drawText(pulisci(nome), { x: xx, y: ys - 10, size: 8, font: f });
        };
        col(M + 20, 'L’ORATORE', st.firme.oratore); col(M + 290, 'IL MAESTRO VENERABILE', st.firme.mv); col(M + 560, 'IL SEGRETARIO', st.firme.segretario);
      }
    }
    scarica(await doc.save(), nomeFile('pdf'), 'application/pdf');
    return righe.length;
  }

  L.pieDiLista = { carica, excel, pdf, visibili, st };

  /* ---------- vista ---------- */
  L.viste.piedilista = async function (v) {
    await carica();
    const disegna = () => {
      const righe = visibili(), manc = righe.filter((r) => mancanze(r).length);
      v.innerHTML = `
        <div class="page-head"><div><h1>Piè di lista</h1><p>Elenco dei Fratelli aggiornato al 30 giugno e al 31 dicembre, da inviare firmato</p></div></div>
        <div class="card"><div class="form-grid">
          <div class="f s3"><label for="p-data">Aggiornato al</label><input id="p-data" value="${esc(isoToIt(st.data))}" data-date="1" inputmode="numeric" maxlength="10" placeholder="gg/mm/aaaa" autocomplete="off"></div>
          <div class="f s3"><label for="p-or">L’Oratore</label><input id="p-or" data-f="oratore" value="${esc(st.firme.oratore)}" placeholder="Cognome e nome"></div>
          <div class="f s3"><label for="p-mv">Il Maestro Venerabile</label><input id="p-mv" data-f="mv" value="${esc(st.firme.mv)}" placeholder="Cognome e nome"></div>
          <div class="f s3"><label for="p-se">Il Segretario</label><input id="p-se" data-f="segretario" value="${esc(st.firme.segretario)}" placeholder="Cognome e nome"></div>
          <div class="f"><span class="lbl">Fratelli da inserire (per stato)</span>${st.stati.length ? st.stati.map((s) => `<label class="check"><input type="checkbox" data-st="${esc(s)}" ${st.inclusi.has(s) ? 'checked' : ''}> ${esc(s)} <span class="muted">(${st.righe.filter((r) => r.stato === s).length})</span></label>`).join('') : '<span class="muted">Nessuno stato trovato.</span>'}</div></div>
          <div class="actions" style="margin-top:12px;flex-wrap:wrap"><button class="btn gold" id="p-xls">Scarica Excel</button><button class="btn gold" id="p-pdf">Scarica PDF da firmare</button></div>
          <div class="hint" style="margin-top:8px">Il piè di lista va inviato firmato (Venerabile, Oratore e Segretario) all’<b>Anagrafe</b>, alla <b>Gran Segreteria</b> e alla <b>Segreteria del Collegio</b>, aggiornato al 30 giugno e al 31 dicembre di ogni anno. Senza questo invio la Gran Segreteria non rilascia il Nulla Osta per il rinnovo delle cariche.</div></div>
        ${manc.length ? `<div class="notice" style="margin-top:14px"><b>${manc.length} ${manc.length === 1 ? 'Fratello ha' : 'Fratelli hanno'} dati mancanti</b> in anagrafica (evidenziati nella tabella): completali dalla scheda del Fratello prima di inviare.</div>` : ''}
        <div class="table-wrap" style="margin-top:14px"><table><thead><tr><th>Grado</th><th>Cognome e nome</th><th>Data di nascita</th><th>Indirizzo</th><th>Professione</th><th>Cellulare</th><th>E-mail</th><th>% esonero capitazione</th></tr></thead><tbody>
        ${righe.length ? righe.map((r) => { const m = mancanze(r); return `<tr ${m.length ? `style="background:var(--warn-bg,#fff7e0)" title="Manca: ${esc(m.join(', '))}"` : ''}><td>${esc(gradoTesto(r.grado)) || '<span class="muted">—</span>'}</td><td><b>${esc(r.cognome + ' ' + r.nome)}</b></td><td data-sort="${esc(r.nascita)}">${r.nascita ? fmtData(r.nascita) : '<span class="muted">—</span>'}</td><td>${esc(r.indirizzo) || '<span class="muted">—</span>'}</td><td>${esc(r.professione)}</td><td>${esc(r.cellulare)}</td><td>${esc(r.email)}</td>
          <td data-sort="${esc(percEson(r))}"><input data-es="${esc(r.id)}" value="${esc(percEson(r))}" style="width:70px" placeholder="—" inputmode="numeric"></td></tr>`; }).join('') : '<tr><td colspan="8"><div class="empty">Nessun Fratello con gli stati scelti.</div></td></tr>'}</tbody></table></div>
        <div class="hint" style="margin-top:6px">La percentuale di esonero si compila solo per i Fratelli esonerati (es. dispensa dagli oneri finanziari per gli over 75, deliberata dalla Giunta): vale per questo invio e non viene salvata.</div>`;
      mascheraDate(v);
      $('#p-data', v).addEventListener('change', (e) => { const i = itToIso(e.target.value); if (!i || i === 'ERR') return toast('Data non valida: usa gg/mm/aaaa.', 'bad'); st.data = i; });
      $$('[data-f]', v).forEach((i) => i.addEventListener('input', (e) => { st.firme[e.target.dataset.f] = e.target.value; }));
      $$('[data-st]', v).forEach((i) => i.addEventListener('change', (e) => { if (e.target.checked) st.inclusi.add(e.target.dataset.st); else st.inclusi.delete(e.target.dataset.st); disegna(); }));
      $$('[data-es]', v).forEach((i) => i.addEventListener('input', (e) => { st.esoneri[e.target.dataset.es] = e.target.value.replace(/[^\d,.]/g, ''); e.target.closest('td').dataset.sort = st.esoneri[e.target.dataset.es]; }));
      $('#p-xls', v).onclick = () => { try { const n = excel(); toast('Excel creato: ' + n + ' Fratelli', 'ok'); } catch (e) { toast(messaggioErrore(e), 'bad'); } };
      $('#p-pdf', v).onclick = async () => { try { const n = await pdf(); toast('PDF creato: ' + n + ' Fratelli', 'ok'); } catch (e) { toast(messaggioErrore(e), 'bad'); } };
    };
    disegna();
  };
})();
