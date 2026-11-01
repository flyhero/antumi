import { researchRound, type Discussion, type DiscussionMember, type DiscussionPost } from '@antumi/protocol'

// What research does next once nothing is out, decided from what its posts say.
export type ResearchNext =
  | { kind: 'ask'; round: number; memberIds: string[] }
  | { kind: 'pause'; notice: string }
  | { kind: 'done' }

type Facts = Pick<Discussion, 'round' | 'chairId' | 'members' | 'step'>
type Post = Pick<DiscussionPost, 'round' | 'memberId' | 'stage' | 'state' | 'text'>

const LINE = /^\s*[-*]?\s*(?:\*\*)?([^:：*]+?)(?:\*\*)?\s*[:：]\s*(.+)$/

// The parts the chair gave out, by member: lines under its 「分工」 heading as 「- 名字：要查的事」.
// A name matches a member's, ignoring case; a part for no one, or for the chair, is left out.
export function researchAssignments(text: string, members: readonly Pick<DiscussionMember, 'id' | 'name'>[], chairId: string): Map<string, string> {
  const lines = text.split(/\r?\n/)
  const start = lines.findIndex((line) => /^\s*#*\s*\**\s*分工\s*[:：]?\s*\**\s*$/.test(line))
  const found = new Map<string, string>()
  for (const line of start < 0 ? [] : lines.slice(start + 1)) {
    if (/^\s*#/.test(line) && found.size > 0) break
    const match = LINE.exec(line)
    if (!match) continue
    const member = members.find((each) => each.id !== chairId && each.name.toLowerCase() === match[1]!.trim().toLowerCase())
    if (member && !found.has(member.id)) found.set(member.id, match[2]!.trim())
  }
  return found
}

function latest(posts: readonly Post[], round: number): Map<string, Post> {
  const found = new Map<string, Post>()
  for (const post of posts) if (post.round === round && post.memberId) found.set(post.memberId, post)
  return found
}

// retry: the user asked to go on after a pause, so what failed is asked again. A concluded research
// (step 'summary') goes to the report with the findings it has.
export function nextResearchStep(discussion: Facts, posts: readonly Post[], retry = false): ResearchNext {
  const chair = discussion.chairId
  const researchers = discussion.members.filter((member) => member.id !== chair)
  const name = (id: string) => discussion.members.find((member) => member.id === id)?.name ?? id
  if (discussion.round === 0) return { kind: 'ask', round: 1, memberIds: [chair] }
  const round = discussion.round
  const stage = researchRound(round)
  const answers = latest(posts, round)
  if (stage === 'split') {
    const split = answers.get(chair)
    if (split?.state !== 'done') return retry ? { kind: 'ask', round, memberIds: [chair] } : { kind: 'pause', notice: '主持人没能拆好题，调研已暂停；继续时重试。' }
    const parts = researchAssignments(split.text, discussion.members, chair)
    const missing = researchers.filter((member) => !parts.has(member.id))
    if (missing.length > 0) {
      return retry ? { kind: 'ask', round, memberIds: [chair] } : { kind: 'pause', notice: `拆题没有给 ${missing.map((member) => member.name).join('、')} 分配要查的事，调研已暂停；继续时请主持人重新拆题。` }
    }
    return { kind: 'ask', round: 2, memberIds: researchers.map((member) => member.id) }
  }
  if (stage === 'research') {
    const missing = researchers.filter((member) => answers.get(member.id)?.state !== 'done')
    const concluded = discussion.step === 'summary'
    if (missing.length > 0 && !(concluded && missing.length < researchers.length)) {
      if (retry) return { kind: 'ask', round, memberIds: missing.map((member) => member.id) }
      return { kind: 'pause', notice: `${missing.map((member) => name(member.id)).join('、')} 没有查完，调研已暂停；继续时只重试没查完的。` }
    }
    return { kind: 'ask', round: 3, memberIds: [chair] }
  }
  const report = answers.get(chair)
  if (report?.state === 'done') return { kind: 'done' }
  return retry ? { kind: 'ask', round, memberIds: [chair] } : { kind: 'pause', notice: '主持人没能写出报告，调研已暂停；继续时重试。' }
}
