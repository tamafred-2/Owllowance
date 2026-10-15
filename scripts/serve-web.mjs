import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve('dist');
const port = Number(process.env.PORT || 4173);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css', '.jpg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const server = createServer(async (request, response) => {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Cache-Control', 'no-cache');
  if (request.method !== 'GET' && request.method !== 'HEAD') { response.writeHead(405); response.end(); return; }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let target = path.resolve(root, `.${pathname}`);
    if (target !== root && !target.startsWith(`${root}${path.sep}`)) { response.writeHead(403); response.end(); return; }
    try { if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html'); }
    catch {
      if (path.extname(target)) { response.writeHead(404); response.end(); return; }
      target = path.join(root, 'index.html');
    }
    const content = await readFile(target);
    response.setHeader('Content-Type', types[path.extname(target)] || 'application/octet-stream');
    response.writeHead(200);
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch { response.writeHead(404); response.end('Not found'); }
});
// Local preview only; production hosting must provide HTTPS and these headers.
server.listen(port, '127.0.0.1', () => console.log(`Owllowance preview: http://localhost:${port}`));
