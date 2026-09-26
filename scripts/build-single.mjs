// Nota: los reemplazos usan funciones para que los "$&" / "$'" del código minificado no se interpreten.
// Genera un único archivo HTML autocontenido (JS y CSS incrustados) a partir de dist/.
//  - index.html (raíz del repositorio): se abre con doble clic, sin servidor ni npm.
//  - dist/artifact.html: la misma página sin el esqueleto <html>/<head>/<body>, para publicarla.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'dev.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
const jsFile = assets.find((f) => f.endsWith('.js'));
const cssFile = assets.find((f) => f.endsWith('.css'));
const js = readFileSync(join(dist, 'assets', jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync(join(dist, 'assets', cssFile), 'utf8');
if (/<!--/.test(js)) throw new Error('El bundle contiene "<!--"; no se puede incrustar de forma segura.');

const scriptTag = `<script type="module">\n${js}\n</script>`;
const styleTag = `<style>\n${css}\n</style>`;

const full = html
  .replace(/\s*<script type="module" crossorigin src="[^"]+"><\/script>/, '')
  .replace(/<link rel="stylesheet" crossorigin href="[^"]+">/, () => styleTag)
  .replace('</body>', () => `${scriptTag}\n</body>`);
writeFileSync(new URL('../index.html', import.meta.url), full);

const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
const fonts = html.match(/<link href="https:\/\/fonts\.googleapis\.com[^>]+>/)[0];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/\s*<script type="module"[^>]*><\/script>/, '');
const fragment = `${title}\n${fonts}\n${styleTag}\n${body}\n${scriptTag}\n`;
writeFileSync(join(dist, 'artifact.html'), fragment);

const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} KB`;
console.log(`index.html: ${kb(full)} · dist/artifact.html: ${kb(fragment)}`);
