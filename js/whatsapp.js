/* Lemmi - WhatsApp con un tocco (gratuito, link ufficiali wa.me: nessun account aziendale, nessun costo).
 * L'app prepara il messaggio già scritto e apre WhatsApp; chi lo usa sceglie il contatto o il gruppo e preme Invia.
 * Pulsanti: Calendario (convocazione da inoltrare al gruppo), scheda del Fratello e quote scadute (messaggio e sollecito),
 * Lavori e tavole (promemoria all'autore), scheda del bussante (date al Fratello presentatore). */
(function () {
  'use strict';
  const L = window.Lemmi;
  if (!L) return;
  const { state, esc, chk, toast, fmtData, eur } = L;

  const IC_WA = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 11.6a8.5 8.5 0 0 1-12.6 7.5L3.5 20.5l1.4-4.3a8.5 8.5 0 1 1 15.6-4.6z"/><path d="M9 8.8c.2 2.6 2.6 5 5.2 5.3l1.2-1.2-1.8-.9-.8.8c-1-.4-1.9-1.3-2.3-2.3l.8-.8-.9-1.8z"/></svg>';
  const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
  const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  const dataLunga = (iso) => { if (!iso) return ''; const [a, m, g] = iso.split('-').map(Number); const d = new Date(Date.UTC(a, m - 1, g)); return GIORNI[d.getUTCDay()] + ' ' + g + ' ' + MESI[m - 1] + ' ' + a; };
  const GRADO = { apprendista: 'di Apprendista', compagno: 'di Compagno d’Arte', maestro: 'di Maestro' };
  const intestazione = () => {
    const l = state.loggia || {};
    return ['R∴L∴ ' + (l.nome || ''), l.numero ? 'n. ' + l.numero : '', l.oriente ? '– Or∴ di ' + l.oriente : ''].filter(Boolean).join(' ').trim();
  };

  // numero in formato internazionale per wa.me (Italia per difetto)
  function numeroWa(tel) {
    let n = String(tel || '').replace(/[^\d+]/g, '');
    if (n.startsWith('+')) n = n.slice(1); else if (n.startsWith('00')) n = n.slice(2); else if (n) n = '39' + n;
    return n.length >= 10 ? n : '';
  }

  // numeri di cellulare dei Fratelli (letti una volta; il Tesoriere li legge dalla sua vista)
  let cellulari = null;
  async function cellulareDi(id) {
    if (!cellulari) {
      cellulari = {};
      for (const fonte of ['fratelli', 'v_fratelli_tesoreria']) {
        try { chk(await state.sb.from(fonte).select('id,cellulare,nome')).forEach((f) => { cellulari[f.id] = f; }); if (Object.keys(cellulari).length) break; } catch (e) { /* prova la fonte successiva */ }
      }
    }
    return cellulari[id] || null;
  }

  // apre WhatsApp: la finestra si apre subito (così il browser non la blocca) e riceve l'indirizzo appena pronto
  async function apri(prepara) {
    const w = window.open('', '_blank');
    try {
      const { numero, testo } = await prepara();
      const url = 'https://wa.me/' + (numero || '') + '?text=' + encodeURIComponent(testo);
      if (w) w.location.href = url; else location.href = url;
    } catch (e) { if (w) w.close(); toast(e.message || String(e), 'bad'); }
  }

  /* ---------- testi ---------- */
  function testoTornata(t) {
    const tipo = { ordinaria: 'Tornata rituale', informale: 'Conferenza via web', straordinaria: 'Tornata straordinaria', agape: 'Agape' }[t.tipo] || 'Tornata';
    const righe = [intestazione(), '', `*${tipo}${t.tipo !== 'informale' && t.grado ? ' ' + (GRADO[t.grado] || '') : ''}*`,
      dataLunga(t.data).replace(/^./, (c) => c.toUpperCase()) + (t.ora ? ', ore ' + String(t.ora).slice(0, 5) : '')];
    if (t.stato === 'annullata') righe.push('*ANNULLATA*');
    if (t.tipo === 'informale' && t.link_online) righe.push('Collegamento: ' + t.link_online);
    else if (t.luogo) righe.push('Luogo: ' + t.luogo);
    if (t.relatore) righe.push('Relatore: ' + t.relatore);
    if (t.ordine_del_giorno) righe.push('', 'Ordine del giorno:', t.ordine_del_giorno);
    return righe.join('\n');
  }

  async function testoSollecito(id) {
    const f = await cellulareDi(id);
    if (!f) throw new Error('Non riesco a leggere i dati del Fratello.');
    let righe = [];
    try { righe = chk(await state.sb.from('v_scadenze_stato').select('voce,anno,rata_n,rate_totali,residuo,data_scadenza,stato').eq('fratello_id', id)); } catch (e) { righe = []; }
    const aperte = righe.filter((r) => Number(r.residuo) > 0 && r.stato !== 'Esente').sort((a, b) => String(a.data_scadenza).localeCompare(String(b.data_scadenza)));
    const tot = aperte.reduce((a, r) => a + Number(r.residuo), 0);
    const elenco = aperte.map((r) => `• ${r.voce} ${r.anno}${r.rate_totali > 1 ? ' (rata ' + r.rata_n + '/' + r.rate_totali + ')' : ''}: ${eur(r.residuo)}${r.data_scadenza ? ', scadenza ' + fmtData(r.data_scadenza) : ''}`);
    const testo = aperte.length
      ? [`Carissimo Fratello ${f.nome || ''},`, 'ti ricordo con fraterna cortesia le quote ancora da versare:', ...elenco, `Totale: ${eur(tot)}.`, '', 'Grazie, un triplice fraterno abbraccio.'].join('\n')
      : `Carissimo Fratello ${f.nome || ''},`;
    return { numero: numeroWa(f.cellulare), testo, f };
  }

  /* ---------- pulsanti (un solo gestore per tutta l'app) ---------- */
  const bottone = (attr, titolo, testo) => `<button type="button" class="btn ghost small wa" ${attr} title="${esc(titolo)}">${IC_WA}${testo ? ' ' + esc(testo) : ''}</button>`;
  L.wa = {
    // convocazione di una tornata: si sceglie poi il gruppo o i contatti
    tornata: (t) => bottone(`data-wa-tornata="${esc(t.id)}"`, 'Condividi su WhatsApp (scegli il gruppo)', ''),
    // messaggio libero a un Fratello
    fratello: (id, testo, etichetta) => bottone(`data-wa-fr="${esc(id)}" data-wa-testo="${esc(testo || '')}"`, 'Scrivi su WhatsApp', etichetta === undefined ? 'WhatsApp' : etichetta),
    // sollecito delle quote ancora da versare
    sollecito: (id, etichetta) => bottone(`data-wa-sol="${esc(id)}"`, 'Sollecito delle quote su WhatsApp', etichetta === undefined ? 'Sollecito' : etichetta),
    tornate: {},   // tornate disegnate dal Calendario, per comporre il messaggio
    testoTornata, numeroWa,
  };

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-wa-tornata],[data-wa-fr],[data-wa-sol]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();          // non apre la riga o il dettaglio sotto il pulsante
    if (b.dataset.waTornata) {
      const t = L.wa.tornate[b.dataset.waTornata];
      if (t) apri(async () => ({ numero: '', testo: testoTornata(t) }));
    } else if (b.dataset.waFr) {
      apri(async () => {
        const f = await cellulareDi(b.dataset.waFr);
        if (!f || !numeroWa(f.cellulare)) throw new Error('Il Fratello non ha un numero di cellulare in anagrafica.');
        return { numero: numeroWa(f.cellulare), testo: b.dataset.waTesto || `Carissimo Fratello ${f.nome || ''},` };
      });
    } else if (b.dataset.waSol) {
      apri(async () => {
        const r = await testoSollecito(b.dataset.waSol);
        if (!r.numero) throw new Error('Il Fratello non ha un numero di cellulare in anagrafica.');
        return r;
      });
    }
  }, true);

  /* ---------- scheda del bussante: date al Fratello presentatore ---------- */
  L.bussanteExtra = L.bussanteExtra || [];
  L.bussanteExtra.push(async (v, id, b) => {
    if (!b || !b.presentatore_id || !L.canEdit()) return;
    const date = [['Domanda presentata', b.data_domanda], ['Presa in considerazione', b.data_presa_in_considerazione], ['Prima votazione', b.data_prima_votazione],
      b.tipo_domanda === 'iniziazione' ? ['Seconda votazione', b.data_seconda_votazione] : null].filter((x) => x && x[1]);
    const testo = [`Carissimo Fratello, ti aggiorno sulla domanda di ${b.nome} ${b.cognome}, da te presentata:`, ...date.map(([l, d]) => `• ${l}: ${fmtData(d)}`), '', 'Un triplice fraterno abbraccio.'].join('\n');
    v.insertAdjacentHTML('beforeend', `<div class="card"><h2>Comunicazioni</h2>
      <p class="muted" style="margin:0 0 10px">Messaggio già scritto con le date della pratica, da inviare al Fratello presentatore.</p>
      <div class="actions">${L.wa.fratello(b.presentatore_id, testo, 'WhatsApp al presentatore')}</div></div>`);
  });
})();
