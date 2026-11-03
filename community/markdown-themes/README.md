# 提交 Markdown 社区主题

社区主题通过本仓库的 Pull Request 收录，审核合并后随 Antumi 版本发布。应用自动加载这里的主题包，不需要修改 TypeScript、注册主题列表或连接在线市场。目前目录尚无主题，欢迎提交原创或获得明确分发授权的样式。

## 目录

每款主题创建一个子目录，使用稳定的小写英文标识，允许数字与短横线，长度为 2–64 字符。主题更名时保留目录名。

```text
community/markdown-themes/
└── aurora/
    ├── theme.json
    ├── preview-light.png
    ├── preview-dark.png
    ├── README.md          # 可选
    └── LICENSE.md         # 可选，补充许可正文
```

包内仅允许以上文件。截图必须为 PNG，每张不超过 2 MiB；请展示主题在 Antumi 浅色、深色模式下的真实效果，不包含个人信息。`theme.json` 不超过 64 KiB，CSS 不超过 32 Ki 个字符。

## theme.json

```json
{
  "format": "antumi-markdown-theme",
  "version": 1,
  "themeVersion": "1.0.0",
  "name": "极光",
  "description": "青绿与紫色点缀，清晰的标题分节。",
  "author": "作者名称或 GitHub 用户名",
  "license": "MIT",
  "base": "default",
  "primary": { "light": "#006a80", "dark": "#68d6ed" },
  "secondary": { "light": "#7145a5", "dark": "#c4a0f5" },
  "css": "h2 { color: var(--md-primary-color); border-left: 3px solid var(--md-primary-color); padding: 8px 12px; }"
}
```

- `version` 是文件格式版本，固定为 `1`。
- `themeVersion` 是主题发布版本，使用 `主版本.次版本.修订版本`，首次可用 `1.0.0`。修改已经收录的主题清单时递增此值，CI 会与 PR 目标分支比较。
- `name`、`description`、`author`、`license` 和 `themeVersion` 必填。`license` 填写你授予主题的许可；需要时附 `LICENSE.md`。
- `base` 为 `default`、`newsprint`、`quiet`、`sunset`、`ocean` 或 `neon`。
- `primary`、`secondary` 和 `css` 可选。`source` 可选且必须为 HTTPS；省略时应用自动链接到本主题目录。
- 包内不填写本机 `id`、`communityId`、字体、字号、行高、段距或内容宽度。

可以先在「设置 → 外观 → Markdown → 我的主题」中制作并导出，再补全上述社区元数据。不要直接提交其他项目的整份主题 CSS。

## 样式规则

聊天回复、计划和 Markdown 文件预览统一使用用户的阅读设置。主题只调整配色、字重、边框、淡底、引用和标题装饰，字体、字号、行高、内容宽度和缩放声明会被忽略，段距由应用保护。背景和正文沿用界面配色，代码沿用代码字体。

CSS 使用当前内容的独立作用域；可用 `h1`、`h2`、`strong`、`blockquote`、`pre`、`th` 等选择器，以及 `--md-primary-color`、`--md-secondary` 和界面语义变量。禁止外部资源、`@import`、`@font-face`、定位、动画和脚本。深浅模式可使用 `@media (prefers-color-scheme: light/dark)`。

完整格式和样式能力见 [Markdown 主题与阅读设置](../../docs/MARKDOWN-THEMES.md)。

## 本地验证与提交

```sh
pnpm install --frozen-lockfile
pnpm check:markdown-themes
ANTUMI_HOME=~/.antumi-demo pnpm dev
```

在「社区主题」中检查截图、实时预览、安装和深浅效果，然后提交包含主题目录的 PR，说明主题风格与素材来源。GitHub 的 `Markdown themes` 检查会自动校验包结构、元数据、CSS、PNG 头及图片大小；最终视觉效果和分发许可由维护者审核。

作者更新通过新的 PR 发布，随下个 Antumi 版本提供。「更新并使用」由用户主动选择，会保留本机安装标识；再次使用相同版本不会覆盖本机修改。用户可通过「预览并定制」保存为独立的个人主题。
