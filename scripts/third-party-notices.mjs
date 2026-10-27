// Regenerates the open-source notices for every package the app depends on (production dependencies only):
//   node scripts/third-party-notices.mjs
// Writes THIRD_PARTY_NOTICES.txt (full texts) and src/legal/third-party.json (shown in Settings).
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const root = process.cwd();
const seen = new Map();
function visit(name, from) {
  let dir;
  try { dir = dirname(createRequire(join(from, 'noop.js')).resolve(`${name}/package.json`)); } catch { return; }
  if (seen.has(dir)) return;
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const file = readdirSync(dir).find(entry => /^(licen[cs]e|copying|notice)(\.|$)/i.test(entry));
  const license = typeof pkg.license === 'string' ? pkg.license : pkg.license?.type ?? 'See package';
  seen.set(dir, { name: pkg.name, version: pkg.version, license, text: file ? readFileSync(join(dir, file), 'utf8').trim() : '' });
  for (const dependency of Object.keys(pkg.dependencies ?? {})) visit(dependency, dir);
}
const app = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
for (const dependency of Object.keys(app.dependencies)) visit(dependency, root);
const packages = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const texts = [];
const list = packages.map(item => {
  let index = texts.indexOf(item.text);
  if (item.text && index < 0) index = texts.push(item.text) - 1;
  return { n: item.name, v: item.version, l: item.license, t: item.text ? index : -1 };
});
writeFileSync(join(root, 'src', 'legal', 'third-party.json'), `${JSON.stringify({ packages: list, texts })}\n`);
const body = packages.map(item => `${item.name} ${item.version} (${item.license})\n\n${item.text || `License: ${item.license}. No license file was included in the package.`}`).join('\n\n' + '-'.repeat(72) + '\n\n');
writeFileSync(join(root, 'THIRD_PARTY_NOTICES.txt'), `Owllowance includes the following open-source software.\n\n${body}\n`);
console.log(`${packages.length} packages, ${texts.length} distinct license texts`);
if (!existsSync(join(root, 'src', 'legal', 'third-party.json'))) process.exit(1);
