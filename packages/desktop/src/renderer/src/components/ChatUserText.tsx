import { Fragment } from 'react'
import { conversationReferenceParts, validChatReferences, type ChatReference } from '@antumi/protocol'
import { textLinks } from '../text-links'
import { ConversationReferenceLink } from './ConversationReferenceLink'
import { ChatReferenceLink, LinkMark } from './ChatReference'

// Keep user prose literal, with web addresses and references drawn as chips that open them.
export function ChatUserText({ text, references }: { text: string; references?: readonly ChatReference[] }) {
  const parts = []
  let at = 0
  for (const [index, reference] of validChatReferences(text, references).entries()) {
    parts.push(<LiteralText key={`text:${index}`} text={text.slice(at, reference.start)} />)
    parts.push(<ChatReferenceLink key={`reference:${index}`} target={reference.target} />)
    at = reference.end
  }
  parts.push(<LiteralText key="tail" text={text.slice(at)} />)
  return parts
}

function LiteralText({ text }: { text: string }) {
  return conversationReferenceParts(text).map((reference, index) => {
    if (reference.kind === 'conversation') return <ConversationReferenceLink key={index} id={reference.id}>{reference.title}</ConversationReferenceLink>
    return <Fragment key={index}>{textLinks(reference.text).map((part, partIndex) =>
      part.kind === 'text' ? <Fragment key={partIndex}>{part.text}</Fragment> : <LinkMark key={partIndex} href={part.href} />)}</Fragment>
  })
}
