#!/usr/bin/env python3
"""Root-only loading into tmpfs; never write reserve credentials into runtime files."""
import json,os,pathlib,subprocess
os.umask(0o077)
if not pathlib.Path('/etc/zeal/RESERVE_ACTIVE').exists():raise SystemExit('Reserve signing is disabled')
c=json.loads(pathlib.Path('/etc/zeal/cloud.json').read_text())
r=subprocess.run(['/usr/local/bin/aws','secretsmanager','get-secret-value','--region','us-east-2','--secret-id',c['ReserveSecret'],'--query','SecretString','--output','text'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
if r.returncode:raise SystemExit('Reserve credential unavailable')
s=json.loads(r.stdout)
if s.get('record',{}).get('address')!='t1UjkXzcEG4krP5hou3Mik4VUZN72i9nJTw' or not isinstance(s.get('passphrase'),str):raise SystemExit('Reserve credential metadata invalid')
p=pathlib.Path('/run/zeal/reserve');p.parent.mkdir(mode=0o700,exist_ok=True);p.write_bytes(r.stdout);p.chmod(0o600)
print('Reserve credential loaded into memory-backed storage')
