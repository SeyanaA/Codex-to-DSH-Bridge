// Distribute the pinned MIT upstream source with the bridge, without enabling
// or resolving the user's separately installed Desktop Crew plugin.
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { ROOT } from './desktop-settings.mjs';

export const archiveSha256 = 'bd8879b0e0e43795bd1ddde491491e6068f4340196064932b5b211db00de80d8';
export function unpackCrew(archive, target) {
  if (createHash('sha256').update(archive).digest('hex') !== archiveSha256) throw new Error('内置 Crew 源码校验失败，未安装。');
  const tar = gunzipSync(archive, { maxOutputLength: 32 * 1024 * 1024 });
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const string = (from, length) => header.subarray(from, from + length).toString().split('\0')[0];
    const name = string(0, 100), prefix = string(345, 155);
    const full = prefix ? prefix + '/' + name : name;
    const size = Number.parseInt(string(124, 12).trim(), 8);
    if (!Number.isSafeInteger(size) || size < 0 || offset + 512 + size > tar.length) throw new Error('内置归档长度无效。');
    if (!full.startsWith('package/') || full.includes('\\') || full.split('/').some(part => part === '..' || part === '.')) throw new Error('内置归档路径无效。');
    if (![0, 48].includes(header[156])) throw new Error('内置归档包含非普通文件，未安装。');
    const file = path.join(target, full.slice('package/'.length));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, tar.subarray(offset + 512, offset + 512 + size), { mode: 0o600 });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
}

export function installBundledCrew(directory) {
  const destination = path.join(directory, 'crew-rc14-' + archiveSha256.slice(0, 12));
  const archive = fs.readFileSync(path.join(ROOT, 'vendor/zseven-w-dsh-crew-0.1.0-rc.14.tgz'));
  // Validate cached content byte-for-byte as well; an existing arbitrary
  // directory must never become trusted merely because its name matches.
  fs.mkdirSync(directory, { recursive: true });
  const staging = fs.mkdtempSync(path.join(directory, '.crew-stage-'));
  try {
    unpackCrew(archive, staging);
    if (fs.existsSync(destination)) {
      const verify = folder => {
        for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
          const source = path.join(folder, item.name), existing = path.join(destination, path.relative(staging, source));
          const stat = fs.lstatSync(existing);
          if (stat.isSymbolicLink()) throw new Error('内置源码缓存含符号链接，未覆盖。');
          if (item.isDirectory()) verify(source);
          else if (!stat.isFile() || !fs.readFileSync(source).equals(fs.readFileSync(existing))) throw new Error('内置源码缓存已被修改，未覆盖。');
        }
      };
      verify(staging);
    } else fs.renameSync(staging, destination);
    return destination;
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
}
