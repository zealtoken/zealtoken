"""Debounce routine outages; preserve safety alerts and require stable recovery."""
import json,pathlib
ROUTINE={'keeper','attest','replenish','roles','desk-watch','backup','desk-pay','float-health','burn','lp-reinvest','wrap','wrap-public','reserve-reimburse','website','wrap-status','float-state','float-backup'}
FAILURE_SECONDS=300
RECOVERY_SECONDS=300

def evaluate(problems, previous, now):
 issues={};visible={}
 for key in set(problems)|set(previous):
  old=previous.get(key,{})
  if key in problems:
   first=old.get('first',now) if old.get('clear') is None else now
   active=bool(old.get('active')) or key not in ROUTINE or now-first>=FAILURE_SECONDS
   item={'first':first,'active':active,'message':problems[key]}
  elif old.get('active'):
   clear=old.get('clear',now)
   if now-clear>=RECOVERY_SECONDS:continue
   item={**old,'clear':clear}
  else:continue
  issues[key]=item
  if item['active']:visible[key]=item['message']
 return visible,issues

def persistent(problems,statefile,now):
 path=pathlib.Path(statefile)
 previous=json.loads(path.read_text()) if path.exists() else {}
 visible,state=evaluate(problems,previous,now)
 path.parent.mkdir(parents=True,exist_ok=True)
 tmp=path.with_suffix('.tmp');tmp.write_text(json.dumps(state));tmp.replace(path)
 return visible
