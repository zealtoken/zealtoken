import pathlib,runpy,unittest
from datetime import datetime
policy=runpy.run_path(str(pathlib.Path(__file__).with_name('alert-policy.py')))
f=policy['actionable']
def funding(amount):return f'KEEPER FUNDING: {amount} ETH remains at 0x19cece80126b79F76D8b8297B876310a56349738; refill preserves 1 ETH plus gas. Add ETH if more refill capacity is needed.'
class Policy(unittest.TestCase):
 def test_funding_boundary(self):
  for amount in ['0.779852178152798866','0.2','1.2']:self.assertEqual(f({'funding':funding(amount)},0),{})
  for amount in ['0.199999999999999999','0.004','0']:self.assertIn('funding',f({'funding':funding(amount)},0))
 def test_exact_upgrade_only_until_eligible(self):
  message=f"ZZEC minter change proposed -> {policy['EXPECTED_MINTER']} (eta {policy['EXPECTED_ETA']})"
  eta=datetime.fromisoformat(policy['EXPECTED_ETA'].replace('Z','+00:00')).timestamp()
  self.assertEqual(f({'role':message},eta-1),{})
  self.assertIn('role',f({'role':message},eta))
  self.assertIn('role',f({'role':message.replace('20:16:37','20:16:38')},0))
  self.assertIn('role',f({'role':message.replace('5B86','5B87')},0))
 def test_other_failures_survive(self):
  problems={'gas':'keeper wallet has 0.003 ETH: top up','reserve':'Reserve backing insufficient','worker':'Cloud keeper failed','unknown':'KEEPER FUNDING: unexpected format'}
  self.assertEqual(f(problems,0),problems)
if __name__=='__main__':unittest.main()
