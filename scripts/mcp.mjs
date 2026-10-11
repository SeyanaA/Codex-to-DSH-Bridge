import { spawn } from 'node:child_process';
import path from 'node:path';
import { ensureStarted } from './launcher.mjs';
import { ROOT, BASE, redact } from './common.mjs';

try {
  await ensureStarted();
  const child = spawn(process.execPath, [path.join(ROOT, 'vendor', 'crew', 'lib', 'server.mjs')], {
    env: { ...process.env, DSHPLUGIN_CREW_HUB: BASE }, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true,
  });
  process.stdin.pipe(child.stdin);
  child.stdout.pipe(process.stdout);
  child.stderr.on('data', data => process.stderr.write(redact(data)));
  child.on('error', error => { console.error(redact(error.message)); process.exit(1); });
  child.on('exit', code => process.exit(code || 0));
  const stop = () => child.kill('SIGTERM');
  process.on('SIGTERM', stop); process.on('SIGINT', stop); process.stdin.on('end', stop);
} catch (error) { console.error(redact(error.message)); process.exit(1); }
