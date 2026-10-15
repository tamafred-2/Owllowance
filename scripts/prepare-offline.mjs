import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('dist');
const files = (await readdir(directory, { recursive: true, withFileTypes: true }))
  .filter(file => file.isFile())
  .map(file => path.relative(directory, path.join(file.parentPath, file.name)).replaceAll('\\', '/'))
  .filter(file => !file.endsWith('.map') && !['sw.js', 'offline-manifest.json'].includes(file))
  .sort();
const hash = createHash('sha256');
for (const file of files) {
  hash.update(file);
  hash.update(await readFile(path.join(directory, file)));
}
const version = hash.digest('hex').slice(0, 16);
await writeFile(path.join(directory, 'offline-manifest.json'), JSON.stringify({ version, files }));
// Updating the worker bytes triggers a new install when the app bundle changes.
const worker = await readFile('public/sw.js', 'utf8');
await writeFile(path.join(directory, 'sw.js'), `// Build ${version}\n${worker}`);
console.log(`Prepared offline cache for ${files.length} application files.`);
