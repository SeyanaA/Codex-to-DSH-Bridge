// Explicit legacy Web entry. Desktop is never silently substituted.
import { ensureStarted } from './launcher.mjs';
import { BASE, CONFIG, HOME, readJSON } from './common.mjs';
import path from 'node:path';
try {
  await ensureStarted();
  process.env.DSH_BRIDGE_SURFACE = 'legacy-web';
  process.env.DSHPLUGIN_CREW_HUB = BASE;
  process.env.DSH_HOME = readJSON(CONFIG)?.dshHome || path.join(HOME, '.dsh');
  await import('./desktop-mcp.mjs');
} catch (error) { console.error(error.message); process.exitCode = 1; }
