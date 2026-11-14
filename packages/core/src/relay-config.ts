import { generateKeyPairSync } from 'node:crypto'

// The WireGuard tunnel through the user's own server (docs/MOBILE.md): the keys of its three peers
// and the configuration each one is given. Pure, so every piece can be checked as text.

export type WireGuardKey = { privateKey: string; publicKey: string }

export type RelayConfig = {
  server: string
  port: number
  // The server's bandwidth in Mbit/s, if the user said: the tunnel is then shaped just under it.
  bandwidth?: number | null
  keys: { server: WireGuardKey; computer: WireGuardKey; phone: WireGuardKey }
}

export const RELAY_NETWORK = '10.77.0.0/24'
export const RELAY_SERVER_ADDRESS = '10.77.0.1'
export const RELAY_COMPUTER_ADDRESS = '10.77.0.2'
export const RELAY_PHONE_ADDRESS = '10.77.0.3'
const INTERFACE = 'wg-antumi'
// Small enough for any path, mobile networks and PPPoE included, at a few percent of throughput.
const MTU = 1280

// WireGuard's keys are X25519's, base64; the clamping both sides apply makes Node's the same.
export function wireGuardKey(): WireGuardKey {
  const jwk = generateKeyPairSync('x25519').privateKey.export({ format: 'jwk' })
  const base64 = (value: string | undefined) => Buffer.from(value ?? '', 'base64url').toString('base64')
  return { privateKey: base64(jwk.d), publicKey: base64(jwk.x) }
}

export function relayKeys(): RelayConfig['keys'] {
  return { server: wireGuardKey(), computer: wireGuardKey(), phone: wireGuardKey() }
}

function endpoint(config: RelayConfig): string {
  return config.server.includes(':') ? `[${config.server}]:${config.port}` : `${config.server}:${config.port}`
}

// For wireproxy on this computer: no network interface; what reaches this computer's address on
// the gateway's port inside the tunnel is handed to the gateway on loopback.
export function computerTunnelConfig(config: RelayConfig, gatewayPort: number): string {
  return [
    '[Interface]',
    `Address = ${RELAY_COMPUTER_ADDRESS}/32`,
    `PrivateKey = ${config.keys.computer.privateKey}`,
    `MTU = ${MTU}`,
    '',
    '[Peer]',
    `PublicKey = ${config.keys.server.publicKey}`,
    `Endpoint = ${endpoint(config)}`,
    `AllowedIPs = ${RELAY_NETWORK}`,
    // Keeps the way open through this computer's NAT, for the server to reach it.
    'PersistentKeepalive = 25',
    '',
    '[TCPServerTunnel]',
    `ListenPort = ${gatewayPort}`,
    `Target = 127.0.0.1:${gatewayPort}`,
    ''
  ].join('\n')
}

// For the WireGuard app, scanned as a QR code. Only the tunnel's range goes through the server, so
// it can stay on without touching the phone's other traffic.
export function phoneTunnelConfig(config: RelayConfig): string {
  return [
    '[Interface]',
    `PrivateKey = ${config.keys.phone.privateKey}`,
    `Address = ${RELAY_PHONE_ADDRESS}/32`,
    `MTU = ${MTU}`,
    '',
    '[Peer]',
    `PublicKey = ${config.keys.server.publicKey}`,
    `Endpoint = ${endpoint(config)}`,
    `AllowedIPs = ${RELAY_NETWORK}`,
    ''
  ].join('\n')
}

// Queues what the tunnel sends just under the server's bandwidth. A cloud server's limit drops what
// goes over it in bursts, and wireproxy's userspace TCP sends in bursts: unshaped, a computer's
// replies reached the phone at a tenth of the bandwidth.
function shaping(bandwidth: number | null | undefined): string[] {
  if (!bandwidth) return []
  const rate = `${Math.max(64, Math.floor(bandwidth * 930))}kbit`
  return [`PostUp = command -v tc >/dev/null && tc qdisc replace dev %i root handle 1: htb default 10 && tc class replace dev %i parent 1: classid 1:10 htb rate ${rate} ceil ${rate} && tc qdisc replace dev %i parent 1:10 handle 10: fq_codel || true`]
}

// Pasted into a root shell on a Linux server: installs WireGuard, sets up the tunnel with this
// computer and the phone as its peers, forwards between them and starts it at boot. Running it again
// replaces the tunnel's configuration.
export function relayServerScript(config: RelayConfig): string {
  const wireGuard = [
    '[Interface]',
    `Address = ${RELAY_SERVER_ADDRESS}/24`,
    `ListenPort = ${config.port}`,
    `PrivateKey = ${config.keys.server.privateKey}`,
    `MTU = ${MTU}`,
    'PostUp = iptables -I FORWARD -i %i -o %i -j ACCEPT || true',
    'PostDown = iptables -D FORWARD -i %i -o %i -j ACCEPT || true',
    ...shaping(config.bandwidth),
    '',
    '[Peer]',
    '# Antumi computer',
    `PublicKey = ${config.keys.computer.publicKey}`,
    `AllowedIPs = ${RELAY_COMPUTER_ADDRESS}/32`,
    '',
    '[Peer]',
    '# Antumi phone',
    `PublicKey = ${config.keys.phone.publicKey}`,
    `AllowedIPs = ${RELAY_PHONE_ADDRESS}/32`
  ].join('\n')
  return [
    `bash <<'ANTUMI_RELAY'`,
    '# Antumi phone relay: WireGuard between this computer and the phone. Safe to run again.',
    'set -e',
    'if ! command -v wg >/dev/null 2>&1; then',
    '  if command -v apt-get >/dev/null 2>&1; then apt-get update && apt-get install -y wireguard-tools iptables',
    '  elif command -v dnf >/dev/null 2>&1; then dnf install -y wireguard-tools || { dnf install -y epel-release && dnf install -y wireguard-tools; }',
    '  else yum install -y wireguard-tools || { yum install -y epel-release && yum install -y wireguard-tools; }',
    '  fi',
    'fi',
    ...(config.bandwidth ? ['command -v tc >/dev/null 2>&1 || dnf install -y iproute-tc 2>/dev/null || yum install -y iproute-tc 2>/dev/null || apt-get install -y iproute2 || true'] : []),
    'umask 077',
    'mkdir -p /etc/wireguard',
    `cat > /etc/wireguard/${INTERFACE}.conf <<'EOF'`,
    wireGuard,
    'EOF',
    `echo 'net.ipv4.ip_forward = 1' > /etc/sysctl.d/99-antumi-relay.conf`,
    'sysctl -p /etc/sysctl.d/99-antumi-relay.conf',
    `systemctl stop wg-quick@${INTERFACE} 2>/dev/null || true`,
    `wg-quick down ${INTERFACE} 2>/dev/null || true`,
    `systemctl enable wg-quick@${INTERFACE}`,
    `systemctl start wg-quick@${INTERFACE}`,
    'if systemctl is-active -q firewalld 2>/dev/null; then',
    `  firewall-cmd --permanent --add-port=${config.port}/udp`,
    `  firewall-cmd --permanent --zone=trusted --add-interface=${INTERFACE}`,
    '  firewall-cmd --reload',
    'fi',
    'if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then',
    `  ufw allow ${config.port}/udp`,
    `  ufw route allow in on ${INTERFACE} out on ${INTERFACE}`,
    'fi',
    `wg show ${INTERFACE}`,
    `echo "Done. Allow UDP ${config.port} in your cloud provider's firewall or security group too."`,
    'ANTUMI_RELAY',
    ''
  ].join('\n')
}
