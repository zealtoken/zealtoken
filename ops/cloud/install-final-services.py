#!/usr/bin/env python3
"""Stage remaining services disabled; activation is a separate verified handoff."""
import os,pathlib,pwd,subprocess
base=pathlib.Path('/etc/systemd/system');root='/var/lib/zeal/runtime'
lock=pathlib.Path('/run/zeal-wallet.lock');lock.touch(exist_ok=True);lock.chmod(0o660);os.chown(lock,0,pwd.getpwnam('zeal').pw_gid)
# Recreate the lock at boot before any service starts.
pathlib.Path('/etc/tmpfiles.d/zeal-wallet.conf').write_text('f /run/zeal-wallet.lock 0660 root zeal -\n')
(base/'zeal-final-secrets.service').write_text('''[Unit]
Description=Load ZEAL redemption and burner credentials
Wants=network-online.target
After=network-online.target
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /var/lib/zeal/runtime/cloud/load-final-secrets.py
RemainAfterExit=yes
UMask=0077
''')
drop=base/'zeal-backup.service.d';drop.mkdir(exist_ok=True)
(drop/'final-secrets.conf').write_text('[Unit]\nRequires=zeal-final-secrets.service\nAfter=zeal-final-secrets.service\n')
for job,marker,role in [('desk-pay','PAYOUT_ACTIVE','fulfiller'),('float-health','PAYOUT_ACTIVE',None),('burn','BURN_ACTIVE','burner')]:
 unit='[Unit]\nDescription=ZEAL '+job+'\nRequires=zeal-final-secrets.service\nAfter=network-online.target zeal-final-secrets.service\nConditionPathExists=/etc/zeal/'+marker+'\n[Service]\nType=oneshot\nUser=zeal\nGroup=zeal\nWorkingDirectory='+root+'\nEnvironment=HOME=/var/lib/zeal\nEnvironment=PATH=/usr/local/bin:/usr/bin:/bin\nEnvironment=DESK_LEDGER='+root+'/launchd/desk-ledger.json\nEnvironment=ZINGO_DATA='+root+'/.float\nEnvironment=ZINGO_CLI=/usr/local/bin/zingo-cli\nEnvironment=CLOUD_BURNER=1\nEnvironment=COLLECT_LP_FEES=0\nUMask=0077\nNoNewPrivileges=yes\nProtectSystem=strict\nProtectHome=yes\nPrivateTmp=yes\nProtectKernelTunables=yes\nProtectControlGroups=yes\nRestrictSUIDSGID=yes\nReadWritePaths='+root+'/launchd '+root+'/.float /run/zeal-wallet.lock\nTimeoutStartSec=1800\n'
 if role:unit+='LoadCredential='+role+':/run/zeal/'+role+'\n'
 command='/usr/bin/python3 '+root+'/cloud/'+('float-health.py' if job=='float-health' else 'run.py '+job)
 if job!='burn':command='/usr/bin/python3 '+root+'/cloud/wallet-run.py '+command
 unit+='ExecStart='+command+'\n'
 (base/('zeal-'+job+'.service')).write_text(unit)
 schedule='OnCalendar=*-*-* 19:00:00 UTC\nPersistent=true\n' if job=='burn' else 'OnBootSec=150\nOnUnitInactiveSec=300\n'
 (base/('zeal-'+job+'.timer')).write_text('[Unit]\nDescription=ZEAL '+job+' schedule\n[Timer]\n'+schedule+'AccuracySec=1\n[Install]\nWantedBy=timers.target\n')
subprocess.run(['systemctl','daemon-reload'],check=True)
print('Final services staged; timers remain disabled until verified handoff')
