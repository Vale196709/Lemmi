/* Lemmi - Cerca: una sola ricerca su Fratelli, bussanti, lavori e tavole, pratiche e tornate.
 * Scorciatoia: premi "/" in qualunque pagina (fuori dai campi di testo). */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, $, $$, esc, chk, fmtData } = L;

  const pulisci = (s) => String(s || '').replace(/[%,()*\\]/g, ' ').trim();
  const norm = (s) => String(s == null ? '' : s).toLowerCase();
  const tutteLeParole = (testo, parole) => parole.every((p) => norm(testo).includes(p));
  const sicuro = async (p) => { try { return chk(await p); } catch (e) { return []; } };

  async function cerca(q) {
    const parole = pulisci(q).toLowerCase().split(/\s+/).filter(Boolean);
    if (!parole.length || parole.join('').length < 2) return null;
    const lunga = parole.slice().sort((a, b) => b.length - a.length)[0];
    const like = '%' + lunga + '%';
    const sb = state.sb;
    const [fr, bu, la, pr, to] = await Promise.all([
      sicuro(sb.from('v_fratelli_completi').select('id,cognome,nome,matricola,stato,grado_attuale,citta,email,cellulare').or(`cognome.ilike.${like},nome.ilike.${like},matricola.ilike.${like},citta.ilike.${like},email.ilike.${like}`).limit(60)),
      sicuro(sb.from('bussanti').select('id,cognome,nome,citta,email,cellulare,tipo_domanda').or(`cognome.ilike.${like},nome.ilike.${like},citta.ilike.${like},email.ilike.${like}`).limit(60)),
      sicuro(sb.from('lavori').select('id,titolo,autore_esterno,fratello_id,stato').or(`titolo.ilike.${like},autore_esterno.ilike.${like}`).limit(60)),
      sicuro(sb.from('pratiche').select('id,titolo,procedura,stato').ilike('titolo', like).limit(40)),
      sicuro(sb.from('tornate').select('id,data,tipo,ordine_del_giorno,relatore,solennita').or(`ordine_del_giorno.ilike.${like},relatore.ilike.${like},solennita.ilike.${like}`).order('data', { ascending: false }).limit(40)),
    ]);
    const nomiFr = {};
    (await sicuro(sb.from('fratelli').select('id,cognome,nome'))).forEach((f) => { nomiFr[f.id] = f.cognome + ' ' + f.nome; });
    return {
      fratelli: fr.filter((x) => tutteLeParole([x.cognome, x.nome, x.matricola, x.citta, x.email].join(' '), parole)),
      bussanti: bu.filter((x) => tutteLeParole([x.cognome, x.nome, x.citta, x.email].join(' '), parole)),
      lavori: la.filter((x) => tutteLeParole([x.titolo, x.autore_esterno, nomiFr[x.fratello_id]].join(' '), parole)).map((x) => Object.assign({ autore: x.fratello_id ? nomiFr[x.fratello_id] : x.autore_esterno }, x)),
      pratiche: pr.filter((x) => tutteLeParole(x.titolo, parole)),
      tornate: to.filter((x) => tutteLeParole([x.ordine_del_giorno, x.relatore, x.solennita].join(' '), parole)),
    };
  }

  const sez = (titolo, righe) => (righe.length ? `<div class="card" style="margin-bottom:14px"><h2>${esc(titolo)} <small>${righe.length}</small></h2><div class="table-wrap"><table><tbody>${righe.join('')}</tbody></table></div></div>` : '');
  const riga = (href, a, b) => `<tr class="click" data-go="${esc(href)}"><td><b>${a}</b></td><td class="muted">${b || ''}</td></tr>`;

  L.viste.cerca = async function (v) {
    v.innerHTML = `<div class="page-head"><div><h1>Cerca</h1><p>Fratelli, bussanti, lavori e tavole, pratiche e tornate · scorciatoia: tasto “/”</p></div></div>
      <div class="actions" style="margin-bottom:16px"><div class="searchbar" style="max-width:560px">${L.IC.search}<input id="gq" type="search" placeholder="Scrivi almeno 2 lettere: cognome, titolo di una tavola, città…" autocomplete="off" autofocus></div></div>
      <div id="g-ris"><div class="empty"><div>Scrivi qui sopra per cercare.</div></div></div>`;
    const inp = $('#gq', v), out = $('#g-ris', v);
    let timer = null, n = 0;
    const lancia = async () => {
      const mio = ++n;
      const r = await cerca(inp.value);
      if (mio !== n) return;
      if (!r) { out.innerHTML = '<div class="empty"><div>Scrivi almeno 2 lettere.</div></div>'; return; }
      const html = sez('Fratelli', r.fratelli.map((x) => riga('#/fratelli/' + x.id, esc(x.cognome + ' ' + x.nome), esc([x.matricola && 'matr. ' + x.matricola, x.grado_attuale, x.citta, x.stato !== 'attivo' ? x.stato : ''].filter(Boolean).join(' · ')))))
        + sez('Bussanti', r.bussanti.map((x) => riga('#/bussanti/' + x.id, esc(x.cognome + ' ' + x.nome), esc([x.tipo_domanda, x.citta].filter(Boolean).join(' · ')))))
        + sez('Lavori e tavole', r.lavori.map((x) => riga('#/lavori', esc(x.titolo), esc(x.autore || ''))))
        + sez('Pratiche', r.pratiche.map((x) => riga('#/procedure/' + x.procedura + '/' + x.id, esc(x.titolo), esc(x.stato === 'in_corso' ? 'in corso' : x.stato))))
        + sez('Tornate', r.tornate.map((x) => riga('#/calendario', fmtData(x.data), esc([x.tipo, x.relatore, x.solennita].filter(Boolean).join(' · ')))));
      out.innerHTML = html || '<div class="empty"><div>Nessun risultato.</div></div>';
      $$('[data-go]', out).forEach((t) => t.addEventListener('click', () => { location.hash = t.dataset.go; }));
    };
    inp.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(lancia, 250); });
    inp.focus();
  };

  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
    if (!state.user) return;
    e.preventDefault();
    location.hash = '#/cerca';
    const i = document.getElementById('gq'); if (i) i.focus();
  });

  L.ricerca = { cerca };
})();
