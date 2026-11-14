import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { MOBILE_DEFAULT_PORT, MOBILE_EXTRA_HOSTS_MAX, MobileAccess, MobileExtraHost, MobilePlatform, MobilePort, MobilePushUrl } from '@antumi/protocol'

// Paired phones and the phone link's settings. Rows live in `mobile_devices` and
// `mobile_settings`, which TaskStore's migrations create.

export type StoredDevice = {
  id: string
  name: string
  platform: MobilePlatform
  publicKey: string
  access: MobileAccess
  pairedAt: number
  lastSeenAt: number | null
}

export const MobileSettings = z.object({
  enabled: z.boolean().catch(false),
  port: MobilePort.catch(MOBILE_DEFAULT_PORT),
  pushUrl: MobilePushUrl.nullable().catch(null),
  extraHosts: z.array(MobileExtraHost).max(MOBILE_EXTRA_HOSTS_MAX).catch([])
})
export type MobileSettings = z.infer<typeof MobileSettings>

const DEFAULTS: MobileSettings = { enabled: false, port: MOBILE_DEFAULT_PORT, pushUrl: null, extraHosts: [] }

const DeviceRow = z.object({
  id: z.string(),
  name: z.string(),
  platform: MobilePlatform,
  public_key: z.string(),
  access: MobileAccess.catch('view'),
  paired_at: z.number(),
  last_seen_at: z.number().nullable()
})

export class MobileStore {
  private readonly db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
  }

  close(): void {
    this.db.close()
  }

  settings(): MobileSettings {
    const row = this.db.prepare('SELECT data FROM mobile_settings WHERE id = 1').get()
    if (!row) return DEFAULTS
    try {
      return MobileSettings.parse(JSON.parse(String(row.data)))
    } catch {
      return DEFAULTS
    }
  }

  saveSettings(settings: MobileSettings): void {
    this.db.prepare('INSERT INTO mobile_settings (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(JSON.stringify(settings))
  }

  // Paired first, oldest first.
  devices(): StoredDevice[] {
    return this.db.prepare('SELECT * FROM mobile_devices ORDER BY paired_at, id').all().flatMap((raw) => {
      const row = DeviceRow.safeParse(raw)
      if (!row.success) return []
      const { id, name, platform, public_key, access, paired_at, last_seen_at } = row.data
      return [{ id, name, platform, publicKey: public_key, access, pairedAt: paired_at, lastSeenAt: last_seen_at }]
    })
  }

  device(id: string): StoredDevice | null {
    return this.devices().find((device) => device.id === id) ?? null
  }

  // A phone paired again (the same key) keeps its id and takes the new name and access.
  add(device: Omit<StoredDevice, 'lastSeenAt'>): void {
    this.db.prepare(`INSERT INTO mobile_devices (id, name, platform, public_key, access, paired_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(id) DO UPDATE SET name = excluded.name, platform = excluded.platform, access = excluded.access, paired_at = excluded.paired_at`)
      .run(device.id, device.name, device.platform, device.publicKey, device.access, device.pairedAt)
  }

  setAccess(id: string, access: MobileAccess): boolean {
    return Number(this.db.prepare('UPDATE mobile_devices SET access = ? WHERE id = ?').run(access, id).changes) > 0
  }

  seen(id: string, at: number): void {
    this.db.prepare('UPDATE mobile_devices SET last_seen_at = ? WHERE id = ?').run(at, id)
  }

  remove(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM mobile_devices WHERE id = ?').run(id).changes) > 0
  }
}
