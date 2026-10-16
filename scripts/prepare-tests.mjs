import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildSessionHub } from './build-session-hub.mjs';
const crew = fileURLToPath(new URL('../release-build/windows-preview.2/app/payload/vendor/crew/', import.meta.url));
fs.mkdirSync(new URL('../extensions/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../extensions/crew-session-hub.mjs', import.meta.url), buildSessionHub(crew));
