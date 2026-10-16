import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { installDesktop, mcpConfiguration, profilePatch, uninstallDesktop } from '../scripts/desktop-install.mjs';
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
});

test('Windows spaces/backslashes and unrelated Desktop plugin settings are preserved', () => {
  const module = 'C:\\Users\\姓名 A\\.dsh\\profiles\\desktop\\codex-bridge\\crew-session-hub.mjs';
  const updated = YAML.parse(profilePatch('- id: whale\n  config:\n    enabled: true\n', module, 19387));
  assert.deepEqual(updated[0], { id: 'whale', config: { enabled: true } });
  assert.equal(updated.find(r => r.insert)?.insert[0].name, module);
  assert.equal(updated.find(r => r.id === 'dsh-crew-hub').disabled, true);
  assert.throws(() => profilePatch('- id: webserver\n  config:\n    port: 19400\n', module, 19387), /其他端口/);
  assert.throws(() => localAddress('http://127.0.0.1:19387/?token=secret'));
  assert.throws(() => localAddress('http://example.com:19387'));
  const dynamic = profilePatch('# preserve comment\n- id: dynamic\n  config:\n    path: !!js ctx.workspace.path\n', module, 19387);
  assert(dynamic.includes('!!js')); assert(dynamic.includes('preserve comment'));
});

test('isolated install, repeat install and migration preserve configs and never copy credentials', () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'crew-install-'));
  const oldHome = process.env.CODEX_DSH_BRIDGE_TEST_HOME, oldDsh = process.env.DSH_HOME;
  process.env.CODEX_DSH_BRIDGE_TEST_HOME = temporary; delete process.env.DSH_HOME;
  try {
    const profile = path.join(temporary, '.dsh/profiles/desktop');
    fs.mkdirSync(path.join(profile, 'node_modules/@zseven-w'), { recursive: true });
    fs.symlinkSync(originalCrew, path.join(profile, 'node_modules/@zseven-w/dsh-crew'), 'dir');
    fs.writeFileSync(path.join(profile, 'package.json'), JSON.stringify({ dsh: { profile: { bundles: ['@zseven-w/dsh-crew', 'whale'] } } }));
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
