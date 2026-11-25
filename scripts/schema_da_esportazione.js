// Trasforma il risultato di sql/esporta_schema.sql (CSV scaricato da Supabase, una colonna "definizione")
// in sql/schema_completo.sql ripetibile: indici, regole di sicurezza e trigger vengono ricreati senza errori.
// Uso:  node scripts/schema_da_esportazione.js percorso/del/file.csv
const fs = require('fs');
const path = require('path');

function righeCsv(testo) {
  const out = []; let campo = ''; let riga = []; let tra = false;
  for (let i = 0; i < testo.length; i++) {
    const c = testo[i];
    if (tra) {
      if (c === '"') { if (testo[i + 1] === '"') { campo += '"'; i++; } else tra = false; } else campo += c;
    } else if (c === '"') tra = true;
    else if (c === ',') { riga.push(campo); campo = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && testo[i + 1] === '\n') i++; riga.push(campo); out.push(riga); riga = []; campo = ''; }
    else campo += c;
  }
  if (campo !== '' || riga.length) { riga.push(campo); out.push(riga); }
  return out;
}

function converti(def) {
  let d = def.replace(/\s+$/, '');
  let m;
  if ((m = /^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i.exec(d))) return d.replace(/^CREATE (UNIQUE )?INDEX /i, (x, u) => 'CREATE ' + (u || '') + 'INDEX IF NOT EXISTS ') + (d.endsWith(';') ? '' : ';');
  if ((m = /^create policy ("[^"]+"|\S+) on (\S+)/i.exec(d))) return `drop policy if exists ${m[1]} on ${m[2]};\n${d}${d.endsWith(';') ? '' : ';'}`;
  if ((m = /^CREATE TRIGGER (\S+) .*? ON (\S+)/is.exec(d))) return `DROP TRIGGER IF EXISTS ${m[1]} ON ${m[2]};\n${d}${d.endsWith(';') ? '' : ';'}`;
  return d;
}

const file = process.argv[2];
if (!file) { console.error('Indica il file CSV dell\'esportazione.'); process.exit(1); }
const righe = righeCsv(fs.readFileSync(file, 'utf8')).map((r) => r[0]).filter((x) => x !== undefined);
if (righe[0] !== 'definizione') { console.error('Il file non sembra l\'esportazione dello schema (manca la colonna "definizione").'); process.exit(1); }
// L'esportazione elenca le tabelle in ordine alfabetico, ma i vincoli richiedono l'ordine di dipendenza: lo ricostruiamo qui.
function categoria(d) {
  if (/^do \$t\$/i.test(d)) return 1;
  if (/^create sequence/i.test(d)) return 2;
  if (/^create table/i.test(d)) return 3;
  if (/^alter table/i.test(d)) return 3;
  if (/^create (unique )?index/i.test(d)) return 4;
  if (/^create or replace function/i.test(d)) return 5;
  if (/^create or replace view/i.test(d)) return 6;
  if (/^drop trigger/i.test(d)) return 7;
  if (/^drop policy/i.test(d)) return 8;
  if (/^--/.test(d)) return 9;
  return 5;
}
function ordina(definizioni, nome, dipende) {   // ordinamento topologico stabile
  const mappa = new Map(definizioni.map((d) => [nome(d), d]));
  const fatti = new Set(); const out = [];
  const visita = (n, pila) => {
    if (fatti.has(n) || pila.has(n)) return;
    pila.add(n);
    dipende(mappa.get(n), n, [...mappa.keys()]).forEach((x) => { if (mappa.has(x) && x !== n) visita(x, pila); });
    fatti.add(n); out.push(mappa.get(n));
  };
  [...mappa.keys()].forEach((n) => visita(n, new Set()));
  return out;
}
const tutte = righe.slice(1).filter((x) => x.trim()).map(converti);
const per = (c) => tutte.filter((d) => categoria(d) === c);
// tabelle: ogni "alter table ... enable row level security" segue la sua tabella
const tabelle = per(3).filter((d) => /^create table/i.test(d));
const alter = per(3).filter((d) => /^alter table/i.test(d));
const nomeTab = (d) => (/^create table if not exists public\.(\w+)/i.exec(d) || [])[1];
const tabOrdinate = ordina(tabelle, nomeTab, (d, n) => [...d.matchAll(/references (?:public\.)?(\w+)/gi)].map((m) => m[1]))
  .flatMap((d) => [d].concat(alter.filter((x) => new RegExp('^alter table (?:public\\.)?' + nomeTab(d) + '\\b', 'i').test(x))));
const nomeVista = (d) => (/^create or replace view public\.(\w+)/i.exec(d) || [])[1];
const viste = ordina(per(6), nomeVista, (d, n, tutti) => tutti.filter((x) => x !== n && new RegExp('\\b' + x + '\\b').test(d)));
const corpo = [].concat(per(1), per(2), tabOrdinate, per(4), ['set check_function_bodies = off;'], per(5), viste, per(7), per(8), per(9));
const oggi = new Date().toISOString().slice(0, 10).split('-').reverse().join('/');
const destinazione = path.join(__dirname, '..', 'sql', 'schema_completo.sql');
let intest = '';
try { intest = fs.readFileSync(destinazione, 'utf8').split('\n').filter((l, i, a) => a.slice(0, i + 1).every((x) => x.startsWith('--'))).join('\n'); } catch (e) { /* prima volta */ }
intest = intest ? intest.replace(/esportata da Supabase il [\d/]+/, 'esportata da Supabase il ' + oggi) : '-- Lemmi - STRUTTURA COMPLETA DEL DATABASE (esportata da Supabase il ' + oggi + ' con sql/esporta_schema.sql)';
fs.writeFileSync(destinazione, intest + '\n\n' + corpo.join('\n\n') + '\n');
console.log('Scritto sql/schema_completo.sql: ' + tutte.length + ' definizioni.');
