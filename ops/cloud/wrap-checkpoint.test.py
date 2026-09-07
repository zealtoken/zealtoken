import json,base64,importlib.util,unittest,tempfile,pathlib,os
spec=importlib.util.spec_from_file_location('checkpoint','cloud/wrap-checkpoint.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Recovery(unittest.TestCase):
 def setUp(self):
  self.raw=b'{"version":1,"deposits":[]}'
  self.good={'version':1,'phase':'ready','hash':m.digest(self.raw),'ledger':base64.b64encode(self.raw).decode()}
 def test_public_status_directory_overrides_private_umask(self):
  original=m.MARKER
  with tempfile.TemporaryDirectory() as d:
   try:
    m.MARKER=pathlib.Path(d)/'status'/'wrap-checkpoint-ready.json'
    old=os.umask(0o077)
    try:m.prepare_marker_directory()
    finally:os.umask(old)
    self.assertEqual(m.MARKER.parent.stat().st_mode & 0o777,0o755)
    self.assertEqual(list(m.MARKER.parent.iterdir()),[])
   finally:m.MARKER=original
 def test_clean_restart(self):m.validate_checkpoint(self.good,self.raw)
 def test_crash_after_remote_claim_blocks_restart(self):
  with self.assertRaises(RuntimeError):m.validate_checkpoint({**self.good,'phase':'running'},self.raw)
 def test_old_volume_restored_blocks_issuance(self):
  with self.assertRaises(RuntimeError):m.validate_checkpoint(self.good,b'{"version":1,"deposits":[{}]}')
 def test_corrupt_remote_backup_blocks_issuance(self):
  with self.assertRaises(RuntimeError):m.validate_checkpoint({**self.good,'ledger':base64.b64encode(b'corrupt').decode()},self.raw)
 def test_uncertain_send_review_blocks_restart(self):
  with self.assertRaises(RuntimeError):m.validate_checkpoint({**self.good,'phase':'review'},self.raw)
 def test_only_new_unsigned_observations_can_retry(self):
  d={'txid':'0x123','index':0,'state':'observed','amountZats':'100000'}
  new=json.dumps({'version':1,'deposits':[d]}).encode()
  self.assertTrue(m.safe_observation_progress(self.raw,new))
  signed=json.dumps({'version':1,'deposits':[{**d,'state':'sweep-signed','sweepRaw':'abcd'}]}).encode()
  self.assertFalse(m.safe_observation_progress(new,signed))
  self.assertFalse(m.safe_observation_progress(signed,new))
  self.assertFalse(m.safe_observation_progress(new,self.raw))
unittest.main()
