import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { installDesktop, mcpConfiguration, profilePatch, uninstallDesktop, removeOwnedLegacyWebMcp } from '../scripts/desktop-install.mjs';
import { localAddress } from '../scripts/desktop-settings.mjs';
import { buildSessionHub } from '../scripts/build-session-hub.mjs';
const require = createRequire(import.meta.url), YAML = require('../vendor/yaml');
const originalCrew = fileURLToPath(new URL('../release-build/windows-preview.2/app/payload/vendor/crew/', import.meta.url));

test('MCP upgrade preserves unrelated servers, handles nested env and requires adoption', () => {
  const old = '[settings]\nname="keep"\n[mcp_servers.other]\ncommand="keep"\n[mcp_servers.dsh_desktop_crew]\ncommand="old"\n[mcp_servers.dsh_desktop_crew.env]\nOLD="value"\n[mcp_servers.final]\ncommand="last"\n';
  assert.throws(() => mcpConfiguration(old, 'NEW'), /手工注册/);
  const updated = mcpConfiguration(old, 'NEW', true);
  assert(updated.includes('[mcp_servers.other]')); assert(updated.includes('[mcp_servers.final]'));
  assert(!updated.includes('OLD=')); assert(!updated.includes('command="old"'));
  assert.throws(() => mcpConfiguration('# BEGIN codex-desktop-bridge', 'NEW'), /标记不完整/);
  assert.throws(() => mcpConfiguration('# END codex-desktop-bridge\nkeep=1\n# BEGIN codex-desktop-bridge', 'NEW'), /顺序异常/);
});

test('Windows spaces/backslashes and unrelated Desktop plugin settings are preserved', () => {
  const module = 'C:\\Users\\姓名 A\\.dsh\\profiles\\desktop\\codex-bridge\\crew-session-hub.mjs';
  const updated = YAML.parse(profilePatch('- id: whale\n  config:\n    enabled: true\n', module, 19387));
  assert.deepEqual(updated[0], { id: 'whale', config: { enabled: true } });
  assert.equal(updated.find(r => r.insert)?.insert[0].name, module);
  assert.equal(updated.find(r => r.id === 'dsh-crew-hub').disabled, true);
  const independent = YAML.parse(profilePatch('- id: webserver\n  config:\n    port: 19400\n', module, 19387));
  assert.equal(independent.find(r => r.id === 'webserver').config.port, 19400);
  assert.equal(independent.find(r => r.insert).insert[0].config.port, 19387);
  const legacy = '- id: webserver\n  config:\n    port: 19387\n';
  assert(YAML.parse(profilePatch(legacy, module, 19387)).some(row => row.id === 'webserver'));
  assert(!YAML.parse(profilePatch(legacy, module, 19387, true)).some(row => row.id === 'webserver'));
  assert.throws(() => localAddress('http://127.0.0.1:19387/?token=secret'));
  assert.throws(() => localAddress('http://example.com:19387'));
  const dynamic = profilePatch('# preserve comment\n- id: dynamic\n  config:\n    path: !!js ctx.workspace.path\n', module, 19387);
  assert(dynamic.includes('!!js')); assert(dynamic.includes('preserve comment'));
});

test('Web migration removes only a legacy MCP registration with matching ownership and path', () => {
  const root = path.resolve('old install');
  const old = '# managed-by: codex-to-dsh-bridge\n[mcp_servers.dsh-crew]\nargs = [' + JSON.stringify(path.join(root, 'scripts/mcp.mjs')) + ']\n[mcp_servers.dsh-crew.env]\nX="keep private"\n[mcp_servers.other]\ncommand="keep"\n';
  assert.equal(removeOwnedLegacyWebMcp(old, root).trimStart(), '[mcp_servers.other]\ncommand="keep"\n');
  const adjacent = old.replace('[mcp_servers.other]', '# BEGIN codex-desktop-bridge\n[mcp_servers.other]') + '# END codex-desktop-bridge\n';
  const migrated = removeOwnedLegacyWebMcp(adjacent, root);
  assert(migrated.includes('# BEGIN codex-desktop-bridge'));
  assert.doesNotThrow(() => mcpConfiguration(migrated, 'replacement'));
  assert.equal(removeOwnedLegacyWebMcp(old, path.resolve('another app')), old);
  assert.equal(removeOwnedLegacyWebMcp(old.replace('# managed-by: codex-to-dsh-bridge\n', ''), root), old.replace('# managed-by: codex-to-dsh-bridge\n', ''));
});

