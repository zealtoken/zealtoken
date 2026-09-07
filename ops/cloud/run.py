#!/usr/bin/env python3
"""Unprivileged systemd entry point. Credentials are provided by LoadCredential."""
import json, os, pathlib, subprocess, sys
JOBS = {
 'wrap': ('wrap.ts', [], ['minter','attestor']),
 'keeper': ('keeper.ts', ['--execute', '--daemon'], ['keeper']),
 'attest': ('attest.ts', [], ['attestor']),
 'replenish': ('replenish.ts', ['--execute'], ['keeper','attestor','minter']),
 'lp-capital-fund': ('lp-capital-fund.ts', [], ['keeper']),
 'lp-reinvest': ('lp-reinvest.ts', ['--execute'], ['keeper']),
 'burn': ('burn.ts', ['--execute'], ['burner']),
 'desk-pay': ('desk-pay.ts', [], ['fulfiller']),
 'roles': ('watch-roles.ts', [], []),
 'desk-watch': ('desk-watch.ts', [], []),
}
job=sys.argv[1]
file,args,roles=JOBS[job]
env=dict(os.environ)
for key in list(env):
 if key.endswith(('_PASS','_KEY')): del env[key]
if roles:
 if not pathlib.Path('/etc/zeal/ACTIVE').is_file(): raise SystemExit('Cloud signing is not activated')
 for role in roles:
  path=pathlib.Path(env['CREDENTIALS_DIRECTORY']) / role
  secret=json.loads(path.read_text())
  env[role.upper()+'_PASS']=secret['passphrase']
env['REFILL_ENABLED']='1'
if job=='wrap':
 if not pathlib.Path('/etc/zeal/WRAP_ACTIVE').is_file(): raise SystemExit('Wrapping is not activated')
 env['WRAP_FULFILL']='1'
if job=='keeper': env['ZEAL_CLOUD_KEEPER']='1'
# No shell or secret arguments. Replace this process so systemd observes the actual job.
os.execve('/usr/local/bin/node',['node','--import','tsx','src/'+file,*args],env)
