import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const installDir=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
fs.writeFileSync(path.join(installDir,'bridge-install.json'),JSON.stringify({product:'codex-to-dsh-bridge',installDir},null,2));
