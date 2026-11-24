// Copies the web app into www/ for the native shells. The repo root stays the GitHub Pages site,
// so the web app and the store apps ship the exact same files. Run: npm run build
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';

const OUT = 'www';
const FILES = ['index.html', 'native.js', 'shell.js', 'app.js', 'gains.js', 'gains-core.js', 'macros.js', 'macros-core.js',
  'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
const DIRS = ['vendor'];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
for (const f of FILES) {
  if (!existsSync(f)) throw new Error('missing ' + f);
  cpSync(f, `${OUT}/${f}`);
}
for (const d of DIRS) cpSync(d, `${OUT}/${d}`, { recursive: true });

// The store apps carry their files inside the app bundle; no service worker there.
const html = readFileSync(`${OUT}/index.html`, 'utf8').replace('<link rel="manifest" href="manifest.webmanifest">', '');
writeFileSync(`${OUT}/index.html`, html);
const build = (readFileSync('app.js', 'utf8').match(/BUILD = '([^']+)'/) || [])[1];
console.log(`www/ ready (${FILES.length} files + ${DIRS.join(', ')}) · build ${build}`);
