import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { MAX_CHAT_COMMANDS, MAX_PINNED_CHAT_COMMANDS, SavedChatCommand } from '@antumi/protocol'
import { Rejection } from './rejection'

type Fields = Pick<SavedChatCommand, 'name' | 'description' | 'prompt' | 'projectPath'>

const SELECT = `SELECT id, name, description, prompt, project_path AS projectPath, created_at AS createdAt, pinned_at AS pinnedAt
  FROM chat_commands ORDER BY created_at, rowid`

// Rows live in `chat_commands`, which TaskStore's migrations create.
export class ChatCommandStore {
  private readonly db: DatabaseSync

  constructor(
    file: string,
    private readonly emit: (commands: SavedChatCommand[]) => void,
    private readonly now: () => number = Date.now
  ) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL')
  }

  close(): void {
    this.db.close()
  }

  list(): SavedChatCommand[] {
    return this.db.prepare(SELECT).all().map((row) => SavedChatCommand.parse(row))
  }

  save(fields: Fields & { id?: string }): SavedChatCommand {
    const { id, name, description, prompt, projectPath } = fields
    if (this.taken(name, projectPath, id)) {
      throw new Rejection('chat_command_taken', projectPath ? `这个项目已经有 /${name} 了` : `已经有 /${name} 了`)
    }
    if (id) {
      const changed = this.db
        .prepare('UPDATE chat_commands SET name = ?, description = ?, prompt = ?, project_path = ? WHERE id = ?')
        .run(name, description, prompt, projectPath, id).changes
      if (changed === 0) throw new Rejection('chat_command_not_found', '这条命令已经被删除了')
      this.changed()
      return this.get(id)
    }
    if (this.count() >= MAX_CHAT_COMMANDS) throw new Rejection('chat_commands_full', `最多保存 ${MAX_CHAT_COMMANDS} 条命令`)
    const created = randomUUID()
    this.db
      .prepare('INSERT INTO chat_commands (id, name, description, prompt, project_path, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(created, name, description, prompt, projectPath, this.now())
    this.changed()
    return this.get(created)
  }

  // Pinning one already pinned keeps its place among the others. The limit counts every pinned
  // command, whichever conversations it shows in, so the user has one number to keep in mind.
  pin(id: string, pinned: boolean): SavedChatCommand {
    const command = this.get(id)
    if (pinned === (command.pinnedAt != null)) return command
    if (pinned && this.list().filter((each) => each.pinnedAt != null).length >= MAX_PINNED_CHAT_COMMANDS) {
      throw new Rejection('chat_command_pins_full', `最多固定 ${MAX_PINNED_CHAT_COMMANDS} 条命令，先取消一条`)
    }
    this.db.prepare('UPDATE chat_commands SET pinned_at = ? WHERE id = ?').run(pinned ? this.now() : null, id)
    this.changed()
    return this.get(id)
  }

  // Deleting one that is already gone is not an error: another window got there first.
  delete(id: string): void {
    if (this.db.prepare('DELETE FROM chat_commands WHERE id = ?').run(id).changes > 0) this.changed()
  }

  // Checked here rather than left to the unique index, to say which name clashed.
  private taken(name: string, projectPath: string | null, id: string | undefined): boolean {
    const lower = name.toLowerCase()
    return this.list().some((each) => each.id !== id && each.name.toLowerCase() === lower && each.projectPath === projectPath)
  }

  private get(id: string): SavedChatCommand {
    const command = this.list().find((each) => each.id === id)
    if (!command) throw new Rejection('chat_command_not_found', '这条命令已经被删除了')
    return command
  }

  private count(): number {
    return z.object({ count: z.number() }).parse(this.db.prepare('SELECT count(*) AS count FROM chat_commands').get()).count
  }

  private changed(): void {
    this.emit(this.list())
  }
}
