import importlib.util,unittest
spec=importlib.util.spec_from_file_location('p','cloud/alert-persistence.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Persistence(unittest.TestCase):
 def test_brief_failure_never_announced(self):
  visible,state=m.evaluate({'reserve-reimburse':'failed'}, {},0);self.assertEqual(visible,{})
  visible,state=m.evaluate({},state,120);self.assertEqual((visible,state),({},{}))
 def test_persistent_failure_and_stable_recovery(self):
  _,s=m.evaluate({'keeper':'stopped'},{},0)
  v,s=m.evaluate({'keeper':'stopped'},s,299);self.assertFalse(v)
  v,s=m.evaluate({'keeper':'stopped'},s,300);self.assertIn('keeper',v)
  v,s=m.evaluate({},s,360);self.assertIn('keeper',v)
  v,s=m.evaluate({},s,659);self.assertIn('keeper',v)
  v,s=m.evaluate({},s,660);self.assertFalse(v)
 def test_recurrence_during_recovery_keeps_incident(self):
  _,s=m.evaluate({'keeper':'stopped'},{},0);_,s=m.evaluate({'keeper':'stopped'},s,300)
  _,s=m.evaluate({},s,360);v,s=m.evaluate({'keeper':'stopped'},s,400)
  self.assertIn('keeper',v);self.assertNotIn('clear',s['keeper'])
 def test_safety_unknown_and_funding_immediate(self):
  for k in ['wrap-deposit-review','wrap-fee-funding','float-funding','roles:unexpected','new-safety-check']:
   v,_=m.evaluate({k:'attention'},{},0);self.assertIn(k,v)
 def test_failure_clock_resets_after_brief_recovery(self):
  _,s=m.evaluate({'website':'down'},{},0);_,s=m.evaluate({},s,200)
  v,_=m.evaluate({'website':'down'},s,301);self.assertFalse(v)
 def test_independent_issue_clocks(self):
  _,s=m.evaluate({'keeper':'down'},{},0)
  v,s=m.evaluate({'keeper':'down','website':'down'},s,300)
  self.assertIn('keeper',v);self.assertNotIn('website',v)
unittest.main()
