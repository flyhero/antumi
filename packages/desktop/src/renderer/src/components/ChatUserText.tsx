import { Fragment } from 'react'
import { conversationReferenceParts } from '@antumi/protocol'
import { webLinkClasses } from '../markdown-links'
import { textLinks } from '../text-links'
import { ConversationReferenceLink } from './ConversationReferenceLink'

// Keep user prose literal, with web addresses and explicit conversation references clickable.
export function ChatUserText({ text }: { text: string }) {
  return conversationReferenceParts(text).map((reference, index) => {
    if (reference.kind === 'conversation') return <ConversationReferenceLink key={index} id={reference.id}>{reference.title}</ConversationReferenceLink>
    const parts = textLinks(reference.text)
    return <Fragment key={index}>{parts.map((part, partIndex) => {
      if (part.kind === 'text') return <Fragment key={partIndex}>{part.text}</Fragment>
      const before = parts[partIndex - 1]
      const after = parts[partIndex + 1]
      const classes = webLinkClasses(before?.kind === 'text' ? before.text : null, after?.kind === 'text' ? after.text : null)
      return <a key={partIndex} href={part.href} title={part.href} className={classes.join(' ')} target="_blank" rel="noreferrer">{part.href}</a>
    })}</Fragment>
  })
}
