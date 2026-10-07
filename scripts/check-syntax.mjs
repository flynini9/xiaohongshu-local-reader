import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
async function check(dir) {
  for (const entry of await readdir(new URL(dir, new URL('../', import.meta.url)), { withFileTypes: true })) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory()) await check(`${path}/`);
    else if (entry.name.endsWith('.mjs')) {
      const result = spawnSync(process.execPath, ['--check', path], { cwd: root, encoding: 'utf8' });
      if (result.status !== 0) throw new Error(`Syntax check failed: ${path}\n${result.stderr}`);
    }
  }
}
await check('scripts/');
console.log('PASS syntax checks (all scripts/**/*.mjs)');
