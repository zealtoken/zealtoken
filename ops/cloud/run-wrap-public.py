#!/usr/bin/env python3
"""One controlled cloud test transition. No timer or public activation."""
import json,os,pathlib,subprocess,sys
os.umask(0o077)
if not pathlib.Path('/etc/zeal/WRAP_INTERIM_ACTIVE').is_file():raise SystemExit('Controlled test gate missing')
p=pathlib.Path('/run/zeal/wrap-deposit-public')
try:
 r=subprocess.run(['/usr/local/bin/aws','secretsmanager','get-secret-value','--region','us-east-2','--secret-id','arn:aws:secretsmanager:us-east-2:589158200866:secret:zeal/wrap-v2-deposits-fNs1Cq','--query','SecretString','--output','text'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if r.returncode:raise RuntimeError('Deposit credential unavailable')
 p.write_bytes(r.stdout);p.chmod(0o600)
 command=['systemd-run','--setenv=WRAP_INTERIM_RUN_ID='+os.environ['WRAP_INTERIM_RUN_ID'],'--wait','--pipe','--collect','--unit=zeal-wrap-public-step','--property=User=zeal','--property=Group=zeal','--property=WorkingDirectory=/var/lib/zeal/runtime','--property=LoadCredential=deposit:/run/zeal/wrap-deposit-public','--property=LoadCredential=minter:/run/zeal/minter','--property=LoadCredential=attestor:/run/zeal/attestor','--property=NoNewPrivileges=yes','--property=ProtectSystem=strict','--property=ProtectHome=yes','--property=PrivateTmp=yes','--property=ReadWritePaths=/var/lib/zeal/runtime/launchd','--property=IPAddressDeny=169.254.169.254','--property=LimitCORE=0','--property=RuntimeMaxSec=300','/usr/bin/python3','/var/lib/zeal/runtime/cloud/run-wrap-public-worker.py']
 result=subprocess.run(command,check=False)
 if result.returncode:raise RuntimeError('Controlled transition stopped; inspect public state')
except Exception:
 print('Controlled cloud transition did not complete; secret details withheld.',file=sys.stderr);sys.exit(1)
finally:p.unlink(missing_ok=True)
