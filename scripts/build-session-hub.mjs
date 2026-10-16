import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const crewHubSha256 = '74161dd07529350c0b101a83a32d19866c4d1576a21be842e3c4b0b3fe763d92';
export function buildSessionHub(crewPackage, templateFile = fileURLToPath(new URL('../extensions/crew-session-hub.template.mjs', import.meta.url))) {
  const original = fs.readFileSync(path.join(crewPackage, 'src/hub/index.mjs'));
  if (createHash('sha256').update(original).digest('hex') !== crewHubSha256) throw new Error('Crew 版本与已验证的 rc.14 不一致，请先核对版本；未修改原插件。');
  const source = fs.readFileSync(templateFile, 'utf8');
  if (!source.includes('__CREW_SRC_URL__')) throw new Error('会话适配模板缺失。');
  return source.replaceAll('__CREW_SRC_URL__', pathToFileURL(path.join(crewPackage, 'src')).href);
}
