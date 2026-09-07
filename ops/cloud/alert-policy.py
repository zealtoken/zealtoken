"""Operator-approved notification policy; no financial limits or signing changes."""
import re
from decimal import Decimal
from datetime import datetime

KEEPER_WARNING_ETH = Decimal('0.2')
EXPECTED_MINTER = '0x5B86ef823FC4bA3eFD4D08874c4FDbd3D864B379'
EXPECTED_ETA = '2026-09-09T20:16:37.000Z'

def actionable(problems, now):
 result = {}
 for key, message in problems.items():
  funding = re.fullmatch(r'KEEPER FUNDING: ([0-9]+(?:\.[0-9]+)?) ETH remains at 0x19cece80126b79F76D8b8297B876310a56349738; refill preserves 1 ETH plus gas\. Add ETH if more refill capacity is needed\.', message)
  if funding:
   balance = Decimal(funding.group(1))
   if balance >= KEEPER_WARNING_ETH:
    continue
   message = f'KEEPER FUNDING: {balance} ETH remains; below the 0.2 ETH operating-budget warning. Top up the keeper if needed. Automatic refill still preserves 1 ETH plus gas; this warning does not change that spending limit.'
  expected = f'ZZEC minter change proposed -> {EXPECTED_MINTER} (eta {EXPECTED_ETA})'
  if message.lower() == expected.lower() and now < datetime.fromisoformat(EXPECTED_ETA.replace('Z', '+00:00')).timestamp():
   continue
  result[key] = message
 return result
