#!/usr/bin/env python3
"""Back up ledgers, never signing material; recovery must reconcile chain state."""
import datetime,json,pathlib,subprocess,tarfile,tempfile
config=json.loads(pathlib.Path('/etc/zeal/cloud.json').read_text())
root=pathlib.Path('/var/lib/zeal/runtime')
# Operator JSON writes are atomic. Snapshots may contain pending transactions and
# always require chain reconciliation on restore. A busy keeper must not starve
# the independent redemption wallet backup below.
with tempfile.TemporaryDirectory(prefix='zeal-backup-') as tmp:
 archive=pathlib.Path(tmp)/'ledgers.tar.gz'
 with tarfile.open(archive,'w:gz') as tar:
  for p in [root/'sweeps.json',root/'redemptions.json',root/'desk-ledger.json',*(root/'launchd').glob('*.json')]:
   if p.is_file():tar.add(p,arcname=str(p.relative_to(root)))
 stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
 subprocess.run(['/usr/local/bin/aws','s3','cp',str(archive),'s3://'+config['Bucket']+'/backups/'+stamp+'.tar.gz','--only-show-errors'],check=True)
print('Ledger backup completed')

# Payer, balance sync and wallet backups share this lock. Never copy a wallet mid-write.
if pathlib.Path('/etc/zeal/PAYOUT_ACTIVE').exists():
 import fcntl,os,runpy
 helper=runpy.run_path(str(root/'cloud/float-archive.py'))
 with open('/run/zeal-wallet.lock','r+') as lock:
  fcntl.flock(lock,fcntl.LOCK_EX)
  key=bytes.fromhex(json.loads(pathlib.Path('/run/zeal/float-backup').read_text())['backupKey'])
  encrypted=helper['encrypt'](helper['archive'](root),key)
 with tempfile.TemporaryDirectory(prefix='zeal-float-backup-') as tmp:
  p=pathlib.Path(tmp)/'wallet.enc';p.write_bytes(encrypted)
  stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
  object_key='backups/'+stamp+'-wallet.enc'
  subprocess.run(['/usr/local/bin/aws','s3','cp',str(p),'s3://'+config['Bucket']+'/'+object_key,'--only-show-errors'],check=True)
  state=root/'launchd/float-backup.json';state.write_text(json.dumps({'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'object':object_key}))
 print('Encrypted redemption wallet backup completed')
