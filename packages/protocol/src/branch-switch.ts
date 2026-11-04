// The note Antumi puts before the user's next message once they switch a project's branch, so the
// agent rereads what changed. Clients show the user's part alone: the note is for the agent.
const PREFIX = '（我切换了分支：'
const SUFFIX = '。文件已经变了，需要时请重新读。）'

// `switched` says where each project now is, such as 「app 现在在分支 main」.
export function branchSwitchMessage(switched: readonly string[], text: string): string {
  return `${PREFIX}${switched.join('；')}${SUFFIX}\n\n${text}`
}

// What the user wrote after a branch switch note; any other message whole.
export function withoutBranchSwitchNote(text: string): string {
  const trimmed = text.trimStart()
  if (!trimmed.startsWith(PREFIX)) return text
  const end = trimmed.indexOf(SUFFIX, PREFIX.length)
  if (end < 0 || trimmed.slice(PREFIX.length, end).includes('\n')) return text
  return trimmed.slice(end + SUFFIX.length).trimStart()
}
