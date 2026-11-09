// Prova di ricostruzione: esegue sql/schema_completo.sql in un database vuoto, due volte, e controlla che non ci siano errori
// e che gli oggetti creati corrispondano a quelli descritti nel file. Serve un PostgreSQL raggiungibile con le variabili
// PGHOST, PGUSER, PGPASSWORD (e facoltativamente PGPORT). Crea e poi cancella un database temporaneo.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const radice = path.resolve(__dirname, '..', '..');
const nome = 'lemmi_prova_' + process.pid;

const psql = (args, db) => execFileSync('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=0', ...(db ? ['-d', db] : ['-d', 'postgres']), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const eseguiFile = (file) => {
  try { return { out: '', err: execFileSync('psql', ['-X', '-q', '-d', nome, '-f', file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
  catch (e) { return { out: '', err: String(e.stderr || e.message) }; }
};
const conta = (sql) => Number(psql(['-tA', '-c', sql], nome).trim());
const dallaStruttura = (re) => (fs.readFileSync(path.join(radice, 'sql/schema_completo.sql'), 'utf8').match(re) || []).length;
let ko = 0;
const verifica = (cond, testo) => { console.log((cond ? 'OK  ' : 'KO  ') + testo); if (!cond) ko++; };

try {
  psql(['-c', 'create database ' + nome]);
  const stub = eseguiFile(path.join(__dirname, 'stub.sql'));
  verifica(!/ERROR/.test(stub.err), 'ambiente di prova creato');
  const schema = path.join(radice, 'sql/schema_completo.sql');
  const prima = eseguiFile(schema), seconda = eseguiFile(schema);
  verifica(!/ERROR/i.test(prima.err), 'schema: prima esecuzione senza errori' + (/ERROR/i.test(prima.err) ? '\n' + prima.err.split('\n').filter((r) => /ERROR/.test(r)).slice(0, 5).join('\n') : ''));
  verifica(!/ERROR/i.test(seconda.err), 'schema: seconda esecuzione (ripetibile) senza errori');
  const attese = [
    ['tabelle', "select count(*) from pg_tables where schemaname='public'", /^create table if not exists public\./gim],
    ['viste', "select count(*) from pg_views where schemaname='public'", /^create or replace view public\./gim],
    ['funzioni', "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'", /^create or replace function public\./gim],
    ['regole di sicurezza', "select count(*) from pg_policies", /^create policy /gim],
  ];
  attese.forEach(([etichetta, sql, re]) => { const a = dallaStruttura(re), b = conta(sql); verifica(a === b && a > 0, etichetta + ': ' + b + ' nel database, ' + a + ' nel file'); });
  verifica(conta("select count(*) from pg_tables where schemaname='public' and not rowsecurity") === 0, 'tutte le tabelle hanno la sicurezza a livello di riga attiva');
} finally {
  try { psql(['-c', 'drop database if exists ' + nome]); } catch (_) { /* pulizia non riuscita: database temporaneo da cancellare a mano */ }
}
if (ko) { console.error('\n' + ko + ' controlli falliti'); process.exit(1); }
console.log('\nTutti i controlli sul database superati');
