# Markdown 主题与阅读设置

聊天回复（含流式输出）、计划确认卡片、计划检查器、任务详情里的已保存计划和 Markdown 文件预览共用一套阅读规则与主题。「设置 → 外观 → 阅读与聊天」统一调整字体、中文字体、字号、正文行高、段距和最大内容宽度。窄面板自动收窄；标题使用正文字号的固定比例，代码沿用代码字体。用户消息仍显示原文，源码编辑器保持原有行为。

这些阅读设置沿用本机偏好的 `chatFont`、`chatFontFamily`、`chatCjkFontFamily`、`chatFontSize` 和 `chatWidth`，另增加 `chatLineHeight`（默认 1.7）与 `chatParagraphSpacing`（默认 0.4em）。旧设置无需迁移，缺失或损坏的新字段分别回退默认值。修改后聊天、计划和文件同步更新，其他窗口通过既有偏好机制同步。

## 内置主题

「设置 → 外观 → Markdown」以紧凑卡片网格展示六款 Antumi 自有样式，选中后显示风格说明，窄窗口自动减少列数。文件预览工具栏也可切换，选择保存在本机 `markdownTheme` 偏好里。

| 主题 | 视觉样式 |
| --- | --- |
| 默认 | 沿用界面点缀色与中性分隔 |
| 报刊 | 鲜明字重、双线分节与方角表格 |
| 静阅 | 轻盈标题、柔和引用 |
| 落日 | 朱红标题底、莓紫与金色点缀 |
| 海盐 | 青绿标题、琥珀点缀与上下分隔 |
| 霓虹 | 亮粉标题、紫罗兰与电光青分隔 |

主题只改变颜色与装饰，不携带生效的字体、字号或内容宽度。背景、正文和次级文字沿用 Antumi 当前配色，点缀色跟随浅色或深色模式切换。主题中的局部淡底混合界面背景生成，标题、强调、引用、列表、表格和代码语法色可使用主副色。

主题颜色在 `styles.css` 的根令牌定义，变量作用域以 `.markdown-sheet[data-md-theme]` 限定。新增主题同时更新 `markdown-themes.ts` 与名称、说明。未知、移除或过期的主题名称回退到默认，保留其他偏好。

## 自定义与社区主题

「我的主题」支持基于当前样式新建、编辑、导入、导出和移除本机方案。编辑内容包括基础样式、深浅点缀色、说明与 CSS。字体、字号、行高和段距不再放在主题编辑器里，统一由阅读设置负责。

「社区主题」通过本项目 PR 收录，主题数据包放在 [`community/markdown-themes/<slug>/`](../community/markdown-themes/README.md)，由 `theme.json` 与深浅两张 PNG 组成；贡献说明包含完整格式和检查命令。应用自动打包审核合并的主题，随版本发布，当前目录仍为空，不预置第三方主题。用户自行选择的 `.css` 或 Antumi 主题 JSON 仍可导入本机库，保留作者、许可和来源。

社区包必须有作者、说明、许可与 `themeVersion`（三段数字版本），目录标识保持稳定；文件格式 `version` 仍为 `1`。`pnpm check:markdown-themes` 检查包结构、清单、CSS 与截图，`pnpm test` 也包含这些检查；GitHub PR 工作流还与目标分支比较清单，要求修改已收录主题时提升主题版本。截图作为本地构建资源打包，不在运行时请求远程图片。

每个安装项记录社区目录标识与主题版本。再次使用相同版本不会覆盖个人修改或重复安装；新版本提供「更新并使用」，确认后保留原本机 id 并替换该安装项。旧版应用不会把已安装的新主题降级。「预览并定制」保存为独立个人主题，与后续社区更新分离。

草稿只影响设置预览，保存后才应用到聊天、计划和文件；取消保留原方案。恢复 Markdown 本组默认只恢复主题选择，不删除主题库、不重置阅读设置。恢复「阅读与聊天」只重置阅读参数及该组的聊天偏好，不改变主题。移除正在使用的主题会回到默认。

