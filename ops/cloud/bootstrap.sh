#!/bin/bash
# Run through SSM only after cloud-init has completed. Takes artifact bucket + SHA256.
set -euo pipefail
bucket="$1"; digest="$2"
cloud-init status --wait >/dev/null
cd /tmp
curl -fsS https://nodejs.org/dist/v22.23.2/node-v22.23.2-linux-x64.tar.xz -o zeal-node.tar.xz
printf '%s  %s\n' d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307 zeal-node.tar.xz | sha256sum -c -
tar -xJf zeal-node.tar.xz --strip-components=1 -C /usr/local
aws s3 cp "s3://$bucket/releases/operator.tar.gz" /tmp/zeal-operator.tar.gz --only-show-errors
printf '%s  %s\n' "$digest" /tmp/zeal-operator.tar.gz | sha256sum -c -
tar -xzf /tmp/zeal-operator.tar.gz -C /var/lib/zeal/runtime
cd /var/lib/zeal/runtime
npm ci --ignore-scripts --no-audit --no-fund
mkdir -p launchd .keys
printf '{}\n' > redemptions.json
printf '[]\n' > sweeps.json
printf '[]\n' > launchd/sweeps.json
chown root:root /var/lib/zeal /var/lib/zeal/runtime
chmod 755 /var/lib/zeal /var/lib/zeal/runtime
chown -R root:root src cloud proto node_modules package.json package-lock.json tsconfig.json
chown -R zeal:zeal launchd sweeps.json redemptions.json
python3 cloud/install-services.py
python3 cloud/install-keeper-daemon.py
python3 cloud/install-lp-reinvest.py
systemd-analyze verify /etc/systemd/system/zeal-*.service /etc/systemd/system/zeal-*.timer
npm run typecheck
npm test
printf 'ZEAL staged; signing disabled\n'
