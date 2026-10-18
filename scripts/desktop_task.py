#!/usr/bin/env python3
"""Use the same Desktop MCP adapter when the active Codex tool catalog is stale."""
import argparse
import json
import os
from pathlib import Path
from desktop_mcp_client import Client, WORKSPACE

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('operation', choices=['submit', 'result', 'status', 'cancel'])
parser.add_argument('--task-file', type=Path)
parser.add_argument('--job-id')
parser.add_argument('--tier', choices=['flash', 'pro'], default='flash')
parser.add_argument('--effort', choices=['off', 'high', 'max'], default='max')
parser.add_argument('--wait', type=int, default=0)
args = parser.parse_args()
if args.operation == 'submit':
    if not args.task_file or not args.task_file.is_file(): parser.error('submit requires --task-file')
    key = os.environ.get('CODEX_THREAD_ID')
    if not key: parser.error('Run from the intended Codex chat; CODEX_THREAD_ID is required.')
    task = args.task_file.read_text()
    if not task.strip(): parser.error('Task must not be empty')
    name, payload = 'dsh_spawn_worker', {'conversation_id': key, 'task': task, 'cwd': str(WORKSPACE), 'tier': args.tier, 'effort': args.effort}
elif args.operation == 'status':
    name, payload = 'dsh_worker_status', {}
else:
    if not args.job_id: parser.error('result/cancel requires --job-id')
    if not 0 <= args.wait <= 60: parser.error('--wait must be between 0 and 60 seconds')
    name, payload = ('dsh_worker_result', {'job_id': args.job_id, 'wait_seconds': args.wait}) if args.operation == 'result' else ('dsh_worker_cancel', {'job_id': args.job_id})
client = Client()
try:
    print(json.dumps(client.tool(name, payload), ensure_ascii=False, indent=2), flush=True)
finally:
    client.close()
