"""Minimal standard MCP client for the same Desktop-only Crew adapter."""
import json
import os
from pathlib import Path
import queue
import subprocess
import shutil
import threading
import time

ROOT = Path(__file__).resolve().parent.parent
settings = json.loads((Path.home() / '.codex-to-dsh-bridge/desktop.json').read_text())
WORKSPACE = Path(settings['workspace'])

class Client:
    def __init__(self):
        self.process = subprocess.Popen([shutil.which('node') or settings['node'], str(ROOT / 'scripts/desktop-mcp.mjs')],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
            cwd=WORKSPACE, env=os.environ.copy())
        self.replies = queue.Queue(); self.serial = 0
        def read():
            for line in self.process.stdout:
                try: self.replies.put(json.loads(line))
                except ValueError: pass
        threading.Thread(target=read, daemon=True).start()
        threading.Thread(target=lambda: list(self.process.stderr), daemon=True).start()
        self.request('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'Codex session continuity test', 'version': '1'}})
        self.send({'jsonrpc': '2.0', 'method': 'notifications/initialized'})
        tools = self.request('tools/list', {})
        schema = next(t['inputSchema'] for t in tools['tools'] if t['name'] == 'dsh_spawn_worker')
        assert 'conversation_id' in schema['required']
        self.tool('dsh_worker_config', {'mode': 'hub', 'default_tier': 'flash', 'default_effort': 'max', 'tier_policy': 'flash-only', 'flash_provider': 'deepseek-official', 'flash_model': 'deepseek-flash', 'pro_provider': 'deepseek-official', 'pro_model': 'deepseek-flash', 'escalate_on_failure': False})

    def send(self, value):
        self.process.stdin.write(json.dumps(value) + '\n'); self.process.stdin.flush()

    def request(self, method, params):
        self.serial += 1; seq = self.serial
        self.send({'jsonrpc': '2.0', 'id': seq, 'method': method, 'params': params})
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try: reply = self.replies.get(timeout=min(1, deadline-time.monotonic()))
            except queue.Empty:
                if self.process.poll() is not None: raise RuntimeError('MCP exited before replying')
                continue
            if reply.get('id') == seq:
                if 'error' in reply: raise RuntimeError(str(reply['error']))
                return reply['result']
        raise TimeoutError(method)

    def tool(self, name, arguments):
        response = self.request('tools/call', {'name': name, 'arguments': arguments})
        text = '\n'.join(p.get('text', '') for p in response.get('content', []) if p.get('type') == 'text')
        if response.get('isError'): raise RuntimeError(text)
        return json.loads(text)

    def close(self):
        self.process.stdin.close()
        try: self.process.wait(timeout=5)
        except subprocess.TimeoutExpired: self.process.terminate(); self.process.wait(timeout=5)


