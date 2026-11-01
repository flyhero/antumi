import { localized, t } from './i18n'
import { DEFAULT_DISCUSSION_REQUIREMENTS } from '@antumi/protocol'

// Sent to the agents as they are, so in Chinese whatever the interface.
const PRO = '正方：支持题目中的主张，全程坚持这一立场，回应反方的质疑。'
const CON = '反方：反对题目中的主张，全程坚持这一立场，指出正方的漏洞和风险。'
const JUDGE = '裁判：不站队，指出双方论证的强弱，总结时给出裁决和理由。'

// A debate's stances for `count` members: sides by turns, and with three or more the last judges
// and chairs; with two, each side argues and the first sums up.
export function debateStances(count: number): { roles: string[]; chair: number } {
  const judged = count >= 3
  const sides = Array.from({ length: judged ? count - 1 : count }, (_, index) => (index % 2 === 0 ? PRO : CON))
  return { roles: judged ? [...sides, JUDGE] : sides, chair: judged ? count - 1 : 0 }
}

// The styles a round table can take. Debate and relay are round tables too, with stances or a way
// of answering asked for: they promise nothing the rounds do not do. `stances`: the preset also
// sets the members' stances and the chair.
export const DISCUSSION_REQUIREMENT_PRESETS: readonly { id: string; label: string; description: string; text: string; roundtable?: true; stances?: true }[] = localized(() => ([
  { id: 'concise', label: t('discussionRequirements.conciseDiscussion'), description: t('discussionRequirements.beSpecificExplainReasoningAndAimForUnder'), text: DEFAULT_DISCUSSION_REQUIREMENTS },
  { id: 'compare', label: t('discussionRequirements.compareApproaches'), description: t('discussionRequirements.compareBenefitsCostsRisksAndApplicability'), text: [
    '- 列出主要可选方案，比较各自的收益、成本、风险和适用条件。',
    '- 区分已知事实与假设；不确定的地方明确说明。',
    '- 最后给出推荐方案、理由，以及需要进一步验证的问题。'
  ].join('\n') },
  { id: 'deep', label: t('discussionRequirements.inDepthAnalysis'), description: t('discussionRequirements.developArgumentsFullyWithEvidenceCounterexamplesAndUncertainty'), text: [
    '- 根据问题需要充分展开，不限制篇幅。',
    '- 给出论据与证据；引用项目代码时注明文件和行号。',
    '- 主动检查反例、边界条件与替代解释，明确不确定性。',
    '- 总结关键结论、分歧和仍需验证的问题。'
  ].join('\n') },
  { id: 'debate', label: t('discussionRequirements.debate'), description: t('discussionRequirements.debateDescription'), roundtable: true, stances: true, text: [
    '- 坚持被分配的立场，不因对方的论点改变立场。',
    '- 每次回应对方最新的论点并给出证据；引用项目代码时注明文件和行号。',
    '- 每次发言尽量控制在 600 字以内。'
  ].join('\n') },
  { id: 'relay', label: t('discussionRequirements.relay'), description: t('discussionRequirements.relayDescription'), roundtable: true, text: [
    '- 从第 2 轮起，在别人已有内容的基础上补充，不重复已经说过的点。',
    '- 直接写出补充的内容和别人遗漏的地方，少做评价。',
    '- 每次发言尽量控制在 600 字以内。'
  ].join('\n') }
]))
