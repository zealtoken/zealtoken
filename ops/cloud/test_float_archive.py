import os,runpy,unittest
from pathlib import Path
from cryptography.exceptions import InvalidTag
h=runpy.run_path(str(Path(__file__).with_name('float-archive.py')))
class ArchiveTest(unittest.TestCase):
 def test_authenticated_roundtrip(self):
  key=os.urandom(32);plain=b'wallet-test-data'*40;c=h['encrypt'](plain,key)
  self.assertEqual(h['decrypt'](c,key),plain);self.assertNotIn(plain,c)
  damaged=c[:-1]+bytes([c[-1]^1])
  with self.assertRaises(InvalidTag):h['decrypt'](damaged,key)
  with self.assertRaises(InvalidTag):h['decrypt'](c,os.urandom(32))
if __name__=='__main__':unittest.main()
