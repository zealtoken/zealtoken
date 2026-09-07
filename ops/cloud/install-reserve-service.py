#!/usr/bin/env python3
"""Stage reserve reimbursement disabled. Never activate or fetch a private key."""
import pathlib,subprocess
base=pathlib.Path('/etc/systemd/system');root='/var/lib/zeal/runtime'
if pathlib.Path('/etc/zeal/RESERVE_ACTIVE').exists():raise SystemExit('Already active; review updates explicitly')
(base/'zeal-reserve-secret.service').write_text('''[Unit]
Description=Load ZEAL reserve signing credential
Wants=network-online.target
After=network-online.target
ConditionPathExists=/etc/zeal/RESERVE_ACTIVE
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /var/lib/zeal/runtime/cloud/load-reserve-secret.py
RemainAfterExit=yes
ExecStop=/bin/rm -f /run/zeal/reserve
UMask=0077
''')
(base/'zeal-reserve-reimburse.service').write_text('''[Unit]
Description=ZEAL completed-redemption reserve reimbursement
Requires=zeal-reserve-secret.service
After=network-online.target zeal-reserve-secret.service
ConditionPathExists=/etc/zeal/RESERVE_ACTIVE
[Service]
Type=oneshot
User=zeal
Group=zeal
WorkingDirectory=/var/lib/zeal/runtime
Environment=HOME=/var/lib/zeal
Environment=PATH=/usr/local/bin:/usr/bin:/bin
Environment=RESERVE_SIGNER=/usr/local/bin/zeal-reserve-signer
LoadCredential=reserve:/run/zeal/reserve
ExecStart=/usr/local/bin/node --import tsx src/reserve-reimburse.ts --execute
UMask=0077
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectKernelTunables=yes
ProtectControlGroups=yes
RestrictSUIDSGID=yes
ReadWritePaths=/var/lib/zeal/runtime/launchd
IPAddressDeny=169.254.169.254
LimitCORE=0
TimeoutStartSec=600
''')
(base/'zeal-reserve-reimburse.timer').write_text('''[Unit]
Description=ZEAL reserve reimbursement schedule
[Timer]
OnBootSec=180
OnUnitInactiveSec=60
AccuracySec=1
[Install]
WantedBy=timers.target
''')
subprocess.run(['systemctl','daemon-reload'],check=True)
print('Reserve service staged; timer and reserve signing remain disabled')
