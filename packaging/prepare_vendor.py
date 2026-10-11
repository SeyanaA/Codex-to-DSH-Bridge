#!/usr/bin/env python3
"""Fetch the exact upstream npm package without running lifecycle scripts."""
import base64
import hashlib
from pathlib import Path
import subprocess
import tarfile

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / 'vendor'
VENDOR.mkdir(exist_ok=True)
subprocess.run(['npm', 'pack', '@zseven-w/dsh-crew@0.1.0-rc.14', '--ignore-scripts',
                '--pack-destination', str(VENDOR)], check=True, cwd=ROOT)
archive = VENDOR / 'zseven-w-dsh-crew-0.1.0-rc.14.tgz'
expected = 'UBlgpb1mOHvZjDcO3A+jwB3MQ8rb6ky/N5q4wkonFsGRDrqWbwB5UeICpFNki20ZDC+4jd3V7Tc6w3MjTDaHQA=='
actual = base64.b64encode(hashlib.sha512(archive.read_bytes()).digest()).decode()
if actual != expected:
    raise SystemExit('Upstream package integrity does not match the pinned release.')
with tarfile.open(archive) as source:
    for member in source.getmembers():
        if not member.name.startswith('package/'):
            raise SystemExit('Unexpected upstream archive path.')
        relative = Path(member.name).relative_to('package')
        if member.issym() or member.islnk() or '..' in relative.parts:
            raise SystemExit('Unsafe upstream archive entry.')
        member.name = str(relative)
        source.extract(member, ROOT / 'vendor/crew', filter='data')
print('Pinned upstream package prepared. No Agent or lifecycle tests executed.')
