import { localized, t } from './i18n'
import { DEFAULT_DISCUSSION_REVISIONS, DEFAULT_DISCUSSION_ROUNDS, type DiscussionFormat } from '@antumi/protocol'

// How a new group chat goes, as the page offers it: auto, which takes the format what was written
// asks for, or one the user picked. Review and research need feature discussion-formats.
export const FORMAT_CHOICES = ['auto', 'roundtable', 'review', 'research'] as const
export type FormatChoice = (typeof FORMAT_CHOICES)[number]

// Why auto took a format: the topic asks for a document, for something to be found out, or for
// views to be weighed; none while nothing is written.
export type FormatReason = 'draft' | 'research' | 'discuss' | null

const DRAFT = /起草|草拟|拟一|拟定|撰写|写一[份篇版个]|写个|写份|文案|文档|稿|提案|PRD|RFC|\bdraft\b|\bwrite (?:a|an|the|up)\b|\bproposal\b|\bspec\b/i
const RESEARCH = /为什么|为何|原因|排查|调研|查一下|查清|查查|摸底|盘点|哪些地方|瓶颈|根因|\bwhy\b|\binvestigate\b|\blook into\b|\broot cause\b|\baudit\b/i

// What a topic asks for, by its words: whichever kind of word comes first wins, so 「为什么要写文档」
// is research. Plain rules, cheap and instant; a wrong guess is one click to change.
export function recommendFormat(topic: string, available: readonly DiscussionFormat[]): { format: DiscussionFormat; reason: FormatReason } {
  if (!topic.trim()) return { format: 'roundtable', reason: null }
  const draft = available.includes('review') ? topic.search(DRAFT) : -1
  const research = available.includes('research') ? topic.search(RESEARCH) : -1
  if (draft >= 0 && (research < 0 || draft <= research)) return { format: 'review', reason: 'draft' }
  if (research >= 0) return { format: 'research', reason: 'research' }
  return { format: 'roundtable', reason: 'discuss' }
}

// The format a start runs: the one picked, or auto's, among those core runs.
export function chosenFormat(choice: FormatChoice, topic: string, available: readonly DiscussionFormat[]): DiscussionFormat {
  if (choice === 'auto') return recommendFormat(topic, available).format
  return available.includes(choice) ? choice : 'roundtable'
}

// Rounds for a round table, revisions for a review; research has none to pick.
export function defaultRounds(format: DiscussionFormat): number {
  return format === 'review' ? DEFAULT_DISCUSSION_REVISIONS : DEFAULT_DISCUSSION_ROUNDS
}

// How many turns a discussion takes, at least and at most: a round table may end before its last
// round; a review that passes its first draft takes one turn from each member, and each revision
// one more from each; research takes the chair's split and report and one turn from each other
// member. A turn is no measure of quota.
export function discussionTurns(format: DiscussionFormat, count: number, rounds: number): { least: number; most: number } {
  if (format === 'research') return { least: count + 1, most: count + 1 }
  if (format === 'review') return { least: count, most: count * (rounds + 1) }
  return { least: Math.min(count * rounds + 1, count * 2 + 1), most: count * rounds + 1 }
}

export const DISCUSSION_FORMATS: Readonly<Record<DiscussionFormat, { label: string; description: string; flow: string }>> = localized(() => ({
  roundtable: { label: t('discussionFormats.roundtable'), description: t('discussionFormats.roundtableDescription'), flow: t('discussionFormats.roundtableFlow') },
  review: { label: t('discussionFormats.review'), description: t('discussionFormats.reviewDescription'), flow: t('discussionFormats.reviewFlow') },
  research: { label: t('discussionFormats.research'), description: t('discussionFormats.researchDescription'), flow: t('discussionFormats.researchFlow') }
}))

export const FORMAT_REASON: Readonly<Record<Exclude<FormatReason, null>, string>> = localized(() => ({
  draft: t('discussionFormats.reasonDraft'),
  research: t('discussionFormats.reasonResearch'),
  discuss: t('discussionFormats.reasonDiscuss')
}))
