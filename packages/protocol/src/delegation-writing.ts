// The note Antumi puts before a message the user sends while a delegated member edits directories
// the conversation shares (feature delegation-chat), so its agent talks and reads but keeps its
// hands off them until the member is done. Clients show the user's part alone: the note is for the agent.
const PREFIX = '（委派的成员正在修改文件：'
const SUFFIX = '。这一轮只讨论、阅读和规划：不要修改这些目录里的文件，也不要运行会改动它们的命令；要改的等成员的结果交回后再做。）'

// `writers` says who edits where, such as 「Developer 在 /work/app」.
export function delegationWritingMessage(writers: readonly string[], text: string): string {
  return `${PREFIX}${writers.join('；')}${SUFFIX}\n\n${text}`
}

// What the user wrote after such a note; any other message whole.
export function withoutDelegationWritingNote(text: string): string {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith(PREFIX)) return text
  const end = trimmed.indexOf(SUFFIX, PREFIX.length)
  if (end < 0 || trimmed.slice(PREFIX.length, end).includes('\n')) return text
  return trimmed.slice(end + SUFFIX.length).trimStart()
}
