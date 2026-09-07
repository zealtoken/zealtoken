#!/usr/bin/env python3
"""External heartbeat once a minute after activation; contains no wallet secrets."""
import json,pathlib,subprocess,time,re,urllib.request
if not pathlib.Path('/etc/zeal/ACTIVE').is_file():raise SystemExit(0)
uptime=float(pathlib.Path('/proc/uptime').read_text().split()[0])
healthy=True
problems={}
config=json.loads(pathlib.Path('/etc/zeal/cloud.json').read_text())
if not pathlib.Path('/etc/zeal/BURN_ACTIVE').exists() and config.get('BurnerEligibleAt'):
 import datetime
 if time.time()>=datetime.datetime.fromisoformat(config['BurnerEligibleAt'].replace('Z','+00:00')).timestamp():
  healthy=False
  problems['burn-handoff']='The 48-hour burner delay has elapsed. On the laptop run: cd ~/zeal-ops && npm run cloud:finish-burn. This completes the owner-only role change and moves daily burns to AWS.'
jobs={'keeper':120,'attest':25200,'replenish':4200,'roles':900,'desk-watch':900,'backup':7500}
if pathlib.Path('/etc/zeal/PAYOUT_ACTIVE').exists(): jobs.update({'desk-pay':2400,'float-health':2400})
if pathlib.Path('/etc/zeal/BURN_ACTIVE').exists(): jobs['burn']=108000
if pathlib.Path('/etc/zeal/LP_REINVEST_ACTIVE').exists(): jobs['lp-reinvest']=7500
for job,max_age in jobs.items():
 raw=subprocess.check_output(['systemctl','show','zeal-'+job+'.service','--property=ExecMainStatus,ExecMainExitTimestampMonotonic,ExecMainStartTimestampMonotonic,ActiveState'],text=True)
 props=dict(l.split('=',1) for l in raw.splitlines() if '=' in l)
 age=uptime-int(props.get('ExecMainExitTimestampMonotonic','0'))/1e6
 running=props.get('ActiveState')=='activating'
 running_age=uptime-int(props.get('ExecMainStartTimestampMonotonic','0'))/1e6
 if job=='keeper':
  try:
   import datetime
   beat=json.loads(pathlib.Path('/var/lib/zeal/runtime/launchd/keeper-heartbeat.json').read_text())
   if props.get('ActiveState')!='active' or time.time()-datetime.datetime.fromisoformat(beat['at']).timestamp()>120:raise RuntimeError()
  except Exception:
   healthy=False;problems[job]='Cloud keeper is stopped or has not completed a healthy price check in two minutes. Check zeal-keeper.service.'
  continue
 if props.get('ExecMainStatus')!='0' or (running and running_age>max_age) or (not running and age>max_age):
  healthy=False
  problems[job]='Cloud '+job+' failed or stopped completing. Check zeal-'+job+'.service on the ZEAL AWS worker.'
  if job in ['roles','desk-watch']:
   lines=subprocess.check_output(['journalctl','-u','zeal-'+job,'--since','@'+str(int(time.time()-running_age)),'-n','80','--no-pager','-o','cat'],text=True)
   alerts=[line.split('ALERT ',1)[1] for line in lines.splitlines() if 'ALERT ' in line]
   if alerts:
    del problems[job]
    for alert in alerts[-20:]:
     match=re.match(r'(\w+ wallet|(?:DIRECT )?REDEEM #\d+|WRAP #\d+|[^:]+:)',alert)
     key=match.group(0) if match else alert[:60]
     problems[job+':'+key]=alert
if pathlib.Path('/etc/zeal/PAYOUT_ACTIVE').exists():
 try:
  f=json.loads(pathlib.Path('/var/lib/zeal/runtime/launchd/float-health.json').read_text())
  import datetime
  if time.time()-datetime.datetime.fromisoformat(f['at']).timestamp()>2400:raise RuntimeError()
  if f['spendableZats']<6_000_000:
   healthy=False;problems['float-funding']='TOP UP THE REDEMPTION FLOAT: '+str(f['spendableZats']/1e8)+' ZEC spendable; minimum warning level is 0.06 ZEC. The float is separate from the reserve. Send native ZEC to '+config.get('FloatTopupAddress','the redemption float address')+'.'
 except Exception:
  healthy=False;problems['float-state']='Redemption float balance is unavailable; check zeal-float-health.service.'
 try:
  import datetime
  b=json.loads(pathlib.Path('/var/lib/zeal/runtime/launchd/float-backup.json').read_text())
  if time.time()-datetime.datetime.fromisoformat(b['at']).timestamp()>7500:raise RuntimeError()
 except Exception:
  healthy=False;problems['float-backup']='Encrypted redemption wallet backup is missing or stale; check zeal-backup.service.'
try:
 with urllib.request.urlopen('https://zealtoken.com/',timeout=15) as response:
  if response.status!=200:raise RuntimeError()
except Exception:
 healthy=False
 problems['website']='The ZEAL website did not respond successfully from the AWS monitor. Check hosting and DNS.'
subprocess.run(['/usr/local/bin/aws','cloudwatch','put-metric-data','--region','us-east-2','--namespace','ZEAL/Operator','--metric-data',json.dumps([{'MetricName':'Healthy','Value':int(healthy),'Unit':'Count'}])],check=True)
print('ZEAL health: '+('healthy' if healthy else 'attention'))

config=json.loads(pathlib.Path('/etc/zeal/cloud.json').read_text())
if config.get('ZealAlerts'):
 import runpy
 send=runpy.run_path('/var/lib/zeal/runtime/cloud/email-alerts.py')['send_alerts']
 try:
  send(problems,'cloud','/var/lib/zeal/runtime/launchd/email-cloud.json',config['ZealAlerts'])
 except Exception:
  subprocess.run(['/usr/local/bin/aws','cloudwatch','put-metric-data','--region','us-east-2','--namespace','ZEAL/Operator','--metric-data',json.dumps([{'MetricName':'Healthy','Value':0,'Unit':'Count'}])],check=True)
  raise RuntimeError('Email monitor delivery failed; external alarm will detect unhealthy state')
