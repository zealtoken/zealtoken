#!/usr/bin/env python3
"""Authenticated encrypted wallet backups; ciphertext alone is uploaded to S3.
Format: ZEALF1 + 12-byte nonce + AES-256-GCM ciphertext/tag. Key lives in Secrets Manager.
Restore is deliberately manual and requires reconciliation before either payer starts.
"""
import io,json,os,pathlib,tarfile
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
MAGIC=b'ZEALF1';AAD=b'ZEAL redemption float backup v1'
def encrypt(data,key):
 nonce=os.urandom(12);return MAGIC+nonce+AESGCM(key).encrypt(nonce,data,AAD)
def decrypt(data,key):
 if not data.startswith(MAGIC):raise ValueError('Unrecognized wallet backup')
 return AESGCM(key).decrypt(data[6:18],data[18:],AAD)
def archive(root):
 buf=io.BytesIO()
 with tarfile.open(fileobj=buf,mode='w:gz') as tar:
  for rel in ['.float/zingo-wallet.dat','.float/connectivity-consent','launchd/desk-ledger.json']:
   p=root/rel
   if p.is_file():tar.add(p,arcname=rel)
 return buf.getvalue()
if __name__=='__main__':
 import sys
 if len(sys.argv)!=3 or sys.argv[1]!='restore':raise SystemExit('Usage: float-archive.py restore ENCRYPTED_FILE (payout must be disabled)')
 if pathlib.Path('/etc/zeal/PAYOUT_ACTIVE').exists():raise SystemExit('Disable payouts and reconcile before restoring')
 root=pathlib.Path('/var/lib/zeal/runtime');key=bytes.fromhex(json.loads(pathlib.Path('/run/zeal/float-backup').read_text())['backupKey'])
 raw=decrypt(pathlib.Path(sys.argv[2]).read_bytes(),key)
 if (root/'.float/zingo-wallet.dat').exists():raise SystemExit('Existing wallet preserved; review it before restoration')
 import pwd
 uid=pwd.getpwnam('zeal').pw_uid;gid=pwd.getpwnam('zeal').pw_gid
 with tarfile.open(fileobj=io.BytesIO(raw),mode='r:gz') as tar:
  for member in tar:
   if member.name not in ['.float/zingo-wallet.dat','.float/connectivity-consent','launchd/desk-ledger.json'] or not member.isfile():raise SystemExit('Unexpected wallet archive member')
   p=root/member.name;p.parent.mkdir(mode=0o700,exist_ok=True);p.write_bytes(tar.extractfile(member).read());p.chmod(0o600);os.chown(p,uid,gid);os.chown(p.parent,uid,gid)
 print('Wallet and payout ledger restored; signing remains disabled')
