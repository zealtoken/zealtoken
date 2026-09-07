import unittest,tempfile,pathlib,runpy,json
from unittest.mock import patch
from types import SimpleNamespace
send=runpy.run_path(str(pathlib.Path(__file__).with_name('email-alerts.py')))['send_alerts']
class Alerts(unittest.TestCase):
 def test_pending_confirmation_keeps_alert_unsent(self):
  with tempfile.TemporaryDirectory() as d,patch('subprocess.run',return_value=SimpleNamespace(returncode=0,stdout=json.dumps({'Subscriptions':[{'Protocol':'email','SubscriptionArn':'PendingConfirmation'}]}))):
   p=pathlib.Path(d)/'state.json';send({'gas':'Gas low'},'test',p,'test-topic');self.assertFalse(p.exists())
 def test_dedup_and_recovery(self):
  published=[]
  def run(args,**kwargs):
   if 'publish' in args:published.append(args);return SimpleNamespace(returncode=0,stdout='{}')
   return SimpleNamespace(returncode=0,stdout=json.dumps({'Subscriptions':[{'Protocol':'email','SubscriptionArn':'arn:test'}]}))
  with tempfile.TemporaryDirectory() as d,patch('subprocess.run',side_effect=run):
   p=pathlib.Path(d)/'state.json'
   send({'gas':'Gas low'},'test',p,'test-topic');send({'gas':'Balance changed but still low'},'test',p,'test-topic');self.assertEqual(len(published),1)
   send({},'test',p,'test-topic');self.assertEqual(len(published),2)
 def test_publish_failure_does_not_suppress_retry(self):
  def run(args,**kwargs):
   return SimpleNamespace(returncode=1 if 'publish' in args else 0,stdout=json.dumps({'Subscriptions':[{'Protocol':'email','SubscriptionArn':'arn:test'}]}))
  with tempfile.TemporaryDirectory() as d,patch('subprocess.run',side_effect=run):
   p=pathlib.Path(d)/'state.json'
   with self.assertRaises(RuntimeError):send({'gas':'Gas low'},'test',p,'test-topic')
   self.assertFalse(p.exists())
if __name__=='__main__':unittest.main()
