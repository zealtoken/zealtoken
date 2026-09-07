#!/usr/bin/env python3
"""Root boot loader for remaining operational credentials; no owner/reserve keys."""
import json,os,pathlib,pwd,subprocess
os.umask(0o077)
c=json.loads(pathlib.Path('/etc/zeal/cloud.json').read_text());base=pathlib.Path('/run/zeal');base.mkdir(mode=0o700,exist_ok=True)
for role in ['fulfiller','burner','floatWallet']:
 key=role[0].upper()+role[1:]+'Secret'
 r=subprocess.run(['/usr/local/bin/aws','secretsmanager','get-secret-value','--region','us-east-2','--secret-id',c[key],'--query','SecretString','--output','text'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if r.returncode:raise SystemExit('Cannot load '+role+' credential')
 secret=json.loads(r.stdout)
 if role=='floatWallet':
  if len(bytes.fromhex(secret['backupKey']))!=32:raise SystemExit('Invalid float backup key')
  p=base/'float-backup';p.write_text(json.dumps(secret));p.chmod(0o600)
 else:
  if not isinstance(secret.get('passphrase'),str) or not isinstance(secret.get('keystore'),dict):raise SystemExit('Invalid role credential')
  p=base/role;p.write_text(json.dumps({'passphrase':secret['passphrase']}));p.chmod(0o600)
  p=pathlib.Path('/var/lib/zeal/runtime/.keys')/(role+'.json');p.write_text(json.dumps(secret['keystore']));p.chmod(0o640);os.chown(p,0,pwd.getpwnam('zeal').pw_gid)
print('Final operational credentials loaded')
