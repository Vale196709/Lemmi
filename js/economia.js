/* Lemmi - "Vista economica" nel Cruscotto: liquidità, entrate e uscite, quote dei Fratelli, eventi, cose da sistemare. */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, fmtData, oggi } = L;

  const RUOLI = ['amministratore', 'venerabile', 'tesoriere'];
  const eur = (x) => L.eur(x);
  const num = (x) => Number(x || 0);
  const MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
  const eco = { anno: new Date().getFullYear() };

  const ok = async (p) => { try { return chk(await p); } catch (e) { return null; } };

  async function dati(anno) {
    const sb = state.sb;
    const saldoRiga = await ok(sb.from('conto_saldi').select('data,saldo').lte('data', oggi()).order('data', { ascending: false }).limit(1));
    const saldo = saldoRiga && saldoRiga[0] ? saldoRiga[0] : null;
    let dopoQ = sb.from('v_conto_movimenti').select('importo');
    if (saldo) dopoQ = dopoQ.gt('data_operazione', saldo.data);
    const [scad, mov, dopo, eventi, extra] = await Promise.all([
      ok(sb.from('v_scadenze_stato').select('*').eq('anno', anno)),
      ok(sb.from('v_conto_movimenti').select('id,data_operazione,descrizione,importo,categoria,categoria_id,stato_riconciliazione').gte('data_operazione', anno + '-01-01').lte('data_operazione', anno + '-12-31')),
      ok(dopoQ),
      ok(sb.from('eventi_conto').select('id,nome,data_evento').order('nome')),
      ok(sb.from('conto_movimenti').select('id,evento_id').gte('data_operazione', anno + '-01-01').lte('data_operazione', anno + '-12-31')),
    ]);
    const liquidita = dopo ? dopo.reduce((a, x) => a + num(x.importo), 0) + (saldo ? num(saldo.saldo) : 0) : null;
    return { scad, mov, saldo, liquidita, eventi, extra };
  }

  const barra = (valore, max, colore) => `<div style="background:var(--line);border-radius:6px;height:10px;overflow:hidden"><div style="width:${max > 0 ? Math.max(2, Math.min(100, valore / max * 100)) : 0}%;height:100%;background:${colore}"></div></div>`;

  function perCategoria(mov, segno) {
    const m = {};
    mov.filter((x) => (segno > 0 ? num(x.importo) > 0 : num(x.importo) < 0)).forEach((x) => { const k = x.categoria || 'Senza categoria'; m[k] = (m[k] || 0) + Math.abs(num(x.importo)); });
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }

  function html(d, anno, anni) {
    const mov = d.mov || [];
    const entrate = mov.filter((x) => num(x.importo) > 0).reduce((a, x) => a + num(x.importo), 0);
    const uscite = mov.filter((x) => num(x.importo) < 0).reduce((a, x) => a - num(x.importo), 0);
    const sc = d.scad || [];
    const dovuto = sc.reduce((a, r) => a + num(r.importo_dovuto), 0), versato = sc.reduce((a, r) => a + num(r.versato), 0);
    const residuo = sc.reduce((a, r) => a + num(r.residuo), 0);
    const scaduto = sc.filter((r) => r.stato === 'Scaduto').reduce((a, r) => a + num(r.residuo), 0);

    const mensili = MESI.map((_, i) => ({ e: 0, u: 0 }));
    mov.forEach((x) => { const i = Number(String(x.data_operazione).slice(5, 7)) - 1; if (i >= 0) { if (num(x.importo) > 0) mensili[i].e += num(x.importo); else mensili[i].u -= num(x.importo); } });
    const maxM = Math.max(1, ...mensili.map((m) => Math.max(m.e, m.u)));
    const grafico = `<div style="display:flex;gap:6px;align-items:flex-end;height:150px;padding-top:6px">${mensili.map((m, i) => `
      <div class="drillable mese-col" data-drill="eco" data-a="mese" data-i="${i}" role="button" tabindex="0" style="flex:1;min-width:0;text-align:center;border-radius:8px" title="${MESI[i]}: entrate ${eur(m.e)}, uscite ${eur(m.u)} · clicca per il dettaglio">
        <div style="display:flex;gap:2px;align-items:flex-end;justify-content:center;height:124px"><div style="width:42%;height:${Math.round(m.e / maxM * 124)}px;background:var(--ok);border-radius:3px 3px 0 0;min-height:${m.e ? 2 : 0}px"></div><div style="width:42%;height:${Math.round(m.u / maxM * 124)}px;background:var(--bad);border-radius:3px 3px 0 0;min-height:${m.u ? 2 : 0}px"></div></div>
        <div class="muted" style="font-size:.72rem;margin-top:4px">${MESI[i]}</div></div>`).join('')}</div>
      <div class="muted" style="font-size:.8rem;margin-top:6px"><span style="color:var(--ok)">■</span> entrate &nbsp; <span style="color:var(--bad)">■</span> uscite &nbsp;· clicca su un mese per il dettaglio</div>`;

    const elencoCat = (lista, colore, segno) => { const tot = lista.reduce((a, [, v]) => a + v, 0); const max = lista.length ? lista[0][1] : 0;
      return lista.length ? lista.slice(0, 8).map(([k, v]) => `<div class="drillable riga-d" data-drill="eco" data-a="cat" data-seg="${segno}" data-k="${esc(k)}" role="button" tabindex="0" title="Clicca per i movimenti" style="margin:3px 0;padding:6px 8px"><div style="display:flex;justify-content:space-between;gap:10px;font-size:.92rem"><span>${esc(k)}</span><b>${eur(v)}${tot ? ` <span class="muted" style="font-weight:400">${Math.round(v / tot * 100)}%</span>` : ''}</b></div>${barra(v, max, colore)}</div>`).join('') : '<div class="empty"><div>Nessun movimento.</div></div>'; };

    const perVoce = {};
    sc.forEach((r) => { const x = perVoce[r.voce] || (perVoce[r.voce] = { dov: 0, ver: 0 }); x.dov += num(r.importo_dovuto); x.ver += num(r.versato); });
    const voci = Object.entries(perVoce).filter(([, x]) => x.dov > 0);

    const scadutiPer = {};
    sc.filter((r) => r.stato === 'Scaduto').forEach((r) => { const x = scadutiPer[r.fratello_id] || (scadutiPer[r.fratello_id] = { id: r.fratello_id, nome: r.fratello, res: 0, da: r.data_scadenza }); x.res += num(r.residuo); if (r.data_scadenza < x.da) x.da = r.data_scadenza; });
    const morosi = Object.values(scadutiPer).sort((a, b) => b.res - a.res);

    const ev = d.eventi || [], mappaEv = {}; (d.extra || []).forEach((x) => { mappaEv[x.id] = x.evento_id; });
    const eventi = ev.map((e) => { const l = mov.filter((x) => mappaEv[x.id] === e.id); const en = l.filter((x) => num(x.importo) > 0).reduce((a, x) => a + num(x.importo), 0); const us = l.filter((x) => num(x.importo) < 0).reduce((a, x) => a - num(x.importo), 0); return { id: e.id, nome: e.nome, n: l.length, en, us, ris: en - us }; }).filter((e) => e.n);

    const daRic = mov.filter((x) => x.stato_riconciliazione === 'da_riconciliare').length;
    const senzaCat = mov.filter((x) => num(x.importo) < 0 && !x.categoria_id && x.stato_riconciliazione !== 'ignorato').length;

    return `
      <div class="actions" style="justify-content:space-between;margin:6px 0 12px"><h2 style="margin:0">Vista economica</h2>
        <span><label class="lbl" for="eco-anno">Anno</label> <select id="eco-anno" style="width:auto">${anni.map((a) => `<option ${a === anno ? 'selected' : ''}>${a}</option>`).join('')}</select></span></div>
      <div class="grid stats">
        <div class="stat drillable" data-drill="eco" data-a="kpi" data-k="liq" role="button" tabindex="0" title="Clicca per il dettaglio"><div class="n" style="font-size:1.8rem">${d.liquidita === null ? '—' : eur(d.liquidita)}</div><div class="l">Liquidità stimata<br><span style="font-size:.75rem">${d.liquidita === null ? 'dati del conto non disponibili' : d.saldo ? 'saldo banca al ' + fmtData(d.saldo.data) + ' + movimenti successivi' : 'somma dei movimenti importati: importa un estratto PDF per avere il saldo di banca'}</span></div></div>
        <div class="stat drillable" data-drill="eco" data-a="kpi" data-k="ent" role="button" tabindex="0" title="Clicca per il dettaglio"><div class="n" style="font-size:1.8rem;color:var(--ok)">${eur(entrate)}</div><div class="l">Entrate ${anno}</div></div>
        <div class="stat drillable" data-drill="eco" data-a="kpi" data-k="usc" role="button" tabindex="0" title="Clicca per il dettaglio"><div class="n" style="font-size:1.8rem;color:var(--bad)">${eur(uscite)}</div><div class="l">Uscite ${anno}</div></div>
        <div class="stat drillable" data-drill="eco" data-a="kpi" data-k="ris" role="button" tabindex="0" title="Clicca per il dettaglio"><div class="n" style="font-size:1.8rem;color:${entrate - uscite >= 0 ? 'var(--ok)' : 'var(--bad)'}">${eur(entrate - uscite)}</div><div class="l">Risultato ${anno}</div></div>
      </div>
      <div class="grid cols-2">
        <div class="card"><h2>Entrate e uscite per mese</h2>${mov.length ? grafico : '<div class="empty"><div>Nessun movimento nel ' + anno + '.</div></div>'}</div>
        <div class="card"><h2>Quote dei Fratelli ${anno}</h2>
          ${sc.length ? `<div class="stat drillable" data-drill="eco" data-a="quote" role="button" tabindex="0" title="Clicca per l’elenco delle quote" style="box-shadow:none;padding:0 0 8px"><div class="n" style="font-size:1.5rem">${eur(versato)} <span class="muted" style="font-size:.9rem;font-weight:400">su ${eur(dovuto)} (${dovuto ? Math.round(versato / dovuto * 100) : 0}%)</span></div></div>${barra(versato, dovuto, 'var(--ok)')}
          <div class="actions drillable riga-d" data-drill="eco" data-a="aperte" role="button" tabindex="0" title="Clicca per vedere chi deve versare" style="justify-content:space-between;margin:10px 0;padding:4px 8px"><span>Residuo da incassare</span><b>${eur(residuo)}</b></div>
          <div class="actions drillable riga-d" data-drill="eco" data-a="scadute" role="button" tabindex="0" title="Clicca per vedere le quote scadute" style="justify-content:space-between;padding:4px 8px"><span>Di cui già scaduto</span><b style="color:${scaduto ? 'var(--bad)' : 'inherit'}">${eur(scaduto)}</b></div>
          ${voci.length ? `<div style="margin-top:12px">${voci.map(([k, x]) => `<div class="drillable riga-d" data-drill="eco" data-a="voce" data-k="${esc(k)}" role="button" tabindex="0" title="Clicca per l’elenco di questa voce" style="margin:4px 0;padding:6px 8px"><div style="display:flex;justify-content:space-between;font-size:.9rem"><span>${esc(k)}</span><span>${eur(x.ver)} / ${eur(x.dov)}</span></div>${barra(x.ver, x.dov, 'var(--gold)')}</div>`).join('')}</div>` : ''}`
          : '<div class="empty"><div>Nessuna scadenza per il ' + anno + '.</div></div>'}
          <div style="margin-top:12px"><a href="#/pagamenti/scadenze">Vai a Tesoreria</a></div></div>
        <div class="card"><h2>Da dove arrivano i soldi</h2>${elencoCat(perCategoria(mov, 1), 'var(--ok)', 1)}</div>
        <div class="card"><h2>Dove vanno i soldi</h2>${elencoCat(perCategoria(mov, -1), 'var(--bad)', -1)}</div>
        <div class="card"><h2>Quote scadute <small>${morosi.length}</small></h2>
          ${morosi.length ? `<div class="table-wrap"><table><tbody>${morosi.slice(0, 8).map((m) => `<tr class="click" data-drill="eco" data-a="fr" data-id="${esc(m.id)}" tabindex="0" title="Clicca per il dettaglio"><td><b>${esc(m.nome)}</b><div class="hint">dal ${fmtData(m.da)}</div></td><td class="num" style="color:var(--bad)"><b>${eur(m.res)}</b></td></tr>`).join('')}</tbody></table></div>${morosi.length > 8 ? `<div class="muted" style="margin-top:6px">… e altri ${morosi.length - 8}</div>` : ''}` : '<div class="empty"><div>Nessuna quota scaduta.</div></div>'}</div>
        <div class="card"><h2>Eventi ${anno}</h2>
          ${eventi.length ? `<div class="table-wrap"><table><thead><tr><th>Evento</th><th class="num">Entrate</th><th class="num">Uscite</th><th class="num">Risultato</th></tr></thead><tbody>${eventi.map((e) => `<tr class="click" data-drill="eco" data-a="ev" data-id="${esc(e.id)}" tabindex="0" title="Clicca per i movimenti"><td><b>${esc(e.nome)}</b></td><td class="num">${eur(e.en)}</td><td class="num">${eur(e.us)}</td><td class="num" style="color:${e.ris >= 0 ? 'var(--ok)' : 'var(--bad)'}"><b>${eur(e.ris)}</b></td></tr>`).join('')}</tbody></table></div>`
            : '<div class="empty"><div>Nessun evento con movimenti. In Conto di Loggia, il pulsante «Eventi» li raggruppa.</div></div>'}</div>
      </div>
      ${(daRic || senzaCat) ? `<div class="notice" style="margin-bottom:14px"><b>Da sistemare nel Conto di Loggia:</b> ${daRic ? daRic + (daRic === 1 ? ' movimento da riconciliare' : ' movimenti da riconciliare') : ''}${daRic && senzaCat ? ', ' : ''}${senzaCat ? senzaCat + (senzaCat === 1 ? ' uscita senza categoria' : ' uscite senza categoria') : ''}. <a href="#/pagamenti/conto">Apri il Conto di Loggia</a></div>` : ''}`;
  }


  /* ---------- approfondimento (drill-down) dei grafici ---------- */
  let ultimo = null;   // dati dell'ultima vista disegnata
  const MESI_L = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  const meseDi = (x) => Number(String(x.data_operazione).slice(5, 7)) - 1;
  const catDi = (x) => x.categoria || 'Senza categoria';
  const sommaE = (r) => r.filter((x) => num(x.importo) > 0).reduce((a, x) => a + num(x.importo), 0);
  const sommaU = (r) => r.filter((x) => num(x.importo) < 0).reduce((a, x) => a - num(x.importo), 0);
  const perCat = (r, segno) => perCategoria(r, segno).map(([k, v]) => ({ etichetta: k, valore: v }));
  const filtroMese = { t: 'Mese', v: (r) => String(meseDi(r)), nome: (k) => MESI_L[Number(k)], ord: (a, b) => Number(a) - Number(b) };

  function movimentiAnno() {
    const mappaEv = {}; ((ultimo.d.extra) || []).forEach((x) => { mappaEv[x.id] = x.evento_id; });
    return (ultimo.d.mov || []).map((x) => Object.assign({}, x, { evento_id: mappaEv[x.id] }));
  }

  function livMovimenti(t, titolo, righe, filtri) {
    const en = sommaE(righe), us = sommaU(righe);
    return {
      t, titolo,
      html: L.drill.kpi([{ l: 'Entrate', v: eur(en), c: 'var(--ok)' }, { l: 'Uscite', v: eur(us), c: 'var(--bad)' }, { l: 'Saldo', v: eur(en - us), c: L.drill.colore(en - us) }, { l: 'Movimenti', v: righe.length }]),
      bind: (corpo) => L.drill.movimenti(corpo, righe, { filtri: filtri || [] }),
    };
  }

  // riepilogo per categoria di un insieme di movimenti: da qui si scende ai singoli movimenti
  function livCategorie(t, titolo, righe, mostra) {
    const ent = perCat(righe, 1), usc = perCat(righe, -1);
    const en = sommaE(righe), us = sommaU(righe);
    const sezE = mostra !== 'u' ? `<h3 class="drill-h">Entrate per categoria</h3>${L.drill.barre(ent, { azione: 'ce', colore: 'var(--ok)' })}` : '';
    const sezU = mostra !== 'e' ? `<h3 class="drill-h">Uscite per categoria</h3>${L.drill.barre(usc, { azione: 'cu', colore: 'var(--bad)' })}` : '';
    const del = (segno, k) => righe.filter((x) => catDi(x) === k && (segno > 0 ? num(x.importo) > 0 : num(x.importo) < 0));
    return {
      t, titolo,
      html: () => L.drill.kpi([{ l: 'Entrate', v: eur(en), c: 'var(--ok)' }, { l: 'Uscite', v: eur(us), c: 'var(--bad)' }, { l: 'Saldo', v: eur(en - us), c: L.drill.colore(en - us) }])
        + sezE + sezU + '<div style="margin-top:14px"><button type="button" class="btn ghost small" data-go="tutti">Tutti i movimenti</button></div>',
      vai: {
        ce: (el) => { const k = ent[Number(el.dataset.i)].etichetta; return livMovimenti(k, t + ' · entrate · ' + k, del(1, k)); },
        cu: (el) => { const k = usc[Number(el.dataset.i)].etichetta; return livMovimenti(k, t + ' · uscite · ' + k, del(-1, k)); },
        tutti: () => livMovimenti('Movimenti', titolo + ' · tutti i movimenti', mostra === 'e' ? righe.filter((x) => num(x.importo) > 0) : mostra === 'u' ? righe.filter((x) => num(x.importo) < 0) : righe),
      },
    };
  }

  function livScadenze(t, titolo, righe, nota) {
    const dov = righe.reduce((a, r) => a + num(r.importo_dovuto), 0), ver = righe.reduce((a, r) => a + num(r.versato), 0), res = righe.reduce((a, r) => a + num(r.residuo), 0);
    return {
      t, titolo,
      html: L.drill.kpi([{ l: 'Dovuto', v: eur(dov) }, { l: 'Versato', v: eur(ver), c: 'var(--ok)' }, { l: 'Residuo', v: eur(res), c: res > 0 ? 'var(--bad)' : '' }, { l: 'Scadenze', v: righe.length }]) + (nota ? `<div class="hint" style="margin-bottom:8px">${esc(nota)}</div>` : ''),
      bind: (corpo) => L.drill.tabella(corpo, {
        righe: righe.slice().sort((a, b) => String(a.data_scadenza).localeCompare(String(b.data_scadenza)) || String(a.fratello).localeCompare(String(b.fratello), 'it')),
        colonne: [
          { t: 'Fratello', v: (r) => `<a class="nome" href="#/fratelli/${esc(r.fratello_id)}">${esc(r.fratello)}</a>` },
          { t: 'Voce', v: (r) => esc(r.voce) + (r.rate_totali > 1 ? ` <span class="muted">· rata ${r.rata_n}/${r.rate_totali}</span>` : '') },
          { t: 'Scadenza', v: (r) => fmtData(r.data_scadenza) },
          { t: 'Dovuto', num: true, v: (r) => eur(r.importo_dovuto) },
          { t: 'Versato', num: true, v: (r) => eur(r.versato) },
          { t: 'Residuo', num: true, v: (r) => `<b style="color:${num(r.residuo) > 0 ? 'var(--bad)' : 'inherit'}">${eur(r.residuo)}</b>` },
          { t: 'Stato', v: (r) => esc(r.stato || '—') },
        ],
        filtri: [{ t: 'Stato', v: (r) => r.stato || 'n/d' }, { t: 'Voce', v: (r) => r.voce }],
        totali: (rr) => `<div class="drill-tot"><span>Dovuto <b>${eur(rr.reduce((a, r) => a + num(r.importo_dovuto), 0))}</b></span><span>Versato <b style="color:var(--ok)">${eur(rr.reduce((a, r) => a + num(r.versato), 0))}</b></span><span>Residuo <b style="color:var(--bad)">${eur(rr.reduce((a, r) => a + num(r.residuo), 0))}</b></span></div>`,
        vuoto: 'Nessuna scadenza.',
      }),
    };
  }

  L.drill.registra('eco', (el) => {
    if (!ultimo) return;
    const a = el.dataset.a, anno = ultimo.anno, sc = ultimo.d.scad || [], mov = movimentiAnno();
    let liv = null;
    if (a === 'mese') {
      const i = Number(el.dataset.i);
      liv = livCategorie(MESI_L[i], MESI_L[i] + ' ' + anno, mov.filter((x) => meseDi(x) === i), 'tutti');
    } else if (a === 'kpi') {
      const k = el.dataset.k;
      if (k === 'ent') liv = livCategorie('Entrate ' + anno, 'Entrate ' + anno + ' per categoria', mov.filter((x) => num(x.importo) > 0), 'e');
      else if (k === 'usc') liv = livCategorie('Uscite ' + anno, 'Uscite ' + anno + ' per categoria', mov.filter((x) => num(x.importo) < 0), 'u');
      else if (k === 'ris') liv = livCategorie('Risultato ' + anno, 'Risultato ' + anno + ' per categoria', mov, 'tutti');
      else {
        liv = livMovimenti('Movimenti ' + anno, 'Movimenti del ' + anno, mov, [filtroMese]);
        const base = liv.html;
        liv.html = base + `<div class="hint" style="margin-bottom:8px">${ultimo.d.saldo ? 'La liquidità parte dal saldo di banca del ' + fmtData(ultimo.d.saldo.data) + ' e somma i movimenti successivi.' : 'La liquidità è la somma dei movimenti importati.'} Qui sotto i movimenti del ${anno}.</div>`;
      }
    } else if (a === 'cat') {
      const segno = Number(el.dataset.seg), k = el.dataset.k;
      const r = mov.filter((x) => catDi(x) === k && (segno > 0 ? num(x.importo) > 0 : num(x.importo) < 0));
      liv = livMovimenti(k, (segno > 0 ? 'Entrate' : 'Uscite') + ' · ' + k + ' · ' + anno, r, [filtroMese]);
    } else if (a === 'quote') liv = livScadenze('Quote ' + anno, 'Quote dei Fratelli ' + anno, sc);
    else if (a === 'aperte') liv = livScadenze('Da incassare', 'Quote da incassare ' + anno, sc.filter((r) => num(r.residuo) > 0));
    else if (a === 'scadute') liv = livScadenze('Scadute', 'Quote scadute ' + anno, sc.filter((r) => r.stato === 'Scaduto'));
    else if (a === 'voce') { const k = el.dataset.k; liv = livScadenze(k, k + ' · quote ' + anno, sc.filter((r) => r.voce === k)); }
    else if (a === 'fr') {
      const id = el.dataset.id, r = sc.filter((x) => String(x.fratello_id) === id);
      liv = livScadenze(r[0] ? r[0].fratello : 'Fratello', (r[0] ? r[0].fratello : 'Fratello') + ' · quote ' + anno, r, 'Dalla scheda del Fratello (clic sul nome) si vede tutta la sua storia.');
    } else if (a === 'ev') {
      const id = el.dataset.id, ev = (ultimo.d.eventi || []).find((x) => String(x.id) === id);
      liv = livMovimenti(ev ? ev.nome : 'Evento', 'Evento · ' + (ev ? ev.nome : ''), mov.filter((x) => String(x.evento_id) === id));
    }
    if (liv) L.drill.apri(liv);
  });

  L.cruscottoExtra = L.cruscottoExtra || [];
  L.cruscottoExtra.push(async (v) => {
    if (!RUOLI.includes(state.profilo && state.profilo.ruolo)) return;
    const sez = document.createElement('section');
    sez.id = 'eco';
    if (v.children.length > 1) sez.style.marginTop = '28px';   // sotto i dati di segreteria, con un po' d'aria
    v.appendChild(sez);
    const ora = new Date().getFullYear();
    const anni = Array.from(new Set([ora - 2, ora - 1, ora, ora + 1])).sort();
    const disegna = async () => {
      sez.innerHTML = '<div class="muted" style="padding:10px 0">Carico la vista economica…</div>';
      const d = await dati(eco.anno);
      if (!d.mov && !d.scad) { sez.innerHTML = ''; return; }   // nessun accesso o tabelle assenti
      ultimo = { d, anno: eco.anno };
      sez.innerHTML = html(d, eco.anno, anni);
      $('#eco-anno', sez).addEventListener('change', (e) => { eco.anno = Number(e.target.value); disegna(); });
    };
    await disegna();
  });
})();
