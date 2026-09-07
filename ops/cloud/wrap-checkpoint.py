#!/usr/bin/env python3
"""Root checkpoint coordinator. A dirty remote checkpoint forbids automatic recovery."""
import base64,fcntl,hashlib,json,os,pathlib,subprocess,sys,tempfile,time,uuid
ROOT=pathlib.Path('/var/lib/zeal/runtime')
BUCKET='zeal-operator-artifacts-z0jy5fu8vvsh'
KEY='backups/wrap-public/checkpoint.json'
LEDGER=ROOT/'launchd/wrap-interim.json'
MARKER=pathlib.Path('/run/zeal-status/wrap-checkpoint-ready.json')
def digest(b):return hashlib.sha256(b).hexdigest()
def validate_checkpoint(remote,local):
 if remote.get('version')!=1 or remote.get('phase')!='ready':raise RuntimeError('Checkpoint requires explicit recovery review')
 if remote.get('hash')!=digest(local) or digest(base64.b64decode(remote['ledger']))!=remote['hash']:raise RuntimeError('Local ledger differs from off-device checkpoint; do not auto-restore')
def safe_observation_progress(before,after):
 try:
  old=json.loads(before);new=json.loads(after)
  if old.get('version')!=1 or new.get('version')!=1:return False
  a={(d['txid'],d['index']):d for d in old['deposits']}
  b={(d['txid'],d['index']):d for d in new['deposits']}
  if len(a)!=len(old['deposits']) or len(b)!=len(new['deposits']):return False
  if any(b.get(k)!=v for k,v in a.items()):return False
  allowed={'routeId','recipient','address','txid','index','amountZats','state'}
  return all(d.get('state')=='observed' and set(d)<=allowed for k,d in b.items() if k not in a)
 except Exception:return False
def aws(*args):
 p=subprocess.run(['/usr/local/bin/aws','--region','us-east-2',*args],capture_output=True)
 if p.returncode:raise RuntimeError('AWS checkpoint operation failed')
 return json.loads(p.stdout or b'{}')
def put(value,etag=None,initial=False,key=KEY):
 with tempfile.NamedTemporaryFile(dir='/run/zeal') as f:
  f.write(json.dumps(value).encode());f.flush();os.fsync(f.fileno())
  args=['s3api','put-object','--bucket',BUCKET,'--key',key,'--body',f.name,'--content-type','application/json']
  if initial:args+=['--if-none-match','*']
  elif etag:args+=['--if-match',etag]
  return aws(*args)['ETag']
def prepare_marker_directory():
 # Only the checkpoint hash/timestamp belongs here, never credentials or backups.
 MARKER.parent.mkdir(mode=0o755,parents=True,exist_ok=True)
 MARKER.parent.chmod(0o755)
def main():
 prepare_marker_directory()
 os.umask(0o077)
 lock=open('/run/zeal/wrap-coordinator.lock','w');fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 local=LEDGER.read_bytes()
 if '--initialize' in sys.argv:
  if pathlib.Path('/etc/zeal/WRAP_INTERIM_ACTIVE').exists():raise RuntimeError('Initialize before activation only')
  put({'version':1,'phase':'ready','hash':digest(local),'ledger':base64.b64encode(local).decode(),'generation':0},initial=True)
  MARKER.write_text(json.dumps({'hash':digest(local),'at':int(time.time()*1000)}));MARKER.chmod(0o644)
  print('Checkpoint initialized; no service activation');return
 if not pathlib.Path('/etc/zeal/WRAP_INTERIM_ACTIVE').exists():raise RuntimeError('Public gate absent')
 with tempfile.NamedTemporaryFile(dir='/run/zeal') as f:
  meta=aws('s3api','get-object','--bucket',BUCKET,'--key',KEY,f.name)
  remote=json.loads(pathlib.Path(f.name).read_text())
 validate_checkpoint(remote,local)
 runid=str(uuid.uuid4());generation=remote['generation']+1
 dirty={**remote,'phase':'running','generation':generation,'runId':runid,'startedAt':int(time.time())}
 etag=put(dirty,meta['ETag'])
 MARKER.unlink(missing_ok=True)
 result=subprocess.run(['/usr/bin/python3',str(ROOT/'cloud/run-wrap-public.py')],env={**os.environ,'WRAP_INTERIM_RUN_ID':runid})
 current=LEDGER.read_bytes()
 phase='ready' if result.returncode==0 or current==local or safe_observation_progress(local,current) else 'review'
 done={**dirty,'phase':phase,'hash':digest(current),'ledger':base64.b64encode(current).decode(),'completedAt':int(time.time())}
 put(done,etag)
 if phase=='ready':
  temp=MARKER.with_suffix('.tmp');temp.write_text(json.dumps({'hash':digest(current),'at':int(time.time()*1000)}));temp.chmod(0o644);temp.replace(MARKER)
 status={'version':1,'at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime()),'workerReady':False,'accepting':False}
 if result.returncode==0:
  status=json.loads((ROOT/'launchd/wrap-public-status.json').read_text());status['workerReady']=True
 put(status,key='backups/wrap-public/status.json')
 if result.returncode:raise RuntimeError('Worker stopped; status closed; inspect journal')
 print('Checkpoint and public status updated')
if __name__=='__main__':
 try:main()
 except Exception as e:print(str(e),file=sys.stderr);sys.exit(1)
