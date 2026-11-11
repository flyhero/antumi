import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { AutoInvestigationConfig, AutoInvestigationRun, SourceId } from '@antumi/protocol'

export const InvestigationSettings = z.object({
  provider: SourceId, instance: SourceId, config: AutoInvestigationConfig,
  binding: z.string().nullable(), scope: z.string().nullable(), baselineReady: z.boolean(),
  reason: z.string().nullable(), message: z.string().nullable(), possiblyTruncated: z.boolean()
})
export type InvestigationSettings = z.infer<typeof InvestigationSettings>
export const InvestigationRun = AutoInvestigationRun.extend({
  binding: z.string(), scope: z.string(), config: AutoInvestigationConfig.nullable(),
  submitted: z.boolean(), imagesPending: z.boolean().default(false), aliases: z.array(z.string()).default([])
})
export type InvestigationRun = z.infer<typeof InvestigationRun>
const JsonRow = z.object({ data: z.string() })
export const investigationInstance = (provider: string, instance: string) => `${provider}/${instance}`

// Uses the database migrated by TaskStore. Seen keys deliberately outlive deleted conversations.
export class SourceInvestigationStore {
  private readonly db: DatabaseSync
  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000')
  }
  close(): void { this.db.close() }
  transaction<T>(run: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try { const result = run(); this.db.exec('COMMIT'); return result }
    catch (error) { this.db.exec('ROLLBACK'); throw error }
  }
  settings(): InvestigationSettings[] {
    return this.db.prepare('SELECT data FROM source_investigation_settings').all().map((row) => InvestigationSettings.parse(JSON.parse(JsonRow.parse(row).data)))
  }
  setting(provider: string, instance: string): InvestigationSettings | null {
    const row = this.db.prepare('SELECT data FROM source_investigation_settings WHERE id=?').get(investigationInstance(provider, instance))
    return row ? InvestigationSettings.parse(JSON.parse(JsonRow.parse(row).data)) : null
  }
  saveSetting(value: InvestigationSettings): void {
    this.db.prepare('INSERT INTO source_investigation_settings(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(investigationInstance(value.provider, value.instance), JSON.stringify(InvestigationSettings.parse(value)))
  }
  seen(binding: string, key: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM source_investigation_seen WHERE binding=? AND key=?').get(binding, key)
  }
  remember(binding: string, key: string, runId?: string): void {
    this.db.prepare('INSERT INTO source_investigation_seen(binding,key,run_id) VALUES (?,?,?) ON CONFLICT(binding,key) DO UPDATE SET run_id=COALESCE(excluded.run_id,source_investigation_seen.run_id)').run(binding, key, runId ?? null)
  }
  runs(provider?: string, instance?: string): InvestigationRun[] {
    const rows = provider === undefined ? this.db.prepare('SELECT data FROM source_investigation_runs').all()
      : this.db.prepare('SELECT data FROM source_investigation_runs WHERE instance_key=?').all(investigationInstance(provider, instance ?? 'default'))
    return this.decode(rows)
  }
  private decode(rows: Record<string, unknown>[]): InvestigationRun[] {
    return rows.map((row) => InvestigationRun.parse(JSON.parse(JsonRow.parse(row).data)))
      .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
  }
  active(): InvestigationRun[] {
    return this.decode(this.db.prepare("SELECT data FROM source_investigation_runs WHERE json_extract(data,'$.status') IN ('preparing','running')").all())
  }
  queued(provider: string, instance: string): InvestigationRun[] {
    return this.decode(this.db.prepare("SELECT data FROM source_investigation_runs WHERE instance_key=? AND json_extract(data,'$.status') IN ('queued','retry-wait')").all(investigationInstance(provider, instance)))
  }
  uncertain(): InvestigationRun[] {
    return this.decode(this.db.prepare("SELECT data FROM source_investigation_runs WHERE json_extract(data,'$.reason')='delivery-uncertain'").all())
  }
  counts(provider: string, instance: string, begin: number, end: number): { today: number; queued: number } {
    const row = this.db.prepare(`SELECT
      COALESCE(SUM(json_extract(data,'$.startedAt') >= ? AND json_extract(data,'$.startedAt') < ?),0) AS today,
      COALESCE(SUM(json_extract(data,'$.status') IN ('queued','retry-wait')),0) AS queued
      FROM source_investigation_runs WHERE instance_key=?`).get(begin, end, investigationInstance(provider, instance))
    return z.object({ today: z.number(), queued: z.number() }).parse(row)
  }
  run(id: string): InvestigationRun | null {
    const row = this.db.prepare('SELECT data FROM source_investigation_runs WHERE id=?').get(id)
    return row ? InvestigationRun.parse(JSON.parse(JsonRow.parse(row).data)) : null
  }
  byIssue(binding: string, key: string): InvestigationRun | null {
    const row = this.db.prepare('SELECT data FROM source_investigation_runs WHERE id=(SELECT run_id FROM source_investigation_seen WHERE binding=? AND key=?)').get(binding, key)
    return row ? InvestigationRun.parse(JSON.parse(JsonRow.parse(row).data)) : null
  }
  saveRun(value: InvestigationRun): void {
    this.db.prepare('INSERT INTO source_investigation_runs(id,instance_key,binding,key,data) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data')
      .run(value.id, investigationInstance(value.provider, value.instance), value.binding, value.key, JSON.stringify(InvestigationRun.parse(value)))
  }
}
