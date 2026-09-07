#!/usr/bin/env python3
"""Install the fee-only LP reinvestment schedule, without activating it."""
import pathlib,subprocess
root='/var/lib/zeal/runtime'
base=pathlib.Path('/etc/systemd/system')
(base/'zeal-lp-reinvest.service').write_text('[Unit]\nDescription=ZEAL LP fee reinvestment\nRequires=zeal-secrets.service\nAfter=network-online.target zeal-secrets.service\nConditionPathExists=/etc/zeal/ACTIVE\nConditionPathExists=/etc/zeal/LP_REINVEST_ACTIVE\n[Service]\nType=oneshot\nUser=zeal\nGroup=zeal\nWorkingDirectory=/var/lib/zeal/runtime\nEnvironment=HOME=/var/lib/zeal\nEnvironment=PATH=/usr/local/bin:/usr/bin:/bin\nUMask=0077\nNoNewPrivileges=yes\nProtectSystem=strict\nProtectHome=yes\nPrivateTmp=yes\nProtectKernelTunables=yes\nProtectControlGroups=yes\nRestrictSUIDSGID=yes\nReadWritePaths=/var/lib/zeal/runtime/launchd\nLoadCredential=keeper:/run/zeal/keeper\nTimeoutStartSec=300\nExecStart=/usr/bin/python3 /var/lib/zeal/runtime/cloud/run.py lp-reinvest\n')
(base/'zeal-lp-reinvest.timer').write_text('[Unit]\nDescription=Check ZEAL LP fees hourly\n[Timer]\nOnBootSec=180\nOnUnitInactiveSec=3600\nAccuracySec=15\n[Install]\nWantedBy=timers.target\n')
subprocess.run(['systemctl','daemon-reload'],check=True)
