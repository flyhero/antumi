import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { MOBILE_BRIDGE_DEFAULT_PORT } from '@antumi/protocol'

// The script that installs the bridge on a Linux server (docs/MOBILE.md): the bundled bridge-server.mjs
// rides inside it, so the server needs no download beyond Node.js from its own package manager.

// Packaged, the bundle sits beside core's; from source, where the desktop's bundle step puts it.
export function bridgeBundlePath(): string {
  const fromSource = import.meta.url.endsWith('.ts')
  return fileURLToPath(new URL(fromSource ? '../../desktop/out/backend/bridge-server.mjs' : './bridge-server.mjs', import.meta.url))
}

export function bridgeInstallScript(bundle: Uint8Array, port = MOBILE_BRIDGE_DEFAULT_PORT): string {
  const packed = gzipSync(bundle, { level: 9 }).toString('base64').replace(/.{1,76}/g, '$&\n').trimEnd()
  return [
    `bash <<'ANTUMI_BRIDGE'`,
    '# Antumi bridge: passes phones\' encrypted connections on to their computers. Safe to run again.',
    'set -e',
    // A Node already there is used as it is, never replaced: something else on the server may need it.
    'if ! command -v node >/dev/null 2>&1; then',
    '  if command -v apt-get >/dev/null 2>&1; then apt-get update && apt-get install -y nodejs',
    '  elif command -v dnf >/dev/null 2>&1; then dnf module install -y nodejs:20 || dnf module install -y nodejs:18 || dnf install -y nodejs',
    '  else yum install -y nodejs',
    '  fi',
    'fi',
    'if ! command -v node >/dev/null 2>&1; then echo "Could not install Node.js: install Node.js 14 or later, then run this again."; exit 1; fi',
    'if [ "$(node -p \'process.versions.node.split(".")[0]\')" -lt 14 ]; then',
    '  echo "Found Node.js $(node -v) at $(command -v node); the Antumi bridge needs 14 or later. Upgrade it, then run this again."',
    '  exit 1',
    'fi',
    'mkdir -p /opt/antumi-bridge',
    `base64 -d <<'BUNDLE' | gunzip > /opt/antumi-bridge/bridge-server.mjs.partial`,
    packed,
    'BUNDLE',
    'mv /opt/antumi-bridge/bridge-server.mjs.partial /opt/antumi-bridge/bridge-server.mjs',
    `cat > /etc/systemd/system/antumi-bridge.service <<EOF`,
    '[Unit]',
    'Description=Antumi bridge',
    'After=network-online.target',
    'Wants=network-online.target',
    '',
    '[Service]',
    `ExecStart=$(command -v node) /opt/antumi-bridge/bridge-server.mjs --port ${port} --data /var/lib/antumi-bridge`,
    'Restart=always',
    'RestartSec=3',
    'DynamicUser=yes',
    'StateDirectory=antumi-bridge',
    'NoNewPrivileges=yes',
    '',
    '[Install]',
    'WantedBy=multi-user.target',
    'EOF',
    'systemctl daemon-reload',
    'systemctl enable antumi-bridge',
    'systemctl restart antumi-bridge',
    'if systemctl is-active -q firewalld 2>/dev/null; then',
    `  firewall-cmd --permanent --add-port=${port}/tcp`,
    '  firewall-cmd --reload',
    'fi',
    'if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then',
    `  ufw allow ${port}/tcp`,
    'fi',
    'sleep 1',
    'systemctl is-active antumi-bridge',
    `echo "Done. Allow TCP ${port} in your cloud provider's firewall or security group too."`,
    'ANTUMI_BRIDGE',
    ''
  ].join('\n')
}

export async function readBridgeBundle(): Promise<Uint8Array> {
  return readFile(bridgeBundlePath())
}
