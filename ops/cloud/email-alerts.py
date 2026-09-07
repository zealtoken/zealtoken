#!/usr/bin/env python3
"""Shared alert delivery: stable issue keys, six-hour reminders, recovery notices."""
import json,pathlib,subprocess,time

def send_alerts(problems, source, statefile, topic, profile=None):
 args=['aws','--region','us-east-2']
 if profile:args+=['--profile',profile]
 state=pathlib.Path(statefile)
 previous=json.loads(state.read_text()) if state.exists() else {}
 keys=sorted(problems)
 old=previous.get('keys',[])
 if state.exists() and keys==old and (not keys or time.time()-previous.get('sent',0)<21600):return
 # Never mark an alert delivered while the email subscription is unconfirmed.
 subs=subprocess.run(args+['sns','list-subscriptions-by-topic','--topic-arn',topic,'--output','json'],capture_output=True,text=True,timeout=30)
 if subs.returncode:raise RuntimeError('Could not verify alert subscription')
 if not any(s.get('Protocol')=='email' and s.get('SubscriptionArn','').startswith('arn:') for s in json.loads(subs.stdout).get('Subscriptions',[])):
  print('Email confirmation pending; alerts retained for retry');return
 subject='ZEAL '+source+(': action needed' if keys else ': recovered' if previous else ': monitoring enabled')
 body='\n\n'.join(problems[k] for k in keys) if keys else ('Previously reported '+source+' issues have cleared.' if previous else 'ZEAL '+source+' monitoring is enabled. This is a setup confirmation, not an error. You will receive actionable alerts and recovery notices.')
 body+='\n\nAutomated ZEAL monitoring. Never send a seed phrase or private key in response to an alert.'
 result=subprocess.run(args+['sns','publish','--topic-arn',topic,'--subject',subject[:100],'--message',body[:20000]],capture_output=True,text=True,timeout=30)
 if result.returncode:raise RuntimeError('ZEAL email publication failed')
 state.parent.mkdir(parents=True,exist_ok=True)
 temp=state.with_suffix('.tmp');temp.write_text(json.dumps({'keys':keys,'sent':time.time()}));temp.replace(state)
 print('ZEAL alert published: '+source)
