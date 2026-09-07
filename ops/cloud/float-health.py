#!/usr/bin/env python3
"""Called under wallet-run's lock. Sync and record public balances, never export keys."""
import datetime,json,os,pathlib,re,subprocess
root=pathlib.Path('/var/lib/zeal/runtime')
env={}
for line in (root/'.env').read_text().splitlines():
 if '=' in line and not line.lstrip().startswith('#'):
  k,v=line.split('=',1);env[k.strip()]=v.strip().strip('\"\'')
server=env.get('LIGHTWALLETD','https://zec.rocks:443')
r=subprocess.run(['/usr/local/bin/zingo-cli','--server',server,'--data-dir',str(root/'.float'),'--waitsync','balance'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,timeout=240)
if r.returncode:raise SystemExit('Redemption float wallet sync/balance check failed')
def pick(k):
 m=re.search(k+r'"?\s*:\s*([\d_]+)',r.stdout)
 if not m:raise RuntimeError('Unrecognized Zingo balance output')
 return int(m[1].replace('_',''))
spendable=pick('confirmed_sapling_balance')+pick('confirmed_orchard_balance')+pick('confirmed_ironwood_balance')
state={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'spendableZats':spendable,'transparentZats':pick('confirmed_transparent_balance')}
p=root/'launchd/float-health.json';tmp=p.with_suffix('.tmp');tmp.write_text(json.dumps(state));os.chmod(tmp,0o600);tmp.replace(p)
print('Redemption float spendable: '+str(spendable/1e8)+' ZEC')
if spendable<6_000_000:raise SystemExit('TOP UP THE REDEMPTION FLOAT: spendable balance is below 0.06 ZEC')
