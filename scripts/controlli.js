// Controlli automatici prima della pubblicazione (nessuna dipendenza, solo Node).
// Verifica: sintassi degli script inline, versione uguale in sw.js e index.html,
// file della cache presenti, e (su una PR) VERSION del service worker alzata rispetto alla base.
const fs = require('fs');
const vm = require('vm');
const cp = require('child_process');

const html = fs.readFileSync('index.html', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');
const errori = [];

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
scripts.forEach((s, i) => {
  try { new vm.Script(s); } catch (e) { errori.push(`script inline ${i + 1}: ${e.message}`); }
});

const sv = (sw.match(/const VERSION = '([^']+)'/) || [])[1];
const av = (html.match(/var APP_VERSION="([^"]+)"/) || [])[1];
if (!sv) errori.push('sw.js: VERSION non trovata');
if (!av) errori.push('index.html: APP_VERSION non trovata');
if (sv && av && sv !== av) errori.push(`versione diversa: sw.js ${sv}, index.html ${av}`);

const inizio = sw.indexOf('const SHELL');
const blocco = sw.slice(inizio, sw.indexOf('];', inizio));
const file = [...blocco.matchAll(/'([^']+)'/g)].map(m => m[1]).filter(f => f !== './');
file.forEach(f => { if (!fs.existsSync(f)) errori.push(`file in cache mancante: ${f}`); });

const base = process.env.BASE_REF;
if (base) {
  let bsw = '';
  try { bsw = cp.execSync(`git show origin/${base}:sw.js`, { encoding: 'utf8' }); }
  catch (e) { errori.push(`impossibile leggere sw.js della base ${base}`); }
  const bv = (bsw.match(/const VERSION = '([^']+)'/) || [])[1];
  if (bv && bv === sv) errori.push(`VERSION non alzata: resta ${sv} (come in ${base})`);
}

if (errori.length) {
  console.error('Controlli NON superati:\n- ' + errori.join('\n- '));
  process.exit(1);
}
console.log(`Controlli superati: versione ${sv}, ${scripts.length} script, ${file.length} file in cache.`);
