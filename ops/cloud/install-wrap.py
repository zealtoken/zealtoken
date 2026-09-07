#!/usr/bin/env python3
"""Stage the wrapping timer. Does not activate signing or enable public requests."""
from pathlib import Path
import subprocess
base=Path('/etc/systemd/system')
(base/'zeal-wrap.service').write_text('''[Unit]
Description=ZEAL confirmed deposit wrapping
Wants=network-online.target
After=network-online.target zeal-secrets.service
Requires=zeal-secrets.service
ConditionPathExists=/etc/zeal/ACTIVE
ConditionPathExists=/etc/zeal/WRAP_ACTIVE
[Service]
Type=oneshot
User=zeal
Group=zeal
WorkingDirectory=/var/lib/zeal/runtime
Environment=HOME=/var/lib/zeal
Environment=PATH=/usr/local/bin:/usr/bin:/bin
LoadCredential=minter:/run/zeal/minter
LoadCredential=attestor:/run/zeal/attestor
ExecStart=/usr/bin/python3 /var/lib/zeal/runtime/cloud/run.py wrap
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
TimeoutStartSec=300
''')
(base/'zeal-wrap.timer').write_text('''[Unit]
Description=Check confirmed ZEAL wrap deposits
[Timer]
OnBootSec=30
OnUnitInactiveSec=15
AccuracySec=1
Unit=zeal-wrap.service
[Install]
WantedBy=timers.target
''')
subprocess.run(['systemctl','daemon-reload'],check=True)
print('Wrap units staged. WRAP_ACTIVE gate absent until verified activation.')
