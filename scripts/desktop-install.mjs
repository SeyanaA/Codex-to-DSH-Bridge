import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ROOT, home, connectionSettings, settingsPath, readSettings, localAddress, atomicWrite, backup } from './desktop-settings.mjs';
import { buildSessionHub } from './build-session-hub.mjs';
import { installBundledCrew } from './bundled-crew.mjs';
const require = createRequire(import.meta.url);
const YAML = require('../vendor/yaml');
const begin = '# BEGIN codex-desktop-bridge';
const end = '# END codex-desktop-bridge';
const policyStart = '<!-- codex-desktop-bridge -->', policyEnd = '<!-- /codex-desktop-bridge -->';

export function removeOwnedLegacyWebMcp(text, legacyRoot) {
  if (!legacyRoot) return text;
  const start = /^# managed-by: codex-to-dsh-bridge\r?\n\[mcp_servers\.(?:dsh-crew|"dsh-crew"|'dsh-crew')\][^\n]*\n/m.exec(text);
  if (!start) return text;
  const after = start.index + start[0].length;
  const headers = [...text.slice(after).matchAll(/^\[([^\n]+)\].*$/gm)];
  const next = headers.find(match => !/^mcp_servers\.(?:dsh-crew|"dsh-crew"|'dsh-crew')\./.test(match[1]));
  let stop = next ? after + next.index : text.length;
  // A following managed section's BEGIN/comment belongs to that section,
  // even though TOML permits it between this table's final key and the next.
  const trailing = text.slice(after, stop).match(/(?:\r?\n[ \t]*(?:#[^\r\n]*)?)+$/);
  if (trailing) stop -= trailing[0].length;
  if (!text.slice(after, stop).includes(JSON.stringify(path.join(legacyRoot, 'scripts/mcp.mjs')))) return text;
  return text.slice(0, start.index) + text.slice(stop);
}

export function mcpConfiguration(old, block, adopt = false) {
  const from = old.indexOf(begin), to = old.indexOf(end);
  if ((from >= 0) !== (to >= 0) || (from >= 0 && (to < from || old.indexOf(begin, from + begin.length) >= 0 || old.indexOf(end, to + end.length) >= 0))) throw new Error('MCP 配置标记不完整或顺序异常，请先检查备份。');
  if (from >= 0) return old.slice(0, from) + block + old.slice(to + end.length);
  const root = /^\[mcp_servers\.(?:dsh_desktop_crew|"dsh_desktop_crew"|'dsh_desktop_crew')\][ \t]*(?:#.*)?$/m.exec(old);
  if (root) {
    if (!adopt) throw new Error('已有手工注册的 dsh_desktop_crew；已保留。确认要迁移时，重新运行 install --adopt-existing。');
    const headers = [...old.slice(root.index + root[0].length).matchAll(/^\[([^\n]+)\].*$/gm)];
    const next = headers.find(m => !/^mcp_servers\.(?:dsh_desktop_crew|"dsh_desktop_crew"|'dsh_desktop_crew')\./.test(m[1]));
    const stop = next ? root.index + root[0].length + next.index : old.length;
    return old.slice(0, root.index) + block + '\n' + old.slice(stop);
  }
  return old.trimEnd() + '\n\n' + block + '\n';
}

export function profilePatch(text, moduleFile, port, removeLegacyPort = false) {
  const document = YAML.parseDocument(text || '[]', { logLevel: 'silent' });
  if (document.errors.length || !YAML.isSeq(document.contents)) throw new Error('Desktop cordis.patch.yml 格式不是列表，未做修改。');
  const rows = document.toJS();
  // Only replace the well-known bridge entry. Preserve other plugins/configs.
  const keep = row => {
    if (!row || typeof row !== 'object') return true;
    // 0.2's owned installer added this exact override. Remove it only when
    // the old ownership record confirms the migration, leaving custom Web
    // settings alone. Desktop IPC itself does not require a Web listener.
    if (removeLegacyPort && row.id === 'webserver' && Object.keys(row).length === 2 && Object.keys(row.config ?? {}).length === 1 && row.config.port === port) return false;
    if (row.id === 'dsh-crew-hub') {
      if (row.name || row.config) throw new Error('Crew 有自定义组件配置，请先检查，未覆盖它。');
      return false;
    }
    if (Array.isArray(row.insert) && row.insert.some(entry => entry.id === 'codex-desktop-session-hub')) {
      if (row.insert.length !== 1 || !/[\\/]crew-session-hub\.mjs$/.test(row.insert[0].name ?? '')) throw new Error('发现不同来源的会话组件，未覆盖。');
      return false;
    }
    return true;
  };
  const retained = rows.filter(keep);
  document.contents.items = document.contents.items.filter((_, index) => retained.includes(rows[index]));
  document.contents.add(document.createNode({ id: 'dsh-crew-hub', disabled: true }));
  document.contents.add(document.createNode({ insert: [{ id: 'codex-desktop-session-hub', name: moduleFile, config: { port } }] }));
  return document.toString();
}

export function delegationPolicy(workspace) {
  return `${policyStart}
## DSH Desktop delegation
Codex owns planning, review, acceptance and integration. Delegate independent, verifiable subtasks when beneficial; send necessary context and allowed files, never credentials or the entire chat.
Use dsh_desktop_crew in Hub mode. The user model is DeepSeek-V41-Flash (deepseek-official/deepseek-flash), tier flash, effort max. Never automatically switch model, lower effort or escalate to Pro.
Pass the exact current CODEX_THREAD_ID as conversation_id on every dispatch; never invent or reuse another chat's ID. Always use cwd ${JSON.stringify(workspace)}. First dispatch creates a session; later turns with that ID and cwd continue it. Different Codex chats must stay separate. Each job has its own result ID. Serialize all writing turns.
For a branch, create a new mapping with its actual new thread ID. When branch-point context is available, write a Markdown handoff containing only that context, decisions, relevant artifacts and pending tasks; have DSH read it. Never import parent messages after the branch point. The bridge does not automatically discover fork metadata or generate this summary itself.
Users view and message tasks inside DSH Desktop. Poll dsh_worker_status and dsh_worker_result, answer questions in a follow-up on the same conversation. Manual Desktop messages cannot wake Codex. A spawn response is not completion. Inspect files and actual command results, independently verify acceptance, then deliberately integrate; do not automatically merge or overwrite the source workspace. Isolate source edits in child worktrees/copies. Do not silently fall back to Web or standalone agents. If Desktop is unavailable, resolve the connection first.
${policyEnd}`;
}

export function installDesktop({ workspace, hub, adopt = false, desktopPath, surface, dshHome, webURL } = {}) {
  const settings = connectionSettings();
  if (surface !== undefined && !['desktop', 'web'].includes(surface)) throw new Error('surface 必须是 desktop 或 web。');
  if (surface) settings.surface = surface;
  if (settings.surface === 'web' && !dshHome && !readSettings()?.dshHome) {
    const previous = path.join(home(), '.codex-to-dsh-bridge/installation.json');
    settings.dshHome = fs.existsSync(previous) ? JSON.parse(fs.readFileSync(previous, 'utf8')).dshHome : path.join(home(), '.dsh-codex-bridge');
  }
  if (dshHome) settings.dshHome = path.resolve(dshHome);
  if (webURL) settings.webURL = localAddress(webURL);
  settings.profile = path.join(settings.dshHome, 'profiles', settings.surface);
  if (hub) settings.hub = localAddress(hub);
  if (workspace) settings.workspace = path.resolve(workspace);
  if (desktopPath) settings.desktopPath = path.resolve(desktopPath);
  const manifest = path.join(settings.profile, 'package.json');
  if (settings.surface === 'web' && !fs.existsSync(manifest)) {
    const template = path.join(ROOT, 'template/web');
    if (fs.existsSync(path.join(template, 'package.json'))) {
      if (fs.existsSync(settings.profile)) throw new Error('Web profile 已存在但缺少 package.json，未覆盖。');
      fs.mkdirSync(path.dirname(settings.profile), { recursive: true });
      const initial = JSON.parse(fs.readFileSync(path.join(template, 'package.json'), 'utf8'));
      if (!Array.isArray(initial?.dsh?.profile?.bundles)) throw new Error('Web 离线模板缺少 bundles，未创建 profile。');
      initial.dsh.profile.bundles = initial.dsh.profile.bundles.filter(name => name !== '@zseven-w/dsh-crew');
      const staging = fs.mkdtempSync(path.join(path.dirname(settings.profile), '.bridge-web-stage-'));
      try {
        fs.cpSync(template, staging, { recursive: true });
        atomicWrite(path.join(staging, 'package.json'), JSON.stringify(initial, null, 2));
        fs.renameSync(staging, settings.profile);
      } finally { fs.rmSync(staging, { recursive: true, force: true }); }
    }
  }
  if (!fs.existsSync(manifest)) throw new Error('请先初始化 DSH ' + settings.surface + ' profile，退出服务后再运行安装与配置。');
  if (settings.surface === 'web') {
    const data = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    const bundles = data?.dsh?.profile?.bundles;
    if (!Array.isArray(bundles) || !bundles.includes('@deepseek-ai/dsh-web-app') || !bundles.includes('@deepseek-ai/dsh-base')) throw new Error('Web profile 缺少 base/web-app bundles，请先恢复完整 profile，未注册 MCP。');
  }
  const directory = path.join(settings.profile, 'codex-bridge');
  const extension = path.join(directory, 'crew-session-hub.mjs');
  const ownerFile = path.join(directory, 'owner.json');
  if (fs.existsSync(extension) && !fs.existsSync(ownerFile)) throw new Error('目标扩展目录不是本程序管理的，未覆盖。');
  if (fs.existsSync(ownerFile) && JSON.parse(fs.readFileSync(ownerFile, 'utf8')).owner !== 'codex-desktop-bridge') throw new Error('扩展所有权不匹配，未覆盖。');
  const crew = installBundledCrew(directory);
  const transport = path.join(directory, 'bridge-transport.mjs');
  const generated = buildSessionHub(crew, undefined, transport);
  const patchFile = path.join(settings.profile, 'cordis.patch.yml');
  const oldOwner = fs.existsSync(ownerFile) ? JSON.parse(fs.readFileSync(ownerFile, 'utf8')) : null;
  const patch = profilePatch(fs.existsSync(patchFile) ? fs.readFileSync(patchFile, 'utf8') : '[]', extension, Number(new URL(settings.hub).port), oldOwner?.version?.startsWith('0.2.'));
  const configFile = path.join(home(), '.codex/config.toml');
  let previous = fs.existsSync(configFile) ? fs.readFileSync(configFile, 'utf8') : '';
  if (settings.surface === 'web') {
    const legacyFile = path.join(home(), '.codex-to-dsh-bridge/installation.json');
    if (fs.existsSync(legacyFile)) previous = removeOwnedLegacyWebMcp(previous, JSON.parse(fs.readFileSync(legacyFile, 'utf8')).root);
  }
  const block = `${begin}\n[mcp_servers.dsh_desktop_crew]\ncommand = ${JSON.stringify(process.execPath)}\nargs = [${JSON.stringify(path.join(ROOT, 'scripts/desktop-mcp.mjs'))}]\nstartup_timeout_sec = 90\ntool_timeout_sec = 120\n[mcp_servers.dsh_desktop_crew.env]\nDSHPLUGIN_CREW_HUB = ${JSON.stringify(settings.hub)}\nDSH_HOME = ${JSON.stringify(settings.dshHome)}\n${end}`;
  const config = mcpConfiguration(previous, block, adopt);
  const policyFile = path.join(home(), '.codex/AGENTS.md');
  const policy = fs.existsSync(policyFile) ? fs.readFileSync(policyFile, 'utf8') : '';
  const start = policy.indexOf(policyStart), stop = policy.indexOf(policyEnd);
  if ((start >= 0) !== (stop >= 0) || (start >= 0 && stop < start)) throw new Error('协作规则标记不完整或顺序异常，请先检查。');
  const newPolicy = settings.surface === 'web' ? delegationPolicy(settings.workspace).replaceAll('Desktop', 'Web').replace('dsh_desktop_crew', 'dsh_desktop_crew (bundled Web surface)').replace('Do not silently fall back to Web or standalone agents.', 'Do not silently fall back to Desktop, legacy Web Crew or standalone agents.') : delegationPolicy(settings.workspace);
  const updatedPolicy = start < 0 ? policy.trimEnd() + '\n\n' + newPolicy + '\n' : policy.slice(0, start) + newPolicy + policy.slice(stop + policyEnd.length);
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const backups = [patchFile, configFile, policyFile, settingsPath(), extension, ownerFile, transport].map(backup).filter(Boolean);
  const originals = new Map([extension, ownerFile, transport, patchFile, configFile, policyFile, settingsPath()].map(file => [file, fs.existsSync(file) ? fs.readFileSync(file) : null]));
  try {
    atomicWrite(extension, generated);
    atomicWrite(transport, fs.readFileSync(path.join(ROOT, 'scripts/bridge-transport.mjs')));
    atomicWrite(ownerFile, JSON.stringify({ owner: 'codex-desktop-bridge', version, crew, transport: 'bridge-owned-loopback' }, null, 2));
    atomicWrite(patchFile, patch);
    atomicWrite(configFile, config);
    atomicWrite(policyFile, updatedPolicy);
    fs.mkdirSync(settings.workspace, { recursive: true });
    atomicWrite(settingsPath(), JSON.stringify({ ...settings, crew, root: ROOT, node: process.execPath, version, installed: new Date().toISOString(), backups }, null, 2));
  } catch (error) {
    const failures = [];
    for (const [file, content] of [...originals].reverse()) {
      try { if (content === null) fs.rmSync(file, { force: true }); else atomicWrite(file, content); }
      catch { failures.push(path.basename(file)); }
    }
    throw new Error('配置未完成，已尝试回退，请保留备份并运行诊断：' + error.message + (failures.length ? '；需检查 ' + failures.join(', ') : ''));
  }
  return { version, workspace: settings.workspace, hub: settings.hub, backups };
}

export function uninstallDesktop() {
  const saved = readSettings();
  if (!saved || saved.root !== ROOT) return { removed: false };
  const config = path.join(home(), '.codex/config.toml');
  let removed = false;
  if (fs.existsSync(config)) {
    const old = fs.readFileSync(config, 'utf8'), start = old.indexOf(begin), stop = old.indexOf(end);
    if (start >= 0 && stop > start && old.slice(start, stop).includes(JSON.stringify(path.join(ROOT, 'scripts/desktop-mcp.mjs')))) {
      backup(config); atomicWrite(config, old.slice(0, start) + old.slice(stop + end.length));
      removed = true;
    }
  }
  const policy = path.join(home(), '.codex/AGENTS.md');
  if (removed && fs.existsSync(policy)) {
    const text = fs.readFileSync(policy, 'utf8'), start = text.indexOf(policyStart), stop = text.indexOf(policyEnd);
    if (start >= 0 && stop > start) { backup(policy); atomicWrite(policy, text.slice(0, start) + text.slice(stop + policyEnd.length)); }
  }
  // Durable Desktop extension/history stays in the profile, independent of app files.
  return { removed, preserved: ['Desktop profile', 'credentials', 'sessions', 'backups'] };
}
