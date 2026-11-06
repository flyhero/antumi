import { untrustedSource, type SnapshotImagePath, type SourceSnapshot, type TaskSource } from '@antumi/protocol'

// What a conversation opened from an inbox issue reads first: the issue, fenced off as the
// tracker's words, and what to do with it. It starts read-only, so it stops at a finding and a
// proposed fix; the user decides whether to fix it there.
// pending: images still being downloaded, sent as a later message.
export function investigationBrief(source: TaskSource, snapshot: SourceSnapshot, images: readonly SnapshotImagePath[], pending = 0): string {
  return [
    '# 待排查的问题',
    untrustedSource(source, snapshot, images),
    ...(pending > 0 ? [`附件里还有 ${pending} 张图片在下载，下载好后会作为下一条消息发给你。先根据文字排查；只有看图才能确定的地方，说明需要看图，不要猜。`] : []),
    '## 请这样排查',
    [
      '1. 先弄清问题：它说的现象是什么，能否从代码或现有记录里确认，缺什么信息就问我。',
      '2. 定位根因：复现路径、相关代码（给出文件和行号）、为什么会这样，以及影响范围。',
      '3. 给出结论和修复方案：改哪里、怎么改、有什么风险，以及怎么验证。',
      '4. 到这里停下，不要修改代码，等我确认后再修。'
    ].join('\n')
  ].join('\n\n')
}
