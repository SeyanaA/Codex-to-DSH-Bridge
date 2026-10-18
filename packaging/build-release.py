#!/usr/bin/env python3
"""Build Mac DMG and Windows EXE from one shared Desktop payload.

Windows keeps the checksum-verified offline runtime of the user's previous
release. Its legacy Web setup remains explicit and separate from Desktop.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
VERSION = json.loads((ROOT / 'package.json').read_text())['version']
DIST = ROOT / 'dist'
STAGE = Path(tempfile.mkdtemp(prefix='codex-dsh-release-'))
DIST.mkdir(exist_ok=True)
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--previous-runtime', type=Path, default=DIST / 'previous/extracted')
parser.add_argument('--platform', choices=['all', 'mac', 'windows'], default='all')
args = parser.parse_args()

def run(*items):
    subprocess.run([str(i) for i in items], check=True, cwd=ROOT)

def sha(file):
    h = hashlib.sha256()
    with file.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''): h.update(chunk)
    return h.hexdigest()

def payload(target):
    target.mkdir(parents=True, exist_ok=True)
    for directory in ['scripts', 'extensions', 'support']:
        shutil.copytree(ROOT / directory, target / directory,
            ignore=shutil.ignore_patterns('__pycache__', 'crew-session-hub.mjs'), dirs_exist_ok=True)
    (target / 'vendor').mkdir()
    shutil.copytree(ROOT / 'vendor/yaml', target / 'vendor/yaml')
    shutil.copy2(ROOT / 'vendor/zseven-w-dsh-crew-0.1.0-rc.14.tgz', target / 'vendor')
    for name in ['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'RELEASE_NOTES.md']:
        shutil.copy2(ROOT / name, target / name)
    shutil.copytree(ROOT / 'docs', target / 'docs', ignore=shutil.ignore_patterns('*-result.json'))

artifacts = []
if args.platform in ['all', 'mac']:
    app = STAGE / 'mac/Codex-to-DSH Bridge.app'
    contents = app / 'Contents'
    resources = contents / 'Resources'
    binaries = contents / 'MacOS'
    binaries.mkdir(parents=True)
    payload(resources / 'payload')
    for action in ['install', 'start', 'open', 'stop', 'doctor']:
        command = resources / (action + '.command')
        command.write_text('''#!/bin/zsh -l
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "${0:A:h}/payload" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print '请先安装 Node.js 24+，再运行本程序。'
else
  node scripts/desktop-launcher.mjs ACTION
fi
print '\n操作结束，可以关闭这个终端窗口。'
read -k 1 '?按任意键结束…'
'''.replace('ACTION', action))
        command.chmod(0o755)
    info = dict(CFBundleExecutable='BridgeLauncher', CFBundleName='Codex-to-DSH Bridge',
        CFBundleIdentifier='com.seyana.codex-to-dsh-bridge', CFBundlePackageType='APPL',
        CFBundleShortVersionString=VERSION.split('-')[0], CFBundleVersion='301', LSMinimumSystemVersion='12.0',
        NSHighResolutionCapable=True, NSHumanReadableCopyright='SeyanaA; Crew © ZSeven-W, MIT')
    (contents / 'Info.plist').write_bytes(plistlib.dumps(info))
    for arch in ['arm64', 'x86_64']:
        run('/usr/bin/clang', '-fobjc-arc', '-arch', arch, '-mmacosx-version-min=12.0',
            '-framework', 'Cocoa', ROOT / 'packaging/mac/App.m', '-o', STAGE / ('launcher-' + arch))
    run('/usr/bin/lipo', '-create', STAGE / 'launcher-arm64', STAGE / 'launcher-x86_64', '-output', binaries / 'BridgeLauncher')
    run('/usr/bin/xattr', '-cr', app)
    run('/usr/bin/codesign', '--force', '--sign', '-', app)
    run('/usr/bin/codesign', '--verify', '--deep', '--strict', app)
    image = STAGE / 'dmg'; image.mkdir()
    shutil.copytree(app, image / app.name)
    os.symlink('/Applications', image / 'Applications')
    shutil.copy2(ROOT / 'README.md', image / '使用说明.md')
    shutil.copy2(ROOT / 'RELEASE_NOTES.md', image / 'RELEASE_NOTES.md')
    shutil.copytree(ROOT / 'docs', image / 'docs')
    output = DIST / f'Codex-to-DSH-Bridge-{VERSION}-mac-universal.dmg'
    run('/usr/bin/hdiutil', 'create', '-ov', '-volname', 'Codex-to-DSH Bridge', '-srcfolder', image, '-format', 'UDZO', output)
    artifacts.append(output)

if args.platform in ['all', 'windows']:
    previous = args.previous_runtime
    old_manifest = json.loads((previous / 'build-manifest.json').read_text())
    archive = previous / 'bridge-runtime.tar.gz'
    if sha(archive) != old_manifest['archive']['sha256']: raise RuntimeError('Previous runtime checksum mismatch')
    stage = STAGE / 'windows'; stage.mkdir()
    payload(stage / 'payload')
    # Preserve the released Windows-specific offline Web installer/host logic.
    windows_source = ROOT / 'release-build/windows-preview.2/app'
    for file in (windows_source / 'payload/scripts').glob('*.mjs'):
        shutil.copy2(file, stage / 'payload/scripts' / file.name)
    shutil.copy2(ROOT / 'scripts/mcp.mjs', stage / 'payload/scripts/mcp.mjs')
    for file in [stage / 'payload/scripts/launcher.mjs']:
        source = file.read_text().replace("const VERSION = '0.1.0-preview.2';", "const VERSION = '" + VERSION + "';")
        file.write_text(source)
    shutil.copytree(previous / 'runtime', stage / 'runtime')
    shutil.copy2(archive, stage / archive.name)
    sbom = json.loads((previous / 'SBOM.json').read_text())
    (stage / 'SBOM.json').write_text(json.dumps({'previousReleaseRuntime': sbom,
        'bridge': {'version': VERSION, 'sessionExtension': 'derived from Crew rc.14',
                   'yaml': json.loads((ROOT / 'vendor/yaml/package.json').read_text())['version'],
                   'yamlLicense': 'MIT', 'sharedDesktopScripts': 'payload/scripts'}}, indent=2) + '\n')
    for file in ['README.md', 'THIRD_PARTY_NOTICES.md', 'RELEASE_NOTES.md']:
        shutil.copy2(ROOT / file, stage / file)
    shutil.copytree(ROOT / 'docs', stage / 'docs')
    shutil.copy2(ROOT / 'packaging/windows/run.cmd', stage / 'run.cmd')
    manifest = {**old_manifest, 'version': VERSION, 'defaultMode': 'desktop',
        'desktopApplication': 'User-installed DeepSeek Harness Desktop',
        'model': 'deepseek-official/deepseek-flash', 'effort': 'max',
        'windowsNativeValidation': 'Not run on this Mac',
        'archive': old_manifest['archive']}
    (stage / 'build-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
    output = DIST / f'Codex-to-DSH-Bridge-{VERSION}-windows-x64-setup.exe'
    run('makensis', '-INPUTCHARSET', 'UTF8', '-V2', '-DOUTPUT=' + str(output), '-DSTAGING=' + str(stage), ROOT / 'packaging/windows/installer.nsi')
    artifacts.append(output)

# The same Desktop files, byte for byte, are used by both packages.
shared = ['desktop-mcp.mjs', 'desktop-settings.mjs', 'desktop-install.mjs', 'desktop-runtime.mjs',
          'desktop-launcher.mjs', 'session-proxy.mjs', 'session-id.mjs', 'model-policy.mjs', 'build-session-hub.mjs', 'bundled-crew.mjs', 'bridge-transport.mjs']
parity = {}
for name in shared:
    values = []
    for location in [STAGE / 'windows/payload', STAGE / 'mac/Codex-to-DSH Bridge.app/Contents/Resources/payload']:
        if location.exists(): values.append(sha(location / 'scripts' / name))
    if len(set(values)) > 1: raise RuntimeError('Mac/Windows payload mismatch: ' + name)
    parity[name] = values[0]

# Only repository source, excluding previous build payloads, runtime data and local sessions.
source = DIST / f'Codex-to-DSH-Bridge-{VERSION}-sources.zip'
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED) as zipfile_out:
    for directory in ['scripts', 'extensions', 'packaging', 'tests', 'docs', 'support', 'vendor']:
        for file in sorted((ROOT / directory).rglob('*')):
            if not file.is_file() or '__pycache__' in file.parts or file.name == 'crew-session-hub.mjs': continue
            if directory == 'vendor' and file.relative_to(ROOT / directory).parts[0] == 'crew': continue
            zipfile_out.write(file, str(Path('Codex-to-DSH-Bridge') / file.relative_to(ROOT)))
    # The small public pinned Crew source is needed by prepare-tests, not its dependencies.
    prefix = Path('release-build/windows-preview.2/app/payload/vendor/crew')
    for file in (ROOT / prefix).rglob('*'):
        if file.is_file() and 'node_modules' not in file.parts:
            zipfile_out.write(file, str(Path('Codex-to-DSH-Bridge') / file.relative_to(ROOT)))
    for name in ['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'RELEASE_NOTES.md']:
        zipfile_out.write(ROOT / name, 'Codex-to-DSH-Bridge/' + name)
artifacts.append(source)
checksums = {file.name: sha(file) for file in artifacts}
(DIST / 'SHA256SUMS.txt').write_text(''.join(f'{value}  {name}\n' for name, value in checksums.items()))
(DIST / 'local-stage.json').write_text(json.dumps({'staging': str(STAGE)}) + '\n')
record = {'version': VERSION, 'artifacts': checksums,
    'sharedDesktopScripts': parity, 'model': 'deepseek-official/deepseek-flash', 'effort': 'max',
    'windowsNativeTest': False, 'macIntelExecutionTest': False}
(DIST / 'release-build-report.json').write_text(json.dumps(record, indent=2) + '\n')
print(json.dumps(record, indent=2), flush=True)
