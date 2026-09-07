#!/usr/bin/env python3
import pathlib,subprocess
p=pathlib.Path('/etc/systemd/system')
(p/'zeal-wrap-public.service').write_text('''[Unit]
Description=ZEAL checkpointed public wrapping
After=network-online.target zeal-secrets.service
Wants=network-online.target
ConditionPathExists=/etc/zeal/ACTIVE
ConditionPathExists=/etc/zeal/WRAP_INTERIM_ACTIVE
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 /var/lib/zeal/runtime/cloud/wrap-checkpoint.py
TimeoutStartSec=360
UMask=0077
''')
(p/'zeal-wrap-public.timer').write_text('''[Unit]
Description=ZEAL public wrap poll
[Timer]
OnBootSec=45
OnUnitInactiveSec=15
AccuracySec=1
Unit=zeal-wrap-public.service
[Install]
WantedBy=timers.target
''')
subprocess.run(['systemctl','daemon-reload'],check=True)
print('Public wrapping timer installed, not enabled')
