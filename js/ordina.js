/* Lemmi - ordinamento delle colonne in tutte le tabelle: un clic sull'intestazione ordina, un secondo clic inverte.
 * Capisce da solo date (gg/mm/aaaa), importi in euro (1.234,56 €), orari, numeri e testo. I valori vuoti restano in fondo.
 * Non tocca le tabelle che hanno già un proprio ordinamento (intestazioni "sort") né le righe dei totali (tfoot). */
(function () {
  'use strict';

  const RE_DATA = /^(\d{2})\/(\d{2})\/(\d{4})/;
  const RE_EURO = /^(-?)(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*€/;
  const RE_ORA = /^(\d{1,2}):(\d{2})$/;
  const RE_NUM = /^(-?\d+(?:,\d+)?)(?:\s|$)/;

  function chiave(testo) {
    const t = String(testo || '').replace(/\s+/g, ' ').trim();
    if (!t || t === '—' || t === '-') return null;
    let m = RE_EURO.exec(t);
    if (m) return { n: Number((m[1] || '') + m[2].replace(/\./g, '') + '.' + m[3]) };
    m = RE_DATA.exec(t);
    if (m) return { n: Number(m[3] + m[2] + m[1]) };
    m = RE_ORA.exec(t);
    if (m) return { n: Number(m[1]) * 60 + Number(m[2]) };
    m = RE_NUM.exec(t);
    if (m && t.length < 14) return { n: Number(m[1].replace(',', '.')) };
    return { s: t.toLowerCase() };
  }
  const confronta = (a, b) => {
    if (a.n !== undefined && b.n !== undefined) return a.n - b.n;
    if (a.s !== undefined && b.s !== undefined) return a.s.localeCompare(b.s, 'it', { numeric: true, sensitivity: 'base' });
    return a.n !== undefined ? -1 : 1;          // numeri prima del testo
  };
  const testoCella = (riga, i) => { const c = riga.cells[i]; if (!c) return ''; return c.dataset.sort !== undefined ? c.dataset.sort : c.textContent; };

  function abilita(tabella) {
    if (tabella.dataset.ord || tabella.hasAttribute('data-no-sort') || !tabella.tHead || !tabella.tBodies[0]) return;
    if (tabella.tHead.querySelector('th.sort')) return;                    // ha già un ordinamento proprio
    const ths = Array.from(tabella.tHead.rows[tabella.tHead.rows.length - 1].cells);
    if (!ths.some((th) => th.textContent.trim())) return;
    tabella.dataset.ord = '1';
    const stato = { col: -1, dir: 1 };
    const corpo = tabella.tBodies[0];
    let osserva;

    const aggiornaFrecce = () => ths.forEach((th, i) => {
      const f = th.querySelector('.arr'); if (!f) return;
      f.textContent = i === stato.col ? (stato.dir === 1 ? '▲' : '▼') : '';
      th.setAttribute('aria-sort', i === stato.col ? (stato.dir === 1 ? 'ascending' : 'descending') : 'none');
    });
    const applica = () => {
      if (stato.col < 0) return;
      osserva.disconnect();
      const righe = Array.from(corpo.rows);
      const fisse = righe.filter((r) => Array.from(r.cells).some((c) => c.colSpan > 1));
      const dati = righe.filter((r) => !fisse.includes(r)).map((r, idx) => ({ r, idx, k: chiave(testoCella(r, stato.col)) }));
      dati.sort((x, y) => {
        if (!x.k !== !y.k) return x.k ? -1 : 1;                              // vuoti sempre in fondo
        if (!x.k) return x.idx - y.idx;
        return confronta(x.k, y.k) * stato.dir || x.idx - y.idx;
      });
      dati.forEach((x) => corpo.appendChild(x.r));
      fisse.forEach((r) => corpo.appendChild(r));
      aggiornaFrecce();
      osserva.observe(corpo, { childList: true });
    };
    osserva = new MutationObserver(() => applica());                         // se la tabella si ridisegna, mantiene l'ordine scelto
    const ordina = (i) => { if (stato.col === i) stato.dir = -stato.dir; else { stato.col = i; stato.dir = 1; } applica(); };

    ths.forEach((th, i) => {
      if (!th.textContent.trim()) return;
      th.classList.add('sort-auto');
      th.setAttribute('role', 'button'); th.setAttribute('tabindex', '0'); th.title = 'Clicca per ordinare';
      th.insertAdjacentHTML('beforeend', ' <span class="arr"></span>');
      th.addEventListener('click', () => ordina(i));
      th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ordina(i); } });
    });
    osserva.observe(corpo, { childList: true });
  }

  const scansiona = (nodo) => {
    if (!nodo || nodo.nodeType !== 1) return;
    if (nodo.tagName === 'TABLE') abilita(nodo);
    else if (nodo.querySelectorAll) nodo.querySelectorAll('table').forEach(abilita);
  };
  const avvia = () => {
    scansiona(document.body);
    new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach(scansiona))).observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();

  window.LemmiOrdina = { abilita, chiave };
})();
