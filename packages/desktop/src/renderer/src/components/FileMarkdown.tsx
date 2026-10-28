import { t } from '../i18n'
import Markdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize from 'rehype-sanitize'
import type { ResolvedFile } from '@antumi/protocol'
import { remarkPlugins } from '../markdown-syntax'
import { showChatFile } from '../file-actions'
import type { FileScope } from '../file-tabs'
import { isAbsolutePath, isImagePath, linkTarget, previewUrl, urlPath, type FileReference } from '../file-links'

// Relative links and images belong to this document, including on Windows.
export function markdownFileReference(href: string, path: string): FileReference | null {
  const target = linkTarget(href)
  if (target?.kind !== 'file') return null
  if (isAbsolutePath(target.path)) return target
  const relative = target.path.split(/[\\/]/).map(encodeURIComponent).join('/')
  const resolved = linkTarget(new URL(relative, `file://${urlPath(path)}`).href)
  return resolved?.kind === 'file' ? { path: resolved.path, line: target.line } : null
}

const plugins = [rehypeRaw, rehypeSanitize, rehypeHighlight]

export function FileMarkdown({ text, file, scope }: { text: string; file: ResolvedFile; scope: FileScope }) {
  return <div className="chat-markdown file-markdown">
    <Markdown remarkPlugins={remarkPlugins} rehypePlugins={plugins} components={{
      a: ({ href, children, title }) => {
        const reference = href ? markdownFileReference(href, file.path) : null
        if (reference) return <button type="button" className="chat-link" title={reference.path} onClick={() => void showChatFile(scope, reference)}>{children}</button>
        return <a href={href} title={title} target={href?.startsWith('#') ? undefined : '_blank'} rel="noreferrer">{children}</a>
      },
      img: ({ src, alt, width, height }) => {
        const reference = typeof src === 'string' ? markdownFileReference(src, file.path) : null
        return reference && isImagePath(reference.path)
          ? <img src={previewUrl(reference.path)} alt={alt ?? ''} width={width} height={height} loading="lazy" />
          : <a href={typeof src === 'string' ? src : undefined} target="_blank" rel="noreferrer">{alt || t('FileMarkdown.image')}</a>
      }
    }}>{text}</Markdown>
  </div>
}
