#!/usr/bin/env python3
"""Install Linux services disabled. Does not activate signing or read credentials."""
import pathlib,subprocess
base=pathlib.Path('/etc/systemd/system')
# The marker is public; cloud.json stays root-only mode 0600.
pathlib.Path('/etc/zeal').chmod(0o755)
(base/'zeal-secrets.service').write_text('''[Unit]
Description=Load ZEAL signing credentials into memory-backed storage
Wants=network-online.target
After=network-online.target
ConditionPathExists=/etc/zeal/ACTIVE
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /var/lib/zeal/runtime/cloud/load-secrets.py
RemainAfterExit=yes
UMask=0077
''')
intervals={'keeper':10,'attest':21600,'replenish':60,'roles':300,'desk-watch':300}
roles={'keeper':['keeper'],'attest':['attestor'],'replenish':['keeper','attestor','minter'],'roles':[],'desk-watch':[]}
for job,interval in intervals.items():
 secrets=roles[job]
 unit='[Unit]\nDescription=ZEAL '+job+'\nWants=network-online.target\nAfter=network-online.target\n'
 if secrets: unit+='Requires=zeal-secrets.service\nAfter=zeal-secrets.service\nConditionPathExists=/etc/zeal/ACTIVE\n'
 unit+='''[Service]
Type=oneshot
User=zeal
Group=zeal
WorkingDirectory=/var/lib/zeal/runtime
Environment=HOME=/var/lib/zeal
Environment=SWEEP_LEDGER=/var/lib/zeal/runtime/launchd/sweeps.json
Environment=PATH=/usr/local/bin:/usr/bin:/bin
UMask=0077
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
ReadWritePaths=/var/lib/zeal/runtime/launchd /var/lib/zeal/runtime/sweeps.json /var/lib/zeal/runtime/redemptions.json
TimeoutStartSec=3600
'''
 for role in secrets:unit+='LoadCredential='+role+':/run/zeal/'+role+'\n'
 unit+='ExecStart=/usr/bin/python3 /var/lib/zeal/runtime/cloud/run.py '+job+'\n'
 (base/('zeal-'+job+'.service')).write_text(unit)
 (base/('zeal-'+job+'.timer')).write_text('[Unit]\nDescription=ZEAL '+job+' schedule\n[Timer]\nOnBootSec=60\nOnUnitInactiveSec='+str(interval)+'\nAccuracySec=1\n[Install]\nWantedBy=timers.target\n')
for job, interval in {'health':60,'backup':3600}.items():
 (base/('zeal-'+job+'.service')).write_text('[Unit]\nDescription=ZEAL '+job+'\nConditionPathExists=/etc/zeal/ACTIVE\n[Service]\nType=oneshot\nUMask=0077\nExecStart=/usr/bin/python3 /var/lib/zeal/runtime/cloud/'+job+'.py\n')
 (base/('zeal-'+job+'.timer')).write_text('[Unit]\nDescription=ZEAL '+job+' timer\n[Timer]\nOnBootSec=120\nOnUnitInactiveSec='+str(interval)+'\n[Install]\nWantedBy=timers.target\n')
subprocess.run(['systemctl','daemon-reload'],check=True)
print('ZEAL schedules installed; none enabled')
