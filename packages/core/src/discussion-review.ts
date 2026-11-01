import { reviewRound, type Discussion, type DiscussionPost } from '@antumi/protocol'

// What a review does next once nothing is out, decided from what its posts say. Kept apart from the
// service so each case can be read and tested on its own.
export type ReviewNext =
  | { kind: 'ask'; round: number; memberIds: string[] }
  | { kind: 'finish'; version: number; verdict: 'pass' | 'change' }
  | { kind: 'pause'; notice: string }

type Facts = Pick<Discussion, 'round' | 'lastRound' | 'chairId' | 'members' | 'step'>
type Post = Pick<DiscussionPost, 'round' | 'memberId' | 'stage' | 'state' | 'verdict' | 'version'>

// Each member's latest post in a round: one asked again answers for itself by its newest.
function latest(posts: readonly Post[], round: number): Map<string, Post> {
  const found = new Map<string, Post>()
  for (const post of posts) if (post.round === round && post.memberId && post.stage !== 'final') found.set(post.memberId, post)
  return found
}

// The newest draft the author finished, and whether every reviewer passed that very version.
export function finalVerdict(discussion: Facts, posts: readonly Post[]): { version: number; verdict: 'pass' | 'change' } | null {
  const draft = posts.findLast((post) => (post.stage === 'draft' || post.stage === 'revise') && post.state === 'done' && post.memberId === discussion.chairId)
  if (!draft) return null
  const version = draft.version ?? reviewRound(draft.round).version
  const reviewers = discussion.members.filter((member) => member.id !== discussion.chairId)
  const answers = latest(posts, draft.round + 1)
  const passed = reviewers.length > 0 && reviewers.every((member) => {
    const post = answers.get(member.id)
    return post?.state === 'done' && post.verdict === 'pass'
  })
  return { version, verdict: passed ? 'pass' : 'change' }
}

// retry: the user asked to go on after a pause, so what failed is asked again rather than paused on.
// A review the user concluded (step 'summary') finishes with what it has.
export function nextReviewStep(discussion: Facts, posts: readonly Post[], retry = false): ReviewNext {
  const author = discussion.chairId
  const reviewers = discussion.members.filter((member) => member.id !== author)
  const name = (id: string) => discussion.members.find((member) => member.id === id)?.name ?? id
  const finish = (): ReviewNext => {
    const settled = finalVerdict(discussion, posts)
    return settled ? { kind: 'finish', ...settled } : { kind: 'pause', notice: '还没有写好的稿件，评审已暂停；继续时重试起草。' }
  }
  if (discussion.round === 0) return { kind: 'ask', round: 1, memberIds: [author] }
  const round = discussion.round
  const { stage, version } = reviewRound(round)
  const answers = latest(posts, round)
  if (discussion.step === 'summary') return finish()
  if (stage !== 'review') {
    const draft = answers.get(author)
    if (draft?.state !== 'done') {
      return retry ? { kind: 'ask', round, memberIds: [author] } : { kind: 'pause', notice: `作者没能写出第 ${version} 版，评审已暂停；继续时重试。` }
    }
    return round >= discussion.lastRound ? finish() : { kind: 'ask', round: round + 1, memberIds: reviewers.map((member) => member.id) }
  }
  const missing = reviewers.filter((member) => answers.get(member.id)?.state !== 'done')
  if (missing.length > 0) {
    if (retry) return { kind: 'ask', round, memberIds: missing.map((member) => member.id) }
    const notice = missing.length === reviewers.length
      ? `第 ${version} 版没有评审完成，评审已暂停；继续时重试。`
      : `${missing.map((member) => name(member.id)).join('、')} 没有完成第 ${version} 版的评审，评审已暂停；继续时只重试${missing.length > 1 ? '他们' : '这一位'}。`
    return { kind: 'pause', notice }
  }
  const passed = reviewers.every((member) => answers.get(member.id)?.verdict === 'pass')
  if (passed || round >= discussion.lastRound) return finish()
  return { kind: 'ask', round: round + 1, memberIds: [author] }
}

// The last round a review may reach with `revisions` revisions: the first draft and its review,
// then a revision and a review for each.
export function reviewLastRound(revisions: number): number {
  return 2 + 2 * revisions
}
