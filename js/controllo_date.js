/* Lemmi - controlli di coerenza sulle date (bussanti, Fratelli, passaggi di grado).
 * Ogni funzione riceve date in formato aaaa-mm-gg e restituisce { errori: [{campo, msg}], avvisi: [msg] }.
 * Gli errori bloccano il salvataggio (date impossibili); gli avvisi chiedono conferma (casi dubbi ma possibili).
 * Regole prese dalla Costituzione e dal Regolamento GOI: maggiore età (Reg. art. 1), preavviso di 60 giorni per
 * l'iniziazione e 30 per le riammissioni (Reg. art. 3 e delibere), due votazioni in tornate distinte (art. 8),
 * almeno un anno in ogni grado (Cost. art. 10). */
(function () {
  'use strict';
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const ok = (d) => typeof d === 'string' && ISO.test(d);
  const t = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  const fmt = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4);
  const addG = (iso, n) => { const d = new Date(t(iso)); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const addM = (iso, n) => {
    const a = +iso.slice(0, 4), m = +iso.slice(5, 7) - 1 + n, g = +iso.slice(8, 10);
    const d = new Date(Date.UTC(a, m, 1)); const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), Math.min(g, ult))).toISOString().slice(0, 10);
  };
  const eta = (nascita, alla) => {
    let e = +alla.slice(0, 4) - +nascita.slice(0, 4);
    if (alla.slice(5) < nascita.slice(5)) e--;
    return e;
  };
  const nuovo = () => ({ errori: [], avvisi: [] });

  /* Pratica del bussante. Chiavi di dati: come nella tabella bussanti. */
  function bussante(d, oggi) {
    const r = nuovo(); d = d || {};
    const err = (campo, msg) => r.errori.push({ campo, msg });
    const dom = d.data_domanda, nas = d.data_nascita, pic = d.data_presa_in_considerazione,
      com = d.data_comunicazione_collegio, v1 = d.data_prima_votazione, v2 = d.data_seconda_votazione;
    if (ok(dom) && ok(oggi) && dom > oggi) err('data_domanda', 'La data della domanda non può essere nel futuro.');
    if (ok(nas) && ok(dom)) {
      const e = eta(nas, dom);
      if (e < 18) err('data_nascita', 'Alla data della domanda il bussante ha ' + e + ' anni: serve la maggiore età (art. 1 Reg.).');
      else if (e > 100) r.avvisi.push('Alla data della domanda il bussante risulta avere ' + e + ' anni: controlla la data di nascita.');
    }
    if (ok(dom) && ok(pic) && pic < dom) err('data_presa_in_considerazione', 'La presa in considerazione (' + fmt(pic) + ') è precedente alla domanda (' + fmt(dom) + ').');
    if (ok(pic) && ok(com) && com < pic) err('data_comunicazione_collegio', 'La comunicazione al Collegio (' + fmt(com) + ') è precedente alla presa in considerazione (' + fmt(pic) + ').');
    if (ok(dom) && ok(com) && com < dom && !ok(pic)) err('data_comunicazione_collegio', 'La comunicazione al Collegio è precedente alla domanda.');
    if (ok(dom) && ok(v1) && v1 < dom) err('data_prima_votazione', 'La prima votazione (' + fmt(v1) + ') è precedente alla domanda (' + fmt(dom) + ').');
    if (ok(v1) && ok(v2) && v2 <= v1) err('data_seconda_votazione', 'La seconda votazione deve essere in una tornata diversa e successiva alla prima (' + fmt(v1) + ').');
    if (ok(com) && ok(v1)) {
      const giorni = d.tipo_domanda === 'iniziazione' ? 60 : 30;     // iniziazione 60 giorni, riammissioni 30
      const min = addG(com, giorni);
      if (v1 < min) r.avvisi.push('La prima votazione (' + fmt(v1) + ') è prima dei ' + giorni + ' giorni di preavviso dalla comunicazione al Collegio: non prima del ' + fmt(min) + '. Le votazioni senza i preavvisi sono nulle (art. 8/bis Reg.).');
    }
    return r;
  }

  /* Anagrafica del Fratello: data_nascita, data_iniziazione. */
  function fratello(d, oggi) {
    const r = nuovo(); d = d || {};
    const err = (campo, msg) => r.errori.push({ campo, msg });
    const nas = d.data_nascita, ini = d.data_iniziazione;
    if (ok(nas) && ok(oggi) && nas >= oggi) err('data_nascita', 'La data di nascita deve essere nel passato.');
    if (ok(ini) && ok(oggi) && ini > oggi) err('data_iniziazione', 'La data di iniziazione non può essere nel futuro.');
    if (ok(nas) && ok(ini) && ini < nas) err('data_iniziazione', 'L’iniziazione non può precedere la nascita.');
    if (ok(nas) && ok(ini) && ini >= nas) {
      const e = eta(nas, ini);
      if (e < 18) r.avvisi.push('Alla data di iniziazione il Fratello avrebbe ' + e + ' anni: controlla le date.');
    }
    if (ok(nas) && ok(oggi) && nas < oggi && eta(nas, oggi) > 105) r.avvisi.push('La data di nascita indica oltre 105 anni di età: controlla che sia corretta.');
    return r;
  }

  /* Passaggio di grado. p = { grado, data|null, anno|null }.
   * ctx = { iniziazione: 'aaaa-mm-gg'|null, annoIniziazione: n|null, passaggi: [{grado,data,anno}] (gli altri passaggi) }. */
  function passaggio(p, ctx, oggi) {
    const r = nuovo(); ctx = ctx || {};
    const ORD = { apprendista: 0, compagno: 1, maestro: 2 };
    const g = String(p.grado || '').toLowerCase();
    const anno = ok(p.data) ? +p.data.slice(0, 4) : (p.anno || null);
    if (ok(p.data) && ok(oggi) && p.data > oggi) r.errori.push({ campo: 'data', msg: 'La data del passaggio non può essere nel futuro.' });
    if (!ok(p.data) && anno && ok(oggi) && anno > +oggi.slice(0, 4)) r.errori.push({ campo: 'anno', msg: 'L’anno del passaggio non può essere nel futuro.' });
    const annoIni = ok(ctx.iniziazione) ? +ctx.iniziazione.slice(0, 4) : (ctx.annoIniziazione || null);
    if (g !== 'apprendista' && !(ok(p.data) && ok(ctx.iniziazione)) && anno && annoIni && anno < annoIni) r.errori.push({ campo: 'data', msg: 'Il passaggio non può essere precedente all’iniziazione (' + (ok(ctx.iniziazione) ? fmt(ctx.iniziazione) : annoIni) + ').' });
    if (ok(p.data) && ok(ctx.iniziazione) && p.data < ctx.iniziazione && g !== 'apprendista') r.errori.push({ campo: 'data', msg: 'Il passaggio (' + fmt(p.data) + ') è precedente all’iniziazione (' + fmt(ctx.iniziazione) + ').' });
    // rapporto con gli altri gradi già registrati
    (ctx.passaggi || []).forEach((q) => {
      const gq = String(q.grado || '').toLowerCase();
      if (!(g in ORD) || !(gq in ORD) || gq === g) return;
      const aq = ok(q.data) ? +q.data.slice(0, 4) : (q.anno || null);
      if (ORD[gq] < ORD[g]) {                      // grado precedente
        if (ok(p.data) && ok(q.data) && p.data < q.data) r.errori.push({ campo: 'data', msg: 'Il passaggio a ' + g + ' (' + fmt(p.data) + ') è precedente a quello a ' + gq + ' (' + fmt(q.data) + ').' });
        else if (anno && aq && anno < aq) r.errori.push({ campo: 'anno', msg: 'Il passaggio a ' + g + ' non può essere in un anno precedente a quello a ' + gq + ' (' + aq + ').' });
        else if (ok(p.data) && ok(q.data) && p.data < addM(q.data, 12)) r.avvisi.push('Tra il passaggio a ' + gq + ' (' + fmt(q.data) + ') e quello a ' + g + ' (' + fmt(p.data) + ') non è trascorso un anno: serve il Nulla Osta per l’abbreviazione (art. 10 Cost.).');
      } else {                                      // grado successivo già registrato
        if (ok(p.data) && ok(q.data) && p.data > q.data) r.errori.push({ campo: 'data', msg: 'Il passaggio a ' + g + ' (' + fmt(p.data) + ') è successivo a quello a ' + gq + ' (' + fmt(q.data) + ').' });
        else if (anno && aq && anno > aq) r.errori.push({ campo: 'anno', msg: 'Il passaggio a ' + g + ' non può essere in un anno successivo a quello a ' + gq + ' (' + aq + ').' });
      }
    });
    if (g === 'compagno' && ok(p.data) && ok(ctx.iniziazione) && p.data >= ctx.iniziazione && p.data < addM(ctx.iniziazione, 12))
      r.avvisi.push('Dall’iniziazione (' + fmt(ctx.iniziazione) + ') al passaggio a compagno (' + fmt(p.data) + ') non è trascorso un anno: serve il Nulla Osta per l’abbreviazione (art. 10 Cost.).');
    return r;
  }

  const testoAvvisi = (av) => 'Controlla questi punti:\n\n- ' + av.join('\n- ') + '\n\nSalvare comunque?';
  const API = { bussante, fratello, passaggio, testoAvvisi, addG, addM, eta };
  if (typeof window !== 'undefined') window.LemmiDate = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})();