test('isolated install, repeat install and migration preserve configs and never copy credentials', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-install-'));
  const oldHome = process.env.CODEX_DSH_BRIDGE_TEST_HOME, oldDsh = process.env.DSH_HOME;
  process.env.CODEX_DSH_BRIDGE_TEST_HOME = temporary; delete process.env.DSH_HOME;
  try {
    const profile = path.join(temporary, '.dsh/profiles/desktop');
    fs.mkdirSync(profile, { recursive: true });
    fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['whale'] } } }));
    fs.writeFileSync(path.join(profile, 'cordis.patch.yml'), '- id: whale\n  config: {enabled: true}\n');
    const codex = path.join(temporary, '.codex'); fs.mkdirSync(codex);
    fs.writeFileSync(path.join(codex, 'config.toml'), '[mcp_servers.other]\ncommand="keep"\n');
    fs.writeFileSync(path.join(codex, 'AGENTS.md'), 'Keep these instructions.\n');
    fs.writeFileSync(path.join(temporary, '.dsh/credentials.json'), 'PRIVATE-MARKER');
    const first = installDesktop(); const second = installDesktop();
    assert.equal(first.workspace, second.workspace);
    const config = fs.readFileSync(path.join(codex, 'config.toml'), 'utf8');
    assert(config.includes('command="keep"')); assert.equal(config.match(/\[mcp_servers.dsh_desktop_crew\]/g).length, 1);
    const patch = YAML.parse(fs.readFileSync(path.join(profile, 'cordis.patch.yml'), 'utf8'));
    assert.deepEqual(patch[0], { id: 'whale', config: { enabled: true } });
    const generated = fs.readFileSync(path.join(profile, 'codex-bridge/crew-session-hub.mjs'), 'utf8');
    assert(!generated.includes('__CREW_SRC_URL__')); assert(!generated.includes('PRIVATE-MARKER'));
    assert(generated.includes('/codex-bridge/crew-rc14-'));
    assert(!generated.includes('/node_modules/@zseven-w/'));
    assert(!fs.existsSync(path.join(profile, 'node_modules/@zseven-w/dsh-crew')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(profile, 'package.json'))).dsh.profile.bundles, ['whale']);
    assert(fs.existsSync(path.join(profile, 'codex-bridge/bridge-transport.mjs')));
    assert(fs.readdirSync(codex).some(name => name.includes('backup')));
    assert(uninstallDesktop().removed); assert(fs.existsSync(path.join(profile, 'codex-bridge/crew-session-hub.mjs')));
    assert(!fs.readFileSync(path.join(codex, 'config.toml'), 'utf8').includes('[mcp_servers.dsh_desktop_crew]'));
    assert(fs.readFileSync(path.join(codex, 'config.toml'), 'utf8').includes('command="keep"'));
    assert.equal(fs.readFileSync(path.join(codex, 'AGENTS.md'), 'utf8').trim(), 'Keep these instructions.');
  } finally {
    if (oldHome === undefined) delete process.env.CODEX_DSH_BRIDGE_TEST_HOME; else process.env.CODEX_DSH_BRIDGE_TEST_HOME = oldHome;
    if (oldDsh === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldDsh;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test('builder rejects an upstream source mismatch', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-version-'));
  try {
    fs.mkdirSync(path.join(temporary, 'src/hub'), { recursive: true }); fs.writeFileSync(path.join(temporary, 'src/hub/index.mjs'), 'changed');
    assert.throws(() => buildSessionHub(temporary), /版本/);
  } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
});

test('explicit Web install targets the existing Web profile with Crew disabled', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bridge-web-'));
  const oldHome = process.env.CODEX_DSH_BRIDGE_TEST_HOME, oldDsh = process.env.DSH_HOME;
  process.env.CODEX_DSH_BRIDGE_TEST_HOME = temporary; delete process.env.DSH_HOME;
  try {
    const data = path.join(temporary, 'Web 数据');
    const profile = path.join(data, 'profiles/web'); fs.mkdirSync(profile, { recursive: true });
    const manifest = JSON.stringify({ dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } } });
    fs.writeFileSync(path.join(profile, 'package.json'), manifest);
    installDesktop({ surface: 'web', dshHome: data, webURL: 'http://127.0.0.1:3083' });
    const saved = JSON.parse(fs.readFileSync(path.join(temporary, '.codex-to-dsh-bridge/desktop.json'), 'utf8'));
    assert.equal(saved.surface, 'web'); assert.equal(saved.profile, profile);
    assert.equal(saved.webURL, 'http://127.0.0.1:3083');
    assert.equal(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'), manifest);
    assert(fs.existsSync(path.join(profile, 'codex-bridge/crew-session-hub.mjs')));
    assert(!fs.existsSync(path.join(data, 'profiles/desktop')));
    assert(uninstallDesktop().removed);
    assert.equal(fs.readFileSync(path.join(profile, 'package.json'), 'utf8'), manifest);
    fs.writeFileSync(path.join(profile, 'package.json'), '{}');
    assert.throws(() => installDesktop({ surface: 'web', dshHome: data }), /缺少 base\/web-app/);
  } finally {
    if (oldHome === undefined) delete process.env.CODEX_DSH_BRIDGE_TEST_HOME; else process.env.CODEX_DSH_BRIDGE_TEST_HOME = oldHome;
    if (oldDsh === undefined) delete process.env.DSH_HOME; else process.env.DSH_HOME = oldDsh;
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});
