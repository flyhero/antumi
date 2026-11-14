import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { AgentCall, AgentProfile, AgentProfileFields } from '@antumi/protocol'
import { Rejection } from './rejection'

export class AgentProfileStore {
  private readonly db: DatabaseSync
  constructor(file: string, private readonly now: () => number = Date.now) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
  }
  close(): void { this.db.close() }
  list(): AgentProfile[] {
    return this.db.prepare('SELECT data FROM agent_profiles ORDER BY rowid DESC').all().map((row) => AgentProfile.parse(JSON.parse(String(row.data))))
  }
  get(id: string): AgentProfile {
    const row = this.db.prepare('SELECT data FROM agent_profiles WHERE id = ?').get(id)
    if (!row) throw new Rejection('profile-not-found', '智能体不存在')
    return AgentProfile.parse(JSON.parse(String(row.data)))
  }
  save(fields: AgentProfileFields, id?: string): AgentProfile {
    const at = this.now()
    const profile = AgentProfile.parse({ ...(id ? this.get(id) : { id: randomUUID(), archivedAt: null, createdAt: at }), ...AgentProfileFields.parse(fields), updatedAt: at })
    this.db.prepare('INSERT INTO agent_profiles(id, data) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(profile.id, JSON.stringify(profile))
    return profile
  }
  archive(id: string, archived: boolean): AgentProfile {
    const profile = { ...this.get(id), archivedAt: archived ? this.now() : null, updatedAt: this.now() }
    this.db.prepare('UPDATE agent_profiles SET data = ? WHERE id = ?').run(JSON.stringify(profile), id)
    return profile
  }
  calls(parentId?: string): AgentCall[] {
    const rows = parentId ? this.db.prepare('SELECT data FROM agent_calls WHERE parent_id = ? ORDER BY rowid').all(parentId)
      : this.db.prepare('SELECT data FROM agent_calls ORDER BY rowid').all()
    return rows.map((row) => AgentCall.parse(JSON.parse(String(row.data))))
  }
  call(id: string): AgentCall {
    const row = this.db.prepare('SELECT data FROM agent_calls WHERE id = ?').get(id)
    if (!row) throw new Rejection('agent-call-not-found', '委派记录不存在')
    return AgentCall.parse(JSON.parse(String(row.data)))
  }
  saveCall(call: AgentCall): AgentCall {
    const parsed = AgentCall.parse({ ...call, updatedAt: this.now() })
    this.db.prepare('INSERT INTO agent_calls(id, parent_id, data) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data').run(parsed.id, parsed.parentId, JSON.stringify(parsed))
    return parsed
  }
  patchCall(id: string, patch: Partial<AgentCall>): AgentCall { return this.saveCall({ ...this.call(id), ...patch }) }
  deleteCall(id: string): void { this.db.prepare('DELETE FROM agent_calls WHERE id = ?').run(id) }
}
