#!/usr/bin/env python3
"""Root-only boot loader; secret values never go to stdout or durable plaintext."""
import json,os,pathlib,subprocess
os.umask(0o077)
config=json.loads(pathlib.Path('/etc/zeal/cloud.json').read_text())
base=pathlib.Path('/run/zeal');base.mkdir(mode=0o700,exist_ok=True)
keys=pathlib.Path('/var/lib/zeal/runtime/.keys'); keys.mkdir(exist_ok=True)
for role in ['keeper','attestor','minter']:
 out=subprocess.run(['/usr/local/bin/aws','secretsmanager','get-secret-value','--region','us-east-2','--secret-id',config[role.title()+'Secret'],'--query','SecretString','--output','text'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if out.returncode: raise SystemExit('Unable to load '+role+' cloud credential')
 secret=json.loads(out.stdout)
 if not isinstance(secret.get('passphrase'),str) or not isinstance(secret.get('keystore'),dict): raise SystemExit('Invalid '+role+' credential')
 p=base/role;p.write_text(json.dumps({'passphrase':secret['passphrase']}));p.chmod(0o600)
 p=keys/(role+'.json');p.write_text(json.dumps(secret['keystore']));p.chmod(0o640)
 import pwd
 os.chown(p,0,pwd.getpwnam('zeal').pw_gid)
print('Operational credentials loaded into protected runtime files')
