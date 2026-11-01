import { localized, t } from './i18n'
import { DEFAULT_DISCUSSION_REQUIREMENTS, DEFAULT_DISCUSSION_REVISIONS, DEFAULT_DISCUSSION_ROUNDS, type DiscussionFormat } from '@antumi/protocol'

// How a group chat goes, as the new page offers it. Debate and relay run as the round table does,
// with roles, chair and requirements filled in for them: they promise nothing the rounds do not do.
// A review and research are formats of core's own (feature discussion-formats).
export const DISCUSSION_FORMAT_IDS = ['roundtable', 'debate', 'relay', 'review', 'research'] as const
export type DiscussionFormatId = (typeof DISCUSSION_FORMAT_IDS)[number]

// Sent to the agents as they are, like the requirement presets, so in Chinese whatever the interface.
const PRO = '正方：支持题目中的主张，全程坚持这一立场，回应反方的质疑。'
const CON = '反方：反对题目中的主张，全程坚持这一立场，指出正方的漏洞和风险。'
const JUDGE = '裁判：不站队，指出双方论证的强弱，总结时给出裁决和理由。'
const DEBATE_REQUIREMENTS = [
  '- 坚持被分配的立场，不因对方的论点改变立场。',
  '- 每次回应对方最新的论点并给出证据；引用项目代码时注明文件和行号。',
  '- 每次发言尽量控制在 600 字以内。'
].join('\n')
const RELAY_REQUIREMENTS = [
  '- 从第 2 轮起，在别人已有内容的基础上补充，不重复已经说过的点。',
  '- 直接写出补充的内容和别人遗漏的地方，少做评价。',
  '- 每次发言尽量控制在 600 字以内。'
].join('\n')

export type FormatSetup = { roles: string[]; chair: number; requirements: string; rounds: number }

// What core runs a format as.
export function coreFormat(format: DiscussionFormatId): DiscussionFormat {
  return format === 'review' || format === 'research' ? format : 'roundtable'
}

// What picking a format sets for `count` members. A debate's last member judges once there are
// three or more; with two, each side argues and the first sums up.
export function formatSetup(format: DiscussionFormatId, count: number): FormatSetup {
  switch (format) {
    case 'roundtable':
      return { roles: Array.from({ length: count }, () => ''), chair: 0, requirements: DEFAULT_DISCUSSION_REQUIREMENTS, rounds: DEFAULT_DISCUSSION_ROUNDS }
    case 'research':
      return { roles: Array.from({ length: count }, () => ''), chair: 0, requirements: DEFAULT_DISCUSSION_REQUIREMENTS, rounds: DEFAULT_DISCUSSION_ROUNDS }
    case 'review':
      return { roles: Array.from({ length: count }, () => ''), chair: 0, requirements: DEFAULT_DISCUSSION_REQUIREMENTS, rounds: DEFAULT_DISCUSSION_REVISIONS }
    case 'debate': {
      const judged = count >= 3
      const sides = judged ? count - 1 : count
      const roles = Array.from({ length: sides }, (_, index) => (index % 2 === 0 ? PRO : CON))
      return { roles: judged ? [...roles, JUDGE] : roles, chair: judged ? count - 1 : 0, requirements: DEBATE_REQUIREMENTS, rounds: DEFAULT_DISCUSSION_ROUNDS }
    }
    case 'relay':
      return { roles: Array.from({ length: count }, () => ''), chair: 0, requirements: RELAY_REQUIREMENTS, rounds: DEFAULT_DISCUSSION_ROUNDS }
  }
}

// How many turns a discussion takes, at least and at most: a round table may end before its last
// round; a review that passes its first draft takes one turn from each member, and each revision
// one more from each; research takes the chair's split and report and one turn from each other
// member. A turn is no measure of quota.
export function discussionTurns(format: DiscussionFormatId, count: number, rounds: number): { least: number; most: number } {
  if (format === 'research') return { least: count + 1, most: count + 1 }
  if (format === 'review') return { least: count, most: count * (rounds + 1) }
  return { least: Math.min(count * rounds + 1, count * 2 + 1), most: count * rounds + 1 }
}

export const DISCUSSION_FORMATS: readonly { id: DiscussionFormatId; label: string; description: string; flow: string }[] = localized(() => ([
  { id: 'roundtable', label: t('discussionFormats.roundtable'), description: t('discussionFormats.roundtableDescription'), flow: t('discussionFormats.roundtableFlow') },
  { id: 'debate', label: t('discussionFormats.debate'), description: t('discussionFormats.debateDescription'), flow: t('discussionFormats.debateFlow') },
  { id: 'relay', label: t('discussionFormats.relay'), description: t('discussionFormats.relayDescription'), flow: t('discussionFormats.relayFlow') },
  { id: 'review', label: t('discussionFormats.review'), description: t('discussionFormats.reviewDescription'), flow: t('discussionFormats.reviewFlow') },
  { id: 'research', label: t('discussionFormats.research'), description: t('discussionFormats.researchDescription'), flow: t('discussionFormats.researchFlow') }
]))
