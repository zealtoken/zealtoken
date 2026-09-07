#!/usr/bin/env python3
"""Monitor the two remaining local services; no signing or automatic transfers."""
import json,pathlib,subprocess,sys,os,re,runpy
ROOT=pathlib.Path(__file__).resolve().parents[1]
os.environ['PATH']=str(pathlib.Path.home()/'.local/bin')+':/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin'
config=json.loads((ROOT/'launchd/email-config.json').read_text())
problems={}
payer_migrated=(ROOT/'launchd/cloud-fulfiller-migrated.json').exists()
burn_migrated=(ROOT/'launchd/cloud-burner-migrated.json').exists()
for job in ([ ] if burn_migrated else ['burn'])+([] if payer_migrated else ['desk-pay']):
 r=subprocess.run(['launchctl','list','com.zealtoken.'+job],capture_output=True,text=True)
 m=re.search(r'"LastExitStatus"\s*=\s*(-?\d+)',r.stdout)
 if r.returncode or (m and int(m.group(1))!=0):
  problems[job]='Laptop '+job+' is stopped or failed. Check '+str(ROOT/'launchd'/((job if job!='desk-pay' else 'desk-pay')+'.log'))
  log=ROOT/'launchd'/(job+'.log')
  if log.exists():
   lines=log.read_text(errors='replace').splitlines()[-20:]
   selected=[l for l in lines if any(x in l for x in ['TOP UP','FAILED','PENDING','above the automatic cap'])]
   if selected:problems[job]+='\n'+'\n'.join(selected[-3:])
burnlog=ROOT/'launchd/burn.log'
if not burn_migrated and (not burnlog.exists() or __import__('time').time()-burnlog.stat().st_mtime>108000):problems['burn-stale']='The daily burn job has not updated its log in 30 hours. Check the laptop scheduler.'
if not payer_migrated:
 # A stalled payer can retain its previous exit status while still running.
 log=ROOT/'launchd/desk-pay.log'
 if not log.exists() or __import__('time').time()-log.stat().st_mtime>1200:problems['payer-stale']='Laptop redemption payer has not updated its log in 20 minutes.'
 try:
  env={}
  for line in (ROOT/'.env').read_text().splitlines():
   if '=' in line and not line.startswith('#'):
    k,v=line.split('=',1);env[k]=v.strip().strip('"\'')
  binary=env.get('ZINGO_CLI',str(pathlib.Path.home()/'.cargo/bin/zingo-cli'))
  r=subprocess.run([binary,'--data-dir',str(ROOT/'.float'),'balance'],capture_output=True,text=True,timeout=60)
  if r.returncode:raise RuntimeError()
  def amount(key):
   match=re.search(key+r'"?\s*:\s*([\d_]+)',r.stdout)
   return int(match.group(1).replace('_','')) if match else None
  balances=[amount('confirmed_'+pool+'_balance') for pool in ['sapling','orchard','ironwood']]
  if all(x is None for x in balances):raise RuntimeError()
  balance=sum(x or 0 for x in balances)
  if balance<6000000:problems['float-low']=f'Zcash redemption hot float has {balance/1e8:.8f} ZEC in its last synced spendable balance, below 0.06 ZEC. Top up the redemption FLOAT wallet; this is separate from the backing reserve.'
 except Exception:problems['float-monitor']='Unable to read the local Zcash redemption float. Check the Zingo wallet and balance monitor.'
aws=['aws','--profile','oenbot-operator','--region','us-east-2']
r=subprocess.run(aws+['cloudwatch','put-metric-data','--namespace','ZEAL/Operator','--metric-data',json.dumps([{'MetricName':'LaptopHealthy','Value':0 if problems else 1,'Unit':'Count'}])],capture_output=True,text=True,timeout=45)
if r.returncode:raise SystemExit('Laptop monitoring AWS session unavailable; cloud missing-heartbeat alarm will notify. Run aws sso login --profile oenbot-operator.')
runpy.run_path(str(ROOT/'cloud/email-alerts.py'))['send_alerts'](problems,'laptop',ROOT/'launchd/email-laptop.json',config['ZealAlerts'],'oenbot-operator')
print('Laptop monitoring: '+(', '.join(problems) if problems else 'healthy'))
