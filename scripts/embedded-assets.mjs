import { readFile } from 'node:fs/promises';

const assets = {
  'index.html': 'text/html; charset=utf-8',
  'play.html': 'text/html; charset=utf-8',
  'auth.js': 'text/javascript; charset=utf-8',
  'login.js': 'text/javascript; charset=utf-8',
  'play.js': 'text/javascript; charset=utf-8',
  'css.css': 'text/css; charset=utf-8',
  'legal.pdf': 'application/pdf',
};

export async function embeddedModules() {
  const imports = ["import worker from './worker.js';", "export { Room } from './worker.js';"];
  const routes = [];
  const files = [];
  for (const [name, contentType] of Object.entries(assets)) {
    const index = files.length;
    const binary = contentType === 'application/pdf';
    const part = `asset${index}.${binary ? 'bin' : 'txt'}`;
    imports.push(`import asset${index} from './${part}';`);
    routes.push(`  '/${name}': [asset${index}, '${contentType}'],`);
    files.push({ name: part, type: binary ? 'Data' : 'Text', contents: await readFile(new URL(`../public/${name}`, import.meta.url)) });
  }
  for (const name of ['worker.js', 'game.js', 'spotify.js']) {
    files.push({ name, type: 'ESModule', contents: await readFile(new URL(`../src/${name}`, import.meta.url)) });
  }
  const entry = `
${imports.join('\n')}
const files = new Map(Object.entries({
${routes.join('\n')}
}));
const ASSETS = {
  fetch(input) {
    const asset = files.get(new URL(input.url ?? input).pathname);
    if (!asset) return new Response('Not found', { status: 404 });
    return new Response(input.method === 'HEAD' ? null : asset[0], { headers: { 'Content-Type': asset[1] } });
  },
};
export default {
  fetch(request, env) {
    return worker.fetch(request, { ...env, ASSETS });
  },
};
`;
  return [{ name: 'entry.js', type: 'ESModule', contents: Buffer.from(entry) }, ...files];
}
