// Tiny static file server (no deps). Usage: node tools/serve.ts [dir] (PORT env, default 5173).
import { createServer, type Server } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};

export function serve(dir: string, port: number): Server {
  const root = resolve(dir);
  const server = createServer(async (req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = normalize(join(root, url));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  server.listen(port);
  return server;
}

if (import.meta.main) {
  const dir = process.argv[2] ?? 'dist';
  const port = Number(process.env.PORT ?? 5173);
  serve(dir, port);
  console.log(`serving ${dir} at http://localhost:${port}`);
}
