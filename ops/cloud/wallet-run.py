#!/usr/bin/env python3
"""One OS lock covers payout, wallet inspection and consistent wallet backups."""
import fcntl,pathlib,subprocess,sys,os
with open('/run/zeal-wallet.lock','r+') as lock:
 fcntl.flock(lock,fcntl.LOCK_EX)
 if not pathlib.Path('/var/lib/zeal/runtime/.float/zingo-wallet.dat').is_file():raise SystemExit('Redemption wallet is missing; restore and reconcile before enabling payouts')
 os.environ['ZEAL_WALLET_LOCK_HELD']='1'
 raise SystemExit(subprocess.call(sys.argv[1:]))
