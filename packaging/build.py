#!/usr/bin/env python3
"""Build distribution files; never install, start DSH or run model tests."""
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
# Build outside synchronized Documents: file providers may recreate FinderInfo
# after xattr cleanup, preventing macOS application signing.
BUILD = Path(tempfile.mkdtemp(prefix='codex-dsh-build-'))
DIST = ROOT / 'dist'
BUILD.mkdir(exist_ok=True)
DIST.mkdir(exist_ok=True)

def run(*args):
    subprocess.run([str(arg) for arg in args], check=True, cwd=ROOT)

def payload(destination):
    destination.mkdir(parents=True, exist_ok=True)
    for directory in ['scripts', 'vendor', 'support']:
        shutil.copytree(ROOT / directory, destination / directory, dirs_exist_ok=True)
    for filename in ['package.json', 'README.md', 'LICENSE', 'THIRD_PARTY_NOTICES.md']:
        shutil.copy2(ROOT / filename, destination / filename)

app = BUILD / 'mac' / 'Codex-to-DSH Bridge.app'
if app.exists():
    shutil.rmtree(app)
contents = app / 'Contents'
resources = contents / 'Resources'
binaries = contents / 'MacOS'
binaries.mkdir(parents=True)
payload(resources / 'payload')
for action in ['install', 'start', 'open', 'stop', 'doctor']:
    command = resources / f'{action}.command'
    command.write_text(f'''#!/bin/zsh -l
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- "${{0:A:h}}/payload" || exit 1
if ! command -v node >/dev/null 2>&1; then
  print '未找到 Node.js。请先安装 Node.js 24 或更新版本，再打开本程序。'
else
  node scripts/launcher.mjs {action}
fi
print '\n操作结束，可以关闭这个终端窗口。'
read -k 1 '?按任意键结束…'
''')
    command.chmod(0o755)
info = {
    'CFBundleExecutable': 'BridgeLauncher', 'CFBundleName': 'Codex-to-DSH Bridge',
    'CFBundleIdentifier': 'com.seyana.codex-to-dsh-bridge', 'CFBundlePackageType': 'APPL',
    'CFBundleShortVersionString': '0.1.0', 'CFBundleVersion': '1',
    'LSMinimumSystemVersion': '12.0', 'NSHighResolutionCapable': True,
    'NSHumanReadableCopyright': 'SeyanaA; DSH Crew © ZSeven-W, MIT',
}
(contents / 'Info.plist').write_bytes(plistlib.dumps(info))
for architecture in ['arm64', 'x86_64']:
    run('/usr/bin/clang', '-fobjc-arc', '-arch', architecture, '-mmacosx-version-min=12.0',
        '-framework', 'Cocoa', ROOT / 'packaging/mac/App.m', '-o', BUILD / f'launcher-{architecture}')
run('/usr/bin/lipo', '-create', BUILD / 'launcher-arm64', BUILD / 'launcher-x86_64',
    '-output', binaries / 'BridgeLauncher')
run('/usr/bin/xattr', '-cr', app)
run('/usr/bin/codesign', '--force', '--sign', '-', app)
image = BUILD / 'dmg-content'
if image.exists():
    shutil.rmtree(image)
image.mkdir()
shutil.copytree(app, image / app.name)
os.symlink('/Applications', image / 'Applications')
shutil.copy2(ROOT / 'README.md', image / '使用说明.md')
shutil.copy2(ROOT / 'support/problem-report-template.md', image / '问题反馈模板.md')
dmg = DIST / f'Codex-to-DSH-Bridge-{VERSION}-mac-universal.dmg'
if dmg.exists():
    dmg.unlink()
run('/usr/bin/hdiutil', 'create', '-volname', 'Codex-to-DSH Bridge', '-srcfolder', image,
    '-format', 'UDZO', dmg)

windows = BUILD / 'windows'
if windows.exists():
    shutil.rmtree(windows)
payload(windows / 'payload')
shutil.copy2(ROOT / 'packaging/windows/run.cmd', windows / 'run.cmd')
exe = DIST / f'Codex-to-DSH-Bridge-{VERSION}-windows-setup.exe'
run('makensis', f'-DOUTPUT={exe}', f'-DSOURCE={ROOT}', f'-DSTAGING={windows}',
    ROOT / 'packaging/windows/installer.nsi')

source = DIST / f'Codex-to-DSH-Bridge-{VERSION}-source.zip'
with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in sorted(ROOT.rglob('*')):
        relative = file.relative_to(ROOT)
        if relative.parts[0] in {'.git', 'dist', 'build', 'node_modules'} or '.DS_Store' in relative.parts or not file.is_file():
            continue
        archive.write(file, str(Path('Codex-to-DSH-Bridge') / relative))
checksums = {file.name: hashlib.sha256(file.read_bytes()).hexdigest() for file in [dmg, exe, source]}
(DIST / 'SHA256SUMS-local.txt').write_text(''.join(f'{value}  {name}\n' for name, value in checksums.items()))
(DIST / 'SHA256SUMS-mac.txt').write_text(''.join(f'{checksums[file.name]}  {file.name}\n' for file in [dmg, source]))
print(json.dumps({'version': VERSION, 'artifacts': checksums,
    'validation': 'Packaging only. No application, Agent or end-to-end tests run.',
    'release_assets': [dmg.name, source.name, 'SHA256SUMS-mac.txt'],
    'windows': 'Local only; not for this release.'}, indent=2))
