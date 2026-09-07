#!/usr/bin/env python3
"""Install the persistent keeper override. Activation is a separate explicit step."""
import pathlib,subprocess
base=pathlib.Path('/etc/systemd/system/zeal-keeper.service.d')
base.mkdir(exist_ok=True)
(base/'daemon.conf').write_text('[Service]\nType=simple\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=120\n[Install]\nWantedBy=multi-user.target\n')
subprocess.run(['systemctl','daemon-reload'],check=True)