导入文件上限 64 KiB，CSS 上限 32 Ki 个字符，主题库最多 24 款。导入先进入草稿，保存时分配本机 id；重复导入作为独立方案，不覆盖已有修改。JSON 导出不携带本机 id。损坏的存储项逐个跳过，缺失或移除的主题回退到默认。

## CSS 作用域与优先级

`MarkdownSurface` 为每条消息、计划、文件和草稿提供共同的阅读令牌及独立 CSS 作用域。`ChatMarkdown` 与 `FileMarkdown` 仍分别处理链接、图片、代码操作和 HTML 安全策略。主题切换和流式增量不会重建内容的作用域。

CSS 使用 `css-tree` 解析，安全校验后编译到当前渲染实例的原生 `@scope`。导入规则中的以下声明直接忽略，其余允许的视觉声明仍生效：

- `font` 简写、`font-family`、`font-size`、`font-size-adjust`、`font-stretch`、`line-height`。
- `width`、`min-width`、`max-width`，以及相应的逻辑宽度属性。
- `transform`、`transform-origin`、对应的 WebKit 属性和 `zoom`。

这项处理对所有选择器、转义属性和深浅模式规则一致，避免段落、列表、表格或通配选择器绕过统一阅读设置。字体、字号和宽度不从导入主题反向写入用户偏好。旧版主题 JSON 中的 `fontSize`、`lineHeight` 和 `paragraphSpacing` 仍可导入和再次导出，但仅作为兼容元数据，不参与渲染。

受保护的样式层另外固定内容容器、正文段距、代码字体及主题根背景、正文颜色。字体、字号、行高、宽度等来自 `--reading-*` 内部令牌，主题不能覆盖这些变量。文件预览的页边距放在外层滚动容器内，内容本身与聊天、计划使用相同的宽度规则。

外部资源、URL、`@import`、`@font-face`、定位、动画、非主题变量覆写及未知规则仍会报错，不执行部分不安全结果。安全的字体或宽度声明仅被忽略，不会导致整份视觉样式失效。

`@media (prefers-color-scheme: light/dark)` 编译为基于 `--md-color-scheme` 的容器样式查询，跟随 Antumi 的实际模式选择。设置里的预览也提供独立模式；主题不能覆盖该内部变量。常见根选择器（如 `html`、`body`、`:root`、`#output`、`#write`）映射为当前内容，`.codespan` 映射到行内代码，代码块保留 `.code__pre`。第三方专有组件和 DOM 结构不保证兼容。

可使用 `--md-primary-color`、`--md-link-color`、`--md-secondary`、`--md-blockquote-background`，以及只读继承的界面 `--surface`、`--text` 和 `--text-muted`。

```css
h2 {
  color: var(--md-primary-color);
  border-left: 3px solid var(--md-primary-color);
  padding: 8px 12px;
  background: color-mix(in srgb, var(--md-primary-color) 8%, transparent);
}
```

## 主题文件格式

```json
{
  "format": "antumi-markdown-theme",
  "version": 1,
  "name": "我的主题",
  "author": "作者",
  "license": "MIT",
  "source": "https://example.com/theme",
  "base": "neon",
  "primary": { "light": "#663399", "dark": "#bb99ee" },
  "css": "h2 { border-bottom: 2px solid var(--md-primary-color); }"
}
```

`base` 取六款内置样式之一；`primary`、`secondary` 是可选的深浅点缀色，`source` 仅接受 HTTPS。主题库保存在 desktop 本机偏好 `markdownThemePacks`，不引入 core、daemon 或 RPC 状态。

## 实现参考

研究过 Doocs MD 的[基础样式与主题合并](https://github.com/doocs/md/blob/516efead5c5a8a2a49991629533b9a8877924a43/packages/core/src/theme/themeApplicator.ts)、[社区目录](https://github.com/doocs/md/blob/516efead5c5a8a2a49991629533b9a8877924a43/apps/web/src/stores/marketplace.ts)及[主题导出](https://github.com/doocs/md/blob/516efead5c5a8a2a49991629533b9a8877924a43/packages/core/src/theme/themeExporter.ts)的组织方式。Antumi 使用自己的视觉样式、共享阅读偏好、每实例 AST 校验与原生 CSS 作用域，不随应用提供该项目的主题 CSS。
