// Dev loop: tsc --watch into dist/js, public/ re-copied on change, static server on :5173.
// Reload the browser after saving (no HMR).
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { copyPublic, TSC } from './build.ts';
import { serve } from './serve.ts';

copyPublic();
watch('public', { recursive: true }, () => {
  try {
    copyPublic();
  } catch (e) {
    console.error(e);
  }
});
spawn(process.execPath, [TSC, '-p', 'tsconfig.json', '--watch', '--preserveWatchOutput', '--noEmitOnError', 'false'], {
  stdio: 'inherit',
});
const port = Number(process.env.PORT ?? 5173);
serve('dist', port);
console.log(`dev server at http://localhost:${port}`);
