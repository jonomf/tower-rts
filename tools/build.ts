// Production build: typecheck + compile src/ to dist/js/ with tsc, then copy public/ into dist/.
// No bundler: the browser loads native ES modules.
import { spawnSync, execSync } from 'node:child_process';
import { cpSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const TSC = require.resolve('typescript/bin/tsc');

export function buildId(): string {
  let build = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
  if (!build) {
    try {
      build = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    } catch {
      build = 'dev';
    }
  }
  return build;
}

/** Copy public/ into dist/ and stamp the build id. `jsDir` is where index.html loads the compiled modules from. */
export function copyPublic(jsDir = 'js'): void {
  cpSync('public', 'dist', { recursive: true });
  const build = buildId();
  const html = readFileSync('dist/index.html', 'utf8')
    .replaceAll('__BUILD__', build)
    .replace('src="js/main.js"', `src="${jsDir}/main.js"`)
    .replace('href="style.css"', `href="style.css?v=${build}"`);
  writeFileSync('dist/index.html', html);
}

if (import.meta.main) {
  rmSync('dist', { recursive: true, force: true });
  const r = spawnSync(process.execPath, [TSC, '-p', 'tsconfig.json'], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  // GitHub Pages lets browsers cache files for 10 minutes. Put the modules under a per-build folder so a
  // new index.html never runs with last deploy's cached scripts (their relative imports follow along).
  const jsDir = `js-${buildId()}`;
  renameSync('dist/js', `dist/${jsDir}`);
  copyPublic(jsDir);
  console.log('built dist/');
}
