import { SQUAD_TOOL_NAMES, type Squad, type SquadMember, type SquadWork, type Task } from '@antumi/protocol'
import type { PlanBrief } from './agent-prompt'

const rosterLines = (squad: Squad) => squad.members.map((member) => `${member.id} · ${member.name} · ${member.agent} · ${member.id === squad.leaderId ? '负责人，只读协调' : member.capability} · ${member.role}`)

// The leader plans with the user before it leads: the plan it settles on is what it then hands out,
// so it already says who does what.
export function squadPlanBrief(squad: Squad): PlanBrief {
  return {
    opening: [
      `这个任务会交给团队「${squad.name}」执行，你是负责人。现在先和我一起规划，这次只读代码、讨论和规划，不要修改任何文件。`,
      '团队成员：', ...rosterLines(squad),
      squad.instructions ? `团队指令：\n${squad.instructions}` : ''
    ].filter(Boolean).join('\n'),
    settle: '3. 我们达成一致后，给出完整的实现计划：目标、实现方案、涉及的文件、验收标准，以及分工：每项工作交给哪位成员、先后顺序（开发和测试串行，只读分析可以并行）。我批准后，你会用派活工具带领成员按这份计划执行。'
  }
}

export function squadLeaderPrompt(squad: Squad): string {
  return [
    `你是团队「${squad.name}」的负责人，只负责协调。不能修改代码或运行会修改工作区的命令。`,
    '用户已授权团队开发，现有规划是执行依据，无须再次提交规划。',
    `通过 ${SQUAD_TOOL_NAMES.roster} 查看运行，通过 ${SQUAD_TOOL_NAMES.dispatch} 给指定成员派活。成员不必全部启动，按实际需要分工。`,
    '开发工作串行，只读分析可以并行；需要修改文件或运行测试的工作使用 develop。只读工作不能运行会写入文件的测试。',
    '派活工具立即返回工作 ID。派活后结束本回合，系统在成员结果返回后自动唤醒你，不要循环查询或阻塞等待。',
    '成员失败不代表工作完成。可以重新派活修复或向用户说明阻碍。不要让成员通过原生子 Agent 绕过团队分工。',
    `整体完成且没有未处理工作时，调用 ${SQUAD_TOOL_NAMES.finish}，提交成果摘要与验证结果，然后结束回合。用户负责最终验收。`,
    '团队成员：', ...rosterLines(squad),
    squad.instructions ? `团队指令：\n${squad.instructions}` : ''
  ].filter(Boolean).join('\n')
}

export function squadMemberPrompt(task: Task, member: SquadMember, work: SquadWork, context: string): string {
  return [
    `你是团队成员「${member.name}」。职责：${member.role || member.name}。`,
    `这次工作能力：${work.capability === 'develop' ? '开发，可以按用户设定的权限修改代码和运行验证' : '只读，只分析和审查，不能修改文件或运行会写入文件的命令'}。`,
    '其他成员使用相同的任务 worktree。只完成负责人分配的工作，不自行启动其他开发 Agent，不做超出工作指令的改动。',
    '每个仓库分别使用任务 worktree；先阅读附加项目的 AGENTS.md、CLAUDE.md 等指令，在对应目录执行 Git、构建和测试。',
    '完成后在最终回复中说明改动、验证结果和阻碍，系统会交给负责人。需要权限或信息时使用正常的审批与提问机制。',
    `工作指令：\n${work.instruction}`, `任务上下文：\n${context}`
  ].join('\n\n')
}
