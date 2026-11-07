// Production build: typecheck + compile src/ to dist/js/ with tsc, then copy public/ into dist/.
// No bundler: the browser loads native ES modules.
import { spawnSync, execSync } from 'node:child_process';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const TSC = require.resolve('typescript/bin/tsc');

export function copyPublic(): void {
  cpSync('public', 'dist', { recursive: true });
  let build = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  if (!build) {
    try {
      build = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      build = 'dev';
    }
  }
  const html = readFileSync('dist/index.html', 'utf8').replaceAll('__BUILD__', build);
  writeFileSync('dist/index.html', html);
}

if (import.meta.main) {
  rmSync('dist', { recursive: true, force: true });
  const r = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.json'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  copyPublic();
  console.log('built dist/');
}
