#!/usr/bin/env python3
import json,os,pathlib
if not pathlib.Path('/etc/zeal/WRAP_INTERIM_TEST').exists():raise SystemExit('Test gate missing')
env=dict(os.environ)
for role in ['minter','attestor']:
 s=json.loads((pathlib.Path(env['CREDENTIALS_DIRECTORY'])/role).read_text())
 env[role.upper()+'_PASS']=s['passphrase']
os.execve('/usr/local/bin/node',['node','--import','tsx','src/wrap-interim-test.ts','--execute'],env)
